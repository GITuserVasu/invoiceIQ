import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

function databasePath(...parts: string[]): string {
  const fromBackend = path.resolve(process.cwd(), "..", "database", ...parts);
  return fromBackend;
}

function migrationDirectory(): string {
  return process.env.MIGRATIONS_DIR?.trim() || databasePath("migrations");
}

function normalizeMigrationSql(sql: string): string {
  return sql
    .replace(/^\s*BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "");
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query("SELECT to_regclass($1) IS NOT NULL AS exists", [`public.${tableName}`]);
  return result.rows[0]?.exists === true;
}

async function ensureBaseSchema(pool: Pool): Promise<void> {
  if (await tableExists(pool, "tenants")) return;
  const schemaPath = process.env.SCHEMA_FILE?.trim() || databasePath("schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}

async function baselineExistingMigrations(pool: Pool): Promise<void> {
  const knownTables: Array<[string, string]> = [
    ["providers", "002_provider_api_integrations.sql"],
    ["entity_processing_batches", "003_entity_operational_tables.sql"],
    ["ap_invoices", "004_ap_documents_schema.sql"],
  ];
  for (const [table, fileName] of knownTables) {
    if (await tableExists(pool, table)) {
      await pool.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
        [fileName],
      );
    }
  }
  const functionResult = await pool.query(
    `SELECT 1
       FROM pg_proc
       JOIN pg_namespace ns ON ns.oid = pg_proc.pronamespace
      WHERE ns.nspname = 'public' AND proname = 'seed_entity_demo_data'
      LIMIT 1`,
  );
  if (functionResult.rowCount) {
    await pool.query(
      "INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
      ["005_ap_demo_seed_function.sql"],
    );
  }
  const authColumn = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'app_users'
        AND column_name = 'password_hash'`,
  );
  if (authColumn.rowCount) {
    await pool.query(
      "INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING",
      ["006_authentication.sql"],
    );
  }
}

export async function runMigrations(pool: Pool): Promise<void> {
  await ensureBaseSchema(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await baselineExistingMigrations(pool);

  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(migrationDirectory()))
    .filter((fileName) => /^\d+_.+\.sql$/i.test(fileName))
    .sort();
  const applied = await pool.query<{ migration_name: string }>(
    "SELECT migration_name FROM schema_migrations",
  );
  const appliedNames = new Set(applied.rows.map((row) => row.migration_name));

  for (const fileName of files) {
    if (appliedNames.has(fileName)) continue;
    const sql = normalizeMigrationSql(
      await readFile(path.join(migrationDirectory(), fileName), "utf8"),
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
        [fileName],
      );
      await client.query("COMMIT");
      console.log(`[MIGRATION] applied ${fileName}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(
        `Migration ${fileName} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      client.release();
    }
  }
}
