// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  let clonedRequest = req;
  if (token) {
    clonedRequest = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }
  return next(clonedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      // Si el servidor dice que el token no vale (401), sacamos al usuario
      if (error.status === 401) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};