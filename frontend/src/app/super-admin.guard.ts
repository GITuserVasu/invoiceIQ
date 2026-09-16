import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const superAdminGuard: CanActivateFn = () => {
  const router = inject(Router);
  try {
    const user = JSON.parse(localStorage.getItem('authUser') || '{}');
    if (user.role === 'super_admin') return true;
    if (user.entityKey && user.tenantId) {
      return router.createUrlTree(['/entity-dashboard'], {
        queryParams: {
          entityId: user.entityKey,
          entityName: user.entityName || '',
          tenantId: user.tenantId
        }
      });
    }
  } catch { /* fall through to login */ }
  return router.parseUrl('/login');
};
