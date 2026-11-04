# Gate 001 — Architecture Gate: Módulo de cobro v2, Partes A y B (2026-11-04)

**Fecha:** 2026-11-04 · **Diseño evaluado:** [spec-modulo-cobro-2026-11-04.md](spec-modulo-cobro-2026-11-04.md)
(§22 diseño técnico de la Parte A; §21 y §22.6 Parte B; §23 decisiones escritas), con la prueba
ejecutable [prototipo-cobro-tarjetas-2026-11-04.sql](prototipo-cobro-tarjetas-2026-11-04.sql) y la
investigación [investigacion-giftcards-cupones-2026-11-04.md](investigacion-giftcards-cupones-2026-11-04.md)
· **Repo:** rama `atlas/fase1` @ `5180996` · **Disparadores:** módulo nuevo (`cobros.ts`,
`tarjetasRegalo.ts`, `cupones.ts`), cambio de propiedad de datos (`pagos`), cambio de BD
significativo (migración con backfill y recálculo que corre sola en la máquina de la clienta),
cambio de autorización (PIN en cancelaciones; cortesías sin PIN), API interna nueva (`cobros:*`),
difícil de revertir (recálculo de `estatus_pago` sobre datos reales).
**Método:** solo lectura sobre el código citado, las migraciones `0000`–`0003`, el migrador de
drizzle y el generador de drizzle-kit instalados; dos pruebas en SQLite en memoria con datos
sintéticos. No se abrió ninguna base real ni respaldo. Sin PII.

```text
Architecture Gate
Decision:
PASS WITH CONDITIONS
Summary:
La Parte A resuelve exactamente los hallazgos que la motivan (DIN-A1, A2, A4, A5, M1, M2, M4, B3;
CIT-A2, M3) con el modelo que el esquema ya insinuaba: `pagos` como libro 1:N, estatus derivado en
el servidor, cancelación por estado y liga pago↔corte. El diseño sigue las convenciones del
proyecto (funciones `...EnTx(tx)`, zod en `shared/schemas.ts`, bitácora dentro de la transacción,
migraciones aditivas generadas por drizzle-kit) y el modelo "fuente = dinero / aplicación de saldo"
es el único que cuadra: la prueba del modelo se reejecutó aquí y reproduce §21.4 (K1 1,400; K2
1,400; K3 0; dinero neto 2,800 = ventas netas 2,800; el modelo ingenuo da 4,200). Verificado en el
código instalado: el migrador síncrono de drizzle corre todas las migraciones pendientes dentro de
un solo BEGIN (todo o nada) y drizzle-kit 0.31 emite `ALTER TABLE ... ADD ... REFERENCES` para una
columna FK nueva, así que la promesa "sin reescritura de tabla" es alcanzable, con una salvedad
que se vuelve condición (cualquier CHECK o cambio de nulidad sobre una tabla existente la
recrea). Lo que impide un PASS limpio son huecos verificables, no de estructura: (1) el backfill
histórico de `pagos.corte_id` con ventana `(anterior, este]` NO reproduce el corte actual para
pagos insertados en el mismo segundo después de un corte — hoy ese dinero está en el limbo que
DIN-M4 ya describió; la migración lo atribuiría en silencio a un corte cuyo `total` congelado no
lo incluye (probado en SQLite: `MISMATCH`), y el diseño afirma lo contrario; (2) la propiedad de
`pagos` queda ambigua en la liga del corte (`registrarCorte` escribe `corte_id`, pero `cobros.ts`
es "único dueño de la escritura"); (3) el diseño nombra cinco consumidores de saldo, pero hay doce
lecturas de `pagos` en ocho archivos y nueve sitios de "ventas = Σ precio" en siete que también
cambian de definición con `total_productos` y descuentos; (4) en la Parte B, `pagos.cliente_id` es
NOT NULL (`schema.ts:283-285`) y la tarjeta de regalo es al portador: vender a alguien que no es
clienta no tiene fila válida en `pagos` y el diseño no lo decide; (5) dos acciones de la Parte B
que crean valor canjeable sin dinero (`alta_migracion`, `ajuste`) no tienen regla de autorización
escrita, y la mitigación del riesgo aceptado para cortesías sin PIN está sobreestimada:
`usuarioActualId()` devuelve siempre el usuario por defecto (`usuarios.ts:27-29`), así que la
bitácora registra cuándo y cuánto, nunca quién; y con SEG-A1 abierto el IPC es alcanzable desde la
pantalla de bloqueo, no solo "con la app abierta". Partes A y B son un solo diseño coherente, pero
deben ser DOS migraciones y DOS releases: la A cambia datos reales y debe validarse sola en la
única instalación; la B está condicionada a Q-001 (contadora) y a tres decisiones que faltan.
Blocking Issues:
Ninguno a nivel de arquitectura. Las condiciones 9 a 13 son decisiones por escrito y reglas que
faltan en la Parte B; la implementación de la Parte B no debe empezar hasta cumplirlas (regla del
gate: decisiones del dueño ausentes se piden, no se suponen). Ninguna obliga a cambiar la
estructura de la Parte A.
Conditions:
1. Dos migraciones y dos releases. `0004` lleva solo la Parte A: columnas de §10 incluidas
   `pagos.concepto` y `pagos.fuente` (con DEFAULT 'servicio' / 'dinero'), índices, backfill
   de `corte_id` y recálculo de `estatus_pago`. `0005` lleva `tarjetas_regalo`,
   `movimientos_tarjeta`, `cupones`, `cupones_asignados`, `descuentos_servicio` y
   `pagos.tarjeta_regalo_id` (su FK exige que la tabla exista). El release de `0005` sale después
   de que `APPLIED-MIGRATIONS.md` tenga la fila verificada de `0004`.
   Verificar: `grep -c "tarjetas_regalo\|cupones\|descuentos_servicio" drizzle/0004_*.sql` → 0;
   `drizzle/meta/_journal.json` con idx 4 y 5 separados; fila `0004` con "Verified" lleno antes
   del tag de la Parte B.
2. Sin recreación de tablas en `0004`. Nada de CHECK ni cambios de nulidad sobre `pagos`,
   `servicios_realizados`, `salidas_inventario` o `cortes` (los enums viven en zod y en el
   servicio). Si drizzle-kit genera una recreación, se detiene y se reevalúa con evidencia propia.
   Verificar: `grep -c "__new_\|DROP TABLE\|CREATE TABLE \`pagos\`" drizzle/0004_*.sql` → 0.
3. Backfill reconciliado antes de publicar, sobre un respaldo real abierto fuera del repo y de
   solo lectura (regla de PROJECT.md; se reportan solo conteos): (a) radiografía DIN-M4
   `SELECT COUNT(*) FROM pagos p JOIN cortes c ON p.created_at = c.created_at`; (b) A-003
   `SELECT COUNT(*) FROM pagos WHERE estatus = 'cancelado'` → 0; (c) sobre una COPIA con `0004`
   aplicada, por cada corte `ABS(cortes.total − Σ pagos ligados) < 0.005` y "corte pendiente
   antes = corte pendiente después". Si (a) > 0, la cabecera de la migración declara la regla
   elegida para esas filas (ligarlas y perderlas, o dejarlas con `corte_id NULL` y que aparezcan
   en el corte pendiente) y §22.3 deja de afirmar "el corte pendiente no cambia" para ese caso.
   Verificar: nota `.notes/evidencia-migracion-0004-<fecha>.md` con los tres conteos y la regla.
4. Cabecera de `0004` con la plantilla de Atlas (`templates/migration-header.sql`): el recálculo
   de `estatus_pago` como DECISIÓN DELIBERADA, y rastro del cambio: la misma migración inserta en
   `bitacora` una fila por servicio cuya etiqueta cambió (`accion = 'estatus_pago_recalculado'`,
   `entidad_id` = id del servicio, `detalle` = "viejo → nuevo", sin nombres).
   Verificar: `SELECT COUNT(*) FROM bitacora WHERE accion = 'estatus_pago_recalculado'` = conteo
   de la consulta DIN-A2 extendida a las tres etiquetas, en la copia de la condición 3.
5. Un solo escritor de `pagos`, incluida la liga del corte: `corte.ts` llama a una función de
   `cobros.ts` (p. ej. `ligarPagosACorteEnTx(tx, corteId)`) y nunca hace `update(pagos)` por su
   cuenta; `tarjetasRegalo.ts` nunca inserta en `pagos`. Dirección de dependencias escrita en el
   spec: `tarjetasRegalo → cobros` y `cupones → cobros` o sin dependencia; `cobros` no importa
   ninguno de los dos (la reversa de un canje la orquesta `tarjetasRegalo` llamando a
   `cobros.cancelarPagoEnTx`).
   Verificar: `grep -rn "insert(pagos)\|update(pagos)" electron/services | grep -v cobros.ts`
   → 0 líneas; `grep -n "tarjetasRegalo\|cupones" electron/services/cobros.ts` → 0.
6. Una sola definición de saldo y de total, aplicada en TODOS los lectores, no en cinco. Lectores
   de `pagos` hoy: `citas.ts:88,426`, `clientes.ts:36`, `dashboard.ts:15`, `reportesResumen.ts:102,243`,
   `reportesFinanzas.ts:51,89,147`, `serviciosRealizados.ts:335`, `corte.ts:33`. Lectores de
   "ventas = Σ precio" que cambian con `total_productos` y descuentos: `reportesResumen.ts:60,218`,
   `reportesServiciosDetalle.ts:84`, `reportesClientesDetalle.ts:74`, `dashboard.ts:34`,
   `clientes.ts:43`, `citas.ts:34,422`, `reportesFinanzas.ts:99,163`. Todos pasan por
   `cobros.saldoServicios` / `saldoPorCliente` / `totalServicios` (o el nombre que se elija), y
   toda suma de dinero recibido filtra `fuente = 'dinero'`.
   Verificar: `grep -rn "from(pagos)" electron/services | grep -v "cobros.ts\|corte.ts"` → 0;
   `grep -rn "\.precio ?? 0" electron/services | grep -v cobros.ts` → 0.
7. PROJECT.md `sensitive_globs` agrega `electron/services/cobros.ts`, `tarjetasRegalo.ts` y
   `cupones.ts` en el mismo PR que los crea (hoy el guard solo mira `pagos.ts`, que desaparece).
   Lo edita el dueño: el contrato es superficie crítica.
   Verificar: `grep -c "cobros.ts\|tarjetasRegalo.ts\|cupones.ts" PROJECT.md` → 3.
8. Corte en una transacción con `resumenPendiente` síncrono dentro de ella, en el orden de §22.4
   (ajustes → ligar → rechazar vacío), y `cortes.ajustes_json` / `total_ajustes` con redondeo a
   2 decimales antes de guardar (BR-007). Prueba manual con BD de prueba reproduciendo §21.4.
   Verificar: AC-009 y AC-010 pasan en `npm run dev` con BD de prueba; evidencia con los tres
   totales (1,400 / 1,400 / 0) en la nota de evidencia de la Parte A.
9. (Parte B, decisión del dueño) Venta de tarjeta a quien no es clienta: `pagos.cliente_id` es
   NOT NULL. Opción (a) exigir clienta registrada (sin cambio de esquema; captura datos de una
   persona que quizá nunca vuelva, PII nueva); opción (b) `cliente_id` nullable solo para
   `concepto = venta_tarjeta`, lo que recrea `pagos` en SQLite y necesita su propia radiografía
   en `0005`. Se escribe en §23 antes de empezar la Parte B.
   Verificar: línea en §23; si (b), `grep -c "__new_pagos" drizzle/0005_*.sql` = 1 y la cabecera
   lo declara.
10. (Parte B) Tabla de autorización §11 completa para la Parte B: canje, cancelar canje, cancelar
    venta, extender vigencia, `alta_migracion`, `ajuste`, crear / editar / desactivar cupón,
    asignar cupón personal, crear cortesía — cada una con PIN o sin PIN. `alta_migracion` y
    `ajuste` crean valor canjeable sin dinero y NO están cubiertas por la aceptación escrita (que
    nombra solo cortesías y cupones). El riesgo aceptado de §23 se reescribe con la frontera real:
    con SEG-A1 abierto el IPC es alcanzable desde la pantalla de bloqueo; la bitácora registra
    cuándo y cuánto, no quién (un solo usuario por defecto, `usuarios.ts:27-29`); la mitigación
    verificable es el reporte de cortesías y descuentos emitidos por periodo con monto.
    Verificar: §11 tiene una fila por acción listada; `grep -n "SEG-A1" .notes/spec-modulo-cobro-2026-11-04.md`
    aparece en §23; el reporte existe como IPC (`grep -n "cortesias\|descuentos" shared/ipc-contract.ts`).
11. (Parte B) Acumulación determinista: regla de desempate cuando `prioridad` empata ("mayor
    valor" no es comparable entre porcentaje y monto: definir por monto calculado sobre el
    remanente, y luego por `created_at`/`id`), y regla de reparto cuando un descuento `todo`
    precede a uno con base `servicios` o `productos` (prorrateo o prioridad de base). Un AC por
    regla, además de AC-013.
    Verificar: §21.3 contiene ambas reglas; AC nuevos listados en §18.
12. (Parte B) `requisitos_json`: o se define cada métrica (ventana temporal, si cuentan servicios
    con `estatus_pago = cancelado`, qué es "producto comprado" — líneas o piezas —, si el ticket
    promedio usa el total con descuentos) con un AC por métrica, o `requisitos_json` sale de la
    Parte B y lo define el Gate de la Parte C. Hoy solo `minCitasAsistidas` tiene AC (AC-012).
    Verificar: §21.2 con las cuatro definiciones y cuatro AC, o `grep -c requisitos_json shared/schemas.ts` → 0.
13. (Parte B) Estatus de `tarjetas_regalo`: o se deriva al leer (saldo del libro, `vigencia_hasta`,
    bandera de cancelación) o se listan todas las transiciones, incluida quién pone `vencida` (no
    hay job en esta app) y la reactivación en `reverso_redencion`. Una sola fuente de verdad.
    Verificar: §21.1 dice cuál; una función `estatusTarjeta(...)` en `tarjetasRegalo.ts` si es derivado.
14. Anticipos sin aplicar visibles: lista o línea en Corte o Reportes de
    `concepto = 'anticipo' AND servicio_realizado_id IS NULL AND estatus = 'cobrado'` (la consulta
    de cuadre del prototipo ya la tiene), para que el anticipo de una cita cancelada y nunca
    resuelta no se vuelva dinero invisible.
    Verificar: canal IPC o campo en `CorteResumenPendiente` que lo expone; consulta sobre BD de prueba.
15. Comprobante de tarjeta de regalo: nombrar el mecanismo (`webContents.printToPDF` de Electron
    no agrega dependencia). Una dependencia npm nueva es disparador de Gate por sí misma.
    Verificar: `git diff main -- package.json` del PR de la Parte B sin dependencia nueva en
    `dependencies`, o el spec la nombra y justifica.
16. Q-001 resuelto por escrito antes del release de la Parte B (ya lo dice el spec; aquí queda
    como condición verificable). Si la contadora exige reembolso en efectivo de tarjetas con uso,
    la Parte B vuelve al gate solo por ese flujo.
    Verificar: §17 marcado resuelto con fecha y respuesta por punto; fila `0005` en
    `APPLIED-MIGRATIONS.md` posterior a esa fecha.
Key Risks:
- Recálculo de `estatus_pago` en la máquina de la clienta: la cartera y cuentas por cobrar
  históricas cambian de golpe (es lo intencional), y lo único que lo revierte es el respaldo
  previo a migrar (DAT-A4), perdiendo lo capturado después. La condición 4 deja el rastro.
- Pagos del mismo segundo que un corte (DIN-M4): hoy perdidos, tras el backfill ocultos. La
  condición 3 lo mide en la única instalación antes de publicar.
- Omisión del filtro `fuente = 'dinero'` en un solo lector (cobranza, métodos de pago, "Cobrado
  hoy") vuelve a contar un canje como dinero. La condición 6 lo hace verificable por grep.
- `pagos.fecha` cambia de semántica a mitad del historial (fecha de cita en filas viejas, día del
  cobro en nuevas): "Cobranza recibida" por rango mezcla ambas; aceptado abajo, pero se documenta
  en la cabecera de `0004`.
- SEG-A1 sigue abierto: toda la autorización nueva vive en el main (correcto), pero el candado de
  la app no; el riesgo aceptado para cortesías es mayor de lo que dice §23 (condición 10).
- Cupones como mini motor de reglas (`prioridad`, `acumulable`, `alcance`, `requisitos_json`,
  `aplica_a` × 4): es la pieza más fácil de implementar mal y la más difícil de probar; las
  condiciones 11 y 12 la acotan o la difieren.
Accepted Trade-offs:
- `estatus_pago` como columna derivada y almacenada (recalculada por el servidor) en lugar de
  calculada al leer: mantiene los filtros existentes de reportes y el índice implícito; el riesgo
  de desincronía se cierra con un solo escritor (`recalcularEstatusEnTx`).
- Dinero en REAL con redondeo a 2 decimales en escritura (DIN-M3 mínimo); migrar a centavos
  queda en la anti-lista de la auditoría hasta que la consulta `ROUND(total,2) != total` dé > 0.
- `cortes` guarda snapshots JSON (`desglose`, `ajustes`) además de las ligas: redundante, pero es
  el patrón vigente y hace al corte legible sin recomputar.
- Filas viejas de `pagos` conservan `fecha` = fecha de la cita; no se reescriben (A-004 extendida).
- Un solo PIN y un solo usuario: la bitácora no atribuye personas; es el modelo de roles de
  PROJECT.md, no un defecto de este diseño.
- Tarjeta de regalo "al portador" con `compradora`/`beneficiaria` opcionales (modelo A sobre B):
  simplicidad hoy; el monedero por clienta llega, si llega, con la lealtad (Parte C).
- Cortesías y cupones sin PIN: decisión escrita del dueño; el gate exige solo que la aceptación
  describa la frontera real (condición 10).
Recommended Next Step:
Implementar la Parte A sola: generar `0004` con `npm run db:generate`, cumplir 2, 4 y 5, correr
la reconciliación de la condición 3 sobre un respaldo real, y pasar `/evidencia` sobre la
superficie "Dinero" y "Migraciones" antes de integrar. En paralelo, el dueño escribe en §23 las
decisiones 9 y 10 y resuelve Q-001; con eso y las condiciones 11–13 cerradas, la Parte B entra
como `0005` sin volver a este gate, salvo que Q-001 traiga reembolsos en efectivo.
```

## Análisis de soporte

### Entradas requeridas

| Entrada | Estado | Dónde |
|---|---|---|
| Problem statement | Presente | spec §2, respaldado por auditorías DIN y CIT |
| Feature specification | Presente | spec §3–§19 (Parte A completa; Parte B con FR implícitos en §21) |
| Arquitectura existente | Inspeccionada | `schema.ts`, `drizzle/0000–0003`, `db/index.ts`, servicios de dinero, `ipc/index.ts`, `preload.ts`, `shared/*`, `CierreCitaModal.tsx`, `Corte.tsx`, migrador de drizzle y generador de drizzle-kit instalados |
| Diseño técnico | Presente | §22 (A), §21 + §22.6 (B); prueba ejecutable |
| Restricciones | Presentes | §15; PROJECT.md (apply_method automático, CFF art. 30, repo público) |
| Decisiones del dueño por escrito | Presentes para A; incompletas para B | §23; faltan las de las condiciones 9, 10, 12 y 13 |

Las decisiones que faltan afectan solo a la Parte B; evaluar la Parte A no las necesita. Por eso
el verdicto no es FAIL por entradas insuficientes, y por eso se pide separar releases: así la
Parte B no obliga a reevaluar la A cuando lleguen.

### Las diez dimensiones

1. **Alineación con el problema.** Parte A: uno a uno con DIN-A1/A2/A4/A5/M1/M2/M4/B3 y
   CIT-A2/M3; nada sobra. Parte B: tarjetas de regalo responden a "vende tarjetas fuera del
   sistema" (§2) y a la decisión escrita; cupones responden a la decisión "acumulables, por
   niveles", pero `requisitos_json` y `cupones_asignados.origen = campana` son semántica de la
   Parte C adelantada sin su spec (condición 12). No es un problema distinto, es uno más amplio
   de lo que las decisiones alcanzan a definir.
2. **Encaje con el sistema.** Sigue `registrarSalidaEnTx(tx, …)` y `registrarPago(db | tx)`
   (tipo estructural `DbLike`), `registrarAccion(tx, …)`, zod en `shared/schemas.ts`, canales
   IPC por namespace, migraciones aditivas como `0003`. `movimientos_tarjeta` replica el libro
   `movimientos` de inventario. La liga `pagos.corte_id` es la que propuso DIN-M4. Un desajuste:
   `pagos.ts` está en `sensitive_globs` y desaparece; `cobros.ts` no está (condición 7).
3. **Fronteras.** `cobros.ts` dueño de `pagos` y de saldos: claro en intención, ambiguo en la
   liga del corte (§22.4 hace que `registrarCorte` actualice `pagos`) y en la reversa de canjes
   (quién escribe `reverso_redencion` cuando `cobros.cancelarPago` cancela un pago con
   `fuente = tarjeta_regalo`). `descuentos_servicio` no tiene dueño nombrado (cortesía la escribe
   el flujo de tarjetas; cupón el de cupones). Condición 5. No es FAIL porque la responsabilidad
   es decidible sin cambiar la estructura y el spec ya apunta a la respuesta.
4. **Acoplamiento.** `tarjetasRegalo → cobros` es la dirección correcta; el ciclo potencial
   `cobros → tarjetasRegalo` en la cancelación se evita si la orquestación vive arriba. `dashboard`
   ya depende de `corte.resumenPendiente`; sin cambios. Los reportes dependen de `cobros` para
   saldo y total: dependencia nueva pero explícita y mínima (es el objetivo de FR-008).
5. **Modelo de datos.** Entidades correctas; `base`, `monto`, `orden` por descuento hacen el
   ticket reproducible. Restricciones: BR-002 (Σ ≤ total), BR-004 (pertenencia excluyente),
   saldo de tarjeta ≥ 0 y `monto > 0` son de aplicación, no de esquema; aceptable en SQLite si se
   verifican dentro de la transacción, que es lo que dice el diseño. Dos fuentes de verdad a
   vigilar: `tarjetas_regalo.estatus` vs el libro (condición 13) y `cupones_asignados.usado_at` vs
   `COUNT(descuentos_servicio)`. Migración: atómica (un BEGIN en el migrador), con respaldo previo
   (DAT-A4), columnas con DEFAULT o nullable; la columna FK nueva se emite como `ALTER ... ADD ...
   REFERENCES` (verificado en el combinador de drizzle-kit: una FK de una sola columna recién
   agregada no dispara `recreate_table`). El backfill es el punto débil: ver la prueba abajo.
   `pagos.cliente_id NOT NULL` contra tarjeta al portador: condición 9.
6. **Seguridad.** Modelo explícito para la Parte A (§11): PIN verificado en el main con el
   precedente de `respaldos.ts:227,247`, `reinicio.ts:49,85` y `serviciosRealizados.ts:154`.
   Parte B: explícito para extender, cancelar venta y cancelar canje (PIN) y para crear cortesías
   y cupones (sin PIN, aceptado); ausente para `alta_migracion` y `ajuste`, que son las dos
   acciones que más valor pueden crear sin dinero. La aceptación escrita describe mal la
   frontera (SEG-A1) y la mitigación ("con quién") no existe con un usuario por defecto. Condición
   10. Datos sensibles: ninguno nuevo; `motivo_cancelacion`, `tarjetas_regalo.nota` y
   `cupones.condiciones` son texto libre y deben tratarse como `clientes.notas` (sin PII en
   bitácora ni en exportaciones).
7. **Escalabilidad.** Volumen de una cabina; índices propuestos bastan. `saldoPorCliente` carga
   todos los pagos como hoy `clientes.ts:34-38`. Evaluar `requisitos_json` por canje es unas
   consultas por cliente; irrelevante a esta escala.
8. **Modos de falla.** Transacciones síncronas sin `await`; "ya cerrada" dentro de la
   transacción (DIN-M2); corte vacío rechazado; canje con saldo insuficiente rechazado dentro de
   la transacción; cita con anticipo no se elimina. La migración falla cerrada (la app no abre,
   datos intactos, respaldo previo). Hueco: anticipo de cita cancelada que nunca se resuelve
   (condición 14). Riesgo de omisión del filtro `fuente` (condición 6).
9. **Reversibilidad.** Esquema: aditivo, la app anterior lo ignora — fácil. Backfill de
   `corte_id`: aditivo. Recálculo de `estatus_pago`: destruye la etiqueta manual; solo el respaldo
   previo la recupera — **reversible con costo**, coincide con §22.5. La condición 4 pide el
   rastro que la evidencia exige para un cambio de ese costo. Separar releases reduce el costo de
   revertir la B sin tocar la A.
10. **Complejidad.** Parte A: la más pequeña que cumple; `ajustes_json` es redundante con las
    ligas pero coherente con el patrón vigente. Parte B tarjetas: proporcional (dos tablas, el
    patrón de libro ya existe). Parte B cupones: más de lo que las decisiones definen hoy;
    `requisitos_json` es un gancho prematuro porque trae un motor de evaluación sin métricas
    definidas (condición 12). Los otros ganchos (`alcance`, `origen = campana`,
    `servicio_especifico`) son columnas con enum: baratos y sin lógica, aceptables.

### Pruebas ejecutadas (SQLite en memoria, datos sintéticos)

**Prueba del modelo (§21.4).** `sqlite3 :memory: < prototipo-cobro-tarjetas-2026-11-04.sql`:
K1 = Efectivo 1,400; K2 = Efectivo 800 + Tarjeta 200 + Transferencia 400; K3 = Efectivo 200 y
ajuste Tarjeta −200 (neto 0). Dinero neto cortado 2,800 = ventas netas 2,800; pasivo de tarjetas
vendidas 0; por cobrar 0; pagos de dinero sin corte 0; modelo ingenuo 4,200. BR-006, BR-010 y
BR-011 se cumplen en la secuencia S1–S7, incluido el reembolso del mismo día (P8 queda con
`corte_id` y `corte_cancelacion_id` en K3 y no aparece en ningún corte).

**Backfill histórico (§22.3) a granularidad de segundo.** Tabla con la forma real
(`created_at` entero en segundos, `cortes.total` congelado). Secuencia: pago A (t=100) → corte K1
en t=100 (total 100) → pago B en t=100 después de K1 → pago C (t=200) → corte K2 en t=300 (query
actual `created_at > 100`: total 200, B excluido) → pago D (t=400). Hoy: K1 = 100, K2 = 200,
pendiente = 70; B (50) no está en ningún corte ni lo estará (DIN-M4). Backfill `(anterior, este]`
tal como lo describe §22.3: A→K1, **B→K1**, C→K2, D→NULL. Reconciliación: K1 congelado 100 vs
ligado 150 → `MISMATCH`; K2 OK; pendiente 70 (igual). Conclusión: el criterio sí reproduce el
corte pendiente, pero no "liga cada pago viejo al corte que lo contó" (AC-007) cuando hay filas
en el mismo segundo; la radiografía DIN-M4 (`JOIN ON p.created_at = c.created_at`) las detecta
antes de publicar. Si en la instalación real da 0, el backfill es exacto y la condición 3 se
cierra con tres conteos.

### Respuestas a las preguntas del solicitante

- **¿Un gate o dos?** Un diseño, un gate, dos migraciones y dos releases (condición 1). Motivo:
  la A cambia datos reales y debe poder validarse y, si hace falta, revertirse sola; la B depende
  de Q-001 y de decisiones pendientes; y `tarjeta_regalo_id` necesita su tabla en la misma
  migración, lo que fija el corte natural.
- **Propiedad de `pagos` y saldo único.** Correcto en intención; enforzable por grep (condición
  5 y 6). Hoy los cinco cálculos divergen de verdad: `clientes.ts:34-38` y `citas.ts:425-428`
  restan todos los pagos de la clienta (con anticipos y ventas de tarjeta darían saldo negativo
  falso); `reportesFinanzas.ts:80,138` filtra por etiqueta; `citas.ts:34` y
  `serviciosRealizados.ts:341` usan aritmética por servicio. El diseño los unifica, pero
  nombra cinco y hay más (ver condición 6).
- **BR-006/010/011 y backfill.** Reglas correctas y probadas; backfill con el caso límite
  descrito arriba.
- **Recálculo de `estatus_pago`.** Cambio intencional, bien declarado en §22.3; lo que falta es
  el rastro (condición 4) y el conteo previo en la instalación real (DIN-A2 del anexo de la
  auditoría).
- **Autorización.** Suficiente para A; para B faltan dos filas y la aceptación describe mal la
  frontera (condición 10). No es FAIL porque el modelo existe y está escrito; es incompleto, no
  ausente.
- **Acumulación y `requisitos_json`.** §21.3 es determinista salvo el desempate y el reparto de
  un descuento `todo` entre bases (condición 11); `requisitos_json` no es reproducible sin
  definir sus métricas (condición 12). Persistir `base`, `monto` y `orden` sí hace reproducible
  el ticket una vez aplicado.
- **Complejidad y gancho de la Parte C.** Parte A y tarjetas: proporcionales. Cupones: el gancho
  `requisitos_json` es prematuro; el resto de ganchos son enums baratos.
- **Decisiones faltantes que forzarían otra vuelta.** Solo para la Parte B: comprador no clienta
  (9), PIN en `alta_migracion`/`ajuste` (10), métricas de requisitos o diferirlos (12), regla de
  estatus de tarjeta (13), y Q-001 si trae reembolso en efectivo (16). Ninguna para la Parte A.

### Lo que este verdicto no cubre

CIT-C1 (reversa completa de un servicio cerrado) y DAT-A2 (cancelación de salidas) siguen fuera y
tienen su propio gate, como dice §5. DIN-A3 (costo de insumos) no está en este diseño. La Parte C
no se evaluó.
