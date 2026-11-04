# Feature Specification — Módulo de cobro v2 (2026-11-04)

## 1. Feature

**Name:** Módulo de cobro v2: varios métodos, abonos, anticipos, cancelación de pagos, productos en
el ticket, estatus derivado. Parte B: tarjetas de regalo y cupones.
**Status:** Draft. Partes A y B listas para Gate 001. La Parte C (motor de segmentos y campañas)
queda fuera de este diseño y tendrá su propia especificación (§21.6).
**Owner:** Carlos (único aprobador, PROJECT.md).

## 2. Problem

### Current Situation
El cierre de cita captura **un** método y **un** monto, más una etiqueta manual de estatus
(pagado / parcial / pendiente / cancelado) que no se deriva del dinero
(`CierreCitaModal.tsx:68-72,218-245`, `shared/schemas.ts:142-158`). `cerrarCita` inserta como
máximo un pago (`serviciosRealizados.ts:241-251`). Un servicio cerrado no se reabre, y no existe
ningún IPC de pagos (`ipc/index.ts`, `preload.ts`). El corte suma los pagos `cobrado` creados
después del corte anterior (`corte.ts:27-47`), sin liga pago↔corte. La tabla `pagos` ya admite N
filas por servicio y un estatus `cancelado` que nadie escribe (`schema.ts:281-299`).

### Problem
Confirmado por la auditoría de dinero y por la prueba manual de Carlos:
- La usuaria tiene que **elegir** si el pago es parcial o completo, en vez de decir cuánto pagó
  (DIN-A2). La etiqueta contradice el saldo calculado: Cuentas por cobrar usa la etiqueta, y
  Citas/Clientas usan la aritmética.
- **Un solo método por cobro** (DIN-A1). Un pago mixto se registra mal y el corte queda mal
  desglosado.
- **Un pago parcial queda pendiente para siempre**: no hay abonos (DIN-A1).
- **Un pago mal capturado no se corrige** (DIN-A4).
- **Los productos vendidos no generan ingreso** (DIN-A5): la salida se valúa a costo y el precio de
  venta no se usa. Si la usuaria no suma el producto a mano, el corte no cuadra.
- **No hay anticipos.** La cabina aparta citas con pago previo y **vende tarjetas de regalo fuera
  del sistema**.
- Pago fechado con la fecha de la cita (DIN-M1, CIT-M3): "Cobrado hoy" omite cierres tardíos o
  adelantados.
- "Cancelado" en el cierre hace lo contrario de cancelar (CIT-A2, DIN-B3).

### Impact
Corte de caja que no cuadra, cartera falsa, deudas que no se pueden cobrar y dinero sin registro.
Es la superficie crítica "Dinero" de PROJECT.md, sujeta a CFF art. 30 (conservar con rastro, nunca
borrar).

## 3. Desired Outcome
Al cerrar una cita la usuaria ve el **total** (servicio + productos) y anota **cuánto pagó y con
qué**, en una o varias líneas. El sistema calcula si quedó pagado, parcial o pendiente.

Además puede:
- registrar abonos después, desde la cita;
- registrar anticipos antes de la cita;
- cancelar un pago mal capturado, con motivo y PIN.

El corte cuadra siempre, incluidas las correcciones de pagos ya cortados. Todo dinero que entra
queda registrado una sola vez.

## 4. Users and Roles

| Role | Need | Permissions / Constraints |
|---|---|---|
| Operadora (cosmetóloga, única usuaria) | Cobrar rápido y bien; corregir errores | App desbloqueada con el PIN único. Las acciones de dinero sensibles piden PIN otra vez (§11). |
| Dueño (Carlos) | Que el corte y los reportes sean confiables | Aprueba el diseño; sin rol en la app (no hay roles, PROJECT.md `roles`). |

## 5. Scope

### In Scope (Parte A)
- Captura de **N líneas de pago** (método, monto) en el cierre.
- **Abonos** a un servicio cerrado con saldo, desde el detalle de la cita (Decisión de Carlos).
- **Anticipos**: pagos ligados a una cita activa, aplicados automáticamente al cerrarla.
- **Cancelación de un pago** con motivo y PIN; nunca se borra. Ajuste negativo en el siguiente
  corte si el pago ya se había cortado.
- **Productos vendidos en el ticket**: precio unitario de venta, editable, con default
  `productos.precio_venta`. Total del ticket = precio del servicio + Σ productos.
- **Estatus de pago derivado** en el servidor, a partir de total y pagos. Se quita la etiqueta
  manual y la opción "cancelado" (Decisión A).
- **Fecha del pago = día del cobro** (Decisión D).
- **Liga pago↔corte** (resuelve el núcleo de DIN-M4) para que los ajustes sean exactos.
- Saldos de cita, de clienta, de cartera y de cuentas por cobrar, todos con **una sola definición**.

### Out of Scope
- **Cancelar un servicio cerrado completo** (CIT-C1: revertir salidas, cita y mantenimiento). Va al
  Gate 001 de R2b/DIN-A4/DAT-A2. Esta parte A aporta solo una pieza: la cancelación de pagos.
- Saldo a favor y pagos por encima del total (Decisión de Carlos: no por ahora).
- Abonos desde el perfil de la clienta o desde Corte (Carlos eligió solo el detalle de la cita).
- Costo de insumos en el margen (DIN-A3), dinero en centavos enteros (DIN-M3; aquí solo se
  redondea), facturación CFDI.
- **Parte C — motor de segmentos, niveles y campañas** (§21.6): asignación automática de cupones
  por perfil de clienta, niveles, lealtad y sugerencia de servicios poco tomados. Lleva su propio
  spec y su propio Gate; la Parte B deja los ganchos.

## 6. Functional Requirements

**FR-001 — Cobro con N líneas.** El cierre acepta 0..N líneas `{metodoPago, monto>0}`, con métodos
de `config.metodosPago`, y las registra todas en la transacción del cierre.
*Why:* DIN-A1, cobro mixto.

**FR-002 — Total del ticket.** El total es `precio del servicio + Σ(cantidad × precio unitario de
venta)` de los productos vendidos. El precio unitario se guarda por línea vendida.
*Why:* DIN-A5.

**FR-003 — Estatus derivado.** El servidor calcula `estatusPago` cada vez que cambia el total o los
pagos de un servicio:
- `pagado` si cobrado ≥ total − 0.005;
- `parcial` si 0 < cobrado < total;
- `pendiente` si cobrado = 0.

El cliente ya no lo envía. Las filas viejas con `cancelado` se conservan y siguen excluidas.
*Why:* DIN-A2, Decisión A.

**FR-004 — Abono.** Un servicio cerrado con saldo > 0 acepta 1..N líneas de pago nuevas, cada una
con fecha de hoy, hasta cubrir el saldo y sin excederlo.
*Why:* "un parcial queda pendiente para siempre".

**FR-005 — Anticipo.** Una cita `programada` o `confirmada` acepta pagos ligados a la cita. Al
cerrarla, esos pagos se ligan a su servicio en la misma transacción y cuentan como ya pagado. El
cierre muestra el anticipo y pide solo el resto.
*Why:* Decisión de Carlos.

**FR-006 — Cancelar pago.** Cualquier pago `cobrado` se puede cancelar con motivo obligatorio y
PIN. Queda `cancelado` con fecha, motivo y usuaria; nunca se borra. El estatus del servicio se
recalcula.
*Why:* DIN-A4, Decisión de Carlos.

**FR-007 — Corte con ajustes.**
- Al registrar un corte, cada pago cobrado sin corte queda ligado a él.
- El corte pendiente muestra dos cosas: los cobros sin corte, y como **ajuste negativo** los pagos
  ya cortados que se cancelaron después, todavía sin corte de cancelación.
- Un pago creado y cancelado dentro del mismo periodo simplemente no aparece.

*Why:* corte que cuadra; DIN-M4.

**FR-008 — Una sola definición de saldo.**
- Saldo de servicio = total − Σ pagos cobrados ligados a ese servicio.
- Saldo de clienta = Σ saldos de sus servicios cerrados no cancelados. **No** resta anticipos de
  citas aún sin cerrar, ni dinero que no pertenezca a un servicio (por ejemplo, la venta de una
  tarjeta de regalo en la Parte B).
- Cartera y cuentas por cobrar usan la misma definición.

*Why:* DIN-A2. Hoy `clientes.ts:34-37` resta *todos* los pagos de la clienta; con anticipos y
tarjetas de regalo ese saldo saldría falso.

**FR-009 — Cita con anticipo.**
- Una cita con anticipo cobrado **no se puede eliminar** (CIT-M1 ya rechaza citas con pagos;
  ahora se añade el caso del anticipo).
- Al cancelarla o marcarla "No asistió", la app avisa que hay un anticipo por resolver: devolverlo
  (cancelar el pago) o reagendar.
- Reactivarla conserva el anticipo.

*Why:* que no quede dinero huérfano.

## 7. Business Rules

- **BR-001** — Un pago nunca se borra. Solo pasa de `cobrado` a `cancelado`, con motivo, fecha y
  usuaria (CFF art. 30).
- **BR-002** — Σ pagos cobrados de un servicio ≤ total + 0.005. No hay saldo a favor.
- **BR-003** — Todo pago tiene `monto > 0`, un método de la configuración y `fecha` = día en que se
  registró.
- **BR-004** — Un pago pertenece a lo sumo a un servicio, o a una cita activa (anticipo), o a la
  venta de una tarjeta de regalo; nunca a ambos de forma distinta. Al cerrar, los anticipos se ligan
  al servicio de esa cita. Un pago con `concepto = venta_tarjeta` **no** cuenta para el saldo de
  ninguna clienta ni para ventas de servicios.
- **BR-010** — El corte cuenta solo pagos con `fuente = dinero`. Un canje con tarjeta de regalo,
  una cortesía o un cupón nunca suman al corte. Los canjes se muestran como línea informativa.
- **BR-011** — Al registrar un corte, todo pago de dinero sin corte queda ligado a él. Si ya estaba
  cancelado (creado y cancelado dentro del mismo periodo), queda con `corte_id` y
  `corte_cancelacion_id` en ese mismo corte: neto cero y trazable. **Nunca** se arrastra como ajuste
  al corte siguiente. Esto lo encontró la prueba del modelo (§21.4).
- **BR-005** — El estatus de pago de un servicio lo escribe solo el servidor, derivado (FR-003).
- **BR-006** — Cada pago se cuenta en exactamente un corte como ingreso. Si se cancela después de
  cortado, se cuenta en exactamente un corte posterior como ajuste negativo.
- **BR-007** — Montos redondeados a 2 decimales en el servidor antes de guardar y de comparar (DIN-M3,
  mínimo).
- **BR-008** — Registrar un abono o anticipo exige el mismo candado que el cierre: comprobante del
  servicio subido, o PIN (Decisión de Carlos). Para el anticipo, el comprobante se sube al
  registrarlo o se usa el PIN.
- **BR-009** — Cancelar un pago siempre exige PIN y motivo.

## 8. Primary Flow (cierre)
1. La usuaria abre "Cerrar cita". Se crea o recupera el borrador, como hoy.
2. Captura insumos y productos vendidos. Cada producto vendido muestra su precio unitario, que se
   puede editar.
3. La app muestra: total, anticipos ya pagados y **por cobrar**.
4. La usuaria agrega líneas de pago (método + monto). La primera viene precargada con el método
   vacío y el monto = por cobrar. "Agregar otro método" divide el pago.
5. La app muestra en vivo el estatus que quedará: "Pagado completo", "Queda debiendo $X" o "Sin pago".
6. Confirma, con comprobante o PIN como hoy. En una sola transacción el servidor:
   - registra las salidas, con precio de venta en las de tipo venta;
   - inserta los pagos con fecha de hoy;
   - liga los anticipos al servicio;
   - calcula y guarda el total de productos y el estatus;
   - cierra el servicio, pone la cita en `asistio` y escribe la bitácora.

**Expected Result:** el corte pendiente muestra cada línea en su método; el detalle de la cita
muestra pagos, total y saldo; cartera y cuentas por cobrar coinciden con ese saldo.

## 9. Alternative and Error Flows
- **Paga de más.** Si Σ líneas > por cobrar, el servidor lo rechaza con "El pago excede lo que se
  debe ($X)". La UI ya lo marca antes de enviar.
- **Abono.** En la cita cerrada con saldo aparece "Registrar pago". Se registran 1..N líneas hasta
  el saldo y el estatus se recalcula.
- **Pago equivocado.** En la lista de pagos de la cita, "Cancelar pago" pide motivo y PIN. Si ese
  pago ya estaba en un corte, el próximo corte muestra "Ajustes: −$X (método)".
- **Anticipo y la cita se cancela.** Antes de cancelar, la app avisa del anticipo de $X y ofrece
  devolverlo (cancelar el pago, con PIN) o dejarlo para reagendar.
- **Doble clic o dos cierres simultáneos.** El chequeo "ya cerrada" se hace dentro de la transacción
  (DIN-M2): el segundo falla sin efectos.
- **Cancelar un pago ya cancelado.** Se rechaza.
- **Falla a mitad.** Todo va en una transacción de better-sqlite3 sin `await` dentro: o queda todo,
  o no queda nada.

## 10. Data

### Existing Data
`pagos`, `servicios_realizados` (`precio`, `estatus_pago`), `salidas_inventario`
(`tipo_salida = venta`, `valor` a costo), `cortes` (`desglose_por_metodo_json`, `total`),
`productos.precio_venta`, `configuracion.metodosPago`.

### New Data Requirements (propuesta técnica; ver §22)
- `pagos.concepto` ∈ {servicio, anticipo, venta_tarjeta} y `pagos.fuente` ∈ {dinero,
  tarjeta_regalo}: distinguen **dinero que entra** de **saldo ya cobrado que se aplica**. El corte
  suma solo `fuente = dinero` (§21, prueba de modelo).
- `pagos.tarjeta_regalo_id`: FK a `tarjetas_regalo` (venta de la tarjeta o canje con ella).
- `pagos.servicio_realizado_id` sigue siendo nullable. Hoy ya lo es, y se usa así en anticipos aún
  sin aplicar y en ventas de tarjeta.
- `pagos.cita_id`: anticipo, FK a `citas`.
- `pagos.corte_id`: FK a `cortes`; corte que lo contó como ingreso.
- `pagos.cancelado_at`, `pagos.motivo_cancelacion`, `pagos.cancelado_por` (FK `usuarios`) y
  `pagos.corte_cancelacion_id` (FK `cortes`; corte que contó el ajuste negativo).
- `salidas_inventario.precio_unitario_venta` (REAL, null salvo en salidas tipo venta).
- `servicios_realizados.total_productos` (REAL NOT NULL DEFAULT 0).
- `cortes.ajustes_json` + `cortes.total_ajustes`: el corte guarda ingresos y ajustes por separado.
- Índices: `pagos(servicio_realizado_id)`, `pagos(cita_id)`, `pagos(corte_id)`.

### Sensitive Data
Montos y métodos de pago de clientas identificables. Es dinero (superficie crítica); no es PII
nueva. El motivo de cancelación es texto libre: la UI pide no poner datos personales, y la bitácora
guarda solo el código de la clienta.

## 11. Authorization

| Action | Allowed | Conditions |
|---|---|---|
| Cerrar con pagos | Operadora con app desbloqueada | Comprobante del servicio o PIN (como hoy) |
| Registrar abono | Operadora | Comprobante del servicio o PIN (BR-008) |
| Registrar anticipo | Operadora | Comprobante subido al anticipo o PIN (BR-008) |
| Cancelar pago | Operadora | **Siempre** PIN + motivo (BR-009); se verifica en el main, no en el renderer |
| Registrar corte | Operadora | Como hoy |

El PIN se verifica en el main (`verificarPin`, `auth.ts`). SEG-A1 sigue abierto: el candado de la
app vive en el renderer. Este diseño no lo empeora; toda acción de dinero nueva verifica en el main.

## 12. UX Requirements
- El cierre deja de mostrar los botones de estatus. Muestra: total, anticipos, por cobrar, las
  líneas de pago y una leyenda derivada.
- Los montos usan `MoneyInput` con la regla de captura numérica del proyecto: seleccionar todo al
  enfocar y quitar ceros a la izquierda.
- En el detalle de una cita cerrada:
  - lista de pagos con fecha, método, monto y estado (cancelado se ve tachado, con su motivo);
  - total, cobrado y saldo;
  - "Registrar pago" si hay saldo;
  - "Cancelar pago" en cada pago cobrado.
- En el detalle de una cita activa: "Registrar anticipo" y la lista de anticipos.
- En Corte: "Cobros" por método, "Ajustes por cancelaciones" por método (negativos) y "Total neto".
- Errores en español claro; confirmaciones con `useConfirm` y "Volver".

## 13. Non-Functional Requirements
- **Reliability:** cada operación de dinero es una transacción síncrona; los chequeos de estado van
  dentro (DIN-M2).
- **Auditability:** bitácora para `pago_registrado`, `pago_cancelado` (con motivo) y
  `anticipo_aplicado`, con código de servicio o cita y nunca nombres. Cada pago lleva su corte.
- **Performance:** volumen de una cabina, decenas de pagos al día; los índices bastan.
- **Compatibilidad de datos:** la migración conserva todo el historial; los pagos y servicios viejos
  siguen calculando igual o mejor (§22.3).

## 14. Integrations

| System | Purpose | Direction | Failure Impact |
|---|---|---|---|
| Inventario (`registrarSalidaEnTx`) | Salidas de venta con precio | main → BD | La transacción del cierre revierte todo |
| Reportes (`reportesFinanzas`, `reportesResumen`, `clientes.ts`, `citas.ts`, `dashboard.ts`) | Ventas, cobrado, cartera, saldos | lectura | Si alguno no migra a la definición única, los números divergen. El censo post-fix lo verifica. |
| Respaldos / migración (`db/index.ts`) | Migración 0004 en la máquina de la clienta | arranque | Copia previa a migrar (DAT-A4); falla cerrada |

## 15. Constraints
- Electron + better-sqlite3, transacciones síncronas; drizzle-kit para migraciones, que corren
  solas al arrancar.
- Repo público: sin PII en notas.
- Una sola instalación y una sola operadora; sin roles.
- CFF art. 30: dinero con rastro, nunca borrado.
- Simplicidad (regla 7 de Atlas).

## 16. Assumptions
- **A-001** — Los métodos de pago siguen siendo strings configurables. Ninguno se vuelve
  "especial", salvo los de la Parte B.
- **A-002** — El comprobante sigue a nivel servicio (DIN-B2 sigue en backlog). El anticipo, al no
  tener servicio, sube su comprobante a la carpeta de la clienta o usa PIN.
- **A-003** — No existen hoy filas `pagos.estatus = cancelado`. Verificable con la consulta de la
  auditoría DIN.
- **A-004** — Los cortes existentes no se reabren ni se recalculan. La migración solo liga cada pago
  viejo al corte que lo contó, por ventana de `created_at`.

## 17. Open Questions
- **Q-001** (no bloquea la arquitectura; sí bloquea el **lanzamiento** de la Parte B) — Confirmar
  con la contadora de la cabina:
  - el régimen fiscal;
  - cómo factura la venta de tarjetas (CFDI de anticipo o del servicio);
  - si la vigencia de 12 meses es adecuada;
  - si se puede declarar "no reembolsable en efectivo".

  Ver la investigación, §21.5.

## 18. Acceptance Criteria
- **AC-001.** Dado un servicio de $800 y un producto vendido de 1 × $200, cuando se cierra con
  Efectivo $500 + Tarjeta $300, entonces el total es $1,000, el estatus es `parcial` con saldo $200,
  y el corte pendiente muestra Efectivo $500 y Tarjeta $300.
- **AC-002.** Dado el AC-001, cuando se registra un abono de Transferencia $200, entonces el estatus
  es `pagado`, el saldo $0, cuentas por cobrar ya no lo lista y el pago lleva la fecha de hoy.
- **AC-003.** Dado un pago de Tarjeta $300 ya incluido en un corte, cuando se cancela con motivo y
  PIN, entonces el pago queda `cancelado` (no borrado), el corte viejo no cambia, el siguiente
  corte muestra "Ajuste Tarjeta −$300" y el estatus vuelve a `parcial`.
- **AC-004.** Dada una cita con anticipo de $400, cuando se cierra un servicio de $1,000, entonces
  el cierre pide $600, el anticipo queda ligado al servicio y el corte cuenta los $400 solo una vez:
  en el corte del día del anticipo.
- **AC-005.** Dado un cierre con líneas que suman más que lo que se debe, el servidor lo rechaza y
  no queda nada escrito.
- **AC-006.** Dada una clienta con un anticipo de $400 en una cita futura y un servicio cerrado con
  saldo $200, entonces su saldo es $200, no −$200.
- **AC-007.** Después de migrar una BD con pagos y cortes previos, cada pago viejo queda ligado al
  corte que lo contó, el corte pendiente es igual al de antes de migrar, y el estatus de cada
  servicio cerrado coincide con su aritmética.
- **AC-008.** No existe ninguna ruta que borre un pago (grep `delete(pagos)` fuera de
  `reinicio.ts`).
- **AC-009 (S1–S7, prueba de §21.4).** Dada la secuencia de 3 días de §21.4, entonces:
  - los cortes son K1 = $1,400, K2 = $1,400 y K3 = $0, con Tarjeta −$200 de ajuste y Efectivo
    +$200;
  - el dinero neto cortado es $2,800, igual a las ventas netas ($2,800);
  - el saldo pendiente de las tarjetas vendidas es $0 y no hay pagos de dinero sin corte.
- **AC-010.** Dada una tarjeta vendida y reembolsada el mismo día antes del corte, cuando se
  registran ese corte y el siguiente, entonces ninguno de los dos muestra ese monto.
- **AC-011.** Dada una tarjeta con saldo $400, un canje de $500 se rechaza. Si está vencida, se
  rechaza salvo que se extienda con PIN.
- **AC-012.** Dado un cupón personal con requisito "≥ 5 citas asistidas", cuando una clienta con 3
  citas intenta usarlo, entonces se rechaza con el requisito que le falta.
- **AC-013.** Dados dos cupones acumulables (10 % y $100) sobre un servicio de $500, entonces el
  descuento total es $150 ($50 + $100, en el orden de §21.3), nunca deja el total por debajo de $0,
  y el corte no los ve.

## 19. Success
El corte del día coincide con el dinero real. Cartera, saldo de la clienta y detalle de la cita dan
el mismo número. La operadora no vuelve a elegir "parcial" o "pagado".

## 20. References
- Auditorías: [auditoria-dinero-2026-11-03.md](auditoria-dinero-2026-11-03.md) (DIN-A1, A2, A4, A5,
  M1, M2, M3, M4, B2, B3) y [auditoria-citas-2026-11-03.md](auditoria-citas-2026-11-03.md) (CIT-A2,
  C1, M3).
- Decisiones de Carlos: plan [plan-accion-2026-11-03.md](plan-accion-2026-11-03.md), Phase 1, ítems
  2 y 2b, y §23 de este documento.
- Código: `electron/services/{serviciosRealizados,pagos,corte,clientes,citas,dashboard,reportesFinanzas,reportesResumen}.ts`,
  `src/pages/agenda/CierreCitaModal.tsx`, `src/pages/Corte.tsx`, `electron/db/schema.ts`.

## 21. Parte B — Tarjetas de regalo y cupones

Base: [investigacion-giftcards-cupones-2026-11-04.md](investigacion-giftcards-cupones-2026-11-04.md)
(fuentes y escenarios S1–S7) y una **prueba del modelo** ejecutable,
[prototipo-cobro-tarjetas-2026-11-04.sql](prototipo-cobro-tarjetas-2026-11-04.sql), que se corre con
`sqlite3 :memory: < archivo` (§21.4). Cuatro modelos comparados: N ingenuo, A tarjetas con libro de
movimientos, B monedero por clienta y C cupones como descuento. Se elige **A + C**:
- N cuenta doble el dinero en el corte;
- B obliga a asignar la tarjeta (que es al portador) a una clienta, y solo gana cuando llegue la
  lealtad.

### 21.1 Tarjetas de regalo
- `tarjetas_regalo(id, codigo UNIQUE, tipo venta|cortesia, monto_inicial, vigencia_hasta,
  estatus activa|agotada|vencida|cancelada, compradora_cliente_id NULL,
  beneficiaria_cliente_id NULL, servicio_sugerido_id NULL, nota, created_at)`.
- `movimientos_tarjeta(id, tarjeta_id, tipo emision|alta_migracion|redencion|reverso_redencion|cancelacion|ajuste|extension,
  monto con signo, pago_id NULL, descuento_id NULL, motivo, usuario_id, created_at)`.
  **Saldo = Σ movimientos**, el mismo patrón de libro que ya usa inventario (`movimientos`). Nunca
  negativo; se verifica dentro de la transacción del canje.
- **Venta:** tarjeta + movimiento `emision` + pago `{concepto venta_tarjeta, fuente dinero}`. Entra
  al corte como línea propia "Venta de tarjetas de regalo".
- **Cortesía:** tarjeta `tipo cortesia` + `emision`, **sin** pago. Al canjearla se convierte en un
  **descuento** del ticket, no en un pago: lo que se regaló no es ingreso.
- **Canje** de tarjeta vendida: pago `{concepto servicio, fuente tarjeta_regalo}` + movimiento
  `redencion`. Cuenta para el saldo del servicio y no para el corte.
- **Cancelar un canje** (cancelar ese pago, con PIN): movimiento `reverso_redencion`; el saldo
  vuelve a la tarjeta.
- **Cancelar la venta de una tarjeta**: solo si nunca se usó. Con PIN y motivo, pago `cancelado` +
  movimiento `cancelacion`.
- **Vigencia por defecto: 12 meses** (decisión de Carlos), extensible con PIN (movimiento
  `extension`, monto 0).
- **Tarjetas ya vendidas fuera del sistema:** alta con su saldo actual como `alta_migracion`,
  **sin** pago. Ese dinero ya entró; si se creara un pago, aparecería en el corte de hoy.
- **Código:** generado por la app, sin caracteres ambiguos, con dígito verificador, único.
- **Comprobante:** la app genera un comprobante imprimible o compartible (imagen o PDF) con código,
  monto, vigencia y condiciones (decisión de Carlos; LFPC arts. 7 y 12).
- **Nombres:** el método bancario pasa a llamarse "Tarjeta débito/crédito" en la configuración por
  defecto, para no confundirlo con "Tarjeta de regalo". "Tarjeta de regalo" **no** es un método de
  la lista configurable: la UI lo ofrece solo al capturar un código válido.

### 21.2 Cupones
- `cupones(id, codigo UNIQUE NULL, nombre, tipo porcentaje|monto, valor,
  aplica_a todo|servicios|servicio_especifico|productos, servicio_id NULL, vigencia_desde,
  vigencia_hasta, usos_max NULL, usos_max_por_clienta NULL, monto_minimo NULL,
  acumulable BOOL, prioridad INT, alcance publico|personal, requisitos_json NULL, condiciones TEXT,
  activo, created_at)`.
  - `alcance = personal`: solo lo pueden usar las clientas asignadas en
    `cupones_asignados(cupon_id, cliente_id, origen manual|campana, asignado_at, usado_at NULL)`.
    Hoy se asigna a mano; la Parte C lo hará automático.
  - `requisitos_json` es validado con zod: `minCitasAsistidas`, `minTicketPromedio`,
    `minProductosComprados`, `servicioCatalogoIds`. El servidor lo evalúa **al aplicar** el cupón,
    con métricas calculadas de los datos de la Parte A. Así un cupón puede ser "difícil de
    alcanzar".
- **Promocionar servicios poco tomados:** `aplica_a = servicio_especifico`. La Parte C sugerirá
  cuáles.
- **Uso** = fila en `descuentos_servicio(id, servicio_realizado_id, tipo cupon|cortesia|manual,
  cupon_id NULL, tarjeta_regalo_id NULL, base, monto, orden, estatus aplicado|cancelado,
  usuario_id, created_at)`. Un descuento **reduce la venta y nunca es un pago**; el corte no lo ve.
- **Crear cortesías y cupones no pide PIN** (decisión de Carlos). Queda registrado en la bitácora
  con quién y cuándo. Riesgo aceptado en §23.

### 21.3 Acumulación (decisión de Carlos: "que se acumulen, por niveles")
1. Se aplican en orden de `prioridad` (empate: el de mayor valor primero).
2. Un cupón **no acumulable** solo se aplica si es el único descuento del ticket.
3. Cada **porcentaje** se calcula sobre el **remanente** de la base a la que aplica (servicio,
   productos o todo) después de los descuentos anteriores. Los **montos fijos** se restan del
   remanente.
4. El descuento total nunca supera el total del ticket.
5. Cortesía (tarjeta de cortesía) = descuento por monto fijo, acumulable, con la prioridad más baja.

El servidor recalcula todo dentro de la transacción del cierre y guarda `base`, `monto` y `orden`
por descuento, para que el ticket sea reproducible.

### 21.4 Prueba del modelo (ejecutada 2026-11-04, SQLite en el scratchpad)
Secuencia de 3 días con cortes:
- **Día 1:** venta de T1 $1,000 en efectivo y anticipo de $400.
- **Día 2:**
  - facial de $800 = $600 de T1 + $200 con tarjeta bancaria;
  - cortesía de $300 sobre $500, resto en efectivo;
  - cupón del 20 % sobre $500, resto por transferencia;
  - cierre de la cita con anticipo ($800 + producto de $200).
- **Día 3:**
  - se cancela el pago de tarjeta bancaria de $200, ya cortado, y se registra en efectivo;
  - canje de los $400 restantes de T1;
  - venta y reembolso de T3 el mismo día.

| Corte | Cobros | Ajustes | Neto |
|---|---|---|---|
| K1 | Efectivo 1,400 | — | 1,400 |
| K2 | Efectivo 800 · Tarjeta 200 · Transferencia 400 | — | 1,400 |
| K3 | Efectivo 200 | Tarjeta −200 | 0 |

Cuadre: dinero neto cortado **2,800 = ventas netas 2,800**. Saldo pendiente de tarjetas vendidas 0,
por cobrar 0, pagos de dinero sin corte 0. Todos los servicios quedan `pagado` por derivación. El
**modelo ingenuo** (tarjeta, cortesía y cupón como "métodos") habría dado **4,200**.
**Defecto encontrado y corregido en el diseño:** con la regla "ligar todo el dinero sin corte", el
reembolso del mismo día aparecía en un corte K4 vacío como **Efectivo −1,000**. Con BR-011, K4 queda
vacío. Ambas variantes se ejecutaron.

### 21.5 Marco legal y fiscal (a confirmar con la contadora, Q-001)
- **LFPC:** no tiene una regla específica para tarjetas de regalo (texto vigente, reforma DOF
  12-12-2025). Sí aplican:
  - art. 7: informar y respetar plazos y condiciones;
  - art. 12: comprobante de cada operación;
  - arts. 48 y 50: toda promoción o cupón anuncia condiciones y plazo; sin plazo se presume
    indefinido.

  Por eso la vigencia es obligatoria en tarjetas y cupones, y va en el comprobante. Una vigencia
  muy corta podría impugnarse como cláusula abusiva (art. 10).
- **Fiscal (persona física):** el ingreso y el IVA se causan **al cobrar**, es decir, al vender la
  tarjeta (LIVA arts. 1-B y 17, LISR arts. 102 y 113-E). El canje no vuelve a causar impuesto.
- **CFDI:** pago recibido con tarjeta de regalo = forma de pago "01 Efectivo" (Guía de llenado del
  CFDI 4.0). La venta de una tarjeta de monto encaja como CFDI de anticipo. La facturación desde la
  app sigue fuera de alcance.
- **Cortesías:** los servicios gratuitos están exentos de IVA (LIVA art. 15 fr. III). Es coherente
  con tratarlas como descuento.

### 21.6 Parte C — fuera de este diseño (gancho explícito)
Motor de segmentos y campañas pedido por Carlos:
- cupones por niveles, difíciles de alcanzar según citas, ticket promedio y productos comprados;
- el cupón según el tipo de clienta ("llegarle donde le agrada");
- nivelar la demanda de servicios poco tomados.

Requiere los datos limpios de la Parte A y los cupones de la Parte B. Llevará su propio spec y su
propio Gate. Los ganchos que deja la Parte B son: `alcance = personal`,
`cupones_asignados.origen = campana`, `requisitos_json`, `aplica_a = servicio_especifico`, y el
libro `movimientos_tarjeta`, que se puede generalizar a puntos de lealtad.

## 22. Proposed Technical Design (Parte A)

### 22.1 Módulo dueño
Nuevo `electron/services/cobros.ts`: **único** dueño de la escritura en `pagos` y del cálculo de
saldos. Funciones:
- `registrarPagosEnTx(tx, {servicioId | citaId, lineas[]})`;
- `cancelarPago(id, motivo, pin)`;
- `recalcularEstatusEnTx(tx, servicioId)`;
- `saldoServicios(ids)` y `saldoPorCliente(ids)`;
- `aplicarAnticiposEnTx(tx, citaId, servicioId)`.

`pagos.ts` se absorbe en este módulo. `cerrarCita` lo llama dentro de su transacción. `corte.ts`
conserva el corte, ahora con ligas. Los cinco consumidores de saldo (`citas.ts`, `clientes.ts`,
`serviciosRealizados.obtenerDetalle`, `reportesFinanzas` cartera y cuentas por cobrar,
`dashboard.ts`) pasan a usar las funciones de saldo de `cobros.ts`.

### 22.2 IPC nuevos
- `cobros:registrarAbono(servicioId, lineas, pin?)`
- `cobros:registrarAnticipo(citaId, lineas, pin?)`
- `cobros:cancelarPago(pagoId, motivo, pin)`
- `cobros:listarPagos(servicioId | citaId)`

Cada uno se valida con zod en `shared/schemas.ts`. `cierreCitaInputSchema` cambia:
- `metodoPago`, `monto` y `estatusPago` salen;
- entra `pagos: [{metodoPago, monto}]`;
- `productosVendidos` gana `precioUnitario`.

### 22.3 Migración 0004 (con cabecera auditada, flujo `/atlas migracion`)
1. `ALTER TABLE` con las columnas de §10 (todas nullable o con default; ninguna reescritura de
   tabla) e índices.
2. **Liga histórica pago→corte:** para cada corte en orden de `created_at`, los pagos `cobrado` con
   `created_at` en (corte anterior, este corte] reciben `corte_id`. Es el mismo criterio que usa
   `resumenPendiente` hoy, así que el corte pendiente no cambia (AC-007).
3. **Recalcular `estatus_pago`** de servicios cerrados no `cancelado` desde la aritmética,
   `total_productos = 0` en filas viejas. Esto **corrige** etiquetas viejas incoherentes (DIN-A2).
   Cambia lo que muestran cartera y cuentas por cobrar históricos, y es intencional.
4. Antes de migrar, `respaldarAntesDeMigrar` copia la BD (DAT-A4).

### 22.4 Corte
`resumenPendiente`, solo `fuente = dinero`:
- `cobros` = pagos `cobrado` con `corte_id IS NULL`, por método, con una línea propia para
  `venta_tarjeta`;
- `ajustes` = pagos `cancelado` con `corte_id NOT NULL` y `corte_cancelacion_id IS NULL`;
- informativo, sin sumar: canjes con tarjeta de regalo del periodo.

`registrarCorte` corre en **una transacción** (BR-011):
1. inserta el corte;
2. ajustes → `corte_cancelacion_id = K`;
3. todo pago de dinero con `corte_id IS NULL` → `corte_id = K`, y si está `cancelado` también
   `corte_cancelacion_id = K`;
4. rechaza un corte vacío (DIN-M4).

### 22.6 Parte B — piezas técnicas
- Nuevo `electron/services/tarjetasRegalo.ts` (emitir, vender, canjear en tx, cancelar, extender,
  dar de alta las existentes, comprobante) y `electron/services/cupones.ts` (CRUD, asignar, evaluar
  requisitos y acumulación). `cobros.ts` sigue siendo el **único** que escribe en `pagos`: las
  tarjetas lo llaman para la venta y el canje.
- Se agregan a la migración 0004 (o a una 0005 separada si el Gate lo prefiere):
  `tarjetas_regalo`, `movimientos_tarjeta`, `cupones`, `cupones_asignados`,
  `descuentos_servicio`, y las columnas `pagos.concepto`, `pagos.fuente`,
  `pagos.tarjeta_regalo_id`. Backfill: los pagos existentes quedan con `concepto = servicio` y
  `fuente = dinero`.
- `cuenta_servicio`: total = precio + total_productos − Σ descuentos aplicados.
- UI:
  - módulo "Tarjetas y cupones" (listado, saldo, vigencia, emitir o vender, comprobante);
  - en el cierre: "Aplicar tarjeta de regalo" y "Aplicar cupón" con validación en vivo;
  - en Corte: línea de venta de tarjetas y línea informativa de canjes;
  - en Reportes: saldo pendiente de tarjetas, cortesías vigentes y descuentos por cupón.

### 22.5 Reversibilidad
Las columnas nuevas son aditivas; la app anterior las ignora. El recálculo de `estatus_pago` no se
revierte solo, pero el respaldo previo a migrar lo cubre. **Reversible con costo.**

## 23. Decisiones del dueño (por escrito, 2026-11-04)
- **A.** Quitar "cancelado" del cierre.
- **D.** Se pueden cerrar citas futuras; el pago lleva la fecha del día del cobro.
- **Abonos:** solo desde el detalle de la cita.
- **Productos vendidos:** se suman al total con precio de venta editable.
- **Corregir un pago:** cancelar con motivo + PIN; nunca borrar; ajuste en el siguiente corte.
- **Anticipos:** sí. Saldo a favor: no por ahora.
- **Control de abono y anticipo:** igual que el cierre (comprobante o PIN).
- **Tarjetas de regalo y cupones:** investigar, probar y diseñar su venta o regalo, control,
  creación y pago (Parte B).
- **C.** La reversa completa de un servicio cerrado queda fuera; va al Gate de R2b.
- **Tarjetas de regalo:** vigencia por defecto de **12 meses**, extensible con PIN; la app genera el
  comprobante.
- **Crear cortesías y cupones: sin PIN.** **Riesgo aceptado por el dueño:** con la app abierta,
  cualquiera puede regalar valor. Mitigación: bitácora con fecha y monto, y reporte de cortesías y
  descuentos.
- **Cupones: acumulables, "por niveles", segmentados por perfil de clienta y para promover
  servicios poco tomados.** La Parte B entrega cupones acumulables con requisitos y alcance personal.
  La segmentación y asignación automática es la Parte C (propuesta de secuencia A → B → C, comunicada
  a Carlos el 2026-11-04).
