require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

// --- CORREÇÃO DO ERRO 413 AQUI ---
// Aumenta o limite para aceitar fotos grandes (até 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middlewares
app.use(cors()); // Permite que o Frontend acesse o Backend
app.use(express.json()); // Permite ler JSON no corpo das requisições

// --- CORREÇÃO DO CORS AQUI ---
// Permite que a Vercel acesse seu Backend
app.use(cors({
    origin: [
        'http://localhost:5173', // Para funcionar no seu PC local
        'https://kadilac-frontend.vercel.app/', // COLOQUE AQUI SEU DOMÍNIO DA VERCEL
        'https://seu-projeto.vercel.app' // Adicione variações se tiver dúvida
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));


// --- ROTAS DE CLIENTES ---

// Cadastrar Cliente
app.post('/clientes', async (req, res) => {
  try {
    const { nome, tipo, cpf_cnpj, rg, data_nascimento, email, telefone, cep, endereco, numero, bairro, cidade, estado } = req.body;
    
    const newClient = await pool.query(
      `INSERT INTO clientes (nome, tipo, cpf_cnpj, rg, data_nascimento, email, telefone, cep, endereco, numero, bairro, cidade, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [nome, tipo, cpf_cnpj, rg, data_nascimento, email, telefone, cep, endereco, numero, bairro, cidade, estado]
    );

    res.json(newClient.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

// Listar Todos os Clientes
app.get('/clientes', async (req, res) => {
  try {
    const allClients = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
    res.json(allClients.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

// --- ROTA DE HISTÓRICO DO CLIENTE ---
app.get('/clientes/:id/vendas', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT 
                v.id,
                v.data_venda,
                v.valor_venda,
                v.metodo_pagamento,
                ve.modelo,
                ve.placa,
                ve.ano,
                ve.cor
            FROM vendas v
            JOIN veiculos ve ON v.veiculo_id = ve.id
            WHERE v.cliente_id = $1
            ORDER BY v.data_venda DESC
        `;
        const result = await pool.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar histórico de compras" });
    }
});

// --- ROTAS DE VEÍCULOS ---

// Cadastrar Veículo
app.post('/veiculos', async (req, res) => {
  try {
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      dataEntrada, operacao, proprietario, vendedor, 
      renavam, chassi, certificado, // <--- ADICIONEI AQUI
      opcionais, observacoes, status, foto 
    } = req.body;

    const newVehicle = await pool.query(
      `INSERT INTO veiculos (
        modelo, placa, ano, cor, combustivel, valor, custo, 
        data_entrada, operacao, proprietario_anterior, vendedor, 
        renavam, chassi, certificado, opcionais, observacoes, status, foto
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
       RETURNING *`,
      [
        modelo, placa, ano, cor, combustivel, valor, custo, 
        dataEntrada, operacao, proprietario, vendedor, 
        renavam, chassi, certificado, // <--- E AQUI
        opcionais, observacoes, status, foto
      ]
    );

    res.json(newVehicle.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro ao cadastrar veículo');
  }
});

// 2. EDITAR VEÍCULO (PUT)
app.put('/veiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      dataEntrada, operacao, proprietario, vendedor, 
      renavam, chassi, certificado, // <--- ADICIONEI AQUI
      opcionais, observacoes, status, foto 
    } = req.body;
    
    await pool.query(
      `UPDATE veiculos SET 
        modelo=$1, placa=$2, ano=$3, cor=$4, combustivel=$5, valor=$6, custo=$7, 
        data_entrada=$8, operacao=$9, proprietario_anterior=$10, vendedor=$11, 
        renavam=$12, chassi=$13, certificado=$14, opcionais=$15, observacoes=$16, status=$17, foto=$18 
       WHERE id=$19`,
      [
        modelo, placa, ano, cor, combustivel, valor, custo, 
        dataEntrada, operacao, proprietario, vendedor, 
        renavam, chassi, certificado, // <--- E AQUI
        opcionais, observacoes, status, foto, 
        id
      ]
    );
    res.json({ message: "Veículo atualizado com sucesso!" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro ao atualizar veículo');
  }
});

// Listar Todos os Veículos
app.get('/veiculos', async (req, res) => {
  try {
    const allVehicles = await pool.query('SELECT * FROM veiculos ORDER BY id DESC');
    res.json(allVehicles.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});


// rota para adicionar cliente 
app.put('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, tipo, cpf_cnpj, rg, data_nascimento, email, telefone, cep, endereco, numero, bairro, cidade, estado } = req.body;
    
    await pool.query(
      `UPDATE clientes SET nome=$1, tipo=$2, cpf_cnpj=$3, rg=$4, data_nascimento=$5, email=$6, telefone=$7, cep=$8, endereco=$9, numero=$10, bairro=$11, cidade=$12, estado=$13 WHERE id=$14`,
      [nome, tipo, cpf_cnpj, rg, data_nascimento, email, telefone, cep, endereco, numero, bairro, cidade, estado, id]
    );
    res.json({ message: "Cliente atualizado" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

//rota para excluir cliente
app.delete('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.json({ message: "Cliente excluído" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});
// --- ROTAS DE VEÍCULOS ATUALIZADAS ---

// Rota para deletar veículo
app.delete('/veiculos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('BEGIN');

    await pool.query('DELETE FROM despesas_veiculos WHERE veiculo_id = $1', [id]);

    await pool.query('DELETE FROM vendas WHERE veiculo_id = $1', [id]);

    const result = await pool.query('DELETE FROM veiculos WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
        await pool.query('ROLLBACK'); // Desfaz se não achou o carro
        return res.status(404).json({ message: 'Veículo não encontrado' });
    }

    // Confirma todas as exclusões
    await pool.query('COMMIT');
    
    res.status(200).json({ message: 'Veículo e todos os dados vinculados foram deletados com sucesso.' });

  } catch (err) {
    await pool.query('ROLLBACK'); // Se der erro, desfaz tudo para não estragar o banco
    console.error("Erro ao deletar veículo:", err.message);
    res.status(500).json({ message: 'Erro interno ao deletar veículo: ' + err.message });
  }
});

// 1. CADASTRAR VEÍCULO (POST)
app.post('/veiculos', async (req, res) => {
  try {
    // Recebe os dados do Frontend (nomes em camelCase)
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      dataEntrada, // Frontend envia assim
      operacao, proprietario, vendedor, renavam, chassi, opcionais, observacoes, status, 
      foto // Novo campo da foto
    } = req.body;

    const newVehicle = await pool.query(
      `INSERT INTO veiculos (
        modelo, placa, ano, cor, combustivel, valor, custo, 
        data_entrada, operacao, proprietario_anterior, vendedor, 
        renavam, chassi, opcionais, observacoes, status, foto
      ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
       RETURNING *`,
      [
        modelo, placa, ano, cor, combustivel, valor, custo, 
        dataEntrada, // Mapeado para data_entrada
        operacao, proprietario, vendedor, 
        renavam, chassi, opcionais, observacoes, status, foto
      ]
    );

    res.json(newVehicle.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro ao cadastrar veículo');
  }
});

// 2. EDITAR VEÍCULO (PUT)
app.put('/veiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      dataEntrada, // Frontend envia assim
      operacao, proprietario, vendedor, renavam, chassi, opcionais, observacoes, status, 
      foto 
    } = req.body;
    
    await pool.query(
      `UPDATE veiculos SET 
        modelo=$1, placa=$2, ano=$3, cor=$4, combustivel=$5, valor=$6, custo=$7, 
        data_entrada=$8, operacao=$9, proprietario_anterior=$10, vendedor=$11, 
        renavam=$12, chassi=$13, opcionais=$14, observacoes=$15, status=$16, foto=$17 
       WHERE id=$18`,
      [
        modelo, placa, ano, cor, combustivel, valor, custo, 
        dataEntrada, // Mapeado corretamente
        operacao, proprietario, vendedor, renavam, chassi, opcionais, observacoes, status, foto, 
        id
      ]
    );
    res.json({ message: "Veículo atualizado com sucesso!" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro ao atualizar veículo');
  }
});


// --- ROTA DE VENDAS (NOVA FICHA) ---

// 1. Buscar lista de carros APENAS em estoque (para o select)
app.get('/veiculos-estoque', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM veiculos WHERE status = 'Em estoque' ORDER BY modelo");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Salvar uma nova venda (Ficha)
app.post('/vendas', async (req, res) => {
    // Adicionado 'vendedor' na desestruturação
    const { cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor } = req.body;
    
    try {
        await pool.query('BEGIN');

        // A. Cria o registro na tabela de vendas (INCLUINDO O VENDEDOR)
        const newSale = await pool.query(
            `INSERT INTO vendas (cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [cliente_id, veiculo_id, valor_venda, entrada, financiado, metodo_pagamento, observacoes, vendedor]
        );

        // B. Atualiza o status do carro para 'Vendido'
        await pool.query(
            "UPDATE veiculos SET status = 'Vendido' WHERE id = $1", 
            [veiculo_id]
        );

        await pool.query('COMMIT');
        res.json(newSale.rows[0]);

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Erro ao realizar venda" });
    }
});


// --- ROTA DO DASHBOARD ---

app.get('/dashboard/resumo', async (req, res) => {
    try {
        // 1. Dados de Estoque (Qtd e Valor Total)
        const estoqueQuery = await pool.query(
            "SELECT COUNT(*) as qtd, SUM(valor) as total FROM veiculos WHERE status = 'Em estoque'"
        );
        
        // 2. Total de Vendas
        const vendasQuery = await pool.query("SELECT COUNT(*) as qtd FROM vendas");
        
        // 3. Total de Clientes
        const clientesQuery = await pool.query("SELECT COUNT(*) as qtd FROM clientes");

        // 4. Últimas 5 Vendas (com dados do carro)
        const recentesQuery = await pool.query(`
            SELECT v.modelo, v.placa, s.valor_venda, s.data_venda 
            FROM vendas s 
            JOIN veiculos v ON s.veiculo_id = v.id 
            ORDER BY s.data_venda DESC 
            LIMIT 5
        `);

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

// --- ROTA DO FINANCEIRO / HISTÓRICO DE VENDAS ---
app.get('/financeiro/vendas', async (req, res) => {
    try {
        const query = `
            SELECT 
                v.id,
                c.nome as cliente_nome,
                c.cpf_cnpj,
                ve.modelo as veiculo_modelo,
                ve.placa as veiculo_placa,
                v.valor_venda,
                v.data_venda,
                v.metodo_pagamento,
                v.entrada,
                v.financiado
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            ORDER BY v.data_venda DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar histórico de vendas" });
    }
});

// --- ROTA DE CANCELAMENTO DE VENDA ---
app.delete('/vendas/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        await pool.query('BEGIN'); // Inicia a transação de segurança

        // 1. Descobrir qual carro foi vendido nesta venda antes de apagar
        const saleResult = await pool.query('SELECT veiculo_id FROM vendas WHERE id = $1', [id]);
        
        if (saleResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Venda não encontrada' });
        }

        const veiculoId = saleResult.rows[0].veiculo_id;

        // 2. Apagar o registro da venda
        await pool.query('DELETE FROM vendas WHERE id = $1', [id]);

        // 3. Atualizar o status do veículo de volta para "Em estoque"
        await pool.query("UPDATE veiculos SET status = 'Em estoque' WHERE id = $1", [veiculoId]);

        await pool.query('COMMIT'); // Confirma as alterações
        res.json({ message: 'Venda cancelada e veículo retornado ao estoque.' });

    } catch (err) {
        await pool.query('ROLLBACK'); // Desfaz tudo se der erro
        console.error(err);
        res.status(500).json({ error: 'Erro ao cancelar venda' });
    }
});


// --- CONFIGURAÇÕES DA LOJA ---
app.get('/config', async (req, res) => {
    const result = await pool.query('SELECT * FROM configuracoes WHERE id = 1');
    res.json(result.rows[0]);
});

app.put('/config', async (req, res) => {
    const { nome_loja, razao_social, cnpj, endereco, cidade, telefone, email, site } = req.body;
    await pool.query(
        `UPDATE configuracoes SET 
         nome_loja=$1, razao_social=$2, cnpj=$3, endereco=$4, cidade=$5, telefone=$6, email=$7, site=$8 
         WHERE id=1`,
        [nome_loja, razao_social, cnpj, endereco, cidade, telefone, email, site]
    );
    res.json({ message: 'Configurações salvas!' });
});

// --- DADOS PARA IMPRESSÃO (CONTRATO) ---
app.get('/vendas/:id/print', async (req, res) => {
    const { id } = req.params;
    try {
        // Busca Venda + Cliente Completo + Veículo Completo
        const vendaQuery = `
            SELECT 
                v.*, 
                c.nome, c.cpf_cnpj, c.rg, c.endereco as cli_endereco, c.cidade as cli_cidade, c.telefone as cli_telefone,
                ve.modelo, ve.marca, ve.placa, ve.renavam, ve.chassi, ve.ano, ve.cor, ve.combustivel
            FROM vendas v
            JOIN clientes c ON v.cliente_id = c.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            WHERE v.id = $1
        `;
        const vendaRes = await pool.query(vendaQuery, [id]);
        
        // Busca Configurações da Loja
        const configRes = await pool.query('SELECT * FROM configuracoes WHERE id = 1');

        if (vendaRes.rows.length === 0) return res.status(404).json({ error: 'Venda não encontrada' });

        res.json({
            venda: vendaRes.rows[0],
            loja: configRes.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar dados de impressão" });
    }
});

// --- ROTAS DE DESPESAS DO VEÍCULO ---

// 1. Listar despesas de um carro
app.get('/veiculos/:id/despesas', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM despesas_veiculos WHERE veiculo_id = $1 ORDER BY data_despesa DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar despesas" });
    }
});

// 2. Adicionar uma nova despesa
app.post('/veiculos/:id/despesas', async (req, res) => {
    const { id } = req.params;
    const { descricao, valor } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO despesas_veiculos (veiculo_id, descricao, valor) VALUES ($1, $2, $3) RETURNING *',
            [id, descricao, valor]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erro ao salvar despesa" });
    }
});

// 3. Deletar uma despesa
app.delete('/despesas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM despesas_veiculos WHERE id = $1', [id]);
        res.json({ message: "Despesa removida" });
    } catch (err) {
        res.status(500).json({ error: "Erro ao remover despesa" });
    }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});