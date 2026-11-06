# Auditoría — Descuentos en el cierre y cambio de servicio (migración 0006, `cobros.ts`, `cerrarCita`, lectores de dinero) — 2026-11-06 (DES-*)

**Scope:** Working tree sin commitear de la rama `atlas/descuentos` sobre `59843c6`. Código:
`drizzle/0006_descuentos.sql`, `drizzle/meta/0006_snapshot.json`, `drizzle/meta/_journal.json`,
`electron/db/schema.ts`; `electron/services/cobros.ts` (único escritor de `pagos` y ahora de
`descuentos_servicio` y de la caché), `serviciosRealizados.ts` (`cerrarCita`, `obtenerDetalle`),
lectores `citas.ts`, `dashboard.ts`, `reportesResumen.ts`, `reportesFinanzas.ts`,
`reportesClientesDetalle.ts`, `reportesServiciosDetalle.ts`; `reinicio.ts`; `electron/ipc/index.ts`,
`electron/preload.ts`; `shared/{schemas,types,descuentos,ipc-contract}.ts`; UI
`src/components/cobros/DescuentoCampo.tsx`, `src/pages/agenda/CierreCitaModal.tsx`,
`src/pages/agenda/PagosDeCita.tsx`, `src/components/reportes/FinanzasReportes.tsx`,
`src/pages/configuracion/Bitacora.tsx`. Se mide contra el
[spec de descuentos](spec-descuentos-2026-11-06.md) (§6–§10, §13, §18, §20) y las 11 condiciones
del [Gate 001](gate-001-descuentos-2026-11-06.md), con el diseño del cobro
([spec](spec-modulo-cobro-2026-11-04.md), [Gate](gate-001-modulo-cobro-2026-11-04.md),
[auditoría Parte A](auditoria-cobro-v2-parte-a-2026-11-05.md)) como base heredada. **No auditado:**
`src/components/ui/select-buscable.tsx` (cambio previo, no crítico; solo su uso en el cierre),
`CitaDetalleModal.tsx` más allá de que ya no consume `detalle.precio`, la Parte B, la ficha clínica,
SEG-A1 (candado de la app), CIT-C1 (reversa de servicio cerrado), DIN-A3.
**Method:** Solo lectura. `git status`/`git diff`, lectura de archivos, las 11 verificaciones del
Gate corridas tal cual y además sin líneas de comentario, `npm run typecheck` y `npm run build`
(ambos verdes). Prueba de la migración sobre una **copia sintética** en SQLite 3.45 (CLI, en el
scratchpad): migraciones `0000`–`0003` + 2 clientas/servicios inventados + `0004`+`0005`+`0006`
dentro de un solo `BEGIN/COMMIT` con `foreign_keys = ON` (misma secuencia que
`drizzle-orm/sqlite-core/dialect.js:657-676`, que es la que correrá en la cabina), y 12 sondas
(T1–T12) contra el índice parcial, los CHECK, las FK y la consulta AC-007. No se ejecutó la app;
los AC se trazaron en código.
**PII declaration:** Sin PII. No se abrió ninguna base real ni respaldo. Los datos de prueba son
inventados; `CL-0001` y `SRV-0001/0002` son placeholders del fixture. Ningún nombre, teléfono ni
nota.
**State as of:** 2026-11-06 00:51 CST, rama `atlas/descuentos` @ `59843c6` + working tree (23
archivos modificados, 6 sin rastrear).

---

## 1. Resumen ejecutivo

1. **La definición de dinero con descuentos es CORRECTA y única.** `totalTicket` =
   `(precio − descuento_servicio) + (total_productos − descuento_productos)` con un solo redondeo
   (`cobros.ts:76-80`); `saldoServicio` y `derivarEstatusPago` la consumen sin cambios
   (`cobros.ts:83-96`); `ingresoDelServicio` resta solo el descuento del servicio
   (`cobros.ts:162-164`). El tipo `MontosTicket` exige los dos campos (`cobros.ts:65-70`), y los
   siete lectores los seleccionan de la misma fila (condición 4: grep → 7 archivos, 0 escritores
   fuera de `cobros.ts`). Ventas de Resumen, serie, Finanzas, Dashboard, Clientes y Servicios son
   netas; el corte no lee `servicios_realizados` (BR-004 por construcción).
2. **BR-005 (nunca saldo a favor implícito) se cumple en los dos caminos.** Al cerrar, `porCobrar`
   usa el total neto y rechaza anticipos > total y pagos > por cobrar
   (`serviciosRealizados.ts:325-334`). Después del cierre, `aplicarDescuento` cancela el previo,
   inserta el nuevo, recalcula la caché y **recién entonces** compara `cobrado > total`; si falla,
   la transacción revierte todo y el descuento anterior sigue vigente (`cobros.ts:740-758`). La UI
   calcula el mismo máximo (`PagosDeCita.tsx:458`) pero el servidor es quien decide.
3. **BR-001 (un descuento manual vigente por base) está en esquema y en código.** El índice único
   parcial sí salió con su `WHERE` (`0006_descuentos.sql:104`; sonda T2 → `UNIQUE constraint
   failed`), `aplicarDescuentoEnTx` cancela el previo antes de insertar (`cobros.ts:694-706`; T3
   pasa), y la caché se recalcula desde la tabla, nunca incrementalmente (`cobros.ts:638-650`), así
   que AC-007 se cumple por construcción y la consulta del encabezado sí detecta un desfase (T12).
4. **La migración `0006` es segura para la instalación real.** Aditiva, sin backfill, sin
   recreación de tablas (greps sin comentarios: 0 CHECK enumerados, 2 CHECK numéricos, 2 `ALTER
   TABLE`, 0 `__new_/DROP/UPDATE`), FK `restrict` a `servicios_realizados` y `set null` a
   `usuarios` (T9, T10), `created_at` con `unixepoch()` como la `0005`, journal idx 6, snapshot
   `prevId` = id de la 0005. `0004`+`0005`+`0006` entran en un solo `BEGIN` y las filas viejas
   quedan en 0 (sonda: `no_retro` = 0). `respaldarAntesDeMigrar` se dispara porque hay pendientes.
5. **El cambio de servicio en el cierre es correcto y acotado.** `cerrarCita` escribe
   `servicio_catalogo_id` en el servicio y en la cita dentro de su transacción
   (`serviciosRealizados.ts:351,370-379`), calcula el mantenimiento con el servicio nuevo (`244-247`),
   registra `servicio_cambiado_en_cierre` (`381-389`) y no renombra la carpeta (grep → 0). El stock
   se verifica con los insumos que manda la UI, que recarga la receta del servicio nuevo
   (`CierreCitaModal.tsx:105-116`). Solo aplica a servicios `abierto` (BR-010): `aplicarDescuento`
   exige `cerrado` y `actualizarCita` solo sincroniza borradores abiertos (`citas.ts:173-182`).
6. **Un hueco de evidencia, no de código → DES-A1.** No existe
   `.notes/evidencia-descuentos-<fecha>.md` (condición 11b del Gate: AC-001…AC-009 con el texto de <!-- atlas-allow: archivo futuro que exige la condición 11b del Gate -->
   la consulta AC-007 y la salida de AC-009). Las pruebas se hicieron según el solicitante, pero no
   están escritas; sin esa nota la condición 11 sigue abierta y el PR no debe entrar.
7. **Deuda que conviene cerrar antes del release porque hoy es barata:** la regla que CIT-C1 debe
   heredar para `descuentos_servicio` (DES-M1); los greps literales del Gate cuentan comentarios de
   la cabecera y dan "rojo" sobre un SQL correcto (DES-B1); tercera copia de `redondearDinero`
   (DES-B2); ventana de carrera al cambiar de servicio mientras carga la receta (DES-B3); el
   servidor no exige que el servicio elegido esté activo (DES-B4).
8. **Lo que la dueña debe saber (diseño, no bug):** corregir una cita vieja baja las ventas del
   mes en que ocurrió el servicio (BR-007, `cobros.ts:795-796`); dos servicios cerrados del
   respaldo real quedan "parcial" por $388 tras la `0005` hasta que ella les aplique el descuento
   desde el detalle (evidencia Parte A, COB-A1). La acción sale en el mismo release: correcto.

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Cálculo del descuento (`shared/descuentos.ts`, una sola función)

```
b      = redondear(max(0, base))                                   descuentos.ts:34
monto  = modo == porcentaje ? redondear(b × valor / 100) : redondear(valor)   :36
monto  = min(monto, b)                                             :37   (BR-002: nunca supera la base)
válido si valor > 0, (porcentaje → valor ≤ 100), base > 0, (monto → valor ≤ base), monto > 0   :41-50
```

La base la decide el servidor: `precio` bruto o `total_productos` bruto, redondeados
(`cobros.ts:625-627`). El renderer manda solo `modo`, `valor`, `motivo`, `motivoDetalle`
(`schemas.ts:177-190`); nunca un monto.

### 2.2 Escrituras (todas dentro de una `db.transaction` síncrona)

- **Cierre** (`serviciosRealizados.ts:179-417`): pre-valida stock (`214-223`) y descuentos fuera de
  la transacción (`262-274`, para un mensaje claro); dentro: doble clic (`283-288`), salidas,
  anticipos y pagos contra el total **neto** (`325-347`), `UPDATE` del servicio con
  `servicioCatalogoId`, `precio`, `totalProductos`, `cerrado` (`349-361`), **luego**
  `aplicarDescuentoEnTx` por cada descuento (`365`), **luego** `recalcularEstatusEnTx` (`368`),
  cita → `asistio` (+ servicio nuevo si cambió) (`370-379`), bitácora.
- **`aplicarDescuentoEnTx`** (`cobros.ts:680-731`): lee la fila ya escrita, valida enum/motivo,
  calcula base y monto con 2.1, cancela el manual vigente de esa base (`694-706`), inserta, recalcula
  caché (`723`), bitácora `descuento_aplicado` (con `motivo_detalle` si hay).
- **`aplicarDescuento`** post-cierre (`cobros.ts:738-759`): exige `cerrado` y `estatus_pago ≠
  cancelado`, aplica, relee la fila, BR-005 (`751-756`), recalcula estatus (`757`).
- **`quitarDescuento`** (`cobros.ts:762-774`): `cancelado` + `cancelado_at` + motivo, caché, estatus.
  Nunca `DELETE`.
- **Caché** (`cobros.ts:638-650`): `descuento_servicio = Σ monto aplicado con aplica_a='servicio'`
  (todos los `tipo`), ídem productos.

### 2.3 Lectores

| Lector | Qué suma | Neto |
|---|---|---|
| `reportesResumen.agregadosDelRango` (`:46-63`), `serieResumen` (`:208-245`) | `totalTicket` por servicio cerrado no cancelado, fecha del servicio | ✅ |
| `reportesFinanzas.reporteFinanzas` ventas / estado de resultados (`:218-232`, `:291-298`) | las de Resumen + "Descuentos otorgados" (`descuentosDelRango`, `cobros.ts:781-800`) | ✅ |
| `dashboard.resumenDashboard` (`:19-40`) | `totalTicket` del mes | ✅ |
| `reportesClientesDetalle` (`:50-78`) | `totalTicket` histórico por clienta | ✅ |
| `reportesServiciosDetalle` (`:26-86`) | `ingresoDelServicio` (sin productos, por diseño) | ✅ |
| `citas.listarCitas` (`:27-45,:77-84`), `cobros.saldosPorCliente` (`:126-155`), cartera de Finanzas (`:72-130`) | `saldoServicio` | ✅ |
| `corte.ts` | no lee `servicios_realizados` | n/a (BR-004) |
| `estadoCuentaCita` (`cobros.ts:536-594`), `obtenerDetalle` (`serviciosRealizados.ts:464-471`) | bruto, descuentos, neto, lista de descuentos vigentes | ✅ `precio` = bruto (cond. 6) |

### 2.4 Diseño vs. bug

| Comportamiento | Lectura |
|---|---|
| Un descuento post-cierre cambia las ventas del mes del servicio, no del día en que se aplicó | **Diseño** (BR-007; `cobros.ts:795-796`); el corte no se mueve. La dueña debe saberlo (Gate, riesgo 3). |
| Quitar un descuento puede regresar una cita de "pagado" a "parcial" | **Diseño** (AC-005). |
| Sin PIN para aplicar/cambiar/quitar; confirmación en pantalla y bitácora resaltada (`Bitacora.tsx:13`) | **Decisión del dueño** (BR-008, spec §20.7). |
| `motivo_detalle` libre llega a bitácora y al desglose de la cita; nunca al reporte por motivo (`descuentosDelRango` no lo selecciona) | **Riesgo declarado** (Gate, riesgo 2); la UI pide "sin nombres ni datos de salud" (`DescuentoCampo.tsx:132`). |
| La caché `total_productos` (base del descuento de productos) no cambia si una venta del ticket se cancela | **Deuda heredada** (COB-B4). Hoy no ocurre: `cancelarSalidaEnTx` rechaza salidas ligadas a un servicio (`inventario.ts:733-735`); solo CIT-C1 podrá hacerlo → DES-M1. |
| La carpeta del servicio conserva el nombre del servicio anterior tras cambiarlo en el cierre | **Decisión declarada** (spec §10, Gate cond. 7). Cosmético. |
| `precio` se guarda sin redondear (`serviciosRealizados.ts:352`) y la base se redondea | **Deuda heredada** (COB-B2 familia); ambos lados usan la misma función, el monto no diverge. |

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `descuentos_servicio` (filas) | Solo `cobros.aplicarDescuentoEnTx` / `cancelarDescuentoEnTx` (cierre y post-cierre) | ✅ escritor único verificado (cond. 4 → 0 fuera de `cobros.ts`) |
| `servicios_realizados.descuento_servicio` / `descuento_productos` | `0006` (nacen en 0, sin backfill) y luego `recalcularCacheDescuentosEnTx` desde la tabla | ✅ invariante AC-007 por construcción; consulta del encabezado detecta desfases (T12) |
| `servicios_realizados.precio` (bruto) | `abrirCierre`, `actualizarCita` (solo `abierto`), `cerrarCita` | ✅ sin cambios de semántica; ningún escritor post-cierre |
| `servicios_realizados.total_productos` | `cerrarCita` únicamente; congelado después | ⚠️ COB-B4 heredada; CIT-C1 debe recalcular caché y cancelar descuentos de productos (DES-M1) |
| `servicios_realizados.estatus_pago` | `recalcularEstatusEnTx` tras cada pago/descuento | ✅ derivado; los tres caminos de descuento lo llaman |
| `servicios_realizados.servicio_catalogo_id` / `citas.servicio_catalogo_id` | `abrirCierre` ← cita; `actualizarCita` → borrador; `cerrarCita` → ambos si cambió | ✅ sincronía en los dos sentidos, solo con servicio `abierto` |
| Dos servicios "parcial" ($388) del respaldo real tras la `0005` | Pagos menores al precio, hoy sin rastro de descuento | ⚠️ corrección manual por la dueña desde el detalle (FR-005); nunca por `UPDATE` |
| "Descuentos otorgados" en Finanzas | `descuentosDelRango`: `aplicado` × servicio `cerrado` no cancelado × fecha del servicio | ✅ mismo universo que ventas (`ne cancelado` ≡ `in [pagado, parcial, pendiente]`, columna NOT NULL) |

## 4. Caso por caso

Casos sintéticos trazados en código (AC) y sondas sobre la copia sintética migrada (T). No hay
sujetos reales; `SRV-000N` es el fixture.

| # | Caso | Valor del sistema | Esperado | Lectura |
|---|---|---|---|---|
| AC-001 | Cierre $1,000, 15 % servicio, pago $850 | monto 150 (`descuentos.ts:36`), total 850 (`cobros.ts:76-80`), `porCobrar` 850, pagado | 850 / pagado | ✅ |
| AC-002 | $800 con 10 % + productos $200 con $50 | 720 + 150 = 870 | 870 | ✅ |
| AC-003 | Cerrada $1,000, cobrados $850, aplicar 15 % | total 850, `cobrado (850) > 850`? no → pagado; `pagos` intactos | pagado, saldo 0 | ✅ |
| AC-004 | Cerrada $1,000, cobrados $1,000, aplicar 15 % | `1000 > 850 + 0.005` → throw, rollback (`cobros.ts:751-756`) | rechazo | ✅ |
| AC-005 | Quitar el de AC-003 | fila `cancelado`, caché 0, estatus parcial, saldo 150 | parcial / 150 | ✅ |
| AC-006 | Cambiar servicio al cerrar | `servicio_catalogo_id` en servicio y cita, mantenimiento con periodicidad nueva, bitácora | ídem | ✅ |
| AC-008 | Ventas y "Descuentos otorgados" del periodo | 850 y 150 "Primera visita" | ídem | ✅ |
| AC-009 | grep de escritores fuera de `cobros.ts` | 0 | 0 | ✅ (sin nota de evidencia → DES-A1) |
| T1–T3 | Dos manuales vigentes misma base; cancelar y reinsertar | `UNIQUE constraint failed`; ok | BR-001 | ✅ |
| T4–T5 | Otra base; `tipo='cupon'` misma base | ok; ok | índice solo `manual` | ✅ (Parte B no queda pintada) |
| T6–T8 | `monto > base`; `valor = 0`; 100 % = base | CHECK falla; CHECK falla; ok | BR-002 | ✅ |
| T9–T11 | `DELETE` servicio con descuento; borrar usuario; `created_at` | FK falla; `usuario_id` → NULL; entero > 0 | restrict / set null / unixepoch | ✅ |
| T12 | Consulta AC-007 sobre filas insertadas a mano sin caché | devuelve los 2 servicios | detecta desfase | ✅ (la consulta sirve de candado) |
| 0004+0005+0006 | Un solo `BEGIN`, FK ON, 2 servicios previos | `integrity_check` ok, `foreign_key_check` vacío, caché 0, tabla vacía | aditiva, no retroactiva | ✅ |

Hallazgos sueltos:

- **DES-A1** — No existe `.notes/evidencia-descuentos-<fecha>.md` (condición 11b del Gate). El <!-- atlas-allow: archivo futuro que exige la condición 11b del Gate -->
  solicitante reporta AC-001…AC-008 y 12 casos borde ejecutados sobre una copia de la BD de
  desarrollo, y la aplicación de `0004`–`0006` sobre una copia del respaldo real (conteos). Nada de
  eso está escrito, y AC-009 (grep) tampoco. Sin la nota, la condición 11 sigue abierta y el
  ciclo audit → plan → evidencia pierde el eslabón. Severidad alta por falta de evidencia en
  superficie crítica, no por defecto de código: esta auditoría no encontró ningún error de dinero.
- **DES-M1** — `descuentos_servicio` no tiene regla para la reversa de un servicio cerrado (CIT-C1).
  Hoy es inalcanzable (`inventario.ts:733-735` rechaza cancelar ventas del ticket), pero cuando
  CIT-C1 pase `permitirLigadasAServicio`, `total_productos` quedará con una venta que ya no existe
  (COB-B4) y el descuento de productos seguirá vigente sobre una base fantasma; si CIT-C1 además
  recalcula `total_productos`, el CHECK `monto <= base` solo protege la fila original, no la caché.
  Regla a heredar: la reversa pasa por `cobros.ts`, cancela los descuentos vigentes con motivo
  (`cancelarDescuentoEnTx`) o recalcula `total_productos` y re-aplica, siempre antes de
  `recalcularEstatusEnTx`. Cerrable hoy con una línea en el spec/Gate futuro de CIT-C1.
- **DES-B1** — Las verificaciones literales del Gate (condiciones 1 y 2) cuentan la cabecera:
  `grep -c "CHECK"` → 4 (≤ 3), `grep -c "ALTER TABLE"` → 3 (2), `grep -c "__new_\|DROP TABLE\|UPDATE "`
  → 2 (0), `grep -n CHECK | grep -c "tipo\|aplica_a\|modo\|motivo"` → 1 (0). Con `grep -v '^--'`
  dan 0 / 2 / 2 / 0: el SQL cumple. Quien reproduzca el Gate verá rojo sobre un archivo correcto.
- **DES-B2** — Tercera copia del redondeo: `cobros.redondearDinero` (`:53-55`),
  `LineasPago.redondear` (`:19`) y ahora `descuentos.redondear` (`:25-27`); además
  `reportesFinanzas.ts:197,199,206` y `PagosDeCita.tsx:457-458,477` usan `Math.round(x*100)/100`
  sin `Number.EPSILON`. Hoy los tres cuerpos son idénticos y el servidor manda; es el COB-B2 que
  crece. `shared/descuentos.ts` ya es el lugar natural para exportar un solo `redondearDinero`.
- **DES-B3** — `CierreCitaModal.tsx:105-116`: al cambiar de servicio, `receta` es `undefined`
  mientras carga la del nuevo y `consumidos` conserva los insumos del anterior; "Cerrar cita" no
  se bloquea en esa ventana, así que un clic en esos milisegundos manda `servicioCatalogoId` nuevo
  con la receta vieja. Ventana de un IPC local; fix de una línea (deshabilitar mientras
  `recetaCargadaDe.current !== servicioCatalogoId`).
- **DES-B4** — `cerrarCita` acepta cualquier `servicioCatalogoId` existente
  (`serviciosRealizados.ts:230-235`); la UI filtra inactivos (`CierreCitaModal.tsx:271-273`) pero
  el servidor no. Sin impacto de dinero; consistencia de la frontera.
- **DES-B5** (informativo) — `citas.duracion_min` no se actualiza al cambiar el servicio en el
  cierre; la cita ya ocurrió y solo afecta la vista de agenda del pasado. Declarar o ignorar.

### Condiciones del Gate, una por una

| # | Condición | Estado |
|---|---|---|
| 1 | Sin CHECK enumerados; 4 `z.enum`; `todo` en §10 | ✅ (`0006:99-100` solo numéricos; 3 `z.enum` nuevos + 1 implícito en `cierreCitaInputSchema` vía `descuentoCapturaSchema` — el conteo del Gate decía 4, hay 3 literales; el cuarto valor enumerado, `tipo`, vive solo en `cobros.ts:711` por diseño) |
| 2 | Migración aditiva con `WHERE`, `restrict`, `set null`, 2 `ALTER`, sin recreación; journal idx 6 | ✅ (sondas; cabecera con plantilla) — greps literales → DES-B1 |
| 3 | Addenda 0007/0008 en specs; una sola `0006` | ✅ (diffs en los dos specs; `ls` → un archivo) |
| 4 | Escritor único; 7 lectores; typecheck | ✅ (0 / 7 / verde) |
| 5 | `calcularDescuento` en `shared/`, usada por UI y `cobros.ts`; validaciones en tx | ✅ (`descuentos.ts`, `DescuentoCampo.tsx`, `cobros.ts:690-692`, `serviciosRealizados.ts:265-267`) |
| 6 | Canales, zod, `EstadoCuentaCita`/`DetalleServicioRealizado` con bruto/neto/lista | ✅ (`ipc/index.ts:370-375`, `preload.ts:117-118`, `types.ts` 12 menciones, `precio` bruto en `obtenerDetalle`) |
| 7 | `servicioCatalogoId` opcional; `cerrarCita` dueño; sin rename; bitácora | ✅ (`schemas.ts:210`; `serviciosRealizados.ts:351,374,381-389`; grep rename → 0) |
| 8 | `descuentosServicio` en `TABLAS_NEGOCIO` | ✅ (`reinicio.ts:21`) |
| 9 | Decisiones del dueño y Q-001 respondida | ✅ (spec §20, 7 decisiones; Q-001 "RESUELTA") |
| 10 | `descuentosDelRango` en `cobros.ts`, fecha del servicio, por `motivo` | ✅ (`cobros.ts:781-800`; Finanzas agrupa por `motivo`, nunca `motivo_detalle`) |
| 11a | Release bloqueado por COB-A1 | ⚠️ condición 3 de COB-A1 cumplida el 2026-11-06 (solo conteos); falta la prueba guiada de la condición 8 del Gate del cobro |
| 11b | Nota de evidencia con nueve AC | ❌ no existe → **DES-A1** |
| 11c | Esta auditoría; `APPLIED-MIGRATIONS.md` sin `0005`/`0006` | ✅ (grep → sin filas) |

## 5. Riesgos activos — con fechas de detonación

### 5.1 La condición 11 del Gate se cierra con un documento que no existe (DES-A1)
Mecanismo: el Gate exige la nota antes del PR; sin ella, cualquier revisión posterior del release
tiene que reconstruir las pruebas. No se degrada solo, pero cada día que pasa la memoria de las
12 pruebas se pierde. Fecha: antes del PR (el Gate lo pone como paso previo).

### 5.2 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| 1 | Al instalar el release con `0005`+`0006`: dos servicios cerrados del respaldo real aparecen "parcial" ($388) hasta que la dueña aplique el descuento desde el detalle. Diseño (no retroactiva); la acción sale en el mismo release | día de la actualización en la cabina |
| 2 | Si CIT-C1 reversa ventas del ticket sin la regla de DES-M1: descuento de productos sobre base fantasma, `total_productos` desincronizado (COB-B4) | cuando se implemente CIT-C1 |
| 3 | Si una instalación regresara a un release sin `0006`: `totalTicket` ignora descuentos y las citas corregidas vuelven a "deber" (Gate, riesgo 4). Cubierto por la copia previa a migrar | solo ante rollback manual |

### 5.3 Causa raíz
No hay una regla rota en el código de dinero. Los huecos son de proceso (la evidencia se ejecutó y
no se escribió) y de deuda heredada que la feature hereda sin agravar (COB-B2 copias de redondeo,
COB-B4 caché congelada).

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** nada que congelar en código. No abrir el PR ni etiquetar el release hasta
  que exista la nota de evidencia (DES-A1) y la prueba guiada de la condición 8 del Gate del cobro
  (11a).
- **Decisión A — ¿la dueña acepta que corregir citas viejas baje las ventas de meses pasados?**
  Es BR-007 y el Gate lo marca como "intencional; el dueño debe saberlo", pero no aparece entre las
  decisiones escritas de §20. Opciones: (a) agregarla como decisión 8 del spec con fecha; (b) dejarla
  como regla técnica. (a) cuesta una línea y evita una sorpresa en Reportes en diciembre.
- **Decisión B — ¿CIT-C1 hereda DES-M1 por escrito ahora?** Una línea en `PROJECT.md` o en el spec
  de CIT-C1 cuando exista. Si Carlos prefiere esperar, queda en el backlog con el disparador
  "cuando se escriba el Gate de CIT-C1".
- **Cambio propuesto (DES-A1):** escribir `.notes/evidencia-descuentos-2026-11-06.md` con: (1) <!-- atlas-allow: archivo futuro que exige la condición 11b del Gate -->
  AC-001…AC-008 con los números obtenidos; (2) el texto de la consulta AC-007 (está en
  `0006_descuentos.sql:127-132`) y su salida (0 filas); (3) la salida de AC-009 (0 líneas); (4) los
  12 casos borde con el mensaje de rechazo literal; (5) los conteos de la copia del respaldo real
  (solo conteos). Sin nombres ni datos.
- **Cambio propuesto (DES-B1):** en el Gate (addendum, no reescritura) o en la nota de evidencia,
  dejar los greps con `grep -v '^--' drizzle/0006_descuentos.sql | …` como forma reproducible.
- **Cambio propuesto (DES-B2):** exportar `redondearDinero` desde `shared/descuentos.ts` (o un
  `shared/dinero.ts`) y hacer que <!-- atlas-allow: archivo hipotético que propone DES-B2, no existe aún -->  `cobros.ts`, `LineasPago.tsx`, `reportesFinanzas.ts` y
  `PagosDeCita.tsx` lo importen. Cierra COB-B2 de paso. Fuera de este PR si se prefiere, pero antes
  de la Parte B, que añade más sumas.
- **Cambio propuesto (DES-B3):** `listoParaCerrar` también exige
  `recetaCargadaDe.current === servicioCatalogoId` (o `!recetaQuery.isFetching`).
- **Cambio propuesto (DES-B4):** en `cerrarCita`, si `cambioDeServicio && !servicioCat.activo` →
  error "El servicio elegido está inactivo".

**Pendiente de verificación manual** (de solo lectura, sobre una copia; nunca sobre la BD real):

```sql
-- (1) Estructura tras migrar: índice parcial con su WHERE
SELECT sql FROM sqlite_master WHERE name = 'descuentos_servicio_manual_vigente_uq';
-- Esperado: termina en WHERE estatus = 'aplicado' AND tipo = 'manual'

-- (2) No retroactiva, justo después de migrar
SELECT COUNT(*) FROM servicios_realizados WHERE descuento_servicio <> 0 OR descuento_productos <> 0;
SELECT COUNT(*) FROM descuentos_servicio;
-- Esperado: 0 y 0

-- (3) Invariante AC-007 después de que la dueña corrija las dos citas (texto en 0006_descuentos.sql:127-132)
-- Esperado: 0 filas

-- (4) Las dos citas "parcial" del respaldo ya corregidas (solo si ambas eran descuento)
SELECT COUNT(*) FROM servicios_realizados WHERE estatus = 'cerrado' AND estatus_pago = 'parcial';
-- Esperado: 0 (si una era adeudo real: 1, y es correcto que siga)

-- (5) Un descuento manual vigente por base, siempre
SELECT servicio_realizado_id, aplica_a, COUNT(*) FROM descuentos_servicio
 WHERE estatus = 'aplicado' AND tipo = 'manual' GROUP BY 1, 2 HAVING COUNT(*) > 1;
-- Esperado: 0 filas

-- (6) BR-005 nunca violada: ningún servicio cerrado con cobrado > total neto
SELECT s.id FROM servicios_realizados s
  JOIN (SELECT servicio_realizado_id, SUM(monto) c FROM pagos WHERE estatus = 'cobrado' GROUP BY 1) p
    ON p.servicio_realizado_id = s.id
 WHERE s.estatus = 'cerrado' AND s.estatus_pago <> 'cancelado'
   AND p.c > (COALESCE(s.precio,0) - s.descuento_servicio + s.total_productos - s.descuento_productos) + 0.005;
-- Esperado: 0 filas
```

## 7. Qué sigue

1. **Carlos escribe la nota de evidencia** (DES-A1) con los números que ya obtuvo; el solicitante
   la referencia en el PR. → **Carlos confirma por escrito la Decisión A** (una línea en §20 del
   spec).
2. **Ingeniería prepara** DES-B3 y DES-B4 en el mismo PR (dos líneas, sin riesgo); DES-B2 en un PR
   aparte antes de la Parte B; DES-B1 como addendum del Gate.
3. **PR** `atlas/descuentos` → `main` con esta auditoría y la evidencia; CI verde.
4. **Release** con `0005`+`0006` solo tras la prueba guiada de la condición 8 del Gate del cobro
   (COB-A1, 11a). Al instalar: fila en `APPLIED-MIGRATIONS.md`, consultas (1)–(2) de arriba sobre
   una copia, y la dueña corrige las dos citas desde el detalle; después (3)–(6).
5. **Gate de CIT-C1:** hereda DES-M1 junto con COB-B4 y COB-M1.
