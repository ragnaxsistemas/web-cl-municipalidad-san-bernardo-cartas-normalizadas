export interface Menu {
  id: number;
  value1: string; // Nombre del menú
  value2: string; // Ruta/Path
  orden: number;  // Campo para ordenar los menús
}

export interface Role {
  nombre: string;
}

export interface Empresa {
  nombreEmpresaCliente: string;
  rutEmpresaCliente: string;
  codigoEmpresaCliente: string;
  razonSocialEmpresaCliente: string;
}

export interface UserResponse {
  accessToken: string;
  expiresAt?: number; // Opcional, según lo que envíe tu Spring Boot
}

export interface UnidadNegocio {
  showNombreUnidad: string;
  nombreUnidad: string;
  codigoUnidad: string;
}

export interface UserToken {
  sub: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string; // Veo que aquí llega el RUT en tu ejemplo
  email: string;
  telefono: string;
  role: Role;                  // Objeto anidado
  empresa: Empresa;            // Objeto anidado
  unidadNegocio: UnidadNegocio; // Objeto anidado
  menus: Menu[];               // Array de objetos
  iat: number;
  exp: number; // <-- Ahora sí existe
}

export interface ArchivoDetalle {
  nombre: string;
  fechaCreacion: string;
  observacion: string;
}

export interface RespuestaListar {
  carpetas: string[];
  archivos: ArchivoDetalle[];
}