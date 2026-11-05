# Auditoría — Cobro v2, Parte A (migración 0005, `cobros.ts`, corte, lectores de dinero) — 2026-11-05 (COB-*)

**Scope:** Working tree sin commitear de la rama `atlas/cobro-a` sobre `efc4795`. Código:
`drizzle/0005_cobro_v2.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json`,
`electron/db/schema.ts`; `electron/services/cobros.ts` (nuevo), `corte.ts`, `serviciosRealizados.ts`,
`citas.ts`, `clientes.ts`, `dashboard.ts`, `inventario.ts`, `reportesFinanzas.ts`,
`reportesResumen.ts`, `reportesClientesDetalle.ts`, `reportesServiciosDetalle.ts`;
`electron/services/pagos.ts` (eliminado); `electron/ipc/index.ts`, `electron/preload.ts`,
`shared/ipc-contract.ts`, `shared/schemas.ts`, `shared/types.ts`; UI de dinero
`src/pages/agenda/CierreCitaModal.tsx`, `src/pages/agenda/PagosDeCita.tsx`,
`src/components/cobros/LineasPago.tsx`, `src/pages/Corte.tsx`, `src/pages/agenda/useAccionesCita.ts`.
Se mide contra el diseño [spec-modulo-cobro-2026-11-04.md](spec-modulo-cobro-2026-11-04.md)
(§6–§11, §18, §22, §23 y sus addenda) y las condiciones 1–8 y 14 del
[Gate 001](gate-001-modulo-cobro-2026-11-04.md). **No auditado:** la Parte B (tarjetas, cupones),
`Clientes.tsx`/`Lista.tsx`/`CitaDetalleModal.tsx` más allá de que muestren saldos del servidor,
`src/components/ui/*`, los specs de ficha clínica, DIN-A3 (costo de insumos consumidos sigue en 0),
SEG-A1 (candado de la app), CIT-C1 (reversa de servicio cerrado).
**Method:** Solo lectura. `git diff`/`git status`, lectura de archivos, grep de las verificaciones
del Gate, `npm run typecheck` y `npm run build` (ambos verdes, 2026-11-05 12:0x CST). Prueba de la
migración sobre una **copia sintética** en SQLite 3.45 (`/private/tmp/...scratchpad/test.db`):
migraciones `0000`–`0004` + datos sintéticos + `0005` dentro de un `BEGIN/COMMIT` con
`foreign_keys = ON`, y réplica en SQL de `calcularPendiente` y `ligarPagosACorteEnTx` para
reproducir la secuencia cobro → corte → cancelación → ajuste. No se ejecutó la app.
**PII declaration:** Sin PII. No se abrió ninguna base real ni respaldo (`~/Library/Application
Support` no se tocó). Los datos de prueba son inventados; el único código de clienta que aparece
(`CL-0001`) es un placeholder del fixture. Los códigos `SRV-000N` son sintéticos.
**State as of:** 2026-11-05 12:02 CST, rama `atlas/cobro-a` @ `efc4795` + working tree (27 archivos
modificados, 1 eliminado, 9 sin rastrear).

---

## 1. Resumen ejecutivo

1. **La migración `0005` hace exactamente lo que su cabecera declara, y lo hace sin recrear
   tablas.** Sobre la copia sintética: 8 columnas nuevas en `pagos`, 4 FK nuevas con `RESTRICT`
   (`cita_id`, `corte_id`, `cancelado_por`, `corte_cancelacion_id`), 3 índices, `cortes` y
   `servicios_realizados` con sus defaults; `PRAGMA foreign_key_check` vacío. Backfill: cada pago
   `cobrado` queda ligado al primer corte con `created_at >=` el suyo; los posteriores al último
   corte quedan `NULL` y **el pendiente de cortar es idéntico antes y después** (1 pago, $100 en
   la prueba). El recálculo de `estatus_pago` corrigió las 4 etiquetas incoherentes del fixture
   (`pagado`→`parcial`, `pendiente`→`pagado` ×2, `parcial`→`pendiente`), dejó intactos el
   `cancelado` legado y el borrador abierto, y escribió **una fila de bitácora por cambio** con
   `SRV-NNNN: viejo → nuevo` (condición 4). Verificación 7 de la cabecera: 0 incoherentes.
   Condiciones 1 y 2 del Gate: ambos `grep` dan 0.
2. **`cobros.ts` es de verdad el único escritor de `pagos` y la única definición de saldo.**
   `grep "insert(pagos)\|update(pagos)"` fuera de `cobros.ts` → 0; `grep "from(pagos)"` fuera de
   `cobros.ts`/`corte.ts` → 0; `grep "\.precio ?? 0"` fuera de `cobros.ts` → 0; `grep
   "delete(pagos)"` en `electron/` → 0 (AC-008). `corte.ts:120` liga vía
   `ligarPagosACorteEnTx`; los nueve lectores pasan por `totalTicket` / `cobradoPorServicio` /
   `saldoServicio` / `saldosPorCliente` / `cobrosDeDinero` (§2.3). Condiciones 5 y 6 cumplidas.
3. **Los invariantes de dinero se sostienen en el código y en la réplica SQL.** Estatus derivado
   solo en el servidor (`cobros.ts:53-57,266-280`; el cliente ya no lo manda,
   `shared/schemas.ts:164-171`); total = precio + productos (`cobros.ts:48-50`); pagos se cancelan,
   nunca se borran (`cobros.ts:435-443`); corte = cobros sin corte + ajustes negativos de pagos
   cortados y cancelados (`corte.ts:38-55`); un pago creado y cancelado en el mismo periodo queda
   `corte_id = corte_cancelacion_id = K` y **no aparece en ningún corte** (réplica: `p9`); el ajuste
   de un pago cortado en K3 y cancelado después cae en K4 y el pendiente posterior queda en 0 cobros
   / 0 ajustes (BR-006, BR-011). El corte corre en una transacción con el pendiente calculado
   dentro (`corte.ts:103-132`), rechaza el corte vacío (`corte.ts:105-107`) y redondea a 2
   decimales (`corte.ts:19,25,70`). Solo `fuente = dinero` suma (`corte.ts:41,49`;
   `cobros.ts:174,313,322,326`). Anticipos sin aplicar visibles en Corte (`corte.ts:57-61,74`;
   `Corte.tsx:168-175`; condición 14).
4. **El cierre de cita es correcto y cierra DIN-M2.** "Ya cerrada" se verifica dentro de la
   transacción (`serviciosRealizados.ts:228-235`); anticipos > total y Σ líneas > por cobrar se
   rechazan dentro de la misma transacción (`:272-281`), así que AC-005 deja nada escrito; los
   anticipos se ligan antes de insertar los pagos nuevos (`:282-294`); el pago lleva la fecha del
   día (`:290`, Decisión D) y las salidas la de la cita (`:174`), como dice el addendum.
5. **Lo que falta no está en el código sino en la evidencia: las condiciones 3 y 8 del Gate no
   tienen nota.** No existe `.notes/evidencia-*cobro*` ni `evidencia-migracion-0005-*`: la
   radiografía DIN-M4 (`JOIN ON p.created_at = c.created_at`), el A-003 y el cuadre corte↔pagos
   ligados sobre un respaldo real, y la prueba manual AC-001…AC-006 con BD de prueba no están
   hechos o no están escritos. → **COB-A1**. Mientras no exista esa nota, **la rama se puede
   integrar pero no se puede etiquetar**: `0005` corre sola en la única instalación al
   actualizar.
6. **Dos deudas latentes, ninguna activa hoy:** la FK legada `pagos.servicio_realizado_id ON DELETE
   SET NULL` sobrevive a la `0005` (recrear `pagos` estaba prohibido por la condición 2) y
   dejaría pagos huérfanos si algún día se borrara un servicio cerrado — hoy ningún camino lo hace
   (→ **COB-M1**, se cierra en la `0007` que de todos modos recrea `pagos`); y el estatus derivado
   solo se recalcula en `cobros.ts`, así que cualquier escritor futuro de `precio` /
   `total_productos` sobre un servicio cerrado (CIT-C1) tiene que llamar a
   `recalcularEstatusEnTx` (→ **COB-B4**).
7. **Bomba de tiempo (§5):** ninguna nueva. La única que detona sola es la del punto 5: el
   siguiente tag publica `0005` por auto-update; si la instalación real tiene pagos del mismo
   segundo que un corte, la decisión 3 de la cabecera los liga a un corte cuyo total congelado no
   los incluye, en silencio, y AC-007 ("cada pago viejo ligado al corte que lo contó") queda falso
   para esas filas. La radiografía de COB-A1 lo mide antes.

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Definición única (`electron/services/cobros.ts`)

```
total(s)            = round2(precio + total_productos)                       cobros.ts:48-50
cobrado(s)          = Σ pagos.monto  WHERE servicio_realizado_id = s AND estatus = 'cobrado'
                      (sin filtro de fuente: un canje de la Parte B también salda)   cobros.ts:69-82
saldo(s)            = 0 si estatus_pago = 'cancelado' (legado); si no max(0, total − cobrado)   cobros.ts:60-66
estatus_pago(s)     = pagado    si cobrado ≥ total − 0.005
                    = parcial   si cobrado > 0
                    = pendiente si no                                         cobros.ts:53-57
                      (escrito SOLO por recalcularEstatusEnTx, cobros.ts:266-280; "cancelado" legado se conserva, :271)
saldo(clienta)      = Σ saldo(s) de sus servicios cerrados con estatus_pago ≠ cancelado   cobros.ts:96-123
                      (NO resta anticipos de citas sin cerrar: AC-006)
dinero(desde,hasta) = pagos cobrado AND fuente = 'dinero' AND fecha ∈ [desde, hasta]   cobros.ts:165-177
anticipos(cita)     = Σ pagos cobrado con cita_id = cita AND servicio_realizado_id IS NULL   cobros.ts:203-210
```

### 2.2 Escrituras (todas dentro de una `db.transaction` síncrona)

```
cerrarCita (serviciosRealizados.ts:228-331)
  tx { re-lee estatus → "ya cerrada" (:230-235)                         ← DIN-M2 cerrado
       salidas consumo + venta con precio_unitario_venta (:238-269)
       anticipos = anticiposSinAplicar(tx, cita) (:272)
       porCobrar = total − anticipos; rechaza < −0.005 (:273-277)
       rechaza Σ líneas > max(0, porCobrar) + 0.005 (:279-281)           ← AC-005, BR-002
       aplicarAnticiposEnTx (:282)  → pagos.servicio_realizado_id = s, bitácora anticipo_aplicado
       registrarPagosEnTx (:283-294) → N pagos cobrado, fecha = HOY, concepto servicio, fuente dinero
       update servicio: precio, total_productos, estatus = cerrado (:296-307)
       recalcularEstatusEnTx (:310)                                       ← BR-005
       cita.estado = asistio; bitácora cita_cerrada con total/cobrado/estatus (:312-327) }

registrarAbono (cobros.ts:342-382)     comprobante o PIN fuera de tx; dentro: cerrado, no cancelado,
                                       saldo > 0.005, Σ ≤ saldo + 0.005, insert, recalc, bitácora
registrarAnticipo (cobros.ts:388-421)  PIN siempre; cita programada|confirmada; sin servicio cerrado
cancelarPago (cobros.ts:427-453)       PIN siempre; estatus cobrado → cancelado + cancelado_at +
                                       motivo + cancelado_por; recalc si tiene servicio; bitácora
registrarCorte (corte.ts:99-135)
  tx { resumen = calcularPendiente(tx)   (síncrono, dentro)             ← condición 8
       rechaza 0 pagos y 0 ajustes (:105-107)                            ← DIN-M4
       insert corte {desglose, ajustes_json, total_ajustes, total = cobros + ajustes} (:108-119)
       ligarPagosACorteEnTx(tx, K) (cobros.ts:308-328):
         1) cancelado AND corte_id NOT NULL AND corte_cancelacion_id NULL → corte_cancelacion_id = K
         2) cancelado AND corte_id NULL → corte_id = corte_cancelacion_id = K   (neto cero, BR-011)
         3) cobrado AND corte_id NULL → corte_id = K
       bitácora corte_registrado }
```

Orden de §22.4 era "ajustes → ligar → rechazar vacío"; el código rechaza vacío **antes** de
insertar (`corte.ts:105`). Es equivalente y más barato: con 0 pagos y 0 ajustes no hay nada que
ligar. **Diseño**, no desviación.

### 2.3 Lectores de dinero y de "ventas" (condición 6)

| Lector | Antes | Ahora |
|---|---|---|
| Lista de citas, saldo por cita | aritmética propia | `saldoServicio` + `cobradoPorServicio` (`citas.ts:34,88`) |
| Resumen por clienta (Citas y Clientes) | restaba **todos** los pagos de la clienta | `saldosPorCliente` (`citas.ts:416`, `clientes.ts:25`) |
| Cartera por antigüedad y detalle | etiqueta + aritmética propia | etiqueta derivada + `saldoServicio` (`reportesFinanzas.ts:82-90,131-145`) |
| Métodos de pago, cobranza, serie | todos los pagos cobrado | `cobrosDeDinero` (`reportesFinanzas.ts:49`, `reportesResumen.ts:110,257`) |
| "Cobrado hoy", ticket promedio | pagos cobrado / Σ precio | `cobrosDeDinero`, `totalTicket` (`dashboard.ts:15,32`) |
| Ventas (resumen, serie, por clienta) | Σ precio | `totalTicket` (`reportesResumen.ts:66,229`, `reportesClientesDetalle.ts:76`) |
| Ingreso por tipo de servicio | Σ precio | `ingresoDelServicio` (sin productos, `reportesServiciosDetalle.ts:85`) — addendum |
| Margen | costo de consumos (= 0, DIN-A3) | + `costoProductosVendidos` solo de salidas con precio de venta (`reportesResumen.ts:92,250`) — no duplica: los consumos salen de `servicios_productos_consumidos`, las ventas de `salidas_inventario` |
| Detalle del servicio | aritmética propia | `totalTicket`, `saldoServicio` (`serviciosRealizados.ts:394-404`) |

### 2.4 Diseño vs. bug — qué es cada comportamiento

| Comportamiento | Lectura |
|---|---|
| `pagos.fecha` = día del cobro en filas nuevas, fecha de la cita en filas viejas | **Diseño** (Decisión D; cabecera decisión 7; trade-off aceptado por el Gate). "Cobranza recibida" mezcla ambas en el historial. |
| Recálculo retroactivo de `estatus_pago` | **Diseño** (cabecera decisión 5, con rastro en bitácora). |
| Servicio de $0 queda `pagado` | **Diseño** (`cobros.ts:52`, cabecera decisión 5). |
| Anticipo solo con PIN (BR-008 decía "comprobante o PIN") | **Desviación declarada** en el addendum, pendiente de confirmar por Carlos. |
| `cobros:estadoCuentaCita(citaId)` en vez de `listarPagos(servicioId \| citaId)` | **Desviación declarada** en el addendum. |
| Pago del mismo segundo que un corte, posterior a él, ligado a ese corte | **Decisión declarada** (cabecera decisión 3), condicionada a la radiografía (COB-A1). |
| FK `pagos.servicio_realizado_id ON DELETE SET NULL` sigue viva | **Deuda heredada** (0000); no tocarla en 0005 era condición 2 → COB-M1. |
| Cita con anticipo (aunque esté cancelado) no se puede eliminar | **Diseño** (FR-009; `citas.ts:274-276` + FK RESTRICT). |
| Eliminar cita con anticipo cancelado también bloqueado | **Diseño** (cabecera decisión 2: el pago cancelado sigue siendo documento). |

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `pagos.concepto`, `fuente` (nuevas) | `0005` A, DEFAULT 'servicio' / 'dinero'; el código escribe explícito (`cobros.ts:247-248`) | ✅ |
| `pagos.corte_id` en filas viejas | `0005` B, primer corte con `created_at >=` el del pago | ⚠️ exacto salvo pagos del mismo segundo posteriores a un corte (DIN-M4): radiografía pendiente (COB-A1) |
| `pagos.corte_id` en filas nuevas | solo `ligarPagosACorteEnTx` dentro de `registrarCorte` | ✅ |
| `pagos.corte_cancelacion_id`, `cancelado_*` | solo `cancelarPago` y `ligarPagosACorteEnTx` | ✅ |
| `servicios_realizados.estatus_pago` | `0005` C2 (recalculado, con bitácora C1) y luego solo `recalcularEstatusEnTx` | ✅ (derivado); ⚠️ cualquier escritor futuro de precio/total_productos debe recalcular (COB-B4) |
| `servicios_realizados.total_productos` | 0 en filas viejas (decisión 6); `cerrarCita` en nuevas | ✅ |
| `salidas_inventario.precio_unitario_venta` | NULL en viejas; `cerrarCita` → `registrarSalidaEnTx` en ventas nuevas (`inventario.ts:548`) | ✅ |
| `cortes.ajustes_json`, `total_ajustes` | `'[]'` / 0 en viejos; `registrarCorte` en nuevos | ✅ (`mapearCorte` parsea ambos, `corte.ts:82-92`) |
| `cortes.total` viejos | congelados, no se recalculan (A-004) | ✅ por diseño |
| `bitacora.estatus_pago_recalculado` | `0005` C1, `usuario_id` NULL, `detalle` sin nombres | ✅ |
| `drizzle/meta/0005_snapshot.json` | drizzle-kit; `prevId` = id de `0004`; FK nuevas `restrict`; columnas e índices coinciden con el SQL | ✅ |
| `drizzle/meta/_journal.json` | idx 5, `when` 1793828617746 > idx 4 | ✅ (sin salto de línea final: cosmético) |
| `APPLIED-MIGRATIONS.md` | sin filas 0004 ni 0005 (ningún release las trae aún; último tag `v0.1.4`) | ⚠️ se llena al verificar el release |

## 4. Caso por caso

Casos **sintéticos** de la copia de prueba (no hay sujetos reales; el fixture tiene una sola
clienta placeholder `CL-0001`). Estado antes → después de `0005` y de la réplica SQL de v2.

| # | Caso | Valor del sistema | Esperado | Lectura |
|---|---|---|---|---|
| 1 | `SRV-0001` $800, etiqueta `pagado`, pago $800 (t=100) | `pagado`, sin bitácora; pago → K1 | igual | ✅ coherente, no se toca |
| 2 | `SRV-0002` $1,000, etiqueta `pagado`, pagos $800 (t=150) + $100 (t=500, tras último corte) | `parcial`; bitácora `SRV-0002: pagado → parcial`; $800 → K1, $100 `corte_id NULL` | igual | ✅ DIN-A2 corregido con rastro |
| 3 | `SRV-0003` $500, etiqueta `pendiente`, pago $500 en el **mismo segundo que K1, después** (t=200) | `pagado`; pago → K1; K1 congelado 1,600 vs ligados 2,100 | declarado (decisión 3) | ⚠️ caso límite DIN-M4: el pendiente no cambia, pero la verificación 2 de la cabecera lista K1 para siempre |
| 4 | `SRV-0004` etiqueta `cancelado` legado, pago $300 | `cancelado` intacto; saldo 0; pago → K2 | igual | ✅ excluido de saldos y abonos (`cobros.ts:64,361`); su dinero sigue en corte y cobranza (comportamiento previo) |
| 5 | `SRV-0005` $0, `pendiente`, sin pagos | `pagado`; bitácora | igual (decisión 5) | ✅ |
| 6 | `SRV-0006` $400, `parcial`, sin pagos | `pendiente`; bitácora | igual | ✅ |
| 7 | `SRV-0007` borrador `abierto` | intacto | igual | ✅ el recálculo filtra `estatus = cerrado` |
| 8 | Pago legado `cancelado` $50 (A-003 = 0 esperado) | `corte_id NULL` tras 0005; en K3 queda `k3/k3` | BR-011 | ✅ neto cero, nunca ajuste |
| 9 | Pendiente de cortar antes (consulta vieja `created_at > 400`) vs después (`corte_id IS NULL`) | 1 pago / $100 en ambos | igual | ✅ AC-007 (parte "pendiente idéntico") |
| 10 | v2: abono Tarjeta $400 → K3; se cancela después; Efectivo $400 nuevo; anticipo $200 creado y cancelado el mismo día; K4 | K4 = cobros Efectivo 400, ajustes Tarjeta −400, neto 0; `p7` k3/k4, `p8` k4/–, `p9` k4/k4; pendiente después 0/0 | AC-003, BR-006, BR-011 | ✅ |
| 11 | `DELETE citas` con anticipo cancelado; `DELETE cortes` con pagos ligados; `INSERT pagos` con `cita_id` inexistente | `FOREIGN KEY constraint failed` ×3 | RESTRICT | ✅ las FK agregadas a mano están activas (no solo en `schema.ts`) |

Hallazgos sueltos:

- **COB-A1** — No existe la nota de evidencia de la Parte A. Condición 3 del Gate: tres conteos
  sobre un respaldo real (radiografía DIN-M4, A-003, cuadre corte↔ligados sobre una copia con
  `0005`) y, si la radiografía da > 0, la regla declarada en la cabecera (ya está: decisión 3)
  **y** §22.3 del spec dejando de afirmar "el corte pendiente no cambia / cada pago ligado al
  corte que lo contó" para ese caso. Condición 8: AC-001…AC-006 y la parte A de AC-009 (K1/K2/K3
  sin tarjetas) con `npm run dev` sobre BD de prueba, con los totales en la nota. PROJECT.md
  (`verification`) exige esa prueba manual para dar "verde" a lógica de cobros. `ls .notes/` no
  tiene `evidencia-*cobro*` ni `evidencia-migracion-0005*`. Severidad **Alta**: evidencia faltante
  para una acción crítica e irreversible a distancia (la migración viaja por auto-update).
- **COB-M1** — `pagos.servicio_realizado_id` conserva `ON DELETE SET NULL`
  (`drizzle/0000_lively_nuke.sql:163`; `pragma_foreign_key_list` lo confirma tras `0005`). Si un
  servicio cerrado se borrara, sus pagos quedarían `cobrado` sin servicio: contarían en corte y
  cobranza pero en ningún saldo, y no habría rastro (CFF art. 30). Hoy **no hay camino**: el único
  `delete(serviciosRealizados)` es `citas.ts:299` y solo alcanza borradores sin pagos
  (`citas.ts:274-290`). Cambiarlo recrea `pagos` (condición 2 lo prohibía en `0005`); la `0007`
  (Parte B, condición 9 opción b) recrea `pagos` de todos modos: ahí se pasa a `restrict` con su
  radiografía. Severidad **Media** (latente; detona solo si CIT-C1 u otra feature borra
  servicios).
- **COB-B1** — `PROJECT.md:46` sigue listando `electron/services/pagos.ts` en `sensitive_globs`
  aunque el archivo desaparece. Inofensivo (el glob no matchea nada); lo edita el dueño cuando
  toque el contrato.
- **COB-B2** — `CierreCitaModal.tsx:100-106` redondea con `Math.round(x * 100) / 100` sin
  `Number.EPSILON`; el servidor y `LineasPago.tsx:18-20` sí lo usan (`cobros.ts:39-41`). En la
  práctica dan lo mismo (el épsilon no cambia el doble en los casos de medio centavo) y, si
  divergieran, el servidor rechaza ("excede") en vez de cobrar de más. Deuda cosmética: usar un
  solo `redondear` compartido.
- **COB-B3** — `ipc/index.ts:315` pasa `citaId` crudo a `estadoCuentaCita` sin zod. Igual que
  los demás handlers de id (`:136,139,151`); drizzle parametriza. Hygiene.
- **COB-B4** — `estatus_pago` es columna derivada **almacenada** (trade-off aceptado por el
  Gate). Hoy solo `cerrarCita`, `registrarAbono` y `cancelarPago` cambian total o pagos y los tres
  recalculan. `cancelarSalidaEnTx` rechaza salidas ligadas a servicio salvo
  `permitirLigadasAServicio` (`inventario.ts:720-722`), reservado para CIT-C1; `actualizarCita`
  solo toca borradores `abierto` (`citas.ts:165-172`). Regla para el Gate de CIT-C1: todo escritor
  de `precio`, `total_productos` o de una salida `venta` de un servicio cerrado llama a
  `recalcularEstatusEnTx` en la misma transacción.
- **COB-B5** (informativo) — DIN-A3 sigue abierto: el costo de consumos es 0
  (`servicios_productos_consumidos` vacía) y ahora el margen sí resta el costo de los productos
  vendidos en el ticket. El margen pasa de "100 %" a "ventas − costo de productos vendidos":
  menos falso, todavía incompleto. No es de esta Parte.

Hallazgos DIN que esta Parte cierra (para el plan): **DIN-A1** (N líneas, abonos), **DIN-A2**
(derivado, un solo saldo), **DIN-A4** (cancelación con PIN y motivo, nunca borrado), **DIN-A5**
(precio de venta en el ticket), **DIN-M1** (fecha del pago = día del cobro, con la mezcla
histórica declarada), **DIN-M2** (chequeo dentro de la transacción), **DIN-M3** (redondeo en
escritura y épsilon en comparaciones: `cobros.ts:36-41`, `corte.ts:19-26`, `PagosDeCita.tsx:60,73`),
**DIN-M4** (liga pago↔corte, transacción, corte vacío rechazado), **DIN-B3** (ya no se puede
mandar `cancelado` con monto). Siguen abiertos: DIN-A3, DIN-B1, DIN-B2.

### Condiciones del Gate aplicables a la Parte A

| Cond. | Verificación del Gate | Resultado |
|---|---|---|
| 1 | `grep -c "tarjetas_regalo\|cupones\|descuentos_servicio" drizzle/0005_*.sql` → 0; journal idx 4 y 5 separados | ✅ 0; idx 4 (`0004_cancelacion_inventario`) e idx 5 (`0005_cobro_v2`) |
| 2 | `grep -c "__new_\|DROP TABLE\|CREATE TABLE \`pagos\`"` → 0 | ✅ 0 |
| 3 | nota `evidencia-migracion-…` con tres conteos y la regla | ❌ no existe → COB-A1 |
| 4 | cabecera con plantilla; bitácora `estatus_pago_recalculado` por servicio cambiado | ✅ cabecera completa; 4 filas = 4 cambios en la copia sintética |
| 5 | `grep "insert(pagos)\|update(pagos)"` fuera de `cobros.ts` → 0; `grep "tarjetasRegalo\|cupones" cobros.ts` → 0 | ✅ 0 y 0 |
| 6 | `grep "from(pagos)"` fuera de `cobros.ts`/`corte.ts` → 0; `grep "\.precio ?? 0"` fuera de `cobros.ts` → 0 | ✅ 0 y 0 |
| 7 | `grep -c "cobros.ts\|tarjetasRegalo.ts\|cupones.ts" PROJECT.md` → 3 | ✅ 3 (commit `efc4795`) |
| 8 | corte en una transacción, pendiente síncrono dentro, redondeo; AC-009/010 con BD de prueba en la nota | ✅ código (`corte.ts:103-132`); ❌ evidencia manual → COB-A1 |
| 14 | canal o campo que exponga anticipos sin aplicar | ✅ `CorteResumenPendiente.anticiposSinAplicar` (`shared/types.ts`, `corte.ts:57-74`, `Corte.tsx:168-175`) |
| 15 | comprobante de tarjeta (Parte B) | n/a |

## 5. Riesgos activos — con fechas de detonación

### 5.1 `0005` llega a la instalación real sin radiografía (COB-A1)
Mecanismo: `migrate()` corre al abrir la app (`electron/db/index.ts:26`) tras el auto-update del
siguiente tag. `respaldarAntesDeMigrar` (`:45-76`) deja la copia previa, así que es reversible
con costo (se pierde lo capturado después). Si la radiografía DIN-M4 diera > 0, la decisión 3 liga
esos pagos a un corte cuyo total congelado no los incluye: ningún dinero se pierde (ya estaba fuera
de todo corte), pero la verificación 2 de la cabecera listará esos cortes y AC-007 queda falso
para esas filas sin que nadie lo sepa. Detona en la **fecha del próximo tag** (hoy no hay; último
`v0.1.4`).

### 5.2 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| 1 | Comparabilidad de "Cobranza recibida" por rango: filas viejas con fecha de cita, nuevas con fecha de cobro (DIN-M1, trade-off aceptado) | desde el día del release, permanente en el historial |
| 2 | Si CIT-C1 borra o reescribe servicios cerrados sin pasar por `cobros.ts`: pagos huérfanos (COB-M1) o etiquetas desincronizadas (COB-B4) | cuando se implemente CIT-C1 (su Gate debe heredar estas dos reglas) |

### 5.3 Causa raíz
No hay una: la implementación cumple el diseño. Lo que queda es (a) la verificación empírica
sobre datos reales que el Gate condicionó y nadie ha escrito, y (b) una FK heredada de `0000` que
la condición 2 impedía corregir en esta migración.

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** no crear el tag de la Parte A hasta que exista la nota de evidencia
  (COB-A1). Integrar la rama sí es posible: el código no tiene defectos de dinero.
- **Decisión A — anticipo solo con PIN (addendum, pendiente):** confirmar que BR-008 se cumple
  con PIN sin opción de comprobante para anticipos, o pedir el comprobante a la carpeta de la
  clienta (`archivos.entidad_tipo = 'cita'`). Si lo segundo, cambia `registrarAnticipo`
  (`cobros.ts:388-390`) y `anticipoInputSchema` (`shared/schemas.ts:184-188`); el resto no.
- **Decisión B — pagos del mismo segundo (solo si la radiografía da > 0):** mantener la decisión
  3 (ligarlos al corte, pendiente idéntico, cuadre histórico con desfase documentado) o dejarlos
  con `corte_id NULL` para que entren al próximo corte (el pendiente sube en ese monto, el dinero
  reaparece). En ambos casos §22.3 del spec se corrige para ese caso.
- **Cambio propuesto (COB-M1, en `0007`):** al recrear `pagos` para `cliente_id` nullable
  (condición 9b), declarar `servicio_realizado_id … ON DELETE restrict` y sumar a la radiografía
  de la `0007`: `SELECT COUNT(*) FROM pagos WHERE servicio_realizado_id IS NULL AND cita_id IS
  NULL` → esperado 0 (pagos sin dueño que la FK vieja habría permitido).
- **Cambio propuesto (COB-B2):** exportar `redondearDinero` desde `shared/` y usarlo en
  `CierreCitaModal.tsx:100-106` y `LineasPago.tsx:18-20`. Sin efecto en dinero; una sola fórmula.
- **Regla para el Gate de CIT-C1 (COB-B4):** la reversa de un servicio cerrado pasa por
  `cobros.cancelarPagoEnTx`/`recalcularEstatusEnTx` y por `cancelarSalidaEnTx(…,
  { permitirLigadasAServicio: true })` en la misma transacción; nunca `delete(serviciosRealizados)`.

**Verificación manual pendiente** (solo lectura; sobre un respaldo real abierto fuera del repo,
reportar solo conteos; es el contenido de la nota de COB-A1):

```sql
-- (3a) Radiografía DIN-M4, ANTES de migrar: pagos en el mismo segundo que un corte
SELECT COUNT(*) FROM pagos p JOIN cortes c ON p.created_at = c.created_at;
-- Esperado: 0. Si > 0 → Decisión B.

-- (3b) A-003, ANTES de migrar
SELECT COUNT(*) FROM pagos WHERE estatus = 'cancelado';
-- Esperado: 0

-- (3c) Pendiente ANTES de migrar (consulta vieja, corte.ts @ efc4795:36)
SELECT COUNT(*), COALESCE(SUM(monto),0) FROM pagos
 WHERE estatus = 'cobrado' AND created_at > (SELECT COALESCE(MAX(created_at),0) FROM cortes);
-- Anotar ambos números.

-- Sobre una COPIA con 0005 aplicada:
-- (3c') Pendiente DESPUÉS: debe ser idéntico a (3c)
SELECT COUNT(*), COALESCE(SUM(monto),0) FROM pagos WHERE estatus = 'cobrado' AND corte_id IS NULL;

-- (3c'') Cuadre corte ↔ pagos ligados
SELECT c.fecha, c.total, COALESCE(SUM(p.monto),0) AS ligados FROM cortes c
  LEFT JOIN pagos p ON p.corte_id = c.id GROUP BY c.id
 HAVING ABS(c.total - COALESCE(SUM(p.monto),0)) >= 0.005;
-- Esperado: 0 filas (si hay, su número debe coincidir con (3a))

-- (4) Rastro del recálculo = servicios cuya etiqueta cambió
SELECT COUNT(*) FROM bitacora WHERE accion = 'estatus_pago_recalculado';
-- Esperado: igual al conteo de servicios cerrados con viejo <> nuevo medido ANTES con el CASE de C1

-- (7) Ningún servicio cerrado incoherente (consulta de la cabecera, verificación 7)
-- Esperado: 0

-- (8) Migraciones registradas
SELECT COUNT(*) FROM __drizzle_migrations;
-- Esperado: 6
```

Prueba manual con BD de prueba (`npm run dev`), a documentar con los números en la misma nota:
AC-001 (800 + 200, Efectivo 500 + Tarjeta 300 → total 1,000, `parcial`, saldo 200, corte muestra
500/300), AC-002 (abono Transferencia 200 → `pagado`, fecha de hoy, fuera de cuentas por cobrar),
AC-003 (cancelar Tarjeta 300 ya cortado → siguiente corte "Ajuste Tarjeta −300", estatus
`parcial`), AC-004 (anticipo 400, cierre de 1,000 pide 600; el corte cuenta 400 una vez), AC-005
(exceso rechazado, nada escrito), AC-006 (saldo 200, no −200), y la parte de dinero de AC-009:
K1 1,400 / K2 1,400 / K3 0 con Tarjeta −200 y Efectivo +200.

## 7. Qué sigue

1. **Carlos confirma** la Decisión A (anticipo solo con PIN) en §23 del spec, o pide el
   comprobante por cita → engineering ajusta `registrarAnticipo` si aplica.
2. **Carlos corre** las consultas (3a)–(3c) sobre un respaldo real fuera del repo y la prueba
   manual de AC-001…AC-006/AC-009; **engineering escribe** `.notes/evidencia-cobro-v2-parte-a-<fecha>.md`
   con los conteos, la regla elegida para (3a) si > 0, y los totales (COB-A1). Si (3a) > 0 →
   Decisión B antes del tag.
3. **Integrar** la rama por PR con CI verde (typecheck y build ya pasan aquí). El tag espera al
   punto 2.
4. **Tras el release:** fila `0004` y `0005` en `APPLIED-MIGRATIONS.md` leyendo
   `__drizzle_migrations` de un respaldo (esperado 6 filas); la `0007` de la Parte B no sale antes
   de esa fila verificada (condición 1).
5. **En la `0007`:** `servicio_realizado_id` a `restrict` con su radiografía (COB-M1). **En el
   Gate de CIT-C1:** heredar COB-B4. COB-B1/B2/B3: backlog explícito, sin fecha.
