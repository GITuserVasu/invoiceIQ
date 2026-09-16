/**
 * connectors/sap.connector.ts
 *
 * SAP integration module supporting:
 *  1. SAP S/4HANA OData v4 (and legacy ECC OData v2) via REST API
 *  2. SAP HANA direct-DB queries via HANA REST/XS engine
 *
 * Fetches Purchase Orders, Goods Receipts, Supplier Invoices, and Vendor Master.
 * Normalizes data to shared types and upserts into AP tables scoped to (tenant_id, entity_id).
 *
 * Requires Node.js 18+ (uses built-in fetch).
 */

import type { Pool } from 'pg';
import type {
  SapODataConfig,
  SapHanaConfig,
  NormalizedDocument,
  NormalizedLineItem,
  ConnectorSyncResult,
} from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFloat(val: unknown): number {
  const n = parseFloat(String(val ?? '0'));
  return isNaN(n) ? 0 : n;
}

function toInt(val: unknown): number {
  const n = parseInt(String(val ?? '0'), 10);
  return isNaN(n) ? 0 : n;
}

function nonNegative(val: number): number {
  return Number.isFinite(val) ? Math.max(0, val) : 0;
}

function isoDate(val: unknown): string {
  if (!val) return new Date().toISOString().split('T')[0];
  // SAP OData dates can arrive as "/Date(1234567890000)/" or "2024-01-15"
  const s = String(val);
  const msMatch = s.match(/\/Date\((\d+)\)\//);
  if (msMatch) return new Date(parseInt(msMatch[1], 10)).toISOString().split('T')[0];
  return s.split('T')[0];
}

function buildAuthHeader(config: SapODataConfig, token?: string): Record<string, string> {
  if (token) return { Authorization: `Bearer ${token}` };
  if (config.clientId && config.clientSecret) {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  if (config.username && config.password) {
    const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  return {};
}

// ─── SAP OData Connector ──────────────────────────────────────────────────────

export class SapODataConnector {
  constructor(
    private pool: Pool,
    private tenantId: string,
    private entityId: string,
    private config: SapODataConfig,
  ) {}

  // ── Public entry point ──────────────────────────────────────────────────────

  async sync(): Promise<ConnectorSyncResult> {
    const result: ConnectorSyncResult = {
      source: 'sap',
      entityKey: `${this.tenantId}::${this.entityId}`,
      startedAt: new Date(),
      status: 'success',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      documents: [],
    };

    let token: string | undefined;
    try {
      token = await this.fetchAccessToken();
    } catch (err) {
      result.errors.push(`Auth failed: ${(err as Error).message}`);
      result.status = 'failed';
      result.completedAt = new Date();
      return result;
    }

    const docTypes = (this.config.docTypes ?? 'invoices,po,grn,vendors')
      .split(',')
      .map((d) => d.trim().toLowerCase());

    // ── Purchase Orders ───────────────────────────────────────────────────────
    if (docTypes.includes('po') || docTypes.includes('purchase_order')) {
      try {
        const pos = await this.fetchPurchaseOrders(token);
        result.fetched += pos.length;
        for (const doc of pos) {
          try {
            await this.upsertPurchaseOrder(doc);
            result.inserted++;
            result.documents.push(doc);
          } catch (err) {
            result.skipped++;
            result.errors.push(`PO upsert ${doc.sourceRef}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        result.errors.push(`Fetch POs failed: ${(err as Error).message}`);
      }
    }

    // ── Goods Receipts ────────────────────────────────────────────────────────
    if (docTypes.includes('grn') || docTypes.includes('goods_receipt')) {
      try {
        const grns = await this.fetchGoodsReceipts(token);
        result.fetched += grns.length;
        for (const doc of grns) {
          try {
            await this.upsertGoodsReceipt(doc);
            result.inserted++;
            result.documents.push(doc);
          } catch (err) {
            result.skipped++;
            result.errors.push(`GRN upsert ${doc.sourceRef}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        result.errors.push(`Fetch GRNs failed: ${(err as Error).message}`);
      }
    }

    // ── Supplier Invoices ─────────────────────────────────────────────────────
    if (docTypes.includes('invoices') || docTypes.includes('invoice')) {
      try {
        const invoices = await this.fetchSupplierInvoices(token);
        result.fetched += invoices.length;
        for (const doc of invoices) {
          try {
            await this.upsertInvoice(doc);
            result.inserted++;
            result.documents.push(doc);
          } catch (err) {
            result.skipped++;
            result.errors.push(`Invoice upsert ${doc.sourceRef}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        result.errors.push(`Fetch invoices failed: ${(err as Error).message}`);
      }
    }

    // ── Vendor Master ─────────────────────────────────────────────────────────
    if (docTypes.includes('vendors') || docTypes.includes('vendor')) {
      try {
        await this.fetchVendorMaster(token);
      } catch (err) {
        result.errors.push(`Fetch vendors failed: ${(err as Error).message}`);
      }
    }

    result.completedAt = new Date();
    if (result.errors.length > 0 && result.inserted === 0) result.status = 'failed';
    else if (result.errors.length > 0) result.status = 'partial';

    return result;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  /**
   * Obtains a Bearer token from SAP BTP OAuth2 token endpoint.
   * Falls back to returning an empty string when basic auth is configured
   * (the Authorization header is built from credentials directly in that case).
   */
  private async fetchAccessToken(): Promise<string> {
    if (!this.config.tokenUrl) {
      // Basic auth mode — no separate token needed
      return '';
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret ?? '',
    });

    const resp = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token endpoint ${resp.status}: ${text}`);
    }

    const json = (await resp.json()) as { access_token?: string };
    if (!json.access_token) throw new Error('Token response missing access_token');
    return json.access_token;
  }

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  /**
   * Low-level paged OData fetch.  Follows @odata.nextLink for v4 or __next for v2.
   */
  private async odataGetAll(path: string, token: string): Promise<any[]> {
    const base = this.config.endpoint.replace(/\/$/, '');
    const sapClient = this.config.sapClient;
    const authHeaders = buildAuthHeader(this.config, token || undefined);
    const results: any[] = [];

    let url: string | null = `${base}${path}${sapClient ? `${path.includes('?') ? '&' : '?'}sap-client=${sapClient}` : ''}`;

    while (url) {
      const resp = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...authHeaders,
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OData GET ${url} → ${resp.status}: ${text.slice(0, 400)}`);
      }

      const json = (await resp.json()) as any;

      // v4 top-level array is in "value"; v2 is in d.results
      const page: any[] =
        json.value ?? json.d?.results ?? (Array.isArray(json) ? json : []);

      results.push(...page);

      // Pagination
      const next: string | undefined =
        json['@odata.nextLink'] ?? json['@nextLink'] ?? json.d?.__next;
      url = next ? (next.startsWith('http') ? next : `${base}${next}`) : null;
    }

    return results;
  }

  // ── Purchase Orders ─────────────────────────────────────────────────────────

  private async fetchPurchaseOrders(token: string): Promise<NormalizedDocument[]> {
    let rawPos: any[];

    if (this.config.apiVersion === 'v4') {
      rawPos = await this.odataGetAll(
        '/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001/PurchaseOrder' +
          '?$expand=to_PurchaseOrderItem,to_PurchaseOrderScheduleLine',
        token,
      );
    } else {
      // ECC v2
      rawPos = await this.odataGetAll(
        '/sap/opu/odata/sap/MM_PUR_CONTRACTS_MAINTAIN_SRV/A_PurchaseOrder?$expand=to_PurchaseOrderItem',
        token,
      );
    }

    return rawPos.map((po) => this.mapSapPoToNormalized(po));
  }

  // ── Goods Receipts ──────────────────────────────────────────────────────────

  private async fetchGoodsReceipts(token: string): Promise<NormalizedDocument[]> {
    let rawGrns: any[];

    if (this.config.apiVersion === 'v4') {
      rawGrns = await this.odataGetAll(
        '/sap/opu/odata4/sap/api_material_document/srvd_a2x/sap/materialdocument/0001/MaterialDocumentHeader' +
          '?$expand=to_MaterialDocumentItem',
        token,
      );
    } else {
      // ECC v2 MIGO
      rawGrns = await this.odataGetAll(
        '/sap/opu/odata/sap/MMIM_GOODS_MOVEMENT_SRV/GoodsMovementSet?$expand=to_MaterialDocumentItem',
        token,
      );
    }

    return rawGrns.map((grn) => this.mapSapGrnToNormalized(grn));
  }

  // ── Supplier Invoices ───────────────────────────────────────────────────────

  private async fetchSupplierInvoices(token: string): Promise<NormalizedDocument[]> {
    let rawInv: any[];

    if (this.config.apiVersion === 'v4') {
      rawInv = await this.odataGetAll(
        '/sap/opu/odata4/sap/api_supplierinvoice_2/srvd_a2x/sap/supplierinvoice/0001/SupplierInvoice' +
          '?$expand=to_SupplierInvoiceItemGLAcct',
        token,
      );
    } else {
      // ECC v2 — LIV
      rawInv = await this.odataGetAll(
        '/sap/opu/odata/sap/MM_SRV/SupplierInvoiceSet?$expand=to_InvoiceItem',
        token,
      );
    }

    return rawInv.map((inv) => this.mapSapInvoiceToNormalized(inv));
  }

  // ── Vendor Master ───────────────────────────────────────────────────────────

  private async fetchVendorMaster(token: string): Promise<void> {
    const vendors = await this.odataGetAll(
      '/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/business-partner/0001/A_Supplier?$top=100',
      token,
    );

    for (const v of vendors) {
      const supplierCode: string = v.Supplier ?? v.BusinessPartner ?? '';
      if (!supplierCode) continue;

      await this.pool.query(
        `INSERT INTO ap_vendors (
            tenant_id, entity_id, vendor_code, legal_name,
            gstin, pan, contact_phone, address_line1, city, state,
            country, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
          ON CONFLICT (entity_id, vendor_code)
          DO UPDATE SET
            legal_name   = EXCLUDED.legal_name,
            gstin        = COALESCE(EXCLUDED.gstin, ap_vendors.gstin),
            pan          = COALESCE(EXCLUDED.pan, ap_vendors.pan),
            contact_phone = COALESCE(EXCLUDED.contact_phone, ap_vendors.contact_phone),
            address_line1= COALESCE(EXCLUDED.address_line1, ap_vendors.address_line1),
            city         = COALESCE(EXCLUDED.city, ap_vendors.city),
            state        = COALESCE(EXCLUDED.state, ap_vendors.state),
            country      = COALESCE(EXCLUDED.country, ap_vendors.country),
            updated_at   = NOW()`,
        [
          this.tenantId,
          this.entityId,
          supplierCode,
          v.SupplierName ?? v.BusinessPartnerFullName ?? '',
          v.TaxNumber1 ?? null,          // GSTIN commonly stored in TaxNumber1
          v.TaxNumber2 ?? null,          // PAN in TaxNumber2
          v.PhoneNumber ?? v.FaxNumber ?? null,
          v.StreetName ?? null,
          v.CityName ?? null,
          v.Region ?? null,
          v.Country ?? 'IN',
        ],
      );
    }
  }

  // ── Field Mappers ───────────────────────────────────────────────────────────

  /**
   * Maps a raw SAP PurchaseOrder OData object to NormalizedDocument.
   *
   * Key S/4HANA v4 fields:
   *   PurchaseOrder, Supplier, DocumentCurrency, NetAmount,
   *   PurchaseOrderDate, to_PurchaseOrderItem (array)
   */
  private mapSapPoToNormalized(sapPo: any): NormalizedDocument {
    const items: any[] =
      sapPo.to_PurchaseOrderItem?.value ??
      sapPo.to_PurchaseOrderItem ??
      sapPo.PurchaseOrderItem ??
      [];

    const lineItems: NormalizedLineItem[] = items.map((item: any, idx: number) =>
      this.mapPoItem(item, idx),
    );

    // Aggregate GST from line items (SAP stores them per condition on each line)
    const cgst = lineItems.reduce((s, l) => s + l.cgstAmount, 0);
    const sgst = lineItems.reduce((s, l) => s + l.sgstAmount, 0);
    const igst = lineItems.reduce((s, l) => s + l.igstAmount, 0);
    const cess = lineItems.reduce((s, l) => s + l.cessAmount, 0);
    const subtotal = toFloat(sapPo.NetAmount ?? sapPo.TotalNetAmount ?? 0);
    const total = subtotal + cgst + sgst + igst + cess;

    return {
      type: 'purchase_order',
      sourceRef: String(sapPo.PurchaseOrder ?? sapPo.Ebeln ?? ''),
      sourceChannel: 'sap',
      vendorCode: sapPo.Supplier ?? sapPo.Lifnr ?? undefined,
      vendorName: sapPo.SupplierName ?? undefined,
      gstin: sapPo.SupplierTaxNumber ?? undefined,
      documentDate: isoDate(sapPo.PurchaseOrderDate ?? sapPo.Bedat),
      dueDate: isoDate(sapPo.DeliveryDate ?? sapPo.LatestDeliveryDate) || undefined,
      currency: sapPo.DocumentCurrency ?? sapPo.Waers ?? 'INR',
      subtotal,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      cessAmount: cess,
      totalAmount: total,
      poReference: String(sapPo.PurchaseOrder ?? ''),
      lineItems,
      rawPayload: sapPo as Record<string, unknown>,
    };
  }

  private mapPoItem(item: any, idx: number): NormalizedLineItem {
    const qty = toFloat(item.OrderQuantity ?? item.Menge ?? 1);
    const unitPrice = toFloat(item.NetPriceAmount ?? item.NetPrice ?? item.Netpr ?? 0);
    const lineSubtotal = qty * unitPrice;

    // Indian GST condition types per PO item (present when SAP pricing procedure includes them)
    const cgstAmt = toFloat(item.CGSTAmount ?? item.JWOC ?? 0);
    const sgstAmt = toFloat(item.SGSTAmount ?? item.JGOC ?? 0);
    const igstAmt = toFloat(item.IGSTAmount ?? item.JIOC ?? 0);
    const cessAmt = toFloat(item.CESSAmount ?? item.JCES ?? 0);

    const cgstRate = lineSubtotal > 0 ? (cgstAmt / lineSubtotal) * 100 : 0;
    const sgstRate = lineSubtotal > 0 ? (sgstAmt / lineSubtotal) * 100 : 0;
    const igstRate = lineSubtotal > 0 ? (igstAmt / lineSubtotal) * 100 : 0;
    const cessRate = lineSubtotal > 0 ? (cessAmt / lineSubtotal) * 100 : 0;

    return {
      lineNumber: toInt(item.PurchaseOrderItem ?? item.Ebelp ?? idx + 1),
      itemCode: item.Material ?? item.Matnr ?? undefined,
      description: item.PurchaseOrderItemText ?? item.TxZ01 ?? item.ShortText ?? '',
      hsnSacCode: item.MaterialGroup ?? item.Matkl ?? undefined,
      quantity: qty,
      unit: item.PurchaseOrderQuantityUnit ?? item.Meins ?? 'EA',
      unitPrice,
      discountPct: Math.min(Math.max(toFloat(item.DiscountPercent ?? 0), 0), 100),
      cgstRate,
      sgstRate,
      igstRate,
      cessRate,
      lineSubtotal,
      cgstAmount: cgstAmt,
      sgstAmount: sgstAmt,
      igstAmount: igstAmt,
      cessAmount: cessAmt,
      lineTotal: lineSubtotal + cgstAmt + sgstAmt + igstAmt + cessAmt,
    };
  }

  /**
   * Maps a raw SAP MaterialDocumentHeader (GRN/MIGO) to NormalizedDocument.
   *
   * Key fields:
   *   MaterialDocumentYear, MaterialDocument, PostingDate, to_MaterialDocumentItem
   */
  private mapSapGrnToNormalized(sapGrn: any): NormalizedDocument {
    const grnNumber =
      `${sapGrn.MaterialDocumentYear ?? ''}${sapGrn.MaterialDocument ?? sapGrn.Mblnr ?? ''}`.trim();

    const items: any[] =
      sapGrn.to_MaterialDocumentItem?.value ??
      sapGrn.to_MaterialDocumentItem ??
      sapGrn.MaterialDocumentItem ??
      [];

    const lineItems: NormalizedLineItem[] = items.map((item: any, idx: number) =>
      this.mapGrnItem(item, idx),
    );

    const subtotal = lineItems.reduce((s, l) => s + l.lineSubtotal, 0);

    return {
      type: 'goods_receipt',
      sourceRef: grnNumber,
      sourceChannel: 'sap',
      vendorCode: sapGrn.Supplier ?? sapGrn.Lifnr ?? undefined,
      documentDate: isoDate(sapGrn.PostingDate ?? sapGrn.Budat),
      currency: sapGrn.DocumentCurrency ?? 'USD',
      subtotal,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: subtotal,
      poReference: sapGrn.PurchaseOrder ?? sapGrn.Ebeln ?? undefined,
      grnReference: grnNumber,
      lineItems,
      rawPayload: sapGrn as Record<string, unknown>,
    };
  }

  private mapGrnItem(item: any, idx: number): NormalizedLineItem {
    const qty = toFloat(item.QuantityInBaseUnit ?? item.Menge ?? 1);
    const unitPrice = toFloat(item.AmountInLocalCurrency ?? item.Dmbtr ?? 0) / (qty || 1);

    return {
      lineNumber: toInt(item.MaterialDocumentItem ?? item.Zeile ?? idx + 1),
      itemCode: item.Material ?? item.Matnr ?? undefined,
      description: item.MaterialDocumentItemText ?? item.Sgtxt ?? '',
      quantity: qty,
      unit: item.BaseUnit ?? item.Meins ?? 'EA',
      unitPrice,
      discountPct: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      cessRate: 0,
      lineSubtotal: qty * unitPrice,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      lineTotal: qty * unitPrice,
    };
  }

  /**
   * Maps a raw SAP SupplierInvoice OData object to NormalizedDocument.
   *
   * Key fields:
   *   SupplierInvoice, InvoicingParty, DocumentDate, InvoiceGrossAmount,
   *   DocumentCurrency, to_SupplierInvoiceItemGLAcct
   */
  private mapSapInvoiceToNormalized(sapInv: any): NormalizedDocument {
    const items: any[] =
      sapInv.to_SupplierInvoiceItemGLAcct?.value ??
      sapInv.to_SupplierInvoiceItemGLAcct ??
      sapInv.InvoiceItem ??
      [];

    const lineItems: NormalizedLineItem[] = items.map((item: any, idx: number) =>
      this.mapInvoiceItem(item, idx),
    );

    const grossAmt = toFloat(
      sapInv.InvoiceGrossAmount ?? sapInv.GrossAmount ?? sapInv.Rmwwr ?? 0,
    );

    // Indian GST at header level (condition totals stored by SAP)
    const cgst = toFloat(sapInv.CGSTAmount ?? sapInv.CGSTTaxAmount ?? 0);
    const sgst = toFloat(sapInv.SGSTAmount ?? sapInv.SGSTTaxAmount ?? 0);
    const igst = toFloat(sapInv.IGSTAmount ?? sapInv.IGSTTaxAmount ?? 0);
    const cess = toFloat(sapInv.CESSAmount ?? 0);
    const subtotal = grossAmt - cgst - sgst - igst - cess;

    return {
      type: 'invoice',
      sourceRef: String(sapInv.SupplierInvoice ?? sapInv.Belnr ?? ''),
      sourceChannel: 'sap',
      vendorCode: sapInv.InvoicingParty ?? sapInv.Lifnr ?? undefined,
      vendorName: sapInv.InvoicingPartyName ?? undefined,
      gstin: sapInv.InvoicingPartyTaxNumber ?? undefined,
      documentDate: isoDate(sapInv.DocumentDate ?? sapInv.Bldat),
      dueDate: isoDate(sapInv.PaymentDueDate ?? sapInv.DueCalculationBaseDate) || undefined,
      currency: sapInv.DocumentCurrency ?? sapInv.Waers ?? 'INR',
      subtotal: subtotal > 0 ? subtotal : grossAmt,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      cessAmount: cess,
      totalAmount: grossAmt,
      poReference: sapInv.PurchaseOrder ?? sapInv.Ebeln ?? undefined,
      lineItems,
      rawPayload: sapInv as Record<string, unknown>,
    };
  }

  private mapInvoiceItem(item: any, idx: number): NormalizedLineItem {
    const qty = toFloat(item.SupplierInvoiceItemQuantity ?? item.Menge ?? 1);
    const unitPrice = toFloat(item.PurchaseOrderPriceUnit ?? item.NetAmount ?? item.Wrbtr ?? 0);
    const lineSubtotal = toFloat(item.SupplierInvoiceItemAmount ?? item.Wrbtr ?? qty * unitPrice);

    // GST conditions at line level — SAP stores CGST as JWOC, SGST as JGOC, IGST as JIOC
    const cgstAmt = toFloat(item.CGSTAmount ?? item.JWOC ?? 0);
    const sgstAmt = toFloat(item.SGSTAmount ?? item.JGOC ?? 0);
    const igstAmt = toFloat(item.IGSTAmount ?? item.JIOC ?? 0);
    const cessAmt = toFloat(item.CESSAmount ?? item.JCES ?? 0);

    const cgstRate = lineSubtotal > 0 ? (cgstAmt / lineSubtotal) * 100 : 0;
    const sgstRate = lineSubtotal > 0 ? (sgstAmt / lineSubtotal) * 100 : 0;
    const igstRate = lineSubtotal > 0 ? (igstAmt / lineSubtotal) * 100 : 0;
    const cessRate = lineSubtotal > 0 ? (cessAmt / lineSubtotal) * 100 : 0;

    return {
      lineNumber: toInt(item.SupplierInvoiceItem ?? item.Buzei ?? idx + 1),
      itemCode: item.Material ?? item.Matnr ?? undefined,
      description: item.DocumentItemText ?? item.Sgtxt ?? '',
      hsnSacCode: item.MaterialGroup ?? undefined,
      quantity: qty,
      unit: item.QuantityUnit ?? item.Meins ?? 'EA',
      unitPrice,
      discountPct: 0,
      cgstRate,
      sgstRate,
      igstRate,
      cessRate,
      lineSubtotal,
      cgstAmount: cgstAmt,
      sgstAmount: sgstAmt,
      igstAmount: igstAmt,
      cessAmount: cessAmt,
      lineTotal: lineSubtotal + cgstAmt + sgstAmt + igstAmt + cessAmt,
    };
  }

  // ── DB Upserts ──────────────────────────────────────────────────────────────

  private async upsertPurchaseOrder(doc: NormalizedDocument): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const vendorId = await this.ensureVendor(client, doc);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO ap_purchase_orders (
            tenant_id, entity_id, vendor_id, po_number, po_date, delivery_date, currency,
            subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount,
            status, source_system, metadata
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'issued',$14,$15)
          ON CONFLICT (entity_id, po_number)
          DO UPDATE SET
            vendor_id     = COALESCE(EXCLUDED.vendor_id, ap_purchase_orders.vendor_id),
            po_date       = EXCLUDED.po_date,
            delivery_date = EXCLUDED.delivery_date,
            currency      = EXCLUDED.currency,
            subtotal      = EXCLUDED.subtotal,
            cgst_amount   = EXCLUDED.cgst_amount,
            sgst_amount   = EXCLUDED.sgst_amount,
            igst_amount   = EXCLUDED.igst_amount,
            cess_amount   = EXCLUDED.cess_amount,
            total_amount  = EXCLUDED.total_amount,
            source_system = EXCLUDED.source_system,
            metadata      = EXCLUDED.metadata,
            updated_at    = NOW()
          RETURNING id`,
        [
          this.tenantId,
          this.entityId,
          vendorId,
          doc.sourceRef,
          doc.documentDate,
          doc.dueDate ?? null,
          doc.currency,
          nonNegative(doc.subtotal),
          nonNegative(doc.cgstAmount),
          nonNegative(doc.sgstAmount),
          nonNegative(doc.igstAmount),
          nonNegative(doc.cessAmount),
          nonNegative(doc.totalAmount),
          doc.sourceChannel === 'hana' ? 'sap' : doc.sourceChannel,
          JSON.stringify(doc.rawPayload),
        ],
      );

      const poId = rows[0]?.id;
      if (poId && doc.lineItems.length > 0) {
        for (const line of doc.lineItems) {
          await client.query(
            `INSERT INTO ap_po_line_items (
                tenant_id, entity_id, po_id, line_number,
                item_code, description, hsn_sac_code,
                quantity, unit, unit_price, discount_pct,
                cgst_rate, sgst_rate, igst_rate, cess_rate,
                line_subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
              ON CONFLICT (po_id, line_number)
              DO UPDATE SET
                description  = EXCLUDED.description,
                quantity     = EXCLUDED.quantity,
                unit_price   = EXCLUDED.unit_price,
                line_subtotal= EXCLUDED.line_subtotal,
                cgst_rate    = EXCLUDED.cgst_rate,
                sgst_rate    = EXCLUDED.sgst_rate,
                igst_rate    = EXCLUDED.igst_rate,
                cess_rate    = EXCLUDED.cess_rate,
                cgst_amount  = EXCLUDED.cgst_amount,
                sgst_amount  = EXCLUDED.sgst_amount,
                igst_amount  = EXCLUDED.igst_amount,
                cess_amount  = EXCLUDED.cess_amount,
                line_total   = EXCLUDED.line_total`,
            [
              this.tenantId,
              this.entityId,
              poId,
              line.lineNumber,
              line.itemCode ?? null,
              line.description,
              line.hsnSacCode ?? null,
              Math.max(line.quantity, 0.001),
              line.unit,
              nonNegative(line.unitPrice),
              line.discountPct,
              line.cgstRate,
              line.sgstRate,
              line.igstRate,
              line.cessRate,
              nonNegative(line.lineSubtotal),
              nonNegative(line.cgstAmount),
              nonNegative(line.sgstAmount),
              nonNegative(line.igstAmount),
              nonNegative(line.cessAmount),
              nonNegative(line.lineTotal),
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async upsertGoodsReceipt(doc: NormalizedDocument): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const vendorId = await this.ensureVendor(client, doc);
      const poResult = doc.poReference
        ? await client.query<{ id: string }>(
            `SELECT id FROM ap_purchase_orders
             WHERE tenant_id = $1 AND entity_id = $2 AND po_number = $3
             LIMIT 1`,
            [this.tenantId, this.entityId, doc.poReference],
          )
        : { rows: [] };
      const poId = poResult.rows[0]?.id ?? null;

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO ap_goods_receipts (
            tenant_id, entity_id, po_id, vendor_id, grn_number, grn_date,
            subtotal, total_amount, status, metadata
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
          ON CONFLICT (entity_id, grn_number)
          DO UPDATE SET
            po_id         = COALESCE(EXCLUDED.po_id, ap_goods_receipts.po_id),
            vendor_id     = COALESCE(EXCLUDED.vendor_id, ap_goods_receipts.vendor_id),
            grn_date      = EXCLUDED.grn_date,
            subtotal      = EXCLUDED.subtotal,
            total_amount  = EXCLUDED.total_amount,
            metadata      = EXCLUDED.metadata,
            updated_at    = NOW()
          RETURNING id`,
        [
          this.tenantId,
          this.entityId,
          poId,
          vendorId,
          doc.sourceRef,
          doc.documentDate,
          nonNegative(doc.subtotal),
          nonNegative(doc.totalAmount),
          JSON.stringify(doc.rawPayload),
        ],
      );

      const grnId = rows[0]?.id;
      if (grnId && doc.lineItems.length > 0) {
        for (const line of doc.lineItems) {
          await client.query(
            `INSERT INTO ap_grn_line_items (
                tenant_id, entity_id, grn_id, line_number,
                item_code, description, quantity_received, quantity_accepted,
                unit, unit_price, line_total, status
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'accepted')
              ON CONFLICT (grn_id, line_number)
              DO UPDATE SET
                description = EXCLUDED.description,
                quantity_received = EXCLUDED.quantity_received,
                quantity_accepted = EXCLUDED.quantity_accepted,
                unit_price  = EXCLUDED.unit_price,
                line_total  = EXCLUDED.line_total`,
            [
              this.tenantId,
              this.entityId,
              grnId,
              line.lineNumber,
              line.itemCode ?? null,
              line.description,
              Math.max(line.quantity, 0),
              Math.max(line.quantity, 0),
              line.unit,
              nonNegative(line.unitPrice),
              nonNegative(line.lineTotal),
            ],
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async upsertInvoice(doc: NormalizedDocument): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const vendorId = await this.ensureVendor(client, doc);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO ap_invoices (
            tenant_id, entity_id, vendor_id, invoice_number, invoice_date, due_date, currency,
            subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount,
            po_ref, grn_ref, status, source_channel, metadata
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'received',$16,$17)
          ON CONFLICT (entity_id, invoice_number)
          DO UPDATE SET
            vendor_id    = COALESCE(EXCLUDED.vendor_id, ap_invoices.vendor_id),
            invoice_date = EXCLUDED.invoice_date,
            due_date     = COALESCE(EXCLUDED.due_date, ap_invoices.due_date),
            currency     = EXCLUDED.currency,
            subtotal     = EXCLUDED.subtotal,
            cgst_amount  = EXCLUDED.cgst_amount,
            sgst_amount  = EXCLUDED.sgst_amount,
            igst_amount  = EXCLUDED.igst_amount,
            cess_amount  = EXCLUDED.cess_amount,
            total_amount = EXCLUDED.total_amount,
            po_ref       = COALESCE(EXCLUDED.po_ref, ap_invoices.po_ref),
            grn_ref      = COALESCE(EXCLUDED.grn_ref, ap_invoices.grn_ref),
            source_channel = EXCLUDED.source_channel,
            metadata     = EXCLUDED.metadata,
            updated_at   = NOW()
          RETURNING id`,
        [
          this.tenantId,
          this.entityId,
          vendorId,
          doc.sourceRef,
          doc.documentDate,
          doc.dueDate ?? null,
          doc.currency,
          nonNegative(doc.subtotal),
          nonNegative(doc.cgstAmount),
          nonNegative(doc.sgstAmount),
          nonNegative(doc.igstAmount),
          nonNegative(doc.cessAmount),
          nonNegative(doc.totalAmount),
          doc.poReference ?? null,
          doc.grnReference ?? null,
          doc.sourceChannel === 'hana' ? 'sap' : doc.sourceChannel,
          JSON.stringify(doc.rawPayload),
        ],
      );

      const invId = rows[0]?.id;
      if (invId && doc.lineItems.length > 0) {
        for (const line of doc.lineItems) {
          await client.query(
            `INSERT INTO ap_invoice_line_items (
                tenant_id, entity_id, invoice_id, line_number,
                item_code, description, hsn_sac_code,
                quantity, unit, unit_price, discount_pct,
                cgst_rate, sgst_rate, igst_rate, cess_rate,
                line_subtotal, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
              ON CONFLICT (invoice_id, line_number)
              DO UPDATE SET
                description  = EXCLUDED.description,
                quantity     = EXCLUDED.quantity,
                unit_price   = EXCLUDED.unit_price,
                line_subtotal= EXCLUDED.line_subtotal,
                cgst_rate    = EXCLUDED.cgst_rate,
                sgst_rate    = EXCLUDED.sgst_rate,
                igst_rate    = EXCLUDED.igst_rate,
                cess_rate    = EXCLUDED.cess_rate,
                cgst_amount  = EXCLUDED.cgst_amount,
                sgst_amount  = EXCLUDED.sgst_amount,
                igst_amount  = EXCLUDED.igst_amount,
                cess_amount  = EXCLUDED.cess_amount,
                line_total   = EXCLUDED.line_total`,
            [
              this.tenantId,
              this.entityId,
              invId,
              line.lineNumber,
              line.itemCode ?? null,
              line.description,
              line.hsnSacCode ?? null,
              Math.max(line.quantity, 0.001),
              line.unit,
              nonNegative(line.unitPrice),
              line.discountPct,
              line.cgstRate,
              line.sgstRate,
              line.igstRate,
              line.cessRate,
              nonNegative(line.lineSubtotal),
              nonNegative(line.cgstAmount),
              nonNegative(line.sgstAmount),
              nonNegative(line.igstAmount),
              nonNegative(line.cessAmount),
              nonNegative(line.lineTotal),
            ],
          );
        }
      }

      await this.upsertInvoiceCache(client, doc);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async ensureVendor(
    client: { query: Function },
    doc: NormalizedDocument,
  ): Promise<string | null> {
    if (!doc.vendorCode && !doc.vendorName) return null;
    const vendorCode = doc.vendorCode ?? `SAP-${doc.vendorName!.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40).toUpperCase()}`;
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
        doc.vendorName ?? doc.vendorCode ?? 'SAP Vendor',
        doc.gstin ?? null, doc.totalAmount,
        doc.poReference ?? null, doc.grnReference ?? null,
        doc.documentDate,
        JSON.stringify({ ...doc.rawPayload, source_channel: 'sap' }),
      ],
    );
  }
}

// ─── SAP HANA Connector ───────────────────────────────────────────────────────

/**
 * Connects to SAP HANA via the HANA REST/XS engine (HTTP-based SQL execution),
 * because hdbcli (native HANA client) is not available in Node.js.
 *
 * SAP HANA XS Classic SQL endpoint:
 *   POST /sap/hana/xs/sqlcc/services/sqlcc/
 *   Body: { "query": "<SQL>" }
 *
 * SAP HANA Cloud (XS Advanced / BTP) SQL endpoint:
 *   POST /v1/query
 *   or via HANA Database Explorer REST API
 */
export class SapHanaConnector {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    private pool: Pool,
    private tenantId: string,
    private entityId: string,
    private config: SapHanaConfig,
  ) {
    const proto = config.useSsl ? 'https' : 'http';
    this.baseUrl = `${proto}://${config.host}:${config.port}`;
    this.authHeader = `Basic ${Buffer.from(
      `${config.username}:${config.password}`,
    ).toString('base64')}`;
  }

  // ── Public entry point ──────────────────────────────────────────────────────

  async sync(): Promise<ConnectorSyncResult> {
    const result: ConnectorSyncResult = {
      source: 'hana',
      entityKey: `${this.tenantId}::${this.entityId}`,
      startedAt: new Date(),
      status: 'success',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      documents: [],
    };

    const schema = this.config.schema ? `"${this.config.schema}".` : '';

    // ── Purchase Orders (EKKO + EKPO) ────────────────────────────────────────
    try {
      const poRows = await this.executeHanaQuery(
        `SELECT
            H.EBELN, H.LIFNR, H.BEDAT, H.WAERS, H.NETWR,
            I.EBELP, I.TXZ01, I.MATNR, I.MATKL, I.MENGE, I.MEINS, I.NETPR,
            I.MWSKZ, I.NAVNW
          FROM ${schema}"EKKO" H
          JOIN ${schema}"EKPO" I ON H.MANDT = I.MANDT AND H.EBELN = I.EBELN
          WHERE H.BSTYP = 'F'
          ORDER BY H.EBELN, I.EBELP`,
      );

      const poMap = new Map<string, { header: any; items: any[] }>();
      for (const row of poRows) {
        const poNum = row.EBELN ?? row[0];
        if (!poMap.has(poNum)) poMap.set(poNum, { header: row, items: [] });
        poMap.get(poNum)!.items.push(row);
      }

      result.fetched += poMap.size;
      for (const [, po] of poMap) {
        try {
          const doc = this.mapHanaPoToNormalized(po.header, po.items);
          await this.upsertHanaPurchaseOrder(doc);
          result.inserted++;
          result.documents.push(doc);
        } catch (err) {
          result.skipped++;
          result.errors.push(`HANA PO upsert: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      result.errors.push(`HANA PO fetch: ${(err as Error).message}`);
    }

    // ── Goods Receipts (MKPF + MSEG) ─────────────────────────────────────────
    try {
      const grnRows = await this.executeHanaQuery(
        `SELECT
            H.MBLNR, H.MJAHR, H.BUDAT, H.CPUDT,
            I.ZEILE, I.MATNR, I.WERKS, I.MENGE, I.MEINS, I.DMBTR, I.EBELN, I.EBELP, I.SGTXT
          FROM ${schema}"MKPF" H
          JOIN ${schema}"MSEG" I ON H.MANDT = I.MANDT AND H.MBLNR = I.MBLNR AND H.MJAHR = I.MJAHR
          WHERE I.SHKZG = 'S'
          ORDER BY H.MBLNR, I.ZEILE`,
      );

      const grnMap = new Map<string, { header: any; items: any[] }>();
      for (const row of grnRows) {
        const grnKey = `${row.MJAHR ?? ''}${row.MBLNR ?? ''}`;
        if (!grnMap.has(grnKey)) grnMap.set(grnKey, { header: row, items: [] });
        grnMap.get(grnKey)!.items.push(row);
      }

      result.fetched += grnMap.size;
      for (const [grnKey, grn] of grnMap) {
        try {
          const doc = this.mapHanaGrnToNormalized(grnKey, grn.header, grn.items);
          await this.upsertHanaGoodsReceipt(doc);
          result.inserted++;
          result.documents.push(doc);
        } catch (err) {
          result.skipped++;
          result.errors.push(`HANA GRN upsert: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      result.errors.push(`HANA GRN fetch: ${(err as Error).message}`);
    }

    // ── Invoices (RBKP + RSEG) ────────────────────────────────────────────────
    try {
      const invRows = await this.executeHanaQuery(
        `SELECT
            H.BELNR, H.GJAHR, H.LIFNR, H.BLDAT, H.ZFBDT, H.WAERS,
            H.RMWWR, H.WMWST, H.TXFLD, H.EBELN AS H_EBELN,
            I.BUZEI, I.MATNR, I.MENGE, I.MEINS, I.WRBTR, I.SGTXT,
            I.MWSKZ, I.WMWST AS I_WMWST, I.EBELN AS I_EBELN
          FROM ${schema}"RBKP" H
          JOIN ${schema}"RSEG" I ON H.MANDT = I.MANDT AND H.BELNR = I.BELNR AND H.GJAHR = I.GJAHR
          ORDER BY H.BELNR, I.BUZEI`,
      );

      const invMap = new Map<string, { header: any; items: any[] }>();
      for (const row of invRows) {
        const invKey = `${row.GJAHR ?? ''}${row.BELNR ?? ''}`;
        if (!invMap.has(invKey)) invMap.set(invKey, { header: row, items: [] });
        invMap.get(invKey)!.items.push(row);
      }

      result.fetched += invMap.size;
      for (const [, inv] of invMap) {
        try {
          const doc = this.mapHanaInvoiceToNormalized(inv.header, inv.items);
          await this.upsertHanaInvoice(doc);
          result.inserted++;
          result.documents.push(doc);
        } catch (err) {
          result.skipped++;
          result.errors.push(`HANA invoice upsert: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      result.errors.push(`HANA invoice fetch: ${(err as Error).message}`);
    }

    // ── Vendor Master (LFA1) ──────────────────────────────────────────────────
    try {
      const vendors = await this.executeHanaQuery(
        `SELECT LIFNR, NAME1, STCD1, STCD2, TELF1, STRAS, ORT01, REGIO, LAND1
          FROM ${schema}"LFA1"
          ORDER BY LIFNR`,
      );

      for (const v of vendors) {
        await this.pool.query(
          `INSERT INTO ap_vendors (
              tenant_id, entity_id, vendor_code, legal_name,
              gstin, pan, contact_phone, address_line1, city, state, country,
              created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
            ON CONFLICT (entity_id, vendor_code)
            DO UPDATE SET
              legal_name   = EXCLUDED.legal_name,
              gstin        = COALESCE(EXCLUDED.gstin, ap_vendors.gstin),
              pan          = COALESCE(EXCLUDED.pan, ap_vendors.pan),
              contact_phone = COALESCE(EXCLUDED.contact_phone, ap_vendors.contact_phone),
              address_line1= COALESCE(EXCLUDED.address_line1, ap_vendors.address_line1),
              city         = COALESCE(EXCLUDED.city, ap_vendors.city),
              state        = COALESCE(EXCLUDED.state, ap_vendors.state),
              country      = COALESCE(EXCLUDED.country, ap_vendors.country),
              updated_at   = NOW()`,
          [
            this.tenantId,
            this.entityId,
            v.LIFNR ?? '',
            v.NAME1 ?? '',
            v.STCD1 ?? null,   // GSTIN
            v.STCD2 ?? null,   // PAN
            v.TELF1 ?? null,
            v.STRAS ?? null,
            v.ORT01 ?? null,
            v.REGIO ?? null,
            v.LAND1 ?? 'IN',
          ],
        );
      }
    } catch (err) {
      result.errors.push(`HANA vendor fetch: ${(err as Error).message}`);
    }

    result.completedAt = new Date();
    if (result.errors.length > 0 && result.inserted === 0) result.status = 'failed';
    else if (result.errors.length > 0) result.status = 'partial';

    return result;
  }

  // ── HANA REST query executor ────────────────────────────────────────────────

  /**
   * Executes a SQL query against SAP HANA via the XS Classic REST endpoint.
   *
   * Tries two endpoint patterns:
   *  1. XS Classic:  POST /sap/hana/xs/sqlcc/services/sqlcc/
   *  2. HANA Cloud:  POST /sap/bc/ina/service.xsodata (fallback)
   *
   * Returns an array of plain objects (column name → value).
   */
  private async executeHanaQuery(query: string): Promise<any[]> {
    // Attempt 1 — XS Classic SQLCC endpoint
    const url = `${this.baseUrl}/sap/hana/xs/sqlcc/services/sqlcc/`;

    const body = JSON.stringify({ query, resultSetOptions: { returnMetadata: true } });

    let resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: this.authHeader,
      },
      body,
    });

    if (!resp.ok) {
      // Fallback — try HANA XS OData SQL service
      const fallbackUrl = `${this.baseUrl}/sap/hana/xs/odata/query?sql=${encodeURIComponent(query)}`;
      resp = await fetch(fallbackUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: this.authHeader,
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HANA query failed ${resp.status}: ${text.slice(0, 400)}`);
      }
    }

    const json = (await resp.json()) as any;

    // Normalise response shape — XS Classic returns { results: { rows: [], metadata: [] } }
    // Simple REST returns array directly
    if (Array.isArray(json)) return json;
    if (json.results?.rows && json.results?.metadata) {
      const cols: string[] = json.results.metadata.map((m: any) => m.name ?? m.columnName);
      return (json.results.rows as any[][]).map((row) => {
        const obj: Record<string, unknown> = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });
    }
    if (json.d?.results) return json.d.results;
    if (json.value) return json.value;

    return [];
  }

  // ── HANA Field Mappers ──────────────────────────────────────────────────────

  private mapHanaPoToNormalized(header: any, items: any[]): NormalizedDocument {
    const lineItems: NormalizedLineItem[] = items.map((row, idx) => {
      const qty = toFloat(row.MENGE ?? 1);
      const unitPrice = toFloat(row.NETPR ?? 0);
      const lineSubtotal = qty * unitPrice;

      return {
        lineNumber: toInt(row.EBELP ?? idx + 1),
        itemCode: row.MATNR ?? undefined,
        description: row.TXZ01 ?? '',
        hsnSacCode: row.MATKL ?? undefined,
        quantity: qty,
        unit: row.MEINS ?? 'EA',
        unitPrice,
        discountPct: 0,
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        cessRate: 0,
        lineSubtotal,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
        lineTotal: lineSubtotal,
      };
    });

    const subtotal = toFloat(header.NETWR ?? 0);

    return {
      type: 'purchase_order',
      sourceRef: header.EBELN ?? '',
      sourceChannel: 'hana',
      vendorCode: header.LIFNR ?? undefined,
      documentDate: isoDate(header.BEDAT),
      currency: header.WAERS ?? 'USD',
      subtotal,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: subtotal,
      poReference: header.EBELN ?? undefined,
      lineItems,
      rawPayload: header as Record<string, unknown>,
    };
  }

  private mapHanaGrnToNormalized(grnKey: string, header: any, items: any[]): NormalizedDocument {
    const lineItems: NormalizedLineItem[] = items.map((row, idx) => {
      const qty = toFloat(row.MENGE ?? 1);
      const lineTotal = toFloat(row.DMBTR ?? 0);
      const unitPrice = qty > 0 ? lineTotal / qty : 0;

      return {
        lineNumber: toInt(row.ZEILE ?? idx + 1),
        itemCode: row.MATNR ?? undefined,
        description: row.SGTXT ?? '',
        quantity: qty,
        unit: row.MEINS ?? 'EA',
        unitPrice,
        discountPct: 0,
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        cessRate: 0,
        lineSubtotal: lineTotal,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
        lineTotal,
      };
    });

    const subtotal = lineItems.reduce((s, l) => s + l.lineTotal, 0);

    return {
      type: 'goods_receipt',
      sourceRef: grnKey,
      sourceChannel: 'hana',
      vendorCode: undefined,
      documentDate: isoDate(header.BUDAT),
      currency: 'INR',
      subtotal,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: subtotal,
      grnReference: grnKey,
      poReference: items[0]?.EBELN ?? undefined,
      lineItems,
      rawPayload: header as Record<string, unknown>,
    };
  }

  private mapHanaInvoiceToNormalized(header: any, items: any[]): NormalizedDocument {
    const lineItems: NormalizedLineItem[] = items.map((row, idx) => {
      const qty = toFloat(row.MENGE ?? 1);
      const lineTotal = toFloat(row.WRBTR ?? 0);
      const unitPrice = qty > 0 ? lineTotal / qty : lineTotal;

      return {
        lineNumber: toInt(row.BUZEI ?? idx + 1),
        itemCode: row.MATNR ?? undefined,
        description: row.SGTXT ?? '',
        quantity: qty,
        unit: row.MEINS ?? 'EA',
        unitPrice,
        discountPct: 0,
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        cessRate: 0,
        lineSubtotal: lineTotal,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
        lineTotal,
      };
    });

    const grossAmt = toFloat(header.RMWWR ?? 0);
    const taxAmt = toFloat(header.WMWST ?? 0);

    return {
      type: 'invoice',
      sourceRef: `${header.GJAHR ?? ''}${header.BELNR ?? ''}`,
      sourceChannel: 'hana',
      vendorCode: header.LIFNR ?? undefined,
      documentDate: isoDate(header.BLDAT),
      dueDate: isoDate(header.ZFBDT) || undefined,
      currency: header.WAERS ?? 'USD',
      subtotal: grossAmt - taxAmt,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: taxAmt,  // HANA total tax — split not available at header level
      cessAmount: 0,
      totalAmount: grossAmt,
      poReference: header.H_EBELN ?? items[0]?.I_EBELN ?? undefined,
      lineItems,
      rawPayload: header as Record<string, unknown>,
    };
  }

  // ── HANA DB Upserts (delegates to shared helpers via OData connector logic) ──

  private async upsertHanaPurchaseOrder(doc: NormalizedDocument): Promise<void> {
    // Reuse upsert logic via a temporary OData connector with this pool
    const odata = new SapODataConnector(
      this.pool,
      this.tenantId,
      this.entityId,
      { endpoint: '', clientId: '', docTypes: '', apiVersion: 'v4' },
    );
    // Access the private method via cast
    await (odata as any).upsertPurchaseOrder(doc);
  }

  private async upsertHanaGoodsReceipt(doc: NormalizedDocument): Promise<void> {
    const odata = new SapODataConnector(
      this.pool,
      this.tenantId,
      this.entityId,
      { endpoint: '', clientId: '', docTypes: '', apiVersion: 'v4' },
    );
    await (odata as any).upsertGoodsReceipt(doc);
  }

  private async upsertHanaInvoice(doc: NormalizedDocument): Promise<void> {
    const odata = new SapODataConnector(
      this.pool,
      this.tenantId,
      this.entityId,
      { endpoint: '', clientId: '', docTypes: '', apiVersion: 'v4' },
    );
    await (odata as any).upsertInvoice(doc);
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Main entry point called by the intake scheduler.
 *
 * Reads the entity's channel config and decides whether to use
 * the OData connector (S/4HANA / ECC) or the HANA direct connector.
 *
 * @param pool       - pg connection pool
 * @param tenantId   - tenant UUID
 * @param entityId   - entity UUID
 * @param config     - SapODataConfig | SapHanaConfig (from entity_intake_channels.connection_settings)
 */
export async function syncEntityFromSap(
  pool: Pool,
  tenantId: string,
  entityId: string,
  config: SapODataConfig | SapHanaConfig,
): Promise<ConnectorSyncResult> {
  // Distinguish config types by checking for OData-specific field
  if ('endpoint' in config) {
    const connector = new SapODataConnector(pool, tenantId, entityId, config as SapODataConfig);
    return connector.sync();
  } else {
    const connector = new SapHanaConnector(pool, tenantId, entityId, config as SapHanaConfig);
    return connector.sync();
  }
}
