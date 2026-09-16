ALTER TABLE entity_processing_batches
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS stored_file_path text,
  ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS ocr_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS ap_approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  policy_name text NOT NULL,
  minimum_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (minimum_amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, policy_name)
);

CREATE TABLE IF NOT EXISTS ap_approval_policy_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES ap_approval_policies(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  approval_level integer NOT NULL CHECK (approval_level BETWEEN 1 AND 5),
  approver_role_key text NOT NULL,
  sla_hours integer NOT NULL DEFAULT 24 CHECK (sla_hours > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, approval_level)
);

CREATE INDEX IF NOT EXISTS idx_ap_approval_policies_entity
  ON ap_approval_policies (entity_id, is_active, minimum_amount);
CREATE INDEX IF NOT EXISTS idx_ap_approval_steps_policy
  ON ap_approval_policy_steps (policy_id, approval_level);

CREATE TABLE IF NOT EXISTS supplier_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES ap_vendors(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','invited','suspended')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, email)
);

CREATE TABLE IF NOT EXISTS supplier_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES ap_vendors(id) ON DELETE CASCADE,
  supplier_user_id uuid NOT NULL REFERENCES supplier_users(id) ON DELETE RESTRICT,
  submission_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  stored_file_path text NOT NULL,
  document_type text NOT NULL DEFAULT 'invoice',
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','processing','accepted','rejected','needs_information')),
  invoice_id uuid REFERENCES ap_invoices(id) ON DELETE SET NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, submission_key)
);

CREATE TABLE IF NOT EXISTS supplier_submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES supplier_submissions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL,
  notes text,
  actor_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_users_login
  ON supplier_users (entity_id, lower(email), status);
CREATE INDEX IF NOT EXISTS idx_supplier_submissions_vendor
  ON supplier_submissions (vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_submission_events_submission
  ON supplier_submission_events (submission_id, created_at DESC);

INSERT INTO permission_catalog (permission_key, label, description) VALUES
  ('ap.approve', 'Approve AP invoices', 'Approve or reject invoices in the AP workflow.'),
  ('ap.exception.manage', 'Manage AP exceptions', 'Resolve, escalate, and assign AP exceptions.'),
  ('supplier.manage', 'Manage suppliers', 'Manage supplier users and portal submissions.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_catalog_permissions (role_key, permission_key) VALUES
  ('entity_admin', 'ap.approve'),
  ('entity_admin', 'ap.exception.manage'),
  ('entity_admin', 'supplier.manage'),
  ('finance_controller', 'ap.approve'),
  ('finance_controller', 'ap.exception.manage'),
  ('ap_manager', 'ap.approve'),
  ('ap_manager', 'ap.exception.manage'),
  ('ap_manager', 'supplier.manage')
ON CONFLICT DO NOTHING;
