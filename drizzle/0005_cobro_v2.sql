-- =============================================================================
-- 0005_cobro_v2.sql — Bellora Dashboard — El cobro registra N pagos por cita (abonos, anticipos,
-- cancelaciones con rastro), cada pago sabe en qué corte se contó, y el estatus de pago se
-- DERIVA del dinero en vez de elegirse a mano
-- =============================================================================
-- Contexto y evidencia (auditoría .notes/auditoria-dinero-2026-11-03.md, prueba manual de Carlos):
-- - El cierre captura UN método y UN monto (serviciosRealizados.ts:242) y una etiqueta manual de
--   estatus que no se deriva del dinero (serviciosRealizados.ts:256, shared/schemas.ts:156,
--   CierreCitaModal.tsx:72). DIN-A1, DIN-A2.
-- - Un pago mal capturado no se corrige (DIN-A4); un parcial no admite abonos (DIN-A1).
-- - Los productos vendidos no generan ingreso: la salida se valúa a costo (DIN-A5).
-- - El corte suma pagos con created_at > corte anterior (corte.ts:36), sin liga pago↔corte
--   (DIN-M4): no hay forma de contar un ajuste por un pago cancelado después de cortado.
-- Diseño: .notes/spec-modulo-cobro-2026-11-04.md (§10, §22). Gate 001 PASS WITH CONDITIONS:
-- .notes/gate-001-modulo-cobro-2026-11-04.md (condiciones 1–8 y 14 aplican a esta Parte A).
--
--   Caso real: servicio de $800 + crema vendida de $200, la clienta paga $500 en efectivo y $300
--   con tarjeta. Hoy solo cabe un método: se registra $800 "Efectivo" marcado "pagado" a mano, el
--   corte desglosa mal, la crema no entra al ticket y el saldo de $200 desaparece. Con esta
--   migración: dos pagos, total $1,000, estatus derivado "parcial", saldo $200 abonable.
--
-- Precedente: estado sobre la fila + rastro, nunca DELETE (0004_cancelacion_inventario.sql,
-- pagos.estatus cobrado | cancelado ya existente en 0000).
--
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA
-- -----------------------------------------------------------------------------
--   A) Columnas nuevas (todas ADD, nullable o con DEFAULT; ninguna tabla se recrea):
--      - pagos: concepto ('servicio' | 'anticipo'), fuente ('dinero'), cita_id (FK citas),
--        corte_id (FK cortes), cancelado_at, motivo_cancelacion, cancelado_por (FK usuarios),
--        corte_cancelacion_id (FK cortes). Índices por servicio, cita y corte.
--      - salidas_inventario.precio_unitario_venta; servicios_realizados.total_productos;
--      - cortes.ajustes_json, cortes.total_ajustes.
--   B) Backfill 1: liga histórica pago → corte (ver decisión 3).
--   C) Backfill 2: recálculo de servicios_realizados.estatus_pago desde la aritmética, con una
--      fila de bitácora por cada servicio cuya etiqueta cambia (Gate, condición 4).
--   D) Único escritor de `pagos` desde ahora: electron/services/cobros.ts (Gate, condición 5).
--
-- No se toca: citas, clientes, productos, lotes, movimientos. Tarjetas de regalo y descuentos son la
-- Parte B (0006), separada por la condición 1 del Gate.
--
-- -----------------------------------------------------------------------------
-- DECISIONES DELIBERADAS (para que nadie las "arregle" por accidente)
-- -----------------------------------------------------------------------------
--   1) Sin CHECK ni cambios de nulidad sobre tablas existentes: SQLite las reconstruiría
--      (Gate, condición 2; DAT-M4). Los valores válidos de concepto/fuente viven en zod y en
--      cobros.ts.
--   2) ON DELETE: drizzle-kit 0.31 genera `ADD ... REFERENCES t(id)` SIN la cláusula (nota del
--      Gate de cancelación de inventario). Aquí se agregó a mano `ON DELETE restrict` en las 4 FK
--      de pagos, igual a lo que declara schema.ts, para que BD y esquema digan lo mismo. Ningún
--      camino borra cortes ni usuarios; borrar una cita con un anticipo (aunque esté cancelado)
--      queda bloqueado por la FK: el pago es documento contable (CFF art. 30) y cita.ts lo
--      rechaza antes con un mensaje claro.
--   3) Liga histórica (B): cada pago `cobrado` queda ligado al PRIMER corte con
--      created_at >= pago.created_at. Es la misma ventana (anterior, este] que usaba
--      resumenPendiente (corte.ts:36, `gt`), así que el corte pendiente NO cambia (AC-007).
--      Pagos posteriores al último corte quedan con corte_id NULL: siguen en el pendiente.
--      CASO LÍMITE DECLARADO (Gate, condición 3): un pago registrado en el MISMO segundo que un
--      corte pero DESPUÉS de él no entró en ese corte ni en el siguiente (el siguiente usa `gt`);
--      hoy ese dinero ya está perdido (DIN-M4). Regla elegida: se liga a ese corte (preserva el
--      pendiente idéntico; el total congelado de ese corte no lo incluye). Antes de publicar,
--      Carlos corre la radiografía 4 sobre un respaldo real; si da > 0, se revisa esta regla.
--   4) Pagos ya `cancelado` antes de esta migración (A-003: se espera 0; ningún camino los
--      escribía) quedan con corte_id NULL; el siguiente corte los liga con corte_id =
--      corte_cancelacion_id (neto cero, BR-011).
--   5) Recálculo (C) RETROACTIVO, a propósito: corrige etiquetas viejas que contradicen el dinero
--      (DIN-A2). Cambia lo que muestran cartera y cuentas por cobrar históricas. Solo servicios
--      `cerrado` con estatus_pago distinto de 'cancelado' (el 'cancelado' legado se conserva y se
--      sigue excluyendo). Regla: pagado si cobrado >= total − 0.005; parcial si cobrado > 0;
--      pendiente si no. Un servicio de $0 queda "pagado". Rastro: bitácora
--      'estatus_pago_recalculado' con "SRV-NNNN: viejo → nuevo" (sin nombres). Revertir = el
--      respaldo previo a migrar (DAT-A4).
--   6) NO retroactivo en total_productos (0) ni en precio_unitario_venta (NULL): las ventas viejas
--      se capturaron a costo y nunca se cobraron en el ticket; inventarles un precio de venta
--      cambiaría saldos de servicios ya liquidados.
--   7) pagos.fecha cambia de semántica a partir de esta versión: antes = fecha de la cita
--      (serviciosRealizados.ts:161); ahora = día en que se cobró (Decisión D). Las filas viejas
--      NO se reescriben; "Cobranza recibida" por rango mezcla ambas en el historial.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO RESUELVE
-- -----------------------------------------------------------------------------
-- - Los lectores de saldo y de "ventas" (Gate, condición 6) cambian en el código de la misma
--   versión: citas.ts, clientes.ts, dashboard.ts, reportesResumen.ts, reportesFinanzas.ts,
--   reportesServiciosDetalle.ts, reportesClientesDetalle.ts, serviciosRealizados.ts, corte.ts.
--   Con esta migración aplicada y el código viejo, la app anterior ignora las columnas nuevas.
-- - Cortes ya registrados no se recalculan (A-004): su total y desglose quedan congelados.
-- - Cancelar un servicio cerrado completo (CIT-C1) no está aquí: tiene su propio Gate.
-- - Dinero en REAL (DIN-M3): solo se redondea a 2 decimales en el servidor.
--
-- -----------------------------------------------------------------------------
-- ORDEN DE APLICACIÓN
-- -----------------------------------------------------------------------------
-- 0000 → 0001 → 0002 → 0003 → 0004 → esta. La 0006 (Parte B) va después y sale en otro release,
-- cuando APPLIED-MIGRATIONS.md tenga la fila verificada de esta 0005 (Gate, condición 1).
-- TRANSACCIÓN: el migrador síncrono de drizzle corre todas las pendientes en un solo BEGIN.
-- Antes, electron/db/index.ts:25 (respaldarAntesDeMigrar) copia la BD completa (DAT-A4).
-- =============================================================================

-- A) Columnas e índices (generado por drizzle-kit; ON DELETE agregado a mano, decisión 2)
ALTER TABLE `cortes` ADD `ajustes_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `cortes` ADD `total_ajustes` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos` ADD `concepto` text DEFAULT 'servicio' NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos` ADD `fuente` text DEFAULT 'dinero' NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos` ADD `cita_id` text REFERENCES citas(id) ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `pagos` ADD `corte_id` text REFERENCES cortes(id) ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `pagos` ADD `cancelado_at` integer;--> statement-breakpoint
ALTER TABLE `pagos` ADD `motivo_cancelacion` text;--> statement-breakpoint
ALTER TABLE `pagos` ADD `cancelado_por` text REFERENCES usuarios(id) ON DELETE restrict;--> statement-breakpoint
ALTER TABLE `pagos` ADD `corte_cancelacion_id` text REFERENCES cortes(id) ON DELETE restrict;--> statement-breakpoint
CREATE INDEX `pagos_servicio_realizado_idx` ON `pagos` (`servicio_realizado_id`);--> statement-breakpoint
CREATE INDEX `pagos_cita_idx` ON `pagos` (`cita_id`);--> statement-breakpoint
CREATE INDEX `pagos_corte_idx` ON `pagos` (`corte_id`);--> statement-breakpoint
ALTER TABLE `salidas_inventario` ADD `precio_unitario_venta` real;--> statement-breakpoint
ALTER TABLE `servicios_realizados` ADD `total_productos` real DEFAULT 0 NOT NULL;--> statement-breakpoint

-- B) Liga histórica pago → corte (decisión 3): primer corte con created_at >= el del pago.
UPDATE `pagos`
SET `corte_id` = (
  SELECT c.`id` FROM `cortes` c
  WHERE c.`created_at` >= `pagos`.`created_at`
  ORDER BY c.`created_at` ASC, c.`rowid` ASC
  LIMIT 1
)
WHERE `estatus` = 'cobrado';--> statement-breakpoint

-- C1) Rastro del recálculo (Gate, condición 4): una fila de bitácora por servicio cuya etiqueta
-- cambia, ANTES de cambiarla. id con forma de UUID v4, como randomUUID() en bitacora.ts.
INSERT INTO `bitacora` (`id`, `usuario_id`, `accion`, `entidad_tipo`, `entidad_id`, `detalle`)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  NULL,
  'estatus_pago_recalculado',
  'servicio_realizado',
  r.`id`,
  r.`codigo` || ': ' || r.`viejo` || ' → ' || r.`nuevo`
FROM (
  SELECT
    s.`id`,
    s.`codigo_servicio` AS `codigo`,
    s.`estatus_pago` AS `viejo`,
    CASE
      WHEN COALESCE((SELECT SUM(p.`monto`) FROM `pagos` p
                     WHERE p.`servicio_realizado_id` = s.`id` AND p.`estatus` = 'cobrado'), 0)
           >= ROUND(COALESCE(s.`precio`, 0) + s.`total_productos`, 2) - 0.005 THEN 'pagado'
      WHEN COALESCE((SELECT SUM(p.`monto`) FROM `pagos` p
                     WHERE p.`servicio_realizado_id` = s.`id` AND p.`estatus` = 'cobrado'), 0)
           > 0 THEN 'parcial'
      ELSE 'pendiente'
    END AS `nuevo`
  FROM `servicios_realizados` s
  WHERE s.`estatus` = 'cerrado' AND s.`estatus_pago` <> 'cancelado'
) r
WHERE r.`viejo` <> r.`nuevo`;--> statement-breakpoint

-- C2) Recálculo (decisión 5): misma regla que C1 y que cobros.recalcularEstatusEnTx.
UPDATE `servicios_realizados`
SET `estatus_pago` = CASE
    WHEN COALESCE((SELECT SUM(p.`monto`) FROM `pagos` p
                   WHERE p.`servicio_realizado_id` = `servicios_realizados`.`id` AND p.`estatus` = 'cobrado'), 0)
         >= ROUND(COALESCE(`precio`, 0) + `total_productos`, 2) - 0.005 THEN 'pagado'
    WHEN COALESCE((SELECT SUM(p.`monto`) FROM `pagos` p
                   WHERE p.`servicio_realizado_id` = `servicios_realizados`.`id` AND p.`estatus` = 'cobrado'), 0)
         > 0 THEN 'parcial'
    ELSE 'pendiente'
  END,
  `updated_at` = unixepoch()
WHERE `estatus` = 'cerrado' AND `estatus_pago` <> 'cancelado'
  AND `estatus_pago` <> CASE
    WHEN COALESCE((SELECT SUM(p.`monto`) FROM `pagos` p
                   WHERE p.`servicio_realizado_id` = `servicios_realizados`.`id` AND p.`estatus` = 'cobrado'), 0)
         >= ROUND(COALESCE(`precio`, 0) + `total_productos`, 2) - 0.005 THEN 'pagado'
    WHEN COALESCE((SELECT SUM(p.`monto`) FROM `pagos` p
                   WHERE p.`servicio_realizado_id` = `servicios_realizados`.`id` AND p.`estatus` = 'cobrado'), 0)
         > 0 THEN 'parcial'
    ELSE 'pendiente'
  END;

-- =============================================================================
-- VERIFICACIÓN MANUAL (después de aplicar; sobre una COPIA de respaldo, solo lectura)
-- =============================================================================
-- 1) Columnas nuevas presentes:
--    SELECT COUNT(*) FROM pragma_table_info('pagos')
--      WHERE name IN ('concepto','fuente','cita_id','corte_id','cancelado_at','motivo_cancelacion',
--                     'cancelado_por','corte_cancelacion_id');
--    -- Expected: 8
--    SELECT "on_delete" FROM pragma_foreign_key_list('pagos') WHERE "from" IN
--      ('cita_id','corte_id','cancelado_por','corte_cancelacion_id');
--    -- Expected: 4 filas RESTRICT
-- 2) Cada corte viejo cuadra con sus pagos ligados (Gate, condición 3c):
--    SELECT c.fecha, c.total, COALESCE(SUM(p.monto),0) AS ligados FROM cortes c
--      LEFT JOIN pagos p ON p.corte_id = c.id GROUP BY c.id
--      HAVING ABS(c.total - COALESCE(SUM(p.monto),0)) >= 0.005;
--    -- Expected: 0 filas (si hay filas, son el caso límite de la decisión 3)
-- 3) Pendiente idéntico: el total de pagos cobrado con corte_id NULL es igual al "Pendiente de
--    cortar" que mostraba la pantalla Corte ANTES de actualizar.
--    SELECT COUNT(*), COALESCE(SUM(monto),0) FROM pagos WHERE estatus='cobrado' AND corte_id IS NULL;
-- 4) Radiografía DIN-M4 (Gate, condición 3a; correr en el respaldo ANTES de migrar):
--    SELECT COUNT(*) FROM pagos p JOIN cortes c ON p.created_at = c.created_at;
--    -- Expected: 0. Si > 0, ver decisión 3.
-- 5) A-003 (condición 3b): SELECT COUNT(*) FROM pagos WHERE estatus = 'cancelado';
--    -- Expected: 0 (antes de migrar)
-- 6) Recálculo con rastro (condición 4):
--    SELECT COUNT(*) FROM bitacora WHERE accion = 'estatus_pago_recalculado';
--    -- Expected: igual al conteo de servicios cerrados cuya etiqueta contradecía al dinero, que se
--       mide ANTES de migrar con el CASE de C1 (servicios con viejo <> nuevo).
--    SELECT detalle FROM bitacora WHERE accion = 'estatus_pago_recalculado' LIMIT 20;
-- 7) Ningún servicio cerrado queda incoherente:
--    SELECT COUNT(*) FROM servicios_realizados s WHERE s.estatus='cerrado' AND s.estatus_pago <> 'cancelado'
--      AND s.estatus_pago <> CASE WHEN COALESCE((SELECT SUM(monto) FROM pagos p WHERE
--      p.servicio_realizado_id=s.id AND p.estatus='cobrado'),0) >= ROUND(COALESCE(s.precio,0)+s.total_productos,2)-0.005
--      THEN 'pagado' WHEN COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.servicio_realizado_id=s.id
--      AND p.estatus='cobrado'),0) > 0 THEN 'parcial' ELSE 'pendiente' END;
--    -- Expected: 0
-- 8) Registrada: SELECT COUNT(*) FROM __drizzle_migrations;   -- Expected: 6
-- =============================================================================
-- end 0005_cobro_v2.sql
