import type { Pool } from "pg";

type AuthRequest = {
  auth?: {
    userId: string | null;
    role: string;
    tenantId: string | null;
  };
};

export async function requireEntityPermission(
  pool: Pool,
  req: AuthRequest,
  tenantId: string,
  entityId: string,
  permissions: string[],
): Promise<void> {
  const auth = req.auth;
  if (!auth) throw Object.assign(new Error("Authentication required"), { status: 401 });
  if (["super_admin", "service"].includes(auth.role)) return;
  if (auth.tenantId !== tenantId) {
    throw Object.assign(new Error("Tenant access denied"), { status: 403 });
  }
  if (!auth.userId) {
    throw Object.assign(new Error("User access is not assigned"), { status: 403 });
  }

  const result = await pool.query(
    `SELECT DISTINCT rp.permission_key
       FROM entity_memberships em
       JOIN entity_membership_roles emr ON emr.entity_membership_id = em.id
       JOIN roles r ON r.id = emr.role_id AND r.is_active
       JOIN role_permissions rp ON rp.role_id = r.id
      WHERE em.tenant_id = $1
        AND em.entity_id = $2
        AND em.user_id = $3
        AND em.status = 'active'`,
    [tenantId, entityId, auth.userId],
  );
  const granted = new Set(result.rows.map((row) => row.permission_key));
  if (!permissions.some((permission) => granted.has(permission))) {
    throw Object.assign(new Error("You do not have permission to access this view"), { status: 403 });
  }
}
