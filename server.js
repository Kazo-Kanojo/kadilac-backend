const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

// Middlewares
app.use(cors()); // Permite que o Frontend acesse o Backend
app.use(express.json()); // Permite ler JSON no corpo das requisições

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
// --- ATUALIZAÇÕES PARA VEÍCULOS ---

// Editar Veículo (ou Fechar Ficha/Vender)
app.put('/veiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { modelo, placa, ano, cor, combustivel, valor, custo, data_entrada, operacao, proprietario_anterior, vendedor, renavam, chassi, opcionais, observacoes, status } = req.body;
    
    await pool.query(
      `UPDATE veiculos SET modelo=$1, placa=$2, ano=$3, cor=$4, combustivel=$5, valor=$6, custo=$7, data_entrada=$8, operacao=$9, proprietario_anterior=$10, vendedor=$11, renavam=$12, chassi=$13, opcionais=$14, observacoes=$15, status=$16 WHERE id=$17`,
      [modelo, placa, ano, cor, combustivel, valor, custo, data_entrada, operacao, proprietario_anterior, vendedor, renavam, chassi, opcionais, observacoes, status, id]
    );
    res.json({ message: "Veículo atualizado" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

// Excluir Veículo
app.delete('/veiculos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM veiculos WHERE id = $1', [id]);
    res.json({ message: "Veículo excluído" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});