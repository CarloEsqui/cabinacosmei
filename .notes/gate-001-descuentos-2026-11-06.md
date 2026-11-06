# Gate 001 — Architecture Gate: Descuentos en el cierre y cambio de servicio (2026-11-06)

**Fecha:** 2026-11-06 · **Diseño evaluado:** [spec-descuentos-2026-11-06.md](spec-descuentos-2026-11-06.md)
(§6 requisitos, §7 reglas, §10 datos y migración, §11 autorización, §13 no funcionales, §16
supuestos, §17 preguntas abiertas) · **Repo:** rama `atlas/ficha-clinica` @ `565d24f` (main con la
Parte A del cobro integrada: `drizzle/0005_cobro_v2.sql` committeado, journal hasta idx 5; no existe
ninguna `0006` en ninguna rama local ni remota; `electron/services/fichasClinicas.ts` aún no existe).
El working tree trae cambios de UI sin relación con este diseño (selector buscable, inputs
numéricos), entre ellos `src/components/ui/select-buscable.tsx` sin versionar, que FR-007 reutiliza.
**Disparadores:** cambio de BD significativo (tabla `descuentos_servicio` y dos columnas en
`servicios_realizados`, migración `0006` que corre sola en la máquina de la clienta), superficie
Dinero (total del ticket, saldos, estatus de pago, ventas en Resumen/Finanzas/Dashboard/Clientes/
Servicios), cambio de una API interna importante (`cobros.totalTicket`, `saldoServicio`,
`ingresoDelServicio` cambian de firma), renumeración de migraciones planeadas y no publicadas
(ficha clínica `0006`→`0007`, Parte B `0007`→`0008`), y difícil de revertir en datos (descuentos
aplicados sobre citas históricas cambian ventas y estatus almacenados).
**Método:** solo lectura sobre `electron/services/{cobros,serviciosRealizados,citas,clientes,
dashboard,reportesResumen,reportesFinanzas,reportesClientesDetalle,reportesServiciosDetalle,
reinicio,folders,bitacora,inventario,exportarCsv,corte}.ts`, `electron/db/{schema,index}.ts`,
`electron/ipc/index.ts`, `shared/{schemas,types}.ts`, `src/pages/agenda/{CierreCitaModal,
CitaDetalleModal,PagosDeCita}.tsx`, `src/components/cobros/LineasPago.tsx`, `drizzle/0004`,
`drizzle/0005`, `drizzle/meta/_journal.json`, `scripts/seed-demo.mjs`, `APPLIED-MIGRATIONS.md`,
el spec y el Gate del cobro, la auditoría de la Parte A (COB-A1, COB-B4), el spec y el Gate de la
ficha clínica, PROJECT.md y la plantilla de cabecera de Atlas. No se abrió ninguna base real ni
respaldo. Sin PII.

```text
Architecture Gate
Decision:
PASS WITH CONDITIONS
Summary:
El diseño resuelve exactamente el problema de §2 (un descuento registrado como pago menor se lee
como adeudo e infla las ventas; el servicio equivocado se cierra con la receta y el precio
equivocados) con la pieza más pequeña que el sistema admite: una tabla `descuentos_servicio`
que la Parte B ya preveía (§21.2 del spec del cobro), dos columnas caché en `servicios_realizados`
con el mismo patrón que `total_productos` (0005), y la extensión del único escritor y de la única
definición de dinero que ya existen en `cobros.ts` (Gate del cobro, condiciones 5 y 6). Verifiqué
en código que la elección de la caché es correcta: los ocho lectores de dinero (`citas.ts:70`,
`dashboard.ts:20`, `reportesResumen.ts:52,210`, `reportesFinanzas.ts:75,122`,
`reportesClientesDetalle.ts:53`, `reportesServiciosDetalle.ts:29`, `serviciosRealizados.ts:244,
418-428`, `cobros.ts:105,291,542`) ya seleccionan `precio` y `total_productos` de la misma fila y
pasan por `totalTicket`/`saldoServicio`/`ingresoDelServicio`; exigir los dos campos nuevos en el
tipo de parámetro hace que `npm run typecheck` encuentre a cualquiera que los olvide, incluido el
tipo local de `citas.ts:27`. `recalcularEstatusEnTx` (`cobros.ts:290`) lee la fila completa, así
que la ruta post-cierre es insertar la fila, escribir la caché y recalcular, todo en una
transacción, sin tocar `pagos` ni el corte (`corte.ts` no lee `servicios_realizados`, BR-004 se
cumple por construcción). Las decisiones de negocio son sanas: un descuento no es pago, se cancela
y nunca se borra, BR-005 impide saldo a favor implícito, las citas viejas se corrigen a mano y
no por `UPDATE` en la migración (la app no distingue adeudo real de descuento implícito). Lo que
impide un PASS limpio son cuatro huecos, todos cerrables sin cambiar la estructura: (1) los CHECK
enumerados sobre `tipo`, `aplica_a`, `modo` y `motivo` contradicen la convención escrita del
proyecto (0004 y 0005, decisión 1: "los enums viven en zod y en el servicio, no en CHECK") y sí
pintan la Parte B en una esquina — un cupón con `aplica_a = 'todo'` (§21.2) o una fila sin motivo
manual obligarían a recrear la tabla en la máquina de la clienta; (2) FR-007 no dice quién
escribe `servicio_catalogo_id` ni qué pasa con la carpeta del servicio, que `abrirCierre` ya creó
con el nombre del servicio anterior (`serviciosRealizados.ts:128-130`) y que no debe renombrarse
porque `archivos.ruta_fisica` es absoluta; (3) el spec no nombra canales IPC, esquemas zod ni la
extensión de `EstadoCuentaCita`/`DetalleServicioRealizado` que el desglose de FR-003/FR-005
necesita; (4) `reinicio.ts` borra con las FK apagadas (`TABLAS_NEGOCIO`, línea 14-33) y la tabla
nueva tiene que estar en esa lista o quedan filas huérfanas que rompen el invariante AC-007.
Q-001 (PIN) no cambia la arquitectura: cualquiera de las dos respuestas cuesta un campo en el
esquema zod y una llamada a `verificarPin`, así que se evalúa ahora y se exige la respuesta
escrita antes de implementar el IPC, no una segunda ronda. La renumeración es legítima: ninguna
de las tres migraciones está publicada ni generada (PROJECT.md solo prohíbe renumerar las
publicadas) y el precedente es el addendum, no reescribir veredictos. Enviar 0005 y 0006 en el
mismo release es correcto siempre que la radiografía de COB-A1 siga siendo el candado del tag.
Blocking Issues: <!-- atlas-allow: encabezado de la plantilla del Gate, no es un nombre de persona -->
Ninguno.
Conditions:
1. Sin CHECK sobre las columnas enumeradas de `descuentos_servicio` (`tipo`, `aplica_a`, `modo`,
   `motivo`): sus valores válidos viven en zod y en `cobros.ts`, como en 0004 y 0005 (decisión 1
   de ambas cabeceras; Gate del cobro, condición 2). Se conservan los CHECK numéricos (`valor > 0`,
   `monto > 0`, `monto <= base`) porque la Parte B también los cumple (§21.3: base = remanente).
   El spec §10 declara además cómo la Parte B representa un descuento `aplica_a = 'todo'`: dos
   filas, una por base, para que `descuento_servicio` y `descuento_productos` sigan siendo
   Σ `monto` por base (AC-007 no cambia).
   Verificar: `grep -n "CHECK" drizzle/0006_*.sql | grep -c "tipo\|aplica_a\|modo\|motivo"` → 0;
   `grep -c "CHECK" drizzle/0006_*.sql` ≤ 3; `grep -c "z.enum" shared/schemas.ts` sube en 4;
   `grep -n "todo" .notes/spec-descuentos-2026-11-06.md` ≥ 1 en §10.
2. Migración `0006` aditiva, con lo que drizzle-kit no siempre emite agregado a mano y la cabecera
   de Atlas (`templates/migration-header.sql`, flujo `/atlas migracion`): el índice único parcial
   lleva su `WHERE estatus = 'aplicado' AND tipo = 'manual'` también en el SQL generado, la FK a
   `servicios_realizados` lleva `ON DELETE restrict` dentro del `CREATE TABLE`, `usuario_id`
   referencia `usuarios(id) ON DELETE set null` como `pagos.usuario_id`, y las dos columnas de
   `servicios_realizados` son `ALTER TABLE ... ADD ... DEFAULT 0 NOT NULL` (patrón de
   `total_productos`, 0005:115). Ninguna recreación de tablas, ningún backfill.
   Verificar: `grep -n "CREATE UNIQUE INDEX" drizzle/0006_*.sql | grep -c "WHERE"` → 1;
   `grep -c "ON DELETE restrict" drizzle/0006_*.sql` ≥ 1; `grep -c "ALTER TABLE" drizzle/0006_*.sql`
   → 2; `grep -c "__new_\|DROP TABLE\|UPDATE " drizzle/0006_*.sql` → 0; `drizzle/meta/_journal.json`
   con idx 6 y tag `0006_descuentos*`; las primeras líneas siguen la plantilla.
3. Renumeración por escrito antes de generar la `0006`: addendum en el spec del cobro (Parte B →
   `0008`; sus condiciones 1 y 2 del Gate aplican a ese número) y en el spec de la ficha clínica
   (→ `0007`; las condiciones 1-3 de su Gate que dicen `drizzle/0006_*` aplican a `0007_*`). Los
   veredictos no se reescriben (precedente: addenda 2026-11-04 y 2026-11-05 del spec del cobro).
   La `0006` se genera solo en una rama que ya contenga `0005_cobro_v2.sql` y `meta/0005_snapshot.json`.
   Verificar: `grep -c "0008" .notes/spec-modulo-cobro-2026-11-04.md` ≥ 1;
   `grep -c "0007" .notes/spec-ficha-clinica-2026-11-05.md` ≥ 1; `ls drizzle/0006_*` muestra un
   solo archivo y es el de descuentos.
4. Único escritor y única definición, verificables: `descuentos_servicio`, `descuento_servicio` y
   `descuento_productos` solo se escriben desde `cobros.ts` (`aplicarDescuentoEnTx`,
   `cancelarDescuentoEnTx` y las operaciones `aplicarDescuento`/`quitarDescuento`);
   `cerrarCita` las llama dentro de su transacción antes de `recalcularEstatusEnTx`;
   `totalTicket`, `saldoServicio` e `ingresoDelServicio` exigen `descuentoServicio` y
   `descuentoProductos` en su tipo de parámetro (no opcionales); `cobros.ts` sigue sin importar
   módulos de la Parte B.
   Verificar: `grep -rn "descuentosServicio\|descuentoServicio\|descuentoProductos" electron/services | grep "insert(\|update(\|set({" | grep -v cobros.ts`
   → 0 líneas; `grep -ln "descuentoServicio" electron/services/{citas,dashboard,reportesResumen,reportesFinanzas,reportesClientesDetalle,reportesServiciosDetalle,serviciosRealizados}.ts`
   → 7 archivos; `npm run typecheck` verde.
5. Un solo cálculo del descuento, compartido por renderer y main: función pura en `shared/`
   (p. ej. `calcularDescuento({ modo, valor, base })`) con el redondeo de `redondearDinero`
   (COB-B2: `LineasPago.tsx:19` ya replica `cobros.ts:41`), usada por la vista previa y el
   `porCobrar` del cierre y por `cobros.ts`. El servidor recalcula y valida dentro de la
   transacción: base > 0, 0 < monto ≤ base (BR-002), valor ≤ 100 si porcentaje, `motivo_detalle`
   obligatorio si `otro`, servicio `cerrado` y `estatus_pago != 'cancelado'` en la ruta
   post-cierre, BR-005 contra `cobradoPorServicio(tx, …)` dentro de la misma transacción (DIN-M2).
   Verificar: `grep -rln "calcularDescuento" shared src electron` → definición en `shared/` y uso
   en `src/` y en `electron/services/cobros.ts`; AC-002 y AC-004 en la nota de evidencia.
6. Contrato IPC y tipos escritos en el spec antes de implementar: canales (`cobros:aplicarDescuento`,
   `cobros:quitarDescuento`), esquemas zod (`descuentoInputSchema` con `servicioRealizadoId`,
   `aplicaA`, `modo`, `valor`, `motivo`, `motivoDetalle`; `quitarDescuentoInputSchema` con
   `descuentoId` y `motivo`), y extensión de `EstadoCuentaCita` y `DetalleServicioRealizado` con
   precio bruto, descuento del servicio, productos, descuento de productos, total neto y la lista
   de descuentos vigentes (id, aplicaA, modo, valor, monto, motivo). `precio` sigue siendo el
   bruto; el neto va en un campo propio (hoy `obtenerDetalle` devuelve `precio: ingresoDelServicio(…)`,
   `serviciosRealizados.ts:418`, y pasaría a mostrar el neto como si fuera el precio). Si Q-001 se
   responde "con PIN", el input lleva `pin` y se verifica como `cancelarPago` (`cobros.ts:476`).
   Verificar: `grep -c "cobros:aplicarDescuento\|cobros:quitarDescuento" electron/ipc/index.ts electron/preload.ts`
   → ≥ 2 en cada uno; `grep -c "descuento" shared/types.ts` ≥ 4; §6 o §10 del spec con los canales.
7. FR-007 con dueño y con la carpeta decidida: `cierreCitaInputSchema` gana `servicioCatalogoId`
   opcional; `cerrarCita` (`serviciosRealizados.ts`, dueño de la tabla) actualiza
   `servicio_catalogo_id` del servicio realizado y de la cita dentro de su transacción, calcula
   `proximaCitaSugerida` con la periodicidad del servicio nuevo, pasa `verificarStockSuficiente`
   con la receta nueva, y registra `servicio_cambiado_en_cierre` (anterior → nuevo). La carpeta
   creada por `abrirCierre` con el nombre del servicio anterior NO se renombra (`archivos.ruta_fisica`
   es absoluta, `schema.ts:386`; renombrar dejaría comprobantes huérfanos): decisión declarada en
   el spec. `citas.actualizarCita` (`citas.ts:142-170`) ya hace la sincronización inversa
   cita → borrador; ninguna de las dos escribe sobre un servicio `cerrado` (BR-010).
   Verificar: `grep -n "servicioCatalogoId" shared/schemas.ts` dentro de `cierreCitaInputSchema`;
   `grep -c "servicio_cambiado_en_cierre" electron/services/serviciosRealizados.ts` ≥ 1;
   `grep -c "renameSync\|renombrar" electron/services/serviciosRealizados.ts` → 0; AC-006.
8. `schema.descuentosServicio` en `TABLAS_NEGOCIO` de `reinicio.ts` (el borrado corre con las FK
   apagadas, `reinicio.ts:55-59`; sin la tabla quedan descuentos huérfanos y AC-007 deja de dar 0).
   Verificar: `grep -c "descuentosServicio" electron/services/reinicio.ts` → 1.
9. Decisiones del dueño por escrito en el spec antes de implementar el IPC: Q-001 respondida
   (BR-008 deja de ser "propuesta"), y las seis decisiones que hoy están embebidas como requisitos
   (descuento separado para servicio y productos; porcentaje o monto; motivo con chips; la misma
   acción sobre citas cerradas para corregir historial; sin sugerencia automática de primera
   visita; cambio de servicio antes de cerrar) en una sección "Decisiones del dueño (por escrito,
   fecha)" como §23 del spec del cobro, con la fecha del chat en que se dieron.
   Verificar: `grep -c "Decisiones del dueño" .notes/spec-descuentos-2026-11-06.md` ≥ 1;
   `grep -n "Q-001" .notes/spec-descuentos-2026-11-06.md` muestra la respuesta, no la pregunta.
10. "Descuentos otorgados" con una sola definición y la fecha del servicio (BR-007): lector
    `descuentosDelRango(db, desde, hasta)` en `cobros.ts` que hace join a `servicios_realizados`
    (`fecha`, `estatus = 'cerrado'`, `estatus_pago` no cancelado — el mismo filtro que
    `agregadosDelRango`, `reportesResumen.ts:56-62`) y solo cuenta `estatus = 'aplicado'`;
    Finanzas lo consume y agrupa por `motivo`, nunca por `motivo_detalle`.
    Verificar: `grep -c "descuentosDelRango" electron/services/cobros.ts electron/services/reportesFinanzas.ts`
    → ≥ 1 en cada uno; AC-008.
11. Evidencia y candados de release: (a) el release que lleve `0005` + `0006` sigue bloqueado por
    COB-A1 (radiografía de la condición 3 del Gate del cobro sobre un respaldo real, solo
    conteos); la `0006` no agrega backfill, así que no amplía esa radiografía; (b) AC-001…AC-009
    ejecutados sobre una BD de prueba con `0005` y `0006` aplicadas, con el texto de la consulta
    AC-007 y la salida de AC-009, en `.notes/evidencia-descuentos-<fecha>.md`; <!-- atlas-allow: archivo futuro que crea esta condición -->
    (c) auditoría de superficie crítica antes de integrar (`drizzle/`, `electron/db/schema.ts`,
    `cobros.ts`, `serviciosRealizados.ts`, `reportesFinanzas.ts`, `CierreCitaModal.tsx`), regla 1
    del contrato.
    Verificar: existencia de la nota de evidencia con nueve AC; nota de auditoría con hallazgos
    codificados; `APPLIED-MIGRATIONS.md` sin fila `0005`/`0006` hasta verificar la instalación.
Key Risks:
- Un descuento después del cierre sin PIN puede "perdonar" un adeudo real con un clic y una
  confirmación; BR-005 impide bajar de lo cobrado, pero no distingue adeudo real de descuento
  olvidado. El único control es la bitácora, que SEG-A1 (abierto) no protege. Es la decisión que
  Q-001 debe tomar con los ojos abiertos.
- `motivo_detalle` es texto libre que termina en bitácora y en el detalle de la cita: puede
  recibir nombres o datos de salud. Mismo riesgo que `motivo_cancelacion` de `pagos`; la UI
  debería pedir "sin nombres" y el reporte por motivo nunca debe listar ese texto (condición 10).
- Las ventas de periodos pasados cambian al corregir citas viejas (BR-007 fecha el descuento con
  la fecha del servicio). El corte no se mueve (solo lee `pagos`), pero Resumen/Finanzas de un mes
  cerrado bajan después de la corrección. Intencional; el dueño debe saberlo.
- `estatus_pago` es derivado y almacenado (COB-B4): si una instalación volviera a un release sin
  `0006`, `totalTicket` ignoraría los descuentos y las citas corregidas quedarían "pagado" con
  precio − 0 > cobrado. Reversible con costo; cubierto por la copia previa a migrar.
- La base del descuento de productos es la caché `total_productos`; si una venta del ticket se
  cancela después (`cancelarSalida`), hoy esa caché no cambia (deuda COB-B4 ya declarada) y el
  descuento hereda la misma desincronización. No es nuevo, pero el Gate de CIT-C1 debe heredar
  también esta regla.
- drizzle-kit 0.31: no hay precedente en este repo de índice parcial ni de CHECK generado; si el
  `WHERE` no sale en el SQL, BR-001 quedaría solo en código (condición 2 lo detecta).
- Carpeta del servicio con el nombre del servicio anterior tras FR-007: cosmético, declarado
  (condición 7).
Accepted Trade-offs:
- Columnas caché denormalizadas en `servicios_realizados` en vez de subconsultas: mismo patrón y
  mismo invariante verificable que `total_productos`; a cambio, un escritor único (condición 4).
- `tipo` admite valores reservados sin que existan todavía `cupon_id`, `tarjeta_regalo_id` ni
  `orden` (§21.2): la Parte B los agrega con `ALTER TABLE ADD` nullable (FK con `ON DELETE` a mano,
  nota heredada del Gate de cancelación). No pinta ninguna esquina.
- El descuento no tiene fecha propia: su fecha de venta es la del servicio (BR-007) y la de
  aplicación vive en `created_at` y en bitácora.
- Sin PIN (BR-008, pendiente Q-001): coherente con el addendum 2026-11-05 (el PIN se reserva para
  dinero que ya entró).
- Las citas históricas se corrigen a mano desde la app, una por una, y no con un `UPDATE` en la
  migración. Correcto: la app no puede saber cuáles pagos menores fueron descuentos.
- Venta de mostrador fuera (Q-002): se diseña con la Parte B, donde ya existe el "ticket sin
  clienta" (condición 9 del Gate del cobro).
- Renumerar `0006`/`0007` planeadas: permitido porque ninguna está generada ni publicada;
  PROJECT.md solo prohíbe renumerar las publicadas.
- `0005` y `0006` en un mismo release: una sola copia previa a migrar cubre ambas y el migrador
  las aplica en una sola transacción; el candado del tag sigue siendo COB-A1.
Recommended Next Step: <!-- atlas-allow: encabezado de la plantilla del Gate, no es un nombre de persona -->
Carlos responde Q-001 y se escriben las decisiones del dueño y los addenda de numeración
(condiciones 3 y 9); después, en una rama nueva desde `main` (que ya contiene la `0005`),
`/atlas migracion` genera la `0006` con cabecera y se cumplen 1, 2 y 8 antes de tocar
`cobros.ts`; luego 4, 5, 6, 7 y 10 con `npm run typecheck` y `npm run build` verdes; auditoría de
superficie crítica y nota de evidencia (11) antes del PR. El tag que lleve `0005` + `0006` sale
solo después de la radiografía COB-A1.
```

## Entradas requeridas

| Entrada | Estado | Dónde |
|---|---|---|
| Problem statement | Presente | §2 del spec (medición sobre respaldo real pendiente: no bloquea, el problema se verifica en código: `saldoServicio` cuenta el pago menor como adeudo, `cobros.ts:62-68`) |
| Feature specification | Presente | §3-§9, §18 |
| Arquitectura existente | Inspeccionada | `cobros.ts`, `serviciosRealizados.ts`, lectores de dinero, `schema.ts`, `0005`, `reinicio.ts`, `folders.ts`, UI del cierre y del detalle |
| Diseño técnico | Presente | §10 (tabla, índices, columnas caché, firmas, migración y numeración), §13 |
| Restricciones | Presentes | §15; PROJECT.md (migración automática e irreversible, repo público, PII, CFF art. 30) |
| Decisiones del dueño por escrito | Parciales | §5 registra "sin sugerencia automática"; las otras cinco llegan por chat según el solicitante y se registran aquí como del dueño; Q-001 abierta. Condición 9 las lleva al spec |

Las entradas alcanzan para evaluar: Q-001 no cambia esquema ni fronteras, así que no cuesta una
segunda ronda.

## Análisis por dimensión

1. **Alineación con el problema.** Resuelve §2 sin ampliarlo: descuento manual con motivo, en el
   cierre y después, y cambio de servicio antes de cerrar. No adelanta cupones ni acumulación ni
   mostrador. La métrica "descuentos otorgados por motivo" es consecuencia directa de guardar el
   motivo, no alcance extra. Sin FAIL.
2. **Encaje con el sistema.** Reutiliza todos los patrones vigentes: estado sobre la fila y rastro
   (`cancelado`, nunca `DELETE`), caché con invariante (`total_productos`), estatus derivado por
   `recalcularEstatusEnTx`, transacción única síncrona, zod en el borde IPC, bitácora con acción
   nombrada. El único patrón nuevo son los CHECK enumerados, que contradicen la convención escrita
   en 0004 y 0005 (condición 1); los CHECK numéricos son invariantes estables y sí se justifican.
3. **Fronteras.** `descuentos_servicio` y la caché: `cobros.ts` (BR-009, condición 4).
   `servicio_catalogo_id`: `serviciosRealizados.ts` para el servicio y la cita dentro de
   `cerrarCita`, como `actualizarCita` hace al revés (condición 7). Lectores: los siete de siempre
   más `descuentosDelRango` (condición 10). El spec no nombra canales ni tipos (condición 6). No es
   FAIL: la responsabilidad es decidible sin cambiar la estructura.
4. **Acoplamiento.** Dirección `serviciosRealizados → cobros` ya existe; `cobros` no gana imports.
   El cambio de firma de `totalTicket`/`saldoServicio`/`ingresoDelServicio` toca siete archivos,
   pero es acoplamiento deseado: el compilador es el que detecta al lector que olvida restar.
   La UI lee por `estadoCuentaCita` y `obtenerDetalle`, sin canal nuevo de lectura.
5. **Modelo de datos.** Entidad correcta (N descuentos por servicio, uno vigente por base vía
   índice parcial, BR-001 enforzable en esquema). FK `restrict` coherente con "dinero no se
   borra"; `eliminarCita` solo borra borradores (`citas.ts:277-300`) y un borrador nunca tiene
   descuentos (se aplican dentro de la transacción de cierre), así que `restrict` no estorba.
   Columnas caché `NOT NULL DEFAULT 0` como `total_productos`. Migración aditiva, sin backfill,
   atómica, con copia previa (`db/index.ts:45-76`). Huecos: CHECK enumerados (1), emisión real del
   `WHERE` del índice y del `ON DELETE` (2), `usuario_id` sin FK declarada (2), reinicio (8).
   Compatibilidad con la Parte B: la caché sigue valiendo con `orden` (Σ por base); `aplica_a =
   'todo'` necesita la regla de dos filas (1); `cupon_id`/`tarjeta_regalo_id`/`orden` se agregan
   con `ADD` nullable.
6. **Seguridad.** Modelo explícito en §11: app desbloqueada, PIN único, sin PIN para descuentos,
   bitácora como control, confirmación en pantalla post-cierre. Frontera de confianza respetada:
   el renderer manda `modo`/`valor`/`motivo`, el main calcula `base` y `monto` (FR-004) y valida
   BR-002/BR-005 dentro de la transacción (condición 5). Datos sensibles: `motivo_detalle` libre
   (riesgo declarado). Límites heredados y declarados: SEG-A1 abierto, un solo usuario. No es FAIL:
   el modelo existe y está escrito; Q-001 lo confirma o lo endurece (condición 9).
7. **Escalabilidad.** Volumen de una cabina. La caché evita subconsultas en los listados;
   `descuentosDelRango` es un join acotado por fecha. Nada que crezca mal.
8. **Modos de falla.** Todo en una transacción síncrona (sin interleaving en better-sqlite3);
   doble clic cubierto por el índice único; carrera entre dos modales cubierta por BR-005 dentro de
   la transacción; redondeo idéntico en ambos lados (condición 5) para que "el pago excede" no
   rechace por centavos; base 0 rechazada; servicio cancelado legado rechazado; stock insuficiente
   en el cambio de servicio reutiliza `verificarStockSuficiente`; migración falla cerrada con copia.
9. **Reversibilidad.** Esquema: aditivo, fácil. Código: un módulo extendido, fácil. Datos:
   **reversible con costo** por el estatus derivado almacenado (COB-B4) y por las ventas
   históricas corregidas; la copia previa a migrar y los respaldos lo cubren.
10. **Complejidad.** La más pequeña que cumple. Alternativas descartadas con razón: descuento como
    pago negativo (no es pago, rompe el corte y el CFF), editar `precio` después del cierre (pierde
    motivo, historial y la regla "dinero se cancela, no se edita"), subconsultas en vez de caché
    (toca los mismos lectores y es más lento). Lo único especulativo es reservar `tipo` para la
    Parte B, y es gratis si no va en un CHECK.

## Respuestas a los puntos que pidió el solicitante

- **Columnas vs. Parte B.** La caché y el índice parcial conviven con la acumulación (§21.3): Σ
  `monto` por base no depende de `orden`, y el índice solo restringe `tipo = 'manual'`. Lo que sí
  estorba son los CHECK enumerados (`aplica_a` sin `'todo'`, `motivo` obligatorio con cuatro
  valores manuales): condición 1. `cupon_id`, `tarjeta_regalo_id` y `orden` faltan pero se agregan
  por `ADD` nullable sin recrear la tabla.
- **Escritor único.** BR-009 extiende bien la condición 5 del Gate del cobro; la condición 4 lo
  hace verificable con el mismo grep que AC-009 y con el tipo de parámetro obligatorio.
- **0005 + 0006 juntas.** Correcto: una copia previa, una transacción del migrador, sin backfill
  nuevo. El candado del tag sigue siendo COB-A1 (condición 11a).
- **Renumeración.** Legítima y barata hoy: no existe ninguna `0006` generada en ninguna rama; se
  registra por addendum (condición 3) para que los veredictos anteriores no se reescriban.
- **Decisiones del dueño.** Registradas aquí como del dueño (según el solicitante); la condición 9
  las lleva al spec con fecha, donde deben vivir.
