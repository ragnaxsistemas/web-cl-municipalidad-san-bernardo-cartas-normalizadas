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
import { HttpParams } from '@angular/common/http';


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
    this.tipoDocumento.set(data['tipo'] || 'cobranza');
    this.tituloPagina.set(data['titulo'] || 'Consultas');
    
    // Limpiamos todo rastro de navegación previa
    this.rutaNavegacion.set([]);
    this.paginaActual.set(0);
    this.archivos.set([]);
    this.carpetas.set([]);

    // Dejamos que el servidor nos diga qué carpetas existen en:
    // listar/{tipoDoc}/{unidad}/
    this.cargarNivel(); 
  });
}

  /**
   * 🚩 CAMBIO PRINCIPAL: Adaptación al DataService refactorizado
   */
  cargarNivel() {
    this.cargando.set(true);

    // 1. Obtener y limpiar la unidad del localStorage
    // imsb_tesoreria -> tesoreria
    const unidadRaw = localStorage.getItem('codigo_unidad') || 'tesoreria';
    const unidadLimpia = unidadRaw.replace('imsb_', '');

    const tipoDoc = this.tipoDocumento(); // 'cobranza'
    const nav = this.rutaNavegacion();    // ['CD-FTX_2026...', 'REPORTES']

    /**
     * 2. CONSTRUCCIÓN DE LA URL
     * Forzamos la unidad como el segundo segmento después del tipo de documento.
     */
    let url = `listar/${tipoDoc}/${unidadLimpia}`;

    // Si hay navegación interna (procesos, carpetas), la concatenamos
    if (nav.length > 0) {
      url += `/${nav.join('/')}`;
    }

    // 3. Parámetros
    const params = {
      page: this.paginaActual().toString(),
      size: this.pageSize().toString(),
      nombre: this.filtroNombre() || ''
    };

    console.log(`🚀 Solicitando: ${url}`);

    this.dataService.get<any>(url, params).subscribe({
      next: (res) => {
        this.totalElementos.set(res.totalItems || 0);
        const items = res.items || [];
        
        // El backend responde con los objetos {nombre, esDirectorio, ...}
        this.carpetas.set(items.filter((i: any) => i.esDirectorio).map((i: any) => i.nombre));
        // 2. 🔥 FILTRO DE PDF: Solo archivos que terminen en .pdf
        
        const soloPdfs = items.filter((i: any) => 
          !i.esDirectorio && i.nombre.toLowerCase().endsWith('.pdf')
        );
        
        this.archivos.set(soloPdfs);
        this.totalElementos.set(res.totalItems || 0);
        this.cargando.set(false);
      },
      error: (err) => {
        console.error('❌ Error:', err);
        this.cargando.set(false);
      }
    });
  }

  navegarACarpeta(nombreCarpeta: string) {
  // Al entrar a una subcarpeta, reiniciamos a la página 0 y limpiamos filtro si lo deseas
    this.paginaActual.set(0);
    this.filtroNombre.set(''); 
    
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
    return (localStorage.getItem('codigo_unidad') || 'tesoreria').replace('imsb_', '');
  }

  descargar(nombreArchivo: string) {
  // 1. Obtener la unidad igual que en cargarNivel
    const unidadRaw = localStorage.getItem('codigo_unidad') || 'tesoreria';
    const unidadLimpia = unidadRaw.replace('imsb_', '');
    
    const tipoDoc = this.tipoDocumento(); // 'cobranza'
    const nav = this.rutaNavegacion();    // ['CD-FTX...', 'REPORTES']

    /**
     * 2. CONSTRUCCIÓN DE LA URL DINÁMICA
     * Formato: download/cobranza/tesoreria/CD-FTX.../REPORTES/archivo.pdf
     */
    let pathFinal = `${tipoDoc}/${unidadLimpia}`;
    
    if (nav.length > 0) {
      pathFinal += `/${nav.join('/')}`;
    }
    
    const urlDownload = `${pathFinal}/${nombreArchivo}`;

    console.log(`📥 Descargando desde: ${urlDownload}`);

    this.dataService.descargarArchivo(urlDownload).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('❌ Error en la descarga:', err);
        // Aquí podrías añadir un snackbar o alerta de "Archivo no encontrado"
      }
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