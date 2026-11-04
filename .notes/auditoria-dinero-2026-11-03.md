# Auditoría — Dinero (pagos, cierre de cita, corte, reportes financieros) — 2026-11-03 (DIN-*)

**Scope:** Código del proceso main y renderer que crea, cancela o agrega dinero:
`electron/services/pagos.ts`, `serviciosRealizados.ts`, `corte.ts`, `reportesFinanzas.ts`,
`reportesResumen.ts` (partes de dinero), `dashboard.ts`, `citas.ts` (saldo por cita y resumen por
clienta), `clientes.ts` (saldo por clienta), `reinicio.ts` (borrado), `electron/ipc/index.ts`,
`electron/preload.ts`, `shared/schemas.ts`, `shared/fechas.ts`, `shared/config.ts`,
`src/pages/agenda/CierreCitaModal.tsx`, `src/pages/agenda/CitaDetalleModal.tsx`,
`src/pages/agenda/Lista.tsx`, `src/pages/Corte.tsx`, `src/pages/Dashboard.tsx`,
`src/components/ui/money-input.tsx`, esquema `electron/db/schema.ts` y migraciones
`drizzle/0000_lively_nuke.sql`, `0001_flashy_midnight.sql`. **No auditado:** inventario salvo la
valuación de salidas tipo `venta`, respaldos/restauración, licencias, exportación CSV, PII.
**Pregunta de la dueña que se responde:** "Que se pueda anotar dos tipos de pago" (un servicio
cobrado parte en efectivo y parte con tarjeta).
**Method:** Inspección de código en el commit `4cbeaae` (main, working tree con PROJECT.md y
scaffold de Atlas sin commitear). Solo lectura: grep y lectura de archivos. No se abrió ninguna
base de datos real ni respaldo; no se ejecutó la app.
**PII declaration:** Sin PII. No se consultó ninguna BD; el informe solo cita `archivo:línea`,
reglas y cifras hipotéticas. No aparecen códigos de clienta porque no hubo casos reales.
**State as of:** 2026-11-03 12:29 CST, commit `4cbeaae` (v0.1.4 + "Update build-windows.yml").

---

## 1. Resumen ejecutivo

1. **El modelo de datos SÍ admite varios pagos por servicio, la interfaz NO los captura.**
   `pagos.servicio_realizado_id` es una FK sin índice único (`electron/db/schema.ts:281-299`,
   `drizzle/0000_lively_nuke.sql:150-165`): N filas por servicio son válidas. Pero el cierre
   de cita manda **un** `metodoPago` y **un** `monto` escalares
   (`shared/schemas.ts:148-149`, `src/pages/agenda/CierreCitaModal.tsx:68-69,218-230`),
   `cerrarCita` inserta **como máximo un** pago (`electron/services/serviciosRealizados.ts:241-251`),
   un servicio no se puede cerrar dos veces (`serviciosRealizados.ts:146`) y no existe ningún
   handler IPC ni función del preload para registrar un pago/abono posterior (`electron/ipc/index.ts`
   no tiene `pagos:*`; `electron/preload.ts` no expone `pagos`). **La creencia de la dueña de que
   ya se podía es incorrecta**: hoy un cobro mixto se registra bajo un solo método (el corte
   queda mal desglosado) o se registra solo la parte de un método (saldo falso). → DIN-A1.
2. **Las agregaciones ya están preparadas para pagos múltiples y no duplicarían.** Corte
   (`corte.ts:13-19,31-42`), finanzas por método (`reportesFinanzas.ts:47-64`), saldo por servicio
   (`serviciosRealizados.ts:333-341`), por cita (`citas.ts:70-83`) y por clienta
   (`clientes.ts:26-45`, `citas.ts:265-275`) suman todas las filas `cobrado` de un servicio; el
   desglose por método es un `Map` por `metodoPago`. Extender la captura a N métodos no exige
   tocar ningún agregador.
3. **El cierre de cita es transaccional y correcto.** Salidas de inventario, pago, actualización
   del servicio y bitácora van en una sola `db.transaction` sin `await` dentro
   (`serviciosRealizados.ts:202-289`). Los pagos `cancelado` quedan excluidos en los ocho puntos
   de agregación (todos filtran `eq(pagos.estatus, "cobrado")`). Las fechas de "hoy" usan hora
   local, no UTC (`shared/fechas.ts:15-17`, `corte.ts:9-11,60`). No existe ninguna ruta que
   borre pagos, cortes o servicios fuera del reinicio total (`reinicio.ts:14-33,55-59`), y la FK
   `pagos.cliente_id` es `restrict` (`schema.ts:283-285`; `clientes.ts:157-161`).
4. **`estatusPago` es una etiqueta manual, no derivada de los pagos, y dos consumidores la usan
   como verdad mientras cuatro usan la aritmética.** "Cuentas por cobrar" y la cartera por
   antigüedad filtran por etiqueta (`reportesFinanzas.ts:80,138`); la lista de citas, el detalle y
   el saldo por clienta restan pagos (`citas.ts:23-26`, `serviciosRealizados.ts:341`,
   `clientes.ts:31-45`). Un cierre marcado "pagado" con monto menor al precio aparece con saldo en
   Citas/Clientas y **no** aparece en Cuentas por cobrar. → DIN-A2.
5. **El margen bruto de todos los reportes financieros es falso: el costo de insumos es siempre 0.**
   `agregadosDelRango` y `serieResumen` leen el costo de `servicios_productos_consumidos`
   (`reportesResumen.ts:66-80,222-238`; también `reportesServiciosDetalle.ts:50-56`), pero
   **nadie escribe en esa tabla**: `cerrarCita` registra los consumos solo en `salidas_inventario`
   (`serviciosRealizados.ts:208-223` → `inventario.ts:515-531`). Resultado: "Margen bruto
   estimado" = Ventas y "Margen %" = 100 % desde la primera versión. → DIN-A3.
6. **No hay forma de cancelar ni corregir un pago o un corte.** El estatus `cancelado` existe en
   el esquema (`schema.ts:293`) pero ningún código lo escribe (`pagos.ts:32` siempre recibe
   `"cobrado"` desde `serviciosRealizados.ts:248`). Un monto o método equivocado es permanente;
   la única "corrección" disponible es el borrado masivo de `reinicio.ts`. → DIN-A4.
7. **La venta adicional de productos no genera ningún ingreso registrado.** Las salidas tipo
   `venta` se valúan al **costo** del lote (`inventario.ts:524-525`); `productos.precio_venta` no
   se usa en ninguna parte del main fuera del catálogo; el precio del servicio no suma los
   productos (`CierreCitaModal.tsx:78,202-209`). Si la usuaria no suma a mano el producto al
   "Precio del servicio", ese dinero entra a caja sin registro y el corte no cuadra. → DIN-A5.
8. **Bomba de tiempo (§5):** cada cierre con cobro mixto (DIN-A1) y cada venta de producto
   (DIN-A5) descuadran el corte un poco más; cada cierre con insumos agrava la falsedad del
   margen (DIN-A3). Ninguno se corrige solo ni es corregible después (DIN-A4).

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Entidades de dinero

| Tabla | Columnas de dinero | Notas |
|---|---|---|
| `servicios_realizados` | `precio REAL`, `estatus_pago TEXT` (pagado/parcial/pendiente/cancelado), `estatus TEXT` (abierto/cerrado) | `schema.ts:235-257`. `estatus_pago` lo elige la usuaria con botones (`CierreCitaModal.tsx:235-245`) y se guarda tal cual (`serviciosRealizados.ts:256`). |
| `pagos` | `monto REAL`, `metodo_pago TEXT`, `estatus TEXT` (cobrado/cancelado), `fecha TEXT`, `servicio_realizado_id` nullable FK `set null`, `cliente_id` FK `restrict`, `referencia`, `comprobante_archivo_id` | `schema.ts:281-299`. **Sin UNIQUE en `servicio_realizado_id`** → 1:N por diseño. `referencia` y `comprobante_archivo_id` nunca se escriben. |
| `cortes` | `total REAL`, `desglose_por_metodo_json TEXT`, `fecha`, `hora` | `schema.ts:394-402`, `drizzle/0001_flashy_midnight.sql`. Snapshot congelado; no liga qué pagos incluyó. |
| `salidas_inventario` tipo `venta` | `costo_unitario`, `valor = cantidad × costo del lote` | `inventario.ts:524-525`. No es ingreso; es costo. |

### 2.2 Flujo de cobro (único punto de creación de pagos)

```
abrirCierre(citaId)                              serviciosRealizados.ts:85-135
  → fila servicios_realizados estatus=abierto, estatus_pago=pendiente, precio=precioSugerido
cerrarCita(input)                                serviciosRealizados.ts:137-297
  precondiciones (fuera de tx): estatus != cerrado (146); comprobante o PIN (148-157);
                                stock (174-183); config async (199)
  tx {                                           207-289
    salidas consumo_servicio + venta             208-239
    if monto > 0 && metodoPago → 1 pago cobrado  241-251   ← UN solo pago
    update servicio: precio, estatusPago(manual), estatus=cerrado   253-264
    cita.estado = asistio                        266-271
    bitácora                                     273-288
  }
```

Reglas de la UI que alimentan ese input (`CierreCitaModal.tsx`):

```
precioEfectivo   = precio ?? servicio.precio ?? 0            :78
montoPorDefecto  = estatusPago === "pagado" ? precioEfectivo : 0   :83   (diseño correcto; corrige bug previo)
montoEfectivo    = monto ?? montoPorDefecto                  :84
requiereMetodo   = montoEfectivo > 0                         :163
listoParaCerrar  = comprobanteResuelto && (!requiereMetodo || metodoPago)   :165
```

Validación del main (`shared/schemas.ts:142-157`): `monto ≥ 0`, `metodoPago` obligatorio si
`monto > 0`. **No valida** `monto ≤ precio`, ni coherencia entre `estatusPago` y `monto`
(acepta `pagado` con `monto = 0`, `pendiente` con `monto = precio`, `cancelado` con `monto > 0`).

### 2.3 Fórmulas de agregación

```
saldo_servicio   = max(0, precio − Σ pagos.cobrado del servicio)        serviciosRealizados.ts:339-341 (0 si estatus_pago=cancelado)
saldo_cita       = idem, 0 si estatus_pago=cancelado                    citas.ts:21-26
saldo_clienta    = Σ precio (cerrado, estatus_pago ∈ {pagado,parcial,pendiente}) − Σ pagos.cobrado   clientes.ts:26-45
cartera (KPI)    = Σ (precio − Σ pagos) SOLO de servicios con estatus_pago ∈ {parcial,pendiente}, saldo > 0.005   reportesFinanzas.ts:72-114
ventas           = Σ precio (cerrado, estatus_pago ≠ cancelado, fecha ∈ rango)   reportesResumen.ts:44-60
cobranza         = Σ pagos.cobrado con pagos.fecha ∈ rango              reportesResumen.ts:99-105
costo_insumos    = Σ servicios_productos_consumidos.cantidad × lote.costo   reportesResumen.ts:66-80   ← tabla vacía
margen_bruto     = ventas − costo_insumos − merma                       reportesResumen.ts:118-119
corte pendiente  = Σ pagos.cobrado con createdAt > último corte.createdAt   corte.ts:31-42
cobrado_hoy      = Σ pagos.cobrado con pagos.fecha = hoy                dashboard.ts:13-17
semana/mes (Corte) = Σ cortes.total con cortes.fecha ≥ inicio           corte.ts:97-104
```

### 2.4 Tres bases de tiempo distintas (diseño, con consecuencias)

- `pagos.fecha` = **fecha de la cita**, no del cobro (`serviciosRealizados.ts:159-161,245`;
  comentario explícito de diseño).
- Corte = por `pagos.createdAt` (momento real de la inserción) (`corte.ts:36`).
- "Esta semana / Este mes" en Corte = por `cortes.fecha` (fecha en que se hizo el corte).

Un cierre tardío de una cita de la semana pasada: no aparece en "Cobrado hoy", cae en el periodo
pasado en Finanzas, y sí entra al corte de hoy. Es diseño (documentado para la próxima cita
sugerida), pero no está documentado para dinero.

### 2.5 Diseño vs bug

| Comportamiento | Clasificación |
|---|---|
| 1 pago por cierre, sin abonos posteriores | **Diseño incompleto** (gap funcional) → DIN-A1 |
| `estatusPago` manual, no derivado | **Diseño** (comentario en `clientes.ts:16-21` lo admite) con **bug** en `reportesFinanzas.ts:80,138` que lo usa como verdad → DIN-A2 |
| Costo de insumos = 0 en reportes | **Bug** (tabla huérfana) → DIN-A3 |
| Sin cancelación de pagos | **Diseño incompleto** → DIN-A4 |
| Venta de productos sin ingreso | **Diseño incompleto / bug de concepto** → DIN-A5 |
| `pagos.fecha` = fecha de cita | **Diseño** no documentado para dinero → DIN-M1 |

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `pagos` | Solo `cerrarCita` → `registrarPago` (`pagos.ts:22-37`), estatus siempre `cobrado` | ✅ un único escritor, transaccional |
| `pagos.estatus = cancelado` | Ningún escritor | 🔴 estado muerto; sin reversa |
| `servicios_realizados.precio / estatus_pago` | Captura manual en el cierre | ⚠️ etiqueta no verificada contra pagos |
| `cortes` | `registrarCorte` (`corte.ts:52-83`) desde `resumenPendiente` | ⚠️ congelado pero no reproducible; sin tx; sin guardia de corte vacío |
| `servicios_productos_consumidos` | Ningún escritor | 🔴 vacía; alimenta margen bruto |
| `salidas_inventario` tipo `venta` | `cerrarCita` → `registrarSalidaEnTx` | ⚠️ valuada a costo, sin precio de venta |
| `config.metodosPago` | `shared/config.ts:12` default Efectivo/Tarjeta/Transferencia; editable en General | ✅ texto libre: si se renombra un método, el histórico conserva el nombre viejo (aceptable) |
| Fecha "hoy" | `fechaLocalIso` (`shared/fechas.ts:15`) | ✅ hora local |

## 4. Caso por caso

No se tocó ninguna base real: no hay sujetos. Se usan escenarios hipotéticos con cifras de
ejemplo, numerados #1–#6 para poder referirlos.

| # | Escenario | Lo que guarda el sistema | Lo que debería | Lectura |
|---|---|---|---|---|
| #1 | Servicio $1,000: $600 efectivo + $400 tarjeta | 1 pago de $1,000 bajo un método (o $600 y "parcial") | 2 pagos: 600/Efectivo, 400/Tarjeta | **No capturable.** Corte desglosa mal por método; o deja saldo falso de $400 → DIN-A1 |
| #2 | Servicio $1,000, usuaria marca "pagado", monto $800 | pago $800, estatus_pago=pagado | parcial | Citas/Clientas muestran saldo $200; "Cuentas por cobrar" NO lo incluye (`reportesFinanzas.ts:80`) → DIN-A2 |
| #3 | Servicio con 3 insumos, precio $1,000, costo real $150 | margen bruto $1,000 (100 %) | $850 (85 %) | Tabla `servicios_productos_consumidos` vacía → DIN-A3 |
| #4 | Monto capturado por error ($10,000 en vez de $1,000) | pago cobrado $10,000, permanente | pago cancelado + pago correcto | Sin reversa; el corte lo arrastra → DIN-A4 |
| #5 | Servicio $1,000 + crema $350 vendida | pago $1,000; salida venta valor = costo | ingreso $1,350 | $350 en caja sin registro salvo que se sume a mano al precio → DIN-A5 |
| #6 | Cita del lunes cerrada el viernes | pago.fecha = lunes; createdAt = viernes | — | "Cobrado hoy" (viernes) no lo muestra; corte sí; Finanzas lo pone el lunes → DIN-M1 |

Hallazgos sueltos:

- `estatusPago = "cancelado"` con `monto > 0` pasa la validación (`shared/schemas.ts:148-156`) y
  crea un pago `cobrado` ligado a un servicio cancelado: entra a cobranza y corte, no a ventas
  (`reportesResumen.ts:53`). → DIN-B3.
- `CitaDetalleModal.tsx:81` pinta el saldo en rojo con `> 0` sin épsilon; `Lista.tsx:28,300` y
  `reportesFinanzas.ts:16,100` sí usan 0.005. Un residuo flotante (p. ej. 1e-13) mostraría
  "$0.00" en rojo. → DIN-M3.
- `registrarCorte` no está en transacción ni rechaza cortes con 0 pagos; la UI oculta el botón
  (`Corte.tsx:54,90`) pero el IPC `corte:registrar` lo acepta (`ipc/index.ts:285`). → DIN-M4.

## 5. Riesgos activos — con fechas de detonación

### 5.1 Corte descuadrado por cobros mixtos y ventas de producto (DIN-A1, DIN-A5)
Mecanismo: `cerrarCita` inserta a lo sumo un pago con un método (`serviciosRealizados.ts:241-251`);
las ventas de producto no generan ingreso (`inventario.ts:524-525`). Cada vez que ocurre un cobro
mixto o una venta, el desglose por método del corte (`corte.ts:13-19`) difiere del dinero físico.
Recurrente: cada cierre afectado. **Ya detonado** desde el primer cierre con esa situación; no
hay fecha futura, hay acumulación.

### 5.2 Reportes financieros con margen ficticio (DIN-A3)
Mecanismo: `reportesResumen.ts:66-80` lee una tabla que nadie llena. Detonado desde la migración
`0000` (`drizzle/meta/_journal.json`, `when` 1783628622412 → 2026-07-09). Cualquier decisión
tomada sobre "Margen bruto" o "Margen %" desde entonces se basó en 100 %.

### 5.3 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| 1 | Capacidad de corregir un pago erróneo sin borrar todo (DIN-A4) | Permanente; cada error queda fijo en el histórico y en el corte que lo incluyó |
| 2 | Coherencia entre "Cuentas por cobrar" y los saldos visibles en Citas/Clientas (DIN-A2) | Cada cierre cuya etiqueta no coincida con los pagos |
| 3 | Soporte fiscal (CFF art. 30, 5 años) si la usuaria recurre a `reinicio.ts` para "corregir" | En el momento en que lo use; el respaldo previo mitiga pero no es contabilidad |

### 5.4 Causa raíz
El dinero se modeló como **un atributo del cierre de cita** (un método, un monto, una etiqueta
manual) en vez de como **un libro de movimientos** (N pagos por servicio, estatus derivado, con
reversa). El esquema ya es un libro (tabla `pagos` 1:N con `estatus`); el código de captura y dos
reportes siguen tratando el cierre como el único evento de dinero.

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA (sin código):** instruir a la usuaria que, mientras no exista el cobro mixto,
  (a) registre el método **por el que entró la mayor parte** y anote el desglose en
  Observaciones, y (b) sume a mano el precio de los productos vendidos al "Precio del servicio".
  Y que **no** use "Borrar datos de negocio" para corregir un pago. Esto detiene el crecimiento del
  descuadre pero no lo corrige.

- **Decisión A — ¿`estatusPago` sigue siendo manual o pasa a derivado?** Derivado
  (`pagado` si Σ pagos ≥ precio − 0.005; `parcial` si 0 < Σ < precio; `pendiente` si Σ = 0;
  `cancelado` solo manual) elimina DIN-A2 y DIN-B3 de raíz y simplifica el modal (desaparecen
  los cuatro botones). Manual exige, como mínimo, validar coherencia en `shared/schemas.ts`.
  Recomendación: derivado, con `cancelado` como único valor manual.

- **Decisión B — ¿Qué registros cuentan para CFF art. 30?** Pendiente con el contador
  (ya en PROJECT.md). Determina si `reinicio.ts` debe excluir `pagos`/`cortes`/`servicios_realizados`
  o solo exigir respaldo (hoy lo exige: `reinicio.ts:52`).

- **Decisión C — ¿La venta de productos se cobra aparte o dentro del precio del servicio?**
  Determina DIN-A5: si "aparte", el cierre debe calcular `Σ cantidad × precio_venta` y sumarlo al
  total a cobrar; si "dentro", basta precargar el precio del servicio con esa suma y documentarlo.

- **Cambio propuesto (DIN-A1) — cobro con varios métodos, diseño mínimo correcto (sin
  implementar):**
  1. `shared/schemas.ts`: sustituir `metodoPago`/`monto` escalares por
     `pagos: z.array(z.object({ metodoPago: z.string().min(1), monto: z.number().positive() })).default([])`;
     validar `Σ monto ≤ precio + 0.005` y métodos no repetidos. Sin migración: el esquema ya es 1:N.
  2. `src/pages/agenda/CierreCitaModal.tsx`: reemplazar el par Select+MoneyInput por una lista de
     filas (método, monto) con "Agregar método", mostrando `Σ pagos` y `Restante = precio − Σ`.
     Primera fila precargada con `precio` completo (conserva el flujo de un solo método en dos
     clics). Con Decisión A derivada, los botones de estatus desaparecen salvo "Cancelar cobro".
  3. `electron/services/serviciosRealizados.ts:241-251`: `for (const p of input.pagos)
     registrarPago(tx, {...})` dentro de la **misma** transacción (`registrarPago` ya acepta `tx`,
     `pagos.ts:22`); `estatusPago` calculado en el main con la regla de la Decisión A, nunca
     tomado del renderer.
  4. Redondear `monto` y `precio` a 2 decimales en el main antes de insertar (`Math.round(x*100)/100`)
     y en `registrarCorte` antes de guardar `total`/desglose (ataja DIN-M3 sin migrar a centavos
     enteros).
  5. **Nada que cambiar** en `corte.ts`, `reportesFinanzas.ts`, `reportesResumen.ts`,
     `dashboard.ts`, `citas.ts`, `clientes.ts`, `obtenerDetalle`: ya suman N filas por servicio y
     agrupan por método. `CitaDetalleModal.tsx:91-103` y `Lista.tsx:305-311` ya listan N pagos.
  6. Verificación: cerrar una cita de prueba con 600/Efectivo + 400/Tarjeta en BD de prueba
     (`npm run dev`); esperar 2 filas en `pagos`, saldo 0, estatus `pagado`, corte con dos líneas
     que suman 1,000 y "Cobrado hoy" = 1,000.

- **Cambio propuesto (DIN-A4) — abonos y cancelación:** nuevo IPC `pagos:registrar`
  (servicio con saldo > 0; mismo array de la propuesta anterior; `fecha` = hoy, no la de la cita)
  y `pagos:cancelar` (`estatus = cancelado`, columna nueva `motivo`, bitácora
  `pago_cancelado`; si el pago ya estaba en un corte, el siguiente corte muestra una línea
  negativa de ajuste en vez de reescribir el corte histórico). Requiere migración `0004` solo si
  se agrega `motivo`/`cancelado_at`.

- **Cambio propuesto (DIN-A3) — costo de insumos:** o bien `cerrarCita` inserta en
  `servicios_productos_consumidos` por cada lote tocado (`registrarSalidaEnTx` ya devuelve los
  `salidasCreadas` con lote y cantidad), o bien los reportes leen `salidas_inventario` con
  `tipo_salida = 'consumo_servicio'` (ya tiene `costo_unitario` y `valor`) y la tabla huérfana se
  retira. La segunda opción no requiere backfill y corrige el histórico de golpe.

- **Cambio propuesto (DIN-M2) — doble envío:** mover la verificación `estatus === "cerrado"` dentro
  de la transacción, o convertir el `update` de `serviciosRealizados.ts:253-264` en condicional
  (`where estatus = 'abierto'`) y lanzar si `changes === 0`.

- **Cambio propuesto (DIN-M4) — corte reproducible:** guardar en `cortes` el rango
  `desde_created_at`/`hasta_created_at` (o `corte_id` en `pagos`), envolver `resumenPendiente` +
  insert en una transacción, y rechazar `cantidadPagos === 0` en el main.

**Verificación manual pendiente** (solo lectura, sobre un respaldo abierto fuera del repo; reportar
solo conteos):

```sql
-- DIN-A1: ¿existe hoy algún servicio con más de un pago? (confirma que la UI nunca lo produjo)
SELECT COUNT(*) FROM (SELECT servicio_realizado_id FROM pagos WHERE servicio_realizado_id IS NOT NULL GROUP BY servicio_realizado_id HAVING COUNT(*) > 1);
-- Esperado: 0

-- DIN-A2: servicios etiquetados "pagado" cuyos pagos no cubren el precio (invisibles en Cuentas por cobrar)
SELECT COUNT(*) FROM servicios_realizados s WHERE s.estatus = 'cerrado' AND s.estatus_pago = 'pagado'
  AND COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.servicio_realizado_id = s.id AND p.estatus = 'cobrado'), 0) < s.precio - 0.005;
-- Esperado: 0. Cada fila > 0 es un saldo real que el reporte de finanzas no muestra.

-- DIN-A3: la tabla que alimenta el margen bruto
SELECT COUNT(*) FROM servicios_productos_consumidos;
-- Esperado: 0 (confirma que todo margen reportado ha sido 100 %)

-- DIN-A4: nunca se ha cancelado un pago
SELECT COUNT(*) FROM pagos WHERE estatus = 'cancelado';
-- Esperado: 0

-- DIN-A5: magnitud de ventas de producto sin ingreso registrado
SELECT COUNT(*), SUM(cantidad) FROM salidas_inventario WHERE tipo_salida = 'venta';
-- Esperado: cualquier valor > 0 cuantifica el dinero potencialmente sin registro

-- DIN-M3: residuos de punto flotante persistidos en cortes
SELECT COUNT(*) FROM cortes WHERE ROUND(total, 2) != total;
SELECT COUNT(*) FROM pagos WHERE ROUND(monto, 2) != monto;
-- Esperado: 0 en ambos (si > 0, el redondeo en escritura es necesario)

-- DIN-M4: pagos que ningún corte cubrirá (createdAt == createdAt del corte en el mismo segundo)
SELECT COUNT(*) FROM pagos p JOIN cortes c ON p.created_at = c.created_at;
-- Esperado: 0
```

## 7. Qué sigue

1. **Carlos confirma Decisión A** (estatus derivado) y **Decisión C** (venta de producto) → es lo
   que fija el alcance del cambio DIN-A1 + DIN-A5.
2. **Engineering prepara** el cambio DIN-A1 (schema → modal → `cerrarCita`) con la verificación
   manual del punto 6 y `npm run typecheck && npm run build`. Superficie crítica: pasa por
   auditoría antes de integrar (PROJECT.md `critical_surfaces`).
3. **En el mismo release** DIN-A3 (opción "leer de `salidas_inventario`", sin migración) — el
   margen falso es el hallazgo más barato de cerrar y afecta a todos los reportes.
4. **Siguiente release:** DIN-A4 (abonos + cancelación con bitácora) y DIN-M2/M4; **Carlos
   confirma con el contador** la Decisión B antes de tocar `reinicio.ts`.
5. **Backlog aceptado:** DIN-M1 (documentar las tres bases de tiempo o agregar `fecha_cobro`),
   DIN-M3 (redondeo en escritura; migrar a centavos enteros solo si la verificación manual
   muestra residuos), DIN-B1/B2/B3.
6. Carlos corre las consultas de verificación sobre un respaldo y anexa solo los conteos a este
   informe (o al plan) para fijar la magnitud real de A2/A3/A5.

---

## Anexo — Tabla de hallazgos

| Código | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| DIN-A1 | 🟠 Alta | Un servicio no puede registrar dos métodos de pago: captura escalar, un solo insert, sin flujo de abono posterior | `shared/schemas.ts:148-149`; `CierreCitaModal.tsx:68-69,218-230`; `serviciosRealizados.ts:146,241-251`; `ipc/index.ts` y `preload.ts` sin `pagos:*` |
| DIN-A2 | 🟠 Alta | `estatusPago` manual usado como verdad en Cuentas por cobrar/cartera; contradice los saldos aritméticos de Citas, Detalle y Clientas | `reportesFinanzas.ts:80,138` vs `citas.ts:23-26`, `serviciosRealizados.ts:341`, `clientes.ts:31-45`; `schemas.ts:148-156` no valida coherencia |
| DIN-A3 | 🟠 Alta | Costo de insumos siempre 0 → margen bruto = ventas, margen % = 100 % en todos los reportes | `reportesResumen.ts:66-80,222-238`; `reportesServiciosDetalle.ts:50-56`; ningún `insert(serviciosProductosConsumidos)` en `electron/` |
| DIN-A4 | 🟠 Alta | Sin cancelación/reversa de pagos ni cortes; `estatus=cancelado` nunca se escribe; única corrección = borrado masivo | `pagos.ts:32`; `serviciosRealizados.ts:248`; `reinicio.ts:14-33,55-59` |
| DIN-A5 | 🟠 Alta | Venta adicional de productos sin ingreso: salida valuada a costo, `precio_venta` no se usa, no se suma al precio | `inventario.ts:524-525`; `CierreCitaModal.tsx:78,202-209`; grep `precioVenta` en `electron/services` solo en catálogo |
| DIN-M1 | 🟡 Media | Tres bases de tiempo: `pagos.fecha` = fecha de cita, corte por `createdAt`, semana/mes por `cortes.fecha`; "Cobrado hoy" omite cierres tardíos | `serviciosRealizados.ts:159-161,245`; `corte.ts:36,60,99`; `dashboard.ts:16` |
| DIN-M2 | 🟡 Media | Verificación "ya cerrada" fuera de la transacción con `await` intermedios: dos invocaciones concurrentes podrían cobrar y descontar dos veces (UI lo mitiga con `isPending`) | `serviciosRealizados.ts:146,148,154,199,207`; `CierreCitaModal.tsx:304` |
| DIN-M3 | 🟡 Media | Dinero en `REAL` sumado en JS sin redondeo; `cortes.total` guarda residuos; comparación `> 0` sin épsilon en el detalle | `schema.ts:248,290,399`; `corte.ts:16,42`; `money-input.tsx:77`; `CitaDetalleModal.tsx:81` |
| DIN-M4 | 🟡 Media | Corte congelado pero no reproducible (sin liga pago↔corte), sin transacción, acepta corte vacío por IPC, selección por `createdAt` estricto con granularidad de segundo | `corte.ts:21-24,31-42,52-66`; `ipc/index.ts:285` |
| DIN-B1 | ⚪ Baja | `reinicio.ts` borra `pagos`/`cortes`/`servicios_realizados` con FK apagadas (PIN + respaldo previo). Decisión del dueño frente a CFF art. 30 | `reinicio.ts:14-33,49-59`; `db/index.ts:76-86` |
| DIN-B2 | ⚪ Baja | `pagos.referencia` y `pagos.comprobante_archivo_id` nunca se escriben; el comprobante se liga al servicio, no al pago | `schema.ts:292,295-297`; `pagos.ts:24-35`; `ipc/index.ts:260-277` |
| DIN-B3 | ⚪ Baja | `estatusPago=cancelado` con `monto>0` crea un pago cobrado de un servicio excluido de ventas | `schemas.ts:148-156`; `serviciosRealizados.ts:241-258`; `reportesResumen.ts:53` |

Anti-lista (no perseguir ahora): **migrar `REAL` a centavos enteros** — el redondeo en escritura
(DIN-M3, propuesta 4) cubre el riesgo con una línea; reabrir si la consulta `ROUND(total,2) != total`
devuelve > 0 tras aplicar el redondeo. **Renombrar métodos de pago en config** rompe el agrupado
histórico — aceptado: la usuaria no renombra métodos en la práctica; reabrir si aparece un método
nuevo que reemplace a uno viejo.
