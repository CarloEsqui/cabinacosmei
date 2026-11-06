import { z } from "zod";

export const proveedorInputSchema = z.object({
  nombreComercial: z.string().min(1, "El nombre comercial es obligatorio"),
  razonSocial: z.string().optional(),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  correo: z.string().email().optional().or(z.literal("")),
  rfc: z.string().optional(),
  diasCredito: z.number().int().nonnegative().default(0),
  categoria: z.string().optional(),
  activo: z.boolean().default(true),
  notas: z.string().optional(),
});
export type ProveedorInput = z.infer<typeof proveedorInputSchema>;

export const tipoProductoInputSchema = z.object({
  nombreTipo: z.string().min(1, "El nombre del tipo es obligatorio"),
  requiereCaducidad: z.boolean().default(true),
  seConsumeEnServicio: z.boolean().default(false),
  seVende: z.boolean().default(false),
  activo: z.boolean().default(true),
});
export type TipoProductoInput = z.infer<typeof tipoProductoInputSchema>;

export const productoInputSchema = z
  .object({
    nombre: z.string().min(1, "El nombre es obligatorio"),
    linea: z.string().optional(),
    tipoProductoId: z.string().nullable().optional(),
    unidadMedida: z.string().optional(),
    proveedorPrincipalId: z.string().nullable().optional(),
    costoBase: z.number().nonnegative().default(0),
    precioVenta: z.number().nonnegative().default(0),
    stockMinimoManual: z.number().nonnegative().nullable().optional(),
    ubicacion: z.string().optional(),
    // Nombre de la pieza (Bote, Ampolleta, Frasco...). El stock SIEMPRE se cuenta en piezas.
    presentacion: z.string().optional(),
    // Contenido de cada pieza (ej. 60 ml). Debe ser > 0 si se usa el modo "contenido".
    contenidoCantidad: z.number().positive().nullable().optional(),
    contenidoUnidad: z.string().nullable().optional(),
    // "pieza": consumir descuenta 1 pieza. "contenido": consumir se captura en ml/g y descuenta la fracción.
    modoConsumo: z.enum(["pieza", "contenido"]).default("pieza"),
    activo: z.boolean().default(true),
    observaciones: z.string().optional(),
  })
  .refine((d) => d.modoConsumo !== "contenido" || (d.contenidoCantidad != null && d.contenidoCantidad > 0), {
    message: "Para descontar por contenido necesitas definir el contenido de la pieza (ej. 60 ml).",
    path: ["contenidoCantidad"],
  });
export type ProductoInput = z.infer<typeof productoInputSchema>;

export const entradaInputSchema = z.object({
  fecha: z.string().min(1),
  folio: z.string().optional(),
  proveedorId: z.string().nullable().optional(),
  productoId: z.string().min(1),
  // Si loteId viene vacío, se crea un lote nuevo con los datos de abajo.
  loteId: z.string().optional(),
  numeroLote: z.string().optional(),
  fechaCaducidad: z.string().optional(),
  ubicacion: z.string().optional(),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
  costoUnitario: z.number().nonnegative().default(0),
  numeroFactura: z.string().optional(),
  metodoPago: z.string().optional(),
  observaciones: z.string().optional(),
});
export type EntradaInput = z.infer<typeof entradaInputSchema>;

export const salidaInputSchema = z.object({
  fecha: z.string().min(1),
  folio: z.string().optional(),
  productoId: z.string().min(1),
  loteId: z.string().optional(), // si no se especifica, se elige por FEFO/FIFO
  tipoSalida: z.enum(["venta", "consumo_servicio", "merma", "devolucion", "uso_interno", "ajuste"]),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
  clienteId: z.string().nullable().optional(),
  servicioRealizadoId: z.string().nullable().optional(),
  observaciones: z.string().optional(),
});
export type SalidaInput = z.infer<typeof salidaInputSchema>;

/** Cancelar una entrada o salida de inventario capturada por error (DAT-A2). Motivo opcional (decisión de Carlos). */
export const cancelacionInventarioSchema = z.object({
  id: z.string().min(1),
  motivo: z.string().trim().optional(),
});

export const loteInputSchema = z.object({
  numeroLote: z.string().optional(),
  fechaCaducidad: z.string().optional(),
  ubicacion: z.string().optional(),
  notas: z.string().optional(),
  costoUnitarioLote: z.number().nonnegative().default(0),
});
export type LoteInput = z.infer<typeof loteInputSchema>;

export const clienteInputSchema = z.object({
  nombreCompleto: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional(),
  correo: z.string().email().optional().or(z.literal("")),
  fechaNacimiento: z.string().optional(),
  direccion: z.string().optional(),
  contactoEmergencia: z.string().optional(),
  activo: z.boolean().default(true),
  notas: z.string().optional(),
  observaciones: z.string().optional(),
});
export type ClienteInput = z.infer<typeof clienteInputSchema>;

export const servicioCatalogoInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  categoriaServicio: z.string().optional(),
  duracionEstimadaMin: z.number().int().positive().nullable().optional(),
  precioSugerido: z.number().nonnegative().default(0),
  periodicidadMantenimientoDias: z.number().int().positive().nullable().optional(),
  activo: z.boolean().default(true),
  descripcion: z.string().optional(),
  notasInternas: z.string().optional(),
  consumeInventario: z.boolean().default(false),
});
export type ServicioCatalogoInput = z.infer<typeof servicioCatalogoInputSchema>;

export const citaInputSchema = z.object({
  clienteId: z.string().min(1, "Selecciona una clienta"),
  servicioCatalogoId: z.string().min(1, "Selecciona un servicio"),
  fecha: z.string().min(1),
  hora: z.string().min(1),
  duracionMin: z.number().int().positive().default(60),
  notas: z.string().optional(),
});
export type CitaInput = z.infer<typeof citaInputSchema>;

export const citasFiltroSchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  estados: z.array(z.string()).optional(),
  clienteId: z.string().optional(),
});
export type CitasFiltro = z.infer<typeof citasFiltroSchema>;

export const productoConsumoSchema = z.object({
  productoId: z.string().min(1),
  cantidad: z.number().positive(),
});

/** Producto vendido en el ticket del cierre, con su precio unitario de venta (DIN-A5, FR-002). */
export const productoVentaSchema = productoConsumoSchema.extend({
  precioUnitario: z.number().nonnegative("El precio no puede ser negativo"),
});

/** Una línea de pago: método + monto (cobro v2, FR-001). */
export const lineaPagoSchema = z.object({
  metodoPago: z.string().trim().min(1, "Elige el método de pago."),
  monto: z.number().positive("Cada pago debe ser mayor a $0."),
});
export type LineaPago = z.infer<typeof lineaPagoSchema>;

/**
 * Addendum 2026-11-05 (reemplaza BR-008): el efectivo no pide comprobante. Se reconoce por nombre
 * porque los métodos de pago son configurables: "Efectivo", "efectivo (caja)", etc.
 */
export function esEfectivo(metodoPago: string): boolean {
  return metodoPago.trim().toLowerCase().startsWith("efectivo");
}

/** true si algún pago no es en efectivo: sin comprobante, ese cobro queda sin evidencia. */
export function requiereEvidencia(lineas: { metodoPago: string; monto: number }[]): boolean {
  return lineas.some((l) => l.monto > 0 && !esEfectivo(l.metodoPago));
}

/**
 * Cierre de cita, cobro v2: N líneas de pago y el estatus lo DERIVA el servidor (FR-003). Ya no
 * existen `metodoPago`, `monto` ni `estatusPago` (Decisión A: sin "cancelado" en el cierre).
 */
export const cierreCitaInputSchema = z.object({
  servicioRealizadoId: z.string().min(1),
  precio: z.number().nonnegative().default(0),
  productosConsumidos: z.array(productoConsumoSchema).default([]),
  productosVendidos: z.array(productoVentaSchema).default([]),
  pagos: z.array(lineaPagoSchema).default([]),
  observaciones: z.string().optional(),
  /** La usuaria confirmó continuar sin comprobante en un cobro que no es en efectivo. */
  sinComprobanteAceptado: z.boolean().optional(),
});
export type CierreCitaInput = z.infer<typeof cierreCitaInputSchema>;

/** FR-004: abono a un servicio cerrado. Sin PIN (addendum 2026-11-05). */
export const abonoInputSchema = z.object({
  servicioRealizadoId: z.string().min(1),
  lineas: z.array(lineaPagoSchema).min(1, "Agrega al menos un pago."),
  sinComprobanteAceptado: z.boolean().optional(),
});
export type AbonoInput = z.infer<typeof abonoInputSchema>;

/** FR-005: anticipo sobre una cita activa. Sin PIN (addendum 2026-11-05). */
export const anticipoInputSchema = z.object({
  citaId: z.string().min(1),
  lineas: z.array(lineaPagoSchema).min(1, "Agrega al menos un pago."),
  sinComprobanteAceptado: z.boolean().optional(),
  /** Comprobante elegido con `archivos:elegirComprobante`; el main lo guarda al registrar. */
  comprobanteToken: z.string().min(1).optional(),
});
export type AnticipoInput = z.infer<typeof anticipoInputSchema>;

/** FR-006 / BR-009: cancelar un pago siempre pide PIN y motivo. */
export const cancelarPagoInputSchema = z.object({
  pagoId: z.string().min(1),
  motivo: z.string().trim().min(3, "Escribe el motivo de la cancelación."),
  pin: z.string().min(1, "Escribe el PIN de acceso."),
});
export type CancelarPagoInput = z.infer<typeof cancelarPagoInputSchema>;

export const recetaItemSchema = z.object({
  productoId: z.string().min(1),
  cantidadSugerida: z.number().positive(),
});
export type RecetaItemInput = z.infer<typeof recetaItemSchema>;

export const guardarRecetaInputSchema = z.object({
  servicioCatalogoId: z.string().min(1),
  items: z.array(recetaItemSchema).default([]),
});
export type GuardarRecetaInput = z.infer<typeof guardarRecetaInputSchema>;

export const rangoFechasSchema = z.object({
  fechaDesde: z.string().min(1),
  fechaHasta: z.string().min(1),
});
export type RangoFechas = z.infer<typeof rangoFechasSchema>;

export const resumenFiltroSchema = z.object({
  fechaDesde: z.string().min(1),
  fechaHasta: z.string().min(1),
  comparacion: z.enum(["ninguna", "anterior", "mes_anterior", "anio_anterior"]).default("anterior"),
});
export type ResumenFiltro = z.infer<typeof resumenFiltroSchema>;

/** Tipos de exportación a CSV disponibles (un archivo por tipo). */
export const exportCsvTipoSchema = z.enum([
  "finanzas",
  "servicios",
  "clientes",
  "agenda",
  "inventario_reporte",
  "inventario_stock",
  "movimientos",
]);
export type ExportCsvTipo = z.infer<typeof exportCsvTipoSchema>;

export const establecerEstadoHallazgoInputSchema = z.object({
  hallazgoId: z.string().min(1),
  fechaDesde: z.string().min(1),
  fechaHasta: z.string().min(1),
  estado: z.enum(["nuevo", "revisado", "en_seguimiento", "resuelto", "descartado"]),
});
export type EstablecerEstadoHallazgoInput = z.infer<typeof establecerEstadoHallazgoInputSchema>;

export const bitacoraFiltroSchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  accion: z.string().optional(),
  limite: z.number().int().positive().max(500).default(200),
});
export type BitacoraFiltro = z.infer<typeof bitacoraFiltroSchema>;

export const movimientosFiltroSchema = z.object({
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  productoIds: z.array(z.string()).optional(),
  loteId: z.string().optional(),
  clienteId: z.string().optional(),
  proveedorId: z.string().optional(),
  tipos: z.array(z.string()).optional(),
});
export type MovimientosFiltro = z.infer<typeof movimientosFiltroSchema>;
