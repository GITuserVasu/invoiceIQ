import { HttpInterceptorFn } from '@angular/common/http';

export const auditInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req);
};
