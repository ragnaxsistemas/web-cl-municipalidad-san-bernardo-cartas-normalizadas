 import { Component, inject, signal, OnInit, computed } from '@angular/core'; // 🚩 ESTO ES CORE
import { ActivatedRoute } from '@angular/router'; // 🚩 ESTO ES ROUTER
import { Component as NgComponent } from '@angular/core'; // Ajuste de import si es necesario
import { AuthService } from '@core/services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '@core/services/data.service';
import { ArchivoDetalle, RespuestaListar } from '@core/models/auth.model'; // Importamos el modelo de respuesta
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, forkJoin, of } from 'rxjs';

export interface FilaProceso {
  nombre: string;         // El nombre de la carpeta CD-FTX...
  esDirectorio: true;
  pdfReporte?: string;    // Nombre del archivo PDF en /REPORTES
  pdfConsolidado?: string; // Nombre del archivo PDF en /CARTAS_CONSOLIDADAS
  excelOriginal?: string; // Nombre del archivo XLSX en /upload/...
  cargandoDetalle?: boolean;
}

@NgComponent({
  selector: 'app-registros',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTableModule, 
    MatInputModule, MatFormFieldModule, MatButtonModule, 
    MatIconModule,
    MatPaginatorModule, // 🚩 INDISPENSABLE PARA [pageSizeOptions]
    MatProgressSpinnerModule, // Para el cargando()
    MatTooltipModule
  ],
  templateUrl: './registros.component.html',
  styleUrls: ['./registros.component.scss']
})
export class RegistrosComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private authService = inject(AuthService);

  // Signals de estado
  tituloPagina = signal('Consultas y Reportes');
  tipoDocumento = signal(''); 
  carpetas = signal<string[]>([]);
  archivos = signal<ArchivoDetalle[]>([]);
  filtroNombre = signal(''); 
  displayedColumns: string[] = ['icono', 'nombre', 'acciones'];
  
  // La rutaActual ahora solo guardará las subcarpetas después de la base
  // Ejemplo: ['2026_04_03', 'lote_01']
  rutaNavegacion = signal<string[]>([]);
// Signals para el Selector de Unidades
  unidadesCombo = signal<any[]>([]);
  unidadSeleccionada = signal<any | null>(null);
  mostrarSelectorUnidad = signal(false); // Para mostrar/ocultar el combo en el HTML

  totalElementos = signal(0);
  pageSize = signal(10);
  paginaActual = signal(0);
  cargando = signal(false);

  dataSource = computed(() => {
  // Convertimos las carpetas (strings) a objetos compatibles con la tabla
    const carpetasObj = this.carpetas().map(nombre => ({
      nombre: nombre,
      esDirectorio: true,
      observacion: '',
      usuario: ''
    }));

    const combined = [...carpetasObj, ...this.archivos()];
    const term = this.filtroNombre().toLowerCase().trim();

    if (!term) return combined;

    return combined.filter(item => 
      item.nombre.toLowerCase().includes(term)
    );
  });

  esCarpeta(item: any): boolean {
    return typeof item === 'string';
  }

  ngOnInit() {
    this.route.data.subscribe(data => {
      // Capturamos el tipo desde la ruta definida arriba
      const tipoRuta = data['tipo']; 
      this.tipoDocumento.set(tipoRuta);
      this.tituloPagina.set(data['titulo'] || 'Consultas');
      
      this.rutaNavegacion.set([]); 
      this.paginaActual.set(0);

      const unidadOriginal = localStorage.getItem('codigo_unidad') || '';
      const unidadLimpia = unidadOriginal.replace('imsb_', '');

      // 🚩 CORRECCIÓN: Si la ruta es de imprenta O el usuario es imprenta/admin
      if (tipoRuta === 'imprenta' || unidadLimpia === 'imprenta' || unidadLimpia === 'admin') {
        this.mostrarSelectorUnidad.set(true);
        this.cargarUnidadesHabilitadas(unidadLimpia);
      } else {
        this.mostrarSelectorUnidad.set(false);
        this.cargarNivel(); 
      }
    });
  }

  /**Para administracion e imprenta */
  cargarUnidadesHabilitadas(unidadLimpia: string) {
    // Obtenemos 'imsb_reportes' desde el AuthService
    const codEmpresa = this.authService.obtenerCodEmpresa() || 'imsb_reportes'; 
    
    this.dataService.get<any[]>(`carpetas-habilitadas/unidad/${codEmpresa}`).subscribe({
      next: (unidades) => {
        // Formateamos las unidades para que el 'codigoUnidad' no tenga el prefijo 'imsb_'
        // Esto es vital para que ejecutarCargaEstandar use la ruta correcta (ej: /listar/cobranza/tesoreria)
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
      // Determinamos el tipo de navegación por el nombre mostrado (showNombreUnidad)
      const nombreLower = unidad.showNombreUnidad.toLowerCase();
      let tipoNavegacion = "cobranza"; 
      
      if (nombreLower.includes("juzgado")) {
        tipoNavegacion = "notificacion";
      }

      const unidadLimpia = unidad.codigoUnidad.replace('imsb_', '');

      this.unidadSeleccionada.set({
        ...unidad,
        tipoNavegacion: tipoNavegacion,
        codigoUnidadLimpia: unidadLimpia
      });

      // Actualizamos estados y disparamos carga
      this.tipoDocumento.set(tipoNavegacion);
      this.rutaNavegacion.set([]); // Reset de carpetas al cambiar unidad
      
      this.ejecutarCargaEstandar(unidadLimpia, tipoNavegacion, []);
    }
  }
  /**
   * 🚩 CAMBIO PRINCIPAL: Adaptación al DataService refactorizado
   */
  cargarNivel() {
    this.cargando.set(true);
    const unidadOriginal = localStorage.getItem('codigo_unidad') || 'tesoreria';
    const unidadLimpia = unidadOriginal.replace('imsb_', '');
    const nav = this.rutaNavegacion(); // Signal con el array de navegación
    const tipoDoc = this.tipoDocumento(); // Signal con 'cobranza' o 'notificacion'

    // Lógica para IMPRENTA
    if (unidadLimpia === 'imprenta') {
        if (nav.length === 0) {
            // Si está en la raíz, ve TODO (multicarpeta)
            this.cargarVistaMulticarpetaImprenta();
        } else {
            // Si ya entró a una carpeta (ej: CD-100), debemos saber a qué unidad pertenece
            // Aquí hay un truco: si el usuario es imprenta, el primer nivel de nav[0] 
            // debería ayudarnos a identificar si viene de tesoreria o juzgado.
            // Si no guardas el origen, podrías usar la carga estándar con una unidad base.
            this.ejecutarCargaEstandar(unidadLimpia, tipoDoc, nav);
        }
    } else {
        // Lógica para unidades NORMALES (tesoreria, 1juzgado, etc)
        this.ejecutarCargaEstandar(unidadLimpia, tipoDoc, nav);
    }
}

// CORRECCIÓN: Los parámetros son (nombre: tipo), no (this.metodo())
  ejecutarCargaEstandar(unidadLimpia: string, tipoDoc: string, nav: string[]) { 
    this.cargando.set(true);

    // Construcción de la URL
    let url = `listar/${tipoDoc}/${unidadLimpia}`;
    if (nav.length > 0) url += `/${nav.join('/')}`;

    this.dataService.get<any>(url, { page: '0', size: '100' }).subscribe({
      next: (res) => {
        const items = res.items || [];
        
        const carpetasProceso = items.filter((i: any) => i.esDirectorio && i.nombre.startsWith('CD-'));
        const otrosArchivos = items.filter((i: any) => !i.esDirectorio && i.nombre.toLowerCase().endsWith('.pdf'));

        if (carpetasProceso.length > 0 && nav.length === 0) {
          const filasProcesadas: any[] = carpetasProceso.map((c: any) => ({
            nombre: c.nombre,
            esDirectorio: true,
            observacion: c.observacion,
            cargandoDetalle: true
          }));

          this.archivos.set(filasProcesadas);
          this.carpetas.set([]);

          // Pasamos las variables que recibimos por parámetro
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
    console.log('Cargando vista multicarpeta para Imprenta...');
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
        let todasLasFilas: any[] = [];

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
            cargandoDetalle: true
          }));
          
          todasLasFilas = [...todasLasFilas, ...filas];
        });

        this.archivos.set(todasLasFilas);
        this.carpetas.set([]);
        this.cargando.set(false);

        todasLasFilas.forEach(fila => {
          this.buscarArchivosHijos(fila, fila.unidadOrigen, fila.tipoOrigen);
        });
      },
      error: () => this.cargando.set(false)
    });
  }

private buscarArchivosHijos(fila: FilaProceso, unidad: string, tipoDoc: string) {
  const baseLog = `📂 Proceso [${fila.nombre}]:`;

  // 1. Log para Reportes
  const urlReportes = `listar/${tipoDoc}/${unidad}/${fila.nombre}/REPORTES`;
  console.log(`${baseLog} Buscando Reporte en -> ${urlReportes}`);
  this.dataService.get<any>(urlReportes, {}).subscribe(res => {
    const pdf = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.pdf'));
    if (pdf) {
      fila.pdfReporte = pdf.nombre;
      console.log(`${baseLog} ✅ Reporte encontrado: ${pdf.nombre}`);
    }
  });

  // 2. Log para Consolidados
  const urlConsolidados = `listar/${tipoDoc}/${unidad}/${fila.nombre}/CARTAS_CONSOLIDADAS`;
  console.log(`${baseLog} Buscando Consolidado en -> ${urlConsolidados}`);
  this.dataService.get<any>(urlConsolidados, {}).subscribe(res => {
    const pdf = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.pdf'));
    if (pdf) {
      fila.pdfConsolidado = pdf.nombre;
      console.log(`${baseLog} ✅ Consolidado encontrado: ${pdf.nombre}`);
    }
  });

  // 3. Log para Excel (Upload)
  const urlUpload = `listar/upload/${tipoDoc}/${unidad}/${fila.nombre}`;
  console.log(`${baseLog} Buscando Excel Original en -> ${urlUpload}`);
  this.dataService.get<any>(urlUpload, {}).subscribe(res => {
    const excel = res.items?.find((i: any) => i.nombre.toLowerCase().endsWith('.xlsx'));
    if (excel) {
      fila.excelOriginal = excel.nombre;
      console.log(`${baseLog} ✅ Excel encontrado: ${excel.nombre}`);
    }
    fila.cargandoDetalle = false;
  });
}

  navegarACarpeta(nombreCarpeta: string) {
    // Si el nombre empieza con CD-, ya estamos mostrando sus archivos hijos 
    // mediante buscarArchivosHijos, por lo tanto anulamos la navegación profunda.
    if (nombreCarpeta.startsWith('CD-')) {
      console.log('Navegación anulada: Ya se muestran los archivos para', nombreCarpeta);
      return;
    }

    this.rutaNavegacion.update(path => [...path, nombreCarpeta]);
    this.cargarNivel();
  }

  volverAtras() {
    this.rutaNavegacion.update(path => {
      if (path.length > 0) {
        return path.slice(0, -1);
      }
      return path;
    });
    
    this.paginaActual.set(0); // Resetear página al subir de nivel
    this.cargarNivel();
  }

  obtenerUnidadLimpia(): string {
    console.log('Obteniendo unidad limpia desde localStorage...', localStorage.getItem('codigo_unidad'));
    return (localStorage.getItem('codigo_unidad') || 'tesoreria').replace('imsb_', '');
  }

  descargar(nombreArchivo: string): void {
    const unidad = this.obtenerUnidadLimpia();
    const tipoDoc = this.tipoDocumento();
    const nav = this.rutaNavegacion();
    
    let path = `${tipoDoc}/${unidad}`;
    if (nav.length > 0) {
      path += `/${nav.join('/')}`;
    }
    
    const urlDownload = `${path}/${nombreArchivo}`;
    this.ejecutarDescarga(urlDownload, nombreArchivo);
  }

  // Método para descargas desde la fila consolidada (Botones de colores)
  descargarEspecial(nombreCarpeta: string, subTipo: string, archivo: string): void {
    const unidad = this.obtenerUnidadLimpia();
    const tipoDoc = this.tipoDocumento();
    
    // Construimos la ruta SIN el prefijo "download/" al inicio
    let pathFinal = '';
    
    if (subTipo === 'upload') {
      // Resultado esperado: upload/cobranza/tesoreria/CD_123/archivo.xlsx
      pathFinal = `upload/${tipoDoc}/${unidad}/${nombreCarpeta}/${archivo}`;
    } else {
      // Resultado esperado: cobranza/tesoreria/CD_123/REPORTES/archivo.pdf
      pathFinal = `${tipoDoc}/${unidad}/${nombreCarpeta}/${subTipo}/${archivo}`;
    }

    // LOG DE DIAGNÓSTICO
    console.log("--- DEBUG DESCARGA ---");
    console.log("1. Carpeta:", nombreCarpeta);
    console.log("2. Subtipo:", subTipo);
    console.log("3. Path construido:", pathFinal);
    console.log("----------------------");

    // Si tu método ejecutarDescarga ya pone el "download/", pásale solo el pathFinal
    this.ejecutarDescarga(`${pathFinal}`, archivo);
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
  this.cargarNivel(); // Vuelve a llamar al backend con los nuevos parámetros
}

onBuscar(valor: string) {
  this.filtroNombre.set(valor);
  this.paginaActual.set(0); // Resetear a la primera página al buscar
  this.cargarNivel();
}
}