INSERT INTO permission_catalog (permission_key, label, description) VALUES
  ('ap.read', 'View AP', 'View AP transactions, reconciliation, and exceptions.'),
  ('ar.read', 'View AR', 'View AR transactions, reconciliation, and exceptions.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_catalog (role_key, label, description, scope_type)
VALUES ('viewer', 'Viewer', 'Read-only access to assigned entity views.', 'ap_ar')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO role_catalog_permissions (role_key, permission_key)
VALUES
  ('viewer', 'entity.read'),
  ('viewer', 'ap.read'),
  ('viewer', 'ar.read'),
  ('viewer', 'reports.read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, permission.permission_key
  FROM roles r
 CROSS JOIN (VALUES
   ('entity_admin', 'ap.read'),
   ('entity_admin', 'ar.read'),
   ('finance_controller', 'ap.read'),
   ('finance_controller', 'ar.read'),
   ('ap_manager', 'ap.read'),
   ('ar_manager', 'ar.read'),
   ('viewer', 'entity.read'),
   ('viewer', 'ap.read'),
   ('viewer', 'ar.read'),
   ('viewer', 'reports.read')
 ) AS permission(role_key, permission_key)
 WHERE r.role_key = permission.role_key
ON CONFLICT DO NOTHING;

INSERT INTO roles (tenant_id, role_key, label, description, scope_type, source_role_key, is_system)
SELECT DISTINCT e.tenant_id, 'viewer', 'Viewer', 'Read-only access to assigned entity views.', 'ap_ar', 'viewer', true
  FROM entities e
ON CONFLICT (tenant_id, role_key) DO NOTHING;

INSERT INTO role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, permission.permission_key
  FROM roles r
 CROSS JOIN (VALUES
   ('entity.read'),
   ('ap.read'),
   ('ar.read'),
   ('reports.read')
 ) AS permission(permission_key)
 WHERE r.role_key = 'viewer'
ON CONFLICT DO NOTHING;
