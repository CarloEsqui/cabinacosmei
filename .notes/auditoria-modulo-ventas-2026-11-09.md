# Auditoría — Módulo Ventas y regla "sin clienta no hay crédito" — 2026-11-09 (VMD-*)

**Scope:** el delta sin commitear del working tree sobre `6392b21` (rama `atlas/venta-mostrador`):
20 archivos modificados/borrados según `git diff 6392b21 --stat` más tres sin seguimiento
(`src/pages/Ventas.tsx`, `src/components/ventas/PuntoDeVenta.tsx`,
`src/components/ventas/PorCobrar.tsx`) y el borrado de `src/components/ventas/VenderProductoModal.tsx`.
Superficies: **Dinero** (`electron/services/cobros.ts`, `electron/services/ventasMostrador.ts`),
inventario (lectura nueva en `listarMovimientos`), contrato IPC/zod, UI del módulo y el spec
(`.notes/spec-venta-mostrador-2026-11-06.md` §23 y reglas reemplazadas). Contra: el Gate
`.notes/gate-001-venta-mostrador-2026-11-06.md`, la auditoría previa (`VEN-*`) y
`Atlas/gates/architecture.md`. **No** se auditó: la migración `0008` (sin cambios en este delta,
ya auditada el 2026-11-06), `corte.ts`, `reportesFinanzas.ts` salvo su lector de ventas, ni la
Parte B (no existe).
**Method:** inspección de código con `file:line`, `git diff` de solo lectura, `npm run typecheck`
(verde) y `npm run build` (verde, §4.4). Sin base de datos: no se abrió ninguna BD real ni de prueba;
las consultas de §6 quedan como verificación manual pendiente. Ninguna operación de git que escriba.
**PII declaration:** no se tocó ningún dato personal. El reporte cita código, folios de ejemplo
(`VTA-####`) y códigos `CL-####`; nunca nombres. Un hallazgo (VMD-B3) habla de texto libre que la
usuaria *podría* escribir, sin ejemplo real.
**State as of:** 2026-11-09 12:41 CST; working tree sobre `6392b21` (2026-11-06 15:03:49 -0600).

---

## 1. Resumen ejecutivo

1. **La regla estricta "sin clienta no hay crédito" (BR-003 de §23 / VEN-A1) está CERRADA en el
   main en todas las rutas que pueden dejar saldo a una venta sin clienta.** Las rutas son
   exactamente cuatro y las cuatro la aplican dentro de la transacción: registrar
   (`ventasMostrador.ts:154-156`, FR-005), cancelar un pago (`cobros.ts:563-565`, ahora
   `if (!v.clienteId)` sin la excepción por nombre de referencia), aplicar/cambiar descuento
   (`cobros.ts:827` → `exigirSinDeudaHuerfanaEnTx`, `:1012-1021`, `if (!v || v.clienteId) return`)
   y quitar descuento (`cobros.ts:867`). No hay quinta ruta: los únicos `update(ventasMostrador)`
   del main son `estatus` al cancelar (`ventasMostrador.ts:225`), `estatus_pago`
   (`cobros.ts:990`) y la caché `descuento` (`cobros.ts:1036`); `cliente_id` y `total_productos`
   solo se escriben en el `insert`; `cancelarPagoEnTx` solo lo llaman `cancelarPago` y
   `cancelarVenta`. La UI oculta las acciones con `admiteSaldo = Boolean(v.clienteId)`
   (`ventasMostrador.ts:406`; `VentaDetalleModal.tsx:176`, `:207`, `:258`), pero la regla no
   depende de ella.
2. **Cancelar sin motivo es CORRECTO y no rompe nada.** `cancelarVentaInputSchema.motivo` es
   opcional ≤ 120 (`schemas.ts:301-308`); el main guarda `null` en
   `ventas_mostrador.motivo_cancelacion`, columna nullable desde la `0008`
   (`drizzle/0008_venta_mostrador.sql:114`); los pagos reciben siempre un motivo no vacío
   (`"Venta VTA-#### cancelada: sin motivo"`, `ventasMostrador.ts:216`, `:235`), así `cancelarPagoEnTx`
   sigue haciendo `motivo.trim()` sin riesgo (`cobros.ts:586`); las salidas reciben
   `"Venta VTA-#### cancelada"` (`:249`); la bitácora escribe `motivo: sin motivo` (`:257`). El corte
   no cambia: los pagos cancelados ya cortados siguen saliendo como ajuste (`cancelarPagoEnTx` no se
   tocó). El PIN sigue siendo obligatorio (`:212`).
3. **La cancelación completa de una venta sin clienta no viola BR-003 por construcción.** El
   `update` a `cancelada` ocurre ANTES de cancelar los pagos (`ventasMostrador.ts:225-235`),
   `recalcularEstatusVentaEnTx` no reevalúa una venta no vigente (`cobros.ts:987`) y `saldoVenta`
   devuelve 0 para toda venta no vigente (`cobros.ts:937-939`): nunca existe un instante con saldo.
4. **Las tres lecturas nuevas son correctas y de solo lectura.** `ventasPorCobrar`
   (`ventasMostrador.ts:336-340`): `vigente` ∧ `cliente_id IS NOT NULL`, saldo **calculado** (no la
   caché), `.reverse()` sobre el orden `createdAt desc` de `filas` ⇒ la más antigua primero;
   coherente con VEN-B1. `productosFrecuentes` (`:342-364`): `SUM(cantidad)` de salidas unidas por
   `inner join` a ventas `vigente` con `fecha ≥ hoy − 90`, `limit 8`, solo ids y piezas.
   `listarMovimientos` (`inventario.ts:835-848`, `:871-872`): un `leftJoin` por `venta_mostrador_id`
   (id único: no multiplica filas), y el CSV de movimientos no exporta las columnas nuevas
   (`exportarCsv.ts:207-216`). Ninguna de las tres ejecuta `insert/update/delete`.
5. **El punto de venta no puede mandar nada que el main no valide.** Lo que la UI bloquea en
   `PuntoDeVenta.tsx:126-138` (precio > 0, piezas enteras, stock, descuento, pago completo sin
   clienta) el main lo vuelve a comprobar: zod (`schemas.ts:276-299`: `cantidad int positive`,
   `precioUnitario positive`, `nombreReferencia ≤ 80`, `observaciones ≤ 500`, `descuento.aplicaA`
   fijo), `ventasMostrador.ts:82-101` (clienta existe y activa, producto activo, precio y cantidad),
   `:154-156` (FR-005), `:88` (nombre de referencia se anula con clienta aunque el renderer lo mande)
   y el stock vía `registrarSalidaEnTx`. "Repetir venta" llega como estado de navegación y se
   convierte en carrito (`Ventas.tsx:73-95`): si la cantidad ya no alcanza, la UI avisa y el main
   rechaza. El doble envío sigue cubierto (`PuntoDeVenta.tsx:482`, carrito vacío en `onSuccess`,
   VEN-B4). El token del comprobante se descarta al desmontar o al vaciar (`:102-107`, `:168`);
   descartar un token ya consumido es un no-op (`seleccionesArchivo.ts:51-53`).
6. **Dirección de dependencias intacta.** `cobros.ts:1-22` no importa `ventasMostrador.ts`
   (su cabecera lo declara, `:37-39`); `inventario.ts:12` importa la **tabla** `ventasMostrador`
   del esquema, no el servicio; `ventasMostrador.ts:11-25` importa `inventario` y `cobros`. Sigue
   `ventasMostrador → cobros, inventario`. `reportesFinanzas.ts:6` → `ventasMostrador` ya existía.
7. **PII en bitácora: CORRECTA.** `venta_registrada` escribe `CL-####` o `"público general"` /
   `"sin registro (con nombre)"`, nunca el nombre (`ventasMostrador.ts:167-179`); `venta_cancelada`
   escribe folio, total, conteo y motivo (`:252-258`). `nombre_referencia` sigue sin entrar a
   bitácora, CSV ni notas. El único texto libre que entra es el motivo "Otro" (VMD-B3, bajo).
8. **§23.5 (no correr un Gate nuevo) SE SOSTIENE** contra `gates/architecture.md:14-28`: no hay
   módulo ni servicio nuevo en `electron/services/` (la página es renderer), no hay migración ni
   cambio de dueño de dato, los dos canales IPC nuevos son de lectura y la regla de dinero se
   **estrecha** (menos estados posibles) con reversión de una línea (`cobros.ts:563`, `:1014`).
   Encaja en "trivial or highly reversible" (`:28`). Las decisiones del dueño están por escrito
   (§23.1-23.2), que es el insumo que el Gate exige (`:41-47`) si algún día se reabre.
9. **Hallazgos: 0 críticos, 0 altos, 0 medios, 4 bajos** (VMD-B1…B4): spec con tramos que
   contradicen la regla nueva, carrito que se descarta sin aviso al cambiar la llave de montaje,
   texto libre del motivo "Otro" en bitácora, y una nota de crecimiento en `ventasPorCobrar`.
10. **Sin bomba de tiempo** (§5): nada se degrada solo con los días.

## 2. Cómo funciona de verdad (referencia)

**Dinero de una venta** (sin cambios en este delta, se cita para anclar):

```
total     = redondear(total_productos − descuento)                 ← cobros.ts totalVenta
cobrado   = Σ pagos.monto WHERE venta_mostrador_id = v AND estatus = 'cobrado'  ← cobradoPorVenta
saldo     = v.estatus = 'vigente' ? max(0, redondear(total − cobrado)) : 0      ← cobros.ts:937-940
estatus_pago = derivarEstatusPago(total, cobrado)   solo si vigente              ← cobros.ts:981-993
```

**Invariante BR-003 estricta (§23):** `cliente_id IS NULL ⇒ saldo = 0` en toda venta vigente.
Dónde se sostiene, por ruta de escritura:

| Ruta | Guardia | Diseño o bug |
|---|---|---|
| `registrarVenta` | `!clienteId && |suma − total| > TOLERANCIA → throw` (`ventasMostrador.ts:154-156`) | Diseño (FR-005) |
| `cancelarPago` | `pago.ventaMostradorId && !v.clienteId → throw` (`cobros.ts:559-566`) | Diseño (§23) |
| `aplicarDescuento` (venta) | BR-005 `cobrado > total` (`:821-826`) **y** `exigirSinDeudaHuerfanaEnTx` (`:827`) | Diseño (VEN-A1 + §23) |
| `quitarDescuento` (venta) | `cancelarDescuentoEnTx` → `exigirSinDeudaHuerfanaEnTx` (`:866-867`); si lanza, la transacción revierte | Diseño |
| `registrarAbonoVenta` | solo reduce saldo; exige `vigente` y `saldo > 0` (`:1130-1136`) | No puede crear deuda |
| `cancelarVenta` | `estatus = cancelada` antes de tocar pagos (`ventasMostrador.ts:225-235`); `saldoVenta` → 0 | Diseño |

`exigirSinDeudaHuerfanaEnTx` (`cobros.ts:1012-1021`) relee la venta dentro de la transacción,
sale si tiene clienta, y lanza si `saldoVenta > TOLERANCIA` (`TOLERANCIA = 0.005`, `:54`).

**Cancelación sin motivo** (`ventasMostrador.ts:211-260`): `motivo = input.motivo?.trim() || null`;
`textoMotivo = motivo ?? "sin motivo"`. Los tres destinos del texto: `ventas_mostrador.motivo_cancelacion`
(nullable), `pagos.motivo_cancelacion` (siempre con texto), `salidas_inventario.cancelada_motivo`
(texto fijo). El detalle muestra "Venta cancelada." sin dos puntos cuando el motivo es `null`
(`VentaDetalleModal.tsx:152-157`, lógica idéntica a la versión anterior).

**Movimientos** (`Movimientos.tsx:46-55`): `esCancelable` ahora excluye `ventaMostradorId`, así
"Cancelar…" ya no se ofrece a una salida de venta; en su lugar "Ver venta VTA-####" abre el
detalle (`:206-216`). El main ya rechazaba esa cancelación (`inventario.ts:748-750`, AC-008), así
que el cambio es de UI sobre una regla que ya vivía en el main.

**Módulo `/ventas`** (`Ventas.tsx`): tres pestañas; el punto de venta queda montado y oculto al
cambiar de pestaña (`:44-46`); el globito "Por cobrar" es `porCobrar.length` (`:28-37`). La
`llave` de montaje del punto de venta es `location.key` si se llegó con `?cliente=` o con estado
`repetir`, y `"pos"` en cualquier otro caso (`:45`) — ver VMD-B2.

## 3. Origen de los datos

| Dato | Origen | Estatus |
|---|---|---|
| `ventas_mostrador.motivo_cancelacion = NULL` | `cancelarVenta` sin chip (`ventasMostrador.ts:215`, `:226`) | ✅ columna nullable (`0008:114`) |
| `pagos.motivo_cancelacion` de una venta cancelada | texto fijo con folio y `textoMotivo` (`:235`) | ✅ nunca vacío |
| Lista "Por cobrar" y globito | `ventasPorCobrar` (`:336-340`), saldo calculado | ✅ |
| "Frecuentes" | `productosFrecuentes` (`:349-364`), solo ventas vigentes, 90 días | ✅ |
| `MovimientoRow.ventaMostradorId / ventaFolio` | `leftJoin` en `listarMovimientos` (`inventario.ts:846`) | ✅ no entra al CSV |
| `DetalleVentaMostrador.admiteSaldo` | `Boolean(v.clienteId)` (`ventasMostrador.ts:406`) | ✅ reemplaza `permitePagoSuelto` |
| Carrito de "Repetir venta" | `ventas:detalle` + catálogo, armado en el renderer (`Ventas.tsx:73-95`) | ✅ el main revalida todo |
| Cartera sin clienta (`carteraTotal`, Finanzas) | `ventasConSaldo` filtrando `!clienteId` (`reportesResumen.ts:320`; `reportesFinanzas.ts:176-178`) | ✅ debe dar 0 bajo la regla nueva; si no, se muestra (decisión §23.3) |
| Spec §9, §20, §22.3, §22.5 | texto del 2026-11-06 | ⚠️ VMD-B1: tramos no marcados como reemplazados |

## 4. Caso por caso

No hay sujetos (clientas) en esta auditoría: no se abrió ninguna BD. Los casos son rutas de código.

### 4.1 Las decisiones del dueño (§23.2) contra el código

| Decisión | Dónde | Lectura |
|---|---|---|
| Motivo opcional con chips "Devolución" / "Error al capturar" / "Otro" + PIN | `VentaDetalleModal.tsx:409-487`; botón solo exige `pin.length ≥ 4` (`:482`); `schemas.ts:306` | ✅ "Otro" sin texto manda `undefined` → "sin motivo" (aceptable; §23.2 dice "Otro (con texto)", la UI no lo obliga) |
| Punto de venta en página, catálogo + carrito, sin pop-up | `PuntoDeVenta.tsx:237-490` | ✅ |
| Frecuentes, Por cobrar, Repetir venta | `:252-259`; `PorCobrar.tsx`; `VentaDetalleModal.tsx:143-148`, `:247-251`, `:272-274` | ✅ |
| Quitar pestaña Ventas de Inventario; atajos al módulo (Inicio, Inventario, ficha con clienta) | `Inventario.tsx` (tab eliminada); `Dashboard.tsx:240-245`; `Resumen.tsx:176`; `ListaVentas.tsx:111` (`?cliente=`) | ✅ |
| Sin clienta no hay crédito, con o sin nombre | ver §1.1 | ✅ en main y UI |

### 4.2 Rutas que podrían dejar saldo a una venta sin clienta (censo exhaustivo)

| # | Ruta | ¿Puede subir el saldo? | Guardia en el main | Resultado |
|---|---|---|---|---|
| 1 | `ventas:registrar` | sí (pago parcial) | `ventasMostrador.ts:154-156` | ✅ |
| 2 | `cobros:cancelarPago` | sí | `cobros.ts:563-565` | ✅ |
| 3 | `cobros:aplicarDescuento` (reemplazar un descuento mayor por uno menor) | sí | `cobros.ts:827` | ✅ |
| 4 | `cobros:quitarDescuento` | sí | `cobros.ts:867` | ✅ |
| 5 | `cobros:registrarAbono` | no | `:1130-1136` | n/a |
| 6 | `ventas:cancelar` | no (saldo → 0 por `estatus`) | `ventasMostrador.ts:225`; `cobros.ts:938` | ✅ |
| 7 | `inventario:cancelarSalida` sobre una salida de venta | no toca dinero; rechazada | `inventario.ts:748-750` | ✅ |
| 8 | Cambio de `cliente_id` después del alta | no existe escritor | `grep update(ventasMostrador)` → 3 sitios, ninguno toca `cliente_id` | ✅ |
| 9 | Reversa de cita (CIT-C1) | solo pagos con `servicio_realizado_id` | `cancelarPagoEnTx` callers: 2 | n/a |

### 4.3 Hallazgos

**VMD-B1 (Bajo) — El spec conserva tramos que contradicen BR-003 estricta sin marcarlos como
reemplazados.** `.notes/spec-venta-mostrador-2026-11-06.md:170-171` (§9: "Venta con nombre de
referencia y un pago cancelado: queda parcial o pendiente… y se le puede abonar") describe un
estado que el main ahora rechaza (`cobros.ts:563-565`); `:418` (§22.3, fila `cancelarPago`:
"Rechaza un pago de una venta sin clienta **y sin nombre de referencia**") y `:467` (§22.5, cartera
"sin clienta y con nombre de referencia, como 'nombre (sin registro)'") describen la regla vieja;
§20 segunda ronda (`:347-350`) solo queda reemplazada por referencia desde §23.1. BR-003 (`:132-138`),
FR-006, FR-009, FR-011, §11, §12 y el addendum VEN-A1 sí están al día. Regla Atlas 6: la
documentación refleja la realidad. Fix: marcar los cuatro tramos "(reemplazado en §23)" como ya se
hizo en §12; una línea cada uno.

**VMD-B2 (Bajo) — El carrito del punto de venta se descarta sin aviso cuando cambia la llave de
montaje.** `Ventas.tsx:45` monta `PuntoDeVenta` con `key = location.key` si hay `?cliente=` o
estado `repetir`, y `"pos"` si no. Dos secuencias pierden un carrito en curso en silencio:
(a) con productos ya capturados en `/ventas`, picar "Vender producto" en una ficha de clienta o
"Repetir venta" → nueva `key` → carrito nuevo; (b) haber llegado por un atajo, capturar, y volver
a `/ventas` por el menú lateral → `key = "pos"` → carrito vacío. No toca datos: nada se registra
sin "Cobrar", y el token del comprobante se descarta en el `useEffect` de desmontaje
(`PuntoDeVenta.tsx:102-107`), así que no queda selección colgada en el main. Es UX contra la
promesa de §23.4 ("el carrito se conserva al cambiar de pestaña", que sí se cumple entre pestañas).
Fix sugerido: si `lineas.length > 0` y llega un `inicio` nuevo, confirmar antes de reemplazar; o
mantener `key` estable y aplicar `inicio` con un efecto.

**VMD-B3 (Bajo) — El motivo "Otro" es texto libre que entra a `ventas_mostrador.motivo_cancelacion`,
a `pagos.motivo_cancelacion` y a la bitácora.** `VentaDetalleModal.tsx:419-422` concatena el texto;
`ventasMostrador.ts:235`, `:257` lo escriben. BR-009 prohíbe que el **sistema** escriba el nombre
de la clienta o el de referencia (se cumple); el texto libre depende de la usuaria y el placeholder
lo advierte ("sin nombres ni datos de salud", `:472`). Es el mismo patrón ya aceptado en
`cancelarPago` (`schemas.ts:265`) y `quitarDescuento`; con los chips la exposición **baja** respecto
a la versión anterior, donde el motivo era texto libre obligatorio. Informativo. Reopen if: alguna
exportación (CSV, respaldo legible, notas) empieza a incluir `motivo_cancelacion` o `bitacora.detalle`.

**VMD-B4 (Bajo) — `ventasPorCobrar` recorre todas las ventas vigentes con clienta en cada montaje
de `/ventas`.** `ventasMostrador.ts:337` llama a `filas` sin paginación, que además consulta
`cobradoPorVenta` y las salidas de todos los ids (`:289-299`), y filtra el saldo en JS. Para una
cabina (cientos o pocos miles de ventas en años) es instantáneo en SQLite; la lista sí se pagina de
30 en el renderer (`PorCobrar.tsx:17`, `:56`). Deuda de crecimiento, no error. Reopen if:
`SELECT COUNT(*) FROM ventas_mostrador WHERE estatus='vigente' AND cliente_id IS NOT NULL` supera
~5 000 o la pestaña tarda en abrir; el fix es filtrar `estatus_pago <> 'pagado'` en SQL como
primer corte (la caché la escribe solo `recalcularEstatusVentaEnTx`) y confirmar con el cálculo.

### 4.4 Verificación del contrato (PROJECT.md `verification`)

- `npm run typecheck` → **verde** (tsc renderer + main). Esto además prueba que el borrado de
  `VenderProductoModal.tsx` no dejó imports colgados y que `Tabs.badge`, `usePaginacion`,
  `fechaLocalIso(Date)` y el tipo de retorno de `ventas:registrar` (`aviso?`) existen.
- `npm run build` → **verde** (`exit=0`; typecheck + `vite build` del renderer, main y preload). Tardó ~12 min en este entorno por la fase `transforming` de Vite 8, sin errores.
- No hay tests automatizados (PROJECT.md): la prueba manual de §6 sigue siendo obligatoria sobre una
  BD de prueba, nunca sobre la real.

## 5. Riesgos activos — con fecha de detonación

### 5.1 Ninguno con mecanismo propio
No hay cálculo por fecha, caducidad ni acumulación que convierta un hallazgo de esta auditoría en
pérdida. VMD-B4 crece con el volumen, no con el calendario, y su umbral queda escrito.

### 5.2 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| — | Ninguna | — |

### 5.3 Causa raíz
Los cuatro hallazgos son de reflejo (spec), de UX (llave de montaje) y de higiene (texto libre,
crecimiento). Ninguno nace de la regla de dinero: la regla estricta se implementó quitando
condiciones (`!v.nombreReferencia`), lo que reduce estados posibles en vez de añadir caminos.

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** nada que congelar. El delta puede integrarse a `atlas/venta-mostrador` en
  cuanto `npm run build` quede verde y la prueba manual de abajo quede escrita como evidencia.
- **Decisión A — ¿"Otro" obliga texto?** §23.2 dice "Otro (con texto)"; la UI admite "Otro" vacío
  y lo guarda como sin motivo (`VentaDetalleModal.tsx:422`). (a) Dejarlo así (recomendado: el
  dueño pidió motivo opcional); (b) deshabilitar el botón si `chip === "Otro"` y el texto está
  vacío. Una línea en cualquier caso.
- **Decisión B — ¿Se protege el carrito en curso (VMD-B2)?** (a) Confirmar antes de reemplazarlo;
  (b) aceptar la pérdida y escribirlo en §23.4. Sin impacto en datos.
- **Cambio propuesto (VMD-B1):** cuatro anotaciones "(reemplazado en §23)" en el spec, líneas
  170-171, 347-350, 418 y 467. Sin tocar código.
- **Anti-lista (no perseguir ahora):** VMD-B3 (patrón ya aceptado en cobros; reopen escrito) y
  VMD-B4 (umbral escrito).

**Pendiente de verificación manual** (solo lectura, sobre una BD de prueba con `npm run dev`
después de ejercitar el módulo; nunca sobre la BD real):

```sql
-- 1) Invariante BR-003 estricta: ninguna venta vigente sin clienta debe nada.
SELECT v.folio,
       ROUND(v.total_productos - v.descuento, 2) AS total,
       ROUND(COALESCE(SUM(p.monto), 0), 2)       AS cobrado
FROM ventas_mostrador v
LEFT JOIN pagos p ON p.venta_mostrador_id = v.id AND p.estatus = 'cobrado'
WHERE v.estatus = 'vigente' AND v.cliente_id IS NULL
GROUP BY v.id
HAVING ABS(total - cobrado) > 0.005;
-- Esperado: 0 filas (también después de intentar cancelar un pago y quitar el descuento de una
-- venta de público general con nombre de referencia: el main debe rechazar ambas).
```

```sql
-- 2) Cancelación sin motivo: rastro completo y consistente.
SELECT v.folio, v.motivo_cancelacion,
  (SELECT COUNT(*) FROM pagos p WHERE p.venta_mostrador_id = v.id AND p.estatus = 'cobrado')              AS pagos_vivos,
  (SELECT COUNT(*) FROM pagos p WHERE p.venta_mostrador_id = v.id AND p.motivo_cancelacion LIKE '%sin motivo%') AS pagos_sin_motivo,
  (SELECT COUNT(*) FROM salidas_inventario s WHERE s.venta_mostrador_id = v.id AND s.estatus = 'vigente') AS salidas_vivas
FROM ventas_mostrador v
WHERE v.estatus = 'cancelada';
-- Esperado: pagos_vivos = 0 y salidas_vivas = 0 en todas; motivo_cancelacion NULL en la cancelada
-- sin chip, y en esa misma fila pagos_sin_motivo = número de pagos que tenía.
```

```sql
-- 3) Bitácora sin nombres (BR-009) y con "sin motivo".
SELECT accion, detalle
FROM bitacora
WHERE entidad_tipo = 'venta_mostrador'
ORDER BY created_at DESC
LIMIT 20;
-- Esperado: solo folios VTA-, códigos CL-####, "público general" / "sin registro (con nombre)",
-- montos y "motivo: sin motivo" en la venta cancelada sin chip. Ningún nombre.
```

```sql
-- 4) "Por cobrar" = ventas vigentes con clienta y saldo calculado (compara con el globito).
SELECT COUNT(*) FROM (
  SELECT v.id, ROUND(v.total_productos - v.descuento - COALESCE(SUM(p.monto), 0), 2) AS saldo
  FROM ventas_mostrador v
  LEFT JOIN pagos p ON p.venta_mostrador_id = v.id AND p.estatus = 'cobrado'
  WHERE v.estatus = 'vigente' AND v.cliente_id IS NOT NULL
  GROUP BY v.id
) WHERE saldo > 0.005;
-- Esperado: igual al número del globito de la pestaña "Por cobrar".
```

Pruebas de pantalla (sin SQL):
- Movimientos → una salida de venta muestra "Ver venta VTA-####" y **no** "Cancelar…"; el detalle
  que abre permite cancelar la venta con PIN y sin chip. Esperado: toast "Venta VTA-#### cancelada".
- Venta de público general con nombre de referencia → detalle sin "Cancelar pago" ni
  "Aplicar/Cambiar descuento", y con el aviso "Sin clienta la venta no puede quedar debiendo".
- Punto de venta sin clienta con pago incompleto → botón deshabilitado con el texto de
  `PuntoDeVenta.tsx:136`; con clienta → "Registrar · queda debiendo $Y".
- "Repetir venta" de una venta cancelada → pestaña Vender con la misma clienta/nombre y cantidades;
  precio = catálogo actual.
- `npm run build` verde (PROJECT.md).

## 7. Qué sigue

1. Carlos lee este reporte y decide A y B (§6) → ingeniería anota el spec (VMD-B1) y, si aplica,
   la línea de "Otro" y la confirmación del carrito.
2. El implementador escribe la evidencia (`.notes/evidencia-modulo-ventas-2026-11-09.md`) con la
   salida literal de las cuatro consultas y las pruebas de pantalla, sobre BD de prueba.
3. `npm run typecheck` y `npm run build` verdes → Carlos integra el delta en la rama y abre el PR
   (los commits los corre él).
4. Reabrir VMD-B4 solo si se cruza el umbral escrito; VMD-B3 solo si alguna exportación empieza a
   incluir texto libre.
