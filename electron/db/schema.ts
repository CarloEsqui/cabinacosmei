import { sqliteTable, text, integer, real, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

// ---------------------------------------------------------------------------
// Usuarios y configuración
// ---------------------------------------------------------------------------

export const usuarios = sqliteTable("usuarios", {
  id: id(),
  nombre: text("nombre").notNull(),
  pinHash: text("pin_hash").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const configuracion = sqliteTable("configuracion", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(), // JSON serializado
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Catálogos configurables
// ---------------------------------------------------------------------------

export const proveedores = sqliteTable("proveedores", {
  id: id(),
  nombreComercial: text("nombre_comercial").notNull(),
  razonSocial: text("razon_social"),
  contacto: text("contacto"),
  telefono: text("telefono"),
  correo: text("correo"),
  rfc: text("rfc"),
  diasCredito: integer("dias_credito").default(0),
  categoria: text("categoria"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  notas: text("notas"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tiposProducto = sqliteTable("tipos_producto", {
  id: id(),
  nombreTipo: text("nombre_tipo").notNull(),
  requiereCaducidad: integer("requiere_caducidad", { mode: "boolean" }).notNull().default(true),
  seConsumeEnServicio: integer("se_consume_en_servicio", { mode: "boolean" }).notNull().default(false),
  seVende: integer("se_vende", { mode: "boolean" }).notNull().default(false),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const serviciosCatalogo = sqliteTable("servicios_catalogo", {
  id: id(),
  nombre: text("nombre").notNull(),
  categoriaServicio: text("categoria_servicio"),
  duracionEstimadaMin: integer("duracion_estimada_min"),
  precioSugerido: real("precio_sugerido"),
  periodicidadMantenimientoDias: integer("periodicidad_mantenimiento_dias"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  descripcion: text("descripcion"),
  notasInternas: text("notas_internas"),
  consumeInventario: integer("consume_inventario", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Productos consumidos "por defecto" al realizar un servicio del catálogo (sugerencia automática)
export const serviciosCatalogoProductos = sqliteTable("servicios_catalogo_productos", {
  id: id(),
  servicioCatalogoId: text("servicio_catalogo_id")
    .notNull()
    .references(() => serviciosCatalogo.id, { onDelete: "cascade" }),
  productoId: text("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  cantidadSugerida: real("cantidad_sugerida").notNull().default(1),
});

// ---------------------------------------------------------------------------
// Productos e inventario por lotes
// ---------------------------------------------------------------------------

export const productos = sqliteTable("productos", {
  id: id(),
  sku: text("sku").unique(),
  nombre: text("nombre").notNull(),
  linea: text("linea"),
  tipoProductoId: text("tipo_producto_id").references(() => tiposProducto.id, {
    onDelete: "restrict",
  }),
  unidadMedida: text("unidad_medida"),
  proveedorPrincipalId: text("proveedor_principal_id").references(() => proveedores.id, {
    onDelete: "set null",
  }),
  costoBase: real("costo_base").default(0),
  precioVenta: real("precio_venta").default(0),
  stockMinimoManual: real("stock_minimo_manual"),
  ubicacion: text("ubicacion"),
  presentacion: text("presentacion"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  observaciones: text("observaciones"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const lotes = sqliteTable("lotes", {
  id: id(),
  productoId: text("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  proveedorId: text("proveedor_id").references(() => proveedores.id, { onDelete: "set null" }),
  numeroLote: text("numero_lote"),
  fechaCompra: text("fecha_compra"), // ISO date (YYYY-MM-DD)
  fechaEntrada: text("fecha_entrada"),
  fechaCaducidad: text("fecha_caducidad"),
  cantidadInicial: real("cantidad_inicial").notNull(),
  cantidadDisponible: real("cantidad_disponible").notNull(),
  costoUnitarioLote: real("costo_unitario_lote").default(0),
  ubicacion: text("ubicacion"),
  estado: text("estado").notNull().default("activo"), // activo | agotado | caducado | bloqueado
  notas: text("notas"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Entradas / salidas / movimientos
// ---------------------------------------------------------------------------

export const entradasInventario = sqliteTable("entradas_inventario", {
  id: id(),
  fecha: text("fecha").notNull(),
  folio: text("folio"),
  proveedorId: text("proveedor_id").references(() => proveedores.id, { onDelete: "set null" }),
  productoId: text("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  loteId: text("lote_id")
    .notNull()
    .references(() => lotes.id, { onDelete: "restrict" }),
  cantidad: real("cantidad").notNull(),
  costoUnitario: real("costo_unitario").default(0),
  total: real("total").default(0),
  numeroFactura: text("numero_factura"),
  metodoPago: text("metodo_pago"),
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  observaciones: text("observaciones"),
  createdAt: createdAt(),
});

export const salidasInventario = sqliteTable("salidas_inventario", {
  id: id(),
  fecha: text("fecha").notNull(),
  folio: text("folio"),
  productoId: text("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  loteId: text("lote_id")
    .notNull()
    .references(() => lotes.id, { onDelete: "restrict" }),
  tipoSalida: text("tipo_salida").notNull(), // venta | consumo_servicio | merma | devolucion | uso_interno | ajuste
  cantidad: real("cantidad").notNull(),
  costoUnitario: real("costo_unitario").default(0),
  valor: real("valor").default(0),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  servicioRealizadoId: text("servicio_realizado_id").references(() => serviciosRealizados.id, {
    onDelete: "set null",
  }),
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  observaciones: text("observaciones"),
  createdAt: createdAt(),
});

export const movimientos = sqliteTable("movimientos", {
  id: id(),
  fecha: text("fecha").notNull(),
  tipo: text("tipo").notNull(), // entrada | salida | ajuste | merma | devolucion | consumo_servicio
  productoId: text("producto_id").references(() => productos.id, { onDelete: "set null" }),
  loteId: text("lote_id").references(() => lotes.id, { onDelete: "set null" }),
  cantidad: real("cantidad").notNull(),
  referenciaTipo: text("referencia_tipo"), // entrada_inventario | salida_inventario
  referenciaId: text("referencia_id"),
  clienteId: text("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
  proveedorId: text("proveedor_id").references(() => proveedores.id, { onDelete: "set null" }),
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  observaciones: text("observaciones"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export const clientes = sqliteTable("clientes", {
  id: id(),
  codigoCliente: text("codigo_cliente").notNull().unique(), // CL-0001
  nombreCompleto: text("nombre_completo").notNull(),
  telefono: text("telefono"),
  correo: text("correo"),
  fechaNacimiento: text("fecha_nacimiento"),
  direccion: text("direccion"),
  contactoEmergencia: text("contacto_emergencia"),
  fechaAlta: text("fecha_alta").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  notas: text("notas"),
  observaciones: text("observaciones"),
  carpetaPath: text("carpeta_path"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Servicios realizados y su consumo de inventario
// ---------------------------------------------------------------------------

export const serviciosRealizados = sqliteTable("servicios_realizados", {
  id: id(),
  codigoServicio: text("codigo_servicio").notNull().unique(), // SRV-0001
  clienteId: text("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "restrict" }),
  servicioCatalogoId: text("servicio_catalogo_id")
    .notNull()
    .references(() => serviciosCatalogo.id, { onDelete: "restrict" }),
  citaId: text("cita_id").references((): AnySQLiteColumn => citas.id, { onDelete: "set null" }),
  fecha: text("fecha").notNull(),
  hora: text("hora"),
  profesionalId: text("profesional_id").references(() => usuarios.id, { onDelete: "set null" }),
  precio: real("precio").default(0),
  estatusPago: text("estatus_pago").notNull().default("pendiente"), // pagado | parcial | pendiente | cancelado
  estatus: text("estatus").notNull().default("abierto"), // abierto | cerrado (candado de comprobante)
  observaciones: text("observaciones"),
  proximaCitaSugerida: text("proxima_cita_sugerida"),
  carpetaPath: text("carpeta_path"),
  cerradoAt: integer("cerrado_at", { mode: "timestamp" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const serviciosProductosConsumidos = sqliteTable("servicios_productos_consumidos", {
  id: id(),
  servicioRealizadoId: text("servicio_realizado_id")
    .notNull()
    .references(() => serviciosRealizados.id, { onDelete: "cascade" }),
  productoId: text("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  loteId: text("lote_id")
    .notNull()
    .references(() => lotes.id, { onDelete: "restrict" }),
  cantidad: real("cantidad").notNull(),
  salidaInventarioId: text("salida_inventario_id").references(() => salidasInventario.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Cobranza
// ---------------------------------------------------------------------------

export const pagos = sqliteTable("pagos", {
  id: id(),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "restrict" }),
  servicioRealizadoId: text("servicio_realizado_id").references(() => serviciosRealizados.id, {
    onDelete: "set null",
  }),
  fecha: text("fecha").notNull(),
  monto: real("monto").notNull(),
  metodoPago: text("metodo_pago").notNull(),
  referencia: text("referencia"),
  estatus: text("estatus").notNull().default("cobrado"), // cobrado | cancelado
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  comprobanteArchivoId: text("comprobante_archivo_id").references(() => archivos.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export const citas = sqliteTable("citas", {
  id: id(),
  clienteId: text("cliente_id")
    .notNull()
    .references(() => clientes.id, { onDelete: "restrict" }),
  servicioCatalogoId: text("servicio_catalogo_id").references(() => serviciosCatalogo.id, {
    onDelete: "set null",
  }),
  fecha: text("fecha").notNull(),
  hora: text("hora").notNull(),
  duracionMin: integer("duracion_min").default(60),
  estado: text("estado").notNull().default("programada"), // programada | confirmada | asistio | no_asistio | cancelada | reagendada
  origen: text("origen"), // manual | mantenimiento_auto
  esMantenimiento: integer("es_mantenimiento", { mode: "boolean" }).notNull().default(false),
  servicioOrigenId: text("servicio_origen_id").references(
    (): AnySQLiteColumn => serviciosRealizados.id,
    { onDelete: "set null" },
  ),
  profesionalId: text("profesional_id").references(() => usuarios.id, { onDelete: "set null" }),
  notas: text("notas"),
  recordatorioActivo: integer("recordatorio_activo", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

export const archivos = sqliteTable("archivos", {
  id: id(),
  entidadTipo: text("entidad_tipo").notNull(), // cliente | servicio_realizado | pago | entrada | producto
  entidadId: text("entidad_id").notNull(),
  nombreOriginal: text("nombre_original").notNull(),
  nombreGuardado: text("nombre_guardado").notNull(),
  rutaFisica: text("ruta_fisica").notNull(),
  tipoMime: text("tipo_mime"),
  categoria: text("categoria"), // comprobante | foto | documento | factura
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export const alertas = sqliteTable("alertas", {
  id: id(),
  tipoAlerta: text("tipo_alerta").notNull(), // cita_proxima | mantenimiento_no_programado | stock_bajo | caducidad
  prioridad: text("prioridad").notNull().default("media"), // alta | media | baja
  fechaGeneracion: integer("fecha_generacion", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  fechaEvento: text("fecha_evento"),
  entidadTipo: text("entidad_tipo"),
  entidadId: text("entidad_id"),
  estatus: text("estatus").notNull().default("activa"), // activa | resuelta | descartada
  accionSugerida: text("accion_sugerida"),
  metadataJson: text("metadata_json"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Auditoría y respaldos
// ---------------------------------------------------------------------------

export const bitacora = sqliteTable("bitacora", {
  id: id(),
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  accion: text("accion").notNull(),
  entidadTipo: text("entidad_tipo"),
  entidadId: text("entidad_id"),
  detalle: text("detalle"),
  createdAt: createdAt(),
});

export const respaldosLog = sqliteTable("respaldos_log", {
  id: id(),
  rutaArchivo: text("ruta_archivo").notNull(),
  tamanioBytes: integer("tamanio_bytes"),
  estatus: text("estatus").notNull().default("ok"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Corte de caja
// ---------------------------------------------------------------------------

export const cortes = sqliteTable("cortes", {
  id: id(),
  fecha: text("fecha").notNull(),
  hora: text("hora").notNull(),
  desglosePorMetodoJson: text("desglose_por_metodo_json").notNull(), // { "Efectivo": 500, "Tarjeta": 300 }
  total: real("total").notNull(),
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Estado de los hallazgos automáticos de Reportes (Centro de atención)
// ---------------------------------------------------------------------------

// Un hallazgo es de un TIPO (ej. "clientas_riesgo") calculado de nuevo en cada periodo, no una
// entidad con id propio — por eso el estado se guarda por combinación (tipo, rango de fechas): así
// "descartar" el aviso de cartera de julio no oculta el mismo tipo de aviso si reaparece en agosto
// con cifras distintas.
export const hallazgosEstado = sqliteTable("hallazgos_estado", {
  id: id(),
  clave: text("clave").notNull().unique(), // `${hallazgoId}|${fechaDesde}|${fechaHasta}`
  hallazgoId: text("hallazgo_id").notNull(),
  fechaDesde: text("fecha_desde").notNull(),
  fechaHasta: text("fecha_hasta").notNull(),
  estado: text("estado").notNull(), // nuevo | revisado | en_seguimiento | resuelto | descartado
  usuarioId: text("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
