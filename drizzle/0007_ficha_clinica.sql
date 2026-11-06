-- =============================================================================
-- 0007_ficha_clinica.sql — Bellora Dashboard — La ficha clínica facial de cada clienta vive en la
-- app, con sus versiones anteriores, en vez de solo en papel
-- =============================================================================
-- CONTEXTO Y EVIDENCIA
-- La cosmetóloga llena a mano un formato de 5 páginas ("Ficha clínica facial"). Los antecedentes
-- (alergias, embarazo, marcapasos…) no existen en la app y nada avisa de una contraindicación
-- antes de un tratamiento. Spec: .notes/spec-ficha-clinica-2026-11-05.md (§21 diseño técnico).
-- Gate: .notes/gate-001-ficha-clinica-2026-11-05.md (PASS WITH CONDITIONS, 13 condiciones).
--
--   Caso real: clienta con alergia a un activo; el dato está en una hoja en un cajón; la cita del
--   día no lo muestra → el riesgo lo paga la clienta. Con la ficha, el detalle de toda cita suya
--   muestra "Precaución: Alergias — …".
--
-- Precedente: pagos/cortes guardan documentos que no se borran y se versionan por estado; aquí la
-- versión anterior se guarda completa en su propia tabla (Gate, condición 5).
--
-- -----------------------------------------------------------------------------
-- QUÉ CAMBIA
-- -----------------------------------------------------------------------------
--   A) fichas_clinicas: una fila por clienta (UNIQUE cliente_id, FK RESTRICT), sexo, ocupación,
--      version_formulario, datos (JSON del catálogo shared/fichaClinica.ts, validado con zod y
--      normalizado en el main), usuario_id, created_at / updated_at en MILISEGUNDOS.
--   B) fichas_clinicas_versiones: instantánea completa del estado anterior en cada guardado que
--      cambió algo, con vigente_desde / vigente_hasta (ms) y usuario_id. Índice por ficha_id.
--   Las fotos de antes y después NO tienen tabla: van en `archivos` (categoria foto_antes /
--   foto_despues), que ya existe.
--
-- NO se toca ninguna tabla existente: ni ALTER, ni recreación, ni backfill (Gate, condición 3).
--
-- -----------------------------------------------------------------------------
-- DECISIONES DELIBERADAS (para que nadie las "arregle" por accidente)
-- -----------------------------------------------------------------------------
--   1) Consentimiento (Q-001, opción a): SIN columna de consentimiento. PROJECT.md (Marco legal y
--      pii.notes) registra el consentimiento implícito como riesgo aceptado por el dueño, solo
--      para esta feature. No agregar una casilla "para cumplir" sin cambiar antes el contrato.
--   2) Borrado (Q-002): fichas_clinicas.cliente_id ON DELETE RESTRICT — una clienta con ficha no
--      se borra (BR-009). fichas_clinicas_versiones.ficha_id ON DELETE RESTRICT — "Borrar ficha
--      clínica" (FR-011, sin PIN) borra versiones, ficha y fotos de forma explícita en una
--      transacción de fichasClinicas.ts; nunca en cascada silenciosa.
--   3) datos es JSON y no columnas: el formulario espeja un papel que cambiará y ninguna consulta
--      filtra por pregunta. version_formulario permite leer versiones viejas con `safeParse`.
--   4) updated_at en milisegundos (no segundos como el resto del esquema): es la llave de la
--      concurrencia optimista (condición 4). El código siempre escribe las fechas; el DEFAULT
--      (unixepoch() * 1000) solo cubre inserciones manuales.
--   5) Datos de salud SENSIBLES, sin cifrar, igual que el resto de la BD (PROJECT.md → pii). Esta
--      migración no cambia eso.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO RESUELVE
-- -----------------------------------------------------------------------------
-- - reinicio.ts (TABLAS_NEGOCIO) incluye las dos tablas en el código de la misma versión
--   (condición 10); sin eso, el reinicio fallaría por la FK RESTRICT hacia clientes.
-- - Con esta migración y el código viejo, la app anterior no ve las fichas (no las borra).
-- - NOM-004-SSA3 (conservación ≥ 5 años) sigue sin resolverse; el borrado de FR-011 es decisión
--   del dueño (PROJECT.md → Marco legal).
--
-- -----------------------------------------------------------------------------
-- ORDEN DE APLICACIÓN
-- -----------------------------------------------------------------------------
-- 0000 → … → 0005 → 0006 → esta. La Parte B del cobro es la 0008 (addenda del 2026-11-06).
-- TRANSACCIÓN: el migrador síncrono de drizzle corre todas las pendientes en un solo BEGIN.
-- Antes, electron/db/index.ts:25 (respaldarAntesDeMigrar) copia la BD completa (DAT-A4).
-- Convenciones: idénticas a 0004-0006 (español, SQL generado por drizzle-kit 0.31).
-- =============================================================================

-- A) y B) generado por drizzle-kit (npm run db:generate); revisado contra el Gate, condiciones 2 y 3.
CREATE TABLE `fichas_clinicas` (
	`id` text PRIMARY KEY NOT NULL,
	`cliente_id` text NOT NULL,
	`sexo` text,
	`ocupacion` text,
	`version_formulario` integer DEFAULT 1 NOT NULL,
	`datos` text NOT NULL,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fichas_clinicas_cliente_id_unique` ON `fichas_clinicas` (`cliente_id`);--> statement-breakpoint
CREATE TABLE `fichas_clinicas_versiones` (
	`id` text PRIMARY KEY NOT NULL,
	`ficha_id` text NOT NULL,
	`sexo` text,
	`ocupacion` text,
	`version_formulario` integer NOT NULL,
	`datos` text NOT NULL,
	`vigente_desde` integer NOT NULL,
	`vigente_hasta` integer NOT NULL,
	`usuario_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ficha_id`) REFERENCES `fichas_clinicas`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `fichas_clinicas_versiones_ficha_idx` ON `fichas_clinicas_versiones` (`ficha_id`);

-- =============================================================================
-- VERIFICACIÓN MANUAL (después de aplicar; sobre una COPIA, nunca sobre la BD real)
-- =============================================================================
-- 1) Estructura
--    SELECT COUNT(*) FROM sqlite_master WHERE name IN ('fichas_clinicas', 'fichas_clinicas_versiones');
--    -- Esperado: 2
--    SELECT sql FROM sqlite_master WHERE name = 'fichas_clinicas';
--    -- Esperado: FOREIGN KEY (`cliente_id`) … ON DELETE restrict
--
-- 2) No retroactiva
--    SELECT (SELECT COUNT(*) FROM fichas_clinicas) + (SELECT COUNT(*) FROM fichas_clinicas_versiones);
--    -- Esperado: 0
--
-- 3) Una ficha por clienta
--    SELECT cliente_id, COUNT(*) FROM fichas_clinicas GROUP BY cliente_id HAVING COUNT(*) > 1;
--    -- Esperado: 0 filas (el índice único lo impide)
--
-- 4) Prueba funcional: AC del spec con los servicios reales sobre una BD de prueba
--    (.notes/evidencia-ficha-clinica-*.md). La BD de prueba se descarta al terminar.
-- =============================================================================
-- fin 0007_ficha_clinica.sql
