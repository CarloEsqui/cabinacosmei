# Evidence — Cancelación de entradas y salidas de inventario (DAT-A2, migración 0004) (2026-11-04)

**Responde a:**
- el [Gate 001](gate-001-cancelacion-inventario-2026-11-04.md) (PASS WITH CONDITIONS, 10 condiciones);
- el diseño [spec-cancelacion-inventario-2026-11-04.md](spec-cancelacion-inventario-2026-11-04.md);
- la [auditoría DAT](auditoria-integridad-datos-2026-11-03.md) (DAT-A2, §6), con DAT-M2 como
  residuo parcial;
- el plan, Phase 1, ítem 3 (R2b, parte de inventario).

**Superficies críticas tocadas:**
- **Migraciones:** `drizzle/0004_cancelacion_inventario.sql` + snapshot y journal, y `schema.ts`.
- **Dinero:** cláusulas `WHERE estatus = 'vigente'` en `serviciosRealizados.ts` y
  `reportesFinanzas.ts`.

**Method / PII:** servicios reales empaquetados con esbuild y corridos con el Node de Electron
(`ELECTRON_RUN_AS_NODE=1`) contra BD de prueba en el scratchpad, creadas desde `drizzle/`. Datos
inventados (CL-0001). Ninguna BD real abierta.

## ANSWERS — condiciones del Gate

| # | Condición | Estado | Evidencia |
|---|---|---|---|
| 1 | Censo de lectores | ✅ | 6/2/1/2/1 filtros `vigente` en reportesInventarioDetalle/reportesResumen/reportesFinanzas/serviciosRealizados/citas. Los generadores de folio no filtran (0 `estatus` en `inventario.ts:60-90`). Hay **20** lecturas en lugar de 17: las 3 nuevas son de `cancelarEntradaEnTx` (1) y `cancelarSalidaEnTx` (2: documento y grupo de folio), que leen por id para escribir y no cuentan stock ni dinero. |
| 2 | Migración sin recreación + cabecera | ✅ | Generada con `drizzle-kit generate` (sí corrió en esta sesión). 0 `__new_`/`DROP`/`CREATE`; 8 `ALTER TABLE`; 2 `REFERENCES usuarios(id)`. La cabecera declara `NO ACTION` como decisión deliberada; `delete(usuarios)` = 0. El journal idx 4 es `0004_cancelacion_inventario`. |
| 3 | Tolerancia flotante | ✅ (desviación justificada) | EPS = 1e-6 en las comparaciones. El redondeo es a **1e-9**, no a 1e-6: con 1e-6, tres tercios cancelados sumaban 0.999999. Además `registrarSalidaEnTx` ahora marca `agotado` un residuo ≤ EPS (antes quedaba "activo" con 1.1e-16: DAT-M2 se manifestó en la prueba). |
| 4 | Clave de agrupación por folio | ✅ | §6 del spec actualizado. AC "FEFO en 2 lotes": cancelar **una** fila cancela ambas y restaura ambos lotes. 0 folios con estatus mixto. |
| 5 | `*EnTx` exportados, sin dependencia a serviciosRealizados | ✅ | 2 `export function cancelar…EnTx`; 0 imports de `serviciosRealizados`. BR-004 es un parámetro (`permitirLigadasAServicio`). |
| 6 | Convención de signo | ✅ | Cantidad siempre positiva y `tipo` da la dirección (comentario en `schema.ts`). 0 movimientos con cantidad < 0. El movimiento lleva fecha de hoy, `referencia_id` del original y el motivo. |
| 7 | Contrato y UI completos | ✅ | `MovimientoRow` expone `referenciaTipo`, `referenciaId`, `documentoEstatus`, `documentoMotivoCancelacion` y `ligadoAServicio`. Etiquetas en `Movimientos.tsx` y `exportarCsv.ts`. Canales en contrato, preload e ipc. zod `motivo.trim().min(1)`. |
| 8 | Corrimiento de numeración | ✅ | Addendum fechado al final de `spec-modulo-cobro-2026-11-04.md` (0005/0006). |
| 9 | Frontera real del riesgo | ✅ | §11 del spec: SEG-A1 + pantalla de bloqueo, "cuándo y qué, no quién", reportes retroactivos. |
| 10 | Evidencia sobre BD de prueba | ✅ | Abajo. La fila de `APPLIED-MIGRATIONS.md` se agrega **después** del release, nunca antes. |

## Migración — instalación nueva y actualización (proxy fiel del arranque real)
```
instalación nueva   → migraciones: 5 | cols entradas: 4 | cols salidas: 4 | fk_check: 0 | integrity: ok
instalación v0003   → migraciones: 4 | cols entradas: 0 | cols salidas: 0 | fk_check: 0 | integrity: ok
Respaldo previo a migración creado en: data-upd/cabina_antes_de_migrar_20261104-125914.sqlite3
actualiza a 0004    → migraciones: 5 | cols entradas: 4 | cols salidas: 4 | fk_check: 0 | integrity: ok
entrada existente quedó: vigente
```
La cabecera y el pie de comentarios de la migración no estorban al migrador (`better-sqlite3`).

## E2E de servidor — AC-001…AC-007 + condiciones 3 y 4 + riesgos
```
== AC-001 entrada por error, sin uso ==
cancelar entrada A1 → OK
   lote: agotado 0 | inicial: 0 | entrada: cancelada Producto equivocado
== AC-002 entrada con uso parcial ==
cancelar entrada B1 (3 usadas) → RECHAZADO: Ya se usó parte de lo que entró en este lote. Cancela primero esas salidas, o registra una merma por lo que sobra.
== AC-005 motivo vacío / doble cancelación ==
motivo vacío → RECHAZADO: Escribe el motivo de la cancelación.
cancelar A1 otra vez → RECHAZADO: Esta entrada ya estaba cancelada.
== Cond. 3: lote de 1, tres consumos de 1/3, se cancelan y luego la entrada ==
   tras consumos: agotado 0
   tras cancelar salidas: activo 0.999999999
cancelar entrada C1 → OK
   final: agotado 0
== Cond. 4: salida FEFO repartida en 2 lotes, se cancela por folio ==
   salida folio S-0005 filas: 2 | D1: 0 D2: 3
cancelar UNA fila del folio → OK
   estatus filas: [ 'cancelada', 'cancelada' ] | D1: activo 2 D2: 5
== AC-003 + riesgo: lote bloqueado dado de baja, luego se cancela la merma ==
   tras baja: agotado 0
cancelar la merma (baja accidental) → OK
   lote: activo 4 | stockCaducado crema: 4 (vuelve a +4 caducado)
== Entrada a lote existente, cancelada ==
   lote E1: 8 inicial 8 | entradas: 2
cancelar la 2a entrada (3) → OK
   lote E1: activo 5 inicial 5
== AC-004 salida de un cierre de cita ==
cancelar salida de la cita → RECHAZADO: Esta salida viene del cierre de una cita; se corrige desde la cita, no desde Movimientos.
== Movimientos y cuadre ==
   movimientos con cantidad negativa: 0 | folios con estatus mixto: 0 | lotes que rompen el invariante: 0
   tipos en historial: entrada, cancelacion_entrada, uso_interno, cancelacion_salida, ajuste, merma, consumo_servicio
   filas cancelables: 6 | ligadas a cita: 1 | canceladas: 9
```
Reportes (AC-001, compras y mermas):
```
ANTES   finanzas: Compras de inventario=150 | inventario salidas: [{"tipo":"merma","valor":20,"unidades":2}]
DESPUÉS finanzas: Compras de inventario=100 | inventario salidas: []
```

**Riesgos declarados por el Gate, observados:**
- Lote bloqueado dado de baja y luego merma cancelada: queda **`activo`**, no `bloqueado`. Se
  acepta: la operadora lo vuelve a bloquear. En el ejemplo el lote está caducado y por eso no es
  usable de todos modos: vuelve como "+4 caducado".
- Entrada a lote existente cancelada: el lote E1 pasa de 8 a 5 y su inicial de 8 a 5 (inicial =
  Σ entradas vigentes). El costo del lote sigue siendo el de la primera entrada (trade-off aceptado
  por el Gate).

`npm run typecheck` → exit 0. `npm run build`: lo corre Carlos (el sandbox cuelga Vite).

## E2E en UI — pendiente (Carlos, con BD de prueba)
1. Inventario → registrar una entrada → Movimientos → "Cancelar…" con motivo → la fila queda
   tachada con "Cancelada: <motivo>", aparece "Cancelación de entrada" y el stock baja.
2. Registrar una merma o usar "Dar de baja" → cancelarla → el stock regresa.
3. La salida de una cita cerrada muestra "De una cita" y no ofrece cancelar.

## Working tree
Sin commitear en `atlas/fase1`: migración 0004 (sql + snapshot + journal), `schema.ts`, `inventario.ts`,
los 5 lectores, IPC/preload/contrato/schemas/types, `Movimientos.tsx`, `exportarCsv.ts`, specs y esta
evidencia.

## Addendum 2026-11-04 — motivo opcional y lotes agotados ocultos (decisión de Carlos)

Ver el addendum del spec. Prueba re-corrida con el caso nuevo "cancelar sin motivo" (sustituye a
"motivo vacío → rechazado"):
```
== AC-001 entrada por error, sin uso ==
cancelar entrada A1 → OK
   lote: agotado 0 | inicial: 0 | entrada: cancelada Producto equivocado
== AC-002 entrada con uso parcial ==
cancelar entrada B1 (3 usadas) → RECHAZADO: Ya se usó parte de lo que entró en este lote. Cancela primero esas salidas, o registra una merma por lo que sobra.
== AC-005 motivo vacío / doble cancelación ==
cancelar entrada SIN motivo → OK
   motivo guardado: null | observación del movimiento: Captura cancelada | lote: agotado
cancelar A1 otra vez → RECHAZADO: Esta entrada ya estaba cancelada.
== Cond. 3: lote de 1, tres consumos de 1/3, se cancelan y luego la entrada ==
   tras consumos: agotado 0
   tras cancelar salidas: activo 0.999999999
cancelar entrada C1 → OK
   final: agotado 0
== Cond. 4: salida FEFO repartida en 2 lotes, se cancela por folio ==
   salida folio S-0005 filas: 2 | D1: 0 D2: 3
cancelar UNA fila del folio → OK
   estatus filas: [ 'cancelada', 'cancelada' ] | D1: activo 2 D2: 5
== AC-003 + riesgo: lote bloqueado dado de baja, luego se cancela la merma ==
   tras baja: agotado 0
cancelar la merma (baja accidental) → OK
   lote: activo 4 | stockCaducado crema: 4 (vuelve a +4 caducado)
== Entrada a lote existente, cancelada ==
   lote E1: 8 inicial 8 | entradas: 2
cancelar la 2a entrada (3) → OK
   lote E1: activo 5 inicial 5
== AC-004 salida de un cierre de cita ==
cancelar salida de la cita → RECHAZADO: Esta salida viene del cierre de una cita; se corrige desde la cita, no desde Movimientos.
== Movimientos y cuadre ==
   movimientos con cantidad negativa: 0 | folios con estatus mixto: 0 | lotes que rompen el invariante: 0
   tipos en historial: entrada, cancelacion_entrada, uso_interno, cancelacion_salida, ajuste, merma, consumo_servicio
   filas cancelables: 6 | ligadas a cita: 1 | canceladas: 10
```
`npm run typecheck` → exit 0. UI: Movimientos usa la confirmación estándar (`useConfirm`, botón
"Volver"); Resumen filtra `cantidadDisponible > 0`, con un interruptor "Ver N lotes agotados".
