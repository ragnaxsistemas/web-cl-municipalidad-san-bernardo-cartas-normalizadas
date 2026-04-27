import { Component, inject, signal, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DataService } from '@core/services/data.service';
import { AuthService } from '@core/services/auth.service';
import { forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export interface RegistroProcesar {
  tipo: string;
  unidad: string;
  carpeta: string;
  nombre: string;
  observacion: string;
  creacion: string;
}

@Component({
  selector: 'app-procesar-archivo',
  standalone: true,
  imports: [
    CommonModule, 
    MatTableModule, 
    MatButtonModule, 
    MatIconModule, 
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './procesar-archivo.component.html',
  styleUrls: ['./procesar-archivo.component.scss']
})
export class ProcesarArchivoComponent implements OnInit {
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  @ViewChild('loadingDialog') loadingDialogTpl!: TemplateRef<any>;

  tipo = signal<'cobranza' | 'notificacion'>('cobranza'); 
  tituloPagina = signal('Procesar Archivos Normalizados');
  resultados = signal<RegistroProcesar[]>([]);

  // 🚩 Las 6 columnas: Proceso, Unidad, Ubicación, Creación, Observación, Acciones
  displayedColumns: string[] = ['proceso', 'unidad', 'ubicacion', 'creacion', 'observacion', 'acciones'];

  ngOnInit() {
    this.cargarUltimosCinco();
  }

  cargarUltimosCinco() {
    const user = this.authService.user();
    const tipoActual = this.tipo();
    const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 'tesoreria';

    // 🚩 LOG 1: Entrada al método
    console.log(`[Procesar-Archivo] 🚀 Llamando a cargarUltimosCinco | Parámetros:`, { 
      seccion: 'merge', 
      tipo: tipoActual, 
      unidad: unidadCodigo 
    });

    this.dataService.listarArchivos('merge', tipoActual, unidadCodigo).pipe(
      switchMap((res: any) => {
        // 🚩 LOG 2: Respuesta del listado de carpetas
        console.log(`[Procesar-Archivo] 📂 Respuesta carpetas (merge):`, res);
        
        const items = res.items || [];
        const carpetasValidas = items
          .filter((item: any) => item.esDirectorio)
          .sort((a: any, b: any) => b.nombre.localeCompare(a.nombre))
          .slice(0, 5);

        if (carpetasValidas.length === 0) {
          console.warn(`[Procesar-Archivo] ⚠️ No se encontraron carpetas en la ruta.`);
          return of([]);
        }

        const consultas = carpetasValidas.map((folder: any) => {
          // 🚩 LOG 3: Petición de detalle por cada carpeta
          console.log(`[Procesar-Archivo] 🔍 Listando contenido de carpeta: ${folder.nombre}`);
          
          return this.dataService.listarArchivos('merge', tipoActual, unidadCodigo, folder.nombre).pipe(
            map((detalle: any) => {
              const archivos = detalle.items || [];
              const archivoExcel = archivos.find((f: any) => f.nombre.endsWith('.xlsx'));
              
              return {
                tipo: tipoActual,
                unidad: unidadCodigo,
                carpeta: folder.nombre,
                nombre: archivoExcel ? archivoExcel.nombre : 'Sin archivo',
                observacion: archivoExcel?.observacion || '---',
                creacion: archivoExcel ? archivoExcel.fechaCreacion : folder.fechaCreacion
              } as RegistroProcesar;
            })
          );
        });
        return forkJoin(consultas);
      })
    ).subscribe({
      next: (data: any) => {
        // 🚩 LOG 4: Fin del proceso con datos finales
        console.log(`[Procesar-Archivo] ✅ Datos finales seteados en la tabla:`, data);
        this.resultados.set(data);
      },
      error: (err) => {
        console.error(`[Procesar-Archivo] ❌ ERROR en el flujo:`, err);
        this.resultados.set([]);
      }
    });
  }

  procesarArchivo(reg: RegistroProcesar) {
  // 1. Validar que el archivo sea válido antes de abrir nada
  if (reg.nombre === 'Sin archivo') {
    this.snackBar.open('⚠️ No hay un archivo válido para procesar', 'Cerrar', { duration: 3000 });
    return;
  }

  // 2. Abrir el modal de carga (usando el TemplateRef que ya tienes inyectado)
  const dialogRef = this.dialog.open(this.loadingDialogTpl, {
    disableClose: true,
    width: '350px'
  });

  // 3. Construir el payload según el CURL solicitado
  const payload = {
    usuario: this.authService.user()?.email || 'usuario@desconocido.cl', // o el campo que guarde el correo
    tipo: reg.tipo,
    unidad: reg.unidad,
    // Formato: "carpeta/archivo.xlsx"
    nombreArchivoNormalizado: `${reg.carpeta}/${reg.nombre}`
  };

  console.log('[Procesar] Enviando petición a execute-archivo-cobranza:', payload);

  // 4. Llamada al servicio
  this.dataService.procesarGeneracionCartas(payload).subscribe({
    next: (res: any) => {
      console.log('[Procesar] ✅ Éxito:', res);
      dialogRef.close(); // Cerrar modal
      
      this.snackBar.open('✅ Proceso completado: ' + (res.mensaje || 'Ok'), 'Cerrar', {
        duration: 5000,
        panelClass: ['success-snackbar']
      });

      // Recargar la tabla para ver cambios si es necesario
      this.cargarUltimosCinco();
    },
    error: (err) => {
      console.error('[Procesar] ❌ Error:', err);
      dialogRef.close(); // Cerrar modal aunque falle
      
      const msgError = err.error?.message || 'Error interno del servidor';
      this.snackBar.open('❌ Falló el procesamiento: ' + msgError, 'Cerrar', {
        duration: 7000
      });
    }
  });
  }
}