import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar'; // Para la alerta
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { DataService } from '@core/services/data.service';
import { MatIconModule } from '@angular/material/icon'; // Para el icono de error
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; // 🚩 IMPORTANTE PARA EL SPINNER


// Material
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatCardModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule, 
    MatProgressSpinnerModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  // Inyecciones
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  // Estado con Signals (Moderno)
  loginData = { username: '', password: '', codEmpresa: 'imsb_reportes' };
  errorMessage = signal<string | null>(null);
  loading = signal(false);

  onLogin() {
    // 1. Validación inicial
    if (!this.loginData.username || !this.loginData.password) {
      this.mostrarError('Por favor, complete todos los campos');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    // 2. Llamada al servicio (Homologado con la lógica de IMSB/Valdivia)
    this.authService.login(this.loginData).subscribe({
      next: (res) => {
        // saveToken ahora centraliza la persistencia que antes hacías manual en el component
        const user = this.authService.saveToken(res.accessToken);

        if (user) {
          console.group('--- Auditoría de Login IMSB ---');
          console.log('Usuario:', user.nombre);
          console.log('Menus:', user.menus);
          console.groupEnd();
          console.log(user.unidadNegocio.codigoUnidad); // Verificar que el código de unidad se esté guardando correctamente
          localStorage.setItem('codigo_unidad', user.unidadNegocio.codigoUnidad);
          //localStorage.setItem('codigo_unidad', user.unidad || 'imsb_imprenta');
          
          // 3. Redirección dinámica basada en el primer menú
          if (user.menus && user.menus.length > 0) {
            this.router.navigate([user.menus[0].value2]);
          } else {
            this.router.navigate(['/imsb/cobranza/registros']); // Fallback
          }
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error en login:', err);
        this.loading.set(false);
        this.mostrarError('Usuario o contraseña incorrectos');
      }
    });
  }

  private mostrarError(mensaje: string) {
    this.errorMessage.set(mensaje);
    this.snackBar.open(mensaje, 'Cerrar', {
      duration: 4000,
      panelClass: ['error-snackbar']
    });
  }
}