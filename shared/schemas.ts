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

export const productoInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  linea: z.string().optional(),
  tipoProductoId: z.string().nullable().optional(),
  unidadMedida: z.string().optional(),
  proveedorPrincipalId: z.string().nullable().optional(),
  costoBase: z.number().nonnegative().default(0),
  precioVenta: z.number().nonnegative().default(0),
  stockMinimoManual: z.number().nonnegative().nullable().optional(),
  ubicacion: z.string().optional(),
  presentacion: z.string().optional(),
  activo: z.boolean().default(true),
  observaciones: z.string().optional(),
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

export const cierreCitaInputSchema = z
  .object({
    servicioRealizadoId: z.string().min(1),
    precio: z.number().nonnegative().default(0),
    productosConsumidos: z.array(productoConsumoSchema).default([]),
    productosVendidos: z.array(productoConsumoSchema).default([]),
    metodoPago: z.string().optional(),
    monto: z.number().nonnegative().default(0),
    estatusPago: z.enum(["pagado", "parcial", "pendiente", "cancelado"]).default("pendiente"),
    observaciones: z.string().optional(),
    pinOverride: z.string().optional(),
  })
  .refine((data) => data.monto <= 0 || !!data.metodoPago, {
    message: "Selecciona un método de pago para registrar el cobro.",
    path: ["metodoPago"],
  });
export type CierreCitaInput = z.infer<typeof cierreCitaInputSchema>;

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
