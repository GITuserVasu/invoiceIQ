import { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { requireEntityPermission } from "../auth/rbac.js";

type P = Record<string, string>;

function requireTenant(req: any, tenantId: string): void {
  if (req.auth && !["super_admin", "service"].includes(req.auth.role)
    && req.auth.tenantId !== tenantId) {
    throw Object.assign(new Error("Tenant access denied"), { status: 403 });
  }
}

function forbidden(req: any): void {
  const role = req.auth?.role;
  const allowed = new Set(["super_admin", "entity_admin", "finance_controller", "ap_manager"]);
  if (!allowed.has(role)) {
    throw Object.assign(new Error("AP approval permission required"), { status: 403 });
  }
}

async function resolveEntityId(pool: Pool, tenantId: string, value: string): Promise<string> {
  const result = await pool.query(
    `SELECT id FROM entities
      WHERE tenant_id = $1 AND (id::text = $2 OR entity_key = $2)
      LIMIT 1`,
    [tenantId, value],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("Entity not found"), { status: 404 });
  }
  return result.rows[0].id as string;
}

export function createApprovalRoutes(pool: Pool): Router {
  const router = Router({ mergeParams: true });

  router.get("/approvals", async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEntityId } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      await requireEntityPermission(pool, req, tenantId, entityId, ["ap.process", "ar.process", "ap.read", "ar.read"]);
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const result = await pool.query(
        `SELECT a.*, i.invoice_number, i.total_amount, i.currency,
                v.legal_name AS vendor_name
           FROM ap_invoice_approvals a
           JOIN ap_invoices i ON i.id = a.invoice_id
           LEFT JOIN ap_vendors v ON v.id = i.vendor_id
          WHERE a.tenant_id = $1 AND a.entity_id = $2
            AND ($3::text IS NULL OR a.status = $3)
          ORDER BY a.due_by NULLS LAST, a.created_at DESC`,
        [tenantId, entityId, status],
      );
      res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/invoices/:invoiceId/approvals", async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEntityId, invoiceId } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      await requireEntityPermission(pool, req, tenantId, entityId, ["ap.process", "ar.process", "ap.read", "ar.read"]);
      const result = await pool.query(
        `SELECT a.*, i.invoice_number, i.total_amount, i.currency
           FROM ap_invoice_approvals a
           JOIN ap_invoices i ON i.id = a.invoice_id
          WHERE a.tenant_id = $1 AND a.entity_id = $2
            AND (a.invoice_id::text = $3 OR i.invoice_number = $3)
          ORDER BY a.approval_level`,
        [tenantId, entityId, invoiceId],
      );
      res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.put("/approval-policies", async (req, res, next) => {
    try {
      forbidden(req);
      const { tenantId, entityId: rawEntityId } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      await requireEntityPermission(pool, req, tenantId, entityId, ["ap.process", "ar.process"]);
      const body = req.body as {
        policyName?: string;
        minimumAmount?: number;
        currency?: string;
        steps?: Array<{ approvalLevel?: number; approverRoleKey?: string; slaHours?: number }>;
      };
      const policyName = String(body.policyName || "default").trim();
      const minimumAmount = Number(body.minimumAmount || 0);
      const currency = String(body.currency || "INR").trim().toUpperCase();
      const configuredSteps = body.steps ?? [];
      const steps: Array<{ approvalLevel?: number; approverRoleKey?: string; slaHours?: number }> =
        configuredSteps.length
          ? configuredSteps
          : [{ approvalLevel: 1, approverRoleKey: "ap_manager", slaHours: 24 }];
      if (!policyName || !Number.isFinite(minimumAmount) || minimumAmount < 0) {
        res.status(400).json({ error: "Valid policyName and minimumAmount are required" });
        return;
      }

      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const policy = await client.query(
          `INSERT INTO ap_approval_policies
             (tenant_id, entity_id, policy_name, minimum_amount, currency, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (entity_id, policy_name)
           DO UPDATE SET minimum_amount = EXCLUDED.minimum_amount,
                         currency = EXCLUDED.currency,
                         is_active = true,
                         updated_at = NOW()
           RETURNING id`,
          [tenantId, entityId, policyName, minimumAmount, currency, req.auth?.userId || null],
        );
        const policyId = policy.rows[0].id as string;
        await client.query("DELETE FROM ap_approval_policy_steps WHERE policy_id = $1", [policyId]);
        for (const step of steps) {
          const level = step.approvalLevel ?? 0;
          const roleKey = (step.approverRoleKey ?? "").trim();
          const slaHours = step.slaHours ?? 24;
          if (level % 1 !== 0 || level < 1 || level > 5 || !roleKey || slaHours < 1) {
            throw Object.assign(new Error("Invalid approval step"), { status: 400 });
          }
          await client.query(
            `INSERT INTO ap_approval_policy_steps
               (policy_id, tenant_id, entity_id, approval_level, approver_role_key, sla_hours)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [policyId, tenantId, entityId, level, roleKey, slaHours],
          );
        }
        await client.query("COMMIT");
        res.status(201).json({ success: true, policyId });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  });

  router.post("/invoices/:invoiceId/approvals/initialize", async (req, res, next) => {
    try {
      forbidden(req);
      const { tenantId, entityId: rawEntityId, invoiceId } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      await requireEntityPermission(pool, req, tenantId, entityId, ["ap.process", "ar.process"]);
      const invoice = await pool.query(
        `SELECT id, total_amount, currency FROM ap_invoices
          WHERE tenant_id=$1 AND entity_id=$2
            AND (id::text=$3 OR invoice_number=$3)
          LIMIT 1`,
        [tenantId, entityId, invoiceId],
      );
      if (!invoice.rows[0]) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }
      const policy = await pool.query(
        `SELECT p.id
           FROM ap_approval_policies p
          WHERE p.tenant_id=$1 AND p.entity_id=$2 AND p.is_active
            AND p.minimum_amount <= $3
            AND (p.currency = $4 OR p.currency = 'USD')
          ORDER BY p.minimum_amount DESC
          LIMIT 1`,
        [tenantId, entityId, invoice.rows[0].total_amount, invoice.rows[0].currency],
      );
      const policySteps: Array<{ approval_level: number; approver_role_key: string; sla_hours: number }> =
        policy.rows[0]
        ? (await pool.query(
            `SELECT approval_level, approver_role_key, sla_hours
               FROM ap_approval_policy_steps
              WHERE policy_id=$1 ORDER BY approval_level`,
            [policy.rows[0].id],
          )).rows
        : [{ approval_level: 1, approver_role_key: "ap_manager", sla_hours: 24 }];

      for (const step of policySteps) {
        await pool.query(
          `INSERT INTO ap_invoice_approvals
             (tenant_id, entity_id, invoice_id, approval_level, approver_role_key, due_by)
           VALUES ($1,$2,$3,$4,$5,NOW() + ($6 || ' hours')::interval)
           ON CONFLICT (invoice_id, approval_level) DO NOTHING`,
          [
            tenantId,
            entityId,
            invoice.rows[0].id,
            step.approval_level,
            step.approver_role_key,
            step.sla_hours,
          ],
        );
      }
      res.status(201).json({ success: true, invoiceId: invoice.rows[0].id });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/invoices/:invoiceId/approvals/:approvalId", async (req, res, next) => {
    try {
      forbidden(req);
      const { tenantId, entityId: rawEntityId, invoiceId, approvalId } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEntityId);
      await requireEntityPermission(pool, req, tenantId, entityId, ["ap.process", "ar.process"]);
      const action = String((req.body as { action?: string }).action || "").trim().toLowerCase();
      if (!["approve", "reject", "escalate"].includes(action)) {
        res.status(400).json({ error: "action must be approve, reject, or escalate" });
        return;
      }
      const approval = await pool.query(
        `SELECT a.*, i.invoice_number
           FROM ap_invoice_approvals a
           JOIN ap_invoices i ON i.id = a.invoice_id
          WHERE a.id=$1 AND a.tenant_id=$2 AND a.entity_id=$3
            AND (a.invoice_id::text=$4 OR i.invoice_number=$4)
          LIMIT 1`,
        [approvalId, tenantId, entityId, invoiceId],
      );
      if (!approval.rows[0]) {
        res.status(404).json({ error: "Approval step not found" });
        return;
      }
      const current = approval.rows[0];
      if (current.status !== "pending") {
        res.status(409).json({ error: "Approval step is no longer pending" });
        return;
      }
      if (action !== "escalate" && req.auth?.role !== "entity_admin"
        && req.auth?.role !== "finance_controller"
        && req.auth?.role !== current.approver_role_key) {
        res.status(403).json({ error: "This approval step is assigned to another role" });
        return;
      }

      const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "escalated";
      await pool.query(
        `UPDATE ap_invoice_approvals
            SET status=$1, action_at=NOW(), notes=$2, approver_user_id=$3, updated_at=NOW()
          WHERE id=$4`,
        [status, (req.body as { notes?: string }).notes || null, req.auth?.userId || null, approvalId],
      );
      if (action === "reject") {
        await pool.query(
          `UPDATE ap_invoices SET status='rejected', updated_at=NOW()
            WHERE id=$1 AND tenant_id=$2 AND entity_id=$3`,
          [current.invoice_id, tenantId, entityId],
        );
      } else if (action === "approve") {
        const pending = await pool.query(
          `SELECT 1 FROM ap_invoice_approvals
            WHERE invoice_id=$1 AND status='pending'`,
          [current.invoice_id],
        );
        if (!pending.rowCount) {
          await pool.query(
            `UPDATE ap_invoices SET status='approved', updated_at=NOW()
              WHERE id=$1 AND tenant_id=$2 AND entity_id=$3`,
            [current.invoice_id, tenantId, entityId],
          );
          await pool.query(
            `UPDATE entity_invoices
                SET match_status='approved',
                    data=jsonb_set(COALESCE(data, '{}'::jsonb), '{approval_status}', '"approved"'::jsonb, true),
                    updated_at=NOW()
              WHERE tenant_id=$1 AND entity_id=$2
                AND data->>'ap_invoice_id'=$3`,
            [tenantId, entityId, current.invoice_id],
          );
        }
      }
      res.json({ success: true, status });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
