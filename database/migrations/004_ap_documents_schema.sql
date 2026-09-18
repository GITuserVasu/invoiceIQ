-- Migration 004: Full AP Documents Schema
-- Normalized tables for Accounts Payable document lifecycle:
-- Vendors → Purchase Orders → Goods Receipts → Invoices → E-Way Bills
-- → 3/4-way Match → Exceptions → Approval Workflow → Payments
--
-- All tables are scoped to (tenant_id, entity_id).
-- Migration 003's entity_invoices / entity_exceptions / entity_processing_batches
-- remain as lightweight JSONB caches for the screen layer; these 004 tables
-- are the authoritative relational source.

-- ==
-- 1. VENDOR MASTER
-- ==

CREATE TABLE IF NOT EXISTS ap_vendors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_code       text NOT NULL,                    -- e.g.  VND-001 
  legal_name        text NOT NULL,
  trade_name        text,
  vendor_type       text NOT NULL DEFAULT 'supplier'
    CHECK (vendor_type IN ('supplier','contractor','consultant','transporter','other')),
  gstin             text,                             -- GST Identification Number (15 chars)
  pan               text,                             -- Permanent Account Number (10 chars)
  msme_registered   boolean NOT NULL DEFAULT false,
  state_code        text,                             -- 2-digit GST state code
  address_line1     text,
  address_line2     text,
  city              text,
  state             text,
  pincode           text,
  country           text NOT NULL DEFAULT 'India',
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  payment_terms     text NOT NULL DEFAULT 'net_30'
    CHECK (payment_terms IN ('immediate','net_7','net_15','net_30','net_45','net_60','net_90')),
  currency          text NOT NULL DEFAULT 'USD',
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','blacklisted','under_review')),
  approved_by       uuid REFERENCES app_users(id),
  notes             text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, vendor_code)
);

CREATE TABLE IF NOT EXISTS ap_vendor_bank_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_id         uuid NOT NULL REFERENCES ap_vendors(id) ON DELETE CASCADE,
  account_nickname  text NOT NULL,                   -- e.g.  HDFC Primary 
  bank_name         text NOT NULL,
  ifsc_code         text NOT NULL,
  account_number    text NOT NULL,
  account_type      text NOT NULL DEFAULT 'current'
    CHECK (account_type IN ('savings','current','nre','nro')),
  beneficiary_name  text NOT NULL,
  is_primary        boolean NOT NULL DEFAULT false,
  is_verified       boolean NOT NULL DEFAULT false,
  verified_at       timestamptz,
  verified_by       uuid REFERENCES app_users(id),
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','flagged')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ==
-- 2. PURCHASE ORDERS
-- ==

CREATE TABLE IF NOT EXISTS ap_purchase_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_id         uuid REFERENCES ap_vendors(id) ON DELETE SET NULL,
  po_number         text NOT NULL,                   -- e.g.  PO-NTL-0078 
  po_date           date NOT NULL,
  delivery_date     date,
  currency          text NOT NULL DEFAULT 'INR',
  subtotal          numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  cgst_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  cess_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (cess_amount >= 0),
  total_amount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  source_system     text NOT NULL DEFAULT 'manual'
    CHECK (source_system IN ('sap','erp','manual','portal')),
  status            text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft','issued','acknowledged','partially_received',
                      'fully_received','closed','cancelled')),
  delivery_address  text,
  terms_conditions  text,
  approved_by       uuid REFERENCES app_users(id),
  approved_at       timestamptz,
  notes             text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid REFERENCES app_users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, po_number)
);

CREATE TABLE IF NOT EXISTS ap_po_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             uuid NOT NULL REFERENCES ap_purchase_orders(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  line_number       integer NOT NULL CHECK (line_number > 0),
  item_code         text,
  description       text NOT NULL,
  hsn_sac_code      text,                            -- HSN for goods, SAC for services
  quantity          numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit              text NOT NULL DEFAULT 'units',   -- units, kg, litre, hrs, etc.
  unit_price        numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  discount_pct      numeric(6,2) NOT NULL DEFAULT 0  CHECK (discount_pct BETWEEN 0 AND 100),
  cgst_rate         numeric(6,2) NOT NULL DEFAULT 0  CHECK (cgst_rate >= 0),
  sgst_rate         numeric(6,2) NOT NULL DEFAULT 0  CHECK (sgst_rate >= 0),
  igst_rate         numeric(6,2) NOT NULL DEFAULT 0  CHECK (igst_rate >= 0),
  cess_rate         numeric(6,2) NOT NULL DEFAULT 0  CHECK (cess_rate >= 0),
  line_subtotal     numeric(14,2) NOT NULL DEFAULT 0,
  cgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  cess_amount       numeric(14,2) NOT NULL DEFAULT 0,
  line_total        numeric(14,2) NOT NULL DEFAULT 0,
  received_qty      numeric(12,3) NOT NULL DEFAULT 0,
  pending_qty       numeric(12,3) GENERATED ALWAYS AS (quantity - received_qty) STORED,
  status            text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partially_received','fully_received','cancelled')),
  UNIQUE (po_id, line_number)
);

-- ==
-- 3. GOODS RECEIPT NOTES (GRN)
-- ==

CREATE TABLE IF NOT EXISTS ap_goods_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  po_id             uuid REFERENCES ap_purchase_orders(id) ON DELETE SET NULL,
  vendor_id         uuid REFERENCES ap_vendors(id) ON DELETE SET NULL,
  grn_number        text NOT NULL,                   -- e.g.  GRN-NTL-0311 
  grn_date          date NOT NULL,
  delivery_note_ref text,                            -- Vendor delivery note number
  vehicle_number    text,
  received_by       uuid REFERENCES app_users(id),
  warehouse_location text,
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  total_tax         numeric(14,2) NOT NULL DEFAULT 0,
  total_amount      numeric(14,2) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','accepted','partially_accepted','rejected','cancelled')),
  acceptance_notes  text,
  rejection_reason  text,
  accepted_by       uuid REFERENCES app_users(id),
  accepted_at       timestamptz,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, grn_number)
);

CREATE TABLE IF NOT EXISTS ap_grn_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id            uuid NOT NULL REFERENCES ap_goods_receipts(id) ON DELETE CASCADE,
  po_line_item_id   uuid REFERENCES ap_po_line_items(id) ON DELETE SET NULL,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  line_number       integer NOT NULL CHECK (line_number > 0),
  item_code         text,
  description       text NOT NULL,
  hsn_sac_code      text,
  quantity_ordered  numeric(12,3) NOT NULL DEFAULT 0,
  quantity_received numeric(12,3) NOT NULL CHECK (quantity_received >= 0),
  quantity_accepted numeric(12,3) NOT NULL DEFAULT 0,
  quantity_rejected numeric(12,3) NOT NULL DEFAULT 0,
  unit              text NOT NULL DEFAULT 'units',
  unit_price        numeric(14,4) NOT NULL DEFAULT 0,
  line_total        numeric(14,2) NOT NULL DEFAULT 0,
  batch_number      text,
  expiry_date       date,
  rejection_reason  text,
  status            text NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted','partially_accepted','rejected','pending')),
  UNIQUE (grn_id, line_number)
);

-- ==
-- 4. INVOICES (full normalized, replaces entity_invoices JSONB cache)
-- ==

CREATE TABLE IF NOT EXISTS ap_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_id         uuid REFERENCES ap_vendors(id) ON DELETE SET NULL,
  invoice_number    text NOT NULL,                   -- Vendor invoice number, e.g.  INV-NTL-2291 
  invoice_date      date NOT NULL,
  due_date          date,
  currency          text NOT NULL DEFAULT 'USD',
  place_of_supply   text,                            -- State code for GST
  reverse_charge    boolean NOT NULL DEFAULT false,
  subtotal          numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  cgst_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  cess_amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (cess_amount >= 0),
  tds_amount        numeric(14,2) NOT NULL DEFAULT 0 CHECK (tds_amount >= 0),
  total_amount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_terms     text DEFAULT 'net_30',
  source_channel    text NOT NULL DEFAULT 'upload'
    CHECK (source_channel IN ('sap','upload','vendor','mail')),
  intake_batch_id   text,                            -- Link to entity_processing_batches.batch_id
  ocr_confidence    numeric(5,2),                    -- OCR/AI extraction confidence %
  status            text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','under_review','matched','partially_matched',
                      'unmatched','disputed','approved','rejected','paid','cancelled')),
  po_ref            text,                            -- PO number (denormalized for display)
  grn_ref           text,                            -- GRN number (denormalized for display)
  notes             text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid REFERENCES app_users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS ap_invoice_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  po_line_item_id   uuid REFERENCES ap_po_line_items(id) ON DELETE SET NULL,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  line_number       integer NOT NULL CHECK (line_number > 0),
  item_code         text,
  description       text NOT NULL,
  hsn_sac_code      text,
  quantity          numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit              text NOT NULL DEFAULT 'units',
  unit_price        numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  discount_pct      numeric(6,2) NOT NULL DEFAULT 0  CHECK (discount_pct BETWEEN 0 AND 100),
  cgst_rate         numeric(6,2) NOT NULL DEFAULT 0,
  sgst_rate         numeric(6,2) NOT NULL DEFAULT 0,
  igst_rate         numeric(6,2) NOT NULL DEFAULT 0,
  cess_rate         numeric(6,2) NOT NULL DEFAULT 0,
  line_subtotal     numeric(14,2) NOT NULL DEFAULT 0,
  cgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  cess_amount       numeric(14,2) NOT NULL DEFAULT 0,
  line_total        numeric(14,2) NOT NULL DEFAULT 0,
  match_status      text NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('matched','partial','unmatched','pending')),
  UNIQUE (invoice_id, line_number)
);

-- ==
-- 5. E-WAY BILLS
-- ==

CREATE TABLE IF NOT EXISTS ap_eway_bills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id          uuid REFERENCES ap_invoices(id) ON DELETE SET NULL,
  po_id               uuid REFERENCES ap_purchase_orders(id) ON DELETE SET NULL,
  eway_bill_number    text NOT NULL,                 -- NIC EWB number (12 digits)
  eway_bill_date      timestamptz NOT NULL,
  valid_until         timestamptz NOT NULL,
  supply_type         text NOT NULL DEFAULT 'inward'
    CHECK (supply_type IN ('outward','inward','job_work','subcontract')),
  sub_supply_type     text NOT NULL DEFAULT 'supply'
    CHECK (sub_supply_type IN ('supply','export','job_work','sku','line_sales',
                               'recipient_not_known','for_own_use','others','skd')),
  doc_type            text NOT NULL DEFAULT 'invoice'
    CHECK (doc_type IN ('invoice','debit_note','credit_note','bill_of_entry',
                        'delivery_challan','others')),
  doc_number          text NOT NULL,                 -- Invoice/document reference
  doc_date            date NOT NULL,
  gstin_supplier      text NOT NULL,
  gstin_recipient     text,                          -- Can be null for unregistered buyers
  legal_name_supplier text NOT NULL,
  legal_name_recipient text,
  from_pincode        text NOT NULL,
  to_pincode          text NOT NULL,
  total_value         numeric(14,2) NOT NULL DEFAULT 0,
  cgst_value          numeric(14,2) NOT NULL DEFAULT 0,
  sgst_value          numeric(14,2) NOT NULL DEFAULT 0,
  igst_value          numeric(14,2) NOT NULL DEFAULT 0,
  cess_value          numeric(14,2) NOT NULL DEFAULT 0,
  taxable_amount      numeric(14,2) NOT NULL DEFAULT 0,
  distance_km         integer,
  transporter_id      text,                          -- Transporter GSTIN
  transporter_name    text,
  transport_mode      text NOT NULL DEFAULT 'road'
    CHECK (transport_mode IN ('road','rail','air','ship','multi_modal')),
  vehicle_number      text,
  vehicle_type        text DEFAULT 'regular'
    CHECK (vehicle_type IN ('regular','over_dimensional_cargo','others')),
  status              text NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated','in_transit','delivered','cancelled','expired','extended')),
  cancellation_reason text,
  cancelled_at        timestamptz,
  extended_valid_until timestamptz,
  generated_via       text NOT NULL DEFAULT 'manual'
    CHECK (generated_via IN ('api','portal','manual')),
  api_response        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Raw NIC API response
  created_by          uuid REFERENCES app_users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, eway_bill_number)
);

-- ==
-- 6. DOCUMENT MATCH (3-way / 4-way reconciliation)
-- ==

CREATE TABLE IF NOT EXISTS ap_document_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id        uuid NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  po_id             uuid REFERENCES ap_purchase_orders(id) ON DELETE SET NULL,
  grn_id            uuid REFERENCES ap_goods_receipts(id) ON DELETE SET NULL,
  inspection_id     uuid,                            -- FK to inspection_reports if 4-way
  match_type        text NOT NULL DEFAULT 'three_way'
    CHECK (match_type IN ('two_way','three_way','four_way')),
  match_status      text NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('matched','partial','unmatched','disputed','pending')),
  match_score_pct   numeric(5,2),                   -- Overall match confidence 0–100
  auto_resolved     boolean NOT NULL DEFAULT false,
  total_variance    numeric(14,2) NOT NULL DEFAULT 0,
  matched_at        timestamptz,
  resolved_by       uuid REFERENCES app_users(id),
  resolved_at       timestamptz,
  resolution_notes  text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id)                                -- One match record per invoice
);

CREATE TABLE IF NOT EXISTS ap_match_variances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid NOT NULL REFERENCES ap_document_matches(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_line_id   uuid REFERENCES ap_invoice_line_items(id) ON DELETE SET NULL,
  po_line_id        uuid REFERENCES ap_po_line_items(id) ON DELETE SET NULL,
  grn_line_id       uuid REFERENCES ap_grn_line_items(id) ON DELETE SET NULL,
  field_name        text NOT NULL,                   -- e.g.  unit_price ,  quantity ,  cgst_rate 
  po_value          text,
  invoice_value     text,
  grn_value         text,
  variance_amount   numeric(14,2),
  variance_pct      numeric(8,4),
  tolerance_pct     numeric(6,2) NOT NULL DEFAULT 0,
  within_tolerance  boolean NOT NULL DEFAULT false,
  variance_type     text NOT NULL DEFAULT 'amount'
    CHECK (variance_type IN ('quantity','unit_price','tax_rate','tax_amount',
                             'line_total','header_amount','date','other')),
  status            text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','accepted','rejected','waived')),
  reviewed_by       uuid REFERENCES app_users(id),
  reviewed_at       timestamptz,
  review_notes      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ==
-- 7. INSPECTION REPORTS (for 4-way matching)
-- ==

CREATE TABLE IF NOT EXISTS ap_inspection_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  grn_id            uuid NOT NULL REFERENCES ap_goods_receipts(id) ON DELETE CASCADE,
  po_id             uuid REFERENCES ap_purchase_orders(id) ON DELETE SET NULL,
  inspection_number text NOT NULL,
  inspection_date   date NOT NULL,
  inspector_name    text,
  inspector_user_id uuid REFERENCES app_users(id),
  status            text NOT NULL DEFAULT 'pass'
    CHECK (status IN ('pass','conditional_pass','fail','pending')),
  pass_qty          numeric(12,3),
  fail_qty          numeric(12,3),
  quality_score     numeric(5,2),                   -- 0–100
  defects_found     text,
  corrective_action text,
  reinspection_due  date,
  attachments       jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, inspection_number)
);

-- ==
-- 8. INVOICE APPROVAL WORKFLOW
-- ==

CREATE TABLE IF NOT EXISTS ap_invoice_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id        uuid NOT NULL REFERENCES ap_invoices(id) ON DELETE CASCADE,
  approval_level    integer NOT NULL CHECK (approval_level BETWEEN 1 AND 5),
  approver_role_key text NOT NULL,
  approver_user_id  uuid REFERENCES app_users(id),
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','escalated','skipped')),
  due_by            timestamptz,
  action_at         timestamptz,
  notes             text,
  escalated_to      uuid REFERENCES app_users(id),
  escalated_at      timestamptz,
  escalation_reason text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, approval_level)
);

-- ==
-- 9. PAYMENTS
-- ==

CREATE TABLE IF NOT EXISTS ap_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id        uuid NOT NULL REFERENCES ap_invoices(id) ON DELETE RESTRICT,
  vendor_id         uuid REFERENCES ap_vendors(id) ON DELETE SET NULL,
  bank_account_id   uuid REFERENCES ap_vendor_bank_accounts(id) ON DELETE SET NULL,
  payment_reference text NOT NULL,                   -- e.g.  PMT-NTL-8832 
  payment_date      date NOT NULL,
  amount            numeric(14,2) NOT NULL CHECK (amount > 0),
  currency          text NOT NULL DEFAULT 'INR',
  payment_mode      text NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_mode IN ('bank_transfer','rtgs','neft','imps','cheque','upi','dd','cash')),
  utr_number        text,                            -- Unique Transaction Reference
  cheque_number     text,
  bank_name         text,
  narration         text,
  status            text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','processing','completed','failed','reversed','cancelled')),
  failure_reason    text,
  processed_by      uuid REFERENCES app_users(id),
  processed_at      timestamptz,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, payment_reference)
);

-- ==
-- INDEXES
-- ==

CREATE INDEX IF NOT EXISTS idx_ap_vendors_entity          ON ap_vendors (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_po_entity               ON ap_purchase_orders (entity_id, status, po_date DESC);
CREATE INDEX IF NOT EXISTS idx_ap_po_vendor               ON ap_purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_po_lines_po             ON ap_po_line_items (po_id);
CREATE INDEX IF NOT EXISTS idx_ap_grn_entity              ON ap_goods_receipts (entity_id, status, grn_date DESC);
CREATE INDEX IF NOT EXISTS idx_ap_grn_po                  ON ap_goods_receipts (po_id);
CREATE INDEX IF NOT EXISTS idx_ap_grn_lines_grn           ON ap_grn_line_items (grn_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_entity         ON ap_invoices (entity_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_vendor         ON ap_invoices (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_lines_invoice   ON ap_invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_eway_entity             ON ap_eway_bills (entity_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_eway_invoice            ON ap_eway_bills (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_matches_entity          ON ap_document_matches (entity_id, match_status);
CREATE INDEX IF NOT EXISTS idx_ap_variances_match         ON ap_match_variances (match_id);
CREATE INDEX IF NOT EXISTS idx_ap_approvals_invoice       ON ap_invoice_approvals (invoice_id, approval_level);
CREATE INDEX IF NOT EXISTS idx_ap_payments_entity         ON ap_payments (entity_id, status, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_ap_payments_invoice        ON ap_payments (invoice_id);
