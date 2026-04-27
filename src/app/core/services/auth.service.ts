// src/app/core/services/auth.service.ts
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../../environments/environment';
import { UserToken, UserResponse } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  private userState = signal<UserToken | null>(null);
  private logoutTimer: any;

  user = computed(() => this.userState());
  currentUser = computed(() => this.userState()); 
  isAuthenticated = computed(() => !!this.userState());
  userMenus = computed(() => this.userState()?.menus || []);

  constructor() {
    this.checkSession();
  }

  login(credentials: any) {
    return this.http.post<UserResponse>(`${environment.apiUrl}/login`, credentials);
  }

  /**
   * HOMOLOGADO: Ahora se llama saveToken y retorna el UserToken
   */
  saveToken(token: string): UserToken | null {
    try {
      localStorage.setItem('token', token);
      const decoded = jwtDecode<UserToken>(token);
      
      // Persistencia estilo Valdivia
      localStorage.setItem('usuario', JSON.stringify(decoded));
      localStorage.setItem('nombre', decoded.nombre);
      localStorage.setItem('apellidoPaterno', decoded.apellidoPaterno);
      localStorage.setItem('role', JSON.stringify(decoded.role));
      localStorage.setItem('unidadNegocio', JSON.stringify(decoded.unidadNegocio));
      localStorage.setItem('menus', JSON.stringify(decoded.menus || []));
      
      // Estado reactivo
      this.userState.set(decoded);

      // Utilidades IMSB
      this.logTiempoRestante(decoded.exp);
      this.scheduleAutoLogout(decoded.exp);

      return decoded;
    } catch (error) {
      console.error('Error al procesar el token:', error);
      return null;
    }
  }

  checkSession() {
    const token = localStorage.getItem('token');
    if (token && !this.isTokenExpired(token)) {
      const decoded = jwtDecode<UserToken>(token);
      this.userState.set(decoded);
      this.scheduleAutoLogout(decoded.exp);
      return true;
    }
    this.logout();
    return false;
  }

  private isTokenExpired(token: string): boolean {
    try {
      const decoded = jwtDecode<UserToken>(token);
      return decoded.exp < Math.floor(Date.now() / 1000);
    } catch { return true; }
  }

  logout() {
    if (this.logoutTimer) clearTimeout(this.logoutTimer);
    localStorage.clear(); // Limpia todo lo de Valdivia e IMSB
    this.userState.set(null);
    this.router.navigate(['/login']);
  }

  private scheduleAutoLogout(expirationTime: number) {
    if (this.logoutTimer) clearTimeout(this.logoutTimer);
    const delay = (expirationTime * 1000) - Date.now();
    if (delay > 0) {
      this.logoutTimer = setTimeout(() => this.logout(), delay);
    }
  }

  private logTiempoRestante(expirationTimeSeconds: number) {
    const timeLeft = (expirationTimeSeconds * 1000) - Date.now();
    if (timeLeft > 0) {
      const min = Math.floor(timeLeft / 60000);
      const sec = Math.floor((timeLeft % 60000) / 1000);
      console.log(
        `%c [SESIÓN IMSB] %c Expira en: %c ${min}m ${sec}s `,
        'color: #FFCC00; background: #003399; font-weight: bold;', 
        'color: white; background: #444;',
        'color: #FFCC00; background: #000; font-weight: bold;'
      );
    }
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }
}