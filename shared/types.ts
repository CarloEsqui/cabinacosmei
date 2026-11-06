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
  /** Nombre de la pieza en la que se cuenta el stock (Bote, Ampolleta, Frasco...). */
  presentacion: string | null;
  /** Contenido de cada pieza (ej. 60). null si no se definió. */
  contenidoCantidad: number | null;
  /** Unidad del contenido: "ml" | "g" | "pzas" | texto libre. */
  contenidoUnidad: string | null;
  /** "pieza": consumir descuenta 1 pieza. "contenido": consumir se captura en ml/g y descuenta la fracción. */
  modoConsumo: string;
  activo: boolean;
  observaciones: string | null;
}

export interface ProductoConStock extends Producto {
  tipoProductoNombre: string | null;
  proveedorNombre: string | null;
  /** Stock usable: lotes activos no caducados. */
  stockTotal: number;
  /** Existencias en lotes ya caducados, pendientes de dar de baja (no cuentan como stock). */
  stockCaducado: number;
  semaforo: Semaforo;
  loteMasProximoACaducar: string | null; // fecha ISO
}

export interface Lote {
  id: string;
  productoId: string;
  productoNombre: string;
  /** Presentación/contenido del producto dueño del lote, para formatear la existencia en piezas. */
  presentacion: string | null;
  contenidoCantidad: number | null;
  contenidoUnidad: string | null;
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
  /** Días entre hoy y la fecha sugerida: positivo = por vencer, 0 = hoy, negativo = ya venció. */
  diasRestantes: number;
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

/** Un descuento vigente del ticket (spec de descuentos, migración 0006). */
export interface DescuentoRow {
  id: string;
  aplicaA: "servicio" | "productos";
  modo: "porcentaje" | "monto";
  valor: number;
  base: number;
  monto: number;
  motivo: string;
  motivoDetalle: string | null;
}

export interface DetalleServicioRealizado {
  precio: number; // precio BRUTO del servicio
  descuentoServicio: number;
  totalProductos: number; // productos vendidos, bruto
  descuentoProductos: number;
  total: number; // neto: (precio − descuento) + (productos − descuento)
  descuentos: DescuentoRow[];
  estatusPago: string;
  estatus: string;
  observaciones: string | null;
  productosConsumidos: { productoNombre: string; cantidad: number }[];
  productosVendidos: { productoNombre: string; cantidad: number; precioUnitario: number | null }[];
  pagos: { fecha: string; monto: number; metodoPago: string }[];
  totalCobrado: number;
  saldoPendiente: number;
}

/** Un pago tal como lo ve el detalle de la cita (cobro v2). */
export interface PagoRow {
  id: string;
  fecha: string;
  monto: number;
  metodoPago: string;
  estatus: string; // cobrado | cancelado
  concepto: string; // servicio | anticipo
  motivoCancelacion: string | null;
  enCorte: boolean;
}

/** Pagos y saldo de una cita, antes (anticipos) o después de cerrarla. */
export interface EstadoCuentaCita {
  pagos: PagoRow[];
  cerrada: boolean;
  servicioRealizadoId?: string;
  estatusPago?: string;
  tieneComprobante?: boolean; // del servicio cerrado; evidencia opcional (addendum 2026-11-05)
  total: number | null; // NETO de descuentos; null si la cita aún no se cierra
  cobrado: number;
  saldo: number;
  anticipos: number; // anticipos cobrados aún sin aplicar (solo citas sin cerrar)
  // Desglose del ticket cerrado (spec de descuentos, Gate condición 6). null si no está cerrada.
  precioBruto: number | null;
  descuentoServicio: number;
  totalProductos: number;
  descuentoProductos: number;
  descuentos: DescuentoRow[];
}

export interface DesgloseMetodo {
  metodoPago: string;
  monto: number;
}

export interface CorteResumenPendiente {
  desglosePorMetodo: DesgloseMetodo[]; // cobros (ingresos) por método
  totalCobros: number;
  ajustesPorMetodo: DesgloseMetodo[]; // pagos ya cortados y cancelados después, montos NEGATIVOS
  totalAjustes: number; // ≤ 0
  total: number; // neto = totalCobros + totalAjustes
  cantidadPagos: number;
  cantidadAjustes: number;
  desdeFecha: string | null; // fecha del corte anterior, o null si nunca se ha hecho uno
  // Informativo, no suma (Gate del cobro, condición 14): anticipos cobrados de citas que no se han
  // cerrado. Si la cita se canceló y nadie lo resolvió, aquí no se pierde de vista.
  anticiposSinAplicar: { cantidad: number; total: number };
}

export interface CorteRow {
  id: string;
  fecha: string;
  hora: string;
  desglosePorMetodo: DesgloseMetodo[];
  ajustesPorMetodo: DesgloseMetodo[];
  totalAjustes: number;
  total: number; // neto
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

/** Comprobante de una cita: del servicio cerrado o de un anticipo. */
export interface ComprobanteRow {
  id: string;
  nombreOriginal: string;
  createdAt: number;
  origen: "servicio" | "anticipo" | "venta";
  esPdf: boolean;
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

export interface ResumenDashboard {
  cobradoHoy: number;
  pendienteDeCortar: number;
  serviciosDelMes: number;
  ticketPromedioMes: number;
  clientasActivas: number;
}

// ---------------------------------------------------------------------------
// Reportes — capa de métricas (KPIs con comparación y calidad de datos)
// ---------------------------------------------------------------------------

export type FormatoKPI = "moneda" | "porcentaje" | "numero" | "dias" | "horas";

export interface ComparacionKPI {
  valorAnterior: number | null;
  cambioAbsoluto: number | null;
  /** null cuando no hay base comparable (p. ej. el periodo anterior fue 0). */
  cambioPorcentual: number | null;
  etiqueta: string;
}

export interface KPI {
  id: string;
  titulo: string;
  valor: number | null;
  formato: FormatoKPI;
  comparacion?: ComparacionKPI;
  /** Explicación textual de cómo se calcula (para tooltip). */
  formula: string;
  /** Frase breve de contexto bajo el número. */
  microexplicacion?: string;
  advertencias?: string[];
}

export interface CalidadDatos {
  registrosAnalizados: number;
  registrosExcluidos: number;
  advertencias: string[];
}

export interface PuntoSerieResumen {
  /** Etiqueta corta del bucket (ej. "05 jul" o "jul 26"). */
  periodo: string;
  ventas: number;
  cobranza: number;
  margen: number;
}

export interface ResumenReporte {
  periodo: {
    desde: string;
    hasta: string;
    comparacionDesde?: string;
    comparacionHasta?: string;
    comparacionEtiqueta: string;
  };
  calidadDatos: CalidadDatos;
  kpis: KPI[];
  /** Serie temporal (día/semana/mes automático) de ventas, cobranza y margen para la gráfica. */
  serie: PuntoSerieResumen[];
  /** Misma serie pero del periodo de comparación (mismo número de buckets), para sobreponer en la
   * gráfica de tendencia. Ausente si el usuario eligió "sin comparación". */
  serieComparacion?: PuntoSerieResumen[];
}

export interface FilaEstadoResultados {
  concepto: string;
  valor: number;
  /** true para las filas de total/subtotal (se resaltan). */
  enfasis?: boolean;
}

export interface MetodoPagoFinanzas {
  metodo: string;
  monto: number;
  operaciones: number;
}

export interface CarteraAntiguedadFila {
  rango: string;
  monto: number;
}

export interface ReporteFinanzas {
  kpis: KPI[];
  estadoResultados: FilaEstadoResultados[];
  flujoCaja: FilaEstadoResultados[];
  metodosPago: MetodoPagoFinanzas[];
  carteraAntiguedad: CarteraAntiguedadFila[];
  /** Descuentos otorgados del periodo por motivo (spec de descuentos, FR-008). */
  descuentosPorMotivo: { motivo: string; etiqueta: string; monto: number; cantidad: number }[];
  serie: PuntoSerieResumen[];
}

export interface CarteraClienteFila {
  clienteId: string;
  clienteNombre: string;
  saldo: number;
  ultimoServicioNombre: string | null;
  ultimaFecha: string;
  diasAntiguedad: number;
}

export interface ServicioMetricas {
  servicioNombre: string;
  cantidad: number;
  ingresos: number;
  costoInsumos: number;
  margenBruto: number;
  margenPct: number;
  /** Horas ocupadas = duración estándar del servicio × cantidad. null si no hay duración configurada. */
  duracionHoras: number | null;
  ingresoPorHora: number | null;
  /** true si algún servicio de este grupo no tiene insumos registrados (margen incierto). */
  sinCosto: boolean;
}

export interface ReporteServiciosDetalle {
  kpis: KPI[];
  filas: ServicioMetricas[];
  /** Cantidad de servicios cerrados sin insumos registrados (advertencia global). */
  serviciosSinCosto: number;
}

export type SegmentoCliente = "nueva" | "activa" | "en_riesgo" | "inactiva";

export interface ClienteMetricas {
  clienteId: string;
  nombre: string;
  ultimaVisita: string | null;
  diasSinVisita: number;
  visitas: number;
  valorHistorico: number;
  /** Intervalo promedio entre visitas (días); null si tiene menos de 2 visitas. */
  intervaloPromedio: number | null;
  segmento: SegmentoCliente;
}

export interface SegmentoConteo {
  segmento: SegmentoCliente;
  etiqueta: string;
  cantidad: number;
  /** Suma del valor histórico de las clientas de este segmento. */
  valorTotal: number;
}

export interface ReporteClientesDetalle {
  kpis: KPI[];
  segmentos: SegmentoConteo[];
  enRiesgo: ClienteMetricas[];
  inactivas: ClienteMetricas[];
}

export interface CeldaDemanda {
  /** Día de la semana: 0 = domingo … 6 = sábado. */
  dia: number;
  /** Hora (0–23). */
  hora: number;
  citas: number;
}

export interface ReporteAgenda {
  kpis: KPI[];
  demanda: CeldaDemanda[];
  /** Rango de horas a mostrar en el heatmap (según el horario de atención). */
  horaMin: number;
  horaMax: number;
  /** Días laborales configurados (0–6), para las columnas del heatmap. */
  diasLaborales: number[];
  /** false si no se pudo calcular ocupación (horario no configurado). */
  ocupacionDisponible: boolean;
}

// --- Hallazgos automáticos (capa de inteligencia) ---

/** Tono/severidad de un hallazgo, ordenado por prioridad de atención. */
export type TonoHallazgo = "critico" | "atencion" | "positivo" | "informativo";

/** Estado de seguimiento de un hallazgo, persistido por (tipo de hallazgo, rango de fechas). */
export type EstadoHallazgo = "nuevo" | "revisado" | "en_seguimiento" | "resuelto" | "descartado";

export interface Hallazgo {
  id: string;
  tono: TonoHallazgo;
  /** Área del negocio: "Ventas" | "Agenda" | "Clientas" | "Inventario". */
  categoria: string;
  titulo: string;
  detalle: string;
  estado: EstadoHallazgo;
}

// --- Inventario (reporte rediseñado) ---

export interface SalidaTipoValor {
  tipo: string;
  valor: number;
  unidades: number;
}

export interface LotePorCaducar {
  productoNombre: string;
  numeroLote: string | null;
  fechaCaducidad: string;
  /** Días hasta caducar; negativo si ya venció. */
  diasRestantes: number;
  cantidad: number;
  valor: number;
  vencido: boolean;
}

export interface ConsumoProducto {
  productoNombre: string;
  unidades: number;
  costo: number;
}

export interface ProductoCritico {
  productoNombre: string;
  stock: number;
  minimo: number;
}

export interface ReporteInventarioDetalle {
  kpis: KPI[];
  /** Salidas del periodo agrupadas por tipo, valorizadas a costo. */
  salidasPorTipo: SalidaTipoValor[];
  /** Lotes por caducar (ventana de alerta) o ya vencidos con existencia. */
  porCaducar: LotePorCaducar[];
  /** Productos que más costo de insumos consumieron en el periodo. */
  topConsumo: ConsumoProducto[];
  /** Productos activos en nivel crítico de stock, al día de hoy. */
  criticos: ProductoCritico[];
}

export interface MovimientoRow {
  id: string;
  fecha: string;
  tipo: string;
  folio: string | null;
  productoId: string | null;
  productoNombre: string | null;
  loteId: string | null;
  numeroLote: string | null;
  cantidad: number;
  clienteId: string | null;
  proveedorId: string | null;
  observaciones: string | null;
  createdAt: number;
  /** entrada_inventario | salida_inventario: el documento que originó el movimiento. */
  referenciaTipo: string | null;
  referenciaId: string | null;
  /** vigente | cancelada (estatus del documento original, migración 0004). */
  documentoEstatus: string | null;
  documentoMotivoCancelacion: string | null;
  /** La salida viene del cierre de una cita: no se cancela desde Movimientos. */
  ligadoAServicio: boolean;
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

// ---------------------------------------------------------------------------
// Ficha clínica facial (spec .notes/spec-ficha-clinica-2026-11-05.md §21)
// ---------------------------------------------------------------------------

export interface FichaClinica {
  id: string;
  clienteId: string;
  sexo: "F" | "M" | null;
  ocupacion: string | null;
  versionFormulario: number;
  datos: import("./fichaClinica").FichaDatos;
  createdAt: number; // ms
  updatedAt: number; // ms: llave de la concurrencia optimista
}

export interface VersionFicha {
  id: string;
  vigenteDesde: number; // ms
  vigenteHasta: number; // ms
  sexo: string | null;
  ocupacion: string | null;
  versionFormulario: number;
  /** null si la versión tiene un formato anterior que ya no valida; entonces viene `datosCrudos`. */
  datos: import("./fichaClinica").FichaDatos | null;
  datosCrudos: string | null;
}

/** Lo único clínico que ven el detalle de cita y Clientes (Gate de la ficha, condición 11). */
export interface AvisoFicha {
  tieneFicha: boolean;
  precauciones: { clave: string; etiqueta: string; especifique: string | null }[];
}

export interface FotoTratamiento {
  id: string;
  momento: "antes" | "despues";
  nombreOriginal: string;
}

export interface TratamientoFicha {
  servicioRealizadoId: string;
  numero: number; // 1°, 2°… en orden cronológico, como en el papel
  codigoServicio: string;
  citaId: string | null;
  fecha: string;
  servicioNombre: string;
  observaciones: string | null;
  fotos: FotoTratamiento[];
}

// ---------------------------------------------------------------------------
// Venta de mostrador (migración 0008; spec de la venta §22.4)
// ---------------------------------------------------------------------------

export interface VentaMostradorRow {
  id: string;
  folio: string;
  fecha: string;
  clienteId: string | null;
  clienteNombre: string | null;
  clienteCodigo: string | null;
  nombreReferencia: string | null;
  total: number;
  cobrado: number;
  saldo: number;
  estatusPago: string;
  estatus: "vigente" | "cancelada";
  /** Cuántas piezas y productos distintos lleva, para la lista. */
  productos: number;
}

/** Una línea por producto: una línea repartida en lotes son varias salidas con el mismo folio S-. */
export interface LineaVentaMostrador {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export interface DetalleVentaMostrador extends VentaMostradorRow {
  lineas: LineaVentaMostrador[];
  totalProductos: number;
  descuento: number;
  descuentos: DescuentoRow[];
  pagos: PagoRow[];
  tieneComprobante: boolean;
  comprobantes: ComprobanteRow[];
  observaciones: string | null;
  motivoCancelacion: string | null;
  canceladaAt: number | null;
  /** BR-003: ¿se puede cancelar un pago suelto? (clienta o nombre de referencia). */
  permitePagoSuelto: boolean;
}

export interface PaginaVentasMostrador {
  filas: VentaMostradorRow[];
  total: number;
}

