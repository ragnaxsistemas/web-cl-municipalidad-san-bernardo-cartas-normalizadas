import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NormalizarArchivoComponent } from './normalizar-archivo.component';

describe('NormalizarArchivoComponent', () => {
  let component: NormalizarArchivoComponent;
  let fixture: ComponentFixture<NormalizarArchivoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NormalizarArchivoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NormalizarArchivoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
