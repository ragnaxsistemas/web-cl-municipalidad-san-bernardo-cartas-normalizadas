// src/app/core/services/data.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';
import { RespuestaListar } from '@core/models/auth.model';

@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly API_URL = environment.apiUrl;

  // Genérico para GET
  //get<T>(endpoint: string): Observable<T> {
  //  return this.http.get<T>(`${this.API_URL}/${endpoint}`);
  //}

  get<T>(endpoint: string, params?: any): Observable<T> {
  return this.http.get<T>(`${this.API_URL}/${endpoint}`, { params });
}
  // Genérico para POST
  post<T>(endpoint: string, body: any): Observable<T> {
    console.log(`POST Request to: ${this.API_URL}/${endpoint} with body:`, body);
    return this.http.post<T>(`${this.API_URL}/${endpoint}`, body);
  }

  // Genérico para PUT/PATCH
  put<T>(endpoint: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.API_URL}/${endpoint}`, body);
  }

  listarArchivos(t: string, s?: string, u?: string, p?: string) {
  // Construimos la ruta limpia: /listar/t/s/u/p
  let url = `${environment.apiUrl}/listar/${t}`;
  if (s) url += `/${s}`;
  if (u) url += `/${u}`;
  if (p) url += `/${p}`;
  
  return this.http.get(url);
}


  // --- MÉTODOS GENÉRICOS (PRIVADOS) ---

  /**
   * Construye una ruta de listado estándar: /cartas/listar/{tipo}/{seccion}/{unidad}/{carpeta}
   */
  private getListarUrl(tipo: string, seccion: string, unidad: string, carpeta?: string): string {
    let url = `${this.API_URL}/cartas/listar/${tipo}/${seccion}/${unidad}`;
    return carpeta ? `${url}/${carpeta}` : url;
  }

  /**
   * Ejecuta un POST estándar a los microservicios de proceso (Normalizar/Ejecutar)
   */
  private ejecutarPost(accion: string, tipo: string, payload: any): Observable<any> {
    const url = `${this.API_URL}/${accion}-archivo-${tipo}`;
    console.log(`🚀 Ejecutando ${accion} en:`, url, payload);
    return this.http.post(url, payload);
  }

  // --- MÉTODOS PÚBLICOS ---

  /**
   * Lista archivos o carpetas usando la estructura unificada Upload
   */
  // En data.service.ts tipo upload se refiere a 'upload', 'normalizado' o 'procesado' dependiendo del contexto (carga, normalización o procesamiento)
  // En data.service.ts seccion upload se refiere a 'upload', 'normalizado' o 'procesado' dependiendo del contexto (carga, normalización o procesamiento)

  /**
   * Sube archivos con metadatos (Observación/Header)
   */
  uploadConHeader(tipo: string, unidad: string, file: File, header: string, user: string): Observable<any> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('header', header);
    formData.append('user', user);
    return this.http.post(`${this.API_URL}/cartas/${tipo}/upload/${unidad}`, formData);
  }

  /**
   * Gatilla el proceso de Normalización
   */
  ejecutarNormalizacion(payload: any, tipo: string): Observable<any> {
    return this.ejecutarPost('normalizar', tipo, payload);
  }

  /**
   * Gatilla la generación de PDFs (iText)
   */
  procesarGeneracionCartas(payload: any): Observable<any> {
  const url = `${this.API_URL}/procesar/execute-archivo-cobranza`;
  return this.http.post(url, payload);
}

  /**
   * Descarga binaria de archivos
   */
  descargarArchivo(pathCompleto: string): Observable<Blob> {
    const url = `${this.API_URL}/download/${pathCompleto}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  // 2. Método específico para Imprenta (Envía el objeto de metadatos)
  descargarArchivoImprenta(pathCompleto: string, metadatos: any): Observable<Blob> {
    const url = `${this.API_URL}/download-imprenta/${pathCompleto}`;
    
    // Convertimos el objeto a JSON y luego a Base64
    const objetoJson = JSON.stringify(metadatos);
    // btoa maneja strings ASCII; usamos encodeURIComponent para soportar tildes/eñes
    const objetoBase64 = btoa(unescape(encodeURIComponent(objetoJson)));

    // Ahora 'HttpHeaders' será reconocido gracias al import
    const headers = new HttpHeaders().set('X-Download-Metadata', objetoBase64);

    return this.http.get(url, { 
      headers: headers,
      responseType: 'blob' 
    });
  }
}