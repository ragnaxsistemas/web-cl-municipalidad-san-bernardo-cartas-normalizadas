
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule } from '@angular/router'; // Para router-outlet
import { MatSidenavModule } from '@angular/material/sidenav'; // Para mat-sidenav
import { MatListModule } from '@angular/material/list';       // Para mat-nav-list
import { MatIconModule } from '@angular/material/icon';       // Para mat-icon
import { HeaderComponent } from '../header/header.component'; // Tu Header
import { AuthService } from '@core/services/auth.service';     // Tu Servicio

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    HeaderComponent // <--- IMPORTANTE: Importa el componente aquí
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  // Inyectamos el servicio y lo hacemos público para que el HTML lo vea
  public authService = inject(AuthService); 
}