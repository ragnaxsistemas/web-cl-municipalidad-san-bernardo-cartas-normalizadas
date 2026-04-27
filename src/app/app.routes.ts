import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { RegistrosComponent } from './features/operador/registros/registros.component';
import { AdjuntarComponent } from './features/operador/adjuntar-archivo/adjuntar-archivo.component'; 
import { NormalizarComponent } from './features/operador/normalizar-archivo/normalizar-archivo.component';
import { ProcesarArchivoComponent } from './features/operador/procesar-archivo/procesar-archivo.component'; // 🚩 IMPORT NUEVO
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: 'imsb',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      // --- REGISTROS (VISTA DE TABLA) ---
      { 
        path: 'cobranza/registros', 
        component: RegistrosComponent, 
        data: { tipo: 'cobranza', titulo: 'Registros de Cobranza' } 
      },
      { 
        path: 'notificacion/registros', 
        component: RegistrosComponent, 
        data: { tipo: 'notificacion', titulo: 'Registros de Notificaciones' } 
      },

      // --- ADJUNTAR (CARGA DE EXCEL/PDF) ---
      // Asegúrate de que estos "path" coincidan con lo que viene en el JWT (menu.value2)
      { 
        path: 'cobranza/adjuntar-cobranza', 
        component: AdjuntarComponent, 
        data: { tipo: 'cobranza', titulo: 'Adjuntar Archivo de Cobranza' } 
      },
      { 
        path: 'notificacion/adjuntar-notificacion', 
        component: AdjuntarComponent, 
        data: { tipo: 'notificacion', titulo: 'Adjuntar Archivo de Notificación' } 
      },
      /***{ 
        path: 'cobranza/enviar-correos-cobranza', 
        component: EnviarCorreosComponent, 
        data: { tipo: 'cobranza' } 
      },
      { 
        path: 'notificacion/enviar-correos-notificacion', 
        component: EnviarCorreosComponent, 
        data: { tipo: 'notificacion' } 
      },***/
      { 
        path: 'cobranza/normalizacion', 
        component: NormalizarComponent, 
        data: { tipo: 'cobranza' } 
      },
      { 
        path: 'notificacion/normalizacion', 
        component: NormalizarComponent, 
        data: { tipo: 'notificacion' } 
      },

      // --- 3. PROCESAR / GENERAR (Paso final) --- 🚩 RUTAS NUEVAS
      { 
        path: 'cobranza/procesar', 
        component: ProcesarArchivoComponent, 
        data: { tipo: 'cobranza' } 
      },
      { 
        path: 'notificacion/procesar', 
        component: ProcesarArchivoComponent, 
        data: { tipo: 'notificacion' } 
      },

      // Redirección por defecto al estar logueado
      { path: '', redirectTo: 'cobranza/registros', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];