/**
 * connectors/vendor-portal.connector.ts
 * Generic REST API connector that fetches invoices and purchase orders
 * from external vendor portals and syncs them into AP tables.
 */

import type { Pool } from 'pg';
import type {
  VendorPortalConfig,
  NormalizedDocument,
  NormalizedLineItem,
  ConnectorSyncResult,
} from './types.js';

// ── Internal helpers ───────────────────────────────────────────────────────

interface RawVendorInvoice {
  invoice_no?: string;
  invoice_number?: string;
  id?: string;
  invoice_date?: string;
  date?: string;
  due_date?: string;
  vendor_code?: string;
  vendor_name?: string;
  gstin?: string;
  currency?: string;
  subtotal?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  cess_amount?: number;
  total_amount?: number;
  amount?: number;
  po_number?: string;
  po_reference?: string;
  grn_reference?: string;
  eway_bill_number?: string;
  line_items?: RawVendorLineItem[];
  items?: RawVendorLineItem[];
  [key: string]: unknown;
}

interface RawVendorPO {
  po_number?: string;
  purchase_order_number?: string;
  id?: string;
  po_date?: string;
  date?: string;
  vendor_code?: string;
  vendor_name?: string;
  gstin?: string;
  currency?: string;
  subtotal?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  cess_amount?: number;
  total_amount?: number;
  amount?: number;
  line_items?: RawVendorLineItem[];
  items?: RawVendorLineItem[];
  [key: string]: unknown;
}

interface RawVendorLineItem {
  line_number?: number;
  line_no?: number;
  item_code?: string;
  sku?: string;
  description?: string;
  name?: string;
  hsn_sac_code?: string;
  hsn?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  uom?: string;
  unit_price?: number;
  price?: number;
  rate?: number;
  discount_pct?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cess_rate?: number;
  line_subtotal?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  cess_amount?: number;
  line_total?: number;
  total?: number;
  amount?: number;
  [key: string]: unknown;
}

interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

// ── VendorPortalConnector ──────────────────────────────────────────────────

export class VendorPortalConnector {
  private readonly startedAt: Date;

  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
    private readonly entityId: string,
    private readonly config: VendorPortalConfig,
  ) {
    this.startedAt = new Date();
  }

  // ── Public: sync ─────────────────────────────────────────────────────────

  async sync(): Promise<ConnectorSyncResult> {
    const result: ConnectorSyncResult = {
      source: 'vendor',
      entityKey: this.entityId,
      startedAt: this.startedAt,
      status: 'success',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      documents: [],
    };

    try {
      const token = await this.authenticate();

      const [invoices, purchaseOrders] = await Promise.all([
        this.fetchInvoices(token),
        this.fetchPurchaseOrders(token),
      ]);

      const allDocs = [...invoices, ...purchaseOrders];
      result.fetched = allDocs.length;

      const upsertResult = await this.upsertToDatabase(allDocs);
      result.inserted = upsertResult.inserted;
      result.skipped = upsertResult.skipped;
      result.documents = allDocs;
      result.status = 'success';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(message);
      result.status = result.inserted > 0 ? 'partial' : 'failed';
    }

    result.completedAt = new Date();
    return result;
  }

  // ── Private: authenticate ─────────────────────────────────────────────────

  private async authenticate(): Promise<string> {
    const { authType, bearerToken, username, password, oauthClientId, oauthClientSecret, oauthTokenUrl } =
      this.config;

    if (authType === 'bearer') {
      if (!bearerToken) throw new Error('VendorPortal: bearerToken required for bearer auth');
      return bearerToken;
    }

    if (authType === 'basic') {
      if (!username || !password) throw new Error('VendorPortal: username and password required for basic auth');
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      return `Basic ${credentials}`;
    }

    if (authType === 'oauth2') {
      if (!oauthClientId || !oauthClientSecret || !oauthTokenUrl) {
        throw new Error('VendorPortal: oauthClientId, oauthClientSecret, and oauthTokenUrl required for oauth2');
      }

      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: oauthClientId,
        client_secret: oauthClientSecret,
      });

      const response = await fetch(oauthTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`VendorPortal OAuth2 token request failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = (await response.json()) as OAuth2TokenResponse;
      if (!tokenData.access_token) {
        throw new Error('VendorPortal OAuth2: access_token not returned');
      }

      return `Bearer ${tokenData.access_token}`;
    }

    throw new Error(`VendorPortal: unsupported authType '${authType}'`);
  }

  // ── Private: fetchInvoices ────────────────────────────────────────────────

  private async fetchInvoices(token: string): Promise<NormalizedDocument[]> {
    const { portalUrl } = this.config;
    const results: NormalizedDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${portalUrl}/api/invoices?status=pending&page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: token,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`VendorPortal fetchInvoices failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { data?: RawVendorInvoice[]; items?: RawVendorInvoice[] } | RawVendorInvoice[];

      let rawInvoices: RawVendorInvoice[];
      if (Array.isArray(data)) {
        rawInvoices = data;
        hasMore = data.length > 0;
      } else {
        rawInvoices = (data.data ?? data.items ?? []) as RawVendorInvoice[];
        hasMore = rawInvoices.length > 0;
      }

      if (rawInvoices.length === 0) {
        hasMore = false;
        break;
      }

      for (const raw of rawInvoices) {
        results.push(this.mapVendorInvoice(raw));
      }

      page++;
    }

    return results;
  }

  // ── Private: fetchPurchaseOrders ──────────────────────────────────────────

  private async fetchPurchaseOrders(token: string): Promise<NormalizedDocument[]> {
    const { portalUrl } = this.config;
    const results: NormalizedDocument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${portalUrl}/api/purchase-orders?page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: token,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`VendorPortal fetchPurchaseOrders failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { data?: RawVendorPO[]; items?: RawVendorPO[] } | RawVendorPO[];

      let rawPOs: RawVendorPO[];
      if (Array.isArray(data)) {
        rawPOs = data;
        hasMore = data.length > 0;
      } else {
        rawPOs = (data.data ?? data.items ?? []) as RawVendorPO[];
        hasMore = rawPOs.length > 0;
      }

      if (rawPOs.length === 0) {
        hasMore = false;
        break;
      }

      for (const raw of rawPOs) {
        results.push(this.mapVendorPO(raw));
      }

      page++;
    }

    return results;
  }

  // ── Private: mapVendorInvoice ─────────────────────────────────────────────

  private mapVendorInvoice(raw: RawVendorInvoice): NormalizedDocument {
    const rawLines: RawVendorLineItem[] = raw.line_items ?? raw.items ?? [];
    const lineItems: NormalizedLineItem[] = rawLines.map((l, idx) => this.mapLineItem(l, idx));

    const totalAmount = Math.max(Number(raw.total_amount ?? raw.amount ?? 0), 0);
    const subtotal = Math.max(Number(raw.subtotal ?? totalAmount), 0);

    return {
      type: 'invoice',
      sourceRef: String(raw.invoice_no ?? raw.invoice_number ?? raw.id ?? ''),
      sourceChannel: 'vendor',
      vendorCode: raw.vendor_code ? String(raw.vendor_code) : undefined,
      vendorName: raw.vendor_name ? String(raw.vendor_name) : undefined,
      gstin: raw.gstin ? String(raw.gstin) : undefined,
      documentDate: String(raw.invoice_date ?? raw.date ?? new Date().toISOString().slice(0, 10)),
      dueDate: raw.due_date ? String(raw.due_date) : undefined,
      currency: String(raw.currency ?? 'INR'),
      subtotal,
      cgstAmount: Number(raw.cgst_amount ?? 0),
      sgstAmount: Number(raw.sgst_amount ?? 0),
      igstAmount: Number(raw.igst_amount ?? 0),
      cessAmount: Number(raw.cess_amount ?? 0),
      totalAmount,
      poReference: raw.po_number ? String(raw.po_number) : raw.po_reference ? String(raw.po_reference) : undefined,
      grnReference: raw.grn_reference ? String(raw.grn_reference) : undefined,
      ewayBillNumber: raw.eway_bill_number ? String(raw.eway_bill_number) : undefined,
      lineItems,
      rawPayload: raw as Record<string, unknown>,
    };
  }

  // ── Private: mapVendorPO ──────────────────────────────────────────────────

  private mapVendorPO(raw: RawVendorPO): NormalizedDocument {
    const rawLines: RawVendorLineItem[] = raw.line_items ?? raw.items ?? [];
    const lineItems: NormalizedLineItem[] = rawLines.map((l, idx) => this.mapLineItem(l, idx));

    const totalAmount = Math.max(Number(raw.total_amount ?? raw.amount ?? 0), 0);
    const subtotal = Math.max(Number(raw.subtotal ?? totalAmount), 0);

    return {
      type: 'purchase_order',
      sourceRef: String(raw.po_number ?? raw.purchase_order_number ?? raw.id ?? ''),
      sourceChannel: 'vendor',
      vendorCode: raw.vendor_code ? String(raw.vendor_code) : undefined,
      vendorName: raw.vendor_name ? String(raw.vendor_name) : undefined,
      gstin: raw.gstin ? String(raw.gstin) : undefined,
      documentDate: String(raw.po_date ?? raw.date ?? new Date().toISOString().slice(0, 10)),
      currency: String(raw.currency ?? 'INR'),
      subtotal,
      cgstAmount: Number(raw.cgst_amount ?? 0),
      sgstAmount: Number(raw.sgst_amount ?? 0),
      igstAmount: Number(raw.igst_amount ?? 0),
      cessAmount: Number(raw.cess_amount ?? 0),
      totalAmount,
      lineItems,
      rawPayload: raw as Record<string, unknown>,
    };
  }

  // ── Private: mapLineItem ──────────────────────────────────────────────────

  private mapLineItem(raw: RawVendorLineItem, fallbackIndex: number): NormalizedLineItem {
    const quantity = Math.max(Number(raw.quantity ?? raw.qty ?? 0), 0);
    const unitPrice = Math.max(Number(raw.unit_price ?? raw.price ?? raw.rate ?? 0), 0);
    const cgstRate = Math.max(Number(raw.cgst_rate ?? 0), 0);
    const sgstRate = Math.max(Number(raw.sgst_rate ?? 0), 0);
    const igstRate = Math.max(Number(raw.igst_rate ?? 0), 0);
    const cessRate = Math.max(Number(raw.cess_rate ?? 0), 0);
    const discountPct = Math.min(Math.max(Number(raw.discount_pct ?? 0), 0), 100);
    const lineSubtotal = quantity * unitPrice * (1 - discountPct / 100);
    const cgstAmount = Math.max(Number(raw.cgst_amount ?? lineSubtotal * (cgstRate / 100)), 0);
    const sgstAmount = Math.max(Number(raw.sgst_amount ?? lineSubtotal * (sgstRate / 100)), 0);
    const igstAmount = Math.max(Number(raw.igst_amount ?? lineSubtotal * (igstRate / 100)), 0);
    const cessAmount = Math.max(Number(raw.cess_amount ?? lineSubtotal * (cessRate / 100)), 0);
    const lineTotal = Math.max(Number(raw.line_total ?? raw.total ?? raw.amount ?? lineSubtotal + cgstAmount + sgstAmount + igstAmount + cessAmount), 0);

    return {
      lineNumber: Number(raw.line_number ?? raw.line_no ?? fallbackIndex + 1),
      itemCode: raw.item_code ? String(raw.item_code) : raw.sku ? String(raw.sku) : undefined,
      description: String(raw.description ?? raw.name ?? ''),
      hsnSacCode: raw.hsn_sac_code ? String(raw.hsn_sac_code) : raw.hsn ? String(raw.hsn) : undefined,
      quantity,
      unit: String(raw.unit ?? raw.uom ?? 'EA'),
      unitPrice,
      discountPct,
      cgstRate,
      sgstRate,
      igstRate,
      cessRate,
      lineSubtotal,
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessAmount,
      lineTotal,
    };
  }

  // ── Private: upsertToDatabase ─────────────────────────────────────────────

  private async upsertToDatabase(
    docs: NormalizedDocument[],
  ): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const doc of docs) {
        if (doc.type === 'invoice') {
          const vendorId = await this.ensureVendor(client, doc);
          const invoice = await client.query<{ id: string }>(
            `INSERT INTO ap_invoices (
               tenant_id, entity_id, vendor_id, invoice_number,
               invoice_date, due_date, currency,
               subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount,
               source_channel, po_ref, grn_ref, metadata, status
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'received'
             )
             ON CONFLICT (entity_id, invoice_number)
             DO UPDATE SET
               vendor_id = COALESCE(EXCLUDED.vendor_id, ap_invoices.vendor_id),
               invoice_date = EXCLUDED.invoice_date,
               due_date = COALESCE(EXCLUDED.due_date, ap_invoices.due_date),
               currency = EXCLUDED.currency,
               subtotal = EXCLUDED.subtotal,
               cgst_amount = EXCLUDED.cgst_amount,
               sgst_amount = EXCLUDED.sgst_amount,
               igst_amount = EXCLUDED.igst_amount,
               cess_amount = EXCLUDED.cess_amount,
               total_amount = EXCLUDED.total_amount,
               source_channel = EXCLUDED.source_channel,
               po_ref = COALESCE(EXCLUDED.po_ref, ap_invoices.po_ref),
               grn_ref = COALESCE(EXCLUDED.grn_ref, ap_invoices.grn_ref),
               metadata = EXCLUDED.metadata,
               updated_at = NOW()
             RETURNING id`,
            [
              this.tenantId,
              this.entityId,
              vendorId,
              doc.sourceRef,
              doc.documentDate,
              doc.dueDate ?? null,
              doc.currency,
              doc.subtotal,
              doc.cgstAmount,
              doc.sgstAmount,
              doc.igstAmount,
              doc.cessAmount,
              doc.totalAmount,
              doc.sourceChannel,
              doc.poReference ?? null,
              doc.grnReference ?? null,
              JSON.stringify({ ...doc.rawPayload, ewayBillNumber: doc.ewayBillNumber ?? null }),
            ],
          );

          await this.upsertInvoiceLines(client, invoice.rows[0].id, doc);
          await this.upsertInvoiceCache(client, doc);
          inserted++;
        } else if (doc.type === 'purchase_order') {
          const vendorId = await this.ensureVendor(client, doc);
          const po = await client.query<{ id: string }>(
            `INSERT INTO ap_purchase_orders (
               tenant_id, entity_id, vendor_id, po_number, po_date, currency,
               subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount,
               source_system, status, metadata
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'portal','issued',$13
             )
             ON CONFLICT (entity_id, po_number)
             DO UPDATE SET
               vendor_id = COALESCE(EXCLUDED.vendor_id, ap_purchase_orders.vendor_id),
               po_date = EXCLUDED.po_date,
               currency = EXCLUDED.currency,
               subtotal = EXCLUDED.subtotal,
               cgst_amount = EXCLUDED.cgst_amount,
               sgst_amount = EXCLUDED.sgst_amount,
               igst_amount = EXCLUDED.igst_amount,
               cess_amount = EXCLUDED.cess_amount,
               total_amount = EXCLUDED.total_amount,
               metadata = EXCLUDED.metadata,
               updated_at = NOW()
             RETURNING id`,
            [
              this.tenantId,
              this.entityId,
              vendorId,
              doc.sourceRef,
              doc.documentDate,
              doc.currency,
              doc.subtotal,
              doc.cgstAmount,
              doc.sgstAmount,
              doc.igstAmount,
              doc.cessAmount,
              doc.totalAmount,
              JSON.stringify(doc.rawPayload),
            ],
          );

          await this.upsertPurchaseOrderLines(client, po.rows[0].id, doc);
          inserted++;
        } else {
          skipped++;
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { inserted, skipped };
  }

  private async ensureVendor(client: { query: Function }, doc: NormalizedDocument): Promise<string | null> {
    if (!doc.vendorCode && !doc.vendorName) return null;
    const vendorCode = doc.vendorCode ?? `PORTAL-${doc.vendorName!.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40).toUpperCase()}`;
    const legalName = doc.vendorName ?? doc.vendorCode ?? vendorCode;
    const result = await client.query(
      `INSERT INTO ap_vendors
         (tenant_id, entity_id, vendor_code, legal_name, gstin, status)
       VALUES ($1,$2,$3,$4,$5,'active')
       ON CONFLICT (entity_id, vendor_code)
       DO UPDATE SET
         legal_name = COALESCE(EXCLUDED.legal_name, ap_vendors.legal_name),
         gstin = COALESCE(EXCLUDED.gstin, ap_vendors.gstin),
         updated_at = NOW()
       RETURNING id`,
      [this.tenantId, this.entityId, vendorCode, legalName, doc.gstin ?? null],
    );
    return result.rows[0]?.id ?? null;
  }

  private async upsertInvoiceLines(
    client: { query: Function },
    invoiceId: string,
    doc: NormalizedDocument,
  ): Promise<void> {
    for (const line of doc.lineItems) {
      await client.query(
        `INSERT INTO ap_invoice_line_items (
           invoice_id, tenant_id, entity_id, line_number, item_code, description,
           hsn_sac_code, quantity, unit, unit_price, discount_pct,
           cgst_rate, sgst_rate, igst_rate, cess_rate,
           line_subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (invoice_id, line_number)
         DO UPDATE SET
           description = EXCLUDED.description,
           quantity = EXCLUDED.quantity,
           unit_price = EXCLUDED.unit_price,
           line_subtotal = EXCLUDED.line_subtotal,
           cgst_amount = EXCLUDED.cgst_amount,
           sgst_amount = EXCLUDED.sgst_amount,
           igst_amount = EXCLUDED.igst_amount,
           cess_amount = EXCLUDED.cess_amount,
           line_total = EXCLUDED.line_total`,
        [
          invoiceId, this.tenantId, this.entityId, line.lineNumber,
          line.itemCode ?? null, line.description || 'Item', line.hsnSacCode ?? null,
          Math.max(line.quantity, 0.001), line.unit, Math.max(line.unitPrice, 0), line.discountPct,
          line.cgstRate, line.sgstRate, line.igstRate, line.cessRate,
          line.lineSubtotal, line.cgstAmount, line.sgstAmount, line.igstAmount,
          line.cessAmount, line.lineTotal,
        ],
      );
    }
  }

  private async upsertPurchaseOrderLines(
    client: { query: Function },
    poId: string,
    doc: NormalizedDocument,
  ): Promise<void> {
    for (const line of doc.lineItems) {
      await client.query(
        `INSERT INTO ap_po_line_items (
           po_id, tenant_id, entity_id, line_number, item_code, description,
           hsn_sac_code, quantity, unit, unit_price, discount_pct,
           cgst_rate, sgst_rate, igst_rate, cess_rate,
           line_subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (po_id, line_number)
         DO UPDATE SET
           description = EXCLUDED.description,
           quantity = EXCLUDED.quantity,
           unit_price = EXCLUDED.unit_price,
           line_subtotal = EXCLUDED.line_subtotal,
           cgst_amount = EXCLUDED.cgst_amount,
           sgst_amount = EXCLUDED.sgst_amount,
           igst_amount = EXCLUDED.igst_amount,
           cess_amount = EXCLUDED.cess_amount,
           line_total = EXCLUDED.line_total`,
        [
          poId, this.tenantId, this.entityId, line.lineNumber,
          line.itemCode ?? null, line.description || 'Item', line.hsnSacCode ?? null,
          Math.max(line.quantity, 0.001), line.unit, Math.max(line.unitPrice, 0), line.discountPct,
          line.cgstRate, line.sgstRate, line.igstRate, line.cessRate,
          line.lineSubtotal, line.cgstAmount, line.sgstAmount, line.igstAmount,
          line.cessAmount, line.lineTotal,
        ],
      );
    }
  }

  private async upsertInvoiceCache(
    client: { query: Function },
    doc: NormalizedDocument,
  ): Promise<void> {
    await client.query(
      `INSERT INTO entity_invoices (
         tenant_id, entity_id, invoice_key, vendor_name, gstin, amount_num,
         po_ref, grn_ref, match_status, invoice_date, data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10::jsonb)
       ON CONFLICT (entity_id, invoice_key)
       DO UPDATE SET
         vendor_name = EXCLUDED.vendor_name,
         gstin = EXCLUDED.gstin,
         amount_num = EXCLUDED.amount_num,
         po_ref = EXCLUDED.po_ref,
         grn_ref = EXCLUDED.grn_ref,
         invoice_date = EXCLUDED.invoice_date,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [
        this.tenantId, this.entityId, doc.sourceRef,
        doc.vendorName ?? doc.vendorCode ?? 'Vendor Portal',
        doc.gstin ?? null, doc.totalAmount,
        doc.poReference ?? null, doc.grnReference ?? null,
        doc.documentDate,
        JSON.stringify({ ...doc.rawPayload, source_channel: doc.sourceChannel }),
      ],
    );
  }
}

// ── Module-level entry point ───────────────────────────────────────────────

export async function syncEntityFromVendorPortal(
  pool: Pool,
  tenantId: string,
  entityId: string,
  config: VendorPortalConfig,
): Promise<ConnectorSyncResult> {
  const connector = new VendorPortalConnector(pool, tenantId, entityId, config);
  return connector.sync();
}
