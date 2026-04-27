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
import { forkJoin, of } from 'rxjs';  
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

  @ViewChild('loadingDialog') loadingDialogTpl!: TemplateRef<any>;
  
  archivoCsvAdjunto = signal<File | null>(null);
  cargando = signal(false);

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.csv')) {
      this.archivoCsvAdjunto.set(file);
    } else {
      this.snackBar.open('Por favor, seleccione un archivo CSV válido', 'Cerrar', { duration: 3000 });
    }
  }

  generarCartasFinales() {
    const file = this.archivoCsvAdjunto();
    if (!file) return;

    this.cargando.set(true);
    
    const dialogRef = this.dialog.open(this.loadingDialogTpl, {
      disableClose: true,
      width: '300px'
    });

    // 1. Preparar FormData con las llaves exactas del CURL
    const formData = new FormData();
    
    // El CURL usa --form 'archivo=...', por lo tanto la llave debe ser 'archivo'
    formData.append('archivo', file);
    
    // El CURL usa --form 'user=...', agregamos el usuario (puedes usar uno dinámico si lo tienes)
    formData.append('user', 'emiranda@sanbernardo.cl');

    // 2. Llamada al Backend con el endpoint correcto
    this.dataService.post<any>('procesar-normalizacion/to-unnorm-to-merge/cobranza/tesoreria', formData)
      .subscribe({
        next: (res) => {
          dialogRef.close();
          this.cargando.set(false);
          this.snackBar.open('¡Cartas generadas exitosamente!', 'OK', { duration: 5000 });
          this.archivoCsvAdjunto.set(null); 
        },
        error: (err) => {
          dialogRef.close();
          this.cargando.set(false);
          console.error('Error en proceso:', err);
          this.snackBar.open('Error al generar cartas finales', 'Cerrar', { duration: 5000 });
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