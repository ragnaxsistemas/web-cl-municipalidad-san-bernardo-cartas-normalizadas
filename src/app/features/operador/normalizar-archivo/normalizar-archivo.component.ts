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
    
    // 1. Obtenemos el valor crudo (ej: '1juzgado' o 'cobranza')
    const valorTipoCrudo = this.tipoDocumento();
    
    // 2. Normalizamos el tipo: si contiene 'juzgado', siempre será 'notificacion'
    // de lo contrario, por defecto será 'cobranza' (o el valor que traiga si es tesorería)
    const tipoActual = valorTipoCrudo.toLowerCase().includes('juzgado') 
      ? 'notificacion' 
      : 'cobranza';

    const unidadCodigo = user?.unidadNegocio?.codigoUnidad?.replace('imsb_', '') || 
                        localStorage.getItem('unidadCodigo')?.replace('imsb_', '') || 'tesoreria';
    
    // Log para verificar que ahora imprima "notificacion" o "cobranza"
    console.log(`📂 Cargando historial para tipo normalizado: ${tipoActual}, unidad: ${unidadCodigo}`);

    this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo).pipe(
      switchMap((res: any) => {
        const items = res.items || [];
        
        const ultimaCarpeta = items
          .filter((item: any) => item.esDirectorio)
          .sort((a: any, b: any) => b.nombre.localeCompare(a.nombre))
          .slice(0, 1);

        if (ultimaCarpeta.length === 0) return of([]);

        const c = ultimaCarpeta[0];

        return this.dataService.listarArchivos('normalizado', tipoActual, unidadCodigo, c.nombre).pipe(
          map((resInterno: any) => {
            const archivos = resInterno.items || [];
            const excel = archivos.find((f: any) => f.nombre.endsWith('.xlsx'));
            
            return [{
              tipo: tipoActual, // Aquí ya queda guardado como 'notificacion' o 'cobranza'
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
    const user = this.authService.user();

    if (!file || this.cargando() || !user) return;

    // --- Depuración: Ver qué trae el usuario ---
    const codigoCrudo = user.unidadNegocio?.codigoUnidad || '';
    console.log('🔍 Valor original de unidadNegocio.codigoUnidad:', codigoCrudo);

    this.cargando.set(true);
    this.snackBar.open('Proceso iniciado.', 'OK', { duration: 3000 });

    // --- Lógica Dinámica Corregida ---
    let tipo = 'cobranza'; 
    let unidad = 'tesoreria';

    // Limpiamos el código (quitamos imsb_ y pasamos a minúsculas)
    const unidadLimpia = codigoCrudo.toLowerCase().replace('imsb_', '');
    console.log('🧹 Unidad normalizada para lógica:', unidadLimpia);

    if (unidadLimpia.includes('juzgado')) {
      tipo = 'notificacion';
      // Mantenemos el nombre de la unidad que espera el backend (juzgado o 1juzgado)
      unidad = unidadLimpia; 
    } else {
      tipo = 'cobranza';
      unidad = 'tesoreria';
    }

    console.log(`🚀 Enviando a endpoint -> Tipo: ${tipo}, Unidad: ${unidad}`);
    // --------------------------------------------

    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('user', user.sub || 'usuario_desconocido');

    if (ultimo?.nombreExcel) {
      const rutaRelativa = `${ultimo.carpeta}/${ultimo.nombreExcel}`;
      formData.append('rutaExcel', rutaRelativa);
    }

    const endpoint = `procesar-normalizacion/from-correos-to-merge/${tipo}/${unidad}`;

    this.dataService.post<any>(endpoint, formData)
      .subscribe({
        next: (res) => {
          this.snackBar.open('✅ ¡Cartas generadas con éxito!', 'Cerrar', { 
            duration: 10000,
            panelClass: ['success-snackbar'] 
          });
          this.archivoCsvAdjunto.set(null); 
          this.cargarHistorialNormalizados();
        },
        error: (err) => {
          console.error('❌ Error en la petición:', err);
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