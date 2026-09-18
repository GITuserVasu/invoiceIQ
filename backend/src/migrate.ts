import "dotenv/config";
import { Pool } from "pg";
import { runMigrations } from "./migration-runner.js";

const pool = new Pool({
  host: process.env.PGHOST || "0.0.0.0",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "invoiceiqdb",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || undefined,
});

try {
  await runMigrations(pool);
  console.log("Database migrations complete");
} finally {
  await pool.end();
}
