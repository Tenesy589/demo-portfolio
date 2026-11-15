import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { I18nService } from './i18n.service';
import { ToastService } from './toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};

/** Centralised error handling: one place turns HTTP errors into user-facing messages. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const i18n = inject(I18nService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.endsWith('/auth/login')) {
        auth.logout();
        toast.error(i18n.t('errors.sessionExpired'));
      } else if (err.status === 403) {
        toast.error(i18n.t('errors.forbidden'));
      } else if (err.status === 0 || err.status >= 500) {
        toast.error(i18n.t('errors.server'));
      }
      return throwError(() => err);
    }),
  );
};
