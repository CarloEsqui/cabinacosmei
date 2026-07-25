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
  stockTotal: number;
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
