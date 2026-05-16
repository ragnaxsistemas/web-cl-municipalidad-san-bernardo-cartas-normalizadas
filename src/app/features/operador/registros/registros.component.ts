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
  descargasImprenta?: { fechaDescarga: string; usuarioImprenta: string }[];
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

      if (tipoRuta === 'imprenta' || unidadLimpia === 'imprenta' || unidadLimpia === 'administracion') {
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
      fila.cargandoDetalle = true;

      // 1. REPORTES: Busca el PDF del reporte
      this.dataService.get<any>(`listar/${tipoDoc}/${unidad}/${fila.nombre}/REPORTES`, {}).subscribe({
          next: (res) => {
              const pdf = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.pdf'));
              if (pdf) fila.pdfReporte = pdf.nombre;
          }
      });

      // 2. EXCEL (Upload): Busca el archivo Excel original
      this.dataService.get<any>(`listar/upload/${tipoDoc}/${unidad}/${fila.nombre}`, {}).subscribe({
          next: (res) => {
              const excel = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.xlsx'));
              if (excel) fila.excelOriginal = excel.nombre;
          }
      });

      // 3. CONSOLIDADOS: Primero metadatos, luego el archivo físico
      this.dataService.get<any>(`listar/${tipoDoc}/${unidad}/${fila.nombre}`, {}).subscribe({
          next: (res) => {
              const items = res.items || [];
              // Buscamos la carpeta CARTAS_CONSOLIDADAS que trae los metadatos de imprenta
              const folderConsolidado = items.find((i: any) => i.nombre === 'CARTAS_CONSOLIDADAS');

              if (folderConsolidado) {
                  // Seteamos los flags que vimos en tu JSON de respuesta
                  fila.activarConsolidadoImprenta = folderConsolidado.activarConsolidadoImprenta;
                  fila.descargasImprenta = folderConsolidado.descargasImprenta ?? [];

                  // Entramos a buscar el nombre del PDF real para la descarga
                  const urlContenido = `listar/${tipoDoc}/${unidad}/${fila.nombre}/CARTAS_CONSOLIDADAS`;
                  this.dataService.get<any>(urlContenido, {}).subscribe({
                      next: (resInner) => {
                          const archivosInternos = resInner.items || [];
                          const pdfEncontrado = archivosInternos.find((f: any) => f.nombre.toLowerCase().endsWith('.pdf'));
                          
                          if (pdfEncontrado) {
                              fila.pdfConsolidado = pdfEncontrado.nombre;
                          }
                          
                          // Finalizamos carga
                          fila.cargandoDetalle = false;
                          
                          // Log de control (puedes borrarlo después)
                          console.log(`[${fila.nombre}] - Activado: ${fila.activarConsolidadoImprenta} - PDF: ${fila.pdfConsolidado}`);
                      },
                      error: () => fila.cargandoDetalle = false
                  });
              } else {
                  fila.cargandoDetalle = false;
              }
          },
          error: () => fila.cargandoDetalle = false
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
      const unidadDeDocumentos = this.unidadSeleccionada()?.codigoUnidadLimpia || this.obtenerUnidadLimpia();
      const tipoDoc = this.tipoDocumento();
      const nav = this.rutaNavegacion();
      
      let path = `${tipoDoc}/${unidadDeDocumentos}`;
      if (nav.length > 0) path += `/${nav.join('/')}`;

      const perfilLogueado = localStorage.getItem('codigo_unidad')?.replace('imsb_', '');
      const metadatos = (perfilLogueado === 'imprenta') ? this.obtenerMetadatosUsuario() : undefined;

      this.ejecutarDescarga(`${path}/${nombreArchivo}`, nombreArchivo, metadatos);
  }

  descargarEspecial(nombreCarpeta: string, subTipo: string, archivo: string): void {
      // 1. La unidad de la carpeta que estamos viendo (ej: 'tesoreria')
      // Si hay algo seleccionado en el combo, usamos eso. Si no, usamos la unidad del login.
      const unidadDeDocumentos = this.unidadSeleccionada()?.codigoUnidadLimpia || this.obtenerUnidadLimpia();
      
      // 2. El tipo de documento (cobranza/notificacion)
      const tipoDoc = this.tipoDocumento();
      
      // 3. Armar el Path Final con la unidad dueña de los archivos
      let pathFinal = subTipo === 'upload' 
        ? `upload/${tipoDoc}/${unidadDeDocumentos}/${nombreCarpeta}/${archivo}`
        : `${tipoDoc}/${unidadDeDocumentos}/${nombreCarpeta}/${subTipo}/${archivo}`;

      // 4. ¿Quién está descargando? (Para los metadatos)
      // Aquí sí miramos el login original. Si el que inició sesión es 'imprenta', mandamos el header.
      const perfilLogueado = localStorage.getItem('codigo_unidad')?.replace('imsb_', '');
      const esImprenta = perfilLogueado === 'imprenta';
      
      const metadatos = esImprenta ? this.obtenerMetadatosUsuario() : undefined;

      console.log("Iniciando descarga para Imprenta:", { pathFinal, archivo, metadatos });
      this.ejecutarDescarga(pathFinal, archivo, metadatos);
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

  private ejecutarDescarga(url: string, nombre: string, metadatos?: any): void {
  // Si hay metadatos, usamos el método de imprenta, si no, el universal
    const peticion = metadatos 
      ? this.dataService.descargarArchivoImprenta(url, metadatos)
      : this.dataService.descargarArchivo(url);

    peticion.subscribe({
      next: (blob) => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = nombre;
        link.click();
        window.URL.revokeObjectURL(link.href);
      },
      error: (err) => {
        this.snackBar.open('Error al procesar la descarga', 'Cerrar', { duration: 3000 });
        console.error('Error al descargar:', err);
      }
    });
  }

  // --- NUEVO: Helper para preparar metadatos de imprenta ---
  private obtenerMetadatosUsuario(): any {
  const userData = localStorage.getItem('usuario');
  let subValue = 'usuario_desconocido';

  if (userData) {
    try {
      // Parseamos el JSON para acceder a las propiedades
      const usuarioObj = JSON.parse(userData);
      subValue = usuarioObj.sub || 'usuario_desconocido';
    } catch (e) {
      console.error("Error al parsear el usuario del localStorage", e);
    }
  }

  return {
    nombre: subValue
  };
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