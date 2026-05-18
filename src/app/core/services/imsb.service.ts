import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ImsbService {
  private http = inject(HttpClient);
  private apiUrl = 'api/documentos'; // Ajusta a tu ruta de backend

  descargarManual(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/manual-usuario`, {
      responseType: 'blob'
    });
  }
}