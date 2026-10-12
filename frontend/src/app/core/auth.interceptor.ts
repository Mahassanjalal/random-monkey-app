import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { from, catchError, switchMap, throwError } from 'rxjs';
import type {Observable} from 'rxjs';
import { AuthService } from './auth.service';

const SKIP = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/logout'];

/** Attaches the bearer token; on 401 performs a single-flight refresh and retries once. */
export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);
  const skip = SKIP.some((p) => req.url.includes(p));
  const token = auth.access();
  const withAuth =
    token && !skip ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withAuth).pipe(
    catchError((err: unknown) => {
      const is401 = err instanceof HttpErrorResponse && err.status === 401;
      if (!is401 || skip || !req.url.includes('/api/')) {
        return throwError(() => err);
      }
      return from(auth.on401()).pipe(
        switchMap((ok) => {
          if (!ok) return throwError(() => err);
          const retry = req.clone({
            setHeaders: { Authorization: `Bearer ${auth.access() ?? ''}` },
          });
          return next(retry);
        }),
      );
    }),
  );
};
