require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;
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
// 3. MIDDLEWARE DE AUTENTICAÇÃO
// ==================================================================
// Protege as rotas verificando se existe um Token válido
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user; // Salva os dados do usuário (id, store_id) na requisição
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

    if (!validPassword && password === user.password_hash) {
        validPassword = true;
        console.warn(`AVISO: Usuário ${username} com senha sem criptografia.`);
    }

    if (!validPassword) return res.status(400).json({ error: 'Senha incorreta' });

    // Gera o Token JWT
    const token = jwt.sign(
        { id: user.id, store_id: user.store_id, username: user.username }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
    );
    
    res.json({ token, username: user.username, store_id: user.store_id });
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
      bairro, cidade, estado 
    } = req.body;
    
    const nascimento = data_nascimento ? data_nascimento : null;

    const newClient = await pool.query(
      `INSERT INTO clients (
          store_id, nome, cpf, rg, data_nascimento, 
          email, telefone, cep, endereco, numero, 
          bairro, cidade, estado, tipo
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
      RETURNING *`,
      [
        req.user.store_id, nome, cpf_cnpj, rg, nascimento, 
        email, telefone, cep, endereco, numero, 
        bairro, cidade, estado, tipo
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
      bairro, cidade, estado 
    } = req.body;

    const nascimento = data_nascimento ? data_nascimento : null;
    
    await pool.query(
      `UPDATE clients SET 
          nome=$1, cpf=$2, rg=$3, data_nascimento=$4, 
          email=$5, telefone=$6, cep=$7, endereco=$8, 
          numero=$9, bairro=$10, cidade=$11, estado=$12, tipo=$13
       WHERE id=$14 AND store_id=$15`,
      [
        nome, cpf_cnpj, rg, nascimento, 
        email, telefone, cep, endereco, 
        numero, bairro, cidade, estado, tipo, 
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

// --- MÓDULO: VEÍCULOS (CORREÇÕES APLICADAS AQUI) ---

// Cadastrar Veículo
app.post('/veiculos', authenticateToken, async (req, res) => {
  try {
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      renavam, chassi, opcionais, observacoes, status, foto,
      dataEntrada, proprietario, certificado, operacao
    } = req.body;

    const data_entrada_db = dataEntrada ? dataEntrada : null;

    // CORREÇÃO 1: Adicionado "imagem as foto" no RETURNING para o frontend ver a imagem logo após salvar
    const newVehicle = await pool.query(
      `INSERT INTO vehicles (
        store_id, modelo, placa, ano, cor, combustivel, 
        preco_venda, preco_compra, renavam, chassi, status, 
        imagem, descricao,
        data_entrada, proprietario_anterior, certificado, operacao
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
       RETURNING *, imagem as foto`, 
      [
        req.user.store_id, 
        modelo, placa, ano, cor, combustivel, 
        valor, custo, renavam, chassi, status || 'Disponível', 
        foto, observacoes,
        data_entrada_db, proprietario, certificado, operacao
      ]
    );

    res.json(newVehicle.rows[0]);
  } catch (err) {
    console.error("Erro ao cadastrar veículo:", err.message);
    res.status(500).send('Erro ao cadastrar veículo');
  }
});

// Atualizar Veículo
app.put('/veiculos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      renavam, chassi, status, foto, observacoes,
      dataEntrada, proprietario, certificado, operacao
    } = req.body;
    
    const data_entrada_db = dataEntrada ? dataEntrada : null;

    await pool.query(
      `UPDATE vehicles SET 
        modelo=$1, placa=$2, ano=$3, cor=$4, combustivel=$5, 
        preco_venda=$6, preco_compra=$7, renavam=$8, chassi=$9, 
        status=$10, imagem=$11, descricao=$12,
        data_entrada=$13, proprietario_anterior=$14, certificado=$15, operacao=$16
       WHERE id=$17 AND store_id=$18`,
      [
        modelo, placa, ano, cor, combustivel, 
        valor, custo, renavam, chassi, 
        status, foto, observacoes,
        data_entrada_db, proprietario, certificado, operacao,
        id, req.user.store_id
      ]
    );
    res.json({ message: "Veículo atualizado com sucesso!" });
  } catch (err) {
    console.error("Erro ao atualizar veículo:", err.message);
    res.status(500).send('Erro ao atualizar veículo');
  }
});

// Listar Todos os Veículos (Admin)
app.get('/veiculos', authenticateToken, async (req, res) => {
  try {
    // CORREÇÃO 2: "imagem as foto" adicionado para compatibilidade com o frontend
    const allVehicles = await pool.query(
        `SELECT *, preco_venda as valor, preco_compra as custo, imagem as foto 
        FROM vehicles WHERE store_id = $1 ORDER BY id DESC`, 
        [req.user.store_id]
    );
    res.json(allVehicles.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
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

app.delete('/veiculos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM vehicles WHERE id = $1 AND store_id = $2 RETURNING *', [id, req.user.store_id]);

    if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Veículo não encontrado ou sem permissão' });
    }
    res.status(200).json({ message: 'Veículo deletado com sucesso.' });
  } catch (err) {
    console.error("Erro ao deletar veículo:", err.message);
    res.status(500).json({ message: 'Erro interno' });
  }
});

// --- MÓDULO: VENDAS ---

app.post('/vendas', authenticateToken, async (req, res) => {
    const { cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor } = req.body;
    
    try {
        await pool.query('BEGIN'); // Inicia transação

        // Registra a venda na tabela sales
        const newSale = await pool.query(
            `INSERT INTO sales (store_id, client_id, vehicle_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.store_id, cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor]
        );

        // Atualiza status do veículo para 'Vendido'
        await pool.query(
            "UPDATE vehicles SET status = 'Vendido' WHERE id = $1 AND store_id = $2", 
            [veiculo_id, req.user.store_id]
        );

        await pool.query('COMMIT'); // Confirma transação
        res.json(newSale.rows[0]);

    } catch (err) {
        await pool.query('ROLLBACK'); // Cancela se der erro
        console.error(err);
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
    const { newPassword } = req.body;
    if(!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [hash, req.user.id]
        );
        res.json({ message: "Senha alterada com sucesso!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao alterar senha" });
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
    const { descricao, valor } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO expenses (store_id, vehicle_id, descricao, valor) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user.store_id, id, descricao, valor]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar despesa" });
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

// ==================================================================
// 6. INICIALIZAÇÃO DO SERVIDOR
// ==================================================================

// Health check (Para verificar se a API está online)
app.get('/', (req, res) => {
  res.send('API SaaS Kadilac Rodando com Segurança e Multi-loja 🚀');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});