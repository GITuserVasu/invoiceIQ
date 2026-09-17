import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { Pool, PoolClient } from "pg";
import { createConnectorRoutes } from "./routes/connector.routes.js";
import { createMatchingRoutes } from "./routes/matching.routes.js";
import { createApprovalRoutes } from "./routes/approval.routes.js";
import { createSupplierRoutes } from "./routes/supplier.routes.js";
import { MatchEngine } from "./matching/match.engine.js";
import { DEFAULT_TOLERANCE } from "./matching/match.rules.js";
import { runMigrations } from "./migration-runner.js";
import { OcrWorker } from "./ocr-worker.js";
import { SapScheduler } from "./sap-scheduler.js";
import { requireEntityPermission } from "./auth/rbac.js";

const app = express();
// const port = Number(process.env.PORT || 7070);
const port = Number(process.env.PORT || 8080);

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "lexa_saas",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000
});

type JsonObject = Record<string, unknown>;
type DbConnection = Pool | PoolClient;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type AuthClaims = {
  userId: string | null;
  email: string;
  name: string;
  role: string;
  tenantId: string | null;
  expiresAt: number;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

function authSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be configured in production");
  }
  return "local-development-auth-secret";
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function issueAccessToken(claims: Omit<AuthClaims, "expiresAt">): string {
  const payload = {
    ...claims,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", authSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyAccessToken(token: string): AuthClaims | null {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac("sha256", authSecret()).update(encoded).digest("base64url");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AuthClaims;
    if (!claims.expiresAt || claims.expiresAt < Date.now()) return null;
    if (!claims.email || !claims.role) return null;
    return claims;
  } catch {
    return null;
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, encoded: string | null | undefined): boolean {
  try {
    if (!encoded?.startsWith("scrypt$")) return false;
    const [, salt, expectedHex] = encoded.split("$");
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(password|secret|token|api[_-]?key|authorization)/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitive(child);
    }
  }
  return result;
}

function isConfiguredServiceRequest(req: Request): boolean {
  const configured = (
    process.env.INTERNAL_SERVICE_TOKEN?.trim()
    || process.env.OCR_SERVICE_TOKEN?.trim()
    || ""
  );
  const supplied = req.header("x-service-token")?.trim();
  if (!configured || !supplied) return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(configured);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) {
    throw new HttpError(400, `${label} must be a UUID`);
  }
  return value;
}

function text(value: unknown, label: string, required = true): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) {
    throw new HttpError(400, `${label} is required`);
  }
  return result;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, label: string, fallback?: number): number {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${label} is required`);
  }
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new HttpError(400, `${label} must be a number`);
  }
  return result;
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function actorUserId(req: Request): string | null {
  if (req.auth) return req.auth.userId;
  const value = req.header("x-user-id");
  return value && isUuid(value) ? value : null;
}

function actorHeaders(req: Request): { userId: string | null; email: string; name: string } {
  if (req.auth) {
    return {
      userId: req.auth.userId,
      email: req.auth.email,
      name: req.auth.name
    };
  }
  return {
    userId: actorUserId(req),
    email:  (req.header("x-actor-email") || "").trim().toLowerCase(),
    name:   (req.header("x-actor-name")  || "").trim()
  };
}

async function insertAudit(
  db: DbConnection,
  tenant: string,
  actor: { userId: string | null; email: string; name: string },
  action: string,
  resourceType: string,
  resourceId?: string | null,
  meta: JsonObject = {}
): Promise<void> {
  try {
    let actorId = actor.userId;
    if (!actorId && actor.email) {
      const r = await db.query(
        `INSERT INTO app_users (email, display_name, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (lower(email)) DO UPDATE
           SET display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
               updated_at   = now()
         RETURNING id`,
        [actor.email, actor.name || actor.email.split("@")[0]]
      );
      actorId = (r.rows[0]?.id as string) ?? null;
    }
    const metadata: JsonObject = { ...meta };
    if (actor.email) metadata.actorEmail = actor.email;
    if (actor.name)  metadata.actorName  = actor.name;
    await db.query(
      `INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2::uuid, $3, $4, $5::uuid, $6::jsonb)`,
      [tenant, actorId ?? null, action, resourceType, resourceId ?? null, JSON.stringify(metadata)]
    );
  } catch {
    // Audit failures must never break the main request flow
  }
}

function tenantId(req: Request): string {
  const tenant = requireUuid(req.params.tenantId, "tenantId");
  if (req.auth && !["super_admin", "service"].includes(req.auth.role)
    && req.auth.tenantId !== tenant) {
    throw new HttpError(403, "Tenant access denied");
  }
  return tenant;
}

function requireApOperator(req: Request): void {
  const allowedRoles = new Set(["super_admin", "entity_admin", "finance_controller", "ap_manager"]);
  if (!req.auth || !allowedRoles.has(req.auth.role)) {
    throw new HttpError(403, "AP operation permission required");
  }
}

async function withTransaction<T>(
  tenant: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config($1, $2, true)", ["app.tenant_id", tenant]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/* Resolve a user by full UUID, short display ID (U-XXXXXX), or email */
async function resolveUserId(db: DbConnection, value: string): Promise<string | null> {
  const shortMatch = value.match(/^U-([0-9A-Fa-f]{6,8})$/i);
  if (shortMatch) {
    const r = await db.query(
      `SELECT id FROM app_users WHERE id::text ILIKE $1 || '%' LIMIT 1`,
      [shortMatch[1]]
    );
    return (r.rows[0]?.id as string) ?? null;
  }
  const r = await db.query(
    `SELECT id FROM app_users WHERE id::text = $1 OR lower(email) = lower($1) LIMIT 1`,
    [value]
  );
  return (r.rows[0]?.id as string) ?? null;
}

async function resolveEntityUserId(
  db: DbConnection,
  tenant: string,
  entity: string,
  value: string
): Promise<string | null> {
  const resolved = await resolveUserId(db, value);
  if (resolved) {
    const membership = await db.query(
      `SELECT u.id
         FROM app_users u
         JOIN entity_memberships m ON m.user_id = u.id
        WHERE m.tenant_id = $1 AND m.entity_id = $2
          AND m.status != 'removed' AND u.id = $3
        LIMIT 1`,
      [tenant, entity, resolved]
    );
    if (membership.rows[0]) return membership.rows[0].id as string;
  }

  const legacyMatch = value.match(/^U-(\d{3})$/i);
  if (!legacyMatch) return null;
  const ordinal = Number(legacyMatch[1]);
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;

  const result = await db.query(
    `SELECT u.id
       FROM app_users u
       JOIN entity_memberships m ON m.user_id = u.id
      WHERE m.tenant_id = $1 AND m.entity_id = $2
        AND m.status != 'removed'
      ORDER BY m.created_at, m.id
      OFFSET $3 LIMIT 1`,
    [tenant, entity, ordinal - 1]
  );
  return (result.rows[0]?.id as string) ?? null;
}

async function resolveEntityId(db: DbConnection, tenant: string, value: unknown): Promise<string> {
  const entityValue = text(value, "entityId");
  const result = await db.query(
    `SELECT id
       FROM entities
      WHERE tenant_id = $1
        AND (id::text = $2 OR entity_key = $2)
      LIMIT 1`,
    [tenant, entityValue]
  );
  if (!result.rows[0]) {
    throw new HttpError(404, `Entity ${entityValue} was not found`);
  }
  return result.rows[0].id as string;
}

async function resolveRoleId(
  db: DbConnection,
  tenant: string,
  roleKey: unknown
): Promise<string | null> {
  if (roleKey === undefined || roleKey === null || roleKey === "") return null;
  const result = await db.query(
    "SELECT id FROM roles WHERE tenant_id = $1 AND role_key = $2 AND is_active = true",
    [tenant, text(roleKey, "roleKey")]
  );
  if (!result.rows[0]) {
    throw new HttpError(400, `Role ${String(roleKey)} was not found`);
  }
  return result.rows[0].id as string;
}

async function resolvePromptVersion(
  db: DbConnection,
  tenant: string,
  versionTag: unknown
): Promise<string | null> {
  if (versionTag === undefined || versionTag === null || versionTag === "") return null;
  const result = await db.query(
    `SELECT pv.id, pv.lifecycle_status
       FROM prompt_versions pv
       JOIN prompt_templates pt ON pt.id = pv.template_id
      WHERE pv.tenant_id = $1
        AND pv.version_tag = $2
      ORDER BY pv.created_at DESC
      LIMIT 1`,
    [tenant, text(versionTag, "prompt version")]
  );
  if (!result.rows[0]) {
    throw new HttpError(400, `Prompt version ${String(versionTag)} was not found`);
  }
  if (result.rows[0].lifecycle_status !== "approved") {
    throw new HttpError(400, `Prompt version ${String(versionTag)} is not approved`);
  }
  return result.rows[0].id as string;
}

function buildIntakeSettings(body: JsonObject, channel: string): JsonObject {
  const intakeConfig = (body.intakeConfig || {}) as JsonObject;
  const config = (intakeConfig[channel] || {}) as JsonObject;
  if (channel === "mail") {
    return {
      provider: config.provider || "gmail",
      mailbox: config.mailbox || "",
      username: config.username || "",
      folder: config.folder || "inbox",
      sync_frequency: config.syncFrequency || "every_5_minutes",
      connection_status: "Not connected"
    };
  }
  if (channel === "upload") {
    return {
      max_file_size: config.maxFileSize || "10mb",
      accepted_formats: config.acceptedFormats
        ? arrayValue(config.acceptedFormats)
        : ["pdf", "xml", "jpg", "png"]
    };
  }
  if (channel === "vendor") {
    return {
      portal_url: config.portalUrl || "",
      auto_approve: booleanValue(config.autoApprove, false)
    };
  }
  return {
    endpoint: config.endpoint || "",
    client_id: config.clientId || "",
    document_types: config.docTypes ? arrayValue(config.docTypes) : ["invoices", "po", "grn"]
  };
}

function configuredClasses(body: JsonObject): Array<JsonObject> {
  const supplied = Array.isArray(body.classes)
    ? body.classes
    : arrayValue(body.classLabels).map((classKey, index) => ({
        classKey,
        priority: index + 1,
        minConfidencePct: 90,
        routingKey: "extraction_workflow",
        status: "active",
        isFallback: false
      }));

  return supplied.map((item, index) => {
    const source = typeof item === "string" ? { classKey: item } : (item as JsonObject);
    const classKey = text(source.classKey || source.key, "classKey");
    return {
      classKey,
      priority: numberValue(source.priority, "priority", index + 1),
      minConfidencePct: numberValue(source.minConfidencePct, "minConfidencePct", 90),
      routingKey: text(source.routingKey, "routingKey", false) || "extraction_workflow",
      status: text(source.status, "status", false) || "active",
      isFallback: booleanValue(source.isFallback, false),
      metadata: source.metadata || {}
    };
  });
}

function classificationGuess(sample: string): string {
  const value = sample.toLowerCase();
  if (value.includes("invoice")) return "invoice";
  if (value.includes("remittance") || value.includes("payment") || value.includes("settlement")) {
    return "remittance";
  }
  if (value.includes("pod") || value.includes("delivery")) return "proof_of_delivery";
  if (value.includes("purchase order") || value.includes(" po ")) return "purchase_order";
  if (value.includes("debit note")) return "debit_note";
  if (value.includes("credit note")) return "credit_note";
  if (value.includes("bank statement")) return "bank_statement";
  return "unknown";
}

const configuredCorsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    const localDevelopmentOrigin = !origin
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    callback(null, localDevelopmentOrigin || configuredCorsOrigins.includes(origin));
  }
}));

// Added by Vasu
// Serve static files from the public folder
// '../public' climbs out of your backend 'dist' folder into the runtime public folder
app.use(express.static(path.join(import.meta.dirname, '../public')));

// Wildcard fallback to let Angular handle UI routing
app.get('/:splat*', (req, res) => {
    res.sendFile(path.join(import.meta.dirname, '../public', 'index.html'));
});

// end of Vasu addition

app.use(express.json({ limit: "70mb" }));

app.use((req, res, next) => {
  if (
    req.path === "/health"
    || req.path === "/api/v1/auth/login"
    || req.path === "/api/v1/supplier/auth/login"
  ) {
    next();
    return;
  }

  if (isConfiguredServiceRequest(req)) {
    req.auth = {
      userId: null,
      email: "ocr-service@system",
      name: "OCR Service",
      role: "service",
      tenantId: null,
      expiresAt: Date.now() + 60 * 60 * 1000
    };
    next();
    return;
  }

  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.auth = claims;
  next();
});

app.get("/health", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT current_database() AS database, now() AS time");
    res.json({ status: "ok", database: result.rows[0].database, time: result.rows[0].time });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/catalogs", async (_req, res, next) => {
  try {
    const [industries, regions, channels, documentTypes, sources, modules, roles, models, classificationModels] =
      await Promise.all([
        pool.query("SELECT * FROM industry_catalog WHERE is_active ORDER BY sort_order"),
        pool.query("SELECT * FROM region_catalog WHERE is_active ORDER BY sort_order"),
        pool.query("SELECT * FROM intake_channel_catalog WHERE is_active ORDER BY sort_order"),
        pool.query("SELECT * FROM document_type_catalog WHERE is_active ORDER BY sort_order"),
        pool.query("SELECT * FROM source_catalog WHERE is_active ORDER BY sort_order"),
        pool.query("SELECT * FROM module_catalog WHERE is_active ORDER BY sort_order"),
        pool.query("SELECT * FROM role_catalog WHERE is_active ORDER BY label"),
        pool.query("SELECT * FROM model_catalog WHERE is_active ORDER BY display_name"),
        pool.query("SELECT * FROM classification_model_catalog WHERE is_active ORDER BY display_name")
      ]);
    res.json({
      industries: industries.rows,
      regions: regions.rows,
      intakeChannels: channels.rows,
      documentTypes: documentTypes.rows,
      sources: sources.rows,
      modules: modules.rows,
      roles: roles.rows,
      models: models.rows,
      classificationModels: classificationModels.rows
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/providers", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT p.*,
              count(DISTINCT pea.id)::int AS assignment_count
         FROM providers p
         LEFT JOIN provider_entity_assignments pea ON pea.provider_id = p.id
        WHERE p.tenant_id = $1
        GROUP BY p.id
        ORDER BY p.name`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/providers", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actor = actorHeaders(req);
    const providerKey = text(body.providerKey, "providerKey", false) || text(body.name, "name").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const vaultRef = text(body.vaultRef, "vaultRef");
    const result = await withTransaction(tenant, async (client) => {
      await client.query(
        `INSERT INTO secret_references (tenant_id, provider, secret_ref, secret_type, metadata)
         VALUES ($1, $2, $3, 'api_key', $4::jsonb)
         ON CONFLICT (tenant_id, secret_ref) DO NOTHING`,
        [tenant, text(body.name, "name"), vaultRef, JSON.stringify({ configured: Boolean(body.apiKey) })]
      );
      const provider = await client.query(
        `INSERT INTO providers (
           tenant_id, provider_key, name, provider_type, base_url, vault_ref, secret_reference_id, status, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6,
                 (SELECT id FROM secret_references WHERE tenant_id = $1 AND secret_ref = $7),
                 $8, $9)
         ON CONFLICT (tenant_id, provider_key) DO UPDATE
           SET name = EXCLUDED.name,
               provider_type = EXCLUDED.provider_type,
               base_url = EXCLUDED.base_url,
               vault_ref = EXCLUDED.vault_ref,
               status = EXCLUDED.status,
               notes = EXCLUDED.notes,
               updated_at = now()
         RETURNING *`,
        [
          tenant,
          providerKey,
          text(body.name, "name"),
          text(body.providerType, "providerType", false) || "LLM API",
          text(body.baseUrl, "baseUrl"),
          vaultRef,
          vaultRef,
          text(body.status, "status", false) || "Pilot",
          text(body.notes, "notes", false) || null
        ]
      );
      await insertAudit(client, tenant, actor, "provider.registered", "provider", provider.rows[0].id,
        { providerKey: provider.rows[0].provider_key, providerName: provider.rows[0].name, providerType: provider.rows[0].provider_type }
      );
      return provider.rows[0];
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/provider-assignments", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const result = await pool.query(
      `SELECT pea.*, p.provider_key, p.name AS provider_name, p.provider_type,
              e.entity_key, e.name AS entity_name
         FROM provider_entity_assignments pea
         JOIN providers p ON p.id = pea.provider_id
         JOIN entities e ON e.id = pea.entity_id
        WHERE pea.tenant_id = $1 AND pea.entity_id = $2
        ORDER BY p.name, pea.use_case`,
      [tenant, entity]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/provider-assignments", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actor = actorHeaders(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const providerKey = text(body.providerKey, "providerKey");
    const result = await withTransaction(tenant, async (client) => {
      const provider = await client.query(
        "SELECT id FROM providers WHERE tenant_id = $1 AND provider_key = $2",
        [tenant, providerKey]
      );
      if (!provider.rows[0]) throw new HttpError(400, `Provider ${providerKey} was not found`);
      const assignment = await client.query(
        `INSERT INTO provider_entity_assignments (
           tenant_id, provider_id, entity_id, use_case, rollout_mode, owner_name, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (entity_id, provider_id, use_case) DO UPDATE
           SET rollout_mode = EXCLUDED.rollout_mode,
               owner_name = EXCLUDED.owner_name,
               status = EXCLUDED.status,
               updated_at = now()
         RETURNING *`,
        [
          tenant,
          provider.rows[0].id,
          entity,
          text(body.useCase, "useCase"),
          text(body.rolloutMode, "rolloutMode", false) || "Pilot",
          text(body.ownerName, "ownerName"),
          text(body.status, "status", false) || "Pilot"
        ]
      );
      await insertAudit(client, tenant, actor, "provider.assigned", "provider", provider.rows[0].id,
        { providerKey, entityId: entity, useCase: body.useCase, rolloutMode: body.rolloutMode || "Pilot", ownerName: body.ownerName }
      );
      return assignment.rows[0];
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/api-connections", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const result = await pool.query(
      `SELECT ac.*,
              CASE WHEN eaa.api_connection_id IS NULL THEN false ELSE eaa.is_enabled END AS assigned
         FROM api_connections ac
         LEFT JOIN entity_api_assignments eaa
           ON eaa.api_connection_id = ac.id AND eaa.entity_id = $2
        WHERE ac.tenant_id = $1
          AND (ac.entity_id IS NULL OR ac.entity_id = $2)
        ORDER BY ac.category, ac.name`,
      [tenant, entity]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/api-connections", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const apiKey = text(body.apiKey, "apiKey", false) || text(body.name, "name").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const vaultRef = text(body.vaultRef, "vaultRef", false) || `kv://api/${apiKey}`;
    const result = await withTransaction(tenant, async (client) => {
      await client.query(
        `INSERT INTO secret_references (tenant_id, provider, secret_ref, secret_type, metadata)
         VALUES ($1, $2, $3, 'api_key', $4::jsonb)
         ON CONFLICT (tenant_id, secret_ref) DO NOTHING`,
        [tenant, text(body.provider, "provider"), vaultRef, JSON.stringify({ configured: Boolean(body.apiSecret) })]
      );
      const connection = await client.query(
        `INSERT INTO api_connections (
           tenant_id, entity_id, api_key, name, category, provider, base_url,
           environment, client_id, secret_reference_id, timeout_ms, notes, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 (SELECT id FROM secret_references WHERE tenant_id = $1 AND secret_ref = $10),
                 $11, $12, $13)
         ON CONFLICT (tenant_id, entity_id, api_key) DO UPDATE
           SET name = EXCLUDED.name,
               category = EXCLUDED.category,
               provider = EXCLUDED.provider,
               base_url = EXCLUDED.base_url,
               environment = EXCLUDED.environment,
               client_id = EXCLUDED.client_id,
               secret_reference_id = EXCLUDED.secret_reference_id,
               timeout_ms = EXCLUDED.timeout_ms,
               notes = EXCLUDED.notes,
               status = EXCLUDED.status,
               updated_at = now()
         RETURNING *`,
        [
          tenant,
          entity,
          apiKey,
          text(body.name, "name"),
          text(body.category, "category", false) || "other",
          text(body.provider, "provider"),
          text(body.baseUrl, "baseUrl", false) || null,
          text(body.environment, "environment", false) || "sandbox",
          text(body.clientId, "clientId", false) || null,
          vaultRef,
          numberValue(body.timeoutMs, "timeoutMs", 5000),
          text(body.notes, "notes", false) || null,
          text(body.status, "status", false) || "pending"
        ]
      );
      await client.query(
        `INSERT INTO api_connection_events (tenant_id, api_connection_id, event_type, status, actor_user_id, metadata)
         VALUES ($1, $2, 'created', $3, $4, $5::jsonb)`,
        [tenant, connection.rows[0].id, connection.rows[0].status, actor, JSON.stringify({ source: "api" })]
      );
      await insertAudit(client, tenant, actorInfo, "api_connection.created", "api_connection", connection.rows[0].id,
        { apiKey: connection.rows[0].api_key, apiName: connection.rows[0].name, category: connection.rows[0].category, entityId: entity }
      );
      return connection.rows[0];
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/api-connections/test", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const apiKey = text(body.apiKey, "apiKey");
    const connection = await pool.query(
      "SELECT id, name, environment FROM api_connections WHERE tenant_id = $1 AND entity_id = $2 AND api_key = $3",
      [tenant, entity, apiKey]
    );
    if (!connection.rows[0]) throw new HttpError(404, "API connection was not found");
    const responseMs = Math.floor(Math.random() * 400) + 200;
    const status = connection.rows[0].environment === "production" ? "active" : "sandbox";
    await withTransaction(tenant, async (client) => {
      await client.query(
        `UPDATE api_connections
            SET status = $1, last_tested_at = now(), avg_response_ms = $2,
                success_rate_pct = 99.0, updated_at = now()
          WHERE id = $3 AND tenant_id = $4`,
        [status, responseMs, connection.rows[0].id, tenant]
      );
      await client.query(
        `INSERT INTO api_connection_events (tenant_id, api_connection_id, event_type, status, response_ms, actor_user_id, metadata)
         VALUES ($1, $2, 'tested', $3, $4, $5, $6::jsonb)`,
        [tenant, connection.rows[0].id, status, responseMs, actor, JSON.stringify({ source: "api" })]
      );
      await insertAudit(client, tenant, actorInfo, "api_connection.tested", "api_connection", connection.rows[0].id,
        { apiName: connection.rows[0].name, environment: connection.rows[0].environment, responseMs, status, entityId: entity }
      );
    });
    res.json({ status: "success", api: connection.rows[0].name, environment: connection.rows[0].environment, code: 200, responseMs });
  } catch (error) {
    next(error);
  }
});

app.put("/api/v1/tenants/:tenantId/entities/:entityId/api-assignments", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actor = actorHeaders(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const apiKeys = arrayValue(body.apiKeys);
    const result = await withTransaction(tenant, async (client) => {
      await client.query("DELETE FROM entity_api_assignments WHERE tenant_id = $1 AND entity_id = $2", [tenant, entity]);
      for (const apiKey of apiKeys) {
        const connection = await client.query(
          "SELECT id FROM api_connections WHERE tenant_id = $1 AND (entity_id IS NULL OR entity_id = $2) AND api_key = $3",
          [tenant, entity, apiKey]
        );
        if (!connection.rows[0]) continue;
        await client.query(
          `INSERT INTO entity_api_assignments (tenant_id, entity_id, api_connection_id, is_enabled)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (entity_id, api_connection_id) DO UPDATE SET is_enabled = true, assigned_at = now()`,
          [tenant, entity, connection.rows[0].id]
        );
      }
      const saved = await client.query(
        `SELECT ac.api_key, ac.name, ac.category, ac.status
           FROM entity_api_assignments eaa
           JOIN api_connections ac ON ac.id = eaa.api_connection_id
          WHERE eaa.tenant_id = $1 AND eaa.entity_id = $2 AND eaa.is_enabled
          ORDER BY ac.name`,
        [tenant, entity]
      );
      await insertAudit(client, tenant, actor, "api_assignment.saved", "entity", entity,
        { entityId: entity, assignedApiKeys: apiKeys, count: apiKeys.length }
      );
      return saved;
    });
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants", async (req, res, next) => {
  try {
    const tenantKey = typeof req.query.tenantKey === "string" ? req.query.tenantKey : null;
    const scopedTenant = req.auth && !["super_admin", "service"].includes(req.auth.role)
      ? req.auth.tenantId
      : null;
    const result = await pool.query(
      `SELECT id, tenant_key, name, status, created_at, updated_at
         FROM tenants
        WHERE ($1::text IS NULL OR tenant_key = $1)
          AND ($2::uuid IS NULL OR id = $2)
        ORDER BY name`,
      [tenantKey, scopedTenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants", async (req, res, next) => {
  try {
    const tenantKey = text(req.body.tenantKey, "tenantKey");
    const name = text(req.body.name, "name");
    const result = await pool.query(
      `INSERT INTO tenants (tenant_key, name)
       VALUES ($1, $2)
       RETURNING *`,
      [tenantKey, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT e.*,
              s.accounts_payable_enabled,
              s.accounts_receivable_enabled,
              s.default_role_key,
              s.rbac_enabled,
              s.primary_admin_email,
              s.primary_admin_username,
              COALESCE(
                (
                  SELECT array_agg(c.channel_key ORDER BY c.channel_key)
                    FROM entity_intake_channels c
                   WHERE c.entity_id = e.id
                     AND c.tenant_id = e.tenant_id
                     AND c.is_enabled
                ),
                ARRAY[]::text[]
              ) AS intake_modes,
              (
                SELECT COUNT(*)::int
                  FROM entity_memberships m
                 WHERE m.entity_id = e.id
                   AND m.status = 'active'
              ) AS user_count
         FROM entities e
         LEFT JOIN entity_settings s ON s.entity_id = e.id
        WHERE e.tenant_id = $1
        ORDER BY e.created_at DESC`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const [profile, settings, intake, matching, modules, roles, assignments, classification] = await Promise.all([
      pool.query("SELECT * FROM entities WHERE id = $1 AND tenant_id = $2", [entity, tenant]),
      pool.query("SELECT * FROM entity_settings WHERE entity_id = $1 AND tenant_id = $2", [entity, tenant]),
      pool.query("SELECT * FROM entity_intake_channels WHERE entity_id = $1 AND tenant_id = $2 ORDER BY channel_key", [entity, tenant]),
      pool.query("SELECT * FROM entity_matching_policies WHERE entity_id = $1 AND tenant_id = $2", [entity, tenant]),
      pool.query("SELECT * FROM entity_modules WHERE entity_id = $1 AND tenant_id = $2 ORDER BY module_key", [entity, tenant]),
      pool.query(
        `SELECT er.*, r.role_key, r.label, r.scope_type
           FROM entity_roles er
           JOIN roles r ON r.id = er.role_id
          WHERE er.entity_id = $1 AND er.tenant_id = $2
          ORDER BY r.label`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT ma.*, e.entity_key, e.name AS entity_name, mc.display_name AS model_name,
                current_pv.version_tag AS current_prompt,
                target_pv.version_tag AS target_prompt,
                owner_role.label AS owner_role
           FROM model_assignments ma
           JOIN entities e ON e.id = ma.entity_id
           JOIN model_catalog mc ON mc.id = ma.model_id
           LEFT JOIN prompt_versions current_pv ON current_pv.id = ma.current_prompt_version_id
           LEFT JOIN prompt_versions target_pv ON target_pv.id = ma.target_prompt_version_id
           LEFT JOIN roles owner_role ON owner_role.id = ma.owner_role_id
          WHERE ma.entity_id = $1 AND ma.tenant_id = $2
          ORDER BY ma.created_at DESC`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT cm.*, cmc.model_key, cmc.display_name AS model_name
           FROM classification_mappings cm
           JOIN classification_model_catalog cmc ON cmc.id = cm.classification_model_id
          WHERE cm.entity_id = $1 AND cm.tenant_id = $2
          ORDER BY cm.version_no DESC`,
        [entity, tenant]
      )
    ]);
    if (!profile.rows[0]) throw new HttpError(404, "Entity was not found");
    res.json({
      entity: profile.rows[0],
      settings: settings.rows[0] || null,
      intakeChannels: intake.rows,
      matchingPolicy: matching.rows[0] || null,
      modules: modules.rows,
      roles: roles.rows,
      assignments: assignments.rows,
      classifications: classification.rows
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/v1/tenants/:tenantId/entities/:entityId", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const entityRow = await pool.query("SELECT entity_key, name FROM entities WHERE id=$1", [entity]);
    await pool.query(
      "UPDATE entities SET status = 'archived', updated_at = now() WHERE id = $1 AND tenant_id = $2",
      [entity, tenant]
    );
    const ek = entityRow.rows[0];
    await insertAudit(pool, tenant, actorHeaders(req), "entity.archived", "entity", entity,
      { entityId: ek?.entity_key, module: "Entity Management", target: ek?.entity_key || entity, severity: "high", result: "success", before: "Status: Active", after: "Status: Archived", traceId: "TRC-" + entity.slice(0,8).toUpperCase() });
    res.json({ success: true, message: "Entity archived successfully" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/dashboard", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["entity.read"]);
    const [profile, settings, intake, matching, roles, assignments, classifications, providers, providerAssignments, apiConnections] = await Promise.all([
      pool.query("SELECT * FROM entities WHERE id = $1 AND tenant_id = $2", [entity, tenant]),
      pool.query("SELECT * FROM entity_settings WHERE entity_id = $1 AND tenant_id = $2", [entity, tenant]),
      pool.query("SELECT * FROM entity_intake_channels WHERE entity_id = $1 AND tenant_id = $2 ORDER BY channel_key", [entity, tenant]),
      pool.query("SELECT * FROM entity_matching_policies WHERE entity_id = $1 AND tenant_id = $2", [entity, tenant]),
      pool.query(
        `SELECT er.*, r.role_key, r.label, r.scope_type
           FROM entity_roles er
           JOIN roles r ON r.id = er.role_id
          WHERE er.entity_id = $1 AND er.tenant_id = $2
          ORDER BY r.label`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT ma.*, mc.display_name AS model_name,
                current_pv.version_tag AS current_prompt,
                target_pv.version_tag AS target_prompt,
                owner_role.label AS owner_role
           FROM model_assignments ma
           JOIN model_catalog mc ON mc.id = ma.model_id
           LEFT JOIN prompt_versions current_pv ON current_pv.id = ma.current_prompt_version_id
           LEFT JOIN prompt_versions target_pv ON target_pv.id = ma.target_prompt_version_id
           LEFT JOIN roles owner_role ON owner_role.id = ma.owner_role_id
          WHERE ma.entity_id = $1 AND ma.tenant_id = $2
          ORDER BY ma.created_at DESC`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT cm.*, cmc.model_key, cmc.display_name AS model_name
           FROM classification_mappings cm
           JOIN classification_model_catalog cmc ON cmc.id = cm.classification_model_id
          WHERE cm.entity_id = $1 AND cm.tenant_id = $2
          ORDER BY cm.version_no DESC`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT p.id, p.provider_key, p.name, p.provider_type, p.status,
                count(DISTINCT pea.id)::int AS assignment_count
           FROM providers p
           LEFT JOIN provider_entity_assignments pea ON pea.provider_id = p.id
          WHERE p.tenant_id = $1
          GROUP BY p.id
          ORDER BY p.name`,
        [tenant]
      ),
      pool.query(
        `SELECT pea.*, p.provider_key, p.name AS provider_name, p.provider_type
           FROM provider_entity_assignments pea
           JOIN providers p ON p.id = pea.provider_id
          WHERE pea.tenant_id = $1 AND pea.entity_id = $2
          ORDER BY p.name, pea.use_case`,
        [tenant, entity]
      ),
      pool.query(
        `SELECT ac.id, ac.api_key, ac.name, ac.category, ac.provider, ac.environment,
                ac.status, ac.last_tested_at, ac.avg_response_ms, ac.success_rate_pct,
                CASE WHEN eaa.api_connection_id IS NULL THEN false ELSE eaa.is_enabled END AS assigned
           FROM api_connections ac
           LEFT JOIN entity_api_assignments eaa
             ON eaa.api_connection_id = ac.id AND eaa.entity_id = $2
          WHERE ac.tenant_id = $1
            AND (ac.entity_id IS NULL OR ac.entity_id = $2)
          ORDER BY ac.category, ac.name`,
        [tenant, entity]
      )
    ]);
    if (!profile.rows[0]) throw new HttpError(404, "Entity was not found");
    const enabledModules = await pool.query(
      "SELECT module_key, is_enabled, settings FROM entity_modules WHERE tenant_id = $1 AND entity_id = $2 ORDER BY module_key",
      [tenant, entity]
    );
    res.json({
      entity: profile.rows[0],
      settings: settings.rows[0] || null,
      intakeChannels: intake.rows,
      matchingPolicy: matching.rows[0] || null,
      roles: roles.rows,
      assignments: assignments.rows,
      classifications: classifications.rows,
      modules: enabledModules.rows,
      providers: providers.rows,
      providerAssignments: providerAssignments.rows,
      apiConnections: apiConnections.rows,
      summary: {
        roleCount: roles.rows.length,
        modelAssignmentCount: assignments.rows.length,
        classificationCount: classifications.rows.length,
        providerCount: providers.rows.length,
        providerAssignmentCount: providerAssignments.rows.length,
        apiConnectionCount: apiConnections.rows.length,
        enabledIntakeCount: intake.rows.filter((row) => row.is_enabled).length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/command-center", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["entity.read"]);
    const [invoices, transactions, exceptions, approvals, activity, summary] = await Promise.all([
      pool.query(
        `SELECT id, invoice_key, vendor_name, gstin, amount_num, po_ref, grn_ref,
                match_status, variance_amount, invoice_date, data, created_at
           FROM entity_invoices
          WHERE entity_id = $1 AND tenant_id = $2
          ORDER BY invoice_date DESC NULLS LAST, created_at DESC`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT id, batch_id, document_type, source_channel, pdf_count, page_count,
                active_step, completed_steps, status, stop_reason, uploaded_at, data
           FROM entity_processing_batches
          WHERE entity_id = $1 AND tenant_id = $2
          ORDER BY uploaded_at DESC`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT id, exception_key, title, invoice_ref, severity, status, reason_code,
                amount_num, owner_name, backup_name, sla_minutes, data, created_at, updated_at
           FROM entity_exceptions
          WHERE entity_id = $1 AND tenant_id = $2
          ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                                WHEN 'medium' THEN 3 ELSE 4 END,
                   created_at DESC`,
        [entity, tenant]
      ),
      pool.query(
        `SELECT a.*, i.invoice_number, i.total_amount, i.currency,
                v.legal_name AS vendor_name
           FROM ap_invoice_approvals a
           JOIN ap_invoices i ON i.id = a.invoice_id
           LEFT JOIN ap_vendors v ON v.id = i.vendor_id
          WHERE a.tenant_id = $1 AND a.entity_id = $2
            AND a.status = 'pending'
          ORDER BY a.due_by NULLS LAST, a.created_at DESC`,
        [tenant, entity]
      ),
      pool.query(
        `SELECT ae.id, ae.action, ae.resource_type, ae.resource_id,
                ae.metadata, ae.occurred_at, ae.actor_user_id,
                COALESCE(u.email, ae.metadata->>'actorEmail') AS actor_email,
                COALESCE(u.display_name, ae.metadata->>'actorName',
                         u.email, ae.metadata->>'actorEmail') AS actor_name
           FROM audit_events ae
           LEFT JOIN app_users u ON u.id = ae.actor_user_id
          WHERE ae.tenant_id = $1
            AND (ae.resource_id = $2
                 OR ae.metadata->>'entityId' = (
                   SELECT entity_key FROM entities WHERE id = $2 AND tenant_id = $1
                 ))
          ORDER BY ae.occurred_at DESC
          LIMIT 8`,
        [tenant, entity]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_invoices,
           COUNT(*) FILTER (WHERE match_status = 'matched')::int AS matched,
           COUNT(*) FILTER (WHERE match_status IN ('partial','partially_matched','under_review'))::int AS in_review,
           COUNT(*) FILTER (WHERE match_status IN ('unmatched','disputed','rejected'))::int AS unmatched,
           COALESCE(SUM(amount_num) FILTER (WHERE match_status NOT IN ('rejected','cancelled')), 0)::float8 AS total_value,
           ROUND(100.0 * COUNT(*) FILTER (WHERE match_status = 'matched') / NULLIF(COUNT(*), 0), 2)::float8 AS auto_match_rate_pct
         FROM entity_invoices
        WHERE entity_id = $1 AND tenant_id = $2`,
        [entity, tenant]
      )
    ]);

    const invoiceRows = invoices.rows;
    const transactionRows = transactions.rows;
    const exceptionRows = exceptions.rows;
    const approvalRows = approvals.rows;
    const openExceptions = exceptionRows.filter((row) => !['resolved', 'closed'].includes(String(row.status).toLowerCase()));
    const processingTransactions = transactionRows.filter((row) => ['processing', 'failed', 'stopped'].includes(String(row.status).toLowerCase())).length;
    const baseSummary = summary.rows[0] || {};
    const totalInvoices = Number(baseSummary.total_invoices || 0) || transactionRows.length;
    const reviewCount = Number(baseSummary.in_review || 0) + processingTransactions;
    const blockedCount = Number(baseSummary.unmatched || 0);
    const registryCount = Number(baseSummary.matched || 0);
    const holdValue = openExceptions.reduce((total, row) => total + Number(row.amount_num || 0), 0);
    const touchlessRate = baseSummary.auto_match_rate_pct == null
      ? null
      : Number(baseSummary.auto_match_rate_pct);

    res.json({
      data: {
        updatedAt: new Date().toISOString(),
        summary: {
          totalInvoices,
          touchlessRatePct: touchlessRate,
          needsAction: openExceptions.length + approvalRows.length,
          holdValue,
          registryCount,
          reviewCount,
          blockedCount,
          approvalCount: approvalRows.length,
          totalValue: Number(baseSummary.total_value || 0)
        },
        invoices: invoiceRows,
        transactions: transactionRows,
        exceptions: exceptionRows,
        approvals: approvalRows,
        activity: activity.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/menu", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const requestedUserId = actorUserId(req) || (isUuid(req.query.userId) ? req.query.userId : null);
    const requestedEmail = typeof req.query.userEmail === "string" ? req.query.userEmail.trim().toLowerCase() : "";
    const [settingsResult, modulesResult, membershipRoles] = await Promise.all([
      pool.query(
        "SELECT default_role_key, accounts_payable_enabled, accounts_receivable_enabled FROM entity_settings WHERE tenant_id = $1 AND entity_id = $2",
        [tenant, entity]
      ),
      pool.query(
        "SELECT module_key, is_enabled FROM entity_modules WHERE tenant_id = $1 AND entity_id = $2",
        [tenant, entity]
      ),
      pool.query(
        `SELECT r.role_key, rp.permission_key
           FROM entity_memberships em
           JOIN app_users u ON u.id = em.user_id
           JOIN entity_membership_roles emr ON emr.entity_membership_id = em.id
           JOIN roles r ON r.id = emr.role_id AND r.is_active
           JOIN role_permissions rp ON rp.role_id = r.id
          WHERE em.tenant_id = $1
            AND em.entity_id = $2
            AND em.status = 'active'
            AND ($3::uuid IS NOT NULL AND u.id = $3::uuid
                 OR $4 <> '' AND lower(u.email) = $4)`,
        [tenant, entity, requestedUserId, requestedEmail]
      )
    ]);
    const settings = settingsResult.rows[0] || {};
    const modules = Object.fromEntries(modulesResult.rows.map((row) => [row.module_key, row.is_enabled]));
    let accessRows = membershipRoles.rows;
    let accessSource = "membership";
    const useEntityDefault = !requestedUserId && (!requestedEmail || requestedEmail === "super.admin@company.com");
    if (!accessRows.length && useEntityDefault) {
      accessSource = "entity-default";
      const fallback = await pool.query(
        `SELECT r.role_key, rp.permission_key
           FROM roles r
           JOIN role_permissions rp ON rp.role_id = r.id
          WHERE r.tenant_id = $1
            AND r.is_active
            AND r.role_key = $2`,
        [tenant, settings.default_role_key || "entity_admin"]
      );
      accessRows = fallback.rows;
    }
    const permissions = [...new Set(accessRows.map((row) => row.permission_key))];
    const has = (permission: string) => permissions.includes(permission);
    const canViewAp = has("ap.process") || has("ap.read");
    const canViewAr = has("ar.process") || has("ar.read");
    const menu = [
      { key: "dashboard", label: "Dashboard", path: "/entity-dashboard", permission: "entity.read", visible: has("entity.read") },
      { key: "reconciliation", label: "Reconciliation", path: "/reconciliation", permission: "ap.process|ar.process|ap.read|ar.read", visible: canViewAp || canViewAr },
      { key: "exceptions", label: "Exception Queue", path: "/exception-queue", permission: "ap.process|ar.process|ap.read|ar.read", visible: canViewAp || canViewAr },
      { key: "transactions", label: "Transactions", path: "/transactions", permission: "ap.process|ar.process|ap.read|ar.read", visible: canViewAp || canViewAr },
      { key: "audit", label: "Audit Log", path: "/audit-logs", permission: "reports.read", visible: has("reports.read") },
      { key: "users", label: "User List", path: "/user-management", permission: "users.manage", visible: has("users.manage") && Boolean(modules.user_access ?? true) },
      { key: "classification", label: "Classification", path: "/document-classification", permission: "classification.manage", visible: has("classification.manage") && Boolean(modules.classification ?? true) },
      { key: "extraction", label: "Extraction", path: "/models-quality", permission: "models.manage", visible: has("models.manage") && Boolean(modules.models ?? true) },
      { key: "connectors", label: "Connectors", path: "/data-connectors", permission: "providers.manage", visible: has("providers.manage") }
    ].filter((item) => item.visible);
    res.json({
      entityId: req.params.entityId,
      userId: requestedUserId,
      userEmail: requestedEmail || null,
      accessSource,
      roles: [...new Set(accessRows.map((row) => row.role_key))],
      permissions,
      menu
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actor = actorUserId(req);
    const entityData = (body.entity || body) as JsonObject;
    const access = (body.access || {}) as JsonObject;
    const scope = (body.projectScope || {}) as JsonObject;
    const matching = (body.matchingPolicy || {}) as JsonObject;
    const modules = (body.modules || {}) as JsonObject;
    const channels = arrayValue(body.intakeModes);
    const operation = text(body.operation, "operation", false) || "create";
    const adminPassword = text(access.adminPassword, "adminPassword", false);

    if (!channels.length) throw new HttpError(400, "At least one intake mode is required");
    if (!["create", "update"].includes(operation)) throw new HttpError(400, "operation must be create or update");
    if (operation === "create" && adminPassword.length < 8) {
      throw new HttpError(400, "adminPassword must be at least 8 characters");
    }
    const result = await withTransaction(tenant, async (client) => {
      const requestedEntityKey = text(entityData.entityId, "entityId");
      const existingEntity = await client.query(
        "SELECT id FROM entities WHERE tenant_id = $1 AND entity_key = $2",
        [tenant, requestedEntityKey]
      );
      if (operation === "create" && existingEntity.rows[0]) {
        throw new HttpError(409, `Entity ${requestedEntityKey} already exists. Use edit to update it.`);
      }
      if (operation === "update" && !existingEntity.rows[0]) {
        throw new HttpError(404, `Entity ${requestedEntityKey} was not found`);
      }
      const entityResult = await client.query(
        `INSERT INTO entities (tenant_id, entity_key, name, industry_code, region_code, status, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         ON CONFLICT (tenant_id, entity_key) DO UPDATE
           SET name = EXCLUDED.name,
               industry_code = EXCLUDED.industry_code,
               region_code = EXCLUDED.region_code,
               status = EXCLUDED.status,
               updated_at = now()
         RETURNING *`,
        [
          tenant,
          text(entityData.entityId, "entityId"),
          text(entityData.entityName, "entityName"),
          text(entityData.industry, "industry", false) || null,
          text(entityData.region, "region", false) || null,
          actor
        ]
      );
      const entity = entityResult.rows[0];
      const adminUserResult = await client.query(
        `INSERT INTO app_users (email, display_name, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (lower(email)) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               password_hash = COALESCE(EXCLUDED.password_hash, app_users.password_hash),
               status = 'active',
               updated_at = now()
         RETURNING id`,
        [
          text(entityData.adminEmail, "adminEmail").toLowerCase(),
          text(access.adminUsername, "adminUsername", false) || "entity.admin",
          adminPassword ? hashPassword(adminPassword) : null
        ]
      );
      const adminUserId = adminUserResult.rows[0].id as string;
      await client.query(
        `INSERT INTO entity_settings (
           entity_id, tenant_id, primary_admin_email, primary_admin_username,
           primary_admin_user_id,
           onboarding_notes, user_creation_enabled, rbac_enabled, default_role_key,
           accounts_payable_enabled, accounts_receivable_enabled
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (entity_id) DO UPDATE
           SET primary_admin_email = EXCLUDED.primary_admin_email,
               primary_admin_username = EXCLUDED.primary_admin_username,
               primary_admin_user_id = EXCLUDED.primary_admin_user_id,
               onboarding_notes = EXCLUDED.onboarding_notes,
               user_creation_enabled = EXCLUDED.user_creation_enabled,
               rbac_enabled = EXCLUDED.rbac_enabled,
               default_role_key = EXCLUDED.default_role_key,
               accounts_payable_enabled = EXCLUDED.accounts_payable_enabled,
               accounts_receivable_enabled = EXCLUDED.accounts_receivable_enabled,
               updated_at = now()`,
        [
          entity.id,
          tenant,
          text(entityData.adminEmail, "adminEmail"),
          text(access.adminUsername, "adminUsername", false) || "entity.admin",
          adminUserId,
          text(entityData.notes, "notes", false) || null,
          booleanValue(access.userCreation, true),
          booleanValue(access.rbac, true),
          text(access.defaultRole, "defaultRole", false) || "entity_admin",
          booleanValue(scope.accountsPayable, true),
          booleanValue(scope.accountsReceivable, true)
        ]
      );
      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, status, joined_at)
         VALUES ($1, $2, 'active', now())
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active'`,
        [tenant, adminUserId]
      );
      await client.query(
        `UPDATE entity_memberships
            SET is_primary_admin = false
          WHERE entity_id = $1 AND user_id <> $2 AND is_primary_admin`,
        [entity.id, adminUserId]
      );
      const adminMembership = await client.query(
        `INSERT INTO entity_memberships
           (tenant_id, entity_id, user_id, status, is_primary_admin)
         VALUES ($1, $2, $3, 'active', true)
         ON CONFLICT (entity_id, user_id) DO UPDATE
           SET status = 'active', is_primary_admin = true
         RETURNING id`,
        [tenant, entity.id, adminUserId]
      );
      const adminRole = await client.query(
        `SELECT id FROM roles
          WHERE tenant_id = $1 AND role_key = 'entity_admin'
          LIMIT 1`,
        [tenant]
      );
      if (adminRole.rows[0]) {
        await client.query(
          `INSERT INTO entity_membership_roles (tenant_id, entity_membership_id, role_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [tenant, adminMembership.rows[0].id, adminRole.rows[0].id]
        );
      }

      for (const channel of channels) {
        if (!["sap", "upload", "vendor", "mail"].includes(channel)) {
          throw new HttpError(400, `Unsupported intake mode ${channel}`);
        }
        const intakeResult = await client.query(
          `INSERT INTO entity_intake_channels (
             tenant_id, entity_id, channel_key, is_enabled, connection_settings, connection_status
           )
           VALUES ($1, $2, $3, true, $4::jsonb, 'not_configured')
           ON CONFLICT (entity_id, channel_key) DO UPDATE
             SET is_enabled = EXCLUDED.is_enabled,
                 connection_settings = EXCLUDED.connection_settings,
                 connection_status = EXCLUDED.connection_status,
                 updated_at = now()
           RETURNING id`,
          [tenant, entity.id, channel, JSON.stringify(buildIntakeSettings(body, channel))]
        );
        const selectedDocumentTypes = channel === "sap"
          ? arrayValue(((body.intakeConfig || {}) as JsonObject).sap && (((body.intakeConfig as JsonObject).sap as JsonObject).docTypes))
          : [];
        for (const documentType of selectedDocumentTypes.length ? selectedDocumentTypes : ["invoices"]) {
          await client.query(
            `INSERT INTO entity_channel_document_types (tenant_id, intake_channel_id, document_type_key)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [tenant, intakeResult.rows[0].id, documentType]
          );
        }
      }

      await client.query(
        `INSERT INTO entity_matching_policies (
           entity_id, tenant_id, matching_method, purchase_order_source_key,
           grn_source_key, inspection_source_key, eway_bill_policy, eway_bill_threshold
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (entity_id) DO UPDATE
           SET matching_method = EXCLUDED.matching_method,
               purchase_order_source_key = EXCLUDED.purchase_order_source_key,
               grn_source_key = EXCLUDED.grn_source_key,
               inspection_source_key = EXCLUDED.inspection_source_key,
               eway_bill_policy = EXCLUDED.eway_bill_policy,
               eway_bill_threshold = EXCLUDED.eway_bill_threshold,
               updated_at = now()`,
        [
          entity.id,
          tenant,
          text(matching.matchingMode, "matchingMode", false) || "three_way",
          text(matching.poSource, "poSource", false) || "sap",
          text(matching.grnSource, "grnSource", false) || "sap",
          text(matching.inspectionSource, "inspectionSource", false) || "not_applicable",
          text(matching.ewayBillMode, "ewayBillMode", false) || "not_applicable",
          numberValue(matching.ewayBillThreshold, "ewayBillThreshold", 0)
        ]
      );

      const moduleValues: Array<[string, boolean, JsonObject]> = [
        ["models", booleanValue(modules.modelIntegration, true), { prompt_versioning: booleanValue(modules.promptVersioning, true) }],
        ["classification", booleanValue(modules.documentClassification, true), { class_override: booleanValue(modules.classOverride, true) }],
        ["provider_governance", booleanValue(modules.providerGovernance, true), { fallback_routing: booleanValue(modules.fallbackRouting, true) }],
        ["ap_ar_scope", true, { accounts_payable: booleanValue(scope.accountsPayable, true), accounts_receivable: booleanValue(scope.accountsReceivable, true) }],
        ["user_access", true, { user_creation: booleanValue(access.userCreation, true), rbac: booleanValue(access.rbac, true) }],
        ["api_integrations", booleanValue(modules.apiIntegrations, false), {
          gst_tax: booleanValue(modules.gstTax, true),
          identity_kyc: booleanValue(modules.identityKyc, true),
          banking: booleanValue(modules.banking, true),
          business_compliance: booleanValue(modules.businessCompliance, false)
        }]
      ];
      for (const [moduleKey, enabled, settings] of moduleValues) {
        await client.query(
          `INSERT INTO entity_modules (tenant_id, entity_id, module_key, is_enabled, settings)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (entity_id, module_key) DO UPDATE
             SET is_enabled = EXCLUDED.is_enabled,
                 settings = EXCLUDED.settings,
                 updated_at = now()`,
          [tenant, entity.id, moduleKey, enabled, JSON.stringify(settings)]
        );
      }
      await client.query("SELECT refresh_entity_role_engine($1)", [entity.id]);
      await client.query(
        `INSERT INTO entity_onboarding_runs (
           tenant_id, entity_id, status, current_step, submitted_by_user_id, payload, completed_at
         )
         VALUES ($1, $2, 'created', 7, $3, $4::jsonb, now())`,
        [tenant, entity.id, actor, JSON.stringify(redactSensitive(body))]
      );
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, 'entity', $4, $5::jsonb)`,
        [tenant, actor, operation === "update" ? "entity.updated" : "entity.created", entity.id, JSON.stringify({ entityKey: entity.entity_key })]
      );
      return entity;
    });
    res.status(operation === "update" ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

/* ── Seed demo AP data for an entity ────────────────────────────── */
app.post("/api/v1/tenants/:tenantId/entities/:entityId/seed-demo-data", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    // Call the PL/pgSQL function from migration 005
    await pool.query("SELECT seed_entity_demo_data($1, $2)", [tenant, entity]);
    const entityRow = await pool.query(
      "SELECT entity_key, name FROM entities WHERE id = $1", [entity]
    );
    res.json({
      success: true,
      message: `Demo AP data seeded for entity ${entityRow.rows[0]?.entity_key}`,
      entityId: entityRow.rows[0]?.entity_key,
      entityName: entityRow.rows[0]?.name
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/roles", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT r.*, count(rp.permission_key)::int AS permission_count
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.tenant_id = $1
        GROUP BY r.id
        ORDER BY r.label`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/roles/refresh", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await withTransaction(tenant, async (client) => {
      const entity = await resolveEntityId(client, tenant, req.params.entityId);
      await client.query("SELECT refresh_entity_role_engine($1)", [entity]);
      return client.query(
        `SELECT er.*, r.role_key, r.label, r.scope_type
           FROM entity_roles er
           JOIN roles r ON r.id = er.role_id
          WHERE er.tenant_id = $1 AND er.entity_id = $2
          ORDER BY r.label`,
        [tenant, entity]
      );
    });
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/models", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actor = actorHeaders(req);
    const displayName = text(body.displayName, "displayName");
    const modelKey = text(body.modelKey, "modelKey", false) || displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const result = await pool.query(
      `INSERT INTO model_catalog (model_key, display_name, provider, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (model_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             provider = EXCLUDED.provider,
             description = EXCLUDED.description,
             is_active = true
       RETURNING *`,
      [
        modelKey,
        displayName,
        text(body.provider, "provider"),
        text(body.description, "description", false) || null
      ]
    );
    await insertAudit(pool, tenant, actor, "model.registered", "model", null,
      { modelKey: result.rows[0].model_key, displayName: result.rows[0].display_name, provider: result.rows[0].provider }
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/models", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT mc.*,
              count(DISTINCT ma.id)::int AS assignment_count
         FROM model_catalog mc
         LEFT JOIN model_assignments ma ON ma.model_id = mc.id AND ma.tenant_id = $1
        GROUP BY mc.id
        ORDER BY mc.display_name`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/prompt-versions", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT pv.*, pt.prompt_key, pt.name AS template_name, mc.display_name AS model_name,
              qe.precision_pct, qe.recall_pct, qe.f1_pct, qe.hallucination_pct,
              qe.latency_seconds, qe.gate_result
         FROM prompt_versions pv
         JOIN prompt_templates pt ON pt.id = pv.template_id
         JOIN model_catalog mc ON mc.id = pv.model_id
         LEFT JOIN LATERAL (
           SELECT *
             FROM prompt_quality_evaluations q
            WHERE q.prompt_version_id = pv.id
            ORDER BY q.evaluated_at DESC
            LIMIT 1
         ) qe ON true
        WHERE pv.tenant_id = $1
        ORDER BY pv.created_at DESC`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/prompt-templates/:promptKey/versions", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const result = await withTransaction(tenant, async (client) => {
      const template = await client.query(
        `SELECT id, baseline_prompt
           FROM prompt_templates
          WHERE tenant_id = $1 AND prompt_key = $2 AND is_active = true`,
        [tenant, text(req.params.promptKey, "promptKey")]
      );
      if (!template.rows[0]) throw new HttpError(404, "Prompt template was not found");
      const model = await client.query(
        "SELECT id FROM model_catalog WHERE display_name = $1 AND is_active = true",
        [text(body.model, "model")]
      );
      if (!model.rows[0]) throw new HttpError(400, `Model ${String(body.model)} was not found`);
      const precision = numberValue(body.precision, "precision");
      const recall = numberValue(body.recall, "recall");
      const hallucination = numberValue(body.hallucination, "hallucination");
      const latency = numberValue(body.latency, "latency");
      const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
      const gate = f1 >= 94 && hallucination <= 1.2
        ? { status: "approved", result: "approved" }
        : f1 >= 92 && hallucination <= 2
          ? { status: "candidate", result: "needs_fix" }
          : { status: "rejected", result: "blocked" };
      const version = await client.query(
        `INSERT INTO prompt_versions (
           tenant_id, template_id, model_id, version_tag, prompt_text, dataset_key,
           change_summary, lifecycle_status, created_by_user_id, approved_by_user_id, approved_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          tenant,
          template.rows[0].id,
          model.rows[0].id,
          text(body.promptVersion, "promptVersion"),
          text(body.promptText, "promptText", false) || template.rows[0].baseline_prompt,
          text(body.dataset, "dataset"),
          text(body.promptChange, "promptChange", false) || null,
          gate.status,
          actor,
          gate.status === "approved" ? actor : null,
          gate.status === "approved" ? new Date() : null
        ]
      );
      await client.query(
        `INSERT INTO prompt_quality_evaluations (
           tenant_id, prompt_version_id, dataset_key, precision_pct, recall_pct,
           f1_pct, hallucination_pct, latency_seconds, gate_result, evaluated_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [tenant, version.rows[0].id, text(body.dataset, "dataset"), precision, recall, f1, hallucination, latency, gate.result, actor]
      );
      await insertAudit(client, tenant, actorInfo, "prompt_version.created", "prompt_version", version.rows[0].id,
        { versionTag: version.rows[0].version_tag, lifecycleStatus: version.rows[0].lifecycle_status, gateResult: gate.result, f1Pct: f1, promptKey: req.params.promptKey }
      );
      return { ...version.rows[0], f1_pct: f1, gate_result: gate.result };
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/model-assignments", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT ma.*, e.entity_key, e.name AS entity_name, mc.model_key, mc.display_name AS model_name,
              current_pv.version_tag AS current_prompt, target_pv.version_tag AS target_prompt,
              owner_role.role_key AS owner_role_key, owner_role.label AS owner_role
         FROM model_assignments ma
         JOIN entities e ON e.id = ma.entity_id
         JOIN model_catalog mc ON mc.id = ma.model_id
         LEFT JOIN prompt_versions current_pv ON current_pv.id = ma.current_prompt_version_id
         LEFT JOIN prompt_versions target_pv ON target_pv.id = ma.target_prompt_version_id
         LEFT JOIN roles owner_role ON owner_role.id = ma.owner_role_id
        WHERE ma.tenant_id = $1
        ORDER BY ma.updated_at DESC`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/model-assignments", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const result = await withTransaction(tenant, async (client) => {
      const entity = await resolveEntityId(client, tenant, req.params.entityId);
      const modelKey = text(body.modelKey, "modelKey");
      const model = await client.query(
        "SELECT id FROM model_catalog WHERE (model_key = $1 OR display_name = $1) AND is_active = true",
        [modelKey]
      );
      if (!model.rows[0]) throw new HttpError(400, `Model ${modelKey} was not found`);
      const currentPromptId = await resolvePromptVersion(client, tenant, body.currentPromptVersion);
      const targetPromptId = await resolvePromptVersion(client, tenant, body.targetPromptVersion);
      const ownerRoleId = await resolveRoleId(client, tenant, body.ownerRoleKey);
      const assignmentKey = text(body.assignmentKey, "assignmentKey", false) || `assignment-${crypto.randomUUID()}`;
      const result = await client.query(
        `INSERT INTO model_assignments (
           tenant_id, assignment_key, entity_id, model_id, current_prompt_version_id,
           target_prompt_version_id, rollout_strategy, rollout_percent, owner_role_id,
           owner_approval_status, assignment_status, assigned_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          tenant,
          assignmentKey,
          entity,
          model.rows[0].id,
          currentPromptId,
          targetPromptId,
          text(body.rolloutStrategy, "rolloutStrategy", false) || "canary",
          numberValue(body.rolloutPercent, "rolloutPercent", 0),
          ownerRoleId,
          text(body.ownerApprovalStatus, "ownerApprovalStatus", false) || "pending",
          text(body.assignmentStatus, "assignmentStatus", false) || "pending_assignment",
          actor
        ]
      );
      await client.query(
        `INSERT INTO model_assignment_events (tenant_id, assignment_id, event_type, to_status, actor_user_id, metadata)
         VALUES ($1, $2, 'created', $3, $4, $5::jsonb)`,
        [tenant, result.rows[0].id, result.rows[0].assignment_status, actor, JSON.stringify({ source: "api" })]
      );
      await insertAudit(client, tenant, actorInfo, "model.assigned", "model_assignment", result.rows[0].id,
        { assignmentKey: result.rows[0].assignment_key, modelKey, entityId: entity, rolloutStrategy: body.rolloutStrategy, assignmentStatus: result.rows[0].assignment_status }
      );
      return result.rows[0];
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/model-assignments", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const result = await pool.query(
      `SELECT ma.*, e.entity_key, e.name AS entity_name, mc.model_key, mc.display_name AS model_name,
              current_pv.version_tag AS current_prompt, target_pv.version_tag AS target_prompt,
              owner_role.role_key AS owner_role_key, owner_role.label AS owner_role
         FROM model_assignments ma
         JOIN entities e ON e.id = ma.entity_id
         JOIN model_catalog mc ON mc.id = ma.model_id
         LEFT JOIN prompt_versions current_pv ON current_pv.id = ma.current_prompt_version_id
         LEFT JOIN prompt_versions target_pv ON target_pv.id = ma.target_prompt_version_id
         LEFT JOIN roles owner_role ON owner_role.id = ma.owner_role_id
        WHERE ma.tenant_id = $1 AND ma.entity_id = $2
        ORDER BY ma.created_at DESC`,
      [tenant, entity]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Classification model catalog ──────────────────────────────────── */
app.get("/api/v1/tenants/:tenantId/classification-models", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT cmc.*,
              COUNT(cm.id) FILTER (WHERE cm.lifecycle_status = 'published') AS published_count
         FROM classification_model_catalog cmc
         LEFT JOIN classification_mappings cm ON cm.classification_model_id = cmc.id AND cm.tenant_id = $1
        WHERE cmc.is_active = true
        GROUP BY cmc.id
        ORDER BY cmc.created_at`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/classification-models", async (req, res, next) => {
  try {
    const body = req.body as JsonObject;
    const displayName = text(body.displayName, "displayName");
    const provider    = text(body.provider,     "provider");
    const modelVersion = text(body.modelVersion, "modelVersion", false) || null;
    const description  = text(body.description,  "description",  false) || null;
    const modelKey = text(body.modelKey, "modelKey", false) ||
      displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const result = await pool.query(
      `INSERT INTO classification_model_catalog (model_key, display_name, provider, model_version, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (model_key) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             provider = EXCLUDED.provider,
             model_version = EXCLUDED.model_version,
             description = EXCLUDED.description
       RETURNING *`,
      [modelKey, displayName, provider, modelVersion, description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/classification-mappings", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT cm.*,
              e.name        AS entity_name,
              e.entity_key,
              cmc.display_name AS model_name,
              cmc.model_key,
              cmc.provider  AS model_provider,
              COUNT(cmc2.id) AS class_count
         FROM classification_mappings cm
         JOIN entities e   ON e.id = cm.entity_id AND e.tenant_id = $1
         JOIN classification_model_catalog cmc ON cmc.id = cm.classification_model_id
         LEFT JOIN classification_mapping_classes cmc2 ON cmc2.mapping_id = cm.id
        WHERE cm.tenant_id = $1
        GROUP BY cm.id, e.name, e.entity_key, cmc.display_name, cmc.model_key, cmc.provider
        ORDER BY cm.updated_at DESC`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/classification", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const mappings = await pool.query(
      `SELECT cm.*, cmc.model_key, cmc.display_name AS model_name
         FROM classification_mappings cm
         JOIN classification_model_catalog cmc ON cmc.id = cm.classification_model_id
        WHERE cm.tenant_id = $1 AND cm.entity_id = $2
        ORDER BY cm.version_no DESC`,
      [tenant, entity]
    );
    const classes = mappings.rows.length
      ? await pool.query(
          `SELECT *
             FROM classification_mapping_classes
            WHERE tenant_id = $1 AND mapping_id = ANY($2::uuid[])
            ORDER BY priority`,
          [tenant, mappings.rows.map((row) => row.id)]
        )
      : { rows: [] };
    res.json({ mappings: mappings.rows, classes: classes.rows });
  } catch (error) {
    next(error);
  }
});

app.put("/api/v1/tenants/:tenantId/entities/:entityId/classification", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body = req.body as JsonObject;
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const result = await withTransaction(tenant, async (client) => {
      const entity = await resolveEntityId(client, tenant, req.params.entityId);
      const modelKey = text(body.modelKey, "modelKey");
      const model = await client.query(
        "SELECT id FROM classification_model_catalog WHERE model_key = $1 AND is_active = true",
        [modelKey]
      );
      if (!model.rows[0]) throw new HttpError(400, `Classification model ${modelKey} was not found`);
      const mappingKey = text(body.mappingKey, "mappingKey", false) || `${entity}-classification`;
      const mapping = await client.query(
        `INSERT INTO classification_mappings (
           tenant_id, entity_id, mapping_key, version_no, classification_model_id,
           document_type_key, confidence_threshold_pct, fallback_class_key, lifecycle_status,
           created_by_user_id
         )
         VALUES ($1, $2, $3, 1, $4, $5, $6, $7, 'draft', $8)
         ON CONFLICT (entity_id, mapping_key, version_no) DO UPDATE
           SET classification_model_id = EXCLUDED.classification_model_id,
               document_type_key = EXCLUDED.document_type_key,
               confidence_threshold_pct = EXCLUDED.confidence_threshold_pct,
               fallback_class_key = EXCLUDED.fallback_class_key,
               lifecycle_status = 'draft',
               updated_at = now()
         RETURNING *`,
        [
          tenant,
          entity,
          mappingKey,
          model.rows[0].id,
          text(body.documentTypeKey, "documentTypeKey", false) || null,
          numberValue(body.thresholdPct, "thresholdPct", 90),
          text(body.fallbackClass, "fallbackClass", false) || "manual_review",
          actor
        ]
      );
      const mappingRow = mapping.rows[0];
      const classes = configuredClasses(body);
      if (!classes.length) throw new HttpError(400, "At least one classification class is required");
      await client.query("DELETE FROM classification_mapping_classes WHERE mapping_id = $1", [mappingRow.id]);
      for (const item of classes) {
        await client.query(
          `INSERT INTO classification_mapping_classes (
             tenant_id, mapping_id, class_key, priority, min_confidence_pct,
             routing_key, status, is_fallback, metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            tenant,
            mappingRow.id,
            item.classKey,
            item.priority,
            item.minConfidencePct,
            item.routingKey,
            item.status,
            item.isFallback,
            JSON.stringify(item.metadata)
          ]
        );
      }
      await client.query(
        `INSERT INTO classification_mapping_events (tenant_id, mapping_id, event_type, actor_user_id, metadata)
         VALUES ($1, $2, 'created', $3, $4::jsonb)`,
        [tenant, mappingRow.id, actor, JSON.stringify({ source: "api", classCount: classes.length })]
      );
      await insertAudit(client, tenant, actorInfo, "classification.configured", "classification_mapping", mappingRow.id,
        { mappingKey: mappingRow.mapping_key, modelKey: body.modelKey, entityId: entity, classCount: classes.length, lifecycleStatus: mappingRow.lifecycle_status }
      );
      return mappingRow;
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/classification/test", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const result = await withTransaction(tenant, async (client) => {
      const entity = await resolveEntityId(client, tenant, req.params.entityId);
      const mapping = await client.query(
        `SELECT cm.*
           FROM classification_mappings cm
          WHERE cm.tenant_id = $1 AND cm.entity_id = $2
          ORDER BY (cm.lifecycle_status = 'published') DESC, cm.version_no DESC
          LIMIT 1`,
        [tenant, entity]
      );
      if (!mapping.rows[0]) throw new HttpError(404, "No classification mapping exists for this entity");
      const sampleText = text(req.body.sampleText, "sampleText");
      const guess = classificationGuess(sampleText);
      const classes = await client.query(
        "SELECT * FROM classification_mapping_classes WHERE mapping_id = $1",
        [mapping.rows[0].id]
      );
      const selected = classes.rows.find((item) => item.class_key === guess);
      const confidence = guess === "unknown" ? 0 : 93;
      const accepted = Boolean(selected) && confidence >= Number(mapping.rows[0].confidence_threshold_pct);
      const fallback = classes.rows.find((item) => item.is_fallback);
      const predicted = accepted ? guess : (fallback?.class_key || mapping.rows[0].fallback_class_key);
      const response = await client.query(
        `INSERT INTO classification_test_runs (
           tenant_id, mapping_id, sample_text, sample_metadata, predicted_class_key,
           confidence_pct, used_fallback, result_status, result_message, executed_by_user_id
         )
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tenant,
          mapping.rows[0].id,
          sampleText,
          JSON.stringify(req.body.sampleMetadata || {}),
          predicted,
          confidence,
          !accepted,
          accepted ? "classified" : "fallback",
          accepted
            ? `Predicted class ${predicted} with simulated confidence ${confidence / 100} above threshold.`
            : `Predicted class ${predicted} because the sample did not meet the configured mapping.`,
          actor
        ]
      );
      await insertAudit(client, tenant, actorInfo, "classification.tested", "classification_mapping", mapping.rows[0].id,
        { entityId: entity, predictedClass: predicted, confidence, usedFallback: !accepted, resultStatus: accepted ? "classified" : "fallback" }
      );
      return response.rows[0];
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/classification/publish", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const actorInfo = actorHeaders(req);
    const actor = actorInfo.userId;
    const result = await withTransaction(tenant, async (client) => {
      const entity = await resolveEntityId(client, tenant, req.params.entityId);
      const mappingKey = text(req.body.mappingKey, "mappingKey");
      const updated = await client.query(
        `UPDATE classification_mappings
            SET lifecycle_status = 'published',
                published_by_user_id = $1,
                published_at = now(),
                updated_at = now()
          WHERE tenant_id = $2 AND entity_id = $3 AND mapping_key = $4
          RETURNING *`,
        [actor, tenant, entity, mappingKey]
      );
      if (!updated.rows[0]) throw new HttpError(404, "Classification mapping was not found");
      await client.query(
        `INSERT INTO classification_mapping_events (tenant_id, mapping_id, event_type, actor_user_id, metadata)
         VALUES ($1, $2, 'published', $3, $4::jsonb)`,
        [tenant, updated.rows[0].id, actor, JSON.stringify({ source: "api" })]
      );
      await insertAudit(client, tenant, actorInfo, "classification.published", "classification_mapping", updated.rows[0].id,
        { mappingKey: req.body.mappingKey, entityId: entity, publishedAt: updated.rows[0].published_at }
      );
      return updated.rows[0];
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/* ── Manual audit event insert (from frontend) ──────────────────── */
app.post("/api/v1/tenants/:tenantId/audit-events", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const body   = req.body as JsonObject;
    const actor  = actorHeaders(req);
    const action = text(body.action, "action");
    const resType = text(body.resourceType, "resourceType", false) || "ui";
    const resId   = typeof body.resourceId === "string" && body.resourceId ? body.resourceId : null;
    const meta    = (body.metadata && typeof body.metadata === "object") ? body.metadata as JsonObject : {};
    await insertAudit(pool, tenant, actor, action, resType, resId, meta);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ── Entity Audit Events ──────────────────────────────────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/audit-events", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["reports.read"]);
    const action       = typeof req.query.action   === "string" ? req.query.action.trim() : null;
    const severity     = typeof req.query.severity === "string" ? req.query.severity.trim() : null;
    const from         = typeof req.query.from     === "string" && req.query.from ? req.query.from : null;
    const to           = typeof req.query.to       === "string" && req.query.to   ? req.query.to   : null;
    const limit  = Math.min(200, Math.max(1, Number(req.query.limit  || 100)));
    const offset = Math.max(0,              Number(req.query.offset || 0));

    // Entity-scoped audit events: directly linked via resource_id=entity OR metadata.entityId
    const rows = await pool.query(
      `SELECT ae.id,
              ae.action,
              ae.resource_type,
              ae.resource_id,
              ae.metadata,
              ae.occurred_at,
              ae.actor_user_id,
              COALESCE(u.email,        ae.metadata->>'actorEmail') AS actor_email,
              COALESCE(u.display_name, ae.metadata->>'actorName',
                       u.email,        ae.metadata->>'actorEmail') AS actor_name,
              e.entity_key,
              e.name AS entity_name
         FROM audit_events ae
         LEFT JOIN app_users u  ON u.id = ae.actor_user_id
         LEFT JOIN entities   e ON e.id = $2 AND e.tenant_id = ae.tenant_id
        WHERE ae.tenant_id = $1
          AND (ae.resource_id = $2
               OR ae.metadata->>'entityId' = (SELECT entity_key FROM entities WHERE id = $2 AND tenant_id = $1))
          AND ($3::text IS NULL OR ae.action ILIKE '%' || $3 || '%')
          AND ($4::timestamptz IS NULL OR ae.occurred_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR ae.occurred_at <= $5::timestamptz)
        ORDER BY ae.occurred_at DESC
        LIMIT $6 OFFSET $7`,
      [tenant, entity, action, from, to, limit, offset]
    );
    const cnt = await pool.query(
      `SELECT count(*)::int AS total FROM audit_events ae
        WHERE ae.tenant_id = $1
          AND (ae.resource_id = $2
               OR ae.metadata->>'entityId' = (SELECT entity_key FROM entities WHERE id = $2 AND tenant_id = $1))`,
      [tenant, entity]
    );
    res.json({ data: rows.rows, total: cnt.rows[0].total, limit, offset });
  } catch (error) {
    next(error);
  }
});

/* ── Entity Members (User Management screen) ─────────────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/members", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["users.manage"]);
    const rows = await pool.query(
      `SELECT
              em.id        AS membership_id,
              em.status    AS membership_status,
              em.is_primary_admin,
              em.created_at AS joined_at,
              u.id         AS user_id,
              u.email,
              u.display_name AS name,
              u.status     AS user_status,
              u.last_login_at,
              COALESCE(
                (SELECT json_agg(json_build_object('role_key', r.role_key, 'label', r.label, 'scope_type', r.scope_type))
                   FROM entity_membership_roles emr
                   JOIN roles r ON r.id = emr.role_id
                  WHERE emr.entity_membership_id = em.id), '[]'::json) AS roles
         FROM entity_memberships em
         JOIN app_users u ON u.id = em.user_id
        WHERE em.entity_id = $1 AND em.tenant_id = $2
          AND em.status <> 'removed'
        ORDER BY em.is_primary_admin DESC, u.display_name`,
      [entity, tenant]
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

/* ── OCR Intake: POST /entities/:entityId/invoices/intake ────────── */
/*
 * Accepts OCR-extracted document data and:
 *  1. Finds or creates a vendor in ap_vendors (by GSTIN or name)
 *  2. Inserts normalized ap_invoices record
 *  3. Inserts ap_invoice_line_items (one row per OCR table row)
 *  4. Auto-triggers matching engine for this invoice
 *  5. Updates entity_invoices cache for the UI
 *
 * Expected body:
 *  {
 *    source_channel: "upload"|"mail"|"vendor"|"sap",
 *    document_type: string,
 *    vendor_name: string,
 *    vendor_gstin: string,
 *    invoice_number: string,
 *    invoice_date: string,     // YYYY-MM-DD
 *    due_date?: string,
 *    po_number?: string,        // links to ap_purchase_orders.po_number
 *    grn_number?: string,       // links to ap_goods_receipts.grn_number
 *    currency: string,
 *    subtotal?: number,
 *    cgst_amount?: number,
 *    sgst_amount?: number,
 *    igst_amount?: number,
 *    total_amount: number,
 *    ocr_confidence?: number,
 *    line_items: [{             // from OCR row extraction
 *      line_number: number,
 *      description: string,
 *      item_code?: string,      // HSN/SAC
 *      quantity: number,
 *      unit?: string,
 *      unit_price: number,
 *      cgst_rate?: number,
 *      sgst_rate?: number,
 *      igst_rate?: number,
 *      line_total: number,
 *      batch_number?: string,
 *    }]
 *  }
 */
app.post("/api/v1/tenants/:tenantId/entities/:entityId/invoices/intake", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);

    const body = req.body as Record<string, any>;
    const {
      source_channel = "upload",
      document_type = "",
      vendor_name = "",
      vendor_gstin = "",
      invoice_number = "",
      invoice_date = null,
      due_date = null,
      po_number = null,
      grn_number = null,
      intake_batch_id = null,
      currency = "INR",
      ocr_confidence = null,
      line_items = [] as any[],
    } = body;
    const sourceChannel = ["sap", "upload", "vendor", "mail"].includes(source_channel)
      ? source_channel
      : "upload";

    // Parse numeric amounts safely
    const num = (v: any) => Math.max(parseFloat(String(v ?? "0").replace(/[^0-9.\-]/g, "")) || 0, 0);
    const subtotal    = num(body.subtotal);
    const cgst_amount = num(body.cgst_amount);
    const sgst_amount = num(body.sgst_amount);
    const igst_amount = num(body.igst_amount);
    const total_amount = num(body.total_amount) || (subtotal + cgst_amount + sgst_amount + igst_amount);

    const safeDate = (d: any) => d ? new Date(d).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

    // ── 1. Find or create vendor ─────────────────────────────────────────
    let vendorId: string | null = null;
    if (vendor_gstin || vendor_name) {
      // Try by GSTIN first, then by name
      const vRow = await client.query(
        `SELECT id FROM ap_vendors
          WHERE entity_id = $1 AND tenant_id = $2
            AND (gstin = $3 OR lower(legal_name) = lower($4))
          LIMIT 1`,
        [entity, tenant, vendor_gstin || "", vendor_name || ""]
      );
      if (vRow.rows[0]) {
        vendorId = vRow.rows[0].id;
      } else if (vendor_name) {
        // Auto-create vendor from OCR (can be reviewed later)
        const vendorCode = `VND-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const newV = await client.query(
          `INSERT INTO ap_vendors
             (tenant_id, entity_id, vendor_code, legal_name, gstin, status)
           VALUES ($1,$2,$3,$4,$5,'active')
           RETURNING id`,
          [tenant, entity, vendorCode, vendor_name, vendor_gstin || null]
        );
        vendorId = newV.rows[0].id;
      }
    }

    // ── 2. Deduplicate: skip if invoice_number already exists ────────────
    if (invoice_number) {
      const dupRow = await client.query(
        `SELECT id, invoice_number FROM ap_invoices
          WHERE entity_id = $1 AND tenant_id = $2 AND invoice_number = $3`,
        [entity, tenant, invoice_number]
      );
      if (dupRow.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "duplicate",
          message: `Invoice ${invoice_number} already exists`,
          id: dupRow.rows[0].id,
        });
        return;
      }
    }

    // Fallback invoice number if OCR didn't extract one
    const invoiceNum = invoice_number || `OCR-${Date.now().toString(36).toUpperCase()}`;

    // ── 3. Insert ap_invoices ────────────────────────────────────────────
    const invInsert = await client.query(
      `INSERT INTO ap_invoices
         (tenant_id, entity_id, vendor_id,
          invoice_number, invoice_date, due_date,
          currency, subtotal,
          cgst_amount, sgst_amount, igst_amount,
          total_amount, source_channel, intake_batch_id,
          ocr_confidence, status,
          po_ref, grn_ref, notes, metadata)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'received',$16,$17,$18,$19::jsonb)
       RETURNING id`,
      [
        tenant, entity, vendorId,
        invoiceNum,
        safeDate(invoice_date),
        safeDate(due_date),
        currency, subtotal,
        cgst_amount, sgst_amount, igst_amount,
        total_amount, sourceChannel, intake_batch_id,
        ocr_confidence,
        po_number || null,
        grn_number || null,
        `OCR extracted via ${document_type || "document"}`,
        JSON.stringify({ document_type, ocr_source: true, intake_batch_id }),
      ]
    );
    const apInvoiceId: string = invInsert.rows[0].id;

    if (intake_batch_id) {
      await client.query(
        `UPDATE entity_processing_batches
            SET active_step = GREATEST(active_step, 3),
                completed_steps = ARRAY(
                  SELECT DISTINCT unnest(completed_steps || ARRAY[1,2,3]::integer[])
                ),
                updated_at = NOW()
          WHERE tenant_id=$1 AND entity_id=$2 AND batch_id=$3`,
        [tenant, entity, intake_batch_id],
      );
      await client.query(
        `UPDATE supplier_submissions
            SET status='accepted', invoice_id=$1, updated_at=NOW()
          WHERE tenant_id=$2 AND entity_id=$3 AND metadata->>'batch_id'=$4`,
        [apInvoiceId, tenant, entity, intake_batch_id],
      );
    }

    // ── 4. Insert ap_invoice_line_items ──────────────────────────────────
    for (let i = 0; i < line_items.length; i++) {
      const li = line_items[i] as Record<string, any>;
      const lineNum = Number(li.line_number ?? li.SNo ?? i + 1) || i + 1;
      const desc = String(li.description ?? li.Particular ?? li.particular ?? "").trim() || "Item";
      const itemCode = String(li.item_code ?? li.Code ?? li.hsn_sac_code ?? "").trim() || null;
      const batchNo = String(li.batch_number ?? li.Batch ?? "").trim() || null;
      const qty  = num(li.quantity ?? li.Qty ?? li.qty ?? 1);
      const price = num(li.unit_price ?? li.Rate ?? li.rate ?? 0);
      const cgstR = num(li.cgst_rate ?? li.CGST ?? 0);
      const sgstR = num(li.sgst_rate ?? li.SGST ?? 0);
      const igstR = num(li.igst_rate ?? li.IGST ?? 0);
      const lineSub  = qty * price;
      const cgstAmt  = lineSub * cgstR / 100;
      const sgstAmt  = lineSub * sgstR / 100;
      const igstAmt  = lineSub * igstR / 100;
      const lineTotal = num(li.line_total ?? li.Amount ?? li.amount ?? (lineSub + cgstAmt + sgstAmt + igstAmt));

      await client.query(
        `INSERT INTO ap_invoice_line_items
           (invoice_id, tenant_id, entity_id,
            line_number, item_code, description, hsn_sac_code,
            quantity, unit, unit_price,
            cgst_rate, sgst_rate, igst_rate,
            line_subtotal, cgst_amount, sgst_amount, igst_amount,
            line_total, match_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending')
         ON CONFLICT (invoice_id, line_number) DO NOTHING`,
        [
          apInvoiceId, tenant, entity,
          lineNum, itemCode, desc, itemCode,
          qty <= 0 ? 1 : qty, String(li.unit ?? li.UOM ?? "units"), price,
          cgstR, sgstR, igstR,
          lineSub, cgstAmt, sgstAmt, igstAmt,
          lineTotal,
        ]
      );
    }

    // ── 5. Also update entity_invoices cache (used by reconciliation UI) ──
    const cacheKey = `INV-${invoiceNum.replace(/[^A-Z0-9]/gi, "").slice(-8).toUpperCase()}`;
    await client.query(
      `INSERT INTO entity_invoices
         (entity_id, tenant_id, invoice_key, vendor_name, gstin,
          invoice_date, amount_num, po_ref, match_status, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        entity, tenant,
        cacheKey,
        vendor_name || "OCR Import",
        vendor_gstin || "",
        safeDate(invoice_date),
        total_amount,
        po_number || null,
        JSON.stringify({
          ap_invoice_id: apInvoiceId,
          document_type, source_channel, ocr_confidence,
          line_count: line_items.length,
        }),
      ]
    );

    await client.query("COMMIT");

    // ── 6. Auto-trigger match engine ─────────────────────────────────────
    let matchResult: any = null;
    if (sourceChannel === "upload" || po_number || grn_number) {
      try {
        const policyRow = await pool.query(
          `SELECT matching_method
             FROM entity_matching_policies WHERE entity_id = $1 LIMIT 1`,
          [entity]
        );
        const method = policyRow.rows[0]?.matching_method || "three_way";
        const tolerance = DEFAULT_TOLERANCE[method] || DEFAULT_TOLERANCE.three_way;
        const matchType = method === "two_way"
          ? "two_way"
          : method === "four_way" ? "four_way" : "three_way";
        const engine = new MatchEngine(pool, tenant, entity, tolerance, matchType);
        matchResult = await engine.matchInvoice(apInvoiceId);
      } catch (matchErr) {
        console.error("[INTAKE] auto-match failed:", matchErr);
      }
    }

    // ── 7. Audit ─────────────────────────────────────────────────────────
    await insertAudit(
      pool, tenant,
      actorHeaders(req),
      "document.uploaded",
      "invoice",
      apInvoiceId,
      {
        invoiceNumber: invoiceNum,
        source: source_channel,
        documentType: document_type,
        lineItems: line_items.length,
        totalAmount: total_amount,
        autoMatched: matchResult !== null,
        matchStatus: matchResult?.matchStatus ?? null,
        entityId: entity,
      }
    );

    res.status(201).json({
      success: true,
      id: apInvoiceId,
      invoice_number: invoiceNum,
      vendor_id: vendorId,
      line_items_inserted: line_items.length,
      match: matchResult
        ? {
            status: matchResult.matchStatus,
            score_pct: matchResult.matchScorePct,
            auto_resolved: matchResult.autoResolved,
            variance_count: matchResult.variances?.length ?? 0,
          }
        : null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

/* ── E-Way Bill Intake: POST /entities/:entityId/eway-bills/intake ── */
app.post("/api/v1/tenants/:tenantId/entities/:entityId/eway-bills/intake", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    const b = req.body as Record<string, any>;
    const num = (v: any) => parseFloat(String(v ?? "0").replace(/[^0-9.\-]/g, "")) || 0;
    const safeDate = (d: any) => d ? new Date(d).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    const safeTs = (d: any): string => d ? new Date(d).toISOString() : new Date().toISOString();

    if (!b.eway_bill_number) {
      res.status(400).json({ error: "eway_bill_number is required" });
      return;
    }

    // Deduplicate
    const dup = await pool.query(
      `SELECT id FROM ap_eway_bills WHERE entity_id=$1 AND eway_bill_number=$2`,
      [entity, b.eway_bill_number]
    );
    if (dup.rows[0]) {
      res.status(409).json({ duplicate: true, id: dup.rows[0].id });
      return;
    }

    const inserted = await pool.query(
      `INSERT INTO ap_eway_bills
         (tenant_id, entity_id, eway_bill_number, eway_bill_date, valid_until,
          gstin_supplier, gstin_recipient,
          doc_number, doc_date, total_value,
          transport_mode, vehicle_number,
          legal_name_supplier, from_pincode, to_pincode,
          generated_via, status, api_response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'manual','generated',$16::jsonb)
       RETURNING id`,
      [
        tenant, entity,
        b.eway_bill_number,
        safeTs(b.eway_bill_date),
        safeTs(b.valid_until ?? b.eway_bill_date),
        b.gstin_supplier || "",
        b.gstin_recipient || null,
        b.doc_number || b.eway_bill_number,
        safeDate(b.doc_date),
        num(b.total_value),
        (b.transport_mode || "road").toLowerCase(),
        b.vehicle_number || null,
        b.legal_name_supplier || "Unknown Supplier",
        b.from_pincode || "000000",
        b.to_pincode || "000000",
        JSON.stringify(b.metadata ?? {}),
      ]
    );

    await insertAudit(
      pool, tenant,
      actorHeaders(req),
      "document.uploaded", "eway_bill", inserted.rows[0].id,
      { ewbNo: b.eway_bill_number, source: "ocr_extraction", entityId: entity }
    );

    res.status(201).json({ success: true, id: inserted.rows[0].id, eway_bill_number: b.eway_bill_number });
  } catch (error) {
    next(error);
  }
});

/* ── Entity Invoices (Reconciliation screen) ─────────────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/invoices", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["ap.process", "ar.process", "ap.read", "ar.read"]);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const rows = await pool.query(
      `SELECT id, invoice_key, vendor_name, gstin, amount_num, po_ref, grn_ref,
              match_status, variance_amount, invoice_date, data, created_at
         FROM entity_invoices
        WHERE entity_id = $1 AND tenant_id = $2
          AND ($3::text IS NULL OR match_status = $3)
        ORDER BY invoice_date DESC, created_at DESC`,
      [entity, tenant, status]
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Active purchase orders for manual invoice assignment ───────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/purchase-orders", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["ap.process", "ar.process", "ap.read", "ar.read"]);
    const rows = await pool.query(
      `SELECT po.id, po.po_number, po.po_date, po.delivery_date, po.currency,
              po.total_amount, po.status, v.legal_name AS vendor_name
         FROM ap_purchase_orders po
         LEFT JOIN ap_vendors v ON v.id = po.vendor_id
        WHERE po.entity_id = $1 AND po.tenant_id = $2
          AND po.status NOT IN ('draft', 'closed', 'cancelled')
        ORDER BY po.po_date DESC, po.created_at DESC`,
      [entity, tenant],
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Manually assign a PO to an invoice ──────────────────────────── */
app.patch("/api/v1/tenants/:tenantId/entities/:entityId/invoices/:invoiceId/po", async (req, res, next) => {
  try {
    requireApOperator(req);
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["ap.process", "ar.process"]);
    const invoiceKey = req.params.invoiceId;
    const body = req.body as JsonObject;
    const poNumber = text(body.poNumber, "poNumber");

    const poResult = await pool.query(
      `SELECT po.id, po.po_number, po.po_date, po.delivery_date, po.currency,
              po.total_amount, po.status, v.legal_name AS vendor_name
         FROM ap_purchase_orders po
         LEFT JOIN ap_vendors v ON v.id = po.vendor_id
        WHERE po.entity_id = $1 AND po.tenant_id = $2
          AND po.po_number = $3
          AND po.status NOT IN ('draft', 'closed', 'cancelled')
        LIMIT 1`,
      [entity, tenant, poNumber],
    );
    if (poResult.rowCount === 0) throw new HttpError(404, "Active purchase order not found");

    const po = poResult.rows[0];
    const poLinesResult = await pool.query(
      `SELECT line_number, item_code, description, quantity, unit_price, line_total
         FROM ap_po_line_items
        WHERE po_id = $1
        ORDER BY line_number`,
      [po.id],
    );
    const invoiceResult = await pool.query(
      `SELECT id, invoice_key, data
         FROM entity_invoices
        WHERE (id::text = $1 OR invoice_key = $1)
          AND entity_id = $2 AND tenant_id = $3
        LIMIT 1`,
      [invoiceKey, entity, tenant],
    );
    if (invoiceResult.rowCount === 0) throw new HttpError(404, "Invoice not found");
    const currentData = (invoiceResult.rows[0].data || {}) as Record<string, any>;
    const currentLines = Array.isArray(currentData.lineItems) ? currentData.lineItems : [];
    const money = (value: unknown) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
    const lineItems = currentLines.map((line: Record<string, any>, index: number) => {
      const lineNumber = Number(line.line || index + 1);
      const poLine = poLinesResult.rows.find((candidate) => Number(candidate.line_number) === lineNumber);
      if (!poLine) return line;
      return {
        ...line,
        desc: line.desc || poLine.description,
        poQty: Number(poLine.quantity),
        poRate: money(poLine.unit_price),
        poAmt: money(poLine.line_total),
      };
    });
    const poData = JSON.stringify({
      amount: `₹${Number(po.total_amount || 0).toLocaleString("en-IN")}`,
      vendor: po.vendor_name || "Vendor not available",
      date: po.po_date ? new Date(po.po_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—",
      terms: "—",
    });
    const result = await pool.query(
      `UPDATE entity_invoices
          SET po_ref = $1,
              match_status = 'pending',
              data = COALESCE(data, '{}'::jsonb)
                     || jsonb_build_object('poData', $2::jsonb, 'lineItems', $3::jsonb)
        WHERE (id::text = $4 OR invoice_key = $4)
          AND entity_id = $5 AND tenant_id = $6
        RETURNING id, invoice_key`,
      [po.po_number, poData, JSON.stringify(lineItems), invoiceKey, entity, tenant],
    );

    await pool.query(
      `UPDATE ap_invoices
          SET po_ref = $1, status = 'received', updated_at = now()
        WHERE tenant_id = $2 AND entity_id = $3 AND invoice_number = $4`,
      [po.po_number, tenant, entity, result.rows[0].invoice_key],
    );
    res.json({ success: true, po });
  } catch (error) {
    next(error);
  }
});

/* ── Entity Exceptions (Exception Queue screen) ──────────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/exceptions", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["ap.process", "ar.process", "ap.read", "ar.read"]);
    const severity = typeof req.query.severity === "string" ? req.query.severity.trim() : null;
    const status   = typeof req.query.status   === "string" ? req.query.status.trim()   : null;
    const rows = await pool.query(
      `SELECT id, exception_key, title, invoice_ref, severity, status, reason_code,
              amount_num, owner_name, backup_name, sla_minutes, data, created_at, updated_at
         FROM entity_exceptions
        WHERE entity_id = $1 AND tenant_id = $2
          AND ($3::text IS NULL OR severity   = $3)
          AND ($4::text IS NULL OR status     = $4)
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                               WHEN 'medium'   THEN 3 ELSE 4 END,
                 created_at DESC`,
      [entity, tenant, severity, status]
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Entity Processing Batches (Transactions screen) ─────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/transactions", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["ap.process", "ar.process", "ap.read", "ar.read"]);
    const source = typeof req.query.source === "string" ? req.query.source.trim() : null;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : null;
    const rows = await pool.query(
      `SELECT id, batch_id, document_type, source_channel, pdf_count, page_count,
              active_step, completed_steps, status, stop_reason, uploaded_at, data
         FROM entity_processing_batches
        WHERE entity_id = $1 AND tenant_id = $2
          AND ($3::text IS NULL OR source_channel = $3)
          AND ($4::text IS NULL OR status = $4)
        ORDER BY uploaded_at DESC`,
      [entity, tenant, source, status]
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Processing batch preview ───────────────────────────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/transactions/:batchId/preview", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["ap.process", "ar.process", "ap.read", "ar.read"]);
    const result = await pool.query(
      `SELECT mime_type, stored_file_path, data
         FROM entity_processing_batches
        WHERE tenant_id = $1 AND entity_id = $2 AND batch_id = $3
        LIMIT 1`,
      [tenant, entity, req.params.batchId],
    );
    const batch = result.rows[0];
    if (!batch) throw new HttpError(404, "Processing batch was not found");

    const data = (batch.data || {}) as Record<string, unknown>;
    const mimeType = String(batch.mime_type || data.mime_type || "application/octet-stream");
    const storedPath = String(batch.stored_file_path || data.stored_file_path || "");
    let content: Buffer;

    if (storedPath) {
      const storageRoot = path.resolve(
        process.env.DOCUMENT_STORAGE_DIR?.trim() || path.resolve(process.cwd(), "storage"),
      );
      const resolvedPath = path.resolve(storedPath);
      const relativePath = path.relative(storageRoot, resolvedPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new HttpError(400, "Invalid document storage path");
      }
      content = await readFile(resolvedPath);
    } else if (typeof data.file_content_base64 === "string" && data.file_content_base64) {
      content = Buffer.from(data.file_content_base64, "base64");
    } else {
      throw new HttpError(404, "No preview image is available for this batch");
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.type(mimeType).send(content);
  } catch (error) {
    next(error);
  }
});

/* ── Audit events ────────────────────────────────────────────────── */
app.get("/api/v1/tenants/:tenantId/audit-events", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const actorEmail   = typeof req.query.actorEmail   === "string" ? req.query.actorEmail.trim().toLowerCase()  : null;
    const actorUid     = typeof req.query.actorUserId  === "string" && isUuid(req.query.actorUserId) ? req.query.actorUserId : null;
    const action       = typeof req.query.action       === "string" ? req.query.action.trim()  : null;
    const resourceType = typeof req.query.resourceType === "string" ? req.query.resourceType.trim() : null;
    const from         = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
    const to           = typeof req.query.to   === "string" && req.query.to   ? req.query.to   : null;
    const limit  = Math.min(500, Math.max(1, Number(req.query.limit  || 100)));
    const offset = Math.max(0,              Number(req.query.offset  || 0));

    const rows = await pool.query(
      `SELECT ae.id,
              ae.action,
              ae.resource_type,
              ae.resource_id,
              ae.metadata,
              ae.occurred_at,
              ae.actor_user_id,
              COALESCE(u.email,        ae.metadata->>'actorEmail') AS actor_email,
              COALESCE(u.display_name, ae.metadata->>'actorName',
                       u.email,        ae.metadata->>'actorEmail') AS actor_name,
              e.entity_key,
              e.name AS entity_name
         FROM audit_events ae
         LEFT JOIN app_users u ON u.id = ae.actor_user_id
         LEFT JOIN entities e
               ON e.id = ae.resource_id
              AND ae.resource_type = 'entity'
              AND e.tenant_id = ae.tenant_id
        WHERE ae.tenant_id = $1
          AND ($2::uuid IS NULL OR ae.actor_user_id = $2::uuid)
          AND ($3::text IS NULL
               OR lower(COALESCE(u.email, ae.metadata->>'actorEmail', '')) = $3)
          AND ($4::text IS NULL OR ae.action ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR ae.resource_type = $5)
          AND ($6::timestamptz IS NULL OR ae.occurred_at >= $6::timestamptz)
          AND ($7::timestamptz IS NULL OR ae.occurred_at <= $7::timestamptz)
        ORDER BY ae.occurred_at DESC
        LIMIT $8 OFFSET $9`,
      [tenant, actorUid, actorEmail, action, resourceType, from, to, limit, offset]
    );
    const cnt = await pool.query(
      `SELECT count(*)::int AS total
         FROM audit_events ae
         LEFT JOIN app_users u ON u.id = ae.actor_user_id
        WHERE ae.tenant_id = $1
          AND ($2::uuid IS NULL OR ae.actor_user_id = $2::uuid)
          AND ($3::text IS NULL
               OR lower(COALESCE(u.email, ae.metadata->>'actorEmail', '')) = $3)
          AND ($4::text IS NULL OR ae.action ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR ae.resource_type = $5)
          AND ($6::timestamptz IS NULL OR ae.occurred_at >= $6::timestamptz)
          AND ($7::timestamptz IS NULL OR ae.occurred_at <= $7::timestamptz)`,
      [tenant, actorUid, actorEmail, action, resourceType, from, to]
    );
    res.json({ data: rows.rows, total: cnt.rows[0].total, limit, offset });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/audit-events/actors", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT DISTINCT
              ae.actor_user_id,
              COALESCE(u.email,         ae.metadata->>'actorEmail') AS email,
              COALESCE(u.display_name,  ae.metadata->>'actorName',
                       u.email,         ae.metadata->>'actorEmail') AS name
         FROM audit_events ae
         LEFT JOIN app_users u ON u.id = ae.actor_user_id
        WHERE ae.tenant_id = $1
          AND COALESCE(u.email, ae.metadata->>'actorEmail') IS NOT NULL
        ORDER BY name`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Users ───────────────────────────────────────────────────────── */
app.get("/api/v1/tenants/:tenantId/users", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.email, u.display_name, u.status, u.last_login_at, u.created_at
         FROM app_users u
        WHERE EXISTS (
          SELECT 1 FROM audit_events ae
           WHERE ae.tenant_id = $1 AND ae.actor_user_id = u.id
        )
           OR EXISTS (
          SELECT 1 FROM tenant_memberships tm
           WHERE tm.tenant_id = $1 AND tm.user_id = u.id
        )
        ORDER BY u.email`,
      [tenant]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/users", async (req, res, next) => {
  try {
    const body = req.body as JsonObject;
    const email = text(body.email, "email").toLowerCase();
    const displayName = text(body.displayName, "displayName", false) || email.split("@")[0];
    const result = await pool.query(
      `INSERT INTO app_users (email, display_name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (lower(email)) DO UPDATE
         SET display_name = EXCLUDED.display_name, updated_at = now()
       RETURNING id, email, display_name, status, last_login_at, created_at, updated_at`,
      [email, displayName]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      throw new HttpError(400, "Email and password are required");
    }
    const emailLower = email.trim().toLowerCase();

    // 1. Super admin check (env-configurable, fallback to demo credentials)
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || "super.admin@company.com").toLowerCase();
    const superPass  = process.env.SUPER_ADMIN_PASSWORD || "Super@123";
    if (emailLower === superEmail && password === superPass) {
      const accessToken = issueAccessToken({
        userId: null,
        email: emailLower,
        name: "Super Admin",
        role: "super_admin",
        tenantId: null
      });
      res.json({
        success: true,
        user: { email: emailLower, name: "Super Admin", role: "super_admin" },
        accessToken,
        redirectTo: "/entities"
      });
      return;
    }

    // 2. Check entity_settings for primary admin email
    const entitySettingsRow = await pool.query(
      `SELECT es.*, e.entity_key, e.name AS entity_name, e.tenant_id,
              u.id AS admin_user_id, u.password_hash, u.status AS admin_status
         FROM entity_settings es
         JOIN entities e ON e.id = es.entity_id
         JOIN app_users u ON u.id = es.primary_admin_user_id
        WHERE lower(es.primary_admin_email) = $1
          AND u.status = 'active'
        LIMIT 1`,
      [emailLower]
    );

    if (entitySettingsRow.rows[0]) {
      const s = entitySettingsRow.rows[0];
      if (!verifyPassword(password, s.password_hash)) {
        throw new HttpError(401, "Invalid email or password");
      }
      await pool.query("UPDATE app_users SET last_login_at = now() WHERE id = $1", [s.admin_user_id]);
      const accessToken = issueAccessToken({
        userId: s.admin_user_id,
        email: emailLower,
        name: s.primary_admin_username || emailLower.split("@")[0],
        role: "entity_admin",
        tenantId: s.tenant_id
      });
      res.json({
        success: true,
        user: {
          email: emailLower,
          name: s.primary_admin_username || emailLower.split("@")[0],
          role: "entity_admin",
          entityKey: s.entity_key,
          entityName: s.entity_name,
          tenantId: s.tenant_id,
          id: s.admin_user_id
        },
        accessToken,
        redirectTo: `/entity-dashboard?entityId=${encodeURIComponent(s.entity_key)}&entityName=${encodeURIComponent(s.entity_name)}&tenantId=${s.tenant_id}`
      });
      return;
    }

    // 3. Check app_users + entity_memberships
    const userRow = await pool.query(
      `SELECT u.*, m.status AS membership_status, r.role_key,
              e.entity_key, e.name AS entity_name, e.tenant_id
         FROM app_users u
         LEFT JOIN entity_memberships m ON m.user_id = u.id AND m.status = 'active'
         LEFT JOIN entity_membership_roles emr ON emr.entity_membership_id = m.id
         LEFT JOIN roles r ON r.id = emr.role_id
         LEFT JOIN entities e ON e.id = m.entity_id
        WHERE lower(u.email) = $1 AND u.status = 'active'
        LIMIT 1`,
      [emailLower]
    );

    if (userRow.rows[0]) {
      const u = userRow.rows[0];
      if (!verifyPassword(password, u.password_hash)) {
        throw new HttpError(401, "Invalid email or password");
      }
      await pool.query("UPDATE app_users SET last_login_at = now() WHERE id = $1", [u.id]);
      await insertAudit(pool, u.tenant_id || "", { userId: u.id, email: emailLower, name: u.display_name || "" }, "user.login", "session", u.id,
        { entityId: u.entity_key, module: "Authentication", target: emailLower, severity: "low", result: "success", after: "Session started" });
      const redirectTo = u.entity_key
        ? `/entity-dashboard?entityId=${encodeURIComponent(u.entity_key)}&entityName=${encodeURIComponent(u.entity_name || "")}&tenantId=${u.tenant_id}`
        : "/entities";
      const accessToken = issueAccessToken({
        userId: u.id,
        email: emailLower,
        name: u.display_name || emailLower.split("@")[0],
        role: u.role_key || "staff",
        tenantId: u.tenant_id || null
      });
      res.json({
        success: true,
        user: {
          email: emailLower,
          name: u.display_name || emailLower.split("@")[0],
          role: u.role_key || "staff",
          entityKey: u.entity_key,
          entityName: u.entity_name,
          tenantId: u.tenant_id,
          id: u.id
        },
        accessToken,
        redirectTo
      });
      return;
    }

    throw new HttpError(401, "Invalid email or password");
  } catch (error) {
    next(error);
  }
});

// ── Connector routes (SAP, Mail, Vendor Portal, Document Upload) ──────────
app.use(
  "/api/v1/tenants/:tenantId/entities/:entityId",
  createConnectorRoutes(pool)
);

// ── Matching routes (3-way/4-way match engine) ────────────────────────────
app.use(
  "/api/v1/tenants/:tenantId/entities/:entityId",
  createMatchingRoutes(pool)
);
app.use(
  "/api/v1/tenants/:tenantId/entities/:entityId",
  createApprovalRoutes(pool)
);
app.use(
  "/api/v1/supplier",
  createSupplierRoutes(pool, issueAccessToken)
);

/* ── Invoice approve / reject ────────────────────────────────────── */
app.patch("/api/v1/tenants/:tenantId/entities/:entityId/invoices/:invoiceId/approve", async (req, res, next) => {
  try {
    requireApOperator(req);
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    const { invoiceId } = req.params as Record<string, string>;
    const body = req.body as JsonObject;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const approvalPayload = JSON.stringify({ approvedAt: new Date().toISOString(), notes });
    const result = await pool.query(
      `UPDATE entity_invoices
          SET match_status = 'approved',
              data = jsonb_set(COALESCE(data, '{}'::jsonb), '{approval}', $1::jsonb, true)
        WHERE (id::text = $2 OR invoice_key = $2) AND entity_id = $3 AND tenant_id = $4
        RETURNING id, invoice_key`,
      [approvalPayload, invoiceId, entity, tenant]
    );
    if (result.rowCount === 0) throw new HttpError(404, "Invoice not found");
    const inv = result.rows[0];
    await pool.query(
      `UPDATE ap_invoices
          SET status = 'approved',
              notes = COALESCE($1, notes),
              updated_at = now()
        WHERE tenant_id = $2 AND entity_id = $3 AND invoice_number = $4`,
      [notes, tenant, entity, inv.invoice_key]
    );
    const entityKeyRow = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "invoice.approved", "invoice", inv.id,
      { entityId: entityKeyRow.rows[0]?.entity_key, module: "Accounts Payable", target: inv.invoice_key || invoiceId, severity: "low", result: "success", after: "Status: Approved", reason: notes || "Manual approval", traceId: "TRC-" + inv.id.slice(0,8).toUpperCase() });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/tenants/:tenantId/entities/:entityId/invoices/:invoiceId/reject", async (req, res, next) => {
  try {
    requireApOperator(req);
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    const { invoiceId } = req.params as Record<string, string>;
    const body = req.body as JsonObject;
    const reason = text(body.reason, "reason");
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const rejectionPayload = JSON.stringify({ rejectedAt: new Date().toISOString(), reason, notes });
    const result = await pool.query(
      `UPDATE entity_invoices
          SET match_status = 'rejected',
              data = jsonb_set(COALESCE(data, '{}'::jsonb), '{rejection}', $1::jsonb, true)
        WHERE (id::text = $2 OR invoice_key = $2) AND entity_id = $3 AND tenant_id = $4
        RETURNING id, invoice_key`,
      [rejectionPayload, invoiceId, entity, tenant]
    );
    if (result.rowCount === 0) throw new HttpError(404, "Invoice not found");
    const inv = result.rows[0];
    await pool.query(
      `UPDATE ap_invoices
          SET status = 'rejected',
              notes = COALESCE($1, notes),
              updated_at = now()
        WHERE tenant_id = $2 AND entity_id = $3 AND invoice_number = $4`,
      [notes ? `${reason}: ${notes}` : reason, tenant, entity, inv.invoice_key]
    );
    const entityKeyRow2 = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "invoice.rejected", "invoice", inv.id,
      { entityId: entityKeyRow2.rows[0]?.entity_key, module: "Accounts Payable", target: inv.invoice_key || invoiceId, severity: "medium", result: "success", after: "Status: Rejected", reason: reason, traceId: "TRC-" + inv.id.slice(0,8).toUpperCase() });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/* ── Exception resolve / escalate ────────────────────────────────── */
app.patch("/api/v1/tenants/:tenantId/entities/:entityId/exceptions/:exceptionId/resolve", async (req, res, next) => {
  try {
    requireApOperator(req);
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    const { exceptionId } = req.params as Record<string, string>;
    const body = req.body as JsonObject;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const resolutionPayload = JSON.stringify({ resolvedAt: new Date().toISOString(), notes });
    const result = await pool.query(
      `UPDATE entity_exceptions
          SET status = 'resolved',
              updated_at = now(),
              data = jsonb_set(COALESCE(data, '{}'::jsonb), '{resolution}', $1::jsonb, true)
        WHERE (id::text = $2 OR exception_key = $2) AND entity_id = $3 AND tenant_id = $4
        RETURNING id, exception_key`,
      [resolutionPayload, exceptionId, entity, tenant]
    );
    if (result.rowCount === 0) throw new HttpError(404, "Exception not found");
    const exc = result.rows[0];
    const ekRow1 = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "exception.resolved", "exception", exc.id,
      { entityId: ekRow1.rows[0]?.entity_key, module: "Accounts Payable", target: exc.exception_key || exceptionId, severity: "low", result: "success", before: "Status: Open", after: "Status: Resolved", reason: notes || "", traceId: "TRC-" + exc.id.slice(0,8).toUpperCase() });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/tenants/:tenantId/entities/:entityId/exceptions/:exceptionId/escalate", async (req, res, next) => {
  try {
    requireApOperator(req);
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    const { exceptionId } = req.params as Record<string, string>;
    const body2 = req.body as JsonObject;
    const escNotes = typeof body2.notes === "string" ? body2.notes.trim() : "";
    const result = await pool.query(
      `UPDATE entity_exceptions
          SET status = 'escalated',
              updated_at = now()
        WHERE (id::text = $1 OR exception_key = $1) AND entity_id = $2 AND tenant_id = $3
        RETURNING id, exception_key`,
      [exceptionId, entity, tenant]
    );
    if (result.rowCount === 0) throw new HttpError(404, "Exception not found");
    const exc2 = result.rows[0];
    const ekRow2 = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "exception.escalated", "exception", exc2.id,
      { entityId: ekRow2.rows[0]?.entity_key, module: "Accounts Payable", target: exc2.exception_key || exceptionId, severity: "high", result: "success", before: "Status: Open", after: "Status: Escalated", reason: escNotes, traceId: "TRC-" + exc2.id.slice(0,8).toUpperCase() });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/tenants/:tenantId/entities/:entityId/exceptions/bulk", async (req, res, next) => {
  try {
    requireApOperator(req);
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    const body = req.body as JsonObject;
    const ids = Array.isArray(body.exceptionIds)
      ? body.exceptionIds.map((value) => String(value)).filter(Boolean).slice(0, 200)
      : [];
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!ids.length || !["resolve", "escalate", "assign"].includes(action)) {
      throw new HttpError(400, "exceptionIds and action (resolve, escalate, or assign) are required");
    }
    const status = action === "resolve" ? "resolved" : action === "escalate" ? "escalated" : "in_progress";
    const ownerName = typeof body.ownerName === "string" ? body.ownerName.trim() : null;
    const result = await pool.query(
      `UPDATE entity_exceptions
          SET status=$1,
              owner_name=CASE WHEN $2::text IS NULL THEN owner_name ELSE $2 END,
              updated_at=NOW()
        WHERE tenant_id=$3 AND entity_id=$4
          AND (id::text = ANY($5::text[]) OR exception_key = ANY($5::text[]))
        RETURNING id, exception_key, status`,
      [status, ownerName, tenant, entity, ids],
    );
    res.json({ success: true, updated: result.rowCount, data: result.rows });
  } catch (error) {
    next(error);
  }
});

/* ── Intake channel connector config ────────────────────────────── */
app.patch("/api/v1/tenants/:tenantId/entities/:entityId/intake-channels/:channelKey", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["providers.manage"]);
    const { channelKey } = req.params as Record<string, string>;
    const body = req.body as JsonObject;
    const connectionSettings = (body.connectionSettings ?? {}) as Record<string, unknown>;
    const isEnabled = booleanValue(body.isEnabled, true);
    const syncFrequency = typeof body.syncFrequency === "string" ? body.syncFrequency.trim() : null;
    const updateResult = await pool.query(
      `UPDATE entity_intake_channels
          SET connection_settings = $1::jsonb,
              is_enabled = $2,
              updated_at = now()
        WHERE entity_id = $3 AND tenant_id = $4 AND channel_key = $5`,
      [JSON.stringify(connectionSettings), isEnabled, entity, tenant, channelKey]
    );
    if (updateResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO entity_intake_channels
               (tenant_id, entity_id, channel_key, is_enabled, connection_settings)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [tenant, entity, channelKey, isEnabled, JSON.stringify(connectionSettings)]
      );
    }
    const ekRowCh = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "connector.configured", "intake_channel", entity,
      { entityId: ekRowCh.rows[0]?.entity_key, module: "Data Connectors", target: channelKey, severity: "low", result: "success", after: "Connector " + channelKey + " configured" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/* ── Entity users ───────────────────────────────────────────────── */
app.get("/api/v1/tenants/:tenantId/entities/:entityId/users/:userId", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["users.manage"]);
    const raw = (req.params as Record<string, string>).userId;
    const resolvedId = await resolveEntityUserId(pool, tenant, entity, raw);
    if (!resolvedId) throw new HttpError(404, "User not found in this entity");
    const row = await pool.query(
      `SELECT u.id, u.email, u.display_name AS full_name, u.status, u.last_login_at,
              m.id AS membership_id, m.status AS membership_status, m.is_primary_admin,
              r.role_key, r.label AS role_label
         FROM app_users u
         JOIN entity_memberships m ON m.user_id = u.id
         LEFT JOIN entity_membership_roles emr ON emr.entity_membership_id = m.id
         LEFT JOIN roles r ON r.id = emr.role_id
        WHERE m.entity_id = $1 AND m.tenant_id = $2
          AND m.status != 'removed'
          AND u.id = $3
        LIMIT 1`,
      [entity, tenant, resolvedId]
    );
    if (!row.rows[0]) throw new HttpError(404, "User not found in this entity");
    res.json({ data: row.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/tenants/:tenantId/entities/:entityId/users", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["users.manage"]);
    const rows = await pool.query(
      `SELECT u.id, u.email, u.display_name AS full_name, u.status, u.last_login_at,
              m.status AS membership_status, r.role_key
         FROM app_users u
         JOIN entity_memberships m ON m.user_id = u.id
         LEFT JOIN entity_membership_roles emr ON emr.entity_membership_id = m.id
         LEFT JOIN roles r ON r.id = emr.role_id
        WHERE m.entity_id = $1 AND m.tenant_id = $2
          AND m.status != 'removed'
        ORDER BY u.display_name`,
      [entity, tenant]
    );
    res.json({ data: rows.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/tenants/:tenantId/entities/:entityId/users", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["users.manage"]);
    const body = req.body as JsonObject;
    const email = text(body.email, "email").toLowerCase();
    const fullName = text(body.fullName, "fullName");
    const roleKey = typeof body.roleKey === "string" ? body.roleKey.trim() : "member";
    const userResult = await pool.query(
      `INSERT INTO app_users (email, display_name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (lower(email)) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             status = 'active'
       RETURNING id`,
      [email, fullName]
    );
    const userId = userResult.rows[0].id as string;
    const memResult = await pool.query(
      `INSERT INTO entity_memberships (tenant_id, entity_id, user_id, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (entity_id, user_id) DO UPDATE SET status = 'active'
       RETURNING id`,
      [tenant, entity, userId]
    );
    const membershipId = memResult.rows[0].id as string;
    // Assign role via entity_membership_roles
    const roleRow = await pool.query(
      `SELECT id FROM roles WHERE role_key = $1 AND tenant_id = $2 LIMIT 1`,
      [roleKey, tenant]
    );
    if (roleRow.rows[0]) {
      await pool.query(
        `INSERT INTO entity_membership_roles (tenant_id, entity_membership_id, role_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [tenant, membershipId, roleRow.rows[0].id]
      );
    }
    const ekRowU = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "user.created", "user", userId,
      { entityId: ekRowU.rows[0]?.entity_key, module: "User Management", target: email, severity: "medium", result: "success", after: "User created with role: " + roleKey, traceId: "TRC-" + userId.slice(0,8).toUpperCase() });
    res.status(201).json({ success: true, userId });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/v1/tenants/:tenantId/entities/:entityId/users/:userId", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, (req.params as Record<string, string>).entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["users.manage"]);
    const { userId } = req.params as Record<string, string>;
    const body = req.body as JsonObject;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (body.displayName !== undefined) { params.push(body.displayName); updates.push(`display_name = $${params.length}`); }
    if (body.status !== undefined) { params.push(body.status); updates.push(`status = $${params.length}`); }
    const resolvedUid = await resolveEntityUserId(pool, tenant, entity, userId);
    if (!resolvedUid) {
      throw new HttpError(404, "User not found");
    }

    if (updates.length > 0) {
      params.push(resolvedUid);
      await pool.query(
        `UPDATE app_users SET ${updates.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }
    if (typeof body.roleKey === "string" && body.roleKey.trim()) {
      // Get membership id and role id, then upsert into entity_membership_roles
      const memRow = await pool.query(
        `SELECT id FROM entity_memberships WHERE user_id = $1 AND entity_id = $2 AND tenant_id = $3 LIMIT 1`,
        [resolvedUid, entity, tenant]
      );
      const roleRow = await pool.query(
        `SELECT id FROM roles WHERE role_key = $1 AND tenant_id = $2 LIMIT 1`,
        [body.roleKey.trim(), tenant]
      );
      if (memRow.rows[0] && roleRow.rows[0]) {
        await pool.query(
          `INSERT INTO entity_membership_roles (tenant_id, entity_membership_id, role_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [tenant, memRow.rows[0].id, roleRow.rows[0].id]
        );
      }
    }
    const ekRowPatch = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "user.updated", "user", resolvedUid,
      { entityId: ekRowPatch.rows[0]?.entity_key, module: "User Management", target: userId, severity: "low", result: "success", after: JSON.stringify({ ...body, password: undefined }), traceId: "TRC-" + resolvedUid.slice(0,8).toUpperCase() });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/v1/tenants/:tenantId/entities/:entityId/users/:userId", async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const entity = await resolveEntityId(pool, tenant, req.params.entityId);
    await requireEntityPermission(pool, req, tenant, entity, ["users.manage"]);
    const { userId } = req.params as Record<string, string>;
    const resolvedUid = await resolveEntityUserId(pool, tenant, entity, userId);
    if (!resolvedUid) throw new HttpError(404, "User not found");
    // Soft delete — set status to 'removed' and deactivate user
    await pool.query(
      `UPDATE entity_memberships SET status = 'removed'
        WHERE user_id = $1 AND entity_id = $2 AND tenant_id = $3`,
      [resolvedUid, entity, tenant]
    );
    await pool.query(
      "UPDATE app_users SET status = 'deactivated', updated_at = now() WHERE id = $1",
      [resolvedUid]
    );
    const ekRowDel = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entity]);
    await insertAudit(pool, tenant, actorHeaders(req), "user.deleted", "user", resolvedUid,
      { entityId: ekRowDel.rows[0]?.entity_key, module: "User Management", target: userId, severity: "high", result: "success", after: "Membership removed, user deactivated", traceId: "TRC-" + resolvedUid.slice(0,8).toUpperCase() });
    res.json({ success: true, message: "User removed from entity" });
  } catch (error) {
    next(error);
  }
});

app.use((_req, _res, next) => next(new HttpError(404, "Route not found")));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const pgError = error as { code?: string; detail?: string };
  if (pgError.code === "23505") {
    res.status(409).json({ error: "A record with the same unique key already exists", detail: pgError.detail });
    return;
  }
  if (pgError.code === "23503" || pgError.code === "23514") {
    res.status(400).json({ error: "The request violates a database constraint", detail: pgError.detail });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

// ── One-time schema patches ───────────────────────────────────────────────
async function applySchemaPatches(): Promise<void> {
  const invConstraints = await pool.query(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'entity_invoices'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%match_status%'`);
  for (const row of invConstraints.rows) {
    await pool.query(`ALTER TABLE entity_invoices DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }
  await pool.query(`
    ALTER TABLE entity_invoices ADD CONSTRAINT entity_invoices_match_status_check
      CHECK (match_status IN ('matched','partial','unmatched','disputed','pending','approved','rejected'))
  `);
  const excConstraints = await pool.query(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'entity_exceptions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'`);
  for (const row of excConstraints.rows) {
    await pool.query(`ALTER TABLE entity_exceptions DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }
  await pool.query(`
    ALTER TABLE entity_exceptions ADD CONSTRAINT entity_exceptions_status_check
      CHECK (status IN ('open','in_progress','escalated','resolved','closed'))
  `);
  console.log("Schema patches applied");
}

let server: ReturnType<typeof app.listen> | null = null;
const ocrWorker = new OcrWorker(pool);
const sapScheduler = new SapScheduler(pool);

async function startServer(): Promise<void> {
  await runMigrations(pool);
  await applySchemaPatches();
    //server = app.listen(port, () => {
    server = app.listen(port,'0.0.0.0', () => {
    console.log(`Lexa SaaS backend listening on http://127.0.0.1:${port}`);
    ocrWorker.start();
    sapScheduler.start();
  });
}

void startServer().catch(async (error) => {
  console.error("Backend startup failed:", error);
  await pool.end();
  process.exitCode = 1;
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  sapScheduler.stop();
  await ocrWorker.stop();
  if (!server) {
    await pool.end();
    process.exit(0);
    return;
  }
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
