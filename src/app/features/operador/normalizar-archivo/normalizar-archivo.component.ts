import { Component, signal, inject, OnInit , ViewChild, TemplateRef ,ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { ActivatedRoute } from '@angular/router';

// Angular Material Imports
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { FormsModule } from '@angular/forms'; 
import { DataService } from '@core/services/data.service';
import { AuthService } from '@core/services/auth.service';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { MatCheckboxModule } from '@angular/material/checkbox';

export interface RegistroNormalizar {
  tipo: string;
  unidad: string;
  carpeta: string;
  nombreExcel: string | null; // Cambiado de nombre a nombreExcel para que coincida con el mapeo
  observacion: string;
  creacion: string;
}

@Component({
  selector: 'app-normalizar-archivo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule, 
    MatProgressSpinnerModule, 
    MatDialogModule
  ],
  templateUrl: './normalizar-archivo.component.html',
  styleUrls: ['./normalizar-archivo.component.scss']
})
export class NormalizarComponent implements OnInit {
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  

  @ViewChild('loadingDialog') loadingDialogTpl!: TemplateRef<any>;
  
  archivoGeneradoNombre = signal<string | null>(null);
  private currentLoadingDialog: any = null;
  archivoCsvAdjunto = signal<File | null>(null);
  cargando = signal(false);
  tipoDocumento = signal<string>('cobranza');
  resultados = signal<RegistroNormalizar[]>([]);
  resultadosPendientes = signal<RegistroNormalizar[]>([]); // 💡 Todos los pendientes
  resultadosProcesados = signal<RegistroNormalizar[]>([]);
  
  // 🚩 Añadimos la columna 'select' al inicio de la tabla
  displayedColumns: string[] = ['select', 'tipo', 'unidad', 'creacion', 'observacion'];
  displayedColumnsProcesados: string[] = ['tipo', 'unidad', 'creacion', 'observacion'];

  // 🚩 Nueva señal para almacenar la fila seleccionada con el Checkbox
  reporteSeleccionado = signal<RegistroNormalizar | null>(null);

  private definirTipoDocumentoPorUnidad() {
    const user = this.authService.user();
    const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 
                        localStorage.getItem('unidadCodigo')?.replace('imsb_', '') || '';

    if (unidadCodigo.includes('1juzgado') || unidadCodigo.includes('2juzgado')) {
      this.tipoDocumento.set(unidadCodigo);
      console.log(`⚖️ Modo Juzgado detectado: ${unidadCodigo}`);
    } else {
      this.tipoDocumento.set('cobranza');
      console.log('💰 Modo Tesorería/Cobranza detectado');
    }
  }

  ngOnInit() {
    this.definirTipoDocumentoPorUnidad();
    this.cargarHistorialNormalizados();
  }

  // 🚩 Manejador del cambio del Checkbox (Exclusivo: solo uno seleccionado a la vez)
  onSeleccionarReporte(row: RegistroNormalizar, checked: boolean) {
    if (checked) {
      this.reporteSeleccionado.set(row);
    } else {
      if (this.reporteSeleccionado() === row) {
        this.reporteSeleccionado.set(null);
      }
    }
  }

  extraerFechaDeNombre(nombreCarpeta: string): string {
    if (!nombreCarpeta) return '---';
    const matches = nombreCarpeta.match(/(\d{4})[\-_](\d{2})[\-_](\d{2})/);

    if (matches && matches.length >= 4) {
      const año = matches[1];
      const mes = matches[2];
      const dia = matches[3];
      return `${dia}-${mes}-${año}`;
    }

    const partes = nombreCarpeta.split(/[_\-]/);
    const indexAño = partes.findIndex(p => p.length === 4 && !isNaN(Number(p)));
    
    if (indexAño !== -1 && partes[indexAño + 2]) {
      const año = partes[indexAño];
      const mes = partes[indexAño + 1];
      const dia = partes[indexAño + 2];
      return `${dia}-${mes}-${año}`;
    }

    return nombreCarpeta; 
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.csv')) {
      this.archivoCsvAdjunto.set(file);
    } else {
      this.snackBar.open('Por favor, seleccione un archivo CSV válido', 'Cerrar', { duration: 3000 });
    }
  }

  cargarHistorialNormalizados() {
    const user = this.authService.user();
    const valorTipoCrudo = this.tipoDocumento();
    
    const tipoActual = valorTipoCrudo.toLowerCase().includes('juzgado') 
      ? 'notificacion' 
      : 'cobranza';

    const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 
                        localStorage.getItem('unidadCodigo')?.replace('imsb_', '') || 'tesoreria';
    
    console.log(`%c📂 [Historial] Iniciando evaluación para tipo: ${tipoActual} | unidad: ${unidadCodigo}`, 'color: #2196F3; font-weight: bold;');

    // 1. Listamos todas las carpetas del origen 'normalizado'
    this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo).pipe(
      switchMap((res: any): Observable<any[]> => {
        const items = res.items || [];
        
        const carpetasNormalizadas = items
          .filter((item: any) => item.esDirectorio)
          .sort((a: any, b: any) => b.nombre.localeCompare(a.nombre));

        console.log(`📋 [Historial] Carpetas base encontradas en 'normalizado':`, carpetasNormalizadas.map((c: any) => c.nombre));

        if (carpetasNormalizadas.length === 0) return of([]);

        // 2. Por cada carpeta en normalizado, inspeccionamos su estado en producción
        const peticionesCarpetas = carpetasNormalizadas.map((c: any) => {
          const obsNormalizadoInterno = this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo, c.nombre);
          const obsProduccionInterno = this.dataService.listarArchivos(tipoActual, unidadCodigo, c.nombre);

          return forkJoin({ norm: obsNormalizadoInterno, prod: obsProduccionInterno }).pipe(
            switchMap(({ norm, prod }: any) => {
              const archivosNorm = norm.items || [];
              const archivosProd = prod.items || [];

              console.log(`🔍 [Carpeta: ${c.nombre}] Contenido en producción (primer nivel):`, archivosProd.map((p: any) => p.nombre));

              // Buscamos el Excel original en la carpeta de normalizados para extraer metadatos
              const excel = archivosNorm.find((f: any) => f.nombre.endsWith('.xlsx'));
              
              // DETECCIÓN: Verificamos si existe la subcarpeta CARTAS_CONSOLIDADAS en producción
              const tieneSubcarpetaConsolidado = archivosProd.some(
                (item: any) => item.esDirectorio && item.nombre === 'CARTAS_CONSOLIDADAS'
              );

              console.log(`❓ [Carpeta: ${c.nombre}] ¿Tiene directorio 'CARTAS_CONSOLIDADAS'?:`, tieneSubcarpetaConsolidado);

              // Si NO tiene la subcarpeta, sigue estando pendiente
              if (!tieneSubcarpetaConsolidado) {
                return of({
                  tipo: tipoActual,
                  unidad: unidadCodigo,
                  carpeta: c.nombre,
                  nombreExcel: excel ? excel.nombre : null,
                  observacion: excel?.observacion || '---',
                  creacion: this.extraerFechaDeNombre(c.nombre),
                  procesadoExitosamente: false,
                  archivosFinales: []
                });
              }

              // Si existe CARTAS_CONSOLIDADAS, hacemos el llamado anidado
              console.log(`🚀 [Carpeta: ${c.nombre}] Llamando subcarpeta interna 'CARTAS_CONSOLIDADAS'...`);
              return this.dataService.listarArchivos(tipoActual, unidadCodigo, c.nombre, 'CARTAS_CONSOLIDADAS').pipe(
                map((subRes: any) => {
                  const archivosInternos = subRes.items || [];
                  console.log(`📦 [Carpeta: ${c.nombre}] Archivos dentro de CARTAS_CONSOLIDADAS:`, archivosInternos.map((f: any) => f.nombre));
                  
                  // Confirmamos el procesamiento si hay archivos reales adentro
                  const tieneArchivosReales = archivosInternos.some((f: any) => !f.esDirectorio && f.nombre !== '.DS_Store');
                  console.log(`📊 [Carpeta: ${c.nombre}] ¿Contiene archivos válidos finales?:`, tieneArchivosReales);

                  const postalFile = archivosInternos.find((f: any) => f.nombre.includes('postal'));
                  const observacionFinal = postalFile?.observacion && postalFile.observacion !== 'Sin observación'
                    ? postalFile.observacion 
                    : (excel?.observacion || '---');

                  return {
                    tipo: tipoActual,
                    unidad: unidadCodigo,
                    carpeta: c.nombre,
                    nombreExcel: excel ? excel.nombre : null,
                    observacion: observacionFinal,
                    creacion: this.extraerFechaDeNombre(c.nombre),
                    procesadoExitosamente: tieneArchivosReales,
                    archivosFinales: archivosInternos
                  };
                })
              );
            })
          );
        });

        return forkJoin<any[]>(peticionesCarpetas);
      })
    ).subscribe({
      next: (todasLasCarpetas: any[]) => {
        console.log(`%c=== 🏁 RESULTADO TOTAL DE CARPETAS MAPEADAS ===`, 'color: #4CAF50; font-weight: bold;');
        console.log(todasLasCarpetas);

        // Separar pendientes
        const pendientes = todasLasCarpetas.filter((item: any) => !item.procesadoExitosamente);
        this.resultadosPendientes.set(pendientes);
        console.log(`📌 [Resultados] Enviados a PENDIENTES:`, pendientes.map((p: any) => p.carpeta));

        // Separar procesados
        const procesados = todasLasCarpetas.filter((item: any) => item.procesadoExitosamente).slice(0, 5);
        this.resultadosProcesados.set(procesados);
        console.log(`%c✅ [Resultados] Enviados a PROCESADOS (Historial):`, 'color: #2e7d32; font-weight: bold;', procesados.map((p: any) => p.carpeta));
        
        this.reporteSeleccionado.set(null);
      },
      error: (err) => {
        console.error('❌ Error crítico en el flujo de historial:', err);
        this.resultadosPendientes.set([]);
        this.resultadosProcesados.set([]);
      }
    });
  }

  generarCartasFinales() {
  const file = this.archivoCsvAdjunto();
  const user = this.authService.user();
  const reporteElegido = this.reporteSeleccionado();

  if (!file || this.cargando() || !user) return;

  if (!reporteElegido) {
    this.snackBar.open('⚠️ Por favor, seleccione un reporte de la tabla para vincular con el CSV', 'Cerrar', { duration: 5000 });
    return;
  }

  this.cargando.set(true);
  this.currentLoadingDialog = this.dialog.open(this.loadingDialogTpl, { disableClose: true });

  const codigoCrudo = user.unidadNegocio?.codigoUnidad || '';
  let tipo = 'cobranza'; 
  let unidad = 'tesoreria';

  const unidadLimpia = codigoCrudo.toLowerCase().replace('imsb_', '');

  if (unidadLimpia.includes('juzgado')) {
    tipo = 'notificacion';
    unidad = unidadLimpia; 
  } else {
    tipo = 'cobranza';
    unidad = 'tesoreria';
  }

  const formData = new FormData();
  formData.append('archivo', file);
  formData.append('user', user.sub || 'usuario_desconocido');

  if (reporteElegido.nombreExcel) {
    const rutaRelativa = `${reporteElegido.carpeta}/${reporteElegido.nombreExcel}`;
    formData.append('rutaExcel', rutaRelativa);
  }

  const endpoint = `procesar-normalizacion/from-correos-to-merge/${tipo}/${unidad}`;

  // 🚩 Tipamos la respuesta como <any> para leer las propiedades dinámicas del Map de Java
  this.dataService.post<any>(endpoint, formData)
    .subscribe({
      next: (res) => {
        this.snackBar.open('✅ ¡Cartas generadas con éxito!', 'Cerrar', { 
          duration: 10000,
          panelClass: ['success-snackbar'] 
        });
        
        // 🚩 Extraemos el nombre del archivo final de la ruta (ej: /path/to/archivo_Merge.xlsx -> archivo_Merge.xlsx)
        if (res && res.ruta) {
          const partesRuta = res.ruta.split('/');
          const nombreLimpio = partesRuta[partesRuta.length - 1];
          this.archivoGeneradoNombre.set(nombreLimpio);
        }

        // Limpiamos la selección y recargamos historial (Ojo: no llamamos a resetearFormulario completo aquí para no borrar la señal del éxito de inmediato)
        this.archivoCsvAdjunto.set(null); 
        this.reporteSeleccionado.set(null);
        
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        this.cargarHistorialNormalizados();
      },
      error: (err) => {
        console.error('❌ Error en la petición (500):', err);
        this.snackBar.open('❌ Error interno en el servidor al procesar las cartas', 'Cerrar', { duration: 7000 });
        
        this.cargando.set(false);
        this.cerrarModalCarga();
        this.resetearFormulario();
      },
      complete: () => {
        this.cargando.set(false);
        this.cerrarModalCarga();
      }
    });
}

public resetearFormulario() {
  this.archivoCsvAdjunto.set(null);
  this.reporteSeleccionado.set(null);
  this.archivoGeneradoNombre.set(null); // Limpiamos también el label de éxito si se resetea por error
  
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (fileInput) {
    fileInput.value = '';
  }
}

  private cerrarModalCarga() {
    if (this.currentLoadingDialog) {
      this.currentLoadingDialog.close();
      this.currentLoadingDialog = null;
    }
  }

  isDragging = signal(false);
  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging.set(true); }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragging.set(false); }
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files[0];
    if (file?.name.endsWith('.csv')) this.archivoCsvAdjunto.set(file);
  }
}