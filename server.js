require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'seusegredomuitoseguro123';

// ==================================================================
// 1. CONEXÃO COM O BANCO DE DADOS
// ==================================================================
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE, // 'kadilac_saas'
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// ==================================================================
// 2. CONFIGURAÇÕES GERAIS (Middlewares)
// ==================================================================

// Aumenta o limite para aceitar fotos grandes (até 50MB)
// Importante para envio de imagens em Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuração do CORS (Permite que o Frontend acesse o Backend)
app.use(cors({
    origin: '*', // Em produção, troque '*' pelo domínio do Vercel (ex: https://kadilac.vercel.app)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================================================================
// 3. MIDDLEWARE DE AUTENTICAÇÃO (COM BLOQUEIO DE LOJA)
// ==================================================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });

    // --- LÓGICA DE BLOQUEIO (SAAS) ---
    // Se o usuário tem uma loja vinculada (não é Super Admin), verifica o status dela
    if (user.store_id) {
        try {
            const storeRes = await pool.query('SELECT status FROM stores WHERE id = $1', [user.store_id]);
            
            // Se a loja não existir ou estiver bloqueada
            if (storeRes.rows.length === 0 || storeRes.rows[0].status === 'blocked') {
                return res.status(402).json({ 
                    error: 'ACESSO SUSPENSO. Sua loja está bloqueada. Contate o suporte.' 
                });
            }
        } catch (dbError) {
            console.error("Erro ao verificar status da loja:", dbError);
            return res.status(500).json({ error: 'Erro de verificação de conta.' });
        }
    }

    req.user = user; // Salva os dados do usuário
    next();
  });
};

// ==================================================================
// 4. ROTAS PÚBLICAS
// ==================================================================

// Rota de Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Usuário não encontrado' });

    const user = result.rows[0];
    
    // Lógica Híbrida: Tenta Bcrypt primeiro, se falhar, tenta senha simples
    let validPassword = false;
    try {
        validPassword = await bcrypt.compare(password, user.password_hash);
    } catch (e) { /* Ignora erro de hash inválido */ }

    // Fallback para senha em texto plano (importante para o admin manual)
    if (!validPassword && password === user.password_hash) {
        validPassword = true;
    }

    if (!validPassword) return res.status(400).json({ error: 'Senha incorreta' });

    // --- CORREÇÃO AQUI: INCLUINDO 'role' NO TOKEN ---
    const token = jwt.sign(
        { 
            id: user.id, 
            store_id: user.store_id, 
            username: user.username, 
            role: user.role // <--- ADICIONADO O CARGO AQUI
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
    );
    
    // Retorna também o role para o frontend saber o que mostrar
    res.json({ 
        token, 
        username: user.username, 
        store_id: user.store_id,
        role: user.role 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno no login' });
  }
});

// ==================================================================
// 5. ROTAS PROTEGIDAS (SAAS)
// ==================================================================

// --- MÓDULO: CLIENTES ---

app.post('/clientes', authenticateToken, async (req, res) => {
  try {
    const { 
      nome, tipo, cpf_cnpj, rg, data_nascimento, 
      email, telefone, cep, endereco, numero, 
      bairro, cidade, estado, categoria // <--- Novo campo recebido
    } = req.body;
    
    const nascimento = data_nascimento ? data_nascimento : null;
    // Define padrão como 'Cliente' se não vier nada
    const categoriaFinal = categoria || 'Cliente';

    const newClient = await pool.query(
      `INSERT INTO clients (
          store_id, nome, cpf, rg, data_nascimento, 
          email, telefone, cep, endereco, numero, 
          bairro, cidade, estado, tipo, categoria
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING *`,
      [
        req.user.store_id, nome, cpf_cnpj, rg, nascimento, 
        email, telefone, cep, endereco, numero, 
        bairro, cidade, estado, tipo, categoriaFinal
      ]
    );

    res.json(newClient.rows[0]);
  } catch (err) {
    console.error("Erro ao cadastrar cliente:", err.message);
    res.status(500).send('Erro no servidor ao criar cliente');
  }
});

app.get('/clientes', authenticateToken, async (req, res) => {
  try {
    const allClients = await pool.query('SELECT *, cpf as cpf_cnpj FROM clients WHERE store_id = $1 ORDER BY id DESC', [req.user.store_id]);
    res.json(allClients.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

app.put('/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      nome, tipo, cpf_cnpj, rg, data_nascimento, 
      email, telefone, cep, endereco, numero, 
      bairro, cidade, estado, categoria // <--- Novo campo
    } = req.body;

    const nascimento = data_nascimento ? data_nascimento : null;
    
    await pool.query(
      `UPDATE clients SET 
          nome=$1, cpf=$2, rg=$3, data_nascimento=$4, 
          email=$5, telefone=$6, cep=$7, endereco=$8, 
          numero=$9, bairro=$10, cidade=$11, estado=$12, tipo=$13, categoria=$14
       WHERE id=$15 AND store_id=$16`,
      [
        nome, cpf_cnpj, rg, nascimento, 
        email, telefone, cep, endereco, 
        numero, bairro, cidade, estado, tipo, categoria,
        id, req.user.store_id
      ]
    );
    res.json({ message: "Cliente atualizado com sucesso" });
  } catch (err) {
    console.error("Erro ao atualizar:", err.message);
    res.status(500).send('Erro no servidor ao atualizar');
  }
});

app.delete('/clientes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM clients WHERE id = $1 AND store_id = $2', [id, req.user.store_id]);
    res.json({ message: "Cliente excluído" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});


// Rota para buscar o histórico de compras/vendas de um cliente específico
app.get('/clientes/:id/vendas', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        s.id, s.data_venda, s.valor_venda, s.metodo_pagamento,
        v.modelo, v.placa, v.cor
      FROM sales s
      JOIN vehicles v ON s.vehicle_id = v.id
      WHERE s.client_id = $1 AND s.store_id = $2
      ORDER BY s.data_venda DESC
    `;
    const result = await pool.query(query, [id, req.user.store_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar histórico do cliente:", err.message);
    res.status(500).send('Erro no servidor');
  }
});

// --- MÓDULO: VEÍCULOS (CORREÇÕES APLICADAS AQUI) ---

// Cadastrar Veículo
// ==================================================================
// ROTAS DE VEÍCULOS (ATUALIZADAS COM TROCA E CONSIGNAÇÃO)
// ==================================================================

// CADASTRAR VEÍCULO (POST)
app.post('/veiculos', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Inicia transação segura

    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      renavam, chassi, status, foto, observacoes,
      dataEntrada, proprietario, vendedor_origem, 
      certificado, operacao, veiculo_troca_id, // <--- Novos Campos
      opcionais 
    } = req.body;

    const data_entrada_db = dataEntrada ? dataEntrada : null;

    // 1. Insere o veículo principal
    const vehicleRes = await client.query(
      `INSERT INTO vehicles (
        store_id, modelo, placa, ano, cor, combustivel, 
        preco_venda, preco_compra, renavam, chassi, status, 
        imagem, descricao,
        data_entrada, proprietario_anterior, vendedor_origem, certificado, 
        operacao, veiculo_troca_id
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) 
       RETURNING *`, 
      [
        req.user.store_id, modelo, placa, ano, cor, combustivel, 
        valor, custo, renavam, chassi, status || 'Disponível', 
        foto, observacoes,
        data_entrada_db, proprietario, vendedor_origem, certificado, 
        operacao, veiculo_troca_id || null // Salva NULL se não for troca
      ]
    );
    const newVehicle = vehicleRes.rows[0];

    // 2. Insere os Opcionais (se houver)
    if (opcionais && opcionais.length > 0) {
        for (const op of opcionais) {
            await client.query(
                'INSERT INTO vehicle_options (vehicle_id, option_id) VALUES ($1, $2)',
                [newVehicle.id, op.id]
            );
        }
    }

    await client.query('COMMIT'); // Confirma tudo
    res.json(newVehicle);

  } catch (err) {
    await client.query('ROLLBACK'); // Cancela se der erro
    console.error("Erro ao cadastrar veículo:", err.message);
    res.status(500).send('Erro ao cadastrar veículo');
  } finally {
    client.release();
  }
});

// ATUALIZAR VEÍCULO (PUT)
app.put('/veiculos/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      renavam, chassi, status, foto, observacoes,
      dataEntrada, proprietario, vendedor_origem,
      certificado, operacao, veiculo_troca_id,
      opcionais
    } = req.body;
    
    // Tratamento de Dados (Para evitar erro de sintaxe SQL)
    const data_entrada_db = dataEntrada ? dataEntrada : null;
    const troca_id_db = (veiculo_troca_id && veiculo_troca_id !== '') ? veiculo_troca_id : null;

    // 1. Atualiza dados do veículo
    await client.query(
      `UPDATE vehicles SET 
        modelo=$1, placa=$2, ano=$3, cor=$4, combustivel=$5, 
        preco_venda=$6, preco_compra=$7, renavam=$8, chassi=$9, 
        status=$10, imagem=$11, descricao=$12,
        data_entrada=$13, proprietario_anterior=$14, vendedor_origem=$15, 
        certificado=$16, operacao=$17, veiculo_troca_id=$18
       WHERE id=$19 AND store_id=$20`,
      [
        modelo, placa, ano, cor, combustivel, 
        valor, custo, renavam, chassi, 
        status, foto, observacoes,
        data_entrada_db, proprietario, vendedor_origem, 
        certificado, operacao, troca_id_db, // Usa a variável tratada
        id, req.user.store_id
      ]
    );

    // 2. Atualiza Opcionais
    await client.query('DELETE FROM vehicle_options WHERE vehicle_id = $1', [id]);

    if (opcionais && opcionais.length > 0) {
        for (const op of opcionais) {
            await client.query(
                'INSERT INTO vehicle_options (vehicle_id, option_id) VALUES ($1, $2)',
                [id, op.id]
            );
        }
    }

    await client.query('COMMIT');
    res.json({ message: "Veículo atualizado com sucesso!" });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Erro ao atualizar veículo:", err.message);
    res.status(500).send('Erro ao atualizar veículo');
  } finally {
    client.release();
  }
});

// Listar Todos os Veículos (Admin)
app.get('/veiculos', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT ON (v.id) 
        v.*, 
        v.preco_venda as valor, v.preco_compra as custo, v.imagem as foto,
        s.vendedor, s.data_venda, s.operacao as operacao_saida, -- <--- Adicionado operacao_saida
        c.nome as cliente_nome,
        (SELECT COALESCE(json_agg(json_build_object('id', o.id, 'code', o.code, 'name', o.name)), '[]')
         FROM vehicle_options vo JOIN options o ON vo.option_id = o.id WHERE vo.vehicle_id = v.id) as opcionais
      FROM vehicles v
      LEFT JOIN sales s ON v.id = s.vehicle_id
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE v.store_id = $1
      ORDER BY v.id DESC, s.data_venda DESC
    `;
    const allVehicles = await pool.query(query, [req.user.store_id]);
    res.json(allVehicles.rows);
  } catch (err) { res.status(500).send('Erro no servidor'); }
});

// Listar Veículos em Estoque (Para Venda)
app.get('/veiculos-estoque', authenticateToken, async (req, res) => {
    try {
        // CORREÇÃO 3: "imagem as foto" adicionado aqui também
        const result = await pool.query(
            "SELECT *, preco_venda as valor, imagem as foto FROM vehicles WHERE status = 'Em estoque' AND store_id = $1 ORDER BY modelo",
            [req.user.store_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EXCLUIR VEÍCULO
app.delete('/veiculos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Como configuramos o CASCADE no banco, basta deletar o veículo.
    // O banco apagará automaticamente as despesas, opções e vendas vinculadas.
    await pool.query('DELETE FROM vehicles WHERE id = $1 AND store_id = $2', [id, req.user.store_id]);
    
    res.json({ message: "Veículo excluído com sucesso!" });
  } catch (err) {
    console.error(err.message);
    // Se ainda der erro, mostra qual é
    res.status(500).json({ error: "Erro ao excluir veículo. Verifique se há vínculos pendentes.", details: err.message });
  }
});

// --- MÓDULO: VENDAS ---

app.post('/vendas', authenticateToken, async (req, res) => {
    const { cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor, operacao } = req.body;
    
    try {
        await pool.query('BEGIN');
        const newSale = await pool.query(
            `INSERT INTO sales (store_id, client_id, vehicle_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor, operacao) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [req.user.store_id, cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor, operacao || 'Venda']
        );
        await pool.query("UPDATE vehicles SET status = 'Vendido' WHERE id = $1", [veiculo_id]);
        await pool.query('COMMIT');
        res.json(newSale.rows[0]);
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: "Erro ao realizar venda" });
    }
});

// Histórico de Vendas
app.get('/financeiro/vendas', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id, c.nome as cliente_nome, c.cpf,
                v.modelo as veiculo_modelo, v.placa as veiculo_placa,
                s.valor_venda, s.data_venda, s.metodo_pagamento, s.entrada, s.financiado
            FROM sales s
            JOIN clients c ON s.client_id = c.id
            JOIN vehicles v ON s.vehicle_id = v.id
            WHERE s.store_id = $1
            ORDER BY s.data_venda DESC
        `;
        const result = await pool.query(query, [req.user.store_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar histórico" });
    }
});

// --- MÓDULO: DASHBOARD ---

app.get('/dashboard/resumo', authenticateToken, async (req, res) => {
    try {
        const storeId = req.user.store_id;

        const estoqueQuery = await pool.query(
            "SELECT COUNT(*) as qtd, SUM(preco_venda) as total FROM vehicles WHERE status = 'Em estoque' AND store_id = $1",
            [storeId]
        );
        
        const vendasQuery = await pool.query("SELECT COUNT(*) as qtd FROM sales WHERE store_id = $1", [storeId]);
        
        const clientesQuery = await pool.query("SELECT COUNT(*) as qtd FROM clients WHERE store_id = $1", [storeId]);

        const recentesQuery = await pool.query(`
            SELECT v.modelo, v.placa, s.valor_venda, s.data_venda 
            FROM sales s 
            JOIN vehicles v ON s.vehicle_id = v.id 
            WHERE s.store_id = $1
            ORDER BY s.data_venda DESC LIMIT 5
        `, [storeId]);

        res.json({
            estoque: {
                qtd: estoqueQuery.rows[0].qtd || 0,
                valor: estoqueQuery.rows[0].total || 0
            },
            vendas: vendasQuery.rows[0].qtd || 0,
            clientes: clientesQuery.rows[0].qtd || 0,
            recentes: recentesQuery.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao carregar dashboard" });
    }
});

// --- MÓDULO: CONFIGURAÇÕES ---

app.get('/config', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                id, store_id,
                company_name as nome_loja, razao_social, cnpj, 
                address as endereco, cidade, phone as telefone, 
                email, website as site, logo 
            FROM settings 
            WHERE store_id = $1
        `;
        const result = await pool.query(query, [req.user.store_id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar configurações" });
    }
});

app.put('/config', authenticateToken, async (req, res) => {
    const { nome_loja, razao_social, cnpj, endereco, cidade, telefone, email, site, logo } = req.body;
    
    try {
        const check = await pool.query('SELECT id FROM settings WHERE store_id = $1', [req.user.store_id]);
        
        if (check.rows.length > 0) {
            await pool.query(
                `UPDATE settings SET 
                    company_name=$1, razao_social=$2, cnpj=$3, 
                    address=$4, cidade=$5, phone=$6, email=$7, website=$8, logo=$9
                 WHERE store_id=$10`,
                [nome_loja, razao_social, cnpj, endereco, cidade, telefone, email, site, logo, req.user.store_id]
            );
        } else {
            await pool.query(
                `INSERT INTO settings 
                    (store_id, company_name, razao_social, cnpj, address, cidade, phone, email, website, logo) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [req.user.store_id, nome_loja, razao_social, cnpj, endereco, cidade, telefone, email, site, logo]
            );
        }
        res.json({ message: 'Configurações salvas!' });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

// Alterar Senha
app.put('/profile/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // 1. Busca o usuário atual
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // 2. Verifica a senha ATUAL
    // Lógica híbrida (hash ou texto plano)
    let validPassword = false;
    try {
        validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    } catch (e) {}
    
    if (!validPassword && currentPassword === user.password_hash) {
        validPassword = true;
    }

    if (!validPassword) {
        return res.status(400).json({ error: 'A senha atual está incorreta.' });
    }

    // 3. Atualiza para a NOVA senha (criptografada)
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

    res.json({ message: 'Senha alterada com sucesso!' });

  } catch (err) {
    console.error("Erro ao trocar senha:", err);
    res.status(500).json({ error: 'Erro interno ao atualizar senha.' });
  }
});

// --- MÓDULO: DESPESAS ---

// Listar despesas de um veículo
app.get('/veiculos/:id/despesas', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM expenses WHERE vehicle_id = $1 AND store_id = $2 ORDER BY data_despesa DESC',
            [id, req.user.store_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar despesas" });
    }
});

// Salvar despesa

app.post('/veiculos/:id/despesas', authenticateToken, async (req, res) => {
    const { id } = req.params;
    // Agora recebemos também o 'tipo'
    let { descricao, valor, tipo } = req.body; 

    // Define padrão como 'despesa' se não for enviado
    const tipoLancamento = tipo || 'despesa';

    // Tratamento de valor (caso venha como string)
    if (typeof valor === 'string') {
        valor = parseFloat(valor.replace(/[^\d,.-]/g, '').replace(',', '.'));
    }

    try {
        const result = await pool.query(
            'INSERT INTO expenses (store_id, vehicle_id, descricao, valor, tipo, data_despesa) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
            [req.user.store_id, id, descricao, valor, tipoLancamento]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Erro ao salvar lançamento:", err);
        res.status(500).json({ error: "Erro ao salvar lançamento" });
    }
});

// Deletar despesa
app.delete('/despesas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM expenses WHERE id = $1 AND store_id = $2', [id, req.user.store_id]);
        res.json({ message: "Despesa removida" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao remover despesa" });
    }
});

// Listar todas as despesas (Relatório)
app.get('/despesas', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM expenses WHERE store_id = $1 ORDER BY data_despesa DESC',
            [req.user.store_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar despesas gerais" });
    }
});

// EDITAR DESPESA/RECEITA
app.put('/despesas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { descricao, valor, tipo } = req.body;
    try {
        await pool.query(
            'UPDATE expenses SET descricao=$1, valor=$2, tipo=$3 WHERE id=$4 AND store_id=$5',
            [descricao, valor, tipo, id, req.user.store_id]
        );
        res.json({ message: "Lançamento atualizado com sucesso" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao atualizar lançamento" });
    }
});

// --- MÓDULO: DOCUMENTOS DE VEÍCULOS (Novo) ---

// Listar documentos de um veículo
app.get('/veiculos/:id/documentos', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, titulo, tipo, arquivo, created_at FROM vehicle_documents WHERE vehicle_id = $1 AND store_id = $2 ORDER BY created_at DESC',
            [id, req.user.store_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar documentos" });
    }
});

// Salvar novo documento
app.post('/veiculos/:id/documentos', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { titulo, arquivo, tipo } = req.body;
    
    if (!arquivo) return res.status(400).json({ error: "Arquivo obrigatório" });

    try {
        await pool.query(
            'INSERT INTO vehicle_documents (store_id, vehicle_id, titulo, arquivo, tipo) VALUES ($1, $2, $3, $4, $5)',
            [req.user.store_id, id, titulo, arquivo, tipo]
        );
        res.json({ message: "Documento salvo com sucesso" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao salvar documento" });
    }
});

// Deletar documento
app.delete('/documentos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM vehicle_documents WHERE id = $1 AND store_id = $2', [id, req.user.store_id]);
        res.json({ message: "Documento removido" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao remover documento" });
    }
});

// --- MÓDULO: OPCIONAIS ---

// Buscar opcionais (com filtro)
app.get('/options', authenticateToken, async (req, res) => {
    const { q } = req.query; // Termo de busca
    try {
        let query = 'SELECT * FROM options WHERE store_id = $1';
        let params = [req.user.store_id];

        if (q) {
            query += ' AND (code ILIKE $2 OR name ILIKE $2)';
            params.push(`%${q}%`);
        }
        
        query += ' ORDER BY name ASC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar opcionais" });
    }
});

// Criar novo opcional
app.post('/options', authenticateToken, async (req, res) => {
    const { code, name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO options (store_id, code, name) VALUES ($1, $2, $3) RETURNING *',
            [req.user.store_id, code, name]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erro ao criar opcional" });
    }
});

// ==================================================================
// 6. ROTAS DO SUPER ADMIN (Gerenciamento de Lojas)
// ==================================================================

// Middleware: Verifica se é Super Admin
const requireSuperAdmin = (req, res, next) => {
    // Verifica se o papel (role) é super_admin. 
    // Se você não rodou o SQL de update, troque por: if (req.user.username !== 'admin') ...
    if (req.user.role !== 'super_admin' && req.user.username !== 'admin') { 
        return res.status(403).json({ error: "Acesso restrito ao Super Admin" });
    }
    next();
};

// LISTAR TODAS AS LOJAS
app.get('/admin/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.username !== 'admin') return res.sendStatus(403);
  
  try {
    const result = await pool.query(`
      SELECT 
        s.*, 
        (SELECT username FROM users WHERE store_id = s.id LIMIT 1) as admin_username 
      FROM stores s 
      ORDER BY s.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Erro ao listar lojas');
  }
});

// CRIAR NOVA LOJA (TENANT)
app.post('/admin/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.sendStatus(403);
  
  const { name, username, password } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Cria a Loja
    const storeRes = await client.query(
      'INSERT INTO stores (name, status) VALUES ($1, $2) RETURNING id',
      [name, 'active']
    );
    const storeId = storeRes.rows[0].id;

    // 2. Cria o Usuário Admin vinculado à loja (Hash de senha ou texto plano fallback)
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await client.query(
      'INSERT INTO users (username, password_hash, role, store_id) VALUES ($1, $2, $3, $4)',
      [username, hash, 'admin', storeId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Loja criada com sucesso', storeId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Usuário já existe' });
    res.status(500).json({ error: 'Erro ao criar loja' });
  } finally {
    client.release();
  }
});

// ATUALIZAR STATUS (BLOQUEAR / ATIVAR)
app.put('/admin/stores/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') return res.sendStatus(403);
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query('UPDATE stores SET status = $1 WHERE id = $2', [status, id]);
    res.json({ message: 'Status atualizado' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// ATUALIZAR DADOS (NOME E USUÁRIO)
app.put('/admin/stores/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.username !== 'admin') return res.sendStatus(403);
  
  const { id } = req.params;
  const { name, username } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // 1. Atualiza a loja
    await client.query('UPDATE stores SET name = $1 WHERE id = $2', [name, id]);
    
    // 2. Tenta atualizar o usuário. 
    // Se não existir um com role='admin', ele tenta atualizar o primeiro que achar daquela loja
    const userUpdate = await client.query(
        `UPDATE users SET username = $1 WHERE store_id = $2 AND (role = 'admin' OR role IS NULL)`, 
        [username, id]
    );

    // 3. Se por acaso a loja não tiver NENHUM usuário (erro de integridade), criamos um
    if (userUpdate.rowCount === 0) {
        const salt = await bcrypt.genSalt(10);
        const defaultHash = await bcrypt.hash('123456', salt);
        await client.query(
            `INSERT INTO users (username, password_hash, role, store_id) VALUES ($1, $2, 'admin', $3)`,
            [username, defaultHash, id]
        );
    }

    await client.query('COMMIT');
    res.json({ message: 'Dados atualizados com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar dados.' });
  } finally {
    client.release();
  }
});

// --- A ROTA QUE FALTAVA (RESET DE SENHA) ---
app.put('/admin/stores/:id/reset-password', authenticateToken, async (req, res) => {
  // Verificação dupla de segurança
  const isSuperAdmin = req.user.role === 'super_admin' || req.user.username === 'admin';
  
  if (!isSuperAdmin) {
    return res.status(403).json({ error: 'Acesso restrito ao Super Admin' });
  }

  const storeId = req.params.id; // ID da loja vindo da URL
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    // IMPORTANTE: Atualiza o usuário que pertence a ESTA loja e tem cargo de admin
    const result = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE store_id = $2 AND role = 'admin'`,
      [hash, storeId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Nenhum administrador encontrado para esta loja.' });
    }

    res.json({ message: 'Senha da loja alterada com sucesso!' });
  } catch (err) {
    console.error("Erro ao resetar senha via SuperAdmin:", err);
    res.status(500).json({ error: 'Erro interno ao processar a troca de senha.' });
  }
});

// ==================================================================
// 7. INICIALIZAÇÃO DO SERVIDOR
// ==================================================================


// Health check (Para verificar se a API está online)
app.get('/', (req, res) => {
  res.send('API SaaS Kadilac Rodando com Segurança e Multi-loja 🚀');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});