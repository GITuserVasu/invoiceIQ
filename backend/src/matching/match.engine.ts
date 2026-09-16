/**
 * matching/match.engine.ts
 * Core 2-way / 3-way / 4-way invoice match engine.
 *
 * Match types:
 *   two_way   — Invoice vs PO only (no GRN)
 *   three_way — Invoice vs PO vs GRN
 *   four_way  — Invoice vs PO vs GRN vs Inspection report
 *
 * Tolerance configuration is loaded per entity from entity_matching_policies.
 */

import type { Pool } from 'pg';

// ── Exported interfaces ────────────────────────────────────────────────────

/** Configurable tolerance per entity / match type */
export interface MatchToleranceConfig {
  /** e.g. 2.0 = 2% */
  amountTolerancePct: number;
  /** e.g. 1.0 = 1% */
  quantityTolerancePct: number;
  /** e.g. 1.5 = 1.5% */
  unitPriceTolerancePct: number;
  /** e.g. 0.5 = 0.5% */
  taxTolerancePct: number;
  autoApproveIfWithinTolerance: boolean;
}

export interface VarianceRecord {
  fieldName: string;
  poValue: string;
  invoiceValue: string;
  grnValue: string;
  varianceAmount: number;
  variancePct: number;
  withinTolerance: boolean;
  /** PRICE_VARIANCE | QTY_VARIANCE | TAX_VARIANCE | GSTIN_MISMATCH | CURRENCY_MISMATCH | PO_CLOSED | BLOCKING */
  varianceType: string;
}

export interface MatchResult {
  invoiceId: string;
  poId: string | null;
  grnId: string | null;
  inspectionId: string | null;
  matchType: 'two_way' | 'three_way' | 'four_way';
  matchStatus: 'matched' | 'partial' | 'unmatched' | 'disputed';
  matchScorePct: number;
  totalVariance: number;
  autoResolved: boolean;
  variances: VarianceRecord[];
}

// ── Default tolerance ──────────────────────────────────────────────────────

const DEFAULT_TOLERANCE: MatchToleranceConfig = {
  amountTolerancePct: 2.0,
  quantityTolerancePct: 1.0,
  unitPriceTolerancePct: 1.5,
  taxTolerancePct: 0.5,
  autoApproveIfWithinTolerance: false,
};

// ── Internal DB row types ──────────────────────────────────────────────────

interface InvoiceRow {
  id: string;
  source_ref: string;
  gstin: string | null;
  currency: string;
  total_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  po_reference: string | null;
  grn_reference: string | null;
  status: string;
}

interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  line_number: number;
  item_code: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  line_total: number;
}

interface PORow {
  id: string;
  source_ref: string;
  gstin: string | null;
  currency: string;
  total_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  status: string;
  delivery_date?: string | null;
}

interface POLineRow {
  id: string;
  po_id: string;
  line_number: number;
  item_code: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  line_total: number;
}

interface GRNRow {
  id: string;
  source_ref: string;
  status: string;
}

interface GRNLineRow {
  id: string;
  grn_id: string;
  line_number: number;
  item_code: string | null;
  description: string;
  accepted_quantity: number;
}

interface InspectionRow {
  id: string;
  grn_id: string;
  status: string;
}

// ── Utility helpers ────────────────────────────────────────────────────────

function pctDiff(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : 100;
  return Math.abs((a - b) / b) * 100;
}

function withinPct(a: number, b: number, tolerancePct: number): boolean {
  return pctDiff(a, b) <= tolerancePct;
}

// ── MatchEngine class ──────────────────────────────────────────────────────

export class MatchEngine {
  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
    private readonly entityId: string,
    private readonly tolerance: MatchToleranceConfig,
    private readonly requiredMatchType: MatchResult['matchType'] = 'three_way',
  ) {}

  // ── Public: matchInvoice ─────────────────────────────────────────────────

  async matchInvoice(invoiceId: string): Promise<MatchResult> {
    // 1. Load invoice + line items
    // Column mapping: invoice_number→source_ref, po_ref→po_reference, grn_ref→grn_reference
    // vendor GSTIN is joined from ap_vendors
    const invoiceRes = await this.pool.query<InvoiceRow>(
      `SELECT i.id,
              i.invoice_number        AS source_ref,
              v.gstin                 AS gstin,
              i.currency,
              i.total_amount,
              i.cgst_amount,
              i.sgst_amount,
              i.igst_amount,
              i.po_ref                AS po_reference,
              i.grn_ref               AS grn_reference,
              i.status
       FROM ap_invoices i
       LEFT JOIN ap_vendors v ON v.id = i.vendor_id
       WHERE i.id = $1 AND i.tenant_id = $2 AND i.entity_id = $3`,
      [invoiceId, this.tenantId, this.entityId],
    );
    if (invoiceRes.rowCount === 0) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }
    const invoice = invoiceRes.rows[0];

    const invLinesRes = await this.pool.query<InvoiceLineRow>(
      `SELECT id, invoice_id, line_number, item_code, description,
              quantity, unit_price, cgst_rate, sgst_rate, igst_rate, line_total
       FROM ap_invoice_line_items
       WHERE invoice_id = $1
       ORDER BY line_number`,
      [invoiceId],
    );
    const invLines = invLinesRes.rows;

    // 2. Find PO by po_reference
    let po: PORow | null = null;
    let poLines: POLineRow[] = [];
    if (invoice.po_reference) {
      const poRes = await this.pool.query<PORow>(
        `SELECT po.id,
                po.po_number          AS source_ref,
                v.gstin               AS gstin,
                po.currency,
                po.total_amount,
                po.cgst_amount,
                po.sgst_amount,
                po.igst_amount,
                po.status,
                po.delivery_date
         FROM ap_purchase_orders po
         LEFT JOIN ap_vendors v ON v.id = po.vendor_id
         WHERE po.tenant_id = $1 AND po.entity_id = $2
           AND (po.po_number = $3 OR po.id::text = $3)
         LIMIT 1`,
        [this.tenantId, this.entityId, invoice.po_reference],
      );
      if (poRes.rowCount && poRes.rowCount > 0) {
        po = poRes.rows[0];
        const poLinesRes = await this.pool.query<POLineRow>(
          `SELECT id, po_id, line_number, item_code, description,
                  quantity, unit_price, cgst_rate, sgst_rate, igst_rate, line_total
           FROM ap_po_line_items
           WHERE po_id = $1
           ORDER BY line_number`,
          [po.id],
        );
        poLines = poLinesRes.rows;
      }
    }

    // 3. Find GRN by grn_reference
    let grn: GRNRow | null = null;
    let grnLines: GRNLineRow[] = [];
    let inspection: InspectionRow | null = null;
    if (invoice.grn_reference) {
      const grnRes = await this.pool.query<GRNRow>(
        `SELECT id, grn_number AS source_ref, status
         FROM ap_goods_receipts
         WHERE tenant_id = $1 AND entity_id = $2
           AND (grn_number = $3 OR id::text = $3)
         LIMIT 1`,
        [this.tenantId, this.entityId, invoice.grn_reference],
      );
      if (grnRes.rowCount && grnRes.rowCount > 0) {
        grn = grnRes.rows[0];
        const grnLinesRes = await this.pool.query<GRNLineRow>(
          `SELECT id, grn_id, line_number, item_code, description,
                  quantity_accepted AS accepted_quantity
           FROM ap_grn_line_items
           WHERE grn_id = $1
           ORDER BY line_number`,
          [grn.id],
        );
        grnLines = grnLinesRes.rows;

        // Look for an inspection report linked to this GRN
        const inspRes = await this.pool.query<InspectionRow>(
          `SELECT id, grn_id, status
           FROM ap_inspection_reports
           WHERE grn_id = $1
           LIMIT 1`,
          [grn.id],
        );
        if (inspRes.rowCount && inspRes.rowCount > 0) {
          inspection = inspRes.rows[0];
        }
      }
    }

    // 4. Determine match type
    let matchType: MatchResult['matchType'];
    matchType = this.requiredMatchType;

    // 5. Run header + line matches
    const headerVariances = this.matchHeaders(invoice, po, grn, this.tolerance);
    if (this.requiredMatchType === 'four_way' && (!inspection || !['pass', 'conditional_pass'].includes(inspection.status))) {
      headerVariances.push({
        fieldName: 'inspection_status',
        poValue: 'pass',
        invoiceValue: inspection?.status || 'missing',
        grnValue: grn?.source_ref || '',
        varianceAmount: 0,
        variancePct: 100,
        withinTolerance: false,
        varianceType: 'BLOCKING',
      });
    }
    const lineVariances = this.matchLineItems(invLines, poLines, grnLines, this.tolerance);

    // Count total field checks
    const HEADER_CHECKS = 5; // GSTIN, amount, cgst+sgst+igst, currency, PO status
    const LINE_CHECKS_PER_LINE = 4; // quantity, unit_price, tax_rates, line_total
    const totalFields = HEADER_CHECKS + invLines.length * LINE_CHECKS_PER_LINE;

    const allVariances: VarianceRecord[] = [...headerVariances, ...lineVariances];

    // 5. Compute score
    const matchScorePct = this.computeMatchScore(allVariances, totalFields);

    // 6. Determine status
    const hasBlockingVariance = allVariances.some(
      (v) => !v.withinTolerance && (
        v.varianceType === 'GSTIN_MISMATCH'
        || v.varianceType === 'CURRENCY_MISMATCH'
        || v.varianceType === 'TAX_VARIANCE'
        || v.varianceType === 'BLOCKING'
      ),
    );
    const matchStatus = this.determineMatchStatus(matchScorePct, hasBlockingVariance);

    // Compute total absolute variance amount
    const totalVariance = allVariances.reduce((sum, v) => sum + Math.abs(v.varianceAmount), 0);

    // Auto-resolve if config allows and all variances within tolerance
    const autoResolved =
      this.tolerance.autoApproveIfWithinTolerance &&
      matchStatus === 'matched' &&
      allVariances.every((v) => v.withinTolerance);

    const result: MatchResult = {
      invoiceId,
      poId: po?.id ?? null,
      grnId: grn?.id ?? null,
      inspectionId: inspection?.id ?? null,
      matchType,
      matchStatus,
      matchScorePct,
      totalVariance,
      autoResolved,
      variances: allVariances,
    };

    // 7. Save to DB
    await this.saveMatchResult(result);

    // 8. Create exception if needed
    if (matchStatus === 'unmatched' || matchStatus === 'disputed') {
      await this.createException(invoice, result);
    }

    return result;
  }

  // ── Public: matchAllPending ───────────────────────────────────────────────

  async matchAllPending(): Promise<MatchResult[]> {
    const res = await this.pool.query<{ id: string }>(
      `SELECT id FROM ap_invoices
       WHERE tenant_id = $1 AND entity_id = $2 AND status IN ('received','under_review')
       ORDER BY invoice_date ASC`,
      [this.tenantId, this.entityId],
    );

    const results: MatchResult[] = [];
    for (const row of res.rows) {
      try {
        const matchResult = await this.matchInvoice(row.id);
        results.push(matchResult);
      } catch (err: unknown) {
        // Log and continue; individual failures should not stop batch
        const message = err instanceof Error ? err.message : String(err);
        console.error(`MatchEngine: failed to match invoice ${row.id}: ${message}`);
      }
    }

    return results;
  }

  // ── Private: matchHeaders ─────────────────────────────────────────────────

  private matchHeaders(
    invoice: InvoiceRow,
    po: PORow | null,
    grn: GRNRow | null,
    tolerance: MatchToleranceConfig,
  ): VarianceRecord[] {
    const variances: VarianceRecord[] = [];

    if (!po) {
      variances.push({
        fieldName: 'purchase_order',
        poValue: 'required',
        invoiceValue: invoice.po_reference || '(missing)',
        grnValue: '',
        varianceAmount: 0,
        variancePct: 100,
        withinTolerance: false,
        varianceType: 'BLOCKING',
      });
    }
    if (this.requiredMatchType !== 'two_way' && !grn) {
      variances.push({
        fieldName: 'goods_receipt',
        poValue: 'required',
        invoiceValue: invoice.grn_reference || '(missing)',
        grnValue: '(missing)',
        varianceAmount: 0,
        variancePct: 100,
        withinTolerance: false,
        varianceType: 'BLOCKING',
      });
    }

    // ── Check 1: Vendor GSTIN (blocking if different) ──────────────────────
    {
      const invoiceGstin = invoice.gstin?.trim() ?? '';
      const poGstin = po?.gstin?.trim() ?? '';
      const gstinMatch = !po || invoiceGstin === poGstin;
      variances.push({
        fieldName: 'vendor_gstin',
        poValue: poGstin || '(none)',
        invoiceValue: invoiceGstin || '(none)',
        grnValue: '',
        varianceAmount: 0,
        variancePct: gstinMatch ? 0 : 100,
        withinTolerance: gstinMatch,
        varianceType: gstinMatch ? '' : 'GSTIN_MISMATCH',
      });
    }

    // ── Check 2: Total amount within tolerance ─────────────────────────────
    {
      const invoiceTotal = invoice.total_amount;
      const poTotal = po?.total_amount ?? invoiceTotal;
      const diff = invoiceTotal - poTotal;
      const pct = pctDiff(invoiceTotal, poTotal);
      const ok = withinPct(invoiceTotal, poTotal, tolerance.amountTolerancePct);
      variances.push({
        fieldName: 'total_amount',
        poValue: String(poTotal),
        invoiceValue: String(invoiceTotal),
        grnValue: '',
        varianceAmount: diff,
        variancePct: pct,
        withinTolerance: ok,
        varianceType: ok ? '' : 'PRICE_VARIANCE',
      });
    }

    // ── Check 3: GST totals (CGST + SGST + IGST combined) within tolerance ─
    {
      const invGst = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount;
      const poGst = po ? po.cgst_amount + po.sgst_amount + po.igst_amount : invGst;
      const diff = invGst - poGst;
      const pct = pctDiff(invGst, poGst);
      const ok = withinPct(invGst, poGst, tolerance.taxTolerancePct);
      variances.push({
        fieldName: 'gst_total',
        poValue: String(poGst),
        invoiceValue: String(invGst),
        grnValue: '',
        varianceAmount: diff,
        variancePct: pct,
        withinTolerance: ok,
        varianceType: ok ? '' : 'TAX_VARIANCE',
      });
    }

    // ── Check 4: Currency match (blocking if different) ───────────────────
    {
      const invCurr = invoice.currency?.toUpperCase() ?? 'INR';
      const poCurr = po ? (po.currency?.toUpperCase() ?? 'USD') : invCurr;
      const ok = invCurr === poCurr;
      variances.push({
        fieldName: 'currency',
        poValue: poCurr,
        invoiceValue: invCurr,
        grnValue: '',
        varianceAmount: 0,
        variancePct: ok ? 0 : 100,
        withinTolerance: ok,
        varianceType: ok ? '' : 'CURRENCY_MISMATCH',
      });
    }

    // ── Check 5: PO not cancelled / closed ───────────────────────────────
    {
      const poStatus = po?.status ?? 'missing';
      const ok = !po || !['cancelled', 'closed'].includes(poStatus.toLowerCase());
      variances.push({
        fieldName: 'po_status',
        poValue: poStatus,
        invoiceValue: '',
        grnValue: '',
        varianceAmount: 0,
        variancePct: ok ? 0 : 100,
        withinTolerance: ok,
        varianceType: ok ? '' : 'PO_CLOSED',
      });
    }

    return variances;
  }

  // ── Private: matchLineItems ───────────────────────────────────────────────

  private matchLineItems(
    invLines: InvoiceLineRow[],
    poLines: POLineRow[],
    grnLines: GRNLineRow[],
    tolerance: MatchToleranceConfig,
  ): VarianceRecord[] {
    const variances: VarianceRecord[] = [];

    for (const invLine of invLines) {
      // Match PO line: prefer item_code, then fall back to description / line_number
      const poLine = poLines.find(
        (p) =>
          (invLine.item_code && p.item_code && invLine.item_code === p.item_code) ||
          invLine.line_number === p.line_number ||
          invLine.description.toLowerCase() === p.description.toLowerCase(),
      ) ?? null;

      // Match GRN line
      const grnLine = grnLines.find(
        (g) =>
          (invLine.item_code && g.item_code && invLine.item_code === g.item_code) ||
          invLine.line_number === g.line_number ||
          invLine.description.toLowerCase() === g.description.toLowerCase(),
      ) ?? null;

      const linePrefix = `line_${invLine.line_number}`;

      // ── Qty vs PO ─────────────────────────────────────────────────────────
      {
        const invQty = invLine.quantity;
        const poQty = poLine ? poLine.quantity : invQty;
        const diff = invQty - poQty;
        const pct = pctDiff(invQty, poQty);
        const ok = withinPct(invQty, poQty, tolerance.quantityTolerancePct);
        variances.push({
          fieldName: `${linePrefix}.quantity_vs_po`,
          poValue: String(poQty),
          invoiceValue: String(invQty),
          grnValue: grnLine ? String(grnLine.accepted_quantity) : '',
          varianceAmount: diff,
          variancePct: pct,
          withinTolerance: ok,
          varianceType: ok ? '' : 'QTY_VARIANCE',
        });
      }

      // ── Qty vs GRN accepted quantity ──────────────────────────────────────
      if (grnLine) {
        const invQty = invLine.quantity;
        const grnQty = grnLine.accepted_quantity;
        const diff = invQty - grnQty;
        const pct = pctDiff(invQty, grnQty);
        const ok = withinPct(invQty, grnQty, tolerance.quantityTolerancePct);
        variances.push({
          fieldName: `${linePrefix}.quantity_vs_grn`,
          poValue: poLine ? String(poLine.quantity) : '',
          invoiceValue: String(invQty),
          grnValue: String(grnQty),
          varianceAmount: diff,
          variancePct: pct,
          withinTolerance: ok,
          varianceType: ok ? '' : 'QTY_VARIANCE',
        });
      }

      // ── Unit price vs PO ──────────────────────────────────────────────────
      {
        const invPrice = invLine.unit_price;
        const poPrice = poLine ? poLine.unit_price : invPrice;
        const diff = invPrice - poPrice;
        const pct = pctDiff(invPrice, poPrice);
        const ok = withinPct(invPrice, poPrice, tolerance.unitPriceTolerancePct);
        variances.push({
          fieldName: `${linePrefix}.unit_price`,
          poValue: String(poPrice),
          invoiceValue: String(invPrice),
          grnValue: '',
          varianceAmount: diff,
          variancePct: pct,
          withinTolerance: ok,
          varianceType: ok ? '' : 'PRICE_VARIANCE',
        });
      }

      // ── Tax rates — must match exactly (blocking) ─────────────────────────
      if (poLine) {
        const cgstOk = invLine.cgst_rate === poLine.cgst_rate;
        const sgstOk = invLine.sgst_rate === poLine.sgst_rate;
        const igstOk = invLine.igst_rate === poLine.igst_rate;
        const taxOk = cgstOk && sgstOk && igstOk;
        const invTaxStr = `CGST:${invLine.cgst_rate}%/SGST:${invLine.sgst_rate}%/IGST:${invLine.igst_rate}%`;
        const poTaxStr = `CGST:${poLine.cgst_rate}%/SGST:${poLine.sgst_rate}%/IGST:${poLine.igst_rate}%`;
        variances.push({
          fieldName: `${linePrefix}.tax_rates`,
          poValue: poTaxStr,
          invoiceValue: invTaxStr,
          grnValue: '',
          varianceAmount: 0,
          variancePct: taxOk ? 0 : 100,
          withinTolerance: taxOk,
          varianceType: taxOk ? '' : 'TAX_VARIANCE',
        });
      }

      // ── Line total within tolerance ───────────────────────────────────────
      {
        const invTotal = invLine.line_total;
        const poTotal = poLine ? poLine.line_total : invTotal;
        const diff = invTotal - poTotal;
        const pct = pctDiff(invTotal, poTotal);
        const ok = withinPct(invTotal, poTotal, tolerance.amountTolerancePct);
        variances.push({
          fieldName: `${linePrefix}.line_total`,
          poValue: String(poTotal),
          invoiceValue: String(invTotal),
          grnValue: '',
          varianceAmount: diff,
          variancePct: pct,
          withinTolerance: ok,
          varianceType: ok ? '' : 'PRICE_VARIANCE',
        });
      }
    }

    return variances;
  }

  // ── Private: computeMatchScore ────────────────────────────────────────────

  private computeMatchScore(variances: VarianceRecord[], totalFields: number): number {
    if (totalFields === 0) return 100;
    const outOfTolerance = variances.filter((v) => !v.withinTolerance && v.varianceType !== '').length;
    const actualTotal = Math.max(totalFields, variances.length);
    return ((actualTotal - outOfTolerance) / actualTotal) * 100;
  }

  // ── Private: determineMatchStatus ─────────────────────────────────────────

  private determineMatchStatus(
    score: number,
    hasBlockingVariance: boolean,
  ): 'matched' | 'partial' | 'unmatched' | 'disputed' {
    if (hasBlockingVariance) return 'disputed';
    if (score >= 98) return 'matched';
    if (score >= 70) return 'partial';
    return 'unmatched';
  }

  // ── Private: createException ──────────────────────────────────────────────

  private async createException(invoice: InvoiceRow, result: MatchResult): Promise<void> {
    // Determine primary reason code from the worst variance
    const blockingVariance = result.variances.find(
      (v) => !v.withinTolerance && v.varianceType !== '',
    );

    let reasonCode = 'UNMATCHED';
    let description = 'Invoice could not be matched';

    if (!result.poId) {
      reasonCode = 'MISSING_PO';
      description = `No purchase order found for invoice reference: ${invoice.po_reference ?? 'unknown'}`;
    } else if (!result.grnId) {
      reasonCode = 'MISSING_GRN';
      description = `No goods receipt note found for invoice reference: ${invoice.grn_reference ?? 'unknown'}`;
    } else if (blockingVariance) {
      reasonCode = blockingVariance.varianceType;
      description = `Match failed on field '${blockingVariance.fieldName}': PO=${blockingVariance.poValue}, Invoice=${blockingVariance.invoiceValue} (variance ${blockingVariance.variancePct.toFixed(2)}%)`;
    }

    await this.pool.query(
      `INSERT INTO entity_exceptions (
         tenant_id, entity_id, exception_key, title, invoice_ref,
         reason_code, amount_num, status, data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8::jsonb)
       ON CONFLICT (entity_id, exception_key)
       DO UPDATE SET
         reason_code = EXCLUDED.reason_code,
         title = EXCLUDED.title,
         invoice_ref = EXCLUDED.invoice_ref,
         amount_num = EXCLUDED.amount_num,
         data = EXCLUDED.data,
         status = 'open',
         updated_at = NOW()`,
      [
        this.tenantId,
        this.entityId,
        `MATCH-${result.invoiceId}`,
        description,
        invoice.source_ref,
        reasonCode,
        result.totalVariance,
        JSON.stringify({
          invoice_id: result.invoiceId,
          match_score_pct: result.matchScorePct,
          total_variance: result.totalVariance,
          variance_count: result.variances.length,
        }),
      ],
    );
  }

  // ── Private: saveMatchResult ──────────────────────────────────────────────

  private async saveMatchResult(result: MatchResult): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert ap_document_matches
      const matchInsert = await client.query(
        `INSERT INTO ap_document_matches (
           tenant_id, entity_id,
           invoice_id, po_id, grn_id, inspection_id,
           match_type, match_status,
           match_score_pct, total_variance, auto_resolved,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
         ON CONFLICT (invoice_id)
         DO UPDATE SET
           po_id = EXCLUDED.po_id,
           grn_id = EXCLUDED.grn_id,
           inspection_id = EXCLUDED.inspection_id,
           match_type = EXCLUDED.match_type,
           match_status = EXCLUDED.match_status,
           match_score_pct = EXCLUDED.match_score_pct,
           total_variance = EXCLUDED.total_variance,
           auto_resolved = EXCLUDED.auto_resolved,
           updated_at = NOW()
         RETURNING id`,
        [
          this.tenantId,
          this.entityId,
          result.invoiceId,
          result.poId,
          result.grnId,
          result.inspectionId,
          result.matchType,
          result.matchStatus,
          result.matchScorePct,
          result.totalVariance,
          result.autoResolved,
        ],
      );

      const matchId: string = matchInsert.rows[0]?.id;

      if (matchId && result.variances.length > 0) {
        // Delete old variances and re-insert
        await client.query('DELETE FROM ap_match_variances WHERE match_id = $1', [matchId]);

        for (const v of result.variances) {
          if (v.varianceType === '') continue; // Skip clean fields
          const varianceType =
            v.varianceType === 'QTY_VARIANCE' ? 'quantity' :
            v.varianceType === 'PRICE_VARIANCE' ? 'unit_price' :
            v.varianceType === 'TAX_VARIANCE' ? 'tax_rate' :
            v.varianceType === 'PO_CLOSED' ? 'other' :
            v.varianceType === 'GSTIN_MISMATCH' ? 'other' :
            v.varianceType === 'CURRENCY_MISMATCH' ? 'other' : 'other';
          await client.query(
            `INSERT INTO ap_match_variances (
               match_id, tenant_id, entity_id, field_name,
               po_value, invoice_value, grn_value,
               variance_amount, variance_pct,
               within_tolerance, variance_type,
               created_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
            [
              matchId,
              this.tenantId,
              this.entityId,
              v.fieldName,
              v.poValue,
              v.invoiceValue,
              v.grnValue,
              v.varianceAmount,
              v.variancePct,
              v.withinTolerance,
              varianceType,
            ],
          );
        }
      }

      // Update invoice status
      let newStatus: string;
      switch (result.matchStatus) {
        case 'matched':
          newStatus = result.autoResolved ? 'approved' : 'matched';
          break;
        case 'partial':
          newStatus = 'under_review';
          break;
        case 'disputed':
          newStatus = 'disputed';
          break;
        default:
          newStatus = 'unmatched';
      }

      await client.query(
        `UPDATE ap_invoices
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [newStatus, result.invoiceId],
      );

      const cacheStatus =
        result.matchStatus === 'matched' ? 'matched' :
        result.matchStatus === 'partial' ? 'partial' :
        result.matchStatus === 'disputed' ? 'disputed' : 'unmatched';
      await client.query(
      `UPDATE entity_invoices
         SET match_status = $1,
             variance_amount = $2,
             data = jsonb_set(
               jsonb_set(COALESCE(data, '{}'::jsonb), '{ap_invoice_status}', to_jsonb($3::text), true),
               '{match_score_pct}', to_jsonb($4::numeric), true
             ),
             updated_at = NOW()
         WHERE tenant_id = $5
           AND entity_id = $6
         AND data->>'ap_invoice_id' = $7::text`,
        [
          cacheStatus,
          result.totalVariance,
          newStatus,
          result.matchScorePct,
          this.tenantId,
          this.entityId,
          result.invoiceId,
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// ── Module-level entry point ───────────────────────────────────────────────

/**
 * Load entity tolerance config from entity_matching_policies, create a MatchEngine,
 * and run matchAllPending().
 */
export async function runEntityMatch(
  pool: Pool,
  tenantId: string,
  entityId: string,
  toleranceConfig?: Partial<MatchToleranceConfig>,
): Promise<MatchResult[]> {
  // Try to load per-entity policy from DB
  let tolerance: MatchToleranceConfig = { ...DEFAULT_TOLERANCE };

  let requiredMatchType: MatchResult['matchType'] = 'three_way';
  try {
    const policyRes = await pool.query(
      `SELECT matching_method, amount_tolerance_pct, quantity_tolerance_pct,
              unit_price_tolerance_pct, tax_tolerance_pct,
              auto_approve_if_within_tolerance
       FROM entity_matching_policies
       WHERE tenant_id = $1 AND entity_id = $2
       LIMIT 1`,
      [tenantId, entityId],
    );

    if (policyRes.rowCount && policyRes.rowCount > 0) {
      const row = policyRes.rows[0];
      requiredMatchType = row.matching_method === 'two_way'
        ? 'two_way'
        : row.matching_method === 'four_way' ? 'four_way' : 'three_way';
      tolerance = {
        amountTolerancePct: Number(row.amount_tolerance_pct ?? DEFAULT_TOLERANCE.amountTolerancePct),
        quantityTolerancePct: Number(row.quantity_tolerance_pct ?? DEFAULT_TOLERANCE.quantityTolerancePct),
        unitPriceTolerancePct: Number(row.unit_price_tolerance_pct ?? DEFAULT_TOLERANCE.unitPriceTolerancePct),
        taxTolerancePct: Number(row.tax_tolerance_pct ?? DEFAULT_TOLERANCE.taxTolerancePct),
        autoApproveIfWithinTolerance: Boolean(row.auto_approve_if_within_tolerance ?? DEFAULT_TOLERANCE.autoApproveIfWithinTolerance),
      };
    }
  } catch {
    // Table may not exist yet; fall through to defaults
  }

  // Allow caller to override individual fields
  if (toleranceConfig) {
    tolerance = { ...tolerance, ...toleranceConfig };
  }

  const engine = new MatchEngine(pool, tenantId, entityId, tolerance, requiredMatchType);
  return engine.matchAllPending();
}
