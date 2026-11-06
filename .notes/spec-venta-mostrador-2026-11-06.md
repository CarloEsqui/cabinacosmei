# Feature Specification — Venta de productos en mostrador (2026-11-06)

## 1. Feature
**Nombre:** Venta de productos sin cita ("Vender producto"), con o sin clienta.
**Estado:** Gate 001 PASS WITH CONDITIONS ([veredicto](gate-001-venta-mostrador-2026-11-06.md)); condiciones 1, 4, 5, 9, 11 y 12 escritas en §20 y §22.
**Dueño:** Carlos.
**Relación:**
- Resuelve la Q-002 del [spec de descuentos](spec-descuentos-2026-11-06.md). Esa Q-002 la mandaba
  a la Parte B; el dueño decidió adelantarla (chat del 2026-11-06) porque es una necesidad diaria.
- Adelanta la mitad de la condición 9 del [Gate del cobro](gate-001-modulo-cobro-2026-11-04.md):
  `pagos.cliente_id` pasa a aceptar nulos. La Parte B solo agregará `venta_tarjeta` a la regla.

## 2. Problem
### Current Situation
- Un producto se vende con dinero solo dentro del cierre de una cita (`cerrarCita`).
- Si alguien compra una crema sin cita, lo único que existe es Inventario → Salida → tipo "Venta"
  (`SalidaForm.tsx`, `inventario.registrarSalida`):
  - descuenta el stock;
  - **no registra precio ni pago**;
  - no entra a ventas, cobranza ni corte (censo: `costoProductosVendidos` exige
    `servicio_realizado_id`; ventas sale solo de `servicios_realizados`).

### Problem
- El dinero de esas ventas entra a la caja, pero no a la app, así que el corte no cuadra.
- Ventas y margen salen menores de lo real.
- No hay forma de saber qué se le vendió a una clienta fuera de cita ni si quedó a deber.

### Impact
- La cosmetóloga cuadra la caja a mano.
- Los reportes que el dueño revisa subestiman la venta de producto.

## 3. Desired Outcome
- Desde Inicio o Inventario, "Vender producto" registra en un solo paso:
  - qué se vendió y a qué precio;
  - un descuento opcional;
  - cómo se pagó, con uno o varios métodos y su comprobante.
- La venta descuenta inventario como cualquier venta.
- Su dinero entra al corte del día y su importe a ventas y margen.
- Con clienta, aparece en su historial y su saldo pendiente entra a cartera.
- Se cancela con PIN, nunca se borra. El producto regresa al inventario y los pagos se cancelan.

## 4. Users and Roles
| Rol | Necesidad | Restricciones |
|---|---|---|
| Cosmetóloga (único usuario con PIN de la app) | Cobrar un producto en el momento, con o sin clienta | Cancelar pide PIN (es cancelar pagos, regla de la Parte A) |
| Dueño (Carlos) | Ventas, margen y corte completos | — |

## 5. Scope
### Incluido
- Venta de uno o más productos, cada uno con cantidad y precio unitario editable. El precio se
  precarga con `productos.precio_venta`.
- Clienta **opcional**, elegida con el selector buscable con lupa. Sin clienta, la venta queda como
  "Público general". Opcionalmente lleva un **nombre de referencia** en texto libre (ej. "Señora de
  la tienda de al lado"), que no da de alta a nadie. Sirve para identificar la venta y para poder
  cancelar uno de sus pagos (BR-003).
- Descuento a la venta: el mismo control de monto o porcentaje con chips de motivo del cierre. Se
  puede aplicar o quitar también después, con la misma regla BR-005 de descuentos.
- Pagos con uno o varios métodos (`config.metodosPago`), con comprobante como en el cierre:
  - los métodos que no son efectivo piden comprobante;
  - si no hay, se registra "sin comprobante" aceptado de forma explícita.
- Abonos posteriores a una venta con clienta que quedó parcial o pendiente.
- Cancelar la venta con PIN y motivo.
- Lista de ventas de mostrador en Inventario, paginada de 30 en 30, con detalle.
- Las ventas de la clienta aparecen en su ficha de Clientes, con las mismas acciones.
- En Inventario, "Nueva salida" deja de ofrecer el tipo "Venta". El botón "Vender producto" lo
  reemplaza. Las salidas tipo venta que ya existen se siguen viendo igual.

### Fuera de alcance
- Vender servicios sin cita. Un servicio siempre pasa por la agenda y el cierre.
- Tarjetas de regalo y cupones (Parte B).
- Fechar una venta en el pasado: la venta es de hoy, como el cierre (A-002).
- Devoluciones parciales de una venta. Se cancela completa y se vuelve a registrar.
- Corregir las salidas tipo venta viejas sin dinero.
- Factura o CFDI.

## 6. Functional Requirements
- **FR-001 — Registrar venta.** Una venta tiene folio `VTA-0001`, la fecha de hoy, clienta
  opcional, una o más líneas (producto, cantidad, precio unitario), descuento opcional, pagos y
  observaciones opcionales. Todo se guarda en **una transacción**: o queda todo o no queda nada.
  *Por qué:* el corte y el inventario no pueden quedar a medias.
- **FR-002 — Inventario.** Cada línea descuenta stock con el mismo criterio de lotes del cierre
  (FEFO o FIFO según la configuración, sin lotes caducados ni bloqueados) y deja salida, movimiento
  y bitácora. Si no alcanza el stock, la venta no se guarda y el mensaje dice de qué producto falta.
- **FR-003 — Total.** Total = Σ redondear(cantidad × precio unitario) − descuento. Se usa la misma
  función de redondeo del dinero.
- **FR-004 — Estatus de pago derivado.** El estatus es pagado, parcial o pendiente, igual que en
  servicios. Se calcula a partir de los pagos cobrados, nunca lo manda el renderer.
- **FR-005 — Público general paga completo.** Sin clienta, la suma de pagos debe ser igual al
  total. Con clienta, puede ser menor (incluso 0) y la diferencia queda en su saldo.
- **FR-006 — Abonar.** En una venta con saldo pendiente se registran pagos posteriores, igual que
  en una cita cerrada. Una venta queda con saldo cuando:
  - tiene clienta y se cobró menos del total;
  - tiene nombre de referencia y se canceló uno de sus pagos (BR-003).
- **FR-007 — Descuento.** Se aplica al crear la venta o después. A lo más hay uno vigente por
  venta. Aplicado después, no puede dejar el total por debajo de lo ya cobrado (BR-005 de
  descuentos).
- **FR-008 — Comprobante.** El comprobante se elige en el diálogo antes de confirmar y se liga a
  los pagos de la venta al guardarla. Es el mismo patrón de token del anticipo: el main abre el
  diálogo y decide la ruta. También se puede adjuntar después desde el detalle.
- **FR-009 — Cancelar.** Pide PIN y motivo, y en una transacción:
  - marca la venta como cancelada (no se borra);
  - cancela sus pagos cobrados (con ajuste en el siguiente corte si ya estaban cortados);
  - cancela sus salidas y devuelve el stock;
  - cancela su descuento vigente.
  - Bitácora `venta_cancelada`.
- **FR-010 — Reportes.** Una venta vigente cuenta en:
  - ventas (total neto, por fecha de la venta);
  - costo de productos vendidos;
  - margen;
  - descuentos por motivo;
  - cartera y saldos por clienta, si tiene clienta.
  - Sus pagos ya cuentan en cobranza, métodos de pago, "cobrado hoy" y corte, porque se leen por
    `fuente = 'dinero'`.
- **FR-011 — Listas.**
  - Inventario muestra la pestaña "Ventas": folio, fecha, clienta o "Público general", total y
    estatus. Pagina de 30 en 30 y abre el detalle.
  - La ficha de la clienta en Clientes lista sus ventas junto a su historial, y abre el mismo
    detalle.
- **FR-012 — Detalle de venta**, al estilo del detalle de cita:
  - líneas y desglose (subtotal, descuento, total, cobrado, saldo);
  - pagos con su método y comprobante;
  - acciones: abonar, aplicar o quitar descuento, adjuntar comprobante, cancelar pago (PIN) y
    cancelar venta (PIN).

## 7. Business Rules
- **BR-001** — Un registro de dinero no se borra: venta, pagos y descuento se cancelan
  (PROJECT.md, superficie Dinero; CFF art. 30).
- **BR-002** — Un pago tiene clienta, salvo que pertenezca a una venta de mostrador sin clienta.
  Un pago de venta de mostrador siempre apunta a su venta.
- **BR-003** — Una venta sin clienta entra pagada (FR-005). Cancelar uno de sus pagos la deja con
  saldo, y esa deuda necesita a alguien a quien cobrarle:
  - sin clienta y **sin nombre de referencia**, no se puede cancelar un pago suelto; se cancela la
    venta completa;
  - **con nombre de referencia** sí se puede, y el saldo queda a ese nombre (decisión del dueño,
    §20).
- **BR-004** — No se vende un producto inactivo, ni una cantidad mayor que el stock vendible
  (lotes activos y no caducados).
- **BR-005** — El precio unitario es editable y debe ser **> 0**; la cantidad, > 0. Para regalar
  se usa un descuento del 100% con el chip "Cortesía", así queda el motivo en "descuentos por
  motivo" (decisión del dueño, §20).
- **BR-006** — La venta de mostrador no crea `servicios_realizados`, así que no aparece en la ficha
  clínica, ni en servicios, ni en el ticket promedio de citas del Inicio.
- **BR-007** — Pagos: los métodos deben estar en `config.metodosPago` y cada monto debe ser > 0.
  La suma no puede exceder el total.
- **BR-008** — Cancelar la venta o uno de sus pagos pide PIN. Aplicar o quitar un descuento no lo
  pide (igual que en descuentos).
- **BR-009** — La bitácora registra folio, conteo de líneas y montos. Nunca registra el nombre de
  la clienta ni el nombre de referencia (regla de PII de PROJECT.md).

## 8. Primary Flow
1. En Inicio o Inventario, la cosmetóloga pica "Vender producto".
2. Opcionalmente elige a la clienta con la lupa. Si no, queda "Público general".
3. Agrega productos con el selector buscable. Cada uno trae su precio, que puede editar, y muestra
   el stock disponible.
4. Opcionalmente aplica un descuento con su chip de motivo.
5. Captura los pagos (uno o varios métodos) y, si alguno no es efectivo, el comprobante.
6. Confirma. Ve "Venta VTA-0007 registrada" y el detalle queda accesible desde Ventas.

**Resultado esperado:** stock descontado, pagos en el pendiente de corte, venta en reportes.

## 9. Alternative and Error Flows
- **No alcanza el stock:** no se guarda nada; el mensaje dice el producto y cuánto hay.
- **Público general con pago incompleto:** el botón Confirmar no se habilita y el texto dice que
  sin clienta se paga completo. El main lo vuelve a validar.
- **Clienta con saldo:** se guarda como parcial o pendiente y aparece en su cartera y en la alerta
  "Pago pendiente" de Clientes.
- **Venta con nombre de referencia y un pago cancelado:** queda parcial o pendiente, aparece en
  cartera a ese nombre y en la lista de Ventas con su saldo, y se le puede abonar.
- **Cancelar una venta con pagos ya cortados:** los pagos cancelados aparecen como ajuste negativo
  en el siguiente corte (comportamiento existente de `cancelarPago`).
- **Comprobante no elegido con método no efectivo:** se pide aceptar "sin comprobante", igual que
  en el cierre.
- **Cancelar una venta ya cancelada, o cancelar con PIN incorrecto:** se rechaza sin cambios.

## 10. Data
### Existing Data
- `salidas_inventario`: ya trae `precio_unitario_venta` (0005) y `cliente_id` nullable.
- `pagos`: `concepto`, `fuente`, `corte_id`, la cancelación y `comprobante_archivo_id`.
  **`cliente_id` es NOT NULL.**
- `descuentos_servicio` (0006): `servicio_realizado_id` es NOT NULL. **No tiene filas en la
  instalación real**, porque la `0006` aún no se publica.
- `archivos`, con `categoria = 'comprobante'`.

### New Data Requirements (propuesta técnica para el Gate)
- **Tabla nueva `ventas_mostrador`:**
  - `id`
  - `folio` (`VTA-####`, único)
  - `fecha`
  - `cliente_id` (nullable, restrict)
  - `total_productos`
  - `descuento` (caché, la misma convención que `servicios_realizados.descuento_productos`)
  - `estatus_pago` (derivado)
  - `estatus` (`vigente` | `cancelada`)
  - `cancelada_at`, `motivo_cancelacion`, `cancelada_por`
  - `observaciones`, `usuario_id`
  - `created_at`, `updated_at`
- **`salidas_inventario`:** `venta_mostrador_id` nullable con FK. Se agrega con `ALTER TABLE ADD`.
- **`pagos` se recrea** (SQLite no altera columnas) con:
  - `cliente_id` nullable;
  - `venta_mostrador_id` nullable con FK;
  - concepto nuevo `venta_mostrador`.
  - CHECK de BR-002: `cliente_id IS NOT NULL OR venta_mostrador_id IS NOT NULL`.
  - Ninguna tabla tiene FK hacia `pagos`, así que recrearla no arrastra hijas. La instalación real
    tiene pagos, por eso lleva radiografía sobre la copia del respaldo real.
- **`descuentos_servicio` se recrea** con:
  - `servicio_realizado_id` nullable;
  - `venta_mostrador_id` nullable con FK;
  - CHECK de "exactamente uno";
  - índice único parcial: un descuento manual vigente por venta.
  - Se mantiene **un solo modelo de descuento** para que los cupones de la Parte B apliquen igual a
    citas y a ventas. La tabla está vacía en la instalación real.
  - Alternativa evaluada: columnas de descuento dentro de `ventas_mostrador`. No se toma porque la
    Parte B tendría que escribir en dos lugares.
- **Comprobante:** se guarda en `archivos` con `entidad_tipo = 'venta_mostrador'`. La carpeta es
  `<clienta>/Pagos` si hay clienta y `Datos/Comprobantes/Ventas` si no.
- **Migración `0008_venta_mostrador`**, con cabecera auditada (`/atlas migracion`).

### Sensitive Data
- Con clienta, la venta liga una compra a una persona: es PII ordinaria, no sensible.
- El nombre de referencia es PII ordinaria en texto libre:
  - vive solo en `ventas_mostrador.nombre_referencia`, con un máximo de 80 caracteres;
  - no entra a bitácora, CSV ni notas;
  - el reinicio de datos lo borra con la venta.
- Sin clienta no se guarda ningún dato personal.
- La bitácora sigue BR-009.

## 11. Authorization
| Acción | PIN | Notas |
|---|---|---|
| Registrar venta | No | Igual que cerrar cita |
| Abonar | No | Igual que un pago de cita |
| Aplicar o quitar descuento | No | BR-008 |
| Adjuntar comprobante | No | — |
| Cancelar un pago de la venta | **Sí** | Con clienta o con nombre de referencia (BR-003) |
| Cancelar la venta | **Sí** | Con motivo |

## 12. UX Requirements
- "Vender producto" es un modal compacto en este orden:
  1. clienta (selector buscable, "Público general" por defecto);
  2. líneas de producto (selector buscable, cantidad, precio);
  3. descuento (el mismo `DescuentoCampo`);
  4. pagos;
  5. resumen (subtotal, descuento, total, cobrado, saldo).
- Los inputs numéricos seleccionan todo al enfocar y no traen ceros precargados.
- Cada línea muestra el stock disponible y avisa en línea si la cantidad lo supera.
- El detalle de venta sigue el estilo del detalle de cita, con las acciones al lado de lo que
  afectan. Nada de tablas con íconos.
- Las acciones están en todo lugar donde aparece la venta: lista de Inventario, historial de la
  clienta y detalle.
- La lista de ventas está vacía con un texto amable y el botón "Vender producto".

## 13. Non-Functional Requirements
- **Confiabilidad:** FR-001 y FR-009 van en una sola transacción. La migración recrea `pagos` sin
  perder filas; la radiografía compara conteos y sumas antes y después.
- **Auditabilidad:** bitácora `venta_registrada`, `venta_cancelada`, `pago_registrado` y
  `descuento_aplicado`.
- **Seguridad:** el renderer nunca manda rutas, estatus ni totales. El main recalcula todo.
- **Rendimiento:** la lista pagina de 30 en 30. Los reportes suman ventas por rango con una sola
  consulta agregada.

## 14. Integrations
| Sistema interno | Propósito | Dirección | Si falla |
|---|---|---|---|
| `inventario.registrarSalidaEnTx` / `cancelarSalidaEnTx` | Descontar y devolver stock | escritura | Venta sin stock descontado; corte y stock divergen |
| `cobros.ts` (pagos, estatus, descuentos, cancelación) | Dinero de la venta | escritura | Corte descuadrado |
| `corte.ts` | Corte de caja | lectura (sin cambio, filtra por `fuente`) | — |
| Reportes (`reportesResumen`, `reportesFinanzas`, `reportesClientesDetalle`, `dashboard`) | Ventas, margen, cartera | lectura | Números menores a lo real |
| `comprobantes.ts`, `folders.ts`, `archivos.ts` | Comprobante | escritura | Pago sin evidencia |
| `reinicio.ts` | Borrar `ventas_mostrador` en el reinicio | escritura | Reinicio falla por FK |

## 15. Constraints
- La `0008` se suma al release pendiente (`0004`…`0007`), o sale después. La instalación real está
  en la `0003` y las recibirá todas juntas.
- Se recrean `pagos` y `descuentos_servicio` dentro de la transacción del migrador, con
  `foreign_keys = ON`. Funciona porque ninguna tabla apunta a ellas; se verifica en la radiografía.
- Repo público: evidencia solo con conteos y códigos.

## 16. Assumptions
- **A-001** — Una venta de mostrador siempre es de productos del inventario. Verificable: solo
  `productos` activos.
- **A-002** — La venta es del día; no hay ventas con fecha pasada.
- **A-003** — El ticket promedio del Inicio sigue midiendo citas (BR-006).
- **A-004** — La lista de "Ventas" vive en Inventario. Finanzas solo ve los números.

## 17. Open Questions
- **Q-001** — Ninguna cambia la arquitectura. A-002 y A-003 son propuestas: si algún día se
  permiten ventas con fecha pasada, cambia la validación, no el esquema.

## 18. Acceptance Criteria
- **AC-001** — *Dado* un producto con 5 piezas a $250, *cuando* se venden 2 a Público general con
  $500 en efectivo, *entonces*:
  - hay una venta `VTA-` pagada;
  - el stock queda en 3;
  - el pendiente de corte sube $500;
  - las ventas del día suben $500.
- **AC-002** — *Dado* el mismo caso con $400, *cuando* se confirma sin clienta, *entonces* el main
  rechaza y no cambian stock ni pagos.
- **AC-003** — *Dada* una clienta, *cuando* se le venden $500 y paga $200, *entonces*:
  - la venta queda parcial;
  - su saldo y la cartera suben $300;
  - un abono de $300 la deja pagada.
- **AC-004** — *Dada* una venta de $500 con 15% de primera visita, *entonces*:
  - el total es $425;
  - "descuentos por motivo" muestra $75 en primera visita;
  - aplicar después un descuento que deje el total debajo de lo cobrado se rechaza.
- **AC-005** — *Dada* una venta pagada y ya cortada, *cuando* se cancela con PIN, *entonces*:
  - el stock regresa;
  - los pagos quedan cancelados y el siguiente corte muestra el ajuste negativo;
  - la venta sale de ventas y margen.
  - Con PIN incorrecto no cambia nada.
- **AC-006** — Pago con tarjeta y comprobante elegido: el archivo queda en la carpeta que
  corresponde y ligado al pago.
- **AC-007** — La migración `0008` sobre una copia del respaldo real conserva el conteo y la suma
  de `pagos` por estatus, y `foreign_key_check` queda vacío.
- **AC-008** — "Nueva salida" ya no ofrece el tipo Venta. Las salidas de venta viejas se siguen
  viendo en Inventario.
- **AC-009** — Una venta con stock insuficiente en un producto no descuenta ninguno de los otros.
- **AC-010** — El reinicio de datos borra las ventas sin error de FK.
- **AC-011** — Una venta sin clienta y sin nombre rechaza la cancelación de un pago suelto. La misma
  venta con nombre de referencia la acepta con PIN, queda parcial y aparece en cartera a ese
  nombre. Un abono la deja pagada.
- **AC-012** — Una línea con precio 0 se rechaza en el main. Un descuento del 100% con motivo
  "Cortesía" deja la venta en $0, pagada sin pagos, y aparece en "descuentos por motivo".

## 19. Success
- El corte del día cuadra con la caja sin anotaciones a mano.
- Ventas y margen incluyen la venta de producto de mostrador.

## 20. Decisiones del dueño (chat del 2026-11-06)
- Clienta **opcional**: "Público general" sin capturar datos.
- Deber: **solo con clienta**. Público general paga completo.
- Incluye descuento, cancelar la venta (con PIN), comprobante de pago y varios métodos.
- Botón en **Inicio** e **Inventario**. En Inventario reemplaza la salida tipo "Venta" que no
  registra dinero.
- Se hace **antes** de la Parte B, en su propio PR.

Segunda ronda (chat del 2026-11-06, condición 12 del Gate):
- **Precio (BR-005):** editable por línea y **sin precio 0**. Para regalar se usa un descuento del
  100% con el chip "Cortesía".
- **Fecha (A-002):** la venta siempre es de hoy.
- **Lista (A-004):** la lista vive en Inventario, en la pestaña "Ventas", y las ventas de cada
  clienta salen en su ficha.
- **Cancelar un pago suelto sin clienta (BR-003):** el dueño propuso un **nombre de referencia** en
  la venta. No da de alta a una clienta; identifica la venta y permite cancelar un pago suelto.
  Sin nombre, se cancela la venta completa.
  - Al crearla, la venta sin clienta se sigue pagando completa (primera ronda).
- **Reportes (condición 11):** las compras de mostrador cuentan en el **valor** de la clienta y
  **no** en "clientas atendidas".

## 21. References
- [Spec del cobro](spec-modulo-cobro-2026-11-04.md) y su [Gate](gate-001-modulo-cobro-2026-11-04.md)
  (condición 9).
- [Spec de descuentos](spec-descuentos-2026-11-06.md) y su
  [Gate](gate-001-descuentos-2026-11-06.md).
- [Auditoría de dinero](auditoria-dinero-2026-11-03.md): DIN-A5 (venta sin ingreso) y DIN-A3
  (`servicios_productos_consumidos` nunca se escribe; no se toca aquí).
- Código:
  - `serviciosRealizados.cerrarCita`;
  - `inventario.registrarSalidaEnTx` y `cancelarSalidaEnTx`;
  - `cobros.registrarPagosEnTx`, `cancelarPago`, `costoProductosVendidos` y `saldosPorCliente`;
  - `corte.calcularPendiente`;
  - `comprobantes.adjuntarComprobanteAnticipo`.

## 22. Diseño técnico (condiciones del Gate; 2026-11-06)
Fuente: [Gate 001](gate-001-venta-mostrador-2026-11-06.md). Las condiciones 2, 3, 6, 7, 8, 10 y 13
se verifican en la migración, el código y la evidencia; aquí se escriben las que el Gate pide
**antes** de implementar.

### 22.1 Numeración (condición 1)
- Esta es la **`0008_venta_mostrador`**. La Parte B pasa a la **`0009`** (addendum en el
  [spec del cobro](spec-modulo-cobro-2026-11-04.md)).
- Se genera con `/atlas migracion` en una rama nueva desde `main`, cuando `main` ya tenga la
  `0007` (PR de la ficha).
- La `0008` agrega `ventas_mostrador.nombre_referencia` (text, nullable). Es una columna más en la
  tabla nueva; no cambia la estructura que evaluó el Gate.

### 22.2 Dueños (condición 4)
- **`electron/services/ventasMostrador.ts`** (módulo nuevo):
  - inserta la cabecera;
  - genera el folio `VTA-####` dentro de la transacción;
  - escribe `total_productos`, `nombre_referencia`, `observaciones`, `estatus` y los campos de
    cancelación;
  - lista y devuelve el detalle;
  - orquesta `registrarVenta` y `cancelarVenta`, cada una en una transacción síncrona, llamando a
    `inventario.registrarSalidaEnTx` / `cancelarSalidaEnTx` y a las funciones `…EnTx` de
    `cobros.ts`.
- **`cobros.ts`** sigue siendo el **único** escritor de:
  - `pagos`;
  - `descuentos_servicio`;
  - las columnas derivadas `ventas_mostrador.estatus_pago` y `ventas_mostrador.descuento`.
- **Dirección de dependencias:** `ventasMostrador → cobros, inventario`. `cobros.ts` no importa
  `ventasMostrador.ts`.
- **Pendiente del dueño:** agregar `electron/services/ventasMostrador.ts` a `sensitive_globs` de
  PROJECT.md. La edición la hace Carlos.

### 22.3 Destino "venta" en `cobros.ts` (condición 5)
**Como se construyó (2026-11-06).** Las funciones de servicio conservan su firma. La venta tiene
funciones paralelas en `cobros.ts`, y las operaciones de la UI se bifurcan según el campo del
input. Se eligió así para no tocar las firmas que usa `cerrarCita`. El reparto de la condición 4
no cambia.

| Función | Qué hace con la venta |
|---|---|
| `totalVenta({ totalProductos, descuento })` | **Nueva.** Única definición del neto |
| `saldoVenta`, `cobradoPorVenta`, `costoVentasMostrador` | **Nuevas.** Saldo, cobrado y costo por venta |
| `registrarPagosEnTx(tx, input, metodos)` | `clienteId: string \| null` y `ventaMostradorId?`, con concepto `venta_mostrador`. Valida BR-002 |
| `recalcularEstatusVentaEnTx(tx, ventaId)` | **Nueva.** Única escritora de `ventas_mostrador.estatus_pago`. Una venta cancelada no se reevalúa |
| `aplicarDescuentoVentaEnTx`, `cancelarDescuentosVentaEnTx` | **Nuevas.** `aplica_a = 'productos'`; la caché `ventas_mostrador.descuento` se recalcula desde la tabla |
| `cancelarDescuentoEnTx` (interna) | Recalcula la caché del destino que tenga la fila, sea servicio o venta |
| `descuentosVigentesVenta`, `pagosDeVenta` | **Nuevas.** Lectura para el detalle |
| `aplicarDescuento` / `quitarDescuento` | Con `ventaMostradorId`: BR-005 contra lo cobrado de la venta, dentro de la transacción; la venta debe estar `vigente` |
| `registrarAbono` | Con `ventaMostradorId`: la venta debe estar `vigente` y con saldo |
| `cancelarPagoEnTx(tx, pagoId, motivo, usuarioId)` | **Nueva**, sin PIN. Recalcula el estatus del servicio o de la venta |
| `cancelarPago(input)` | Verifica el PIN. Rechaza un pago de una venta sin clienta y sin nombre de referencia (BR-003) |
| `saldosPorCliente` | Suma las ventas `vigente` con clienta. No cuentan como "servicios cerrados" |
| `descuentosDelRango` | Une los descuentos de ventas `vigente` por `ventas_mostrador.fecha` |

### 22.4 Contrato IPC, esquemas y tipos (condición 9)
| Canal | Entrada | Salida |
|---|---|---|
| `ventas:registrar` | `VentaMostradorInput` | `{ id, folio }` |
| `ventas:listar` | `{ pagina }` (30 por página) | `{ filas: VentaMostradorRow[], total }` |
| `ventas:detalle` | `ventaId` | `DetalleVentaMostrador` |
| `ventas:porCliente` | `clienteId` | `VentaMostradorRow[]` |
| `ventas:cancelar` | `CancelarVentaInput` | `void` |
| `ventas:subirComprobante` | `ventaId` | Comprobante después de la venta (el main abre el diálogo) |

Los canales que ya existen y ganan el destino venta son abono, aplicar/quitar descuento y
cancelar pago (`cobros:*`).

Esquemas en `shared/schemas.ts`:
- **`ventaMostradorInputSchema`**:
  - `clienteId: string | null`;
  - `nombreReferencia: string ≤ 80 | null`, solo si `clienteId` es null;
  - `lineas: [{ productoId, cantidad > 0, precioUnitario > 0 }]` con al menos una;
  - `descuento?: DescuentoCaptura` con `aplicaA` fijo en "productos" (un `refine` lo exige);
  - `pagos: LineaPago[]`, `sinComprobanteAceptado?`, `comprobanteToken?`, `observaciones?`.
- **`cancelarVentaInputSchema`**: `{ ventaId, motivo, pin }`.
- **`abonoInputSchema`, `descuentoInputSchema` y `quitarDescuentoInputSchema`** ganan
  `ventaMostradorId?`, con un `refine` que exige exactamente uno contra `servicioRealizadoId`.

Tipos en `shared/types.ts`:
- **`VentaMostradorRow`**: `id`, `folio`, `fecha`, `clienteId`, `clienteNombre | null`,
  `nombreReferencia | null`, `total`, `cobrado`, `saldo`, `estatusPago`, `estatus`.
- **`DetalleVentaMostrador`**: lo de la fila, más:
  - las líneas **agrupadas por producto**, porque una línea repartida en lotes son varias salidas
    con el mismo folio `S-`;
  - el descuento vigente;
  - los pagos con su comprobante;
  - las observaciones y los datos de cancelación.

El renderer nunca manda totales, estatus ni rutas.

### 22.5 Alcance de reportes (condición 11)
Toda suma pasa por `totalVenta` y por un único lector, `ventasDelRango(db, desde, hasta)`, en
`ventasMostrador.ts`. Lee las ventas `vigente` por `fecha`.

| Lector | ¿Incluye ventas de mostrador? |
|---|---|
| `reportesResumen`: ventas, costo de productos, margen, serie | **Sí** |
| `reportesResumen.clientesUnicos` ("clientas atendidas") | **No** (dueño, §20) |
| `reportesFinanzas`: ventas, descuentos por motivo | **Sí** |
| `reportesFinanzas`: cartera por antigüedad y detalle | **Sí**. Con clienta, a su nombre; sin clienta y con nombre de referencia, como "nombre (sin registro)" |
| `clientes.ts`: saldo y alerta "Pago pendiente" (vía `saldosPorCliente`) | **Sí** |
| Historial de la clienta en Clientes | **Sí** (`ventas:porCliente`) |
| `reportesClientesDetalle.valor` | **Sí** (dueño, §20) |
| `reportesClientesDetalle`: visitas, segmento, intervalos | **No** |
| `reportesServiciosDetalle` | **No** |
| `dashboard`: servicios del mes y ticket promedio | **No** (A-003) |
| `dashboard`: cobrado hoy y pendiente de corte | Sí, sin cambio (se lee por `fuente`) |
| `corte.ts` | Sí, sin cambio |
| `reportesInventarioDetalle`: salidas por tipo | Sí, sin cambio (son salidas tipo venta) |

## Addendum 2026-11-06 — resultado de la auditoría (VEN-A1, VEN-M1, VEN-B4, VEN-B5)
Según la [auditoría](auditoria-venta-mostrador-2026-11-06.md) y su
[evidencia](evidencia-venta-mostrador-2026-11-06.md):

- **VEN-A1 — FR-007 y BR-003.** Quitar o cambiar el descuento de una venta sin clienta **y sin
  nombre de referencia** no puede dejarla debiendo: el main lo rechaza y la UI no ofrece esas
  acciones. Para corregir el precio, se cancela la venta y se registra de nuevo.
  - Con nombre de referencia se permite, y el saldo queda a ese nombre, igual que un pago suelto
    cancelado.
  - Es la misma regla de BR-003: una deuda sin clienta solo existe si hay a quién cobrarle.
    Pendiente de que Carlos la confirme.
- **VEN-M1 — FR-009.** Al cancelar una venta, **su descuento no se cancela**: queda como parte del
  ticket cancelado y el detalle muestra el neto real.
  - Una venta cancelada no cuenta en ningún reporte, porque todos filtran `vigente`.
  - Regla heredada a CIT-C1: cancelar un servicio cerrado no reescribe sus cachés de descuento.
- **VEN-B4 — §9, doble envío.**
  - "Registrar venta" se deshabilita mientras se guarda.
  - Al registrar, el modal se cierra aunque el comprobante falle (el aviso lo dice).
  - Con eso no hay segundo envío desde la misma captura.
- **VEN-B5 — FR-001.** La cantidad de cada línea es en **piezas enteras**.
