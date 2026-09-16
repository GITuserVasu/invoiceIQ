-- Migration 003: Entity Operational Tables
-- Creates tables for Reconciliation, Exception Queue, and Transactions screens.
-- Uses JSONB for rich nested document data — normalized in a future migration.

-- ── 1. Entity Invoices (Reconciliation screen) ────────────────────────────
CREATE TABLE IF NOT EXISTS entity_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id        uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_key      text NOT NULL,              -- e.g. "INV-NTL-2291"
  vendor_name      text NOT NULL,
  gstin            text,
  amount_num       numeric(14,2) NOT NULL DEFAULT 0,
  po_ref           text,
  grn_ref          text,
  match_status     text NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('matched','partial','unmatched','disputed','pending')),
  variance_amount  numeric(14,2) NOT NULL DEFAULT 0,
  invoice_date     date,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full rich payload
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, invoice_key)
);

-- ── 2. Entity Exceptions (Exception Queue screen) ─────────────────────────
CREATE TABLE IF NOT EXISTS entity_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id        uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  exception_key    text NOT NULL,              -- e.g. "EXC-24018"
  title            text NOT NULL,
  invoice_ref      text,
  severity         text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  status           text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','escalated','resolved','closed')),
  reason_code      text,
  amount_num       numeric(14,2) NOT NULL DEFAULT 0,
  owner_name       text,
  backup_name      text,
  sla_minutes      integer NOT NULL DEFAULT 240,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, exception_key)
);

-- ── 3. Entity Processing Batches (Transactions screen) ────────────────────
CREATE TABLE IF NOT EXISTS entity_processing_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id        uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  batch_id         text NOT NULL,              -- e.g. "BATCH-2025-0501-001"
  document_type    text,
  source_channel   text CHECK (source_channel IN ('sap','upload','vendor','mail')),
  pdf_count        integer NOT NULL DEFAULT 1,
  page_count       integer NOT NULL DEFAULT 1,
  active_step      integer NOT NULL DEFAULT 0,
  completed_steps  integer[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','stopped','completed','failed')),
  stop_reason      text,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, batch_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_entity_invoices_entity    ON entity_invoices (entity_id, match_status);
CREATE INDEX IF NOT EXISTS idx_entity_exceptions_entity  ON entity_exceptions (entity_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_entity_batches_entity     ON entity_processing_batches (entity_id, status);
