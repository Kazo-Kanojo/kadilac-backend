const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Exemplo de rota para listar carros
app.get('/carros', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM veiculos ORDER BY data_cadastro DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});