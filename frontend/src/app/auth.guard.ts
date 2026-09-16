import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (_route, _state) => {
  const router = inject(Router);
  if (localStorage.getItem('accessToken')) return true;
  router.navigate(['/login']);
  return false;
};
