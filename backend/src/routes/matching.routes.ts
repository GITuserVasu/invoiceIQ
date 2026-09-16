/**
 * matching.routes.ts
 * Express routes for 3-way / 4-way document matching.
 * Mounted at: /api/v1/tenants/:tenantId/entities/:entityId
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { runEntityMatch, MatchEngine } from '../matching/match.engine.js';
import { DEFAULT_TOLERANCE } from '../matching/match.rules.js';
import { requireEntityPermission } from '../auth/rbac.js';

type P = Record<string, string>;

function requireTenant(req: any, tenantId: string): void {
  if (req.auth && !["super_admin", "service"].includes(req.auth.role)
    && req.auth.tenantId !== tenantId) {
    throw Object.assign(new Error("Tenant access denied"), { status: 403 });
  }
}

function requireApOperator(req: any): void {
  const allowed = new Set(["super_admin", "entity_admin", "finance_controller", "ap_manager"]);
  if (!req.auth || !allowed.has(req.auth.role)) {
    throw Object.assign(new Error("AP operation permission required"), { status: 403 });
  }
}

async function resolveEntityId(pool: Pool, tenantId: string, value: string): Promise<string> {
  const r = await pool.query(
    `SELECT id FROM entities WHERE tenant_id = $1 AND (id::text = $2 OR entity_key = $2) LIMIT 1`,
    [tenantId, value]
  );
  if (!r.rows[0]) throw Object.assign(new Error('Entity not found'), { status: 404 });
  return r.rows[0].id as string;
}

export function createMatchingRoutes(pool: Pool): Router {
  const router = Router({ mergeParams: true });

  /** POST /match/run — run match for all pending invoices */
  router.post('/match/run', async (req, res, next) => {
    try {
      requireApOperator(req);
      const { tenantId, entityId: rawEid } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEid);
      await requireEntityPermission(pool, req, tenantId, entityId, ['ap.process', 'ar.process']);
      const toleranceOverrides = (req.body as Record<string, unknown>)?.toleranceOverrides ?? {};
      const results = await runEntityMatch(pool, tenantId, entityId, toleranceOverrides as never);
      res.json({
        success: true,
        summary: {
          total:        results.length,
          matched:      results.filter(r => r.matchStatus === 'matched').length,
          partial:      results.filter(r => r.matchStatus === 'partial').length,
          unmatched:    results.filter(r => r.matchStatus === 'unmatched').length,
          disputed:     results.filter(r => r.matchStatus === 'disputed').length,
          autoResolved: results.filter(r => r.autoResolved).length
        },
        results
      });
    } catch (error) { next(error); }
  });

  /** POST /match/invoice/:invoiceId — match a single invoice */
  router.post('/match/invoice/:invoiceId', async (req, res, next) => {
    try {
      requireApOperator(req);
      const { tenantId, entityId: rawEid, invoiceId: rawInv } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEid);
      await requireEntityPermission(pool, req, tenantId, entityId, ['ap.process', 'ar.process']);

      const invRow = await pool.query(
        `SELECT id FROM ap_invoices WHERE entity_id = $1 AND (id::text = $2 OR invoice_number = $2) LIMIT 1`,
        [entityId, rawInv]
      );
      if (!invRow.rows[0]) { res.status(404).json({ error: 'Invoice not found' }); return; }

      const policyRow = await pool.query(
        'SELECT matching_method FROM entity_matching_policies WHERE entity_id = $1',
        [entityId]
      );
      const method = (policyRow.rows[0]?.matching_method as string) ?? 'three_way';
      const tolerance = DEFAULT_TOLERANCE[method] ?? DEFAULT_TOLERANCE['three_way'];
      const matchType = method === 'two_way' ? 'two_way' : method === 'four_way' ? 'four_way' : 'three_way';
      const engine = new MatchEngine(pool, tenantId, entityId, tolerance, matchType);
      const result = await engine.matchInvoice(invRow.rows[0].id as string);
      res.json({ success: true, result });
    } catch (error) { next(error); }
  });

  /** GET /match/results — list match results with optional status filter */
  router.get('/match/results', async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEid } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEid);
      await requireEntityPermission(pool, req, tenantId, entityId, ['ap.process', 'ar.process', 'ap.read', 'ar.read']);
      const status = typeof req.query.status === 'string' ? req.query.status : null;
      const limit  = Math.min(200, Math.max(1, Number(req.query.limit  ?? 50)));
      const offset = Math.max(0,               Number(req.query.offset ?? 0));

      const rows = await pool.query(
        `SELECT dm.*, i.invoice_number, i.total_amount, i.invoice_date,
                v.legal_name AS vendor_name, po.po_number, grn.grn_number,
                COUNT(mv.id)::int AS variance_count
           FROM ap_document_matches dm
           JOIN ap_invoices i ON i.id = dm.invoice_id
           LEFT JOIN ap_vendors v ON v.id = i.vendor_id
           LEFT JOIN ap_purchase_orders po ON po.id = dm.po_id
           LEFT JOIN ap_goods_receipts grn ON grn.id = dm.grn_id
           LEFT JOIN ap_match_variances mv ON mv.match_id = dm.id
          WHERE dm.entity_id = $1 AND dm.tenant_id = $2
            AND ($3::text IS NULL OR dm.match_status = $3)
          GROUP BY dm.id, i.invoice_number, i.total_amount, i.invoice_date,
                   v.legal_name, po.po_number, grn.grn_number
          ORDER BY dm.created_at DESC LIMIT $4 OFFSET $5`,
        [entityId, tenantId, status, limit, offset]
      );
      const cnt = await pool.query(
        `SELECT COUNT(*)::int AS total FROM ap_document_matches
          WHERE entity_id=$1 AND tenant_id=$2 AND ($3::text IS NULL OR match_status=$3)`,
        [entityId, tenantId, status]
      );
      res.json({ data: rows.rows, total: cnt.rows[0].total, limit, offset });
    } catch (error) { next(error); }
  });

  /** GET /match/variances — list open variances */
  router.get('/match/variances', async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEid } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEid);
      await requireEntityPermission(pool, req, tenantId, entityId, ['ap.process', 'ar.process', 'ap.read', 'ar.read']);
      const rows = await pool.query(
        `SELECT mv.*, i.invoice_number, dm.match_status
           FROM ap_match_variances mv
           JOIN ap_document_matches dm ON dm.id = mv.match_id
           JOIN ap_invoices i ON i.id = dm.invoice_id
          WHERE mv.entity_id=$1 AND mv.tenant_id=$2 AND mv.status='open'
          ORDER BY mv.created_at DESC LIMIT 200`,
        [entityId, tenantId]
      );
      res.json({ data: rows.rows });
    } catch (error) { next(error); }
  });

  /** PATCH /match/variances/:varianceId — accept / reject / waive a variance */
  router.patch('/match/variances/:varianceId', async (req, res, next) => {
    try {
      requireApOperator(req);
      const { tenantId, entityId: rawEid, varianceId } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEid);
      await requireEntityPermission(pool, req, tenantId, entityId, ['ap.process', 'ar.process']);
      const { action, notes } = req.body as { action: string; notes?: string };
      const statusMap: Record<string, string> = { accept: 'accepted', reject: 'rejected', waive: 'waived' };
      const newStatus = statusMap[action];
      if (!newStatus) { res.status(400).json({ error: 'action must be accept, reject, or waive' }); return; }
      await pool.query(
        `UPDATE ap_match_variances SET status=$1, review_notes=$2, reviewed_at=now()
          WHERE id=$3 AND entity_id=$4 AND tenant_id=$5`,
        [newStatus, notes ?? null, varianceId, entityId, tenantId]
      );
      // Audit log
      try {
        const ekRow = await pool.query(`SELECT entity_key FROM entities WHERE id=$1`, [entityId]);
        const actorEmail = ((req as any).headers?.['x-actor-email'] as string) || '';
        const actorName  = ((req as any).headers?.['x-actor-name']  as string) || '';
        await pool.query(
          `INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
           VALUES ($1, NULL, $2, 'variance', $3, $4::jsonb)`,
          [tenantId, "variance." + action, varianceId,
           JSON.stringify({ entityId: ekRow.rows[0]?.entity_key, module: "Reconciliation", target: varianceId, severity: "medium", result: "success", after: "Variance " + newStatus, reason: notes || "", actorEmail, actorName, traceId: "TRC-" + varianceId.slice(0,8).toUpperCase() })]
        );
      } catch { /* never break main flow */ }
      res.json({ success: true, status: newStatus });
    } catch (error) { next(error); }
  });

  /** GET /match/summary — KPI summary for dashboard */
  router.get('/match/summary', async (req, res, next) => {
    try {
      const { tenantId, entityId: rawEid } = req.params as P;
      requireTenant(req, tenantId);
      const entityId = await resolveEntityId(pool, tenantId, rawEid);
      await requireEntityPermission(pool, req, tenantId, entityId, ['ap.process', 'ar.process', 'ap.read', 'ar.read']);
      const row = await pool.query(
        `SELECT
           COUNT(*)::int                                                       AS total_invoices,
           COUNT(*) FILTER (WHERE i.status='matched')::int                    AS matched,
           COUNT(*) FILTER (WHERE i.status IN ('partially_matched','under_review'))::int AS in_review,
           COUNT(*) FILTER (WHERE i.status='unmatched')::int                  AS unmatched,
           COUNT(*) FILTER (WHERE i.status='approved')::int                   AS approved,
           COUNT(*) FILTER (WHERE i.status='paid')::int                       AS paid,
           COALESCE(SUM(i.total_amount) FILTER (WHERE i.status NOT IN ('rejected','cancelled')),0) AS total_value,
           COALESCE(SUM(i.total_amount) FILTER (WHERE i.status='paid'),0)     AS paid_value,
           ROUND(100.0 * COUNT(*) FILTER (WHERE i.status='matched') / NULLIF(COUNT(*),0),2) AS auto_match_rate_pct
           FROM ap_invoices i WHERE i.entity_id=$1 AND i.tenant_id=$2`,
        [entityId, tenantId]
      );
      const exc = await pool.query(
        `SELECT COUNT(*)::int AS open_exceptions FROM entity_exceptions
          WHERE entity_id=$1 AND tenant_id=$2 AND status NOT IN ('resolved','closed')`,
        [entityId, tenantId]
      );
      res.json({ ...row.rows[0], ...exc.rows[0] });
    } catch (error) { next(error); }
  });

  return router;
}
