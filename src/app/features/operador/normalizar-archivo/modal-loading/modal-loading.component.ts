import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-modal-loading',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, MatDialogModule],
  template: `
    <div style="padding: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 15px;">
      <mat-spinner diameter="50"></mat-spinner>
      <h2 mat-dialog-title style="margin: 0; padding: 0; border: none;">{{ data.mensaje }}</h2>
      <mat-dialog-content>
        <p>Por favor, no cierre esta ventana.</p>
      </mat-dialog-content>
    </div>
  `
})
export class ModalLoadingComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: { mensaje: string }) {}
}