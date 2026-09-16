import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  try {
    const isSupplierRequest = req.url.includes('/api/v1/supplier/');
    const token = localStorage.getItem(isSupplierRequest ? 'supplierAccessToken' : 'accessToken');
    if (token) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
    }
  } catch (_) {}
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('supplierAccessToken');
        if (!router.url.startsWith('/login')) {
          void router.navigate(['/login'], {
            queryParams: { returnUrl: router.url }
          });
        }
      }
      return throwError(() => error);
    })
  );
};
