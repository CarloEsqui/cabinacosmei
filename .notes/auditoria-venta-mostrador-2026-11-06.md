# Auditoría — Venta de productos en mostrador (migración 0008, `ventasMostrador.ts`, `cobros.ts`, inventario, comprobantes, reportes, reinicio) — 2026-11-06 (VEN-*)

**Scope:** Working tree sin commitear de la rama `atlas/venta-mostrador` sobre `182dbaa` (main con
`0004`…`0007`). Código: `drizzle/0008_venta_mostrador.sql`, `drizzle/meta/0008_snapshot.json`,
`drizzle/meta/_journal.json`, `electron/db/schema.ts`; `electron/services/ventasMostrador.ts`
(nuevo), `cobros.ts`, `inventario.ts`, `comprobantes.ts`, `archivos.ts`, `reinicio.ts`,
`reportesResumen.ts`, `reportesFinanzas.ts`, `reportesClientesDetalle.ts`; `electron/ipc/index.ts`,
`electron/preload.ts`; `shared/{ipc-contract,schemas,types}.ts`; UI `src/components/ventas/*`,
`src/components/inventario/SalidaForm.tsx`, `src/pages/Inventario.tsx`,
`src/pages/inventario/Resumen.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Clientes.tsx` y los
helpers exportados de `src/pages/agenda/PagosDeCita.tsx` y `src/components/cobros/Comprobantes.tsx`.
Lectores que NO cambian pero que leen `pagos`: `corte.ts`, `dashboard.ts`, `clientes.ts`,
`exportarCsv.ts` (verificados por grep y lectura). Se mide contra el
[spec de la venta](spec-venta-mostrador-2026-11-06.md) (§6–§7, §10, §13, §18, §20, §22) y las 13
condiciones del [Gate 001](gate-001-venta-mostrador-2026-11-06.md). **No auditado:** la Parte B,
CIT-C1, DIN-A3, `src/components/ui/*` reutilizados (`LineasPago`, `DescuentoCampo`,
`SelectBuscable`) más allá de cómo los consume el modal, `respaldos.ts`, el pipeline de releases.
**Method:** Solo lectura. `git status`/`git diff`, lectura de archivos, los greps de las 13
condiciones del Gate corridos tal cual (resultados en §4), `npm run typecheck` (verde) y
`npx drizzle-kit check` ("Everything's fine"). Prueba de la migración sobre una **copia sintética**
en SQLite 3.45 (CLI, en el scratchpad, fuera del repo): `0000`–`0003` + fixture inventado (2
clientas, 1 cita, 1 servicio, 3 pagos, uno con `usuario_id` nulo) + `0004`→`0008` dentro de UN solo
`BEGIN`/`COMMIT` con `foreign_keys = ON` (la misma secuencia que
`drizzle-orm/sqlite-core/dialect.js:657-676`, que es la que correrá en la cabina); las sondas del
apartado "VERIFICACIÓN MANUAL" de la cabecera de la 0008; y un contraejemplo con una referencia
colgante en `pagos` (con `-bail`, que es el comportamiento del migrador). No se ejecutó la app; los
AC se trazaron en código.
**PII declaration:** Sin PII. No se abrió ninguna base real ni respaldo. El fixture es inventado
(`CL-0001`, `CL-0002`, `SRV-0001` son placeholders). Ningún nombre, teléfono ni nota. Este informe
no reproduce ningún `nombre_referencia`.
**State as of:** 2026-11-06, rama `atlas/venta-mostrador` @ `182dbaa` + working tree (24 archivos
modificados, 6 rutas sin rastrear).

---

## 1. Resumen ejecutivo

1. **La migración `0008` es CORRECTA y segura para la instalación real, con la condición 13a como
   único candado.** Sobre la copia sintética en `0003` con pagos, el lote `0004`→`0008` en un solo
   `BEGIN` con FK activas termina en `COMMIT`: `pagos` conserva conteo y Σ `monto` (3 / 850.50
   antes y después), conserva `usuario_id`, `venta_mostrador_id` nace NULL en todas,
   `integrity_check = ok`, `foreign_key_check` vacío, 9 FK en `pagos` con `restrict` en
   `cliente_id`, `servicio_realizado_id` y `venta_mostrador_id` (COB-M1 cerrado), `cliente_id`
   `notnull = 0`, 6 índices (3 + 3), los tres CHECK de `descuentos_servicio` reescritos por el
   `RENAME` a `"descuentos_servicio"."…"` (la decisión 5 de la cabecera es cierta), y la FK de
   `salidas_inventario.venta_mostrador_id` es `RESTRICT` (decisión 3 cierta). El `INSERT … SELECT`
   corregido a mano funciona (decisión 2). `drizzle-kit check` verde; `0008_snapshot.prevId` =
   `0007_snapshot.id`; journal idx 8. **Contraejemplo:** un pago con `usuario_id` huérfano en la
   copia hace fallar el `INSERT … SELECT` de `__new_pagos` con `FOREIGN KEY constraint failed`; el
   `ROLLBACK` deja la base intacta en `0003` (0 tablas nuevas, el pago sigue, `cliente_id` sigue
   NOT NULL). Es exactamente el riesgo que la cabecera declara y que la radiografía 13a debe medir
   **antes del tag** (ver §6, pendiente manual).
2. **La definición de dinero de la venta es única y vive en el main.** `totalVenta` =
   `redondear(total_productos − descuento)` (`cobros.ts:930-932`); `saldoVenta` devuelve 0 para una
   venta cancelada (`cobros.ts:935-938`); el total de productos se calcula en el main como
   `redondear(Σ redondear(cantidad × precio))` (`ventasMostrador.ts:103-105`, FR-003), el estatus
   lo deriva solo `recalcularEstatusVentaEnTx` (`cobros.ts:979-992`) con el mismo
   `derivarEstatusPago` de los servicios, y la caché `descuento` se recalcula desde la tabla
   (`cobros.ts:1005-1013`). El renderer no manda totales ni estatus (`schemas.ts:276-294`).
3. **Las reglas de negocio están en el main, dentro de la transacción.** FR-005 y BR-007
   (`ventasMostrador.ts:153-157`), BR-004 producto activo (`:94-98`) y stock (vía
   `registrarSalidaEnTx`, `inventario.ts:503-512`), BR-005 precio > 0 y cantidad > 0 (`:99-102`,
   además de zod), BR-002 en `registrarPagosEnTx` (`cobros.ts:300-308`), BR-003 en `cancelarPago`
   (`cobros.ts:559-567`), "vigente" y "ya cancelada" dentro de la transacción en `cancelarVenta`
   (`ventasMostrador.ts:219-222`), `aplicarDescuento` (`cobros.ts:813-815`), `quitarDescuento`
   (`:861-864`) y `registrarAbonoVenta` (`:1115-1120`). PIN para cancelar venta y pago, una sola
   vez (`ventasMostrador.ts:213`, `cobros.ts:552`). DIN-M2 respetado.
4. **Atomicidad.** `registrarVenta` y `cancelarVenta` son UNA transacción síncrona cada una
   (`ventasMostrador.ts:80-191`, `:218-258`); el folio `VTA-` y el folio `S-` se generan dentro
   (`:109`, `:126`); todas las líneas comparten un folio `S-` y `cancelarSalidaEnTx` cancela el
   grupo folio + venta (`inventario.ts:724-742`), así que AC-009 se cumple por construcción.
5. **Corte y reportes sin doble conteo.** `corte.ts:41-56` y `ligarPagosACorteEnTx`
   (`cobros.ts:408-428`) no cambian y filtran por `fuente`: los pagos de venta entran al pendiente y
   su cancelación sale como ajuste si ya estaban cortados (AC-005). Ventas y margen entran solo por
   `ventasDelRango` (`reportesResumen.ts:71-74`, `:100`, `:268-281`); cartera con clienta por
   `saldosPorCliente` (`cobros.ts:160-184`, `isNotNull(clienteId)`) y sin clienta por
   `saldoVentasSinClienta` (`ventasMostrador.ts:402-414`, `isNull(clienteId)`): conjuntos
   disjuntos. `descuentosDelRango` une descuentos de servicios y de ventas, disjuntos por el CHECK
   "exactamente uno". "Clientas atendidas", ticket promedio y `dashboard.ts` no cuentan ventas
   (A-003; `grep ventasMostrador dashboard.ts` → 0).
6. **PII.** La bitácora escribe folio, código `CL-`, conteos y montos; nunca el nombre de la clienta
   ni el de referencia (`ventasMostrador.ts:171-189`, `:251-257`; `cobros.ts:1062-1072`,
   `:1128-1150`). `nombre_referencia` solo viaja a la UI (`VentaMostradorRow`, `CarteraDrawer`); no
   entra al CSV (el CSV de finanzas exporta solo KPIs, `exportarCsv.ts:63-73`; el de clientas sale de
   `reporteClientesDetalle`, que no lo selecciona). Reinicio: `ventasMostrador` después de `pagos`,
   `descuentosServicio` y `salidasInventario` y antes de `clientes` (`reinicio.ts:20-39`); el
   borrado de `Datos/` incluye `Comprobantes/Ventas` (`folders.ts:102-103`).
7. **Un hueco real en BR-003/FR-005 (VEN-A1):** quitar o reducir el descuento de una venta de
   **público general sin nombre de referencia** la deja con saldo que nadie debe. Ni
   `aplicarDescuento` (solo comprueba `cobrado > total`, `cobros.ts:821-826`) ni `quitarDescuento`
   (sin comprobación, `:861-868`) aplican la regla "sin clienta se paga completo", y la UI ofrece
   ambas acciones a toda venta vigente (`VentaDetalleModal.tsx:152-160`, `:230-232`). Ese saldo
   fantasma entra a "cuentas por cobrar" (`reportesResumen.ts:320`) y a la cartera de Finanzas como
   "Público general (sin registro)" (`reportesFinanzas.ts:200-203`). Reversible (volver a aplicar el
   descuento o cancelar la venta), pero descuadra la cartera hasta que alguien lo note.
8. **Una venta cancelada pierde su neto (VEN-M1):** `cancelarVenta` cancela el descuento y la caché
   `descuento` vuelve a 0, así que la lista y el detalle muestran el total bruto de una venta que se
   cobró con descuento. No afecta reportes (excluyen canceladas) ni corte; afecta la lectura
   histórica del documento.
9. **Sin bomba de tiempo.** Ningún hallazgo se degrada solo con el paso de los días (§5).

## 2. Cómo funciona de verdad (referencia)

```text
total_productos = redondear( Σ_líneas redondear(cantidad × precio_unitario) )   ventasMostrador.ts:103-105
descuento       = Σ descuentos_servicio.monto WHERE venta_mostrador_id = v AND estatus = 'aplicado'
                                                                                cobros.ts:1005-1013 (caché, escritor único)
total           = totalVenta(v) = redondear(total_productos − descuento)         cobros.ts:930-932
cobrado         = Σ pagos.monto WHERE venta_mostrador_id = v AND estatus = 'cobrado'
                                                                                cobros.ts:941-954 (sin filtro de fuente, igual que cobradoPorServicio)
saldo           = estatus ≠ 'vigente' ? 0 : max(0, redondear(total − cobrado))  cobros.ts:935-938
estatus_pago    = derivarEstatusPago(total, cobrado)   solo si estatus = 'vigente'   cobros.ts:979-992
```

**Registrar (FR-001)** — `ventasMostrador.registrarVenta` (`:67-192`): comprobante/token fuera de la
transacción (`:72-76`, COB-M2); dentro: clienta existe y activa (`:83-88`); `nombre_referencia` solo
sin clienta (`:89`); productos existen y activos (`:92-98`); precio y cantidad > 0 (`:99-102`); total
(`:103-105`); cabecera con folio generado dentro (`:108-122`); un folio `S-` para todas las líneas y
`registrarSalidaEnTx` por línea con `ventaMostradorId` y `precioUnitarioVenta` (`:126-145`; stock
insuficiente lanza en `inventario.ts:503-512` y revierte todo); descuento (`:148`, `aplicarDescuentoVentaEnTx`
con `aplica_a = 'productos'`, `cobros.ts:1020-1073`); FR-005/BR-007 (`:153-157`); pagos vía
`registrarPagosEnTx` con `concepto = 'venta_mostrador'` y `cliente_id` nulo si no hay clienta
(`:158-165`); estatus (`:166`); bitácora `venta_registrada` + `cobro_sin_comprobante` (`:171-189`).
Después, en el IPC (`ipc/index.ts:417-435`): comprobante en dos fases; si falla, bitácora y aviso, la
venta NO se revierte (condición 10). El índice `i` de `datos.pagos[i]` coincide con `pagoIds[i]`
porque `registrarPagosEnTx` devuelve un id por línea en orden (`cobros.ts:309-337`).

**Cancelar (FR-009)** — `cancelarVenta` (`:212-259`): PIN fuera, todo lo demás dentro: "ya cancelada"
(`:222`), marca cancelada (`:225-228`), cancela cada pago cobrado con `cancelarPagoEnTx`
(`:230-235`; `cobros.ts:577-598` → `recalcularEstatusVentaEnTx` devuelve sin escribir porque la venta
ya no está vigente, **diseño**: conserva el estatus de pago que tenía), cancela descuentos
(`:237` → `cancelarDescuentoEnTx` → caché a 0, ver VEN-M1), cancela las salidas por grupo folio+venta
con `permitirLigadasAVenta` (`:239-249`), bitácora (`:251-257`).

**Abono / descuento / pago suelto** — `registrarAbono`, `aplicarDescuento`, `quitarDescuento`
bifurcan por `ventaMostradorId` ANTES de tocar el camino de servicios (`cobros.ts:443-444`,
`:810-831`, `:861-869`); zod exige exactamente un destino (`schemas.ts:191-205`, `:241-250`).
`cancelarPago` verifica PIN, venta vigente y BR-003 (`:552-569`) y delega en `cancelarPagoEnTx`.

**Lectores** — `ventasDelRango` (`ventasMostrador.ts:379-396`, vigentes por `fecha`) para ventas,
costo (`costoVentasMostrador`, `cobros.ts:957-974`, salidas vigentes tipo venta) y serie;
`saldosPorCliente` (+ ventas vigentes con clienta, sin contar como servicio cerrado);
`saldoVentasSinClienta` para la cartera total; `ventasConSaldo` en Finanzas (`reportesFinanzas.ts:118-140`)
para antigüedad y detalle; `reportesClientesDetalle` suma el valor histórico solo a quien ya tiene
visitas (`:82-86`, decisión §20).

**Diseño vs bug.** Diseño: estatus de pago congelado al cancelar; el salida `S-` compartida; la
venta de hoy (A-002); comprobante que no revierte la venta; `cobradoPorVenta` sin filtro de
`fuente` (la Parte B pagará con tarjeta). Bug: VEN-A1 (hueco de regla), VEN-M1 (caché a 0 en una
venta cancelada).

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `ventas_mostrador` (cabecera, folio, `nombre_referencia`, totales, estatus) | `0008` crea la tabla; escribe `ventasMostrador.ts` (cabecera) y `cobros.ts` (`estatus_pago`, `descuento`) | ✅ sin filas en la instalación real; escritores según condición 4 (grep: 0 `insert/update` fuera de los dos) |
| `pagos` recreada (`cliente_id` nullable, `venta_mostrador_id`, `servicio_realizado_id` restrict) | `0008` `INSERT … SELECT` corregido a mano | ✅ conteo, Σ y `usuario_id` intactos en la copia sintética; ⚠️ la radiografía 13a sobre la copia del respaldo real sigue pendiente (una sola referencia colgante aborta el lote) |
| `descuentos_servicio` recreada (dos FK nullables, CHECK "exactamente uno", 2.º índice parcial) | `0008` | ✅ vacía en la instalación real (0006 no publicada); CHECK y índices verificados tras el `RENAME` |
| `salidas_inventario.venta_mostrador_id` | `0008` `ALTER TABLE ADD … ON DELETE restrict` | ✅ `RESTRICT` verificado |
| Salidas tipo venta viejas (sin precio ni venta) | captura manual pre-0008 | ✅ no se tocan; siguen fuera de margen (`costoProductosVendidos` exige precio) |
| `archivos` con `entidad_tipo = 'venta_mostrador'` | `comprobantes.ts:66-121` | ✅ carpeta `<clienta>/Pagos` o `Datos/Comprobantes/Ventas`; `rutaComprobante` sigue exigiendo `Datos/` |
| Bitácora `venta_registrada`, `venta_cancelada`, `pago_registrado`, `descuento_aplicado/quitado`, `cobro_sin_comprobante` | main | ✅ sin nombres |

## 4. Caso por caso

### 4.1 Las 13 condiciones del Gate, verificadas en código

| # | Condición | Resultado literal del "Verificar" | Lectura |
|---|---|---|---|
| 1 | Numeración y cabecera | `0009` en spec del cobro: 2; un solo `0008_*`; journal idx 8; cabecera con plantilla | ✅ |
| 2 | Contenido de la 0008 | `__new_pagos` 3, `__new_descuentos_servicio` 7; `ventas_mostrador` (103) antes de `__new_pagos` (129); 3 `CREATE INDEX pagos_` después del `RENAME` (163 → 165-167); 2 `UNIQUE … WHERE`; 15 `ON DELETE restrict`; 0 `UPDATE` de datos (los 15 que cuenta el grep son `ON UPDATE no action`); **3** `ALTER TABLE` (dos `RENAME` + un `ADD`), no 2 como escribió el Gate: el único `ADD` es el de `salidas_inventario` | ✅ (el conteo del Gate estaba mal escrito, no la migración) |
| 3 | Sin CHECK de BR-002 | CHECK con `cliente_id`: 0; validación en `registrarPagosEnTx` (`cobros.ts:300-308`); `grep -c venta_mostrador shared/schemas.ts` → **0** porque zod usa `ventaMostrador…` (6 coincidencias) | ✅ intención cumplida; grep literal falla por el nombre |
| 4 | Dueño de la cabecera | 0 escritores fuera de `ventasMostrador.ts`/`cobros.ts`; 0 `set(` de `estatusPago`/`descuento` en `ventasMostrador.ts`; `cobros.ts` no importa `ventasMostrador`; `ventasMostrador.ts` en PROJECT.md (1) | ✅ |
| 5 | Destino venta en `cobros.ts` | 46 coincidencias; `totalVenta` (930) y `cancelarPagoEnTx` (577); typecheck verde | ✅ |
| 6 | Validaciones en el main | `activo` 3 en `ventasMostrador.ts`; el grep `clienteId … cancela la venta` da **0** porque el `throw` está en la línea siguiente (`cobros.ts:563-565`) | ✅ intención cumplida (ver VEN-A1 por el camino que la condición no previó) |
| 7 | Salidas | 7 `ventaMostradorId` en `inventario.ts`; `permitirLigadasAVenta` en los dos archivos; rechazo de `tipoSalida = 'venta'` en `registrarSalida` (`inventario.ts:620-622`, el grep en una sola línea da 0); `"venta"` en `SalidaForm.tsx`: 0 | ✅ |
| 8 | Reinicio | 1, en el orden correcto (`reinicio.ts:28`) | ✅ |
| 9 | IPC y tipos | `ventas:` 6 en ipc, 7 en preload; `ventaMostrador` 6 en schemas; en `types.ts` el grep da **0** por mayúscula (`VentaMostradorRow`, `DetalleVentaMostrador`, `PaginaVentasMostrador` existen); canales en §22.4 del spec | ✅ |
| 10 | Comprobante en dos fases | `venta_mostrador` 4 en `comprobantes.ts`; `cobro_sin_comprobante` en ambos; la venta no se revierte (`ipc/index.ts:425-434`) | ✅ |
| 11 | Alcance de reportes | tabla en §22.5; `reportesResumen` 3; `dashboard` 0; **`reportesFinanzas` 0 y `clientes` 0** para `ventasDelRango\|totalVenta`: Finanzas tiene su propio lector `ventasConSaldo` y Clientes pasa por `saldosPorCliente` (que a su vez consulta `ventas_mostrador` por su cuenta) | ⚠️ ver VEN-B1: cuatro lectores en vez de uno, todos vía `totalVenta`/`saldoVenta` |
| 12 | §20 completo | BR-005, A-002, A-004, BR-003 en líneas 338-343 (dentro de §20) | ✅ |
| 13 | Evidencia y candados | `git diff main -- APPLIED-MIGRATIONS.md` vacío; **no existe** `.notes/evidencia-venta-mostrador-*` todavía; esta nota es 13c | ⏳ 13a/13b pendientes del implementador (lo que exigiría: §6) |

### 4.2 Criterios de aceptación trazados en código

| AC | Traza | Lectura |
|---|---|---|
| AC-001 | total 500, pago 500 efectivo → `pagado`; stock vía `registrarSalidaEnTx`; corte por `fuente`; ventas por `ventasDelRango` | ✅ |
| AC-002 | sin clienta y 400 < 500 → `ventasMostrador.ts:155-157` lanza dentro de la transacción: ni cabecera, ni salidas, ni pagos | ✅ |
| AC-003 | con clienta 200/500 → `parcial`; `saldosPorCliente` suma 300; abono de 300 vía `registrarAbonoVenta` → `pagado` | ✅ |
| AC-004 | 15 % de 500 = 75 → total 425 (`calcularDescuento`); `descuentosDelRango` lo une por `motivo`; un descuento posterior que deje total < cobrado se rechaza (`cobros.ts:821-826`) | ✅ |
| AC-005 | cancelar con PIN: salidas de vuelta, pagos cancelados con `corte_id` → ajuste en el próximo corte (`corte.ts:47-56`); venta fuera de `ventasDelRango`; PIN incorrecto lanza antes de la transacción | ✅ (ver VEN-M1 para lo que muestra el detalle después) |
| AC-006 | token → `adjuntarComprobanteVenta` → carpeta según clienta → `ligarComprobanteEnTx` a los pagos no efectivo | ✅ |
| AC-007 | sonda sintética: conteo y Σ iguales, `foreign_key_check` vacío | ✅ en sintético; ⏳ en copia real (13a) |
| AC-008 | `SalidaForm` sin "Venta"; `registrarSalida` la rechaza; salidas viejas intactas | ✅ |
| AC-009 | una transacción, stock se verifica por línea dentro (`inventario.ts:503-512`) | ✅ |
| AC-010 | `ventasMostrador` en `TABLAS_NEGOCIO` con FK apagadas | ✅ |
| AC-011 | sin nombre → `cancelarPago` rechaza (`cobros.ts:563-565`) y la UI no ofrece el botón (`permitePagoSuelto`); con nombre → acepta, `parcial`, cartera a ese nombre (`reportesFinanzas.ts:200-203`), abono vía `registrarAbonoVenta` con `clienteId` nulo | ✅ |
| AC-012 | precio 0 rechazado en zod y en el main; 100 % cortesía → `validarDescuento` lo admite (`shared/descuentos.ts:45-54`), total 0, sin pagos, `derivarEstatusPago(0,0) = pagado`; entra a "descuentos por motivo" | ✅ |

### 4.3 Hallazgos

**VEN-A1 (Alto) — Quitar o reducir el descuento de una venta sin clienta deja un saldo que nadie debe.**
Camino: venta a público general sin nombre, 500 con descuento 100 → total 400, pagada 400. En el
detalle, "Quitar" (`VentaDetalleModal.tsx:152-160` → `cobros.quitarDescuento`, rama venta
`:861-868`, sin ninguna comprobación de saldo) o "Cambiar descuento" por uno de 50 (`aplicarDescuento`
rama venta `:810-831`, que solo rechaza `cobrado > total` en `:821`) dejan `total = 500/450`, `cobrado = 400`,
`estatus_pago = parcial`, `saldo = 100/50`. Consecuencias: (a) FR-005/BR-003 ("sin clienta se paga
completo"; "sin nombre no hay a quién cobrarle") quedan violadas por un camino que el spec no
enumeró en FR-006; (b) el saldo fantasma entra a "cuentas por cobrar" del Resumen
(`reportesResumen.ts:315-322` suma `saldoVentasSinClienta`, cuyo comentario dice "solo las que tienen
nombre de referencia" pero el código no filtra por nombre, `ventasMostrador.ts:402-414`) y a la cartera
por antigüedad y detalle de Finanzas como "Público general (sin registro)" (`reportesFinanzas.ts:118-140`,
`:198-210`); (c) la lista de Ventas lo muestra como "debe". Reversible (reaplicar el descuento o
cancelar la venta), sin pérdida de dinero: por eso Alto y no Crítico. Fix en §6.

**VEN-M1 (Medio) — Una venta cancelada muestra su total bruto.** `cancelarVenta` llama
`cancelarDescuentosVentaEnTx` (`ventasMostrador.ts:237`) → `cancelarDescuentoEnTx` →
`recalcularCacheDescuentoVentaEnTx` (`cobros.ts:734`, `:1005-1013`), que escribe `descuento = 0` en
una venta ya marcada `cancelada`. `filas()` y `detalleVenta` calculan `total = totalVenta(v)`
(`ventasMostrador.ts:309`, `:362-363`) y `descuentosVigentesVenta` ya no devuelve el descuento, así
que una venta de 500 con cortesía del 100 % aparece cancelada "por $500, cobrado $0". La bitácora
`venta_cancelada` sí guarda el total neto (`:223`, `:256`) y la fila del descuento queda con
`estatus = 'cancelado'`, así que el dato es recuperable. No toca reportes (excluyen canceladas) ni
corte. Es el mismo patrón que la caché de servicios (`recalcularCacheDescuentosEnTx`), pero ahí la
cancelación de un servicio cerrado (CIT-C1) aún no existe: conviene decidir la regla ahora para
heredarla.

**VEN-B1 (Bajo) — Condición 11 cumplida en espíritu, no en letra: cuatro lectores de
`ventas_mostrador`.** `ventasDelRango` (`ventasMostrador.ts:379-396`), `saldoVentasSinClienta`
(`:402-414`), `saldosPorCliente` (`cobros.ts:160-184`) y `ventasConSaldo` (`reportesFinanzas.ts:118-140`)
consultan la tabla por su cuenta. Todos pasan por `totalVenta`/`saldoVenta`, así que el neto es único,
pero los filtros difieren: Finanzas filtra por la caché `estatus_pago IN ('parcial','pendiente')` y
Resumen por el saldo calculado. Hoy coinciden porque `recalcularEstatusVentaEnTx` corre tras cada
mutación de dinero; si alguien olvida llamarla en una función futura, cartera de Resumen y de Finanzas
divergen en silencio.

**VEN-B2 (Bajo) — Greps del Gate que fallan literalmente aunque la condición se cumple.** Condiciones
2 (`ALTER TABLE` → 3, no 2), 3 (`venta_mostrador` en `schemas.ts` → 0), 6 (`cancela la venta` en otra
línea), 7 (`registrarSalida` en otra línea), 9 (`ventaMostrador` en `types.ts` → 0 por mayúscula) y 11
(`reportesFinanzas`, `clientes` → 0). Documentado aquí para que la nota de evidencia 13b no los
"arregle" tocando código.

**VEN-B3 (Bajo) — Mensaje de `eliminarCliente` desactualizado.** La FK `restrict` de
`ventas_mostrador.cliente_id` impide borrar una clienta con compras, pero el mensaje dice "citas,
servicios, pagos o ficha clínica" (`clientes.ts:168-171`). Comportamiento correcto; texto incompleto.

**VEN-B4 (Bajo) — Doble envío declarado en código, no en el spec.** El botón se deshabilita con
`registrar.isPending` (`VenderProductoModal.tsx:357`) y el modal se cierra al registrar aunque falle el
comprobante (`:149-156`), como pidió el Gate; §9 del spec no lo declara (riesgo "Doble envío" del Gate:
"declararlo en §9"). Entre el diálogo "¿Continuar sin comprobante?" y `mutate` el botón sigue
habilitado, pero el diálogo es modal.

**VEN-B5 (Bajo) — Detalle: importe por producto puede diferir un centavo del total guardado.**
`detalleVenta` agrupa por `producto|precio` y recalcula `importe = redondear(Σcantidad × precio)`
(`ventasMostrador.ts:350-357`); si el mismo producto al mismo precio va en dos líneas con cantidades
fraccionarias, `redondear(q1×p) + redondear(q2×p)` (lo guardado) puede diferir de
`redondear((q1+q2)×p)` (lo mostrado). Solo presentación; `total` sale de la caché.

**VEN-B6 (Bajo) — Comprobante huérfano si todos los pagos terminan en efectivo.** Si la usuaria elige
un comprobante y luego cambia todos los métodos a efectivo, el token viaja igual
(`VenderProductoModal.tsx:147`), el archivo se guarda en `archivos` con entidad `venta_mostrador` y
`conEvidencia` queda vacío (`ipc/index.ts:421`): queda un comprobante sin pago ligado. Inofensivo
(se ve en el detalle), pero es un archivo con posible PII de un tercero guardado sin necesidad.

## 5. Riesgos activos — con fecha de detonación

### 5.1 Radiografía 13a: el lote entero depende de que `pagos` real no tenga referencias colgantes
Mecanismo: `INSERT INTO __new_pagos … SELECT … FROM pagos` corre con FK activas (`dialect.js:657`:
un solo `BEGIN`; el `PRAGMA foreign_keys=OFF` de la línea 128 es no-op). Contraejemplo medido: una
fila con `usuario_id` huérfano aborta con `FOREIGN KEY constraint failed` y el `ROLLBACK` deja la
base en `0003` (datos intactos, app sin abrir hasta un release corregido). No detona solo: detona
el día del release si la radiografía no se corre. Fecha: la del tag que lleve `0004`…`0008`.

### 5.2 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| — | Ninguna: no hay hallazgo que empeore con el calendario | — |

### 5.3 Causa raíz
VEN-A1 y VEN-M1 comparten origen: las funciones de descuento de `cobros.ts` (`aplicarDescuento`,
`quitarDescuento`, `cancelarDescuentoEnTx`) se extendieron al destino venta copiando las reglas del
servicio (BR-005: "no bajar de lo cobrado") sin agregar las dos reglas que solo la venta tiene:
"sin clienta, cobrado = total" (FR-005) y "una venta cancelada no se reevalúa" (ya aplicada al
estatus, no a la caché del descuento).

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** nada que congelar en producción (la 0008 no está publicada). No generar el tag
  sin la radiografía 13a.
- **Decisión A — ¿Qué pasa con el descuento de una venta sin clienta (VEN-A1)?** Opciones:
  (a) *Recomendada:* en las ramas venta de `aplicarDescuento` y `quitarDescuento`, si
  `v.clienteId` es nulo exigir `|cobrado − total| ≤ TOLERANCIA` después de recalcular; mensaje:
  "Sin clienta, la venta queda pagada: para cambiar el precio cancela la venta y regístrala de
  nuevo". Es FR-005 aplicada al cambio posterior; con nombre de referencia se trata igual porque §20
  solo abrió la deuda por "pago cancelado". (b) Permitirlo solo con nombre de referencia (la deuda
  queda a ese nombre, como en BR-003). (c) Permitirlo siempre y aceptar el saldo fantasma. Lo que
  desbloquea: cartera sin filas "Público general" que nadie debe. En cualquier opción, alinear el
  comentario de `saldoVentasSinClienta` con el código o filtrar por `nombre_referencia IS NOT NULL`.
- **Decisión B — ¿Qué muestra una venta cancelada (VEN-M1)?** (a) *Recomendada:* no recalcular la
  caché cuando la venta no está vigente (`recalcularCacheDescuentoVentaEnTx` sale si
  `estatus ≠ 'vigente'`), o cancelar la venta sin cancelar sus descuentos (ya no cuentan en
  reportes por `estatus = 'vigente'`); el detalle mostraría el neto real. (b) Dejarlo así y que el
  detalle muestre los descuentos cancelados en gris. Heredar la decisión a CIT-C1.
- **Cambio propuesto (VEN-A1 + VEN-M1, un solo PR de `cobros.ts`):**
  1. `aplicarDescuento` rama venta: tras `recalcularEstatusVentaEnTx`, si `!v.clienteId` y
     `Math.abs(cobrado − total) > TOLERANCIA` → lanzar (la transacción revierte el descuento nuevo
     y restaura el previo, como ya pasa con BR-005).
  2. `quitarDescuento` rama venta: misma comprobación antes de `return`.
  3. UI: ocultar "Quitar" y "Cambiar descuento" cuando `!venta.clienteId` (el main decide igual).
  4. `recalcularCacheDescuentoVentaEnTx`: no escribir si la venta no está vigente (o
     `cancelarVenta` deja los descuentos). Bitácora sin cambio.
  5. Probar: AC-004 extendido (venta sin clienta con descuento → quitar → rechazado), AC-005
     extendido (detalle de la venta cancelada muestra total neto).
- **Cambios menores (VEN-B1…B6):** B1 — hacer que `ventasConSaldo` y `saldoVentasSinClienta`
  compartan un lector (`ventasConSaldo(db, { conClienta })` en `ventasMostrador.ts`) y filtren por
  saldo calculado; B3 — texto de `eliminarCliente`; B4 — una línea en §9 del spec; B6 — descartar
  el token en el renderer cuando `!hayPagoSinEfectivo`, o en el IPC no adjuntar si `conEvidencia`
  está vacío.

**Pendiente de verificación manual** (solo lectura, sobre una COPIA del respaldo real fuera del repo;
en la nota solo conteos):

```sql
-- 13a, ANTES de migrar la copia: debe estar vacío; una sola fila aquí aborta el lote 0004-0008.
PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
-- Esperado: 0 filas.

-- Cifras de referencia (repetir DESPUÉS de migrar; deben ser idénticas)
SELECT estatus, COUNT(*), ROUND(SUM(monto), 2) FROM pagos GROUP BY 1;
SELECT COUNT(*) FROM pagos WHERE usuario_id IS NOT NULL;
SELECT COUNT(*) FROM pagos WHERE comprobante_archivo_id IS NOT NULL;
-- (corte_id y concepto solo existen después de la 0005: en la 0003 no se consultan.)

-- DESPUÉS de migrar la copia con la app (o con el lote en un BEGIN):
PRAGMA integrity_check;                      -- Esperado: ok
PRAGMA foreign_key_check;                    -- Esperado: 0 filas
SELECT COUNT(*) FROM ventas_mostrador;       -- Esperado: 0
SELECT COUNT(*) FROM pagos WHERE venta_mostrador_id IS NOT NULL;  -- Esperado: 0
SELECT "from", on_delete FROM pragma_foreign_key_list('pagos')
 WHERE "from" IN ('cliente_id','servicio_realizado_id','venta_mostrador_id');
-- Esperado: 3 filas, todas RESTRICT
SELECT "notnull" FROM pragma_table_info('pagos') WHERE name = 'cliente_id';  -- Esperado: 0
SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pagos' AND name LIKE 'pagos_%';
-- Esperado: 3
SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND tbl_name = 'descuentos_servicio' AND name LIKE 'descuentos_%';
-- Esperado: 3
SELECT COUNT(*) FROM __drizzle_migrations;   -- Esperado: 9 (0000…0008)
```

Evidencia 13b que exigiría en `.notes/evidencia-venta-mostrador-<fecha>.md`: AC-001…AC-012 sobre una
BD de prueba con `0004`…`0008`, cada uno con el conteo/monto observado; además los dos casos de
VEN-A1 (quitar y cambiar descuento en una venta sin clienta) y el detalle de una venta cancelada con
descuento (VEN-M1), para que el cierre de ambos quede medido y no narrado.

## 7. Qué sigue

1. Carlos decide A y B (§6) → engineering prepara el PR de `cobros.ts` + UI (VEN-A1, VEN-M1) y los
   menores que acepte; `npm run typecheck` y `npm run build` verdes.
2. Implementador escribe la nota de evidencia 13b con AC-001…AC-012 y los casos de VEN-A1/M1.
3. Antes del tag: radiografía 13a sobre la copia del respaldo real (consultas de §6); si
   `foreign_key_check` no está vacío, se corrige la fila en una migración propia o se documenta, no
   se publica.
4. Después de que la instalación real abra con el release: filas `0004`…`0008` en
   `APPLIED-MIGRATIONS.md` con la verificación de `__drizzle_migrations`.
5. CIT-C1 hereda la decisión B (caché de descuentos de un documento cancelado).
