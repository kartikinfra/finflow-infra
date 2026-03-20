const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || "postgres-svc",
  database: process.env.DB_NAME || "finflow",
  user: process.env.DB_USER || "finflow_user",
  password: process.env.DB_PASSWORD || "secret123",
  port: 5432,
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transactions LIMIT 10;");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transactions LIMIT 10;");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.listen(5000, () => {
  console.log("FinFlow backend running on port 5000");
});
