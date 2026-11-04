-- =============================================================================
-- 0004_cancelacion_inventario.sql — Bellora Dashboard — Una entrada o salida de inventario
-- capturada por error se puede CANCELAR (con motivo) en vez de quedarse para siempre
-- =============================================================================
-- Contexto y evidencia: hoy no existe ningún camino para cancelar ni borrar entradas o salidas.
-- No hay IPC (shared/ipc-contract.ts solo expone registrarEntrada/registrarSalida), ningún
-- servicio hace delete sobre esas tablas y Movimientos es de solo lectura. Hallazgo DAT-A2,
-- .notes/auditoria-integridad-datos-2026-11-03.md §1.5 y §6. Diseño:
-- .notes/spec-cancelacion-inventario-2026-11-04.md. Gate 001 PASS WITH CONDITIONS:
-- .notes/gate-001-cancelacion-inventario-2026-11-04.md.
--
--   Caso real (prueba manual de Carlos, 2026-11-04): una entrada dada de alta con datos
--   equivocados no se puede quitar. Infla el stock y las compras, el lote no se borra (DAT-B7)
--   y el producto tampoco, porque tiene historial.
--
-- Precedente: el patrón "estado sobre la fila + rastro" es el mismo que pagos.estatus
-- (cobrado | cancelado, schema.ts) y el que fija el diseño del cobro v2.
--
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA
-- -----------------------------------------------------------------------------
--   A) entradas_inventario y salidas_inventario ganan:
--      - estatus TEXT NOT NULL DEFAULT 'vigente' (vigente | cancelada);
--      - cancelada_at (timestamp);
--      - cancelada_motivo (texto);
--      - cancelada_por_usuario_id (FK usuarios).
--   B) Lo usan electron/services/inventario.ts (cancelarEntradaEnTx / cancelarSalidaEnTx) y
--      todos los lectores que cuentan stock o dinero, que filtran estatus = 'vigente'.
--
-- No se toca: lotes, movimientos (los tipos nuevos cancelacion_entrada / cancelacion_salida son
-- valores de texto; no cambia el esquema), productos, pagos.
--
-- -----------------------------------------------------------------------------
-- DECISIONES DELIBERADAS (para que nadie las "arregle" por accidente)
-- -----------------------------------------------------------------------------
--   1) Solo ALTER TABLE ... ADD, sin recrear tablas (DAT-M4). Los enums viven en zod y en el
--      servicio, no en CHECK. Agregar un CHECK obligaría a SQLite a reconstruir la tabla.
--   2) FK cancelada_por_usuario_id: schema.ts declara ON DELETE SET NULL, pero drizzle-kit 0.31
--      no emite la cláusula en ADD COLUMN, así que en la BD queda ON DELETE NO ACTION. Se acepta
--      porque ningún camino borra usuarios (grep "delete(usuarios)" en electron/ → 0;
--      reinicio.ts los conserva). Si algún día se borran usuarios, esta FK lo bloquea. Ese es el
--      lado seguro.
--   3) NO retroactiva: todas las filas existentes quedan 'vigente' por el DEFAULT. No se infiere
--      ninguna cancelación del pasado.
--   4) Los folios siguen contando los documentos cancelados (generarFolioEntrada/Salida no
--      filtran estatus), para que un folio nunca se repita.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO RESUELVE
-- -----------------------------------------------------------------------------
-- - Las salidas ligadas a un servicio realizado (consumo y venta del cierre de cita) no se
--   cancelan por esta vía. Su reversa es la de un servicio cerrado completo (CIT-C1), con su
--   propio Gate.
-- - El lote no se borra aunque todas sus entradas se cancelen: queda 'agotado' con su historial
--   (nunca DELETE).
-- - Reportes retroactivos: una cancelación saca el documento del periodo ORIGINAL; el inventario
--   no tiene cierres de periodo.
--
-- -----------------------------------------------------------------------------
-- ORDEN DE APLICACIÓN
-- -----------------------------------------------------------------------------
-- 0000 → 0001 → 0002 → 0003 → esta. Las migraciones del cobro v2 van después, como 0005 y 0006,
-- y se generan solo en una rama que ya contenga esta 0004 y meta/0004_snapshot.json.
-- TRANSACCIÓN: el migrador síncrono de drizzle corre todas las pendientes en un solo BEGIN.
-- Antes, electron/db/index.ts (respaldarAntesDeMigrar) copia la BD completa (DAT-A4).
-- =============================================================================

ALTER TABLE `entradas_inventario` ADD `estatus` text DEFAULT 'vigente' NOT NULL;--> statement-breakpoint
ALTER TABLE `entradas_inventario` ADD `cancelada_at` integer;--> statement-breakpoint
ALTER TABLE `entradas_inventario` ADD `cancelada_motivo` text;--> statement-breakpoint
ALTER TABLE `entradas_inventario` ADD `cancelada_por_usuario_id` text REFERENCES usuarios(id);--> statement-breakpoint
ALTER TABLE `salidas_inventario` ADD `estatus` text DEFAULT 'vigente' NOT NULL;--> statement-breakpoint
ALTER TABLE `salidas_inventario` ADD `cancelada_at` integer;--> statement-breakpoint
ALTER TABLE `salidas_inventario` ADD `cancelada_motivo` text;--> statement-breakpoint
ALTER TABLE `salidas_inventario` ADD `cancelada_por_usuario_id` text REFERENCES usuarios(id);

-- =============================================================================
-- VERIFICACIÓN MANUAL (después de aplicar; sobre una COPIA de respaldo, solo lectura)
-- =============================================================================
-- 1) Columnas nuevas presentes:
--    SELECT name FROM pragma_table_info('entradas_inventario') WHERE name LIKE 'cancelada%' OR name='estatus';
--    -- Expected: 4 filas (igual para salidas_inventario)
-- 2) Nada quedó cancelado por la migración:
--    SELECT COUNT(*) FROM entradas_inventario WHERE estatus <> 'vigente';
--    SELECT COUNT(*) FROM salidas_inventario  WHERE estatus <> 'vigente';
--    -- Expected: 0 y 0
-- 3) Invariante de lote (BR-002 del spec):
--    SELECT COUNT(*) FROM lotes l WHERE ABS(l.cantidad_disponible - (
--      COALESCE((SELECT SUM(cantidad) FROM entradas_inventario e WHERE e.lote_id = l.id AND e.estatus='vigente'),0)
--      - COALESCE((SELECT SUM(cantidad) FROM salidas_inventario s WHERE s.lote_id = l.id AND s.estatus='vigente'),0))) > 1e-6;
--    -- Expected: 0
-- 4) Registrada:
--    SELECT COUNT(*) FROM __drizzle_migrations;
--    -- Expected: 5
-- =============================================================================
-- end 0004_cancelacion_inventario.sql
