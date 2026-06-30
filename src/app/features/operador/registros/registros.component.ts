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
import { HttpEvent, HttpEventType } from '@angular/common/http'; // 🚩 AGREGADO
import { environment } from '../../../../environments/environment';

export interface FilaProceso {
  nombre: string;
  esDirectorio: boolean; 
  pdfReporte?: string;
  //pdfConsolidated?: string; // Nota: en tu código usabas pdfConsolidado
  pdfConsolidado?: string;
  excelOriginal?: string;
  cargandoDetalle?: boolean;
  observacion?: string;
  usuario?: string;
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
    MatIconModule, MatPaginatorModule, MatProgressSpinnerModule,
    MatTooltipModule, MatSnackBarModule, MatDialogModule
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

  // 🚩 SIGNALS NUEVOS PARA MANEJAR EL MODAL DE DESCARGA PESADA
  mostrarModalCarga = signal<boolean>(false);
  mensajeModal = signal<string>('Preparando descarga del archivo consolidado...');

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
          this.cargarVistaMulticarpetaImprenta(this.unidadesCombo());
          //this.cargarVistaMulticarpetaImprenta();
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
        
        // CORREGIDO: Se cambia .startsWith('CD-') por .startsWith('CD')
        const carpetasProceso = items.filter((i: any) => i.esDirectorio && i.nombre.startsWith('CD'));
        const otrosArchivos = items.filter((i: any) => !i.esDirectorio && i.nombre.toLowerCase().endsWith('.pdf'));

        if (carpetasProceso.length > 0 && nav.length === 0) {
          const filasProcesadas: FilaProceso[] = carpetasProceso.map((c: any) => ({
            nombre: c.nombre,
            esDirectorio: true,
            observacion: c.observacion,
            cargandoDetalle: true,
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

  cargarVistaMulticarpetaImprenta(unidades?: any[]) {
  // Si no se proveen unidades por argumento, rescatamos las del combo por defecto
  const unidadesProcesar = unidades || this.unidadesCombo();
  if (!unidadesProcesar || unidadesProcesar.length === 0) {
    this.cargando.set(false);
    return;
  }

  this.cargando.set(true);

  // 1. DETERMINAR ESTRATEGIA DE NAVEGACIÓN SEGÚN EL NIVEL
  let observables: Observable<any>[] = [];

  if (this.rutaNavegacion().length === 0) {
    // --- CASO A: ESTAMOS EN LA RAÍZ ---
    // Consultamos en paralelo todas las unidades autorizadas del combo usando el método real 'get'
    observables = unidadesProcesar.map(u => {
      const subPath = `${this.tipoDocumento().toLowerCase()}/${u.codigoUnidad.toLowerCase()}`;
      return this.dataService.get<any>(`listar/${subPath}`);
    });
  } else {
    // --- CASO B: NAVEGACIÓN INTERNA (Doble clic adentrándose en carpetas) ---
    // Buscamos cuál unidad está seleccionada actualmente en la señal del componente
    const unidadActual = this.unidadSeleccionada()?.codigoUnidad || unidadesProcesar[0].codigoUnidad;
    
    const subPathBase = `${this.tipoDocumento().toLowerCase()}/${unidadActual.toLowerCase()}`;
    const rutaInternaCompleta = `${subPathBase}/${this.rutaNavegacion().join('/')}`;
    
    // Hacemos una única petición directa a la ruta interna usando 'get'
    observables = [this.dataService.get<any>(`listar/${rutaInternaCompleta}`)];
  }

  // 2. EJECUTAR CONSULTA Y APLICAR FILTROS DE IMPRENTA
  forkJoin(observables).subscribe({
    next: (respuestas: any[]) => {
      let todosLosItems: any[] = [];

      // Extraemos los elementos desde la propiedad '.items' que entrega tu backend real
      respuestas.forEach(res => {
        if (res && res.items) {
          todosLosItems = [...todosLosItems, ...res.items];
        }
      });

      let itemsFiltrados: any[] = [];

      if (this.rutaNavegacion().length === 0) {
        // --- FILTRO RAÍZ: Mostrar solo carpetas de procesos multi-juzgado (CD, CDPJ, CDSJ) ---
        itemsFiltrados = todosLosItems.filter((item: any) => {
          if (!item.esDirectorio) return false;
          const nombreUpper = item.nombre.toUpperCase();
          return nombreUpper.startsWith('CD-') || 
                 nombreUpper.startsWith('CDPJ-') || 
                 nombreUpper.startsWith('CDSJ-');
        });
      } else {
        // --- FILTRO INTERNO (Dentro de CARTAS_CONSOLIDADAS) ---
        // Se muestran archivos (.pdf, .json) solo si activarConsolidadoImprenta es true
        itemsFiltrados = todosLosItems.filter((item: any) => {
          if (item.esDirectorio) {
            return item.nombre === 'CARTAS_CONSOLIDADAS';
          }
          return item.activarConsolidadoImprenta === true;
        });
      }

      // Inyectar estados de renderizado dinámico requeridos por tu tabla del HTML
      const itemsConEstado = itemsFiltrados.map(item => ({
        ...item,
        cargandoDetalle: false,
        mostrarDetalle: false,
        descargasImprentaDetalle: item.descargasImprenta || []
      }));

      // Guardamos el resultado en la señal de filas real de tu componente
      this.archivos.set(itemsConEstado);
      this.totalElementos.set(itemsConEstado.length);
      this.cargando.set(false);
    },
    error: (err) => {
      console.error('Error al sincronizar directorios de Imprenta:', err);
      this.archivos.set([]);
      this.totalElementos.set(0);
      this.cargando.set(false);
      this.snackBar.open('Error al sincronizar los directorios de impresión.', 'Cerrar', { duration: 3000 });
    }
  });
}
  private buscarArchivosHijos(fila: FilaProceso, unidad: string, tipoDoc: string) {
    fila.cargandoDetalle = true;

    // 1. REPORTES: Busca el PDF del reporte
    console.log(`[LOG] 1. Buscando reporte en: listar/${tipoDoc}/${unidad}/${fila.nombre}/REPORTES`);
    this.dataService.get<any>(`listar/${tipoDoc}/${unidad}/${fila.nombre}/REPORTES`, {}).subscribe({
        next: (res) => {
            const pdf = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.pdf'));
            if (pdf) {
                fila.pdfReporte = pdf.nombre;
                console.log(`[LOG] -> Reporte PDF Encontrado: ${pdf.nombre} para ${fila.nombre}`);
            }
        }
    });

    // 2. EXCEL (Upload): Busca el archivo Excel original en la carpeta de subidas
    console.log(`[LOG] 2. Buscando Excel original en: listar/upload/${tipoDoc}/${unidad}/${fila.nombre}`);
    this.dataService.get<any>(`listar/upload/${tipoDoc}/${unidad}/${fila.nombre}`, {}).subscribe({
        next: (res) => {
            const excel = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.xlsx'));
            if (excel) {
                fila.excelOriginal = excel.nombre;
                console.log(`[LOG] -> Excel Encontrado: ${excel.nombre} para ${fila.nombre}`);
            }
        }
    });

    // 3. CONSOLIDADOS: Corregido quitando '/upload/' de la ruta base de consulta
    const urlBaseConsolidado = `listar/${tipoDoc}/${unidad}/${fila.nombre}`;
    console.log(`[LOG] 3. Buscando Estructura Consolidada en: ${urlBaseConsolidado}`);
    
    this.dataService.get<any>(urlBaseConsolidado, {}).subscribe({
        next: (res) => {
            const items = res.items || [];
            // Buscamos la carpeta interna CARTAS_CONSOLIDADAS
            const folderConsolidado = items.find((i: any) => i.nombre === 'CARTAS_CONSOLIDADAS');

            if (folderConsolidado) {
                console.log(`[LOG] -> Carpeta CARTAS_CONSOLIDADAS detectada en ${fila.nombre}`);
                fila.activarConsolidadoImprenta = folderConsolidado.activarConsolidadoImprenta;
                fila.descargasImprenta = folderConsolidado.descargasImprenta ?? [];

                // Buscamos el archivo físico consolidado.pdf en la subcarpeta
                const urlContenido = `listar/${tipoDoc}/${unidad}/${fila.nombre}/CARTAS_CONSOLIDADAS`;
                this.dataService.get<any>(urlContenido, {}).subscribe({
                    next: (resInner) => {
                        const archivosInternos = resInner.items || [];
                        const pdfEncontrado = archivosInternos.find((f: any) => f.nombre.toLowerCase().endsWith('.pdf'));
                        
                        if (pdfEncontrado) {
                            fila.pdfConsolidado = pdfEncontrado.nombre; // Setea variable homologada con el HTML
                        }
                        
                        fila.cargandoDetalle = false;
                        console.log(`[LOG] FINALIZADO [${fila.nombre}] - Activado: ${fila.activarConsolidadoImprenta} - PDF: ${fila.pdfConsolidado}`);
                    },
                    error: () => fila.cargandoDetalle = false
                });
            } else {
                console.warn(`[LOG] -> No se encontró la subcarpeta CARTAS_CONSOLIDADAS en ${urlBaseConsolidado}`);
                fila.cargandoDetalle = false;
            }
        },
        error: () => fila.cargandoDetalle = false
    });
  }

  navegarACarpeta(nombreCarpeta: string) {
    // 1. Definimos qué prefijo corresponde a cada unidad
    const prefijosPorUnidad: Record<string, string> = {
      'cobranza': 'CD-',
      '1juzgado': 'CDPJ', // Coincide con la unidad limpia de tu vista
      '2juzgado': 'CDSJ'
    };

    // 2. Obtenemos la unidad actual llamando al método correcto de la clase
    const unidadActual = this.obtenerUnidadLimpia();
    
    // 3. Buscamos el prefijo que le corresponde a esta unidad
    const prefijoBloqueado = prefijosPorUnidad[unidadActual];

    // 4. Si la carpeta empieza con el prefijo de la unidad actual, bloqueamos la navegación
    if (prefijoBloqueado && nombreCarpeta.startsWith(prefijoBloqueado)) {
      return;
    }

    // Si no se cumple la condición de bloqueo, continúa la navegación normal
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

  // 🚀 FUNCIÓN AGREGADA AQUÍ PARA CORREGIR EL ERROR DE COMPILACIÓN
  esCarpetaProcesoValida(element: FilaProceso): boolean {
    if (!element || !element.esDirectorio || !element.nombre) {
      return false;
    }
    return element.nombre.startsWith('CD-') || 
           element.nombre.startsWith('CDPJ') || 
           element.nombre.startsWith('CDSJ');
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

  public esPerfilImprenta = computed(() => {
    return this.obtenerUnidadLimpia() === 'imprenta';
  });

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

      this.ejecutarDescarga(pathFinal, archivo, metadatos);
  }

  habilitarParaImprenta(element: any) {
  if (!element || element.cargandoHabilitar || element.activarConsolidadoImprenta) return;

  element.cargandoHabilitar = true;
  const unidadActual = this.unidadSeleccionada()?.codigoUnidad || this.obtenerUnidadLimpia();
  const subPathBase = `${this.tipoDocumento().toLowerCase()}/${unidadActual.toLowerCase()}`;
  const pathCompletoArchivo = `${subPathBase}/${this.rutaNavegacion().join('/')}/${element.nombre}`;

  const payload = {
    pathArchivo: pathCompletoArchivo,
    nombreArchivo: element.nombre,
    unidad: unidadActual,
    tipoDocumento: this.tipoDocumento()
  };

  this.dataService.post<any>('procesar/habilitar-imprenta', payload).subscribe({
    next: (respuesta) => {
      // 1. Al pasar a true, Angular renderiza instantáneamente el 4to icono postal.xlsx
      element.activarConsolidadoImprenta = true;
      element.cargandoHabilitar = false;

      // 2. Notificamos reactivamente el refresco del arreglo de filas de Angular Material
      this.archivos.set([...this.archivos()]);

      this.snackBar.open('¡Consolidado habilitado! Archivo postal.xlsx generado con éxito.', 'OK', { duration: 4000 });
    },
    error: (err) => {
      console.error('Error al habilitar:', err);
      element.cargandoHabilitar = false;
      this.snackBar.open('Error al procesar la habilitación del lote.', 'Cerrar', { duration: 3000 });
    }
  });
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

  private ejecutarDescarga(urlRelativa: string, nombre: string, metadatos?: any): void {
  
    console.log("ejecutarDescarga", metadatos ? "con metadatos para imprenta" : "sin metadatos, flujo normal");
    
    this.mensajeModal.set('Conectando con el servidor de almacenamiento masivo... Por favor, espere.');
    this.mostrarModalCarga.set(true);
    
    // 1. Determinar la URL base según el entorno
    let baseUrlDescarga = '';
    if (environment.apiUrl.includes('localhost')) {
      baseUrlDescarga = environment.apiUrl; // Local
    } else {
      baseUrlDescarga = 'https://apicartas.sanbernardo.cl/imsbcartas'; // Producción AWS
    }

    let urlFinalNavegador = '';

    if (!metadatos) {
      // =========================================================================
      // FLUJO NORMAL (Tesorería)
      // =========================================================================
      urlFinalNavegador = `${baseUrlDescarga}/download/${urlRelativa}`;
    } else {
      // =========================================================================
      // FLUJO IMPRENTA (Unificado para Archivos Gigantes > 1GB)
      // =========================================================================
      this.mensajeModal.set('Validando credenciales de imprenta y preparando enlace masivo...');
      
      const objetoJson = JSON.stringify(metadatos);
      const objetoBase64 = btoa(unescape(encodeURIComponent(objetoJson)));
      
      // Pasamos los metadatos como QueryParam para que el link nativo los procese
      urlFinalNavegador = `${baseUrlDescarga}/download-imprenta/${urlRelativa}?metadata=${objetoBase64}`;
    }

    console.log("Enlace de descarga nativa generado:", urlFinalNavegador);
    
    // 2. Disparar la descarga nativa del navegador (Directo al disco duro)
    const link = document.createElement('a');
    link.href = urlFinalNavegador;
    link.download = nombre;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 3. Feedback visual fluido idéntico para ambos perfiles
    setTimeout(() => {
      this.mensajeModal.set('¡Descarga transferida con éxito al navegador! El archivo de gran tamaño se procesará en su barra de descargas.');
      
      setTimeout(() => {
        this.mostrarModalCarga.set(false);
        this.snackBar.open('Descarga iniciada con éxito.', 'Cerrar', { duration: 4000 });
      }, 2000);
    }, 1000);
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

    return { nombre: subValue };
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