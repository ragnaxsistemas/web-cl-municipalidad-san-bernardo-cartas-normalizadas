import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; // Opcional para notificaciones fijas
import { environment } from '../../../../environments/environment'; // 🚩 Ajusta la ruta según tu proyecto

@Component({
  selector: 'app-documentacion',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule],
  templateUrl: './documentacion.component.html',
  styleUrls: ['./documentacion.component.scss']
})
export class DocumentacionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);
  
  // Signals para capturar contexto de la ruta (Cobranza, Notificación, Administración)
  tipoModulo = signal<string>('');
  tituloVista = signal<string>('');
  
  // Signal para controlar el aviso visual de conexión
  cargando = signal<boolean>(false);

  ngOnInit(): void {
    // Capturamos las propiedades estáticas definidas en app.routes.ts
    this.route.data.subscribe(data => {
      this.tipoModulo.set(data['tipo'] || 'general');
      this.tituloVista.set(data['titulo'] || 'Documentación del Sistema');
    });
  }

  bajarPdf() {
    this.cargando.set(true);
    
    // 🚩 Quitamos la IP con HTTP plano. Usamos tu url de entorno nativa con HTTPS.
    let baseUrlDescarga = environment.apiUrl; // En AWS resolverá a https://api-cartas.sanbernardo.cl/imsbcartas

    const urlManual = `${baseUrlDescarga}/download/manual`;
    console.log("Desviando descarga por canal seguro HTTPS:", urlManual);
    
    // Forzamos la descarga usando un elemento de anclaje directo (evita bloqueos de popup de window.open)
    const link = document.createElement('a');
    link.href = urlManual;
    link.download = 'manual_usuario.pdf';
    
    // Forzar que abra en pestaña nueva si es necesario, o que dispare directo la descarga
    link.target = '_blank'; 
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Damos un segundo de aviso visual antes de apagar el cargando
    setTimeout(() => {
      this.cargando.set(false);
    }, 1000);
  }
}