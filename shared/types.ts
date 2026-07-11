export type Semaforo = "critico" | "bajo" | "adecuado";

export interface Proveedor {
  id: string;
  nombreComercial: string;
  razonSocial: string | null;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  rfc: string | null;
  diasCredito: number | null;
  categoria: string | null;
  activo: boolean;
  notas: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TipoProducto {
  id: string;
  nombreTipo: string;
  requiereCaducidad: boolean;
  seConsumeEnServicio: boolean;
  seVende: boolean;
  activo: boolean;
}

export interface Producto {
  id: string;
  sku: string | null;
  nombre: string;
  linea: string | null;
  tipoProductoId: string | null;
  unidadMedida: string | null;
  proveedorPrincipalId: string | null;
  costoBase: number | null;
  precioVenta: number | null;
  stockMinimoManual: number | null;
  ubicacion: string | null;
  presentacion: string | null;
  activo: boolean;
  observaciones: string | null;
}

export interface ProductoConStock extends Producto {
  tipoProductoNombre: string | null;
  proveedorNombre: string | null;
  stockTotal: number;
  semaforo: Semaforo;
  loteMasProximoACaducar: string | null; // fecha ISO
}

export interface Lote {
  id: string;
  productoId: string;
  productoNombre: string;
  proveedorId: string | null;
  numeroLote: string | null;
  fechaCompra: string | null;
  fechaEntrada: string | null;
  fechaCaducidad: string | null;
  cantidadInicial: number;
  cantidadDisponible: number;
  costoUnitarioLote: number | null;
  ubicacion: string | null;
  estado: string;
  notas: string | null;
}

export interface Cliente {
  id: string;
  codigoCliente: string;
  nombreCompleto: string;
  telefono: string | null;
  correo: string | null;
  fechaNacimiento: string | null;
  direccion: string | null;
  contactoEmergencia: string | null;
  fechaAlta: string;
  activo: boolean;
  notas: string | null;
  observaciones: string | null;
  carpetaPath: string | null;
  /** Avisos rápidos calculados (ej. "Por contactar", "Pago pendiente"), para la columna de estatus. */
  alertas: string[];
}

export interface MantenimientoPendiente {
  /** id del servicio_realizado que generó la sugerencia (para poder descartarla). */
  servicioRealizadoId: string;
  clienteId: string;
  clienteNombre: string;
  servicioNombre: string | null;
  fechaUltimoServicio: string;
  fechaSugerida: string;
}

/** Resumen de citas/servicios/pagos de una clienta, usado por la búsqueda de clientes en Citas. */
export interface ResumenClienteCitas {
  serviciosCerrados: number;
  totalCobrado: number;
  saldoPendiente: number;
}

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  categoriaServicio: string | null;
  duracionEstimadaMin: number | null;
  precioSugerido: number | null;
  periodicidadMantenimientoDias: number | null;
  activo: boolean;
  descripcion: string | null;
  notasInternas: string | null;
  consumeInventario: boolean;
}

export interface CitaRow {
  id: string;
  clienteId: string;
  clienteNombre: string;
  servicioCatalogoId: string | null;
  servicioNombre: string | null;
  fecha: string;
  hora: string;
  duracionMin: number | null;
  estado: string;
  esMantenimiento: boolean;
  notas: string | null;
  servicioRealizadoId: string | null;
  /** Saldo pendiente de esa cita ya cerrada (0 si aún no se cierra, está pagada o fue cancelada). */
  saldoPendiente: number;
}

export interface ServicioRealizado {
  id: string;
  codigoServicio: string;
  clienteId: string;
  clienteNombre: string;
  servicioCatalogoId: string;
  servicioNombre: string | null;
  citaId: string | null;
  fecha: string;
  precio: number | null;
  estatusPago: string;
  estatus: string;
  carpetaPath: string | null;
  proximaCitaSugerida: string | null;
  tieneComprobante: boolean;
}

export interface DetalleServicioRealizado {
  precio: number;
  estatusPago: string;
  estatus: string;
  observaciones: string | null;
  productosConsumidos: { productoNombre: string; cantidad: number }[];
  productosVendidos: { productoNombre: string; cantidad: number }[];
  pagos: { fecha: string; monto: number; metodoPago: string }[];
  totalCobrado: number;
  saldoPendiente: number;
}

export interface DesgloseMetodo {
  metodoPago: string;
  monto: number;
}

export interface CorteResumenPendiente {
  desglosePorMetodo: DesgloseMetodo[];
  total: number;
  cantidadPagos: number;
  desdeFecha: string | null; // fecha del corte anterior, o null si nunca se ha hecho uno
}

export interface CorteRow {
  id: string;
  fecha: string;
  hora: string;
  desglosePorMetodo: DesgloseMetodo[];
  total: number;
}

export interface CorteResumenPeriodo {
  total: number;
  cantidadCortes: number;
}

export interface ArchivoRow {
  id: string;
  nombreOriginal: string;
  categoria: string | null;
  createdAt: number;
}

export interface RecetaItem {
  id: string;
  productoId: string;
  productoNombre: string;
  cantidadSugerida: number;
}

export interface BitacoraRow {
  id: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  accion: string;
  entidadTipo: string | null;
  entidadId: string | null;
  detalle: string | null;
  createdAt: number;
}

export interface RespaldoRow {
  id: string;
  rutaArchivo: string;
  nombreArchivo: string;
  tamanioBytes: number | null;
  estatus: string;
  createdAt: number;
  /** true si lo generó la app automáticamente antes de un borrado/restauración riesgosos. */
  esAutomatico: boolean;
}

export interface ReporteCobranzaFila {
  fecha: string;
  metodoPago: string;
  monto: number;
}

export interface ReporteCobranza {
  filas: ReporteCobranzaFila[];
  totalPorMetodo: DesgloseMetodo[];
  total: number;
}

export interface ReporteInventario {
  totalEntradas: number;
  totalSalidas: number;
  costoConsumo: number;
  porTipoSalida: { tipo: string; cantidad: number }[];
}

export interface ReporteServicioFila {
  servicioNombre: string;
  cantidad: number;
  total: number;
}

export interface ReporteServicios {
  totalServicios: number;
  ticketPromedio: number;
  porServicio: ReporteServicioFila[];
}

export interface ReporteClientes {
  nuevosClientes: number;
  mantenimientosGenerados: number;
}

export interface ResumenDashboard {
  cobradoHoy: number;
  pendienteDeCortar: number;
  serviciosDelMes: number;
  ticketPromedioMes: number;
  clientasActivas: number;
}

export interface MovimientoRow {
  id: string;
  fecha: string;
  tipo: string;
  productoId: string | null;
  productoNombre: string | null;
  loteId: string | null;
  numeroLote: string | null;
  cantidad: number;
  clienteId: string | null;
  proveedorId: string | null;
  observaciones: string | null;
  createdAt: number;
}

export type EstadoLicenciaTipo = "no_activada" | "activa" | "por_vencer" | "vencida" | "invalida";

export interface EstadoLicencia {
  estado: EstadoLicenciaTipo;
  cliente: string | null;
  plan: "mensual" | "anual" | null;
  expira: string | null;
  diasRestantes: number | null;
  matricula: string;
}
