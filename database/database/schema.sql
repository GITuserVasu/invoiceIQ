CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text,
  password_hash text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'deactivated')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_users_email_uq ON app_users (lower(email));

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE industry_catalog (
  code text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE region_catalog (
  code text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE intake_channel_catalog (
  channel_key text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE document_type_catalog (
  document_type_key text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE source_catalog (
  source_key text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE module_catalog (
  module_key text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE permission_catalog (
  permission_key text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  description text
);

CREATE TABLE role_catalog (
  role_key text PRIMARY KEY,
  label text NOT NULL UNIQUE,
  description text,
  scope_type text NOT NULL CHECK (scope_type IN ('all', 'ap', 'ar', 'ap_ar')),
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE role_catalog_permissions (
  role_key text NOT NULL REFERENCES role_catalog(role_key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permission_catalog(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text,
  scope_type text NOT NULL CHECK (scope_type IN ('all', 'ap', 'ar', 'ap_ar')),
  source_role_key text REFERENCES role_catalog(role_key),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE role_permissions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permission_catalog(permission_key),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_key text NOT NULL,
  name text NOT NULL,
  industry_code text REFERENCES industry_catalog(code),
  region_code text REFERENCES region_catalog(code),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  created_by_user_id uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE entity_settings (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  primary_admin_email text NOT NULL,
  primary_admin_username text NOT NULL,
  primary_admin_user_id uuid REFERENCES app_users(id),
  onboarding_notes text,
  user_creation_enabled boolean NOT NULL DEFAULT true,
  rbac_enabled boolean NOT NULL DEFAULT true,
  default_role_key text NOT NULL DEFAULT 'entity_admin',
  accounts_payable_enabled boolean NOT NULL DEFAULT true,
  accounts_receivable_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entity_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  is_primary_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, user_id),
  UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX one_entity_primary_admin
  ON entity_memberships (entity_id)
  WHERE is_primary_admin = true AND status <> 'removed';

CREATE TABLE entity_membership_roles (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_membership_id uuid NOT NULL REFERENCES entity_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_user_id uuid REFERENCES app_users(id),
  PRIMARY KEY (entity_membership_id, role_id)
);

CREATE TABLE entity_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'engine' CHECK (source IN ('engine', 'custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, role_id),
  UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX one_entity_default_role
  ON entity_roles (entity_id)
  WHERE is_default = true AND is_enabled = true;

CREATE TABLE secret_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  secret_ref text NOT NULL,
  secret_type text NOT NULL CHECK (secret_type IN ('api_key', 'oauth', 'basic_auth', 'imap_password', 'bearer_token')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (tenant_id, secret_ref)
);

CREATE TABLE entity_intake_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  channel_key text NOT NULL REFERENCES intake_channel_catalog(channel_key),
  is_enabled boolean NOT NULL DEFAULT true,
  connection_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference_id uuid REFERENCES secret_references(id) ON DELETE SET NULL,
  connection_status text NOT NULL DEFAULT 'not_configured'
    CHECK (connection_status IN ('not_configured', 'pending', 'connected', 'error', 'disabled')),
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, channel_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE entity_channel_document_types (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intake_channel_id uuid NOT NULL REFERENCES entity_intake_channels(id) ON DELETE CASCADE,
  document_type_key text NOT NULL REFERENCES document_type_catalog(document_type_key),
  PRIMARY KEY (intake_channel_id, document_type_key)
);

CREATE TABLE entity_matching_policies (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  matching_method text NOT NULL CHECK (matching_method IN ('two_way', 'three_way', 'four_way')),
  purchase_order_source_key text NOT NULL REFERENCES source_catalog(source_key),
  grn_source_key text NOT NULL REFERENCES source_catalog(source_key),
  inspection_source_key text NOT NULL REFERENCES source_catalog(source_key),
  eway_bill_policy text NOT NULL CHECK (eway_bill_policy IN ('not_applicable', 'optional', 'required', 'required_above_threshold')),
  eway_bill_threshold numeric(14, 2) NOT NULL DEFAULT 0 CHECK (eway_bill_threshold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entity_modules (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES module_catalog(module_key),
  is_enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, module_key)
);

CREATE TABLE model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL UNIQUE,
  display_name text NOT NULL UNIQUE,
  provider text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_key text NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  owner_name text NOT NULL,
  output_schema_version text NOT NULL,
  baseline_prompt text NOT NULL,
  scope text NOT NULL DEFAULT 'tenant' CHECK (scope IN ('global', 'tenant')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'global' AND tenant_id IS NULL) OR (scope = 'tenant' AND tenant_id IS NOT NULL)),
  UNIQUE (tenant_id, prompt_key)
);

CREATE UNIQUE INDEX global_prompt_template_key_uq
  ON prompt_templates (prompt_key)
  WHERE scope = 'global';

CREATE TABLE prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES model_catalog(id) ON DELETE RESTRICT,
  version_tag text NOT NULL,
  prompt_text text NOT NULL,
  dataset_key text,
  change_summary text,
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'candidate', 'approved', 'rejected', 'archived')),
  created_by_user_id uuid REFERENCES app_users(id),
  approved_by_user_id uuid REFERENCES app_users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_tag)
);

CREATE TABLE prompt_quality_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_version_id uuid NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
  dataset_key text NOT NULL,
  precision_pct numeric(5, 2) NOT NULL CHECK (precision_pct BETWEEN 0 AND 100),
  recall_pct numeric(5, 2) NOT NULL CHECK (recall_pct BETWEEN 0 AND 100),
  f1_pct numeric(5, 2) NOT NULL CHECK (f1_pct BETWEEN 0 AND 100),
  hallucination_pct numeric(5, 2) NOT NULL CHECK (hallucination_pct BETWEEN 0 AND 100),
  latency_seconds numeric(8, 3) NOT NULL CHECK (latency_seconds >= 0),
  gate_result text NOT NULL CHECK (gate_result IN ('approved', 'needs_fix', 'blocked')),
  eval_report_ref text,
  evaluated_by_user_id uuid REFERENCES app_users(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_version_id, dataset_key)
);

CREATE TABLE model_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_key text NOT NULL,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES model_catalog(id) ON DELETE RESTRICT,
  current_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE RESTRICT,
  target_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE RESTRICT,
  rollout_strategy text NOT NULL DEFAULT 'canary'
    CHECK (rollout_strategy IN ('canary', 'full', 'pilot')),
  rollout_percent numeric(5, 2) NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  owner_role_id uuid REFERENCES roles(id) ON DELETE RESTRICT,
  owner_approval_status text NOT NULL DEFAULT 'pending'
    CHECK (owner_approval_status IN ('pending', 'approved', 'rejected')),
  assignment_status text NOT NULL DEFAULT 'pending_assignment'
    CHECK (assignment_status IN ('pending_assignment', 'planned', 'deploying', 'active', 'blocked', 'rolled_back')),
  assigned_by_user_id uuid REFERENCES app_users(id),
  approved_by_user_id uuid REFERENCES app_users(id),
  scheduled_at timestamptz,
  activated_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, assignment_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE model_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES model_assignments(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'approved', 'rollout_started', 'activated', 'blocked', 'rolled_back')),
  from_status text,
  to_status text,
  actor_user_id uuid REFERENCES app_users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classification_model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL UNIQUE,
  display_name text NOT NULL UNIQUE,
  provider text NOT NULL,
  model_version text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classification_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  mapping_key text NOT NULL,
  version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0),
  classification_model_id uuid NOT NULL REFERENCES classification_model_catalog(id) ON DELETE RESTRICT,
  document_type_key text REFERENCES document_type_catalog(document_type_key),
  confidence_threshold_pct numeric(5, 2) NOT NULL DEFAULT 90
    CHECK (confidence_threshold_pct BETWEEN 1 AND 100),
  fallback_class_key text NOT NULL DEFAULT 'manual_review',
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'published', 'archived')),
  created_by_user_id uuid REFERENCES app_users(id),
  published_by_user_id uuid REFERENCES app_users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, mapping_key, version_no),
  UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX current_classification_mapping_uq
  ON classification_mappings (entity_id, mapping_key)
  WHERE lifecycle_status = 'published';

CREATE TABLE classification_mapping_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mapping_id uuid NOT NULL REFERENCES classification_mappings(id) ON DELETE CASCADE,
  class_key text NOT NULL,
  priority integer NOT NULL CHECK (priority > 0),
  min_confidence_pct numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (min_confidence_pct BETWEEN 0 AND 100),
  routing_key text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pilot', 'inactive', 'fallback')),
  is_fallback boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mapping_id, class_key),
  UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX one_classification_fallback
  ON classification_mapping_classes (mapping_id)
  WHERE is_fallback = true;

CREATE TABLE classification_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mapping_id uuid NOT NULL REFERENCES classification_mappings(id) ON DELETE CASCADE,
  sample_text text,
  sample_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  predicted_class_key text,
  confidence_pct numeric(5, 2) CHECK (confidence_pct BETWEEN 0 AND 100),
  used_fallback boolean NOT NULL DEFAULT false,
  result_status text NOT NULL
    CHECK (result_status IN ('classified', 'fallback', 'unknown', 'error')),
  result_message text,
  executed_by_user_id uuid REFERENCES app_users(id),
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classification_mapping_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mapping_id uuid NOT NULL REFERENCES classification_mappings(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'previewed', 'tested', 'published', 'archived')),
  actor_user_id uuid REFERENCES app_users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  name text NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('LLM API', 'OCR API', 'Hybrid API')),
  base_url text NOT NULL,
  vault_ref text NOT NULL,
  secret_reference_id uuid REFERENCES secret_references(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pilot' CHECK (status IN ('Active', 'Pilot', 'Disabled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE provider_entity_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  use_case text NOT NULL,
  rollout_mode text NOT NULL DEFAULT 'Pilot' CHECK (rollout_mode IN ('Canary', 'Pilot', 'Full')),
  owner_name text NOT NULL,
  status text NOT NULL DEFAULT 'Pilot' CHECK (status IN ('Active', 'Pilot', 'Disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, provider_id, use_case)
);

CREATE TABLE api_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('gst', 'kyc', 'bank', 'biz', 'other')),
  provider text NOT NULL,
  base_url text,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('production', 'sandbox', 'test')),
  client_id text,
  secret_reference_id uuid REFERENCES secret_references(id) ON DELETE SET NULL,
  timeout_ms integer NOT NULL DEFAULT 5000 CHECK (timeout_ms > 0),
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'sandbox', 'pending', 'failed', 'disabled')),
  last_tested_at timestamptz,
  avg_response_ms integer,
  success_rate_pct numeric(5, 2) CHECK (success_rate_pct BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_id, api_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE entity_api_assignments (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  api_connection_id uuid NOT NULL REFERENCES api_connections(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, api_connection_id)
);

CREATE TABLE api_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_connection_id uuid NOT NULL REFERENCES api_connections(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'tested', 'assigned', 'disabled', 'rotated')),
  status text,
  response_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES app_users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entity_onboarding_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'created', 'failed')),
  current_step smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 7),
  submitted_by_user_id uuid REFERENCES app_users(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entities_tenant_status_idx ON entities (tenant_id, status);
CREATE INDEX entity_memberships_user_idx ON entity_memberships (tenant_id, user_id);
CREATE INDEX entity_intake_channels_entity_idx ON entity_intake_channels (tenant_id, entity_id);
CREATE INDEX entity_onboarding_runs_entity_idx ON entity_onboarding_runs (tenant_id, entity_id, created_at DESC);
CREATE INDEX audit_events_resource_idx ON audit_events (tenant_id, resource_type, resource_id, occurred_at DESC);
CREATE INDEX prompt_versions_template_idx ON prompt_versions (tenant_id, template_id, created_at DESC);
CREATE INDEX prompt_quality_evaluations_version_idx ON prompt_quality_evaluations (tenant_id, prompt_version_id, evaluated_at DESC);
CREATE INDEX model_assignments_entity_idx ON model_assignments (tenant_id, entity_id, updated_at DESC);
CREATE INDEX model_assignment_events_assignment_idx ON model_assignment_events (tenant_id, assignment_id, occurred_at DESC);
CREATE INDEX classification_mappings_entity_idx ON classification_mappings (tenant_id, entity_id, updated_at DESC);
CREATE INDEX classification_mapping_classes_mapping_idx ON classification_mapping_classes (tenant_id, mapping_id, priority);
CREATE INDEX classification_test_runs_mapping_idx ON classification_test_runs (tenant_id, mapping_id, executed_at DESC);
CREATE INDEX classification_mapping_events_mapping_idx ON classification_mapping_events (tenant_id, mapping_id, occurred_at DESC);
CREATE INDEX providers_tenant_status_idx ON providers (tenant_id, status);
CREATE INDEX provider_entity_assignments_entity_idx ON provider_entity_assignments (tenant_id, entity_id);
CREATE INDEX api_connections_entity_status_idx ON api_connections (tenant_id, entity_id, status);
CREATE INDEX api_connection_events_connection_idx ON api_connection_events (tenant_id, api_connection_id, occurred_at DESC);

INSERT INTO industry_catalog (code, label, sort_order) VALUES
  ('retail', 'Retail', 1),
  ('manufacturing', 'Manufacturing', 2),
  ('healthcare', 'Healthcare', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO region_catalog (code, label, sort_order) VALUES
  ('apac', 'APAC', 1),
  ('emea', 'EMEA', 2),
  ('americas', 'Americas', 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO intake_channel_catalog (channel_key, label, description, sort_order) VALUES
  ('sap', 'SAP / ERP Touchless API', 'Automated document intake from an ERP or SAP connection.', 1),
  ('upload', 'Document Upload Portal', 'Manual invoice and document upload.', 2),
  ('vendor', 'Vendor Portal', 'Supplier-submitted invoice intake.', 3),
  ('mail', 'Mail Connector', 'Mailbox and attachment intake.', 4)
ON CONFLICT (channel_key) DO NOTHING;

INSERT INTO document_type_catalog (document_type_key, label, sort_order) VALUES
  ('invoices', 'Invoices', 1),
  ('po', 'Purchase Orders', 2),
  ('grn', 'Goods Receipt Notes', 3),
  ('inspection', 'Inspection / Service Entry', 4)
ON CONFLICT (document_type_key) DO NOTHING;

INSERT INTO source_catalog (source_key, label, sort_order) VALUES
  ('sap', 'SAP / ERP API', 1),
  ('excel', 'Excel Upload', 2),
  ('manual', 'Manual Upload', 3),
  ('vendor_portal', 'Vendor Portal', 4),
  ('quality_api', 'Quality API', 5),
  ('not_applicable', 'Not Applicable', 6)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO module_catalog (module_key, label, description, sort_order) VALUES
  ('ap_ar_scope', 'AP / AR Scope', 'Accounts Payable and Accounts Receivable scope.', 1),
  ('user_access', 'User Access', 'User creation and RBAC.', 2),
  ('models', 'AI Model Integration', 'Model assignment and prompt versioning.', 3),
  ('classification', 'Document Classification', 'Classification and class override controls.', 4),
  ('provider_governance', 'Provider Governance', 'Provider policy and fallback routing.', 5),
  ('api_integrations', 'API Integrations', 'Optional tax, KYC, banking, and business APIs.', 6)
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO permission_catalog (permission_key, label, description) VALUES
  ('entity.read', 'View entity', 'View entity configuration and status.'),
  ('entity.manage', 'Manage entity', 'Update entity configuration and onboarding.'),
  ('users.manage', 'Manage users', 'Invite, suspend, and update entity users.'),
  ('roles.manage', 'Manage roles', 'Create and assign roles.'),
  ('ap.process', 'Process AP', 'Process invoices, matching, and payments.'),
  ('ar.process', 'Process AR', 'Process invoices, collections, and reconciliation.'),
  ('reports.read', 'View reports', 'View finance and operational reports.'),
  ('models.manage', 'Manage models', 'Assign models and prompt versions.'),
  ('classification.manage', 'Manage classification', 'Configure document classification rules.'),
  ('providers.manage', 'Manage providers', 'Configure provider governance and routing.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_catalog (role_key, label, description, scope_type) VALUES
  ('entity_admin', 'Entity Admin', 'Full administration for the entity.', 'all'),
  ('finance_controller', 'Finance Controller', 'Approval, reconciliation, and reporting across AP and AR.', 'ap_ar'),
  ('ap_manager', 'AP Manager', 'Accounts Payable processing and payment operations.', 'ap'),
  ('ar_manager', 'AR Manager', 'Accounts Receivable and collections operations.', 'ar')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO role_catalog_permissions (role_key, permission_key) VALUES
  ('entity_admin', 'entity.read'),
  ('entity_admin', 'entity.manage'),
  ('entity_admin', 'users.manage'),
  ('entity_admin', 'roles.manage'),
  ('entity_admin', 'ap.process'),
  ('entity_admin', 'ar.process'),
  ('entity_admin', 'reports.read'),
  ('entity_admin', 'models.manage'),
  ('entity_admin', 'classification.manage'),
  ('entity_admin', 'providers.manage'),
  ('finance_controller', 'entity.read'),
  ('finance_controller', 'ap.process'),
  ('finance_controller', 'ar.process'),
  ('finance_controller', 'reports.read'),
  ('ap_manager', 'entity.read'),
  ('ap_manager', 'ap.process'),
  ('ar_manager', 'entity.read'),
  ('ar_manager', 'ar.process')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_intake_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_channel_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_matching_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_quality_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_mapping_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_mapping_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_entity_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_api_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_onboarding_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_memberships_isolation ON tenant_memberships
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY roles_isolation ON roles
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY role_permissions_isolation ON role_permissions
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entities_isolation ON entities
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_settings_isolation ON entity_settings
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_memberships_isolation ON entity_memberships
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_membership_roles_isolation ON entity_membership_roles
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_roles_isolation ON entity_roles
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY secret_references_isolation ON secret_references
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_intake_channels_isolation ON entity_intake_channels
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_channel_document_types_isolation ON entity_channel_document_types
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_matching_policies_isolation ON entity_matching_policies
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_modules_isolation ON entity_modules
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY prompt_templates_isolation ON prompt_templates
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_current_tenant_id());

CREATE POLICY prompt_versions_isolation ON prompt_versions
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_current_tenant_id());

CREATE POLICY prompt_quality_evaluations_isolation ON prompt_quality_evaluations
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_current_tenant_id());

CREATE POLICY model_assignments_isolation ON model_assignments
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY model_assignment_events_isolation ON model_assignment_events
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY classification_mappings_isolation ON classification_mappings
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY classification_mapping_classes_isolation ON classification_mapping_classes
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY classification_test_runs_isolation ON classification_test_runs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY classification_mapping_events_isolation ON classification_mapping_events
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY providers_isolation ON providers
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY provider_entity_assignments_isolation ON provider_entity_assignments
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY api_connections_isolation ON api_connections
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_api_assignments_isolation ON entity_api_assignments
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY api_connection_events_isolation ON api_connection_events
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY entity_onboarding_runs_isolation ON entity_onboarding_runs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE POLICY audit_events_isolation ON audit_events
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

CREATE OR REPLACE FUNCTION refresh_entity_role_engine(target_entity_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_tenant_id uuid;
  ap_enabled boolean;
  ar_enabled boolean;
  requested_default_role text;
  effective_default_role text;
BEGIN
  SELECT e.tenant_id,
         COALESCE(s.accounts_payable_enabled, false),
         COALESCE(s.accounts_receivable_enabled, false),
         COALESCE(s.default_role_key, 'entity_admin')
    INTO target_tenant_id, ap_enabled, ar_enabled, requested_default_role
    FROM entities e
    LEFT JOIN entity_settings s ON s.entity_id = e.id
   WHERE e.id = target_entity_id;

  IF target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Entity % does not exist', target_entity_id;
  END IF;

  INSERT INTO roles (tenant_id, role_key, label, description, scope_type, source_role_key, is_system)
  SELECT target_tenant_id,
         c.role_key,
         c.label,
         c.description,
         c.scope_type,
         c.role_key,
         true
    FROM role_catalog c
   WHERE c.is_active
  ON CONFLICT (tenant_id, role_key) DO NOTHING;

  INSERT INTO role_permissions (tenant_id, role_id, permission_key)
  SELECT target_tenant_id, r.id, cp.permission_key
    FROM roles r
    JOIN role_catalog_permissions cp ON cp.role_key = r.role_key
   WHERE r.tenant_id = target_tenant_id
  ON CONFLICT DO NOTHING;

  SELECT r.role_key
    INTO effective_default_role
    FROM roles r
   WHERE r.tenant_id = target_tenant_id
     AND r.role_key = requested_default_role
     AND r.is_active
     AND (
       r.scope_type = 'all'
       OR (r.scope_type = 'ap' AND ap_enabled)
       OR (r.scope_type = 'ar' AND ar_enabled)
       OR (r.scope_type = 'ap_ar' AND ap_enabled AND ar_enabled)
     );

  effective_default_role := COALESCE(effective_default_role, 'entity_admin');

  DELETE FROM entity_roles
   WHERE entity_id = target_entity_id
     AND source = 'engine';

  INSERT INTO entity_roles (tenant_id, entity_id, role_id, is_enabled, is_default, source)
  SELECT target_tenant_id,
         target_entity_id,
         r.id,
         true,
         r.role_key = effective_default_role,
         'engine'
    FROM roles r
   WHERE r.tenant_id = target_tenant_id
     AND r.is_active
     AND (
       r.scope_type = 'all'
       OR (r.scope_type = 'ap' AND ap_enabled)
       OR (r.scope_type = 'ar' AND ar_enabled)
       OR (r.scope_type = 'ap_ar' AND ap_enabled AND ar_enabled)
     )
  ON CONFLICT (entity_id, role_id) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        is_default = EXCLUDED.is_default,
        updated_at = now();
END;
$$;
