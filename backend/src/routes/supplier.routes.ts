import crypto from "node:crypto";
import { Router } from "express";
import type { Pool } from "pg";
import { DocumentProcessor } from "../connectors/document.processor.js";

type TokenIssuer = (claims: {
  userId: string | null;
  email: string;
  name: string;
  role: string;
  tenantId: string | null;
}) => string;

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

function requireInternal(req: any): void {
  const allowed = new Set(["super_admin", "entity_admin", "finance_controller", "ap_manager"]);
  if (!req.auth || !allowed.has(req.auth.role)) {
    throw Object.assign(new Error("Internal user access required"), { status: 403 });
  }
}

function requireSupplier(req: any, tenantId: string): void {
  if (req.auth?.role !== "supplier" || req.auth.tenantId !== tenantId) {
    throw Object.assign(new Error("Supplier access required"), { status: 403 });
  }
}

async function resolveEntityId(pool: Pool, tenantId: string, value: string): Promise<string> {
  const result = await pool.query(
    `SELECT id FROM entities
      WHERE tenant_id=$1 AND (id::text=$2 OR entity_key=$2)
      LIMIT 1`,
    [tenantId, value],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("Entity not found"), { status: 404 });
  }
  return result.rows[0].id as string;
}

export function createSupplierRoutes(pool: Pool, issueToken: TokenIssuer): Router {
  const router = Router();

  router.post("/auth/login", async (req, res, next) => {
    try {
      const body = req.body as { tenantId?: string; entityId?: string; email?: string; password?: string };
      const tenantId = String(body.tenantId || "").trim();
      const entityId = String(body.entityId || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      if (!tenantId || !entityId || !email || !body.password) {
        res.status(400).json({ error: "tenantId, entityId, email, and password are required" });
        return;
      }
      const entityUuid = await resolveEntityId(pool, tenantId, entityId);
      const result = await pool.query(
        `SELECT su.id, su.email, su.full_name, su.password_hash, su.status,
                su.vendor_id, v.legal_name AS vendor_name
           FROM supplier_users su
           JOIN ap_vendors v ON v.id=su.vendor_id
          WHERE su.tenant_id=$1 AND su.entity_id=$2 AND lower(su.email)=$3
          LIMIT 1`,
        [tenantId, entityUuid, email],
      );
      const user = result.rows[0];
      if (!user || user.status !== "active" || !verifyPassword(body.password, user.password_hash)) {
        res.status(401).json({ error: "Invalid supplier credentials" });
        return;
      }
      await pool.query("UPDATE supplier_users SET last_login_at=NOW() WHERE id=$1", [user.id]);
      const accessToken = issueToken({
        userId: user.id,
        email: user.email,
        name: user.full_name,
        role: "supplier",
        tenantId,
      });
      res.json({
        success: true,
        accessToken,
        supplier: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          vendorId: user.vendor_id,
          vendorName: user.vendor_name,
          tenantId,
          entityId: entityUuid,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tenants/:tenantId/entities/:entityId/suppliers/users", async (req, res, next) => {
    try {
      requireInternal(req);
      const { tenantId, entityId: rawEntityId } = req.params;
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      const body = req.body as {
        vendorId?: string;
        email?: string;
        fullName?: string;
        password?: string;
      };
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.fullName || "").trim();
      const password = String(body.password || "");
      if (!body.vendorId || !email || !fullName || password.length < 8) {
        res.status(400).json({ error: "vendorId, fullName, email, and a password of at least 8 characters are required" });
        return;
      }
      const vendor = await pool.query(
        `SELECT id FROM ap_vendors WHERE id=$1 AND tenant_id=$2 AND entity_id=$3`,
        [body.vendorId, tenantId, entityId],
      );
      if (!vendor.rows[0]) {
        res.status(404).json({ error: "Supplier vendor not found" });
        return;
      }
      const result = await pool.query(
        `INSERT INTO supplier_users
           (tenant_id, entity_id, vendor_id, email, full_name, password_hash, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active')
         ON CONFLICT (entity_id, email)
         DO UPDATE SET vendor_id=EXCLUDED.vendor_id, full_name=EXCLUDED.full_name,
                       password_hash=EXCLUDED.password_hash, status='active', updated_at=NOW()
         RETURNING id, email, full_name, vendor_id`,
        [tenantId, entityId, body.vendorId, email, fullName, hashPassword(password)],
      );
      res.status(201).json({ success: true, user: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tenants/:tenantId/entities/:entityId/suppliers/vendors", async (req, res, next) => {
    try {
      requireInternal(req);
      const { tenantId, entityId: rawEntityId } = req.params;
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      const result = await pool.query(
        `SELECT id, vendor_code, legal_name, gstin, status
           FROM ap_vendors
          WHERE tenant_id=$1 AND entity_id=$2
          ORDER BY legal_name`,
        [tenantId, entityId],
      );
      res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tenants/:tenantId/entities/:entityId/submissions", async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEntityId } = req.params;
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      const supplierFilter = req.auth?.role === "supplier" ? "AND s.supplier_user_id = $3" : "";
      if (req.auth?.role === "supplier") requireSupplier(req, tenantId);
      const values = req.auth?.role === "supplier"
        ? [tenantId, entityId, req.auth?.userId ?? null]
        : [tenantId, entityId];
      const result = await pool.query(
        `SELECT s.id, s.submission_key, s.original_filename, s.document_type,
                s.status, s.invoice_id, s.error_message, s.created_at, s.updated_at,
                v.legal_name AS vendor_name
           FROM supplier_submissions s
           JOIN ap_vendors v ON v.id=s.vendor_id
          WHERE s.tenant_id=$1 AND s.entity_id=$2 ${supplierFilter}
          ORDER BY s.created_at DESC
          LIMIT 200`,
        values,
      );
      res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tenants/:tenantId/entities/:entityId/submissions", async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEntityId } = req.params;
      requireSupplier(req, tenantId);
      const auth = req.auth!;
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      const body = req.body as {
        filename?: string;
        mimeType?: string;
        dataBase64?: string;
        documentType?: string;
      };
      if (!body.filename || !body.mimeType || !body.dataBase64) {
        res.status(400).json({ error: "filename, mimeType, and dataBase64 are required" });
        return;
      }
      const buffer = Buffer.from(body.dataBase64, "base64");
      const processor = new DocumentProcessor(pool, tenantId, entityId);
      const upload = await processor.processUpload(
        body.filename,
        body.mimeType,
        buffer,
        body.documentType || "invoice",
      );
      const batch = await pool.query(
        `SELECT stored_file_path FROM entity_processing_batches
          WHERE tenant_id=$1 AND entity_id=$2 AND batch_id=$3`,
        [tenantId, entityId, upload.batchId],
      );
      const vendor = await pool.query(
        `SELECT vendor_id FROM supplier_users WHERE id=$1 AND entity_id=$2`,
        [auth.userId, entityId],
      );
      if (!vendor.rows[0] || !batch.rows[0]) {
        res.status(403).json({ error: "Supplier account is not linked to this entity" });
        return;
      }
      const submissionKey = `SUB-${upload.batchId}`;
      const result = await pool.query(
        `INSERT INTO supplier_submissions
           (tenant_id, entity_id, vendor_id, supplier_user_id, submission_key,
            original_filename, mime_type, stored_file_path, document_type, status, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',$10::jsonb)
         RETURNING id, submission_key, status, created_at`,
        [
          tenantId,
          entityId,
          vendor.rows[0].vendor_id,
          auth.userId,
          submissionKey,
          body.filename,
          body.mimeType,
          batch.rows[0].stored_file_path,
          body.documentType || "invoice",
          JSON.stringify({ batch_id: upload.batchId }),
        ],
      );
      await pool.query(
        `INSERT INTO supplier_submission_events
           (tenant_id, entity_id, submission_id, event_type, status, actor_user_id)
         VALUES ($1,$2,$3,'submitted','submitted',$4)`,
        [tenantId, entityId, result.rows[0].id, auth.userId],
      );
      res.status(201).json({ success: true, submission: result.rows[0], batchId: upload.batchId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
