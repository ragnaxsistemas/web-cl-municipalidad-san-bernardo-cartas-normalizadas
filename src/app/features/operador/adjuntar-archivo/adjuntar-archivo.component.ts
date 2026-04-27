import { Component, signal, inject, OnInit , ViewChild, TemplateRef ,ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common'; // Para *ngIf, *ngFor y Pipes
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

import { FormsModule } from '@angular/forms'; // Necesario para ngModel
import { of, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { DataService } from '../../../core/services/data.service';
import { AuthService } from '../../../core/services/auth.service';


@Component({
  selector: 'app-adjuntar',
  standalone: true,
  templateUrl: './adjuntar-archivo.component.html',
  styleUrls: ['./adjuntar-archivo.component.scss'],
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule,
    MatTableModule, MatCardModule, MatInputModule, MatFormFieldModule,
    MatDialogModule, MatProgressSpinnerModule, MatSnackBarModule, MatTooltipModule
  ]
})
export class AdjuntarComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private authService = inject(AuthService);

  @ViewChild('loadingDialog') loadingDialogTpl!: TemplateRef<any>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // Signals de estado
  tipoDocumento = signal(''); 
  tituloPagina = signal('Adjuntar Archivo');
  archivoSeleccionado = signal<File | null>(null);
  headerTexto = signal<string>('');
  cargando = signal(false);
  
  // Tabla de resultados de éxito
  resultados = signal<any[]>([]);
  displayedColumns: string[] = ['tipo', 'unidad', 'nombre', 'creacion', 'observacion', 'acciones'];

  puedeSubir = computed(() => {
    return this.archivoSeleccionado() !== null && 
           this.headerTexto().trim().length > 0 && 
           !this.cargando();
  });
  
  ngOnInit() {
    this.route.data.subscribe(data => {
      this.tipoDocumento.set(data['tipo'] || 'cobranza');
      this.tituloPagina.set(data['titulo'] || 'Adjuntar');
      this.cargarUltimosCinco(); 
    });
  }

  onFileSelected(event: any) {
  const input = event.target as HTMLInputElement;
  
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    
    // Validación de seguridad por si acaso
    if (file.name.endsWith('.xlsx')) {
      this.archivoSeleccionado.set(file);
      console.log('Archivo cargado correctamente:', file.name);
    } else {
      alert('Por favor, selecciona solo archivos .xlsx');
      this.archivoSeleccionado.set(null);
    }
  }
}

  upload() {
    const file = this.archivoSeleccionado();
    const texto = this.headerTexto(); 
    const user = this.authService.user(); // Usamos el signal del AuthService

    // 1. Obtener la unidad directamente del localStorage (o del objeto del usuario)
    // Priorizamos el código guardado: imsb_tesoreria, imsb_1juzgado, imsb_2juzgado
    const unidadBruta = user?.unidadNegocio?.codigoUnidad || localStorage.getItem('unidadCodigo') || '';
    const unidadLimpia = unidadBruta.replace('imsb_', '');

    // 2. Determinar el TIPO dinámicamente basado en la unidad
    let tipoActual: 'cobranza' | 'notificacion' = 'cobranza';
    
    if (unidadLimpia === '1juzgado' || unidadLimpia === '2juzgado') {
      tipoActual = 'notificacion';
    } else {
      tipoActual = 'cobranza'; // Para 'tesoreria'
    }

    console.log(`🚀 Iniciando upload IMSB: Unidad=${unidadLimpia}, Tipo Detectado=${tipoActual}`);

    if (this.puedeSubir() && user) {
    
    // Abrimos el modal de carga DESDE EL HTML
    const dialogRef = this.dialog.open(this.loadingDialogTpl, {
      disableClose: true,
      width: '350px',
      panelClass: 'custom-loader'
    });

      const formData = new FormData();
      formData.append('archivo', file!);
      formData.append('user', user.sub);
      formData.append('observacion', texto);

      // 3. Construir el endpoint con el prefijo /upload/ requerido por el Backend
      const endpoint = `upload/${tipoActual}/${unidadLimpia}`;

      this.dataService.post<any>(endpoint, formData).subscribe({
        next: (res: any) => {
          // 3. Cerramos el modal solo cuando hay éxito
          dialogRef.close();
          this.snackBar.open('Archivo procesado y enviado a Normalización exitosamente.', 'Cerrar', { duration: 3000 });
          console.log('✅ Upload exitoso:', res);
          
          // 🚩 EL PUNTO CLAVE: Forzamos la recarga aquí
          console.log('[Procesar] 🔄 Ejecutando refresco de tabla...');
          this.cargarUltimosCinco();
          /***this.resultados.set([{
            tipo: tipoActual,
            unidad: unidadLimpia,
            carpeta: res.carpeta || 'Enviado a Correos de Chile',
            nombre: res.nombre, 
            observacion: res.observacion,
            creacion: res.fechaCreacion || new Date().toISOString()
          }]);***/

          this.headerTexto.set(''); 
          this.archivoSeleccionado.set(null);
          this.cargando.set(false);
        },
        error: (err) => {
          this.cargando.set(false);
          console.error('❌ Error en el servidor:', err);
          // El error de CORS debería desaparecer al usar la ruta /upload/...
          alert('Error al procesar: ' + (err.error?.message || 'Fallo en la comunicación con el servidor'));
        }
      });
    } else {
      alert('Faltan datos requeridos (Archivo, Observación o Sesión de Usuario)');
    }
  }

cargarUltimosCinco() {
  const user = this.authService.user();
  const tipoActual = this.tipoDocumento();
  const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 
                      localStorage.getItem('unidadCodigo')?.replace('imsb_', '') || 'tesoreria';

  this.dataService.listarArchivos('upload', tipoActual, unidadCodigo).pipe(
    switchMap((res: any) => {
      const items = res.items || []; 
      
      const carpetasValidas = items
        .filter((item: any) => item.esDirectorio)
        .sort((a: any, b: any) => b.nombre.localeCompare(a.nombre))
        .slice(0, 5);

      if (carpetasValidas.length === 0) return of([]);

      const peticiones = carpetasValidas.map((c: any) => {
        // Tipamos explícitamente como Observable<any> para evitar el error de .items
        const obsUpload = this.dataService.listarArchivos('upload', tipoActual, unidadCodigo, c.nombre);
        const obsNormalizado = this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo, c.nombre);

        return forkJoin({ upload: obsUpload, normalizado: obsNormalizado }).pipe(
          map(({ upload, normalizado }: any) => { // <--- Agregado :any aquí
            const archivosUpload = upload.items || [];
            const archivosNorm = normalizado.items || [];

            const archivoExcel = archivosUpload.find((f: any) => f.nombre.endsWith('.xlsx'));
            const archivoCsv = archivosNorm.find((f: any) => f.nombre.endsWith('.csv'));
            
            return {
              tipo: tipoActual,
              unidad: unidadCodigo,
              carpeta: c.nombre,
              nombreExcel: archivoExcel ? archivoExcel.nombre : null,
              nombreCsv: archivoCsv ? archivoCsv.nombre : null,
              observacion: archivoExcel?.observacion || '---',
              creacion: this.extraerFechaDeNombre(c.nombre) || new Date()
            };
          })
        );
      });

      return forkJoin(peticiones);
    })
  ).subscribe({
    next: (res: any) => {
      this.resultados.set(res);
    },
    error: (err) => {
      console.error('❌ Error:', err);
      this.resultados.set([]);
    }
  });
}

  // Función auxiliar para parsear el nombre de la carpeta (ej: 2026_04_25_23_00_00)
  extraerFechaDeNombre(nombre: string): Date | null {
  try {
    // Buscamos los 6 grupos de números al final del string
    const match = nombre.match(/(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})$/);
    
    if (!match) return null;

    // match[1] es el año, [2] el mes, etc.
    // Convertimos a número con el operador +
    const [ , año, mes, dia, hora, min, seg] = match.map(Number);

    // Recordar que los meses en JavaScript van de 0 a 11
    return new Date(año, mes - 1, dia, hora, min, seg);
  } catch {
    return null;
  }
}
  
  // Asegúrate de que SOLO existan estas versiones en todo el archivo
  descargarExcel(element: any) {
    if (!element.nombreExcel) return;
    // Construimos la ruta completa: "upload/cobranza/tesoreria/nombre_carpeta/archivo.xlsx"
    const rutaCompleta = `upload/${element.tipo}/${element.unidad}/${element.carpeta}/${element.nombreExcel}`;
    
    this.dataService.descargarArchivo(rutaCompleta).subscribe({
      next: (blob: Blob) => this.ejecutarDescargaLocal(blob, element.nombreExcel),
      error: (err) => console.error('Error al descargar Excel:', err)
    });
  }

  descargarCsv(element: any) {
    if (!element.nombreCsv) return;
    // Construimos la ruta completa: "normalizado/cobranza/tesoreria/nombre_carpeta/archivo.csv"
    const rutaCompleta = `normalizado/${element.tipo}/${element.unidad}/${element.carpeta}/${element.nombreCsv}`;
    
    this.dataService.descargarArchivo(rutaCompleta).subscribe({
      next: (blob: Blob) => this.ejecutarDescargaLocal(blob, element.nombreCsv),
      error: (err) => console.error('Error al descargar CSV:', err)
    });
  }

  // Función auxiliar para no repetir código de descarga de Blob
  private ejecutarDescargaLocal(blob: Blob, nombreArchivo: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}
