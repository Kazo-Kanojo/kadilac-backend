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

// --- ROTAS DE VEÍCULOS ---

// Cadastrar Veículo
app.post('/veiculos', async (req, res) => {
  try {
    const { modelo, placa, ano, cor, combustivel, valor, custo, data_entrada, operacao, proprietario_anterior, vendedor, renavam, chassi, opcionais, observacoes, status } = req.body;

    const newVehicle = await pool.query(
      `INSERT INTO veiculos (modelo, placa, ano, cor, combustivel, valor, custo, data_entrada, operacao, proprietario_anterior, vendedor, renavam, chassi, opcionais, observacoes, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [modelo, placa, ano, cor, combustivel, valor, custo, data_entrada, operacao, proprietario_anterior, vendedor, renavam, chassi, opcionais, observacoes, status]
    );

    res.json(newVehicle.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

app.put('/veiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      modelo, placa, ano, cor, combustivel, valor, custo, 
      dataEntrada, // O Frontend manda como dataEntrada
      operacao, proprietario, vendedor, renavam, chassi, opcionais, observacoes, status, 
      foto 
    } = req.body;
    
    // ATENÇÃO: Aqui tem que ser UPDATE, não INSERT
    await pool.query(
      `UPDATE veiculos SET 
        modelo=$1, placa=$2, ano=$3, cor=$4, combustivel=$5, valor=$6, custo=$7, 
        data_entrada=$8, operacao=$9, proprietario_anterior=$10, vendedor=$11, 
        renavam=$12, chassi=$13, opcionais=$14, observacoes=$15, status=$16, foto=$17 
       WHERE id=$18`,
      [
        modelo, placa, ano, cor, combustivel, valor, custo, 
        dataEntrada, 
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
  try {
    const { id } = req.params;
    // Verifica se o ID existe antes de tentar deletar
    const check = await pool.query('SELECT * FROM veiculos WHERE id = $1', [id]);
    if (check.rows.length === 0) {
        return res.status(404).json({ message: 'Veículo não encontrado' });
    }

    await pool.query('DELETE FROM veiculos WHERE id = $1', [id]);
    res.status(200).json({ message: 'Veículo deletado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erro interno ao deletar veículo' });
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

// --- ROTA DO DASHBOARD ---

app.get('/dashboard/resumo', async (req, res) => {
  try {
    // 1. Total e Valor em Estoque
    const estoque = await pool.query(
      "SELECT COUNT(*) as qtd, SUM(valor) as total FROM veiculos WHERE status = 'Em estoque'"
    );

    // 2. Total de Vendas
    const vendas = await pool.query(
      "SELECT COUNT(*) as qtd FROM veiculos WHERE status = 'Vendido'"
    );

    // 3. Total de Clientes
    const clientes = await pool.query(
      "SELECT COUNT(*) as qtd FROM clientes"
    );

    // 4. Últimas 5 Vendas (para a tabela de atividades recentes)
    const ultimasVendas = await pool.query(
      "SELECT modelo, placa, valor, proprietario_anterior FROM veiculos WHERE status = 'Vendido' ORDER BY id DESC LIMIT 5"
    );

    res.json({
      estoque: {
        qtd: estoque.rows[0].qtd,
        valor: estoque.rows[0].total || 0
      },
      vendas: vendas.rows[0].qtd,
      clientes: clientes.rows[0].qtd,
      recentes: ultimasVendas.rows
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro ao buscar dados do dashboard');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});