# Audit — Integridad de datos (migraciones, FKs, borrados de inventario, stock, respaldos/reinicio) — 2026-11-03 (DAT-C1, DAT-A1…A4, DAT-M1…M6, DAT-B1…B8)

**Scope:** Código en el working tree de `main` (HEAD `4cbeaae` + archivos de arranque Atlas sin commitear):
`drizzle/` (0000–0003 + `meta/`), `electron/db/index.ts`, `electron/db/schema.ts`, `electron/services/{productos,inventario,tiposProducto,proveedores,serviciosCatalogo,errores,respaldos,reinicio,migracionCarpetas}.ts`, `electron/services/serviciosRealizados.ts` (solo `cerrarCita` y `aPiezas`, por su efecto sobre stock), `electron/ipc/index.ts`, `electron/main.ts`, `src/lib/errores.ts`, `src/hooks/use-eliminar-hibrido.ts`, `src/pages/inventario/*`, `src/pages/configuracion/{Productos,Respaldos}.tsx`, `src/components/inventario/{EntradaForm,SalidaForm}.tsx`. Se inspeccionó también el runtime instalado (`drizzle-orm 0.45.2`, `better-sqlite3 12.11.1` con SQLite 3.53.2, Electron 43) porque el diagnóstico del incidente 1 depende de él.
**NO auditado:** pagos/corte/reportes financieros (auditoría "dinero" paralela), licencias, PII (auditorías paralelas), `clientes.ts` salvo su `eliminarCliente`.
**Method:** Inspección de código con citas `archivo:línea`; `git log` sobre `drizzle/` contra los tags `v0.1.0…v0.1.4`; `npx drizzle-kit check` (solo lectura, "Everything's fine"); dos experimentos en memoria (`:memory:`, fuera del repo, en el scratchpad de sesión) ejecutados con el Node de Electron (`ELECTRON_RUN_AS_NODE=1`) para observar qué error lanza el driver ante una FK `restrict`. Ninguna consulta sobre una base real; ningún archivo del proyecto modificado.
**PII declaration:** Sin PII. No existe BD real en el repo y no se buscó ninguna fuera de él. El informe no contiene nombres, teléfonos ni contenido de BD; no hay sujetos (`CL-####`) porque no se tocaron datos.
**State as of:** 2026-11-03, working tree sobre `4cbeaae` (último release publicado: `v0.1.4`, 2026-07-27).

---

## 1. Executive summary

1. **El diseño de llaves foráneas es CORRECTO y coherente con la regla "lo que tiene historial no se borra".** Todo lo que es historial (`lotes`, `entradas_inventario`, `salidas_inventario`, `servicios_productos_consumidos`, `servicios_realizados`, `pagos`, `citas`) referencia a su padre con `onDelete: restrict` (`electron/db/schema.ts:127-129,154-159,174-179,264-269,238-243,283-285,307-309`); los vínculos de catálogo son `set null` (`schema.ts:102-104,130,153,197-198`); `cascade` solo existe en filas hijas sin valor propio (recetas `schema.ts:78-80`, consumos `schema.ts:261-263`). El SQL publicado coincide (`drizzle/0000_lively_nuke.sql:104-105,125,143-147,229-230,256-257,268-271`).
2. **Las migraciones están SANAS.** Cuatro archivos, cada uno añadido en un solo commit y nunca modificado después (`git log --name-status -- drizzle/`: `f0e0ca4` 0000+0001 → antes de `v0.1.0`; `f5362ea` 0002; `374cbee` 0003 = `v0.1.3`). La cadena de snapshots `prevId→id` es íntegra, `drizzle-kit check` pasa, y el migrador aplica todo en una sola transacción `BEGIN…COMMIT/ROLLBACK` (`node_modules/drizzle-orm/sqlite-core/dialect.js:657-673`), así que una migración que falle no deja la BD a medias. El instalador empaqueta `drizzle/**/*` (`package.json`, bloque `build.files`).
3. **La aritmética de stock es CONSISTENTE y atómica.** `lotes.cantidad_disponible` es la única fuente de verdad (`inventario.ts:104`); cada entrada y cada salida escriben lote + documento + movimiento + bitácora dentro de una misma transacción (`inventario.ts:305-389`, `:564-571`), y el cierre de cita mete todas las salidas y el pago en una sola transacción (`serviciosRealizados.ts:207-240`). El FEFO/FIFO excluye bloqueados y caducados (`inventario.ts:462-465,473-478`).
4. **Incidente 1 ("SqliteError: FOREIGN KEY constraint failed" en vez del flujo híbrido) es un BUG de una línea, no de diseño.** `esErrorForeignKey` (`electron/services/errores.ts:12-14`) compara `error.code === "SQLITE_CONSTRAINT_FOREIGNKEY"`, pero SQLite reporta una violación de `ON DELETE RESTRICT` con el código extendido **`SQLITE_CONSTRAINT_TRIGGER`** (experimento §2.2, SQLite 3.53.2 dentro de Electron). Como TODAS las FKs del historial son `restrict`, el wrapper `eliminarOFallarConHistorial` nunca reconoce el error y relanza el `SqliteError` crudo; Electron lo serializa como `"SqliteError: FOREIGN KEY constraint failed"` y `mensajeDeError` no lo limpia. Afecta a productos, lotes, clientas, tipos de producto y servicios del catálogo (DAT-A1).
5. **Incidente 2 ("no se puede eliminar una salida") es DISEÑO: no existe ningún camino de cancelación ni borrado para salidas ni entradas.** No hay canal IPC (`shared/ipc-contract.ts:106-111` solo expone `registrarEntrada`/`registrarSalida`), ningún servicio hace `delete` sobre esas tablas, y la pestaña Movimientos es de solo lectura (`src/pages/inventario/Movimientos.tsx:39-43`). Que las ventas no se borren es correcto (CFF art. 30, PROJECT.md); que no se puedan **cancelar** es un hueco funcional que empuja a la usuaria a "corregir" registrando una entrada nueva, lo que infla compras y `cantidad_inicial` (DAT-A2). La especificación de la reversión correcta está en §6.
6. **La bomba de tiempo (§5.1): el respaldo de seguridad que se crea antes de "Borrar datos de negocio" se poda solo a los 3 respaldos automáticos siguientes.** Usa el prefijo `cabina_auto_` (`respaldos.ts:17,90-91`) y `podarRespaldosAutomaticos` conserva solo 3 (`respaldos.ts:22,118-135`). La pantalla promete "siempre podrás restaurarlo después" (`src/pages/configuracion/Respaldos.tsx:282-283`); esa promesa caduca ~3 días después del borrado y con ella se pierden pagos, cortes y ventas de forma irreversible (DAT-C1).
7. **Restaurar un archivo que no sea una BD válida deja la app inoperante hasta intervención manual** (DAT-A3): no se valida la cabecera SQLite ni `integrity_check` antes de sobrescribir (`respaldos.ts:169-191`), y si `reabrirDb()` falla, `dbInstance` queda `null` (`db/index.ts:69-73`).
8. **No hay respaldo previo a `migrate()` en el arranque** (DAT-A4): la única red son los respaldos diarios, que se podan a 3.

## 2. How the system actually works (reference)

### 2.1 Arranque y migraciones
```
initDb(userData)                       main.ts:127
  → new Database(cabina.sqlite3)       db/index.ts:16
  → PRAGMA journal_mode=WAL; foreign_keys=ON          db/index.ts:17-18
  → if exists(__dirname/../drizzle) migrate()         db/index.ts:22-25   ← se omite EN SILENCIO si falta la carpeta
       migrate: BEGIN; por cada migración con when > último created_at: stmts + INSERT __drizzle_migrations; COMMIT | ROLLBACK
                                       drizzle-orm/sqlite-core/dialect.js:657-673
asegurarRespaldoAutomaticoDiario()     main.ts:142-146  ← DESPUÉS de migrar
```
Diseño: el orden de aplicación lo decide `when` del journal, no el hash (el hash solo se guarda). Los `when` de 0002 y 0003 son valores redondos (`1784301000000`, `1784900000000` = 2026-07-17 y 2026-07-24) → escritos a mano, no por `drizzle-kit generate`; funciona porque son monótonos (DAT-B5).

### 2.2 Por qué el flujo híbrido no se alcanza (incidente 1)
```
UI  Productos.tsx:52-58 / Resumen.tsx:303-311  → useEliminarHibrido (use-eliminar-hibrido.ts:41-49)
     ↓ window.api.productos.eliminar / inventario.eliminarLote
IPC ipc/index.ts:160-161 / :180-181
     ↓
eliminarProducto (productos.ts:117-120) / eliminarLote (inventario.ts:219-222)
     ↓ eliminarOFallarConHistorial(() => db.delete(...).run(), msg)     errores.ts:20-28
         db.delete().run() es síncrono y NO envuelve el error (drizzle-orm/sqlite-core/query-builders/delete.js:101-103 → better-sqlite3/session.js:69-73)
         SQLite: DELETE sobre padre con hijos `ON DELETE RESTRICT` → SqliteError
             message = "FOREIGN KEY constraint failed"
             code    = "SQLITE_CONSTRAINT_TRIGGER"        ← RESTRICT se implementa como trigger interno
         esErrorForeignKey: code === "SQLITE_CONSTRAINT_FOREIGNKEY" → false   errores.ts:12-14
         → se relanza el SqliteError crudo
     ↓ Electron: sendReply({ error: err.toString() }) → renderer: new Error(`Error invoking remote method '…': ${error}`)
       (verificado en el binario de Electron 43: `replyWithError … error:r.toString()`)
     ↓ mensajeDeError (src/lib/errores.ts:4-13) quita el prefijo IPC y `^Error:` — "SqliteError:" no coincide
     ↓ tieneHistorialAsociado → false (no hay marcador) → toast.error("SqliteError: FOREIGN KEY constraint failed")
```
Experimento (scratchpad, `:memory:`, mismo driver y SQLite que la app, `foreign_keys=ON`):
```
on delete restrict     -> code= SQLITE_CONSTRAINT_TRIGGER     | msg= FOREIGN KEY constraint failed
on delete no action    -> code= SQLITE_CONSTRAINT_FOREIGNKEY  | msg= FOREIGN KEY constraint failed
(default)              -> code= SQLITE_CONSTRAINT_FOREIGNKEY  | msg= FOREIGN KEY constraint failed
sqlite_version= 3.53.2
```
El código `SQLITE_CONSTRAINT_FOREIGNKEY` sí existe en el driver (`better-sqlite3/src/util/constants.cpp:121`), pero solo lo produce `NO ACTION`. Conclusión: **BUG** en `errores.ts:13` (comparación contra el código equivocado para el tipo de FK que usa todo el esquema). El helper existe desde `v0.1.0` (`249de22` es ancestro de `c5df20a`), así que el síntoma no es "versión vieja".

Efecto colateral confirmado por lectura: cuando el `ErrorConHistorial` SÍ se lanza (proveedores, `proveedores.ts:67-70`; servicios con citas, `serviciosCatalogo.ts:62-63`), `err.toString()` produce `"ErrorConHistorial: HISTORIAL_ASOCIADO:…"`; `mensajeDeError` quita el marcador pero no el nombre, y el diálogo muestra `"ErrorConHistorial: Este proveedor tiene…"` (DAT-B1).

### 2.3 Qué pasa hoy en cada camino de borrado
| Camino (IPC → servicio) | Mecanismo de protección | FKs que lo bloquean | Resultado real hoy |
|---|---|---|---|
| `productos:eliminar` → `productos.ts:115-127` | wrapper (`restrict`) | `lotes`, `entradas`, `salidas`, `consumidos`, `servicios_catalogo_productos` | **Error crudo** (DAT-A1); el mensaje omite "recetas" (DAT-B8) |
| `inventario:eliminarLote` → `inventario.ts:217-224` | wrapper (`restrict`) | `entradas` (siempre ≥1: todo lote nace en `registrarEntrada`, `inventario.ts:326-341,346-362`), `salidas`, `consumidos` | **Error crudo**; además el botón nunca puede tener éxito (DAT-B7) |
| `clientes:eliminar` → `clientes.ts:156-168` | wrapper (`restrict`) | `citas`, `servicios_realizados`, `pagos` | **Error crudo** |
| `tiposProducto:eliminar` → `tiposProducto.ts:46-49` | wrapper (`restrict`) | `productos.tipo_producto_id` | **Error crudo** |
| `serviciosCatalogo:eliminar` → `serviciosCatalogo.ts:59-67` | chequeo manual de `citas` + wrapper | `servicios_realizados` (`restrict`) | Híbrido OK solo si hay citas; error crudo si solo hay servicios realizados |
| `proveedores:eliminar` → `proveedores.ts:60-80` | chequeo manual (productos, lotes, entradas) | ninguna (`set null`) | Híbrido OK (con prefijo "ErrorConHistorial:" en el diálogo) |
| salidas / entradas | **no existe** | — | Incidente 2 (DAT-A2) |
| pagos / cortes / servicios realizados | **no existe borrado** | — | Correcto (dinero se conserva) |

### 2.4 Stock
```
stockTotal(producto) = Σ lotes.cantidad_disponible WHERE estado='activo'          inventario.ts:104
entrada (tx): lote.disponible += q; lote.inicial += q  (lote existente)             inventario.ts:316-323   ← no reactiva 'agotado'
              o INSERT lote(inicial=q, disponible=q, estado='activo')              inventario.ts:326-341
              INSERT entradas(total = q*costo)  + movimientos(tipo='entrada')      inventario.ts:346-378
salida  (tx): candidatos = lote fijo | activos, disponible>0, no caducados, orden FEFO/FIFO   inventario.ts:459-482
              por lote: tomar=min(restante, disponible); disponible-=tomar; estado='agotado' si <=0   :500-512
              INSERT salidas(valor = tomar*costo_lote) + movimientos(tipo = tipoSalida)              :515-547
cierre cita : consumo en modo 'contenido' → piezas = cantidad / contenido_cantidad   serviciosRealizados.ts:24-36
```
Todo en `real` (flotante): fracciones de pieza (5/60) acumulan residuos (DAT-M2). `servicios_productos_consumidos` **nunca se escribe** (ningún `insert` en `electron/services/`; solo lo leen `reportesResumen.ts:70-76,226-232` y `reportesServiciosDetalle.ts:50-56`): el consumo real vive en `salidas_inventario.servicio_realizado_id` (DAT-M6).

### 2.5 Respaldos, restauración, reinicio
- `crearRespaldo` (`respaldos.ts:59-110`): `wal_checkpoint(TRUNCATE)` (`:64`, `db/index.ts:64-66`) y copia síncrona del archivo (`:67`) → copia consistente. Nombre `cabina_auto_<motivo>_<ts>.zip` para TODOS los automáticos, incluidos los de seguridad (`:90-92`); poda a 3 (`:22,118-135`).
- `aplicarRespaldoDesdeArchivo` (`:155-215`): valida solo que existan `manifest.json` y `cabina.sqlite3` en el zip (`:171-181`); para `.sqlite3` no valida nada (`:184`). Luego checkpoint, `closeDb`, `writeFileSync`, borra `-wal/-shm` (`:187-195`), reemplaza `Datos/` (`:197-205`), `reabrirDb()` → vuelve a correr `migrate()` sobre la BD restaurada (`:210`, `db/index.ts:45-47`). Antes de todo: PIN + respaldo "antes_de_restaurar" (`:218-234`).
- `borrarDatosNegocio` (`reinicio.ts:44-73`): PIN, respaldo "antes_de_borrar_negocio" (`:52`), `DELETE` de 18 tablas con `foreign_keys=OFF` y **sin transacción** (`:55-59`, `db/index.ts:76-86`); incluye `bitacora` (`:16`).
- `restablecerDeFabrica` (`:80-113`): respaldo, cierra, borra el archivo, relanza. Correcto.

## 3. Data origin

| Data | Origin | Status |
|---|---|---|
| Esquema en la cabina (`__drizzle_migrations`) | `migrate()` automático en cada arranque (`db/index.ts:22-25`); 4 migraciones nunca reescritas | ✅ correcto (verificar filas en un respaldo: `APPLIED-MIGRATIONS.md` sigue `[pending]`) |
| `drizzle/meta/_journal.json` | 0000/0001 por drizzle-kit; 0002/0003 `when` escritos a mano | ⚠️ funciona (monótono); regla en DAT-B5 |
| `lotes.cantidad_disponible` / `estado` | `registrarEntrada` / `registrarSalidaEnTx` en transacción | ✅ consistente; ⚠️ residuos flotantes (DAT-M2), `agotado` no se reactiva (DAT-B2) |
| `movimientos` | insert gemelo de cada entrada/salida, `referencia_id` al documento | ✅ rastro completo; sin camino de reversión (DAT-A2) |
| `servicios_productos_consumidos` | nadie escribe | 🔴 tabla vacía que los reportes leen (DAT-M6) |
| `bitacora` | `registrarAccion` en cada servicio; dentro de la tx en entradas/salidas/cierre, fuera de ella en los borrados | ⚠️ DAT-B3; se vacía en `borrarDatosNegocio` (DAT-M1) |
| `respaldos_log` + `.zip` en `<raíz>/Respaldos` | `crearRespaldo`; poda automática | 🔴 DAT-C1 (seguridad podada); ⚠️ DAT-B6 (antes_de_restaurar invisible) |
| Rutas en `clientes.carpeta_path`, `servicios_realizados.carpeta_path`, `archivos.ruta_fisica` | `migrarRutasCarpetas` con `replace()` idempotente en cada arranque y tras restaurar (`migracionCarpetas.ts:14-31`) | ✅ correcto (sin transacción, pero cada UPDATE es idempotente) |

## 4. Case by case

No hay casos de datos: la auditoría fue exclusivamente de código (no existe BD en el repo y no se abrió ninguna). La tabla de §2.3 hace las veces de "caso por caso" para los caminos de borrado. Hallazgos sueltos no cubiertos arriba:

- **Reactivación de lote (DAT-B2, latente):** `registrarEntrada` sobre un `loteId` existente suma cantidades pero no cambia `estado` (`inventario.ts:316-323`); un lote `agotado` que reciba stock quedaría invisible para `stockTotal` y para el FEFO (`:104`, `:475`). Hoy no es alcanzable: `EntradaForm.tsx:25-26` declara `loteId` pero no ofrece selector de lote.
- **Pre-chequeo de stock fuera de la transacción (diseño, correcto):** `verificarStockSuficiente` (`inventario.ts:409-440`) avisa todos los faltantes a la vez; el descuento real revalida dentro de la tx (`:484-494`). Proceso único, sin carrera real.
- **Dinero en inventario:** `entradas.total = cantidad*costo` (`:356`) y `salidas.valor = tomar*costo_lote` (`:525`) en `real`. Se deja a la auditoría de dinero decidir la representación; aquí solo se anota que las valuaciones de inventario heredan el mismo problema de redondeo (DAT-M2).

## 5. Active risks — with detonation dates

### 5.1 El respaldo de seguridad de un borrado se poda solo (DAT-C1)
`borrarDatosNegocio` crea `cabina_auto_antes_de_borrar_negocio_<ts>.zip` (`reinicio.ts:52` → `respaldos.ts:90-91`). `respaldos_log` se conserva a propósito (`reinicio.ts:11-13`), así que `podarRespaldosAutomaticos` (`respaldos.ts:118-135`) lo ve como un automático más y, al tercer respaldo automático posterior (diario, `respaldos.ts:259-269`, uno por día en que se abre la app), lo **borra del disco** (`:129`). Lo que se perdió con ese borrado —`pagos`, `cortes`, `salidas` tipo venta, `servicios_realizados`— deja de ser recuperable. Es irreversible y tiene exposición legal (CFF art. 30, 5 años) → Critical, aunque el disparo lo inicie la usuaria, porque la UI le asegura lo contrario (`Respaldos.tsx:282-283`).
Nota: `antes_de_restaurar` NO se poda (su fila queda en la BD que se sobrescribe) pero por lo mismo nunca aparece en la lista de la app (DAT-B6); `antes_de_restablecer_fabrica` tampoco se poda (la BD nueva no lo conoce).

### 5.2 Scheduled degradations
| # | What is lost | Date |
|---|---|---|
| 1 | Único respaldo previo a "Borrar datos de negocio" (y con él los registros de dinero borrados) | 3.er día de uso posterior al borrado (3.er respaldo diario; antes si se crean otros automáticos) |
| 2 | Único respaldo anterior a una migración errónea-pero-exitosa (DAT-A4) | 3.er día de uso posterior al release que la trajo |
| 3 | Exactitud de `cantidad_disponible` en productos modo "contenido" (DAT-M2) | continuo; cada consumo fraccionario acumula ±1e-16 |
| 4 | Reportes de costo/margen por servicio (DAT-M6) | ya hoy: siempre 0 |

### 5.3 Root cause
Dos reglas de fondo producen la mayoría de los síntomas: (a) **la política de retención no distingue "automático de rutina" de "automático de seguridad"** — un solo prefijo y un solo contador; (b) **el modelo de inventario es append-only sin operación de reversión**, así que cualquier error de captura solo puede "corregirse" con otro movimiento que no sabe que es una corrección. El incidente 1 es independiente: una comparación contra el código de error equivocado.

## 6. Proposed corrective plan

- **Step 0 — NOW:** (1) Avisar a la usuaria que, tras un "Borrar datos de negocio" o antes de probar restauraciones, copie a mano el `.zip` `cabina_auto_antes_de_*` fuera de `<raíz>/Respaldos` (la poda solo toca esa carpeta). (2) No registrar entradas "de corrección" para deshacer una salida equivocada hasta que exista la cancelación (DAT-A2): anotar el folio y esperar al fix.
- **Decision A — Semántica de la cancelación de salidas:** ¿contra-movimiento (la salida queda `vigente` y se crea una salida negativa) o estado `cancelada` sobre la propia fila + movimiento de reversión? Recomendación: estado sobre la fila + movimiento nuevo (ver cambio DAT-A2), porque conserva el folio y el valor del documento original (CFF) y los reportes pueden filtrar `estatus='vigente'`. ¿Se permite cancelar una venta ya cobrada? Propuesta: sí, pero solo si el pago vinculado también se cancela en la misma transacción o el servicio está `abierto`; eso lo decide la auditoría de dinero.
- **Decision B — Retención de respaldos de seguridad:** ¿nunca podar los `antes_de_*` (crecen ~tamaño BD+archivos por evento, eventos raros) o conservar los últimos N=5 por separado? Recomendación: nunca podar; son pocos y la usuaria puede borrarlos a mano.
- **Decision C — ¿Debe poderse borrar un lote?** Hoy es imposible (DAT-B7). Opciones: quitar el botón y dejar solo "Bloquear", o permitirlo solo cuando todas sus entradas se cancelen (depende de DAT-A2).

**Proposed change (DAT-A1 — fix del flujo híbrido):**
1. `electron/services/errores.ts:12-14`: reconocer la violación por **mensaje y familia de código**, no por un código exacto:
   `code` que empiece por `SQLITE_CONSTRAINT` **y** `message === "FOREIGN KEY constraint failed"` (cubre `_TRIGGER` para `restrict` y `_FOREIGNKEY` para `no action`/diferidas).
2. `src/lib/errores.ts:6-9`: quitar cualquier prefijo `<Nombre>Error:` (p. ej. `/^[A-Za-z]*Error:\s*/`) para que ni `SqliteError:` ni `ErrorConHistorial:` lleguen a la usuaria (DAT-B1).
3. `productos.ts:119`: el mensaje debe incluir "recetas de servicios" (DAT-B8).
4. Prueba manual (PROJECT.md → verificación): en BD de prueba, producto con un lote → Configuración › Productos › Eliminar → debe aparecer "No se puede eliminar / Desactivar en su lugar"; repetir con lote, clienta con cita y tipo de producto en uso.

**Proposed change (DAT-A2 — cancelación de salidas y entradas):** migración `0004` + servicio + UI, en este orden:
1. Migración (generada con `npm run db:generate`, journal incluido): `salidas_inventario` y `entradas_inventario` ganan `estatus text NOT NULL DEFAULT 'vigente'` (`vigente | cancelada`), `cancelada_at integer`, `cancelada_motivo text`, `cancelada_por_usuario_id text` (FK `usuarios`, `set null`). Sin `DROP`/recreación de tablas (ver DAT-M4).
2. `cancelarSalida(id, motivo, usuarioId)` en **una transacción** (`db.transaction`, nada async dentro):
   a. Cargar la salida; rechazar si `estatus='cancelada'`; rechazar si `motivo` vacío.
   b. Si `servicio_realizado_id` apunta a un servicio `cerrado`: bloquear con mensaje claro (o exigir PIN y dejar el servicio marcado para revisión) — decisión A. Las `venta` son registro de dinero: **nunca `DELETE`**, nunca tocar `folio` ni `valor`.
   c. Lote: `cantidad_disponible += salida.cantidad`; si `estado='agotado'` → `'activo'`; si `'bloqueado'` no cambiar; `cantidad_inicial` intacta.
   d. `movimientos`: INSERT nuevo con `tipo='cancelacion_salida'`, `cantidad=+salida.cantidad`, `referencia_tipo='salida_inventario'`, `referencia_id=salida.id`, `observaciones=motivo`. El movimiento original **no se borra ni se edita**.
   e. Salida: `estatus='cancelada'`, `cancelada_at`, `cancelada_motivo`, `cancelada_por_usuario_id`.
   f. `servicios_productos_consumidos`: cuando DAT-M6 se corrija y la fila exista, borrar/marcar la fila cuyo `salida_inventario_id` = salida (hoy no hay nada que tocar).
   g. `registrarAccion(tx, { accion: 'salida_cancelada', entidadTipo: 'salida', entidadId, detalle: folio · tipo · -cantidad · motivo })`.
3. `cancelarEntrada(id, motivo, usuarioId)`: misma estructura; solo si `lote.cantidad_disponible >= entrada.cantidad` (nada de esa entrada se ha consumido), si no, bloquear ("cancela primero las salidas de este lote"). Lote: `disponible -= q`, `inicial -= q`; si queda en 0 → `'agotado'`. Movimiento `cancelacion_entrada` con `cantidad=-q`.
4. Lecturas: `stockTotal` no cambia (lee lotes). Reportes de compras/ventas/consumos deben filtrar `estatus='vigente'`; `listarMovimientos` muestra ambos movimientos (el original y la cancelación) para que el rastro sea legible.
5. UI: en Movimientos, acción "Cancelar…" por fila con folio (pide motivo; confirmación destructiva en tono Bellora); filas canceladas en gris con el motivo. Prohibido ofrecer "Eliminar".

**Proposed change (DAT-C1 / Decision B):** en `respaldos.ts`, separar prefijos (`cabina_auto_diario_` vs `cabina_seguridad_<motivo>_`) y que `podarRespaldosAutomaticos` filtre solo el primero; `mapear` expone `esAutomatico`/`esSeguridad` para que la lista los distinga. Añadir al nombre del zip un sufijo con la versión de la app.

**Proposed change (DAT-A3):** antes de `closeDb()` en `aplicarRespaldoDesdeArchivo`: (1) comprobar que `bufferDb` empieza por `"SQLite format 3\0"`; (2) escribirlo en `cabina.restore.tmp`, abrirlo en solo lectura y exigir `PRAGMA integrity_check = ok` y la existencia de `__drizzle_migrations`; (3) solo entonces renombrar (`renameSync`, atómico) sobre `cabina.sqlite3`; (4) si `reabrirDb()` lanza, restaurar el pre-respaldo automáticamente y relanzar con mensaje. `main.ts:126`: envolver `initDb` en `try/catch` con diálogo que nombre el archivo y la carpeta `Respaldos`, y `app.quit()` en vez de proceso zombi.

**Proposed change (DAT-A4):** en `abrirConexion`, antes de `migrate()`, leer `__drizzle_migrations` y el journal; si hay migraciones pendientes, copiar `cabina.sqlite3` (tras checkpoint) a `Respaldos/cabina_seguridad_pre_migracion_<ver>_<ts>.sqlite3` y registrar la acción tras migrar. Hacer fatal (no silenciosa) la ausencia de la carpeta `drizzle/` en producción (DAT-B4).

**Proposed change (DAT-M1):** `ejecutarSinForeignKeys(() => db.transaction(tx => { for … tx.delete(tabla).run() }))` — el `PRAGMA` debe quedar fuera de la transacción (dentro es no-op), la transacción dentro del `PRAGMA`. Decidir si `bitacora` se conserva (recomendado: sí, es la evidencia de que hubo un borrado y de qué había antes).

**Proposed change (DAT-M2):** cantidades en piezas con redondeo fijo (p. ej. `Math.round(x*1e6)/1e6` en `registrarSalidaEnTx` y `aPiezas`) y umbral `<= 1e-6` para `agotado`; alternativa de fondo: almacenar milésimas como `integer`. Dinero: ver auditoría de dinero.

**Proposed change (DAT-M3):** en la extracción, normalizar `relativa` y rechazar la entrada si `path.resolve(carpetaDatos, relativa)` no empieza por `carpetaDatos + sep` (reutilizar `resolverRealParcial` de `folders.ts:112`). Extraer a un directorio temporal y renombrar al final.

**Proposed change (DAT-M4):** regla documental (en `APPLIED-MIGRATIONS.md` o `docs/`): toda migración generada se revisa buscando `PRAGMA foreign_keys` o `__new_`; si aparece, la migración se reescribe para no reconstruir tablas o el migrador se invoca con FKs apagadas fuera de la transacción. Probar siempre sobre una copia de respaldo anonimizada antes de taggear.

**Proposed change (DAT-M6):** o bien `cerrarCita` inserta en `servicios_productos_consumidos` (`servicio_realizado_id`, `producto_id`, `lote_id`, `cantidad`, `salida_inventario_id`) por cada salida creada (`registrarSalidaEnTx` ya devuelve las salidas, `inventario.ts:561`), o bien los reportes dejan de leer esa tabla y usan `salidas_inventario WHERE tipo_salida='consumo_servicio' AND estatus='vigente'`. Lo segundo es más barato y no duplica datos.

**Pending manual verification** (solo lectura, sobre una COPIA de un respaldo de la cabina abierta fuera del repo; reportar únicamente los conteos):

```sql
-- Qué migraciones aplicó realmente la instalación (alimenta APPLIED-MIGRATIONS.md)
SELECT id, created_at FROM __drizzle_migrations ORDER BY created_at;
-- Expected: 4 filas con created_at = 1783628622412, 1783638355537, 1784301000000, 1784900000000

-- Integridad referencial real (FKs estuvieron ON desde v0.1.0; debería estar vacío)
PRAGMA foreign_key_check;
-- Expected: 0 filas

-- Consistencia lote vs. movimientos (residuos flotantes y asimetrías)
SELECT COUNT(*) FROM lotes l
WHERE ABS(l.cantidad_disponible - (
  COALESCE((SELECT SUM(cantidad) FROM entradas_inventario e WHERE e.lote_id = l.id),0)
  - COALESCE((SELECT SUM(cantidad) FROM salidas_inventario s WHERE s.lote_id = l.id),0))) > 1e-6;
-- Expected: 0

-- Lotes 'activo' con residuo flotante (DAT-M2)
SELECT COUNT(*) FROM lotes WHERE estado='activo' AND cantidad_disponible > 0 AND cantidad_disponible < 1e-6;
-- Expected: 0 (si > 0, DAT-M2 ya se manifestó)

-- Lotes agotados con stock (DAT-B2, no debería ocurrir hoy)
SELECT COUNT(*) FROM lotes WHERE estado='agotado' AND cantidad_disponible > 0;
-- Expected: 0

-- Tabla de consumos nunca escrita (DAT-M6)
SELECT COUNT(*) FROM servicios_productos_consumidos;
-- Expected: 0  (confirma que los reportes de costo por servicio leen una tabla vacía)

-- Respaldos de seguridad aún vivos en el log (DAT-C1)
SELECT COUNT(*) FROM respaldos_log WHERE ruta_archivo LIKE '%cabina_auto_antes_de_%';
-- Expected: 0 o 1 si hubo un borrado hace menos de 3 días; compárese con `ls <raíz>/Respaldos`
```

## 7. What follows

1. **Carlos decide A, B y C** (semántica de cancelación, retención de respaldos de seguridad, destino del botón "Eliminar lote").
2. **Ingeniería prepara en una sola rama los fixes de una línea:** DAT-A1 (`errores.ts`), DAT-B1 (`src/lib/errores.ts`), DAT-B8 (mensaje) → `npm run typecheck && npm run build` + prueba manual del flujo híbrido en BD de prueba → release `v0.1.5`. Cierra el incidente 1.
3. **Ingeniería prepara DAT-C1** (prefijos de respaldo) y DAT-A3/A4 (validación de restauración, respaldo pre-migración) → mismo release si el tiempo alcanza; son cambios en `respaldos.ts`/`db/index.ts`, superficie crítica → auditoría antes de integrar (PROJECT.md).
4. **Carlos pide a la usuaria un respaldo**, lo abre fuera del repo y corre las consultas de §6; registra los conteos aquí y rellena `APPLIED-MIGRATIONS.md`.
5. **DAT-A2 (cancelación de salidas/entradas) entra por Gate** con la migración `0004` generada por drizzle-kit, revisada contra DAT-M4, probada sobre una copia anonimizada y publicada en un release propio; después de eso, decisión C y DAT-B7.
6. **DAT-M1, M2, M3, M6** en la ola de este mes; **DAT-B2–B6** en backlog explícito.

### Anti-lista (no perseguir ahora)
- *`migrate()` con `foreign_keys=ON` en las migraciones actuales:* 0000–0003 no reconstruyen tablas; no hay riesgo hoy. Reabrir si una migración generada contiene `PRAGMA foreign_keys` o `__new_` (DAT-M4 es la regla, no una tarea).
- *Carrera entre `verificarStockSuficiente` y la transacción de cierre:* proceso único con `requestSingleInstanceLock` (`main.ts:21-23`); reabrir si la app llega a tener dos procesos escritores o un servidor.
- *`cantidad_inicial` acumulativa al re-entrar a un lote:* no alcanzable desde la UI (DAT-B2); reabrir cuando `EntradaForm` ofrezca selector de lote.

---

### Índice de hallazgos (códigos permanentes)

| Código | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| DAT-C1 | 🔴 | Respaldo de seguridad previo a "Borrar datos de negocio" se poda a los 3 automáticos siguientes; la UI promete lo contrario; pérdida irreversible de pagos/cortes/ventas | `respaldos.ts:17,22,90-91,118-135`; `reinicio.ts:11-13,52`; `Respaldos.tsx:282-283` |
| DAT-A1 | 🟠 | `esErrorForeignKey` compara con `SQLITE_CONSTRAINT_FOREIGNKEY`; `ON DELETE RESTRICT` produce `SQLITE_CONSTRAINT_TRIGGER` → flujo híbrido nunca se alcanza (productos, lotes, clientas, tipos, servicios) — **BUG** (incidente 1) | `errores.ts:12-14`; experimento §2.2; `delete.js:101-103`; `session.js:69-73` |
| DAT-A2 | 🟠 | No existe cancelación ni reversión de salidas/entradas; la corrección improvisada corrompe compras y `cantidad_inicial` — **DISEÑO** (incidente 2) | `ipc-contract.ts:106-111`; `Movimientos.tsx:39-43`; ausencia de `delete`/`update` sobre `salidas_inventario` en `electron/services/` |
| DAT-A3 | 🟠 | Restaurar no valida cabecera ni integridad antes de sobrescribir; si `reabrirDb` falla la app queda sin BD y al relanzar sin ventana útil; recuperación solo manual | `respaldos.ts:169-191,210`; `db/index.ts:45-47,69-73`; `main.ts:15-18,126-127` |
| DAT-A4 | 🟠 | Sin respaldo previo a `migrate()`; la red (diarios) se poda a 3 | `db/index.ts:22-25`; `main.ts:126-146`; `respaldos.ts:22` |
| DAT-M1 | 🟡 | Borrado masivo con FKs OFF fuera de transacción; vacía `bitacora` | `reinicio.ts:14-33,55-59`; `db/index.ts:76-86` |
| DAT-M2 | 🟡 | Flotantes en cantidades (fracciones de pieza) y valuaciones; residuos impiden `agotado` y sesgan `verificarStockSuficiente` | `inventario.ts:318-319,356,433-434,484-485,502-508,525`; `serviciosRealizados.ts:33` |
| DAT-M3 | 🟡 | Extracción de `archivos/` del zip sin normalizar rutas (zip-slip) tras `rmSync` de `Datos/`; `.sqlite3` sin validación alguna | `respaldos.ts:182,184,198-204` |
| DAT-M4 | 🟡 | Migraciones futuras que reconstruyan tablas: `PRAGMA foreign_keys=OFF` generado por drizzle-kit es no-op dentro del `BEGIN` del migrador con FKs ON | `dialect.js:657-673`; `db/index.ts:18` |
| DAT-M5 | 🟡 | `migrarRutasCarpetas` y `asegurarEstructuraRaiz` corren tras restaurar sin transacción ni verificación de que las rutas existan; inofensivo hoy por idempotencia, pero sin rastro en bitácora | `respaldos.ts:211-214`; `migracionCarpetas.ts:14-31` |
| DAT-M6 | 🟡 | `servicios_productos_consumidos` nunca se escribe; los reportes de costo por servicio la leen (siempre vacía) | `reportesResumen.ts:70-76,226-232`; `reportesServiciosDetalle.ts:50-56`; sin `insert` en `electron/services/` |
| DAT-B1 | ⚪ | `mensajeDeError` solo quita `^Error:`; nombres `SqliteError:`/`ErrorConHistorial:` llegan a la usuaria | `src/lib/errores.ts:6-9` |
| DAT-B2 | ⚪ | Re-entrada a lote existente no reactiva `agotado` (latente, UI no lo expone) | `inventario.ts:316-323`; `EntradaForm.tsx:25-26` |
| DAT-B3 | ⚪ | Borrado y bitácora fuera de transacción; `eliminarProveedor` chequea y borra sin tx | `productos.ts:117-126`; `inventario.ts:219-223`; `clientes.ts:158-167`; `proveedores.ts:62-79` |
| DAT-B4 | ⚪ | `migrate()` se omite en silencio si falta `drizzle/` (hoy empaquetado) | `db/index.ts:23-25`; `package.json` `build.files` |
| DAT-B5 | ⚪ | `when` de 0002/0003 escritos a mano (valores redondos); funciona por monotonía; regla: journal solo por `db:generate` | `drizzle/meta/_journal.json`; `git log -- drizzle/` |
| DAT-B6 | ⚪ | `antes_de_restaurar` se registra en la BD que luego se sobrescribe → el zip existe pero nunca aparece en la lista | `respaldos.ts:224-234,187-191` |
| DAT-B7 | ⚪ | "Eliminar lote" no puede tener éxito nunca (todo lote tiene ≥1 entrada `restrict`) | `inventario.ts:217-224,326-362`; `schema.ts:157-159`; `Resumen.tsx:303-311,401-409` |
| DAT-B8 | ⚪ | Mensaje de producto con historial omite las recetas (`servicios_catalogo_productos` `restrict`) | `productos.ts:119`; `schema.ts:81-83` |
