import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from './api.service';
import { EntityAccessService } from './entity-access.service';

export const entityPermissionGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const api = inject(ApiService);
  const access = inject(EntityAccessService);
  const entityId = route.queryParamMap.get('entityId')?.trim() || localStorage.getItem('lx_entity_id') || '';
  const tenantId = route.queryParamMap.get('tenantId')?.trim() || localStorage.getItem('lx_tenant_id') || '';
  const entityName = route.queryParamMap.get('entityName')?.trim() || localStorage.getItem('lx_entity_name') || '';
  const permission = String(route.data['permission'] || '');
  const menuKey = String(route.data['menuKey'] || '');

  try {
    const user = JSON.parse(localStorage.getItem('authUser') || '{}');
    if (user.role === 'super_admin') return true;
  } catch { /* continue with entity-scoped checks */ }

  if (!entityId || !tenantId || !permission) {
    return router.parseUrl('/login');
  }

  let email: string | undefined;
  try {
    const user = JSON.parse(localStorage.getItem('authUser') || '{}');
    email = typeof user.email === 'string' ? user.email : undefined;
  } catch { /* ignore malformed local session */ }

  return api.getEntityMenu(tenantId, entityId, email).pipe(
    map((response: any) => {
      const permissions = new Set<string>(response.permissions || []);
      access.setPermissions([...permissions]);
      const hasPermission = permission.split('|').some((item) => permissions.has(item));
      const menuItem = (response.menu || []).find((item: any) => item.key === menuKey);
      if (hasPermission && (!menuKey || menuItem?.visible !== false)) return true;
      return router.createUrlTree(['/entity-dashboard'], {
        queryParams: { entityId, entityName, tenantId, denied: 'true' }
      });
    }),
    catchError(() => {
      if (entityId) {
        return of(router.createUrlTree(['/entity-dashboard'], {
          queryParams: { entityId, entityName, tenantId, denied: 'true' }
        }));
      }
      return of(router.parseUrl('/login'));
    }),
  );
};
