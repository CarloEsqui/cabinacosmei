-- =============================================================================
-- 0008_venta_mostrador.sql — Bellora Dashboard — Un producto vendido sin cita entra con su dinero
-- al corte, a ventas y al margen, y no solo sale del inventario
-- =============================================================================
-- CONTEXTO Y EVIDENCIA
-- Hoy un producto solo se vende con dinero dentro del cierre de una cita
-- (electron/services/serviciosRealizados.ts, cerrarCita). Sin cita, lo único que existe es
-- Inventario → Salida → tipo "Venta" (src/components/inventario/SalidaForm.tsx →
-- inventario.registrarSalida), que descuenta stock sin precio ni pago: el dinero entra a la caja
-- pero no a la app (DIN-A5, .notes/auditoria-dinero-2026-11-03.md).
-- Spec: .notes/spec-venta-mostrador-2026-11-06.md (§20 decisiones del dueño, §22 diseño técnico).
-- Gate: .notes/gate-001-venta-mostrador-2026-11-06.md (PASS WITH CONDITIONS, 13 condiciones).
--
--   Caso real: una clienta de paso compra una crema de $250 en efectivo. La cosmetóloga registra
--   la salida tipo Venta; el stock baja, pero el corte del día pide $250 menos de lo que hay en la
--   caja y las ventas del mes no incluyen la crema. Caso inverso: si no registra la salida, el
--   stock queda mayor que el real.
--
-- Precedente: el ticket de la cita ya es cabecera (servicios_realizados) + líneas
-- (salidas_inventario con precio_unitario_venta, 0005) + pagos + descuentos (0006). La venta de
-- mostrador repite esa forma con su propia cabecera.
--
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA
-- -----------------------------------------------------------------------------
--   A) Tabla nueva ventas_mostrador: cabecera de la venta (folio VTA-#### único, fecha,
--      cliente_id OPCIONAL restrict, nombre_referencia, total_productos, caché descuento,
--      estatus_pago derivado, estatus vigente|cancelada, datos de cancelación). Se crea ANTES de
--      recrear pagos y descuentos, que la referencian (Gate, condición 2a).
--   B) pagos se RECREA (SQLite no altera columnas):
--        * cliente_id pasa a NULLABLE (sigue ON DELETE restrict). Un pago de venta sin clienta
--          ("Público general") no tiene clienta.
--        * venta_mostrador_id nuevo, nullable, ON DELETE restrict.
--        * servicio_realizado_id pasa de set null a RESTRICT: cierra COB-M1, que la auditoría del
--          cobro asignó a "la migración que recree pagos". Seguro: el único borrado de
--          servicios_realizados (citas.ts, borradores) ocurre sin pagos.
--        * Los tres índices (servicio_realizado, cita, corte) se vuelven a crear tras el RENAME.
--   C) descuentos_servicio se RECREA: servicio_realizado_id pasa a nullable, venta_mostrador_id
--      nuevo (restrict), CHECK "exactamente uno de los dos", y un SEGUNDO índice único parcial por
--      venta (el de la 0006 no restringe filas con servicio NULL: SQLite trata los NULL como
--      distintos). Conserva los dos CHECK numéricos y los dos índices de la 0006.
--   D) salidas_inventario.venta_mostrador_id: ALTER TABLE ADD, nullable, ON DELETE restrict.
--
-- NO se toca ninguna fila: ningún UPDATE ni backfill. Las salidas tipo venta viejas quedan
-- sin venta (venta_mostrador_id NULL) y se siguen viendo igual en Inventario.
--
-- -----------------------------------------------------------------------------
-- DECISIONES DELIBERADAS (para que nadie las "arregle" por accidente)
-- -----------------------------------------------------------------------------
--   1) SIN CHECK de "un pago tiene clienta" (BR-002). La regla vive en
--      cobros.registrarPagosEnTx (escritor único) y en zod. La Parte B (venta_tarjeta, 0009)
--      escribe pagos sin clienta y sin venta; con un CHECK tendría que recrear pagos otra vez en
--      la máquina de la clienta (Gate, condición 3). Tampoco hay CHECK sobre concepto/estatus:
--      convención de 0004–0006.
--   2) CORREGIDO A MANO el INSERT … SELECT que generó drizzle-kit 0.31 en las dos
--      recreaciones: listaba la columna NUEVA venta_mostrador_id también en el SELECT de la
--      tabla vieja, donde no existe. Con better-sqlite3 eso falla con
--      'no such column: "venta_mostrador_id"' y revierte TODO el lote 0004–0008 al abrir la app
--      (probado el 2026-11-06 con el better-sqlite3 del proyecto). La columna se omite del INSERT
--      y nace NULL. Si se regenera esta migración, repetir la corrección.
--   3) ON DELETE restrict agregado a mano en el ALTER de salidas_inventario (drizzle-kit lo
--      omite en ADD COLUMN; mismo arreglo que 0005, decisión 2).
--   4) Los PRAGMA foreign_keys=OFF/ON que emite drizzle-kit son NO-OP: el migrador corre todas
--      las migraciones pendientes dentro de un solo BEGIN (drizzle-orm sqlite-core dialect) y
--      SQLite ignora ese PRAGMA dentro de una transacción. La recreación corre con FK ACTIVAS.
--      Es correcta solo porque ninguna tabla tiene FK hacia pagos ni hacia descuentos_servicio,
--      y porque las filas copiadas ya cumplen sus FK. Si una fila real de pagos apuntara a algo
--      inexistente, el lote entero se revierte y la app no abre (los datos quedan intactos y
--      existe la copia cabina_antes_de_migrar_*). La radiografía de la condición 13a lo mide
--      ANTES del release con PRAGMA foreign_key_check sobre una copia del respaldo real.
--   5) Los CHECK de descuentos_servicio salen calificados con "__new_descuentos_servicio"; el
--      RENAME de SQLite los reescribe a "descuentos_servicio" y siguen vigentes (probado).
--   6) El nombre descuentos_servicio se conserva aunque ahora también guarde descuentos de
--      ventas: renombrarla sería otra recreación sin valor (Gate, riesgo aceptado).
--   7) Una venta nunca se borra: se cancela (PROJECT.md, superficie Dinero; CFF art. 30). Todas
--      las FK hacia ventas_mostrador son restrict.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO RESUELVE
-- -----------------------------------------------------------------------------
-- El esquema solo da lugar a la venta. Lo que la hace correcta es código de la misma versión:
--   * electron/services/ventasMostrador.ts (nuevo): cabecera, folio, transacción única.
--   * electron/services/cobros.ts: BR-002 en registrarPagosEnTx; destino venta en estatus,
--     descuentos, abono y cancelación; saldosPorCliente y descuentosDelRango.
--   * electron/services/inventario.ts: cancelarSalidaEnTx agrupa por venta; registrarSalida
--     rechaza tipo venta (src/components/inventario/SalidaForm.tsx deja de ofrecerlo).
--   * Reportes (reportesResumen, reportesFinanzas, reportesClientesDetalle) vía ventasDelRango.
--   * electron/services/reinicio.ts: ventas_mostrador en TABLAS_NEGOCIO.
-- Un release ANTERIOR a esta migración no ve las ventas y leería pagos con cliente_id NULL: no se
-- hace rollback de versión una vez aplicada (riesgo del Gate).
--
-- -----------------------------------------------------------------------------
-- ORDEN DE APLICACIÓN
-- -----------------------------------------------------------------------------
-- 0004 → 0005 → 0006 → 0007 → esta. La instalación real está en la 0003 y recibe las cinco en el
-- mismo arranque. TRANSACCIÓN: el migrador de drizzle (electron/db/index.ts, migrate()) aplica
-- todas las pendientes en un solo BEGIN; antes, electron/db/index.ts copia la BD a
-- cabina_antes_de_migrar_<fecha>.sqlite3.
-- Convenciones: idénticas a 0004–0007 (español, valores de enum en zod, nunca borrar dinero).
-- =============================================================================

-- A) ventas_mostrador · B) pagos (recreada) · C) descuentos_servicio (recreada) · D) salidas
CREATE TABLE `ventas_mostrador` (
	`id` text PRIMARY KEY NOT NULL,
	`folio` text NOT NULL,
	`fecha` text NOT NULL,
	`cliente_id` text,
	`nombre_referencia` text,
	`total_productos` real DEFAULT 0 NOT NULL,
	`descuento` real DEFAULT 0 NOT NULL,
	`estatus_pago` text DEFAULT 'pendiente' NOT NULL,
	`estatus` text DEFAULT 'vigente' NOT NULL,
	`cancelada_at` integer,
	`motivo_cancelacion` text,
	`cancelada_por` text,
	`observaciones` text,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cancelada_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ventas_mostrador_folio_unique` ON `ventas_mostrador` (`folio`);--> statement-breakpoint
CREATE INDEX `ventas_mostrador_cliente_idx` ON `ventas_mostrador` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `ventas_mostrador_fecha_idx` ON `ventas_mostrador` (`fecha`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pagos` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` text,
	`servicio_realizado_id` text,
	`venta_mostrador_id` text,
	`fecha` text NOT NULL,
	`monto` real NOT NULL,
	`metodo_pago` text NOT NULL,
	`referencia` text,
	`estatus` text DEFAULT 'cobrado' NOT NULL,
	`usuario_id` text,
	`comprobante_archivo_id` text,
	`concepto` text DEFAULT 'servicio' NOT NULL,
	`fuente` text DEFAULT 'dinero' NOT NULL,
	`cita_id` text,
	`corte_id` text,
	`cancelado_at` integer,
	`motivo_cancelacion` text,
	`cancelado_por` text,
	`corte_cancelacion_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`servicio_realizado_id`) REFERENCES `servicios_realizados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`venta_mostrador_id`) REFERENCES `ventas_mostrador`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`comprobante_archivo_id`) REFERENCES `archivos`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cita_id`) REFERENCES `citas`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corte_id`) REFERENCES `cortes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corte_cancelacion_id`) REFERENCES `cortes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_pagos`("id", "cliente_id", "servicio_realizado_id", "fecha", "monto", "metodo_pago", "referencia", "estatus", "usuario_id", "comprobante_archivo_id", "concepto", "fuente", "cita_id", "corte_id", "cancelado_at", "motivo_cancelacion", "cancelado_por", "corte_cancelacion_id", "created_at") SELECT "id", "cliente_id", "servicio_realizado_id", "fecha", "monto", "metodo_pago", "referencia", "estatus", "usuario_id", "comprobante_archivo_id", "concepto", "fuente", "cita_id", "corte_id", "cancelado_at", "motivo_cancelacion", "cancelado_por", "corte_cancelacion_id", "created_at" FROM `pagos`;--> statement-breakpoint
DROP TABLE `pagos`;--> statement-breakpoint
ALTER TABLE `__new_pagos` RENAME TO `pagos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `pagos_servicio_realizado_idx` ON `pagos` (`servicio_realizado_id`);--> statement-breakpoint
CREATE INDEX `pagos_cita_idx` ON `pagos` (`cita_id`);--> statement-breakpoint
CREATE INDEX `pagos_corte_idx` ON `pagos` (`corte_id`);--> statement-breakpoint
CREATE TABLE `__new_descuentos_servicio` (
	`id` text PRIMARY KEY NOT NULL,
	`servicio_realizado_id` text,
	`venta_mostrador_id` text,
	`tipo` text DEFAULT 'manual' NOT NULL,
	`aplica_a` text NOT NULL,
	`modo` text NOT NULL,
	`valor` real NOT NULL,
	`base` real NOT NULL,
	`monto` real NOT NULL,
	`motivo` text NOT NULL,
	`motivo_detalle` text,
	`estatus` text DEFAULT 'aplicado' NOT NULL,
	`cancelado_at` integer,
	`motivo_cancelacion` text,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`servicio_realizado_id`) REFERENCES `servicios_realizados`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`venta_mostrador_id`) REFERENCES `ventas_mostrador`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "descuentos_servicio_destino_ck" CHECK(("__new_descuentos_servicio"."servicio_realizado_id" IS NOT NULL) + ("__new_descuentos_servicio"."venta_mostrador_id" IS NOT NULL) = 1),
	CONSTRAINT "descuentos_servicio_valor_ck" CHECK("__new_descuentos_servicio"."valor" > 0),
	CONSTRAINT "descuentos_servicio_monto_ck" CHECK("__new_descuentos_servicio"."monto" > 0 AND "__new_descuentos_servicio"."monto" <= "__new_descuentos_servicio"."base")
);
--> statement-breakpoint
INSERT INTO `__new_descuentos_servicio`("id", "servicio_realizado_id", "tipo", "aplica_a", "modo", "valor", "base", "monto", "motivo", "motivo_detalle", "estatus", "cancelado_at", "motivo_cancelacion", "usuario_id", "created_at") SELECT "id", "servicio_realizado_id", "tipo", "aplica_a", "modo", "valor", "base", "monto", "motivo", "motivo_detalle", "estatus", "cancelado_at", "motivo_cancelacion", "usuario_id", "created_at" FROM `descuentos_servicio`;--> statement-breakpoint
DROP TABLE `descuentos_servicio`;--> statement-breakpoint
ALTER TABLE `__new_descuentos_servicio` RENAME TO `descuentos_servicio`;--> statement-breakpoint
CREATE INDEX `descuentos_servicio_servicio_idx` ON `descuentos_servicio` (`servicio_realizado_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `descuentos_servicio_manual_vigente_uq` ON `descuentos_servicio` (`servicio_realizado_id`,`aplica_a`) WHERE estatus = 'aplicado' AND tipo = 'manual';--> statement-breakpoint
CREATE UNIQUE INDEX `descuentos_servicio_venta_manual_vigente_uq` ON `descuentos_servicio` (`venta_mostrador_id`,`aplica_a`) WHERE estatus = 'aplicado' AND tipo = 'manual';--> statement-breakpoint
ALTER TABLE `salidas_inventario` ADD `venta_mostrador_id` text REFERENCES ventas_mostrador(id) ON DELETE restrict;

-- =============================================================================
-- VERIFICACIÓN MANUAL (después de aplicar; sobre una COPIA, nunca sobre la BD real de la cabina)
-- =============================================================================
-- 1) Estructura
--    SELECT "from", "table", on_delete FROM pragma_foreign_key_list('pagos') ORDER BY "from";
--    -- Esperado: cliente_id→clientes RESTRICT; servicio_realizado_id→servicios_realizados
--    --   RESTRICT; venta_mostrador_id→ventas_mostrador RESTRICT; cita_id, corte_id,
--    --   corte_cancelacion_id, cancelado_por RESTRICT; usuario_id, comprobante_archivo_id SET NULL.
--    SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('pagos', 'descuentos_servicio') ORDER BY name;
--    -- Esperado: descuentos_servicio_manual_vigente_uq, descuentos_servicio_servicio_idx,
--    --   descuentos_servicio_venta_manual_vigente_uq, pagos_cita_idx, pagos_corte_idx,
--    --   pagos_servicio_realizado_idx (6 filas).
--    SELECT "notnull" FROM pragma_table_info('pagos') WHERE name = 'cliente_id';
--    -- Esperado: 0
--    SELECT on_delete FROM pragma_foreign_key_list('salidas_inventario') WHERE "from" = 'venta_mostrador_id';
--    -- Esperado: RESTRICT
--
-- 2) Datos intactos (radiografía, Gate condición 13a). ANTES de migrar, en la copia:
--    PRAGMA foreign_key_check;
--    -- Esperado: 0 filas (si hay alguna, la recreación con FK activas fallaría).
--    SELECT estatus, concepto, COUNT(*), ROUND(SUM(monto), 2) FROM pagos GROUP BY 1, 2;
--    SELECT COUNT(*) FROM pagos WHERE corte_id IS NOT NULL;
--    SELECT COUNT(*) FROM pagos WHERE comprobante_archivo_id IS NOT NULL;
--    DESPUÉS de migrar: las mismas consultas.
--    -- Esperado: cifras idénticas; PRAGMA integrity_check → ok; PRAGMA foreign_key_check → 0
--    --   filas; ventas_mostrador 0 filas; pagos.venta_mostrador_id NULL en todas.
--
-- 3) Reglas del esquema (sobre una BD de PRUEBA, dentro de BEGIN … ROLLBACK)
--    BEGIN;
--    INSERT INTO ventas_mostrador (id, folio, fecha) VALUES ('vt', 'VTA-9999', '2026-11-06');
--    INSERT INTO descuentos_servicio (id, venta_mostrador_id, aplica_a, modo, valor, base, monto, motivo)
--      VALUES ('d1', 'vt', 'productos', 'monto', 10, 100, 10, 'otro');
--    INSERT INTO descuentos_servicio (id, venta_mostrador_id, aplica_a, modo, valor, base, monto, motivo)
--      VALUES ('d2', 'vt', 'productos', 'monto', 10, 100, 10, 'otro');
--    -- Esperado: UNIQUE constraint failed (un descuento manual vigente por venta).
--    INSERT INTO descuentos_servicio (id, aplica_a, modo, valor, base, monto, motivo)
--      VALUES ('d3', 'productos', 'monto', 10, 100, 10, 'otro');
--    -- Esperado: CHECK constraint failed: descuentos_servicio_destino_ck (sin destino).
--    INSERT INTO pagos (id, venta_mostrador_id, fecha, monto, metodo_pago, concepto)
--      VALUES ('p1', 'vt', '2026-11-06', 50, 'Efectivo', 'venta_mostrador');
--    -- Esperado: ok (el esquema permite un pago sin clienta; BR-002 lo valida el código).
--    DELETE FROM ventas_mostrador WHERE id = 'vt';
--    -- Esperado: FOREIGN KEY constraint failed (la venta no se borra).
--    ROLLBACK;
--    -- DEJA TODO COMO ESTABA: ROLLBACK.
-- =============================================================================
-- end 0008_venta_mostrador.sql
-- =============================================================================
