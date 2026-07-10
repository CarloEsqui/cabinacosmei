CREATE TABLE `alertas` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo_alerta` text NOT NULL,
	`prioridad` text DEFAULT 'media' NOT NULL,
	`fecha_generacion` integer DEFAULT (unixepoch()) NOT NULL,
	`fecha_evento` text,
	`entidad_tipo` text,
	`entidad_id` text,
	`estatus` text DEFAULT 'activa' NOT NULL,
	`accion_sugerida` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `archivos` (
	`id` text PRIMARY KEY NOT NULL,
	`entidad_tipo` text NOT NULL,
	`entidad_id` text NOT NULL,
	`nombre_original` text NOT NULL,
	`nombre_guardado` text NOT NULL,
	`ruta_fisica` text NOT NULL,
	`tipo_mime` text,
	`categoria` text,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `bitacora` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` text,
	`accion` text NOT NULL,
	`entidad_tipo` text,
	`entidad_id` text,
	`detalle` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `citas` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` text NOT NULL,
	`servicio_catalogo_id` text,
	`fecha` text NOT NULL,
	`hora` text NOT NULL,
	`duracion_min` integer DEFAULT 60,
	`estado` text DEFAULT 'programada' NOT NULL,
	`origen` text,
	`es_mantenimiento` integer DEFAULT false NOT NULL,
	`servicio_origen_id` text,
	`profesional_id` text,
	`notas` text,
	`recordatorio_activo` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`servicio_catalogo_id`) REFERENCES `servicios_catalogo`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`servicio_origen_id`) REFERENCES `servicios_realizados`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profesional_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo_cliente` text NOT NULL,
	`nombre_completo` text NOT NULL,
	`telefono` text,
	`correo` text,
	`fecha_nacimiento` text,
	`direccion` text,
	`contacto_emergencia` text,
	`fecha_alta` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`notas` text,
	`observaciones` text,
	`carpeta_path` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_codigo_cliente_unique` ON `clientes` (`codigo_cliente`);--> statement-breakpoint
CREATE TABLE `configuracion` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entradas_inventario` (
	`id` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`folio` text,
	`proveedor_id` text,
	`producto_id` text NOT NULL,
	`lote_id` text NOT NULL,
	`cantidad` real NOT NULL,
	`costo_unitario` real DEFAULT 0,
	`total` real DEFAULT 0,
	`numero_factura` text,
	`metodo_pago` text,
	`usuario_id` text,
	`observaciones` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lote_id`) REFERENCES `lotes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `lotes` (
	`id` text PRIMARY KEY NOT NULL,
	`producto_id` text NOT NULL,
	`proveedor_id` text,
	`numero_lote` text,
	`fecha_compra` text,
	`fecha_entrada` text,
	`fecha_caducidad` text,
	`cantidad_inicial` real NOT NULL,
	`cantidad_disponible` real NOT NULL,
	`costo_unitario_lote` real DEFAULT 0,
	`ubicacion` text,
	`estado` text DEFAULT 'activo' NOT NULL,
	`notas` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `movimientos` (
	`id` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`producto_id` text,
	`lote_id` text,
	`cantidad` real NOT NULL,
	`referencia_tipo` text,
	`referencia_id` text,
	`cliente_id` text,
	`proveedor_id` text,
	`usuario_id` text,
	`observaciones` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lote_id`) REFERENCES `lotes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `pagos` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` text NOT NULL,
	`servicio_realizado_id` text,
	`fecha` text NOT NULL,
	`monto` real NOT NULL,
	`metodo_pago` text NOT NULL,
	`referencia` text,
	`estatus` text DEFAULT 'cobrado' NOT NULL,
	`usuario_id` text,
	`comprobante_archivo_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`servicio_realizado_id`) REFERENCES `servicios_realizados`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`comprobante_archivo_id`) REFERENCES `archivos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `productos` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text,
	`nombre` text NOT NULL,
	`linea` text,
	`tipo_producto_id` text,
	`unidad_medida` text,
	`proveedor_principal_id` text,
	`costo_base` real DEFAULT 0,
	`precio_venta` real DEFAULT 0,
	`stock_minimo_manual` real,
	`ubicacion` text,
	`presentacion` text,
	`activo` integer DEFAULT true NOT NULL,
	`observaciones` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tipo_producto_id`) REFERENCES `tipos_producto`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proveedor_principal_id`) REFERENCES `proveedores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productos_sku_unique` ON `productos` (`sku`);--> statement-breakpoint
CREATE TABLE `proveedores` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre_comercial` text NOT NULL,
	`razon_social` text,
	`contacto` text,
	`telefono` text,
	`correo` text,
	`rfc` text,
	`dias_credito` integer DEFAULT 0,
	`categoria` text,
	`activo` integer DEFAULT true NOT NULL,
	`notas` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `respaldos_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ruta_archivo` text NOT NULL,
	`tamanio_bytes` integer,
	`estatus` text DEFAULT 'ok' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `salidas_inventario` (
	`id` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`folio` text,
	`producto_id` text NOT NULL,
	`lote_id` text NOT NULL,
	`tipo_salida` text NOT NULL,
	`cantidad` real NOT NULL,
	`costo_unitario` real DEFAULT 0,
	`valor` real DEFAULT 0,
	`cliente_id` text,
	`servicio_realizado_id` text,
	`usuario_id` text,
	`observaciones` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lote_id`) REFERENCES `lotes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`servicio_realizado_id`) REFERENCES `servicios_realizados`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `servicios_catalogo` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`categoria_servicio` text,
	`duracion_estimada_min` integer,
	`precio_sugerido` real,
	`periodicidad_mantenimiento_dias` integer,
	`activo` integer DEFAULT true NOT NULL,
	`descripcion` text,
	`notas_internas` text,
	`consume_inventario` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `servicios_catalogo_productos` (
	`id` text PRIMARY KEY NOT NULL,
	`servicio_catalogo_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`cantidad_sugerida` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`servicio_catalogo_id`) REFERENCES `servicios_catalogo`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `servicios_productos_consumidos` (
	`id` text PRIMARY KEY NOT NULL,
	`servicio_realizado_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`lote_id` text NOT NULL,
	`cantidad` real NOT NULL,
	`salida_inventario_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`servicio_realizado_id`) REFERENCES `servicios_realizados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`lote_id`) REFERENCES `lotes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`salida_inventario_id`) REFERENCES `salidas_inventario`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `servicios_realizados` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo_servicio` text NOT NULL,
	`cliente_id` text NOT NULL,
	`servicio_catalogo_id` text NOT NULL,
	`cita_id` text,
	`fecha` text NOT NULL,
	`hora` text,
	`profesional_id` text,
	`precio` real DEFAULT 0,
	`estatus_pago` text DEFAULT 'pendiente' NOT NULL,
	`estatus` text DEFAULT 'abierto' NOT NULL,
	`observaciones` text,
	`proxima_cita_sugerida` text,
	`carpeta_path` text,
	`cerrado_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`servicio_catalogo_id`) REFERENCES `servicios_catalogo`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cita_id`) REFERENCES `citas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profesional_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servicios_realizados_codigo_servicio_unique` ON `servicios_realizados` (`codigo_servicio`);--> statement-breakpoint
CREATE TABLE `tipos_producto` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre_tipo` text NOT NULL,
	`requiere_caducidad` integer DEFAULT true NOT NULL,
	`se_consume_en_servicio` integer DEFAULT false NOT NULL,
	`se_vende` integer DEFAULT false NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`pin_hash` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
