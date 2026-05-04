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
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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

  loadingRef?: MatDialogRef<any>;

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
      // 1. Usamos el método que abre el modal no-bloqueante en la esquina
      this.abrirCargaArchivos();
      this.cargando.set(true);

      const formData = new FormData();
      formData.append('archivo', file!);
      formData.append('user', user.sub);
      formData.append('observacion', texto);

      const endpoint = `upload/${tipoActual}/${unidadLimpia}`;

      this.dataService.post<any>(endpoint, formData).subscribe({
        next: (res: any) => {
          // 2. Cerramos el modal inmediatamente (el servidor ya tiene el archivo)
          this.finalizarProceso();
          
          this.snackBar.open(
            'Archivo recibido. Se está procesando en segundo plano.', 
            'Entendido', 
            { duration: 5000 }
          );

          // 3. Limpiamos el formulario
          this.headerTexto.set(''); 
          this.archivoSeleccionado.set(null);

          // Esto limpia el valor del input para que permita seleccionar el mismo archivo de nuevo
            if (this.fileInput && this.fileInput.nativeElement) {
              this.fileInput.nativeElement.value = ''; 
            }
          this.cargando.set(false);
          
          // 4. Refresco "inteligente": Esperamos 3 segundos para que el proceso
          // asíncrono del backend alcance a crear la carpeta y el registro inicial.
          setTimeout(() => {
            this.cargarUltimosCinco();
          }, 3000);
        },
        error: (err) => {
          this.finalizarProceso();
          this.cargando.set(false);
          console.error('❌ Error:', err);
          alert('Error al subir: ' + (err.error?.message || 'Fallo en la comunicación'));
        }
      });
    } else {
      alert('Faltan datos requeridos');
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

abrirCargaArchivos() {
  // Cambio de loadingDialog a loadingDialogTpl
  this.loadingRef = this.dialog.open(this.loadingDialogTpl, {
    width: '350px',
    hasBackdrop: false,           
    disableClose: false,          
    closeOnNavigation: false,     
    position: { bottom: '20px', right: '20px' }, 
    panelClass: 'upload-dialog-flotante'
  });
}
// Cuando termine tu proceso de subida/normalización:
finalizarProceso() {
  if (this.loadingRef) {
    this.loadingRef.close();
    this.snackBar.open('Archivo procesado con éxito', 'OK', { duration: 3000 });
  }
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
