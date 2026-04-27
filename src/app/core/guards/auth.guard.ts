// src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// src/app/core/guards/auth.guard.ts
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Si no está autenticado, intentamos ver si hay token en localStorage 
  // (por si refrescó la página)
  const token = localStorage.getItem('imsb_auth_token');
  if (token) {
    return true; 
  }

  return router.createUrlTree(['/login']);
};