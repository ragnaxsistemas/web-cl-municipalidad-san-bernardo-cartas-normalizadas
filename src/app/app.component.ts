import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // <-- Debe estar aquí
  template: '<router-outlet></router-outlet>'
})
export class AppComponent {}