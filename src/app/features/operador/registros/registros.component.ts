import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Component as NgComponent } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '@core/services/data.service';
import { ArchivoDetalle, RespuestaListar } from '@core/models/auth.model';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, forkJoin, of } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

export interface FilaProceso {
  nombre: string;
  esDirectorio: boolean; // Cambiado a boolean para mayor flexibilidad
  pdfReporte?: string;
  pdfConsolidado?: string;
  excelOriginal?: string;
  cargandoDetalle?: boolean;
  observacion?: string;
  usuario?: string;
  // --- CAMPOS PARA HABILITAR IMPRENTA ---
  activarConsolidadoImprenta?: boolean; 
  cargandoHabilitar?: boolean;
  unidadOrigen?: string;
  tipoOrigen?: string;
}

@NgComponent({
  selector: 'app-registros',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, 
    MatInputModule, MatFormFieldModule, MatButtonModule, 
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './registros.component.html',
  styleUrls: ['./registros.component.scss']
})
export class RegistrosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  tituloPagina = signal('Consultas y Reportes');
  tipoDocumento = signal(''); 
  carpetas = signal<string[]>([]);
  archivos = signal<ArchivoDetalle[]>([]);
  filtroNombre = signal(''); 
  displayedColumns: string[] = ['icono', 'nombre', 'acciones'];
  
  rutaNavegacion = signal<string[]>([]);
  unidadesCombo = signal<any[]>([]);
  unidadSeleccionada = signal<any | null>(null);
  mostrarSelectorUnidad = signal(false);

  totalElementos = signal(0);
  pageSize = signal(10);
  paginaActual = signal(0);
  cargando = signal(false);

  dataSource = computed(() => {
    const carpetasObj = this.carpetas().map(nombre => ({
      nombre: nombre,
      esDirectorio: true,
      observacion: '',
      usuario: '',
      activarConsolidadoImprenta: false
    }));

    const combined = [...carpetasObj, ...this.archivos()];
    const term = this.filtroNombre().toLowerCase().trim();

    if (!term) return combined;

    return combined.filter(item => 
      item.nombre.toLowerCase().includes(term)
    );
  });

  ngOnInit() {
    this.route.data.subscribe(data => {
      const tipoRuta = data['tipo']; 
      this.tipoDocumento.set(tipoRuta);
      this.tituloPagina.set(data['titulo'] || 'Consultas');
      
      this.rutaNavegacion.set([]); 
      this.paginaActual.set(0);

      const unidadOriginal = localStorage.getItem('codigo_unidad') || '';
      const unidadLimpia = unidadOriginal.replace('imsb_', '');

      if (tipoRuta === 'imprenta' || unidadLimpia === 'imprenta' || unidadLimpia === 'admin') {
        this.mostrarSelectorUnidad.set(true);
        this.cargarUnidadesHabilitadas(unidadLimpia);
      } else {
        this.mostrarSelectorUnidad.set(false);
        this.cargarNivel(); 
      }
    });
  }

  cargarUnidadesHabilitadas(unidadLimpia: string) {
    const codEmpresa = this.authService.obtenerCodEmpresa() || 'imsb_reportes'; 
    this.dataService.get<any[]>(`carpetas-habilitadas/unidad/${codEmpresa}`).subscribe({
      next: (unidades) => {
        const unidadesFormateadas = unidades.map(u => ({
          ...u,
          codigoUnidadLimpia: u.codigoUnidad.replace('imsb_', '')
        }));
        this.unidadesCombo.set(unidadesFormateadas);
      },
      error: (err) => console.error("Error cargando unidades", err)
    });
  }

  onSeleccionUnidad(event: Event) {
    const codUnidad = (event.target as HTMLSelectElement).value;
    const unidad = this.unidadesCombo().find(u => u.codigoUnidad === codUnidad);
    if (unidad) {
      const nombreLower = unidad.showNombreUnidad.toLowerCase();
      let tipoNavegacion = "cobranza"; 
      if (nombreLower.includes("juzgado")) tipoNavegacion = "notificacion";

      const unidadLimpia = unidad.codigoUnidad.replace('imsb_', '');
      this.unidadSeleccionada.set({ ...unidad, tipoNavegacion: tipoNavegacion, codigoUnidadLimpia: unidadLimpia });
      this.tipoDocumento.set(tipoNavegacion);
      this.rutaNavegacion.set([]); 
      this.ejecutarCargaEstandar(unidadLimpia, tipoNavegacion, []);
    }
  }

  cargarNivel() {
    this.cargando.set(true);
    const unidadOriginal = localStorage.getItem('codigo_unidad') || 'tesoreria';
    const unidadLimpia = unidadOriginal.replace('imsb_', '');
    const nav = this.rutaNavegacion();
    const tipoDoc = this.tipoDocumento();

    if (unidadLimpia === 'imprenta') {
        if (nav.length === 0) {
            this.cargarVistaMulticarpetaImprenta();
        } else {
            this.ejecutarCargaEstandar(unidadLimpia, tipoDoc, nav);
        }
    } else {
        this.ejecutarCargaEstandar(unidadLimpia, tipoDoc, nav);
    }
}

  ejecutarCargaEstandar(unidadLimpia: string, tipoDoc: string, nav: string[]) { 
    this.cargando.set(true);
    let url = `listar/${tipoDoc}/${unidadLimpia}`;
    if (nav.length > 0) url += `/${nav.join('/')}`;

    this.dataService.get<any>(url, { page: '0', size: '100' }).subscribe({
      next: (res) => {
        const items = res.items || [];
        const carpetasProceso = items.filter((i: any) => i.esDirectorio && i.nombre.startsWith('CD-'));
        const otrosArchivos = items.filter((i: any) => !i.esDirectorio && i.nombre.toLowerCase().endsWith('.pdf'));

        if (carpetasProceso.length > 0 && nav.length === 0) {
          const filasProcesadas: FilaProceso[] = carpetasProceso.map((c: any) => ({
            nombre: c.nombre,
            esDirectorio: true,
            observacion: c.observacion,
            cargandoDetalle: true,
            // 🚩 PRESERVAMOS EL VALOR DEL BACKEND
            activarConsolidadoImprenta: c.activarConsolidadoImprenta 
          }));

          this.archivos.set(filasProcesadas as any);
          this.carpetas.set([]);
          filasProcesadas.forEach(fila => this.buscarArchivosHijos(fila, unidadLimpia, tipoDoc));
        } else {
          this.carpetas.set(items.filter((i: any) => i.esDirectorio).map((i: any) => i.nombre));
          this.archivos.set(otrosArchivos);
        }
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  cargarVistaMulticarpetaImprenta() {
    const rutasInteres = [
      { tipo: 'cobranza', unidad: 'tesoreria' },
      { tipo: 'notificacion', unidad: '1juzgado' },
      { tipo: 'notificacion', unidad: '2juzgado' }
    ];

    const peticiones = rutasInteres.map(r => 
      this.dataService.get<any>(`listar/${r.tipo}/${r.unidad}`, { page: '0', size: '100' })
    );

    forkJoin(peticiones).subscribe({
      next: (resultados) => {
        let todasLasFilas: FilaProceso[] = [];
        resultados.forEach((res, index) => {
          const config = rutasInteres[index];
          const items = res.items || [];
          const carpetasProceso = items.filter((i: any) => i.esDirectorio && i.nombre.startsWith('CD-'));

          const filas = carpetasProceso.map((c: any) => ({
            nombre: c.nombre,
            esDirectorio: true,
            observacion: c.observacion || `Origen: ${config.unidad}`,
            unidadOrigen: config.unidad,
            tipoOrigen: config.tipo,
            cargandoDetalle: true,
            activarConsolidadoImprenta: c.activarConsolidadoImprenta // 🚩 IMPORTANTE
          }));
          todasLasFilas = [...todasLasFilas, ...filas];
        });

        this.archivos.set(todasLasFilas as any);
        this.carpetas.set([]);
        this.cargando.set(false);
        todasLasFilas.forEach(fila => this.buscarArchivosHijos(fila, fila.unidadOrigen!, fila.tipoOrigen!));
      },
      error: () => this.cargando.set(false)
    });
  }

private buscarArchivosHijos(fila: FilaProceso, unidad: string, tipoDoc: string) {
  // 🚩 ESTRATEGIA: Guardamos el estado que el padre ya trae desde la raíz
  // para que las sub-peticiones no lo pisen con 'false'
  const estadoHabilitadoOriginal = fila.activarConsolidadoImprenta;

  // 1. Reportes
  const urlReportes = `listar/${tipoDoc}/${unidad}/${fila.nombre}/REPORTES`;
  this.dataService.get<any>(urlReportes, {}).subscribe(res => {
    const pdf = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.pdf'));
    if (pdf) fila.pdfReporte = pdf.nombre;
    // Restauramos valor original
    fila.activarConsolidadoImprenta = estadoHabilitadoOriginal;
  });

  // 2. Consolidados
  const urlConsolidados = `listar/${tipoDoc}/${unidad}/${fila.nombre}/CARTAS_CONSOLIDADAS`;
  this.dataService.get<any>(urlConsolidados, {}).subscribe(res => {
    const pdf = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.pdf'));
    if (pdf) fila.pdfConsolidado = pdf.nombre;
    // Restauramos valor original
    fila.activarConsolidadoImprenta = estadoHabilitadoOriginal;
  });

  // 3. Excel (Upload)
  const urlUpload = `listar/upload/${tipoDoc}/${unidad}/${fila.nombre}`;
  this.dataService.get<any>(urlUpload, {}).subscribe(res => {
    const excel = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.xlsx'));
    if (excel) fila.excelOriginal = excel.nombre;
    fila.cargandoDetalle = false;
    // Restauramos valor original
    fila.activarConsolidadoImprenta = estadoHabilitadoOriginal;
  });
}

  navegarACarpeta(nombreCarpeta: string) {
    if (nombreCarpeta.startsWith('CD-')) return;
    this.rutaNavegacion.update(path => [...path, nombreCarpeta]);
    this.cargarNivel();
  }

  volverAtras() {
    this.rutaNavegacion.update(path => path.length > 0 ? path.slice(0, -1) : path);
    this.paginaActual.set(0);
    this.cargarNivel();
  }

  obtenerUnidadLimpia(): string {
    return (localStorage.getItem('codigo_unidad') || 'tesoreria').replace('imsb_', '');
  }

  descargar(nombreArchivo: string): void {
    const unidad = this.obtenerUnidadLimpia();
    const tipoDoc = this.tipoDocumento();
    const nav = this.rutaNavegacion();
    let path = `${tipoDoc}/${unidad}`;
    if (nav.length > 0) path += `/${nav.join('/')}`;
    this.ejecutarDescarga(`${path}/${nombreArchivo}`, nombreArchivo);
  }

  descargarEspecial(nombreCarpeta: string, subTipo: string, archivo: string): void {
    const unidad = this.obtenerUnidadLimpia();
    const tipoDoc = this.tipoDocumento();
    let pathFinal = subTipo === 'upload' 
      ? `upload/${tipoDoc}/${unidad}/${nombreCarpeta}/${archivo}`
      : `${tipoDoc}/${unidad}/${nombreCarpeta}/${subTipo}/${archivo}`;
    this.ejecutarDescarga(pathFinal, archivo);
  }

  habilitarParaImprenta(element: FilaProceso) {
    // 1. Validar si ya está habilitado para no hacer nada
    if (element.activarConsolidadoImprenta) {
      this.snackBar.open('Este proceso ya se encuentra habilitado.', 'Cerrar', { duration: 2000 });
      return;
    }

    // 2. Modal de confirmación
    const mensaje = `¿Está seguro que desea habilitar el proceso "${element.nombre}" para la imprenta?`;
    
    if (confirm(mensaje)) { // Puedes reemplazar esto por this.dialog.open(TuComponente)
      this.ejecutarHabilitacion(element);
    }
  }

  ejecutarHabilitacion(element: any) {
    if (element.cargandoHabilitar) return;
    element.cargandoHabilitar = true;
    const unidad = this.obtenerUnidadLimpia();
    const proceso = element.nombre;
    const tipoDoc = this.tipoDocumento();
    const url = `habilitar-imprenta/${tipoDoc}/${unidad}/${proceso}/CARTAS_CONSOLIDADAS`;

    this.dataService.get<any>(url).subscribe({
      next: (res: any) => {
        element.activarConsolidadoImprenta = true; // Forzamos a true
        this.snackBar.open('Proceso habilitado exitosamente para Imprenta', 'Cerrar', { duration: 3000 });
      },
      error: (err: any) => {
        this.snackBar.open('Error al intentar habilitar el proceso', 'Cerrar', { duration: 3000 });
      },
      complete: () => element.cargandoHabilitar = false
    });
  }

  private ejecutarDescarga(url: string, nombre: string): void {
    this.dataService.descargarArchivo(url).subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = nombre;
        link.click();
        window.URL.revokeObjectURL(link.href);
      },
      error: (err) => console.error('Error al descargar:', err)
    });
  }

  onCambiarPagina(event: PageEvent) {
    this.paginaActual.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.cargarNivel();
  }

  onBuscar(valor: string) {
    this.filtroNombre.set(valor);
    this.paginaActual.set(0);
    this.cargarNivel();
  }
}