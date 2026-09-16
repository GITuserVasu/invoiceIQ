BEGIN;

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

CREATE INDEX providers_tenant_status_idx ON providers (tenant_id, status);
CREATE INDEX provider_entity_assignments_entity_idx ON provider_entity_assignments (tenant_id, entity_id);
CREATE INDEX api_connections_entity_status_idx ON api_connections (tenant_id, entity_id, status);
CREATE INDEX api_connection_events_connection_idx ON api_connection_events (tenant_id, api_connection_id, occurred_at DESC);

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_entity_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_api_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_connection_events ENABLE ROW LEVEL SECURITY;

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

COMMIT;
