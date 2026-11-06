# Feature Specification — Descuentos en el cierre y cambio de servicio (2026-11-06)

## 1. Feature
**Nombre:** Descuento por monto o porcentaje al cerrar la cita (separado para servicio y productos),
aplicable también a citas ya cerradas, y cambio del servicio realizado antes de cerrar.
**Estado:** Draft — pendiente de Gate 001.
**Dueño:** Carlos.
**Relación:** adelanta el tipo `manual` de `descuentos_servicio`, que la Parte B del
[spec del cobro](spec-modulo-cobro-2026-11-04.md) (§21.2, §21.3) ya preveía. Cupones y cortesías
siguen en la Parte B.

## 2. Problem

### Current Situation
- El cierre de cita permite editar el precio del servicio y el precio unitario de cada producto
  vendido. No existe el concepto de descuento.
- La cosmetóloga da 15 % de descuento en la primera visita de cada clienta nueva. Como no hay dónde
  anotarlo, registra un pago menor al total.
- El servicio del cierre es el de la cita. Para cambiarlo hay que salir y usar "Reagendar".

### Problem
- La app interpreta ese pago menor como **adeudo**: esas citas aparecen "parcial" o "pendiente" de
  pago y su saldo cuenta en el adeudo de la clienta, en el Dashboard y en Reportes.
- Las ventas quedan con el precio completo, así que también están infladas en los reportes.
- Si la clienta cambia de tratamiento al llegar, el cierre registra el servicio equivocado (receta de
  insumos, precio sugerido y fecha de mantenimiento).

### Impact
- La dueña ve adeudos que no existen y no puede distinguirlos de los reales.
- Medición sobre el respaldo real de la cabina del 2026-11-05. Copia de solo lectura fuera del
  repo; solo conteos.
  - Hay 21 servicios cerrados y 13 son primeras visitas.
  - En **4 primeras visitas** el **precio** se bajó a mano al 85 % del catálogo. Se ven "pagado",
    pero sin rastro de que fue descuento ni de por qué.
  - En **1 primera visita** se cobró el 85 % del precio, y en **1 visita posterior** el 63 %.
    Hoy se ven "pagado" porque el cierre viejo guardaba el estatus que mandaba la pantalla.
  - Con la `0005` el estatus se deriva, así que esos 2 servicios pasan a "parcial", con $388 de
    saldo en total (ver la [evidencia de la Parte A](evidencia-cobro-v2-parte-a-2026-11-05.md),
    COB-A1).
  - La acción de descuento tiene que salir en el mismo release que la `0005`, para que la
    cosmetóloga pueda corregirlos en cuanto aparezcan.

## 3. Desired Outcome
- En el cierre se puede aplicar un descuento al **servicio** y otro, independiente, a los
  **productos vendidos**. Cada uno puede ser un porcentaje o un monto fijo, y lleva un motivo elegido
  con un clic.
- Las citas que ya se cerraron con un pago menor se corrigen aplicando el descuento desde el detalle
  de la cita. El saldo queda en $0 y la cita pasa a "pagado", sin tocar los pagos.
- Antes de cerrar se puede cambiar el servicio realizado.
- Los reportes muestran ventas netas de descuentos y cuánto se descontó por motivo.

## 4. Users and Roles
La cosmetóloga, que es la dueña operativa, cierra citas y aplica descuentos. No hay otros roles en
uso. La app sí tiene usuarios y PIN, y la bitácora registra quién hizo cada acción.

## 5. Scope

### Incluido
- Descuento manual de servicio y de productos, en el cierre y después del cierre.
- Quitar un descuento aplicado.
- Cambio de servicio en el cierre.
- Ajuste de totales, saldos, estatus de pago y reportes de ventas.
- Métrica "Descuentos otorgados" por motivo en Reportes → Finanzas.

### Fuera de alcance
- Cupones, cortesías, tarjetas de regalo y reglas de acumulación entre descuentos (Parte B).
- Sugerencia automática de descuento de primera visita. **Carlos dijo que no.**
- **Venta de productos sin cita (mostrador).** Hoy "Salida → Venta" en Inventario solo descuenta
  stock: no guarda precio ni pago, así que esa venta no llega al corte ni a las ventas. Es un ticket
  sin cita. Se recomienda diseñarlo junto con la Parte B, porque vender una tarjeta de regalo a
  alguien que no es clienta (condición 9 del Gate del cobro) es el mismo concepto. Ver Q-002.

## 6. Functional Requirements
- **FR-001.** El cierre muestra, debajo del precio del servicio, un control "Descuento" con:
  - modo `%` o `$`;
  - un valor;
  - un motivo con chips: **Primera visita**, **Promoción**, **Cortesía** y **Otro**. "Otro" pide texto.
- **FR-002.** Si hay productos vendidos, la sección de productos tiene su propio control "Descuento
  en productos", con los mismos campos que FR-001 y **independiente** del descuento del servicio.
- **FR-003.** El desglose del pago muestra el precio del servicio, su descuento, los productos, su
  descuento, el total neto, los anticipos y lo que falta por cobrar.
- **FR-004.** El servidor calcula el monto de cada descuento:
  - si es porcentaje: base × valor / 100, redondeado a 2 decimales (BR-007);
  - si es monto: el valor tal cual.

  El servidor guarda el modo, el valor, la base y el monto. El renderer nunca manda montos
  calculados como verdad.
- **FR-005.** En una cita **cerrada**, el detalle de la cita tiene la acción "Aplicar descuento" (o
  "Cambiar descuento" si ya hay uno), con los mismos campos que FR-001 y FR-002.
  - Al guardarlo se recalcula el estatus de pago.
  - La acción se ofrece donde aparezca el servicio cerrado: detalle de la cita desde Citas,
    Calendario, Clientes y Dashboard (regla de "acciones donde se trabaja").
- **FR-006.** "Quitar descuento" en una cita cerrada marca el descuento como cancelado, con su motivo
  y fecha. Nunca se borra la fila.
- **FR-007.** Antes de cerrar, el cierre permite cambiar el servicio con un selector buscable.
  - Al cambiarlo se recargan la receta de insumos y el precio sugerido del nuevo servicio. Si la
    cosmetóloga ya había escrito un precio a mano, se respeta.
  - Al cerrar, el servidor actualiza `servicios_realizados.servicio_catalogo_id` y
    `citas.servicio_catalogo_id`.
  - La fecha de mantenimiento sugerida se calcula con el servicio nuevo.
- **FR-008.** Reportes:
  - las "ventas" de Resumen, Finanzas, Dashboard, Clientes y Servicios son **netas** de descuentos;
  - Finanzas muestra "Descuentos otorgados" del periodo, total y por motivo.
- **FR-009.** Bitácora:
  - `descuento_aplicado` y `descuento_quitado`, con el servicio, la base, el modo, el valor, el monto
    y el motivo;
  - `servicio_cambiado_en_cierre`, con el servicio anterior y el nuevo.

## 7. Business Rules
- **BR-001.** Hay a lo más **un descuento manual aplicado por base** (servicio o productos) en cada
  servicio realizado. Cambiar un descuento cancela el anterior y aplica el nuevo, en la misma
  transacción.
- **BR-002.** Un descuento nunca supera su base. 100 % del servicio está permitido: es una cortesía
  manual.
- **BR-003.** Total del ticket = (precio − descuento del servicio) + (productos − descuento de
  productos). Una sola definición en `cobros.ts`, que reemplaza a la FR-008 del spec del cobro.
- **BR-004.** Un descuento **no es un pago**:
  - no crea filas en `pagos`;
  - no aparece en el corte de caja;
  - no cambia el dinero cobrado.
- **BR-005.** Después del cierre, un descuento no puede dejar el total por debajo de lo ya cobrado
  en ese servicio. Si lo dejara, se rechaza con un mensaje que dice cuánto sobra; para corregirlo
  primero se cancela el pago, que pide PIN según la regla de la Parte A. Así nunca hay saldo a favor
  implícito.
- **BR-006.** Al cerrar, el descuento entra en la misma transacción que los pagos y el
  `porCobrar = total neto − anticipos`. Las reglas de "el pago excede" y de "los anticipos superan el
  total" usan el total neto.
- **BR-007.** El descuento se fecha con la fecha del **servicio** para las ventas: un descuento
  aplicado después corrige las ventas de ese día, porque la venta real fue menor. La bitácora guarda
  cuándo se aplicó.
- **BR-008. Sin PIN (decisión de Carlos, 2026-11-06, Q-001):**
  - aplicar, cambiar o quitar un descuento **no pide PIN**, ni en el cierre ni después; solo pide
    una confirmación en pantalla después del cierre;
  - queda en la bitácora.

  Es coherente con el addendum del 2026-11-05: el PIN se reserva para cancelar dinero que ya entró.
  Carlos acepta el riesgo que señala el Gate: con un clic se puede perdonar un adeudo real, y el
  único control es la bitácora.
- **BR-009.** Solo `cobros.ts` escribe `descuentos_servicio` y las columnas de descuento de
  `servicios_realizados`. Extiende la condición 5 del Gate del cobro.
- **BR-010.** El servicio solo se cambia mientras el servicio realizado está `abierto`. Después del
  cierre no se puede, porque el inventario ya se descontó con su receta.

## 8. Primary Flow
1. La cosmetóloga abre "Cerrar cita". Si hace falta, cambia el servicio (FR-007).
2. Escribe 15 en "Descuento", con modo `%` y el chip "Primera visita".
3. El desglose muestra −$X y el nuevo "Por cobrar".
4. Captura el pago por el neto y cierra. La cita queda "pagado".

## 9. Alternative and Error Flows
- **Cita vieja que salió "parcial" por el descuento implícito.** Detalle de la cita → "Aplicar
  descuento" → 15 %, "Primera visita" → confirmación. Saldo $0 y estatus "pagado". Si el 15 % no
  coincide con lo que falta por unos centavos, ella puede usar el modo `$` con el saldo exacto.
- **El descuento excede lo pendiente después de cobrar** (BR-005): se rechaza con el monto que sobra.
- **Descuento mayor que su base** (BR-002): se rechaza.
- **Cambio de servicio sin stock para la nueva receta:** aplica la verificación de stock que ya
  existe en el cierre.

## 10. Data
Propuesta. La migración pasa por `/atlas migracion`, con cabecera auditada.

**Tabla nueva `descuentos_servicio`**, el nombre ya previsto en §21.2 del spec del cobro:

| Columna | Tipo | Regla |
|---|---|---|
| `id` | TEXT PK | |
| `servicio_realizado_id` | TEXT NOT NULL | FK → `servicios_realizados`, `ON DELETE RESTRICT` |
| `tipo` | TEXT NOT NULL | `manual` hoy; `cupon` / `cortesia` en la Parte B. Sin CHECK (Gate, condición 1). |
| `aplica_a` | TEXT NOT NULL | `servicio` / `productos`. Sin CHECK. |
| `modo` | TEXT NOT NULL | `porcentaje` / `monto`. Sin CHECK. |
| `valor` | REAL NOT NULL | `CHECK (valor > 0)`; si es porcentaje, `<= 100` (en zod y en el servidor) |
| `base` | REAL NOT NULL | La base al momento de aplicarlo |
| `monto` | REAL NOT NULL | `CHECK (monto > 0 AND monto <= base)` |
| `motivo` | TEXT NOT NULL | `primera_visita` / `promocion` / `cortesia` / `otro`. Sin CHECK. |
| `motivo_detalle` | TEXT | Obligatorio si `motivo = 'otro'` (se valida en el servidor) |
| `estatus` | TEXT NOT NULL | `aplicado` / `cancelado` |
| `cancelado_at` | INTEGER | |
| `motivo_cancelacion` | TEXT | |
| `usuario_id` | TEXT | |
| `created_at` | INTEGER | |

Los valores válidos de las columnas enumeradas viven en zod y en `cobros.ts`, no en CHECK. Es la
convención de las migraciones `0004` y `0005`. Así la Parte B no tiene que recrear la tabla.

Cuando la Parte B traiga un descuento `todo` (servicio y productos a la vez), se guardará como **dos
filas**, una por base. Así `descuento_servicio` y `descuento_productos` siguen siendo
Σ `monto` por base y AC-007 no cambia.

Índices:
- índice único parcial `(servicio_realizado_id, aplica_a) WHERE estatus='aplicado' AND tipo='manual'`, para BR-001;
- índice por `servicio_realizado_id`.

**Columnas nuevas en `servicios_realizados`:** `descuento_servicio` y `descuento_productos`, ambas
`REAL NOT NULL DEFAULT 0`.
- Son la caché de Σ `monto` aplicado por base, igual que `total_productos`.
- Solo las escribe `cobros.ts`, en la misma transacción que la fila del descuento.
- Hay un invariante verificable con una consulta (AC-007).
- Motivo: todas las lecturas de dinero (más de 10 sitios) ya seleccionan `precio` y
  `total_productos` de la misma fila. Así basta con agregar dos columnas a esos selects y no hacen
  falta subconsultas.

**Funciones de `cobros.ts`:**
- `totalTicket`, `saldoServicio` e `ingresoDelServicio` exigen `descuentoServicio` y
  `descuentoProductos` en su tipo de parámetro. Ningún sitio puede olvidarlos sin que el typecheck
  falle.
- `ingresoDelServicio` pasa a ser precio − descuento del servicio.

**Migraciones:**
- Ninguna fila existente cambia: las columnas nacen en 0 y la tabla nace vacía.
- Las citas viejas se corrigen **a mano** desde la app (FR-005), nunca con un UPDATE en la
  migración, porque la app no puede saber cuáles fueron descuentos y cuáles adeudos reales.
- **Numeración:**
  - esta migración ocupa la **`0006`**;
  - la ficha clínica pasa a la **`0007`**;
  - la Parte B pasa a la **`0008`**.

  Ninguna de las tres está publicada.
- `0005` y `0006` salen juntas en el mismo release. La radiografía de COB-A1 ya se corrió (pasa).
  Sigue pendiente la prueba guiada en la app.

**`reinicio.ts`:** `descuentosServicio` entra a `TABLAS_NEGOCIO` (Gate, condición 8).

**Contrato IPC y tipos** (Gate, condición 6):
- Canales:
  - `cobros:aplicarDescuento`, con input `descuentoInputSchema`;
  - `cobros:quitarDescuento`, con input `quitarDescuentoInputSchema`.
- `descuentoInputSchema`:
  - `servicioRealizadoId`;
  - `aplicaA`, de `z.enum(["servicio","productos"])`;
  - `modo`, de `z.enum(["porcentaje","monto"])`;
  - `valor`;
  - `motivo`, de `z.enum(["primera_visita","promocion","cortesia","otro"])`;
  - `motivoDetalle?`.
- `quitarDescuentoInputSchema`: `descuentoId` y `motivo?`.
- Sin `pin`, por BR-008.
- `cierreCitaInputSchema` gana:
  - `descuentos`: hasta dos, uno por base, con el mismo shape sin `servicioRealizadoId`;
  - `servicioCatalogoId?` (FR-007).
- `EstadoCuentaCita` y `DetalleServicioRealizado` ganan `precioBruto`, `descuentoServicio`,
  `totalProductos`, `descuentoProductos`, `totalNeto` y `descuentos[]` (`id`, `aplicaA`, `modo`,
  `valor`, `monto`, `motivo`, `motivoDetalle`).
- `precio` sigue siendo el precio **bruto**; el neto va en su propio campo.
- Un solo cálculo, `calcularDescuento({ modo, valor, base })`, en `shared/`. Lo usan la vista
  previa del cierre y `cobros.ts` (Gate, condición 5).

**Carpeta del servicio al cambiarlo en el cierre** (Gate, condición 7):
- La carpeta que `abrirCierre` creó con el nombre del servicio anterior **no se renombra**.
  `archivos.ruta_fisica` es absoluta y renombrarla dejaría comprobantes huérfanos. El nombre viejo
  solo es cosmético.
- El dueño de `servicio_catalogo_id` es `cerrarCita` (`serviciosRealizados.ts`), dentro de su
  transacción. Escribe en el servicio realizado y en la cita.

## 11. Authorization
Ver BR-008. No pide PIN; la bitácora es el control.

## 12. UX Requirements
- El control de descuento es compacto: un segmento `%` / `$`, el valor con selección completa al
  enfocar y sin cero precargado (regla de inputs numéricos), y los chips de motivo.
- Si no hay valor, no ocupa más de una línea.
- En la cita cerrada, el descuento se ve en el desglose del estado de cuenta, al estilo del detalle
  de cita, con su acción de cambiar o quitar al lado. Nada de tablas con íconos.
- El selector de servicio del cierre usa el selector buscable con lupa.

## 13. Non-Functional Requirements
- Toda operación de descuento es atómica: la fila, la caché y el estatus de pago van en una
  transacción.
- Redondeo único: BR-007 del cobro.

## 14. Integrations
Ninguna externa.

## 15. Constraints
- Repositorio público: nada de datos de clientas en notas ni en evidencia.
- La migración corre sola en la máquina de la cabina y es irreversible.

## 16. Assumptions
- A-001. Cada servicio cerrado tiene un solo descuento manual por base. Si en el futuro se
  necesitan varios, la Parte B trae la acumulación (§21.3).
- A-002. Los "Productos vendidos" del cierre son los únicos productos con dinero en el ticket.

## 17. Open Questions
- **Q-001. RESUELTA (2026-11-06):** sin PIN. Carlos respondió: "si. Que no pida nip." Ver BR-008.
- **Q-002.** ¿Se diseña la venta de mostrador (sin cita) junto con la Parte B?

## 18. Acceptance Criteria
- **AC-001.** Cierre de $1,000 con 15 % en el servicio: total $850, pago de $850, estatus
  "pagado", sin filas de pago extra y corte de efectivo +$850.
- **AC-002.** Servicio de $800 con 10 % y productos de $200 con $50 de descuento: total $870
  (720 + 150). Corregido el 2026-11-06: la primera versión decía $670, un error de suma del spec
  que la prueba encontró.
- **AC-003.** Cita cerrada de $1,000 con $850 cobrados ("parcial"): al aplicar 15 % queda "pagado"
  con saldo $0, los pagos no cambian y el corte no cambia.
- **AC-004.** Cita cerrada de $1,000 con $1,000 cobrados: el 15 % se rechaza (BR-005).
- **AC-005.** Quitar el descuento de AC-003 la regresa a "parcial", con $150 de saldo. La fila
  queda `cancelado` y hay bitácora.
- **AC-006.** Al cambiar el servicio en el cierre, el servicio realizado y la cita quedan con el
  servicio nuevo, y la fecha de mantenimiento usa la periodicidad del servicio nuevo.
- **AC-007.** Invariante: para todo servicio,
  `descuento_servicio = Σ monto aplicado con aplica_a='servicio'`, y lo mismo para productos. La
  consulta devuelve 0 filas.
- **AC-008.** Las ventas de Resumen y Finanzas del periodo de AC-001 son $850. "Descuentos
  otorgados" es $150 con motivo "Primera visita".
- **AC-009.** `grep` muestra que nadie fuera de `cobros.ts` escribe `descuentos_servicio` ni
  `descuento_servicio` / `descuento_productos`.

## 19. Success
- Las citas de primera visita dejan de aparecer como adeudo una vez corregidas.
- Los adeudos que quedan son reales.

## 20. Decisiones del dueño (por escrito, chat del 2026-11-05 y 2026-11-06)
Gate, condición 9:

1. **El descuento del servicio y el de los productos son distintos:** "que sea diferente el
   descuento del servicio y los productos".
2. **Porcentaje o monto:** "que pueda ser por un monto o que sea un porcentaje".
3. **Motivo con botones rápidos:** se eligió la opción "Sí, con botones rápidos".
4. **La misma acción sirve sobre citas ya cerradas,** para corregir el historial: "que el botón que
   ya estás diseñando para aplicar descuento se pueda usar una vez cerrada la cita… adelante".
5. **Sin sugerencia automática de primera visita:** "No".
6. **Se puede cambiar el servicio antes de cerrar:** "también debería de poder modificar el
   servicio a realizar antes de cerrar la cita".
7. **Sin PIN** para aplicar, cambiar o quitar un descuento: "si. Que no pida nip." Se acepta el
   riesgo del Gate.

## 21. References
- [Spec del cobro](spec-modulo-cobro-2026-11-04.md): §21.2, §21.3, FR-008 y el addendum del
  2026-11-05.
- [Gate del cobro](gate-001-modulo-cobro-2026-11-04.md): condición 5 (dueño único de `pagos`).
- [Investigación de gift cards y cupones](investigacion-giftcards-cupones-2026-11-04.md): los
  descuentos reducen la venta y nunca son pago.

## Addendum 2026-11-06 — reglas heredadas de la auditoría (DES-M1, DES-B5)
Según la [auditoría](auditoria-descuentos-2026-11-06.md):

- **DES-M1 — regla para el Gate de CIT-C1** (cancelar un servicio cerrado completo). Hoy ningún
  camino llega aquí: `inventario.ts` rechaza cancelar ventas ligadas a un servicio. Cuando se
  diseñe CIT-C1, su Gate hereda esta regla junto con COB-B4 y COB-M1:
  - la reversa de un servicio cerrado pasa por `cobros.ts`;
  - cancela con motivo los descuentos vigentes (`cancelarDescuentoEnTx`), o recalcula
    `total_productos` y vuelve a aplicarlos;
  - todo eso ocurre antes de `recalcularEstatusEnTx` y en la misma transacción.

  Un descuento de productos nunca puede quedar vigente sobre ventas que ya no existen.
- **DES-B5 — decisión declarada.** `citas.duracion_min` no cambia cuando se cambia el servicio en el
  cierre: la cita ya ocurrió y la duración solo afecta cómo se veía en la agenda. No se corrige.
- **BR-007, efecto en meses pasados (Decisión A de la auditoría).** Corregir una cita vieja baja las
  ventas del mes de esa cita; el corte no se mueve. Se le explicó a Carlos el 2026-11-06 y él
  confirma por escrito en el PR.
