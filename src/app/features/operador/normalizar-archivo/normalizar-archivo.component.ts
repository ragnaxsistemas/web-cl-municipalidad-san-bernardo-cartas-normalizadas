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

import { FormsModule } from '@angular/forms'; // 🚩 Para manejar el input

import { DataService } from '@core/services/data.service';
import { AuthService } from '@core/services/auth.service';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { MatCheckboxModule } from '@angular/material/checkbox';


// 🚩 ESTOS SON LOS QUE FALTAN PARA EL FORMULARIO


export interface RegistroNormalizar {
  tipo: string;
  unidad: string;
  carpeta: string;
  nombre: string;
  observacion: string;
  usuario?: string;
  fecha: string;
  seleccionado?: boolean; // 🚩 Para el Checkbox
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
    // 🚩 AGRÉGALOS AQUÍ
    MatFormFieldModule,
    MatInputModule, 
    MatProgressSpinnerModule, 
    MatDialogModule
  ],
  templateUrl: './normalizar-archivo.component.html',
  styleUrls: ['./normalizar-archivo.component.scss']
})
export class NormalizarComponent {
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private dataService = inject(DataService);
  private authService = inject(AuthService);

  @ViewChild('loadingDialog') loadingDialogTpl!: TemplateRef<any>;
  
  archivoCsvAdjunto = signal<File | null>(null);
  cargando = signal(false);
  tipoDocumento = signal<string>('cobranza');
  ultimoProcesamiento = signal<any>(null);
  cargandoUltimo = signal(false);
  resultados = signal<any[]>([]); // Lista para la tabla
  displayedColumns: string[] = ['tipo', 'unidad', 'creacion', 'observacion'];

  private definirTipoDocumentoPorUnidad() {
    const user = this.authService.user();
    // Limpiamos el código de la unidad (ej: 'imsb_1juzgado' -> '1juzgado')
    const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 
                        localStorage.getItem('unidadCodigo')?.replace('imsb_', '') || '';

    // Si la unidad es un juzgado, el tipo de documento debe ser igual a la unidad
    // De lo contrario, queda en 'cobranza' por defecto
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

  extraerFechaDeNombre(nombreCarpeta: string): string {
    if (!nombreCarpeta) return '---';

    /**
     * Buscamos: 
     * (\d{4}) -> 4 números (año)
     * [\-_]   -> un guion medio o bajo
     * (\d{2}) -> 2 números (mes)
     * [\-_]   -> un guion medio o bajo
     * (\d{2}) -> 2 números (día)
     */
    const matches = nombreCarpeta.match(/(\d{4})[\-_](\d{2})[\-_](\d{2})/);

    if (matches && matches.length >= 4) {
      const año = matches[1];
      const mes = matches[2];
      const dia = matches[3];
      
      // Retornamos el formato que necesitas para la tabla
      return `${dia}-${mes}-${año}`;
    }

    // Si no hay coincidencia de fecha, pero tiene el formato de lote
    // intentamos un split por cualquier separador común
    const partes = nombreCarpeta.split(/[_\-]/);
    // Buscamos una parte que tenga longitud 4 (posible año)
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
  const tipoActual = this.tipoDocumento();
  const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 
                      localStorage.getItem('unidadCodigo')?.replace('imsb_', '') || 'tesoreria';

  this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo).pipe(
    switchMap((res: any) => {
      const items = res.items || [];
      
      // 🚩 CAMBIO: Solo tomamos la primera carpeta (la más reciente)
      const ultimaCarpeta = items
        .filter((item: any) => item.esDirectorio)
        .sort((a: any, b: any) => b.nombre.localeCompare(a.nombre))
        .slice(0, 1); // <--- Cambiado de 5 a 1

      if (ultimaCarpeta.length === 0) return of([]);

      const c = ultimaCarpeta[0];

      // Hacemos la petición solo para esa carpeta específica
      return this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo, c.nombre).pipe(
        map((resInterno: any) => {
          const archivos = resInterno.items || [];
          const excel = archivos.find((f: any) => f.nombre.endsWith('.xlsx'));
          
          // Retornamos un array con un solo objeto para que la tabla lo reconozca
          return [{
            tipo: tipoActual,
            unidad: unidadCodigo,
            carpeta: c.nombre,
            nombreExcel: excel ? excel.nombre : null,
            observacion: excel?.observacion || '---',
            creacion: this.extraerFechaDeNombre(c.nombre)
          }];
        })
      );
    })
  ).subscribe({
    next: (res: any[]) => {
      this.resultados.set(res);
    },
    error: (err) => {
      console.error('❌ Error historial:', err);
      this.resultados.set([]);
    }
  });
}

  generarCartasFinales() {
    const file = this.archivoCsvAdjunto();
    const ultimo = this.resultados()[0];

    if (!file || this.cargando()) return;

    const user = this.authService.user(); // Usamos el signal del AuthService
    console.log('Iniciando proceso de generación de cartas con:', user);

    // Seteamos cargando a true, pero NO abrimos diálogo
    this.cargando.set(true);
    
    // Notificamos que empezó
    this.snackBar.open('Proceso iniciado.', 'OK', { duration: 3000 });

    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('user', user?.sub || 'usuario_desconocido');

    if (ultimo && ultimo.nombreExcel) {
      const rutaRelativa = `${ultimo.carpeta}/${ultimo.nombreExcel}`;
      formData.append('rutaExcel', rutaRelativa); 
    }

    this.dataService.post<any>('procesar-normalizacion/from-correos-to-merge/cobranza/tesoreria', formData)
      .subscribe({
        next: (res) => {
          this.snackBar.open('✅ ¡Cartas generadas con éxito!', 'Cerrar', { 
            duration: 10000, // Más tiempo para que lo vea si estaba en otra cosa
            panelClass: ['success-snackbar'] 
          });
          this.archivoCsvAdjunto.set(null); 
          this.cargarHistorialNormalizados(); // Refrescar la tabla automáticamente
        },
        error: (err) => {
          console.error('Error:', err);
          this.snackBar.open('❌ Error en el proceso de cartas', 'Cerrar', { duration: 7000 });
        },
        complete: () => {
          this.cargando.set(false);
        }
      });
  }
  
  // Implementación básica de Drag & Drop (opcional)
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