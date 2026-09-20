import "dotenv/config";
import { Pool } from "pg";
import { runMigrations } from "./migration-runner.js";

const pool = new Pool({
    host: process.env.PGHOST || "/cloudsql/invoiceiq-508806:us-central1:invoice-iq1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "invoiceiqdb",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "Yahoo4gan@",
});

try {
  await runMigrations(pool);
  console.log("Database migrations complete");
} finally {
  await pool.end();
}
