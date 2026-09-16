/**
 * connectors/document.processor.ts
 *
 * Handles uploaded files from the "upload" intake channel.
 * Accepts PDF, XML, XLSX, JPG, PNG, TIFF.
 * Detects document type, creates processing batch, queues for extraction.
 */

import type { Pool } from 'pg';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentUploadResult, DocumentType } from './types.js';

/** Allowed upload MIME types */
export const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/json',
  'text/csv',
]);

/** Maximum file size: 50 MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export class DocumentProcessor {
  constructor(
    private pool: Pool,
    private tenantId: string,
    private entityId: string,
  ) {}

  /**
   * Main entry point. Validate file, detect type, create batch row, return result.
   */
  async processUpload(
    filename: string,
    mimetype: string,
    buffer: Buffer,
    sourceHint?: string, // optional hint from UI: 'invoice' | 'po' | 'grn' etc.
  ): Promise<DocumentUploadResult> {
    // 1. Validate file (size, mime type, magic bytes)
    this.validateFile(filename, mimetype, buffer);

    // 2. Optionally parse XML to get root tag list
    let xmlTags: string[] | undefined;
    if (mimetype === 'application/xml' || mimetype === 'text/xml') {
      try {
        const parsed = this.parseXml(buffer);
        xmlTags = [parsed.rootTag];
      } catch {
        // non-fatal — fall back to filename-based detection
      }
    }

    // 3. Detect document type
    let detectedType: DocumentType;
    if (sourceHint) {
      // Map sourceHint to canonical DocumentType if possible, else detect normally
      detectedType = this._sourceHintToType(sourceHint) ?? this.detectType(filename, mimetype, xmlTags);
    } else {
      detectedType = this.detectType(filename, mimetype, xmlTags);
    }

    // 4. Estimate page count
    const pageCount = this.estimatePageCount(buffer, mimetype);

    // 5. Persist the file and create entity_processing_batches row
    const batchId = await this.buildBatchId();
    const storageRoot = process.env.DOCUMENT_STORAGE_DIR?.trim()
      || path.resolve(process.cwd(), 'storage');
    const entityDirectory = path.join(storageRoot, this.tenantId, this.entityId);
    const storedPath = path.join(entityDirectory, `${batchId}-${path.basename(filename)}`);
    await mkdir(entityDirectory, { recursive: true });
    await writeFile(storedPath, buffer, { flag: 'wx' });
    try {
      await this.createBatch(batchId, filename, mimetype, storedPath, detectedType, pageCount);
    } catch (error) {
      await unlink(storedPath).catch(() => {});
      throw error;
    }

    // 6. Classification confidence (heuristic)
    const confidence = this._classificationConfidence(filename, mimetype, detectedType, xmlTags, sourceHint);

    return {
      batchId,
      originalFileName: filename,
      detectedType,
      pageCount,
      confidence,
      status: 'processing',
    };
  }

  /**
   * Classify document type from filename and content hints.
   *
   * Pattern rules (case-insensitive on filename without extension):
   *   'inv'                           → 'invoice'
   *   'po' | 'purch'                  → 'purchase_order'
   *   'grn' | 'migo' | 'receipt' | 'delivery' → 'goods_receipt'
   *   'eway' | 'ewb'                  → 'eway_bill'
   *   'credit'                        → 'credit_note'
   *   'debit'                         → 'debit_note'
   *   'remit'                         → 'remittance_advice'
   *   XML root tag 'Invoice'|'TaxInvoice' → 'invoice'
   *   XML root tag 'PurchaseOrder'    → 'purchase_order'
   *   Default                         → 'invoice'
   */
  detectType(filename: string, mimeType: string, xmlTags?: string[]): DocumentType {
    // XML root tag takes highest priority
    if (xmlTags && xmlTags.length > 0) {
      const root = xmlTags[0].toLowerCase();
      if (root === 'invoice' || root === 'taxinvoice') return 'invoice';
      if (root === 'purchaseorder') return 'purchase_order';
    }

    const base = filename.toLowerCase().replace(/\.[^.]+$/, ''); // strip extension

    if (/\bgrn\b|migo|\breceipt\b|delivery/.test(base)) return 'goods_receipt';
    if (/eway|ewb/.test(base)) return 'eway_bill';
    if (/credit/.test(base)) return 'credit_note';
    if (/debit/.test(base)) return 'debit_note';
    if (/remit/.test(base)) return 'remittance_advice';
    if (/\bpo\b|purch/.test(base)) return 'purchase_order';
    if (/inv/.test(base)) return 'invoice';

    // Default: most common in AP uploads
    return 'invoice';
  }

  /**
   * Parse XML document and extract key fields.
   * Uses regex-based parsing — no external XML library.
   * Supports PEPPOL UBL, GST e-invoice XML, SAP IDoc schemas.
   */
  parseXml(buffer: Buffer): { rootTag: string; fields: Record<string, string> } {
    const xml = buffer.toString('utf8');

    // Extract root tag (first opening tag, ignore XML declaration and namespaces)
    const rootMatch = xml.match(/<([A-Za-z][A-Za-z0-9_:.-]*)[^>]*>/);
    const rootTag = rootMatch
      ? rootMatch[1].replace(/^[^:]+:/, '') // strip namespace prefix
      : 'Unknown';

    const fields: Record<string, string> = {};

    // Helper: extract first occurrence of a tag value
    const extract = (pattern: RegExp): string | undefined => {
      const m = xml.match(pattern);
      return m ? m[1].trim() : undefined;
    };

    // Invoice / document number
    const invoiceNum =
      extract(/<cbc:ID>([^<]+)<\/cbc:ID>/) ?? // UBL
      extract(/<DocDtls>[\s\S]*?<No>([^<]+)<\/No>/) ?? // GST e-invoice
      extract(/<BELNR>([^<]+)<\/BELNR>/) ?? // SAP IDoc
      extract(/<InvoiceNumber>([^<]+)<\/InvoiceNumber>/);
    if (invoiceNum) fields['invoiceNumber'] = invoiceNum;

    // Document date
    const docDate =
      extract(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/) ?? // UBL
      extract(/<DocDtls>[\s\S]*?<Dt>([^<]+)<\/Dt>/) ?? // GST e-invoice
      extract(/<BLDAT>([^<]+)<\/BLDAT>/) ?? // SAP IDoc
      extract(/<InvoiceDate>([^<]+)<\/InvoiceDate>/);
    if (docDate) fields['documentDate'] = docDate;

    // Total amount
    const totalAmt =
      extract(/<cbc:TaxInclusiveAmount[^>]*>([^<]+)<\/cbc:TaxInclusiveAmount>/) ?? // UBL
      extract(/<ValDtls>[\s\S]*?<TotInvVal>([^<]+)<\/TotInvVal>/) ?? // GST e-invoice
      extract(/<WRBTR>([^<]+)<\/WRBTR>/) ?? // SAP IDoc
      extract(/<TotalAmount>([^<]+)<\/TotalAmount>/);
    if (totalAmt) fields['totalAmount'] = totalAmt;

    // Vendor name
    const vendorName =
      extract(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/) ?? // UBL
      extract(/<SellerDtls>[\s\S]*?<Nm>([^<]+)<\/Nm>/) ?? // GST e-invoice
      extract(/<LIFNR>([^<]+)<\/LIFNR>/); // SAP IDoc
    if (vendorName) fields['vendorName'] = vendorName;

    // GSTIN (GST e-invoice / Indian schemas)
    const gstin =
      extract(/<SellerDtls>[\s\S]*?<Gstin>([^<]+)<\/Gstin>/) ??
      extract(/<GSTIN>([^<]+)<\/GSTIN>/) ??
      extract(/<TaxScheme>[\s\S]*?<cbc:ID>([A-Z0-9]{15})<\/cbc:ID>/);
    if (gstin) fields['gstin'] = gstin;

    return { rootTag, fields };
  }

  /**
   * Estimate page count for uploaded file.
   *
   * - PDF:   count '%Page' / 'endobj' patterns as rough page estimate
   * - Image: always 1
   * - XML/JSON: always 1
   * - XLSX:  count worksheet entries
   */
  estimatePageCount(buffer: Buffer, mimeType: string): number {
    if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/tiff') {
      return 1;
    }

    if (mimeType === 'application/xml' || mimeType === 'text/xml' || mimeType === 'application/json' || mimeType === 'text/csv') {
      return 1;
    }

    if (mimeType === 'application/pdf') {
      const str = buffer.toString('binary');
      // Count '/Page' dictionary entries (more reliable than 'endobj')
      const pageMatches = str.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches && pageMatches.length > 0) return pageMatches.length;
      // Fallback: count 'endobj'
      const endObjMatches = str.match(/endobj/g);
      if (endObjMatches && endObjMatches.length > 0) {
        return Math.max(1, Math.round(endObjMatches.length / 5));
      }
      return 1;
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      // XLSX is a ZIP; count <sheet … entries in the XML manifest
      const str = buffer.toString('binary');
      const sheetMatches = str.match(/<sheet /g);
      return sheetMatches ? sheetMatches.length : 1;
    }

    return 1;
  }

  /**
   * Validate uploaded file.
   * Throws Error for:
   * - Size > 50 MB
   * - MIME type not in allowed list
   * - Empty buffer or wrong magic bytes
   */
  validateFile(filename: string, mimeType: string, buffer: Buffer): void {
    if (!buffer || buffer.length === 0) {
      throw new Error(`File "${filename}" is empty or corrupted.`);
    }

    if (buffer.length > MAX_FILE_SIZE) {
      const mb = (buffer.length / 1024 / 1024).toFixed(1);
      throw new Error(`File "${filename}" is ${mb} MB — exceeds the 50 MB limit.`);
    }

    if (!ALLOWED_MIMES.has(mimeType)) {
      throw new Error(
        `MIME type "${mimeType}" is not allowed. Accepted types: PDF, XML, XLSX, XLS, JPEG, PNG, TIFF, JSON, CSV.`,
      );
    }

    // Magic byte checks for common types
    const header = buffer.slice(0, 8);

    if (mimeType === 'application/pdf') {
      // PDF magic: %PDF
      if (header.slice(0, 4).toString('ascii') !== '%PDF') {
        throw new Error(`File "${filename}" does not appear to be a valid PDF (wrong magic bytes).`);
      }
    }

    if (mimeType === 'image/jpeg') {
      // JPEG magic: FF D8 FF
      if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
        throw new Error(`File "${filename}" does not appear to be a valid JPEG.`);
      }
    }

    if (mimeType === 'image/png') {
      // PNG magic: 89 50 4E 47 0D 0A 1A 0A
      const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const valid = pngSig.every((b, i) => header[i] === b);
      if (!valid) {
        throw new Error(`File "${filename}" does not appear to be a valid PNG.`);
      }
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    ) {
      // XLSX/XLS: ZIP signature PK (50 4B) or legacy BIFF (D0 CF)
      const isPk = header[0] === 0x50 && header[1] === 0x4b;
      const isBiff = header[0] === 0xd0 && header[1] === 0xcf;
      if (!isPk && !isBiff) {
        throw new Error(`File "${filename}" does not appear to be a valid Excel file.`);
      }
    }
  }

  /**
   * Insert a row into entity_processing_batches and return the generated batch_id.
   */
  private async createBatch(
    batchId: string,
    filename: string,
    mimeType: string,
    storedPath: string,
    docType: DocumentType,
    pageCount: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO entity_processing_batches
         (batch_id, entity_id, tenant_id, document_type, source_channel,
          pdf_count, page_count, active_step, status, original_filename,
          mime_type, stored_file_path, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'upload', 1, $5, 0, 'processing',
               $6, $7, $8, $9::jsonb, NOW(), NOW())`,
      [
        batchId,
        this.entityId,
        this.tenantId,
        docType,
        pageCount,
        filename,
        mimeType,
        storedPath,
        JSON.stringify({ original_filename: filename, mime_type: mimeType, stored_file_path: storedPath }),
      ],
    );
  }

  private async buildBatchId(): Promise<string> {
    const entityRow = await this.pool.query<{ entity_key: string }>(
      'SELECT entity_key FROM entities WHERE id = $1',
      [this.entityId],
    );
    const entityKey = entityRow.rows[0]?.entity_key ?? this.entityId.slice(0, 8);
    return `BATCH-${entityKey.toUpperCase()}-${Date.now()}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Map a sourceHint string to a DocumentType, returning undefined if unrecognised. */
  private _sourceHintToType(hint: string): DocumentType | undefined {
    const map: Record<string, DocumentType> = {
      invoice: 'invoice',
      inv: 'invoice',
      po: 'purchase_order',
      purchase_order: 'purchase_order',
      grn: 'goods_receipt',
      goods_receipt: 'goods_receipt',
      migo: 'goods_receipt',
      eway_bill: 'eway_bill',
      eway: 'eway_bill',
      credit_note: 'credit_note',
      credit: 'credit_note',
      debit_note: 'debit_note',
      debit: 'debit_note',
      remittance: 'remittance_advice',
      remit: 'remittance_advice',
    };
    return map[hint.toLowerCase()];
  }

  /** Heuristic confidence score 0–100 for the classification result. */
  private _classificationConfidence(
    filename: string,
    mimeType: string,
    detectedType: DocumentType,
    xmlTags?: string[],
    sourceHint?: string,
  ): number {
    if (sourceHint && this._sourceHintToType(sourceHint) === detectedType) return 95;
    if (xmlTags && xmlTags.length > 0) return 90;
    // Filename keyword match gives moderate confidence
    const base = filename.toLowerCase();
    const keywords: Record<DocumentType, string[]> = {
      invoice: ['inv', 'invoice', 'bill'],
      purchase_order: ['po', 'purch', 'order'],
      goods_receipt: ['grn', 'migo', 'receipt', 'delivery'],
      eway_bill: ['eway', 'ewb'],
      credit_note: ['credit'],
      debit_note: ['debit'],
      remittance_advice: ['remit'],
      proof_of_delivery: ['pod', 'proof'],
      bank_statement: ['bank', 'stmt', 'statement'],
      unknown: [],
    };
    const hits = keywords[detectedType].filter((kw) => base.includes(kw));
    if (hits.length > 0) return 80;
    // Default fallback to 'invoice' — low confidence
    return 50;
  }
}
