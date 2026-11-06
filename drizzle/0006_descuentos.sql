-- =============================================================================
-- 0006_descuentos.sql — Bellora Dashboard — Un descuento se registra como descuento, no como un
-- pago menor que la app confunde con adeudo
-- =============================================================================
-- CONTEXTO Y EVIDENCIA
-- La cabina da 15 % en la primera visita. La app no tiene dónde anotarlo: el cierre solo permite
-- editar el precio (src/pages/agenda/CierreCitaModal.tsx, "Precio del servicio") y capturar
-- pagos. Total del ticket = precio + total_productos (electron/services/cobros.ts:50-52); el
-- estatus se deriva de total contra cobrado (cobros.ts:55-59, desde la 0005).
-- Spec: .notes/spec-descuentos-2026-11-06.md. Gate: .notes/gate-001-descuentos-2026-11-06.md
-- (PASS WITH CONDITIONS, 11 condiciones). Radiografía sobre el respaldo real del 2026-11-05
-- (solo conteos; .notes/evidencia-cobro-v2-parte-a-2026-11-05.md, COB-A1).
--
--   Caso real: servicio de primera visita con un precio de $X y un pago del 85 % → la 0005 lo
--   recalcula a "parcial" y la clienta aparece debiendo el 15 % que en realidad fue un regalo.
--   En el respaldo real son 2 servicios ($388 en total). El caso inverso: 4 primeras visitas
--   donde se bajó el PRECIO al 85 % se ven "pagado", pero la venta pierde el rastro de que hubo
--   descuento y por qué.
--
-- Precedente: total_productos (0005) es una caché por servicio que solo escribe cobros.ts y que
-- todos los lectores seleccionan de la misma fila; descuento_servicio / descuento_productos siguen
-- ese patrón. descuentos_servicio es la tabla que la Parte B ya preveía
-- (.notes/spec-modulo-cobro-2026-11-04.md §21.2).
--
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA
-- -----------------------------------------------------------------------------
--   A) Tabla nueva descuentos_servicio: una fila por descuento (servicio_realizado_id, tipo,
--      aplica_a servicio|productos, modo porcentaje|monto, valor, base, monto, motivo,
--      motivo_detalle, estatus aplicado|cancelado, cancelado_at, motivo_cancelacion, usuario_id).
--      Índice único PARCIAL: un solo descuento manual vigente por base (BR-001).
--   B) servicios_realizados.descuento_servicio y .descuento_productos (REAL NOT NULL DEFAULT 0):
--      caché de Σ monto aplicado por base. La escribe solo cobros.ts (Gate, condición 4).
--   El código de la misma versión cambia cobros.totalTicket / saldoServicio / ingresoDelServicio
--   para restarlas; sus tipos de parámetro las exigen, así que typecheck encuentra a cada lector.
--
-- NO se toca: pagos, cortes, citas, ni ninguna fila existente. Ningún backfill.
--
-- -----------------------------------------------------------------------------
-- DECISIONES DELIBERADAS (para que nadie las "arregle" por accidente)
-- -----------------------------------------------------------------------------
--   1) NO RETROACTIVA. Las columnas nacen en 0 y la tabla vacía. La app no puede distinguir un
--      pago menor que fue descuento de un adeudo real; la cosmetóloga corrige cada cita desde el
--      detalle de la cita ("Aplicar descuento", FR-005), con rastro en bitácora. Nunca un UPDATE
--      aquí ni en un script.
--   2) Sin CHECK sobre tipo, aplica_a, modo ni motivo: sus valores viven en zod
--      (shared/schemas.ts) y en cobros.ts, como en 0004 y 0005 (Gate, condición 1). Así la
--      Parte B agrega 'cupon' / 'cortesia' sin recrear la tabla en la máquina de la clienta. Sí
--      hay CHECK numéricos (valor > 0; 0 < monto <= base), que la Parte B también cumple.
--   3) tipo admite valores reservados aunque cupon_id, tarjeta_regalo_id y orden no existen
--      todavía: la Parte B (0008) los agrega con ALTER TABLE ADD nullable. Un descuento 'todo'
--      de la Parte B se guarda como DOS filas, una por base, para que la caché siga siendo
--      Σ monto por base.
--   4) Un descuento nunca se borra: se marca cancelado (FR-006). FK a servicios_realizados con
--      ON DELETE RESTRICT; usuario_id con ON DELETE SET NULL, como pagos.usuario_id.
--   5) El descuento no tiene fecha propia: su fecha de venta es la del servicio (BR-007).
--      Corregir una cita vieja baja las ventas de ese mes; el corte no se mueve (no lee esta tabla).
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO RESUELVE
-- -----------------------------------------------------------------------------
-- - Con esta migración y el código viejo, la app anterior ignora los descuentos: los servicios
--   corregidos volverían a verse "parcial". Revertir = respaldo previo a migrar (DAT-A4).
-- - La caché total_productos no cambia si después se cancela una venta del ticket
--   (cancelarSalida, deuda COB-B4); el descuento de productos hereda esa desincronización.
-- - reinicio.ts (TABLAS_NEGOCIO) incluye la tabla nueva en el código de la misma versión
--   (Gate, condición 8): el reinicio borra con las FK apagadas.
--
-- -----------------------------------------------------------------------------
-- ORDEN DE APLICACIÓN
-- -----------------------------------------------------------------------------
-- 0000 → … → 0004 → 0005 → esta. La instalación real está en 0003 (respaldo del 2026-11-05):
-- recibirá 0004, 0005 y 0006 en el mismo release. La ficha clínica es la 0007 y la Parte B la
-- 0008 (addenda del 2026-11-06).
-- TRANSACCIÓN: el migrador síncrono de drizzle corre todas las pendientes en un solo BEGIN.
-- Antes, electron/db/index.ts:25 (respaldarAntesDeMigrar) copia la BD completa (DAT-A4).
-- Convenciones: idénticas a 0004 y 0005 (español, SQL generado por drizzle-kit 0.31).
-- =============================================================================

-- A) y B) generado por drizzle-kit (npm run db:generate); revisado contra el Gate, condición 2.
CREATE TABLE `descuentos_servicio` (
	`id` text PRIMARY KEY NOT NULL,
	`servicio_realizado_id` text NOT NULL,
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
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "descuentos_servicio_valor_ck" CHECK("descuentos_servicio"."valor" > 0),
	CONSTRAINT "descuentos_servicio_monto_ck" CHECK("descuentos_servicio"."monto" > 0 AND "descuentos_servicio"."monto" <= "descuentos_servicio"."base")
);
--> statement-breakpoint
CREATE INDEX `descuentos_servicio_servicio_idx` ON `descuentos_servicio` (`servicio_realizado_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `descuentos_servicio_manual_vigente_uq` ON `descuentos_servicio` (`servicio_realizado_id`,`aplica_a`) WHERE estatus = 'aplicado' AND tipo = 'manual';--> statement-breakpoint
ALTER TABLE `servicios_realizados` ADD `descuento_servicio` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `servicios_realizados` ADD `descuento_productos` real DEFAULT 0 NOT NULL;

-- =============================================================================
-- VERIFICACIÓN MANUAL (después de aplicar; sobre una COPIA, nunca sobre la BD real)
-- =============================================================================
-- 1) Estructura
--    SELECT COUNT(*) FROM sqlite_master WHERE name = 'descuentos_servicio';
--    -- Esperado: 1
--    SELECT sql FROM sqlite_master WHERE name = 'descuentos_servicio_manual_vigente_uq';
--    -- Esperado: termina en WHERE estatus = 'aplicado' AND tipo = 'manual'
--    SELECT COUNT(*) FROM pragma_table_info('servicios_realizados')
--      WHERE name IN ('descuento_servicio', 'descuento_productos');
--    -- Esperado: 2
--
-- 2) No retroactiva
--    SELECT COUNT(*) FROM servicios_realizados WHERE descuento_servicio <> 0 OR descuento_productos <> 0;
--    -- Esperado: 0
--    SELECT COUNT(*) FROM descuentos_servicio;
--    -- Esperado: 0
--
-- 3) Invariante de la caché (AC-007), después de usar la app
--    SELECT s.id FROM servicios_realizados s
--    WHERE ABS(s.descuento_servicio - COALESCE((SELECT SUM(d.monto) FROM descuentos_servicio d
--            WHERE d.servicio_realizado_id = s.id AND d.estatus = 'aplicado' AND d.aplica_a = 'servicio'), 0)) >= 0.005
--       OR ABS(s.descuento_productos - COALESCE((SELECT SUM(d.monto) FROM descuentos_servicio d
--            WHERE d.servicio_realizado_id = s.id AND d.estatus = 'aplicado' AND d.aplica_a = 'productos'), 0)) >= 0.005;
--    -- Esperado: 0 filas
--
-- 4) Prueba funcional: AC-001…AC-009 del spec, con los servicios reales sobre una BD de prueba
--    (.notes/evidencia-descuentos-*.md). La BD de prueba se descarta al terminar.
-- =============================================================================
-- fin 0006_descuentos.sql
