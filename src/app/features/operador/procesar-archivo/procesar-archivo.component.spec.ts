import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProcesarArchivoComponent } from './procesar-archivo.component';

describe('ProcesarArchivoComponent', () => {
  let component: ProcesarArchivoComponent;
  let fixture: ComponentFixture<ProcesarArchivoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProcesarArchivoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProcesarArchivoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
