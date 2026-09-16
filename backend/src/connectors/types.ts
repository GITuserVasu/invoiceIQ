/**
 * connectors/types.ts
 * Shared types and interfaces for all data source connectors.
 *
 * Every connector (SAP, Mail, Vendor Portal, File Upload) transforms
 * its raw source data into these normalized shapes before persisting
 * to the AP tables.
 */

// ── Document types the system handles ─────────────────────────────────────

export type DocumentType =
  | 'invoice'
  | 'purchase_order'
  | 'goods_receipt'
  | 'eway_bill'
  | 'credit_note'
  | 'debit_note'
  | 'remittance_advice'
  | 'proof_of_delivery'
  | 'bank_statement'
  | 'unknown';

export type SourceChannel = 'sap' | 'upload' | 'vendor' | 'mail' | 'hana';

// ── Connector configuration (stored in entity_intake_channels.connection_settings) ─

export interface SapODataConfig {
  /** SAP host — e.g. https://my123456.s4hana.ondemand.com */
  endpoint: string;
  clientId: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  /** OAuth2 token URL for SAP BTP */
  tokenUrl?: string;
  /** Comma-separated: invoices,po,grn */
  docTypes: string;
  /** SAP system/client number e.g. "100" */
  sapClient?: string;
  /** API version: 'v2' (ECC) | 'v4' (S4HANA) */
  apiVersion: 'v2' | 'v4';
}

export interface SapHanaConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** Schema where AP tables live */
  schema?: string;
  useSsl: boolean;
}

export interface MailConfig {
  provider: 'gmail' | 'microsoft365' | 'imap';
  mailbox: string;
  username: string;
  /** IMAP server — only for provider='imap' */
  imapHost?: string;
  imapPort?: number;
  /** OAuth2 refresh token for Gmail / M365 */
  oauthRefreshToken?: string;
  /** IMAP password — stored as secret_reference */
  password?: string;
  folder: string;
  syncFrequency: string;
  /** Gmail search query e.g. 'has:attachment subject:invoice' */
  searchQuery?: string;
}

export interface VendorPortalConfig {
  portalUrl: string;
  authType: 'basic' | 'bearer' | 'oauth2';
  username?: string;
  password?: string;
  bearerToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthTokenUrl?: string;
  autoApprove: boolean;
}

// ── Normalized line item ──────────────────────────────────────────────────

export interface NormalizedLineItem {
  lineNumber: number;
  itemCode?: string;
  description: string;
  hsnSacCode?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cessRate: number;
  lineSubtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  lineTotal: number;
}

// ── Normalized document (common across all sources) ───────────────────────

export interface NormalizedDocument {
  type: DocumentType;
  sourceRef: string;            // Source system document number
  sourceChannel: SourceChannel;
  vendorCode?: string;
  vendorName?: string;
  gstin?: string;
  documentDate: string;         // ISO date
  dueDate?: string;
  currency: string;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  poReference?: string;         // Linked PO number
  grnReference?: string;        // Linked GRN number
  ewayBillNumber?: string;
  lineItems: NormalizedLineItem[];
  rawPayload: Record<string, unknown>;  // Original source object
  attachmentPath?: string;      // Local file path for uploaded docs
}

// ── Connector sync result ─────────────────────────────────────────────────

export interface ConnectorSyncResult {
  source: SourceChannel;
  entityKey: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'success' | 'partial' | 'failed';
  fetched: number;
  inserted: number;
  skipped: number;
  errors: string[];
  documents: NormalizedDocument[];
}

// ── Upload result ─────────────────────────────────────────────────────────

export interface DocumentUploadResult {
  batchId: string;
  originalFileName: string;
  detectedType: DocumentType;
  pageCount: number;
  confidence: number;           // Classification confidence 0-100
  status: 'queued' | 'processing' | 'stopped' | 'completed' | 'failed';
  error?: string;
}

// ── Required documents checklist ─────────────────────────────────────────
// This is the master list of documents needed for full AP processing.

export const REQUIRED_DOCUMENTS: Record<string, {
  name: string;
  required: boolean;
  formats: string[];
  source: SourceChannel[];
  description: string;
  matchRole: '2way' | '3way' | '4way' | 'supporting';
}> = {
  invoice: {
    name: 'Supplier Invoice (Tax Invoice)',
    required: true,
    formats: ['pdf', 'xml', 'jpg', 'png', 'tiff'],
    source: ['sap', 'upload', 'vendor', 'mail'],
    description: 'GST-compliant tax invoice from vendor with GSTIN, HSN codes, line items, and tax breakup.',
    matchRole: '2way'
  },
  purchase_order: {
    name: 'Purchase Order (PO)',
    required: true,
    formats: ['pdf', 'xml'],
    source: ['sap', 'upload'],
    description: 'Approved PO with line items, approved quantities, agreed unit prices, and delivery terms.',
    matchRole: '2way'
  },
  goods_receipt: {
    name: 'Goods Receipt Note (GRN / MIGO)',
    required: true,
    formats: ['pdf', 'xml'],
    source: ['sap', 'upload'],
    description: 'GRN confirming actual goods/services received — quantity and quality accepted.',
    matchRole: '3way'
  },
  eway_bill: {
    name: 'E-Way Bill (EWB)',
    required: false,
    formats: ['pdf', 'json'],
    source: ['upload', 'vendor'],
    description: 'NIC-issued e-way bill for goods movement above threshold. Required when entity policy = required.',
    matchRole: 'supporting'
  },
  inspection_report: {
    name: 'Inspection / Quality Report',
    required: false,
    formats: ['pdf', 'xlsx'],
    source: ['upload'],
    description: 'Quality inspection certificate — required only when matching_method = four_way.',
    matchRole: '4way'
  },
  delivery_challan: {
    name: 'Delivery Challan',
    required: false,
    formats: ['pdf'],
    source: ['upload', 'vendor'],
    description: 'Vendor delivery note accompanying goods. Cross-referenced with GRN.',
    matchRole: 'supporting'
  },
  debit_note: {
    name: 'Debit Note',
    required: false,
    formats: ['pdf', 'xml'],
    source: ['upload', 'vendor', 'mail'],
    description: 'Issued when vendor overcharged — reduces amount payable.',
    matchRole: 'supporting'
  },
  credit_note: {
    name: 'Credit Note',
    required: false,
    formats: ['pdf', 'xml'],
    source: ['upload', 'vendor', 'mail'],
    description: 'Issued by vendor for returns or adjustments — reduces invoice amount.',
    matchRole: 'supporting'
  },
  bank_statement: {
    name: 'Bank Statement',
    required: false,
    formats: ['pdf', 'xlsx', 'csv'],
    source: ['upload'],
    description: 'Used for reconciliation of payments against invoices.',
    matchRole: 'supporting'
  },
  remittance_advice: {
    name: 'Remittance Advice',
    required: false,
    formats: ['pdf', 'xlsx'],
    source: ['upload', 'mail'],
    description: 'Payment notification from buyer — used to match payment to invoices.',
    matchRole: 'supporting'
  }
};
