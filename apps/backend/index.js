const tracing = require("./tracing.js")
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Updated DB config (NO fallback mistakes)
const pool = new Pool({
  host: process.env.DB_HOST || "postgres-db-svc",
  database: process.env.DB_NAME || "kartik_db",
  user: process.env.DB_USER || "kartik",
  password: process.env.DB_PASSWORD || "secret123",
  port: process.env.DB_PORT || 5432,
});

// 🔍 Health check (for probes)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🔍 Readiness check (DB connection)
app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.sendStatus(200);
  } catch (err) {
    console.error("DB NOT READY:", err);
    res.sendStatus(500);
  }
});

// 📦 Get transactions
app.get("/api/transactions", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, amount, description, created_at FROM transactions LIMIT 10;"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("DB ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🧪 Optional root route
app.get("/", (req, res) => {
  res.send("FinFlow backend running 🚀");
});

app.listen(5000, () => {
  console.log("FinFlow backend running on port 5000");
});
