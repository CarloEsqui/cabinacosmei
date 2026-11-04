# Evidence for audit — Fase 0: DAT-A1, DAT-C1, DAT-A4, DAT-B1, DAT-B8 (2026-11-03)

**Responde a:** [auditoria-integridad-datos-2026-11-03.md](auditoria-integridad-datos-2026-11-03.md) ·
plan [plan-accion-2026-11-03.md](plan-accion-2026-11-03.md), Phase 0 ítems 1–3.
**Responsible:** sesión Claude Code del arranque (main thread), a petición de Carlos.
**Method / PII:** no se tocó ninguna BD real ni respaldo de la cabina. Todas las pruebas usan BDs
en memoria o en el scratchpad de la sesión, creadas desde `drizzle/` del repo. Sin datos de clientas.

## ANSWERS to the auditor's findings

**DAT-A1 — ¿`esErrorForeignKey` deja pasar la violación de `ON DELETE RESTRICT` como error crudo?**
CONFIRMED y CORREGIDO. Experimento bajo el SQLite de Electron (`ELECTRON_RUN_AS_NODE=1 electron
fk-test.cjs`, BD en memoria con una FK `RESTRICT` y otra sin acción). `old` = criterio anterior, `new` = criterio corregido:

```
RESTRICT code=SQLITE_CONSTRAINT_TRIGGER msg=FOREIGN KEY constraint failed old=false new=true
NO ACTION code=SQLITE_CONSTRAINT_FOREIGNKEY msg=FOREIGN KEY constraint failed old=true new=true
sqlite 3.53.2
```

El matiz del auditor es correcto: el código extendido para `RESTRICT` es `SQLITE_CONSTRAINT_TRIGGER`.
Concedido también que ese código lo compartiría un trigger propio. Por eso el criterio nuevo exige
además el mensaje `FOREIGN KEY constraint failed` (hoy no hay triggers propios en `drizzle/`).

**DAT-B1 — ¿llegan a la usuaria prefijos `SqliteError:` / `ErrorConHistorial:`?** CORREGIDO.
`mensajeDeError` quitaba solo `^Error:`; ahora quita `^\w*Error\w*:` (`src/lib/errores.ts`).

**DAT-B8 — ¿el mensaje de producto con historial omite las recetas?** CORREGIDO. El texto ahora dice
"lotes, entradas, salidas o servicios que lo usan" (`productos.ts:119`).

**DAT-C1 — ¿el respaldo previo a "Borrar datos de negocio" se poda con los automáticos?** CONFIRMED
y CORREGIDO. Antes, `podarRespaldosAutomaticos` filtraba por `cabina_auto_`, que también llevan los
respaldos `antes_de_*`. Ahora filtra solo por `cabina_auto_diario_`. Simulación del filtro nuevo con
nombres de ejemplo:

```
se podarian: [ 'cabina_auto_diario_20261101.zip' ]
se conservan: [ 'cabina_respaldo_20261104.zip', 'cabina_auto_antes_de_restaurar_20261104.zip',
  'cabina_auto_diario_20261104.zip', 'cabina_auto_diario_20261103.zip',
  'cabina_auto_antes_de_borrar_negocio_20261102.zip', 'cabina_auto_diario_20261102.zip' ]
```

Se eligió no cambiar el prefijo, para que los respaldos `antes_de_*` que **ya existan** en la cabina
también queden protegidos desde la primera ejecución de la versión nueva.

**DAT-A4 — ¿hay respaldo antes de `migrate()`?** CORREGIDO. `respaldarAntesDeMigrar`
(`electron/db/index.ts`) hace `VACUUM INTO cabina_antes_de_migrar_<fecha local>.sqlite3` junto a la
BD, solo si hay migraciones pendientes según el mismo criterio de drizzle (`when` del journal >
último `created_at` de `__drizzle_migrations`). Falla cerrado: si la copia no se puede hacer, no se migra.
Matiz del auditor concedido: la red diaria sigue podándose a 3. Esta copia **no** entra en la poda,
porque vive fuera de `respaldos_log` y fuera de la carpeta de respaldos.

**Operational closures of the day:** SEG-C1 (auditoría de seguridad) es un falso positivo del propio
arranque. Está documentado en el plan y no es parte de esta auditoría.

## WORK 1 — Borrado con historial (DAT-A1/B1/B8)

### STEP 0 — Diagnosis
Lectura de `electron/services/errores.ts:12-14` (antes del cambio):
`return error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY";`
más el experimento de arriba (`old=false` para RESTRICT). Confirmado: es un bug de clasificación,
no de diseño. La FK `restrict` es correcta; el diálogo híbrido nunca se alcanzaba.

### Fix applied
`electron/services/errores.ts` (criterio), `src/lib/errores.ts` (prefijos), `electron/services/productos.ts`
(texto). Intacto: el esquema y las FKs. Que un producto con historial no se borre físicamente es el diseño correcto.

### Post-fix census
`grep -rn "eliminarOFallarConHistorial(" electron/services`:
- `productos.ts:117` → ahora ofrece "Desactivar en su lugar" (el incidente reportado).
- `inventario.ts:219` (lote) → ahora ofrece bloquear. Hallazgo DAT-B7 sigue: borrar un lote nunca puede tener éxito.
- `clientes.ts:158` → ahora ofrece desactivar. *Archivo de superficie PII: no se editó; hereda el arreglo.*
- `tiposProducto.ts:48`, `serviciosCatalogo.ts:66` → ahora ofrecen desactivar.
- `proveedores.ts` → INTACTO: chequea referencias a mano y sus FKs son `set null`; no usa el wrapper.
`grep -rn "SQLITE_CONSTRAINT" electron src shared` → solo `errores.ts`; no hay otros clasificadores.
`mensajeDeError(` → 37 usos en `src/`; el cambio solo quita un prefijo técnico inicial.

### E2E — PARCIAL
Probado: la clasificación, con el SQLite real de Electron. Pendiente: el clic en la UI
(`npm run dev` → Inventario → eliminar un producto con entradas → debe aparecer "No se puede
eliminar · Desactivar en su lugar"). No se pudo correr aquí: el sandbox de la sesión cuelga Vite.
Lo corre Carlos.

## WORK 2 — Respaldos de seguridad (DAT-C1) y previo a migración (DAT-A4)

### STEP 0 — Diagnosis
`respaldos.ts:17,22` (`PREFIJO_AUTO`, `MAX_RESPALDOS_AUTO = 3`), filtro de poda `startsWith(PREFIJO_AUTO)`.
`reinicio.ts:52` crea `antes_de_borrar_negocio` con ese prefijo. `Respaldos.tsx:282-283` promete
"siempre podrás restaurarlo". `db/index.ts:22-25` llamaba `migrate()` sin copia previa. Confirmado.

### Fix applied
`electron/services/respaldos.ts`: constante `MOTIVO_DIARIO`, prefijo de poda `cabina_auto_diario_`, comentarios.
`electron/db/index.ts`: `respaldarAntesDeMigrar` + import de `readMigrationFiles`. Intacto: formato
de los zip, `crearRespaldo`, restauración, `reinicio.ts`.

### Post-fix census
`grep -rn "crearRespaldo(" electron`:
- `respaldos:crear` (manual) → INTACTO, nunca se podó.
- `reinicio.ts:52` `antes_de_borrar_negocio`, `reinicio.ts:88` `antes_de_restablecer_fabrica`,
  `respaldos.ts:241,257` `antes_de_restaurar` → ahora **nunca** se podan.
- `respaldos.ts:272` `diario` → se sigue podando a 3 (comportamiento intencional).
`abrirConexion()` tiene dos llamadores: `initDb` (arranque) y `reabrirDb` (tras restaurar). Ambos
quedan cubiertos. Restaurar un respaldo con esquema viejo también genera la copia previa a migrar.

### Deploy / apply
No aplica. Es app de escritorio; llega a la cabina con el próximo release. `npm run typecheck`:

```
> tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.electron.json
typecheck exit=0
```

`npm run build`: **no verificado en esta sesión** (el sandbox cuelga `vite build` en "transforming…").
Pendiente: lo corre Carlos antes del commit.

### E2E — CERRADO para DAT-A4 (proxy fiel), PARCIAL para DAT-C1
DAT-A4: `electron/db/index.ts` real empaquetado con esbuild y ejecutado bajo Electron contra
`drizzle/` del repo. Se simuló una instalación vieja con el journal recortado a 0000–0002 y luego una
"actualización" con el journal completo:

```
1-fresh-install(0000-0002) files: cabina.sqlite3
Respaldo previo a migración creado en: …/userdata/cabina_antes_de_migrar_20261104-012650.sqlite3
2-update-with-0003 files: cabina.sqlite3, cabina_antes_de_migrar_20261104-012650.sqlite3
3-restart-no-pending files: cabina.sqlite3, cabina_antes_de_migrar_20261104-012650.sqlite3
```
Copia: `select count(*) from __drizzle_migrations` → `3`; `pragma integrity_check` → `ok`.
BD migrada → `4`. Instalación nueva y reinicio sin pendientes no generan copia.
(Ese sello estaba en UTC; se cambió a hora local después de la prueba y se re-corrió el typecheck: ok.)

DAT-C1: el filtro se probó en aislamiento (salida arriba). Pendiente el E2E en UI con BD de prueba:
"Borrar datos de negocio" y luego forzar 4 respaldos diarios; el `antes_de_borrar_negocio` debe seguir listado.

### Residuos que esta evidencia NO cierra
- DAT-B6: tras restaurar, el zip `antes_de_restaurar` existe en disco pero su fila se pierde con la BD
  sobrescrita. Ahora tampoco se poda nunca, pero no aparece en la lista.
- Si `respaldarAntesDeMigrar` falla, la app no abre y no muestra diálogo: queda en el mismo modo de
  fallo que ya tenía un `migrate()` fallido. El diálogo amigable entra con DAT-A3 (Phase 1).

## Working tree state

Sin commitear (los commits los hace Carlos):
- `electron/services/errores.ts`, `src/lib/errores.ts`, `electron/services/productos.ts` — DAT-A1/B1/B8.
- `electron/services/respaldos.ts`, `electron/db/index.ts` — DAT-C1/A4 (superficies críticas; esta evidencia las respalda).
- Todos los archivos del arranque Atlas (PROJECT.md, CLAUDE.md, CODEOWNERS, APPLIED-MIGRATIONS.md,
  `.github/`, `githooks/`, `.atlas-notes-allow`, `.notes/`) — pendientes del primer commit.
