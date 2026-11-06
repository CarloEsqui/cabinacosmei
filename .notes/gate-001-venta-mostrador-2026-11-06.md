# Gate 001 — Architecture Gate: Venta de productos en mostrador (2026-11-06)

**Fecha:** 2026-11-06 · **Diseño evaluado:** [spec-venta-mostrador-2026-11-06.md](spec-venta-mostrador-2026-11-06.md)
(§2 problema, §5 alcance, §6 requisitos, §7 reglas, §10 datos y migración, §11 autorización, §13 no
funcionales, §14 integraciones, §15 restricciones, §18 criterios, §20 decisiones del dueño) ·
**Repo:** rama `atlas/ficha-clinica` @ `4009045` (main con `0004`…`0007` integradas; journal hasta
idx 7; no existe ninguna `0008` en ninguna rama local ni remota; el spec es el único archivo sin
versionar). La instalación real sigue en `0003` según `APPLIED-MIGRATIONS.md` y recibirá
`0004`…`0008` en un solo `BEGIN`.
**Disparadores:** módulo nuevo (ventas sin cita), cambio de BD significativo (tabla nueva, recreación
de `pagos` y de `descuentos_servicio` en la máquina de la clienta, columna en `salidas_inventario`),
cambio de propiedad de datos (`pagos.cliente_id` deja de ser obligatorio; un pago puede pertenecer a
una venta y no a un servicio), superficie Dinero (corte, ventas, margen, cartera, descuentos),
superficie Migraciones, superficie PII (compras ligadas a clienta) y difícil de revertir (ventas
registradas tras la `0008` no existen para un release anterior).
**Método:** solo lectura sobre `electron/db/{schema,index}.ts`, `electron/services/{cobros,
serviciosRealizados,inventario,corte,comprobantes,archivos,folders,reinicio,dashboard,reportesResumen,
reportesFinanzas,reportesClientesDetalle,clientes,bitacora}.ts`, `shared/schemas.ts`,
`electron/ipc/index.ts`, `src/components/inventario/SalidaForm.tsx`, `drizzle/0004`…`0007`,
`drizzle/meta/_journal.json`, `APPLIED-MIGRATIONS.md`, `node_modules/drizzle-orm/sqlite-core/dialect.js`
(migrador) y `node_modules/drizzle-kit/bin.cjs` (plantilla `recreate_table`), el spec y el Gate del
cobro (condición 9 y addenda 2026-11-05 / 2026-11-06), el spec y el Gate de descuentos (Q-002,
condiciones 1, 2, 4, 8), la auditoría de la Parte A (COB-M1, COB-A2, COB-B4), la auditoría de
dinero (DIN-A5) y PROJECT.md. No se abrió ninguna base real ni respaldo. Sin PII.

```text
Architecture Gate
Decision:
PASS WITH CONDITIONS
Summary:
El diseño resuelve exactamente el problema de §2 (DIN-A5: una crema vendida sin cita descuenta stock
pero no deja precio, pago ni rastro en corte, ventas ni cartera) con la estructura más pequeña que
el sistema admite: una cabecera `ventas_mostrador` cuyas líneas son las propias filas de
`salidas_inventario` (que desde la 0005 ya guardan `precio_unitario_venta`), los pagos en `pagos`
con `concepto = 'venta_mostrador'` para que corte, cobranza y "cobrado hoy" los cuenten sin tocar
una sola consulta (verificado: `corte.ts:41-51`, `cobros.ts:206,367-380` filtran solo por
`fuente = 'dinero'`), y el mismo modelo de descuento de la 0006 con la FK que falta. Las decisiones
de negocio son sanas y están escritas (§20): clienta opcional sin capturar datos, deuda solo con
clienta, cancelación con PIN y nunca borrado (CFF art. 30), la salida tipo "Venta" sin dinero deja
de ofrecerse. Verifiqué el censo del solicitante en código: ninguna tabla apunta a `pagos` (ni en
`schema.ts` ni en `drizzle/*.sql`), nadie lee `pagos.cliente_id` (solo lo escribe
`registrarPagosEnTx`, `cobros.ts:276`), y todo lector de ventas, costo, saldo y descuentos
(`reportesResumen.ts:46-94`, `reportesFinanzas.ts:69-150`, `dashboard.ts:19-37`,
`reportesClientesDetalle.ts:48-78`, `cobros.ts:126-216,781-800`) está clavado a
`servicios_realizados`. También verifiqué la restricción de la migración: el migrador síncrono de
drizzle corre todas las pendientes dentro de un solo `BEGIN` (`dialect.js:657`), la plantilla
`recreate_table` de drizzle-kit emite `PRAGMA foreign_keys=OFF` / `CREATE __new_` / `INSERT…SELECT`
/ `DROP` / `RENAME` / `PRAGMA ON` (`bin.cjs:25196-25232`), y en SQLite ese PRAGMA es un no-op dentro
de una transacción, así que la recreación corre con las llaves foráneas ACTIVAS. Funciona porque
`pagos` y `descuentos_servicio` no tienen hijas, pero convierte cualquier referencia colgante en las
filas reales de `pagos` en un fallo de TODO el lote `0004`→`0008` (rollback, la app no abre). Lo
que impide un PASS limpio son huecos cerrables sin cambiar la estructura: (1) el spec no dice quién
es dueño de `ventas_mostrador` ni cómo las nueve funciones de `cobros.ts` que hoy reciben un
`servicioId` ganan un destino "venta" (estatus derivado, caché del descuento, BR-005, cancelación,
abono, costo, saldos, descuentos del rango); (2) el CHECK de BR-002 sobre `pagos` pinta en una
esquina a la Parte B, que vende tarjetas sin clienta y sin venta de mostrador y tendría que recrear
`pagos` otra vez en la máquina de la clienta — la misma convención que el Gate de descuentos ya
impuso (los invariantes de negocio con valores abiertos viven en el escritor único, no en CHECK);
(3) el índice único parcial de la 0006 no restringe filas con `servicio_realizado_id` NULL (SQLite
trata los NULL como distintos), así que "un descuento manual vigente por venta" necesita su propio
índice; (4) la `0008` está reservada para la Parte B por el addendum 2026-11-06 y COB-M1 dejó
escrito que "la migración que recree `pagos`" pasa `servicio_realizado_id` a `restrict`: esta es esa
migración; (5) BR-003, BR-004, FR-005 y el bloqueo del tipo "venta" en la salida suelta tienen que
vivir en el main, no solo en la UI; (6) el contrato IPC, los esquemas zod y el alcance exacto de los
reportes no están escritos. Ninguno exige segunda ronda: las decisiones del dueño que el diseño
necesita están en §20; solo falta llevar a §20 dos reglas que el spec presenta como requisito
(precio editable con 0 permitido sin motivo, BR-005; venta solo del día, A-002).
Blocking Issues: <!-- atlas-allow: encabezado de la plantilla del Gate, no es un nombre de persona -->
Ninguno.
Conditions:
1. Numeración por escrito antes de generar: esta migración es la `0008_venta_mostrador` y la
   Parte B pasa a la `0009`; addendum fechado en el spec del cobro (sus condiciones 1 y 2 y la
   nota COB-M1 aplican al número nuevo), precedente de los addenda 2026-11-05 y 2026-11-06. La
   `0008` se genera con `/atlas migracion` en una rama que ya contenga `0007_ficha_clinica.sql` y
   `meta/0007_snapshot.json`, con la cabecera de `templates/migration-header.sql`.
   Verificar: `grep -c "0009" .notes/spec-modulo-cobro-2026-11-04.md` ≥ 1; `ls drizzle/0008_*`
   muestra un solo archivo y es el de venta de mostrador; `drizzle/meta/_journal.json` con idx 8;
   `head -5 drizzle/0008_*.sql` sigue la plantilla.
2. Contenido de la `0008`, revisado contra el SQL que emite drizzle-kit (no contra el esquema):
   (a) `ventas_mostrador` se crea ANTES de `__new_pagos`, con `cliente_id` REFERENCES clientes
   ON DELETE restrict, `usuario_id` y `cancelada_por` ON DELETE set null, `folio` UNIQUE;
   (b) `__new_pagos` conserva `cliente_id … ON DELETE restrict` (ahora nullable), agrega
   `venta_mostrador_id` REFERENCES ventas_mostrador(id) ON DELETE restrict, y pasa
   `servicio_realizado_id` de `set null` a `restrict` (cierra COB-M1; seguro porque el único
   `delete(serviciosRealizados)` es `citas.ts:299` sobre borradores sin pagos); `usuario_id` y
   `comprobante_archivo_id` siguen `set null`; los tres índices `pagos_servicio_realizado_idx`,
   `pagos_cita_idx`, `pagos_corte_idx` se vuelven a crear DESPUÉS del `RENAME`;
   (c) `__new_descuentos_servicio` con `servicio_realizado_id` nullable `restrict`,
   `venta_mostrador_id` nullable `restrict`, los dos CHECK numéricos de la 0006, el CHECK
   "exactamente uno" (`(servicio_realizado_id IS NOT NULL) + (venta_mostrador_id IS NOT NULL) = 1`,
   invariante cerrado que la Parte B también cumple), el índice `descuentos_servicio_servicio_idx`,
   el índice parcial de la 0006 y un SEGUNDO índice parcial
   `(venta_mostrador_id, aplica_a) WHERE estatus = 'aplicado' AND tipo = 'manual'`, todos después
   del `RENAME`; (d) `salidas_inventario` solo `ALTER TABLE … ADD venta_mostrador_id text
   REFERENCES ventas_mostrador(id) ON DELETE restrict` (patrón `0005:105`); (e) ningún `UPDATE` ni
   backfill; (f) la cabecera declara que los `PRAGMA foreign_keys=OFF/ON` generados son no-op
   dentro del `BEGIN` del migrador (`dialect.js:657`), que la recreación corre con FK activas y
   que es correcta solo porque ninguna tabla referencia a `pagos` ni a `descuentos_servicio`
   (condición 13a lo mide).
   Verificar: `grep -c "__new_pagos\|__new_descuentos_servicio" drizzle/0008_*.sql` ≥ 2 cada
   uno; `grep -n "CREATE TABLE" drizzle/0008_*.sql` lista `ventas_mostrador` antes que
   `__new_pagos`; `grep -c "CREATE INDEX \`pagos_" drizzle/0008_*.sql` → 3 y aparecen después
   del `RENAME TO \`pagos\``; `grep -n "CREATE UNIQUE INDEX" drizzle/0008_*.sql | grep -c WHERE`
   → 2; `grep -c "ON DELETE restrict" drizzle/0008_*.sql` ≥ 7; `grep -c "UPDATE " drizzle/0008_*.sql`
   → 0; `grep -c "ALTER TABLE" drizzle/0008_*.sql` → 2 (el ADD y el RENAME de cada recreación
   cuentan aparte: revisar a mano que el único ADD es el de `salidas_inventario`).
3. Sin CHECK de BR-002 sobre `pagos`: la regla "un pago tiene clienta salvo que pertenezca a una
   venta de mostrador" vive en `registrarPagosEnTx` (`cobros.ts:263`, escritor único) y en el
   esquema zod, no en el esquema SQL. Motivo: la Parte B (`venta_tarjeta`, Gate del cobro
   condición 9 opción b) escribe pagos con `cliente_id` NULL y sin `venta_mostrador_id`; un CHECK
   la obligaría a recrear `pagos` otra vez en la máquina de la clienta, y §1 del spec promete lo
   contrario. Misma convención que la condición 1 del Gate de descuentos.
   Verificar: `grep -n "CHECK" drizzle/0008_*.sql | grep -c "cliente_id"` → 0;
   `grep -n "ventaMostradorId" electron/services/cobros.ts` muestra la validación dentro de
   `registrarPagosEnTx`; `grep -c "venta_mostrador" shared/schemas.ts` ≥ 1.
4. Dueño de `ventas_mostrador` escrito en el spec (§10 o §14) antes de implementar: módulo nuevo
   `electron/services/ventasMostrador.ts`, con el mismo reparto que hoy tienen
   `serviciosRealizados.ts` y `cobros.ts`: `ventasMostrador.ts` inserta la cabecera, genera el
   folio `VTA-` dentro de la transacción, escribe `total_productos`, `observaciones`, `estatus`
   (`vigente` | `cancelada`) y los campos de cancelación, lista y devuelve el detalle, y orquesta
   `registrarVenta` / `cancelarVenta` en UNA transacción síncrona llamando a
   `inventario.registrarSalidaEnTx` / `cancelarSalidaEnTx` y a las funciones `…EnTx` de
   `cobros.ts`; `cobros.ts` sigue siendo el ÚNICO escritor de `pagos`, de `descuentos_servicio` y
   de las columnas derivadas `ventas_mostrador.estatus_pago` y `ventas_mostrador.descuento`
   (como ya lo es de `servicios_realizados.estatus_pago` y de `descuento_*`). Dirección:
   `ventasMostrador → cobros, inventario`; `cobros.ts` no importa `ventasMostrador.ts`.
   `electron/services/ventasMostrador.ts` entra en `sensitive_globs` de PROJECT.md (como
   `cobros.ts` por la condición 7 del Gate del cobro).
   Verificar: `grep -rn "ventasMostrador" electron/services | grep "insert(\|update(" | grep -v "ventasMostrador.ts\|cobros.ts"`
   → 0 líneas; `grep -n "estatusPago\|descuento:" electron/services/ventasMostrador.ts | grep -c "set("`
   → 0; `grep -c "from \"./ventasMostrador\"" electron/services/cobros.ts` → 0;
   `grep -c "ventasMostrador.ts" PROJECT.md` → 1.
5. El destino "venta" en `cobros.ts`, escrito en el spec como lista de firmas antes de tocar
   código: `recalcularEstatusEnTx`, `aplicarDescuentoEnTx`, `cancelarDescuentoEnTx`,
   `recalcularCacheDescuentosEnTx`, `descuentosVigentes`, `aplicarDescuento`, `quitarDescuento`
   (BR-005 contra lo cobrado de la venta dentro de la transacción), `registrarAbono` (venta con
   clienta y `estatus = 'vigente'`), `cancelarPago` (recalcula el estatus de la venta cuando
   `venta_mostrador_id` está presente), `costoProductosVendidos` (por `venta_mostrador_id`),
   `saldosPorCliente` (+ ventas vigentes con clienta), `descuentosDelRango` (ventas vigentes por
   `ventas_mostrador.fecha`), más `totalVenta({ totalProductos, descuento })` como única
   definición del neto y `cancelarPagoEnTx` (sin PIN; el PIN lo verifica una sola vez
   `cancelarVenta`). Para una venta el descuento se guarda con `aplica_a = 'productos'` (única
   base) y la caché es `ventas_mostrador.descuento`.
   Verificar: `grep -c "ventaMostradorId\|ventasMostrador\." electron/services/cobros.ts` ≥ 12;
   `grep -n "export function totalVenta\|export function cancelarPagoEnTx" electron/services/cobros.ts`
   → 2 líneas; `npm run typecheck` verde; AC-003, AC-004 y AC-005 en la nota de evidencia.
6. Validaciones del main dentro de la transacción (no solo en la UI): FR-005 (sin clienta,
   Σ pagos = total ± `TOLERANCIA`), BR-007 (Σ pagos ≤ total; métodos en `config.metodosPago`,
   ya lo hace `registrarPagosEnTx`), BR-003 (`cancelarPago` rechaza un pago con
   `venta_mostrador_id` cuya venta no tiene clienta: "cancela la venta completa"), BR-004
   (`productos.activo`: `verificarStockSuficiente` y `registrarSalidaEnTx` NO lo comprueban hoy),
   `estatus = 'vigente'` para abonar, descontar y cancelar, y "ya cancelada" verificado dentro de
   la transacción (DIN-M2). El total se calcula en el main con `redondearDinero` por línea, como
   `cerrarCita` (`serviciosRealizados.ts:262-264`).
   Verificar: AC-002, AC-009 y el caso "PIN incorrecto" de AC-005 en la nota de evidencia;
   `grep -n "activo" electron/services/ventasMostrador.ts` ≥ 1; `grep -n "clienteId" electron/services/cobros.ts | grep -c "cancela la venta"` ≥ 1.
7. Integridad de las salidas: `cancelarSalidaEnTx` agrupa por folio + `venta_mostrador_id` (hoy
   solo por folio + `servicio_realizado_id`, `inventario.ts:717-727`) y rechaza desde Movimientos
   una salida ligada a una venta igual que rechaza las ligadas a un servicio (`inventario.ts:731`),
   con una opción `permitirLigadasAVenta` que solo usa `cancelarVenta`; `inventario.registrarSalida`
   (IPC `inventario:registrarSalida`) rechaza `tipoSalida = 'venta'` para que una venta sin dinero
   ya no pueda crearse por ningún camino (el enum zod conserva `venta` porque `cerrarCita` y la
   venta de mostrador lo usan vía `registrarSalidaEnTx`); `SalidaForm.tsx` deja de ofrecer el
   tipo. Las salidas viejas tipo venta no se tocan.
   Verificar: `grep -c "ventaMostradorId" electron/services/inventario.ts` ≥ 3;
   `grep -n "permitirLigadasAVenta" electron/services/inventario.ts electron/services/ventasMostrador.ts`
   ≥ 1 en cada uno; `grep -n "venta" electron/services/inventario.ts | grep -c "registrarSalida"`
   muestra el rechazo; `grep -c "\"venta\"" src/components/inventario/SalidaForm.tsx` → 0; AC-008.
8. `schema.ventasMostrador` en `TABLAS_NEGOCIO` de `reinicio.ts` antes de `clientes` (FK
   restrict; el borrado corre con FK apagadas pero el orden deja el invariante legible).
   Verificar: `grep -c "ventasMostrador" electron/services/reinicio.ts` → 1; AC-010.
9. Contrato IPC y tipos en el spec antes de implementar: canales `ventas:registrar`,
   `ventas:listar` (paginado de 30), `ventas:detalle`, `ventas:porCliente`, `ventas:cancelar`;
   `abonoInputSchema`, `descuentoInputSchema` y `quitarDescuentoInputSchema` ganan el destino
   venta (campo `ventaMostradorId` opcional con `refine` de "exactamente uno" contra
   `servicioRealizadoId`, o unión discriminada); `ventaMostradorInputSchema` con `clienteId`
   nullable, `lineas[{ productoId, cantidad > 0, precioUnitario ≥ 0 }]` no vacío, `descuento`
   opcional (`DescuentoCaptura` sin `aplicaA`), `pagos: LineaPago[]`, `sinComprobanteAceptado`,
   `comprobanteToken`, `observaciones`; `cancelarVentaInputSchema` con `ventaId`, `motivo`, `pin`;
   tipos `VentaMostradorRow` y `DetalleVentaMostrador` (líneas agrupadas por producto, porque una
   línea repartida en lotes son varias filas de `salidas_inventario` con el mismo folio
   `S-`). El renderer nunca manda totales, estatus ni rutas (§13).
   Verificar: `grep -c "ventas:" electron/ipc/index.ts electron/preload.ts` ≥ 5 en cada uno;
   `grep -c "ventaMostrador" shared/schemas.ts shared/types.ts` ≥ 3 en cada uno; §10 del spec
   con los canales.
10. Comprobante en dos fases, como el anticipo (`comprobantes.ts:45-61`, COB-A2): la transacción
    de la venta se confirma primero; después `consumirSeleccion(token)`, `guardarArchivoDesdeRuta`
    con `entidad_tipo = 'venta_mostrador'` y carpeta `<clienta>/Pagos` o
    `Datos/Comprobantes/Ventas`, y `ligarComprobanteEnTx`; si el archivo no se puede guardar, la
    venta NO se revierte y queda bitácora `cobro_sin_comprobante` (patrón
    `registrarAnticipoSinComprobanteGuardado`). Lector de comprobantes de venta para el detalle;
    `rutaComprobante` ya exige que la ruta esté dentro de `Datos/`.
    Verificar: `grep -c "venta_mostrador" electron/services/comprobantes.ts` ≥ 2;
    `grep -n "cobro_sin_comprobante" electron/services/ventasMostrador.ts electron/services/comprobantes.ts`
    ≥ 1; AC-006.
11. Alcance de reportes escrito en el spec como tabla "lector → incluye ventas de mostrador
    (sí/no)": sí en `reportesResumen` (ventas, costo de productos, margen, serie), en
    `reportesFinanzas` (ventas, descuentos por motivo, cartera por antigüedad y detalle por
    clienta — hoy `carteraPorAntiguedad` y `carteraDetallePorCliente` solo recorren servicios,
    `reportesFinanzas.ts:69-150`), en `clientes.ts` (saldo y alerta "Pago pendiente" vía
    `saldosPorCliente`) y en el historial de la clienta; no en `dashboard.serviciosDelMes` /
    `ticketPromedioMes` (A-003), ni en visitas, segmento e intervalos de
    `reportesClientesDetalle`, ni en `reportesServiciosDetalle`; y decidido (no implícito) si
    `reportesClientesDetalle.valor` y `clientesUnicos` de Resumen cuentan las compras de
    mostrador. Toda suma pasa por `totalVenta` y por un único lector `ventasDelRango` en
    `ventasMostrador.ts` (ventas `vigente` por `fecha`), nunca por sumas propias.
    Verificar: `grep -c "ventasDelRango\|totalVenta" electron/services/reportesResumen.ts electron/services/reportesFinanzas.ts electron/services/clientes.ts`
    ≥ 1 en cada uno; `grep -c "ventasMostrador" electron/services/dashboard.ts` → 0; sección en
    el spec; AC-001 (ventas del día), AC-003 (cartera), AC-004 (descuentos por motivo).
12. Decisiones del dueño que el spec presenta como regla y §20 no registra, llevadas a §20 con
    fecha antes de implementar el IPC: precio unitario editable por línea y precio 0 permitido
    sin motivo (BR-005: es un descuento sin rastro de motivo, distinto a lo que el módulo de
    descuentos acaba de introducir); ventas solo del día (A-002); la lista vive en Inventario
    (A-004); sin clienta no se cancela un pago suelto (BR-003).
    Verificar: `grep -n "BR-005\|precio 0\|A-002\|A-004\|BR-003" .notes/spec-venta-mostrador-2026-11-06.md`
    muestra líneas dentro de §20.
13. Evidencia y candados de release: (a) radiografía del lote completo `0004`→`0008` sobre una
    copia del respaldo real fuera del repo, ANTES de generar el tag: antes de migrar,
    `PRAGMA foreign_key_check` → 0 filas (con FK activas, una sola referencia colgante en
    `pagos` aborta el lote entero y la app no abre), conteo y Σ `monto` de `pagos` por `estatus`
    y por `concepto`, conteo con `corte_id` no nulo y con `comprobante_archivo_id` no nulo;
    después de migrar, las mismas cifras iguales, `PRAGMA integrity_check` = ok,
    `PRAGMA foreign_key_check` vacío, `pragma_foreign_key_list('pagos')` con `restrict` en
    `cliente_id`, `servicio_realizado_id` y `venta_mostrador_id`, `pragma_index_list('pagos')`
    con 3 índices y `pragma_index_list('descuentos_servicio')` con 3 (AC-007 extendido). En la
    nota solo conteos. (b) AC-001…AC-010 sobre una BD de prueba con `0004`…`0008` aplicadas, en
    `.notes/evidencia-venta-mostrador-<fecha>.md`. <!-- atlas-allow: archivo futuro que crea esta condición -->
    (c) Auditoría de superficie crítica antes de integrar (`drizzle/`, `electron/db/schema.ts`,
    `cobros.ts`, `inventario.ts`, `ventasMostrador.ts`, `comprobantes.ts`, `reportesFinanzas.ts`,
    `reinicio.ts`, PROJECT.md), regla 1 del contrato. (d) `APPLIED-MIGRATIONS.md` sin filas
    `0004`…`0008` hasta verificar la instalación real.
    Verificar: existencia de la nota de evidencia con diez AC y la radiografía; nota de auditoría
    con hallazgos codificados; `git diff main -- APPLIED-MIGRATIONS.md` vacío en el PR.
Key Risks:
- Primera recreación de tablas en la historia de la instalación real, con FK activas y dentro
  del mismo `BEGIN` que `0004`…`0007`: si falla, el rollback deja los datos intactos en `0003`
  pero la app no abre hasta un release corregido. La copia previa (`db/index.ts:45-76`) protege
  los datos, no la disponibilidad. La condición 13a es el único candado.
- BR-005 permite bajar el precio de una línea, hasta $0, sin motivo ni PIN: es un descuento sin
  rastro que "descuentos por motivo" no verá. Ya pasa en el cierre (`productosVendidos[].precioUnitario`
  lo manda el renderer), así que no es un patrón nuevo, pero el dueño debe aceptarlo por
  escrito (condición 12).
- Doble envío: una venta no tiene llave natural (el cierre sí: "ya cerrada"); dos clics rápidos
  pueden registrar dos ventas con dos folios. Igual que `registrarAnticipo`. Mitigación: el
  botón se deshabilita mientras la mutación está en curso; declararlo en §9.
- Un release anterior a la `0008` (rollback manual) vería `pagos.cliente_id` NULL donde su tipo
  dice `string` y no sabría que existe `ventas_mostrador`: ventas registradas después de migrar
  quedarían invisibles y sus pagos contarían en corte sin dueño. Reversible con costo.
- `descuentos_servicio` queda con un nombre que ya no describe su contenido; renombrarla
  (`ALTER TABLE RENAME`) es barato pero tocaría la 0006 publicada en el mismo release. Se acepta
  el nombre; el comentario del esquema lo explica.
- Comprobantes de "Público general" en `Datos/Comprobantes/Ventas`: una captura de transferencia
  trae el nombre de quien pagó (PII de alguien que no es clienta). Mismo riesgo que cualquier
  comprobante; sin cifrado en disco (PROJECT.md).
- `generarFolio*` recorre todas las filas con `LIKE 'VTA-%'` y calcula el máximo en JS
  (`inventario.ts:62-87`): O(n) por venta. A volumen de cabina es irrelevante; si se copia el
  patrón, que sea dentro de la transacción.
- COB-B4 heredado: la caché `total_productos` de una venta no cambia si una de sus salidas se
  cancelara por fuera; la condición 7 cierra ese camino, pero CIT-C1 debe heredar la regla.
Accepted Trade-offs:
- Las líneas de la venta son filas de `salidas_inventario` (no hay tabla `ventas_lineas`): cero
  tablas extra, el costo y el precio viven donde ya viven para el cierre; a cambio, el detalle
  agrupa por producto y el total es una caché en la cabecera con escritor único.
- Reutilizar `descuentos_servicio` con dos FK nullables en vez de columnas en `ventas_mostrador`:
  la Parte B escribe un solo modelo para citas y ventas; cuesta recrear una tabla vacía en la
  instalación real y un segundo índice parcial.
- Recrear `pagos` ahora y no en la Parte B: adelanta la mitad de la condición 9 del Gate del
  cobro; con la condición 3 la Parte B solo agrega `tarjeta_regalo_id` con `ALTER TABLE ADD` y
  no vuelve a recrear.
- "Nueva salida" pierde el tipo "Venta" y las salidas viejas no se corrigen: la app no puede
  inventar el precio al que se vendieron; quedan como costo sin ingreso, fuera de margen
  (`costoProductosVendidos` ya las excluye por `precio_unitario_venta IS NULL`).
- Sin PIN para registrar, abonar, descontar ni adjuntar comprobante; PIN para cancelar pagos y
  ventas: coherente con la Parte A y el addendum 2026-11-05.
- Venta solo del día, sin devoluciones parciales, sin CFDI: alcance declarado en §5.
- `0004`…`0008` en un mismo release con una sola copia previa: el candado del tag sigue siendo
  la radiografía (COB-A1 extendida por la condición 13a).
Recommended Next Step: <!-- atlas-allow: encabezado de la plantilla del Gate, no es un nombre de persona -->
Escribir en el spec las condiciones 1, 4, 5, 9, 11 y 12 (addendum de numeración, dueño del módulo,
firmas de `cobros.ts`, contrato IPC, tabla de reportes y §20 completo); después, en una rama nueva
desde `main`, `/atlas migracion` genera la `0008` y se revisa su SQL contra las condiciones 2 y 3
antes de tocar código; luego 4–8 y 10 con `npm run typecheck` y `npm run build` verdes; auditoría
de superficie crítica y nota de evidencia (13b, 13c) antes del PR. El tag que lleve `0004`…`0008`
sale solo después de la radiografía de 13a.
```

## Entradas requeridas

| Entrada | Estado | Dónde |
|---|---|---|
| Problem statement | Presente | §2 del spec; DIN-A5 de la auditoría de dinero; verificado en código (`inventario.ts:462-588` no registra precio ni pago; `costoProductosVendidos` exige `servicio_realizado_id`) |
| Feature specification | Presente | §3–§9, §12, §18 |
| Arquitectura existente | Inspeccionada | `schema.ts`, `db/index.ts`, migrador y plantilla de drizzle-kit, `cobros.ts`, `serviciosRealizados.cerrarCita`, `inventario.ts`, `corte.ts`, `comprobantes.ts`, `reinicio.ts`, lectores de dinero, `SalidaForm.tsx`, `0004`…`0007` |
| Diseño técnico | Presente, con huecos | §10 (tablas, FK, CHECK, índice, migración), §13, §14; faltan dueño del módulo, firmas de `cobros.ts`, contrato IPC y alcance de reportes (condiciones 4, 5, 9, 11) |
| Restricciones | Presentes | §15; PROJECT.md (migración automática e irreversible, repo público, PII, CFF art. 30); migrador en un solo `BEGIN` |
| Decisiones del dueño por escrito | Presentes para la estructura | §20 (clienta opcional, deuda solo con clienta, descuento + cancelar + comprobante + varios métodos, botón en Inicio e Inventario, antes de la Parte B); faltan en §20 cuatro reglas que el spec da por hechas (condición 12) |

Las entradas alcanzan para evaluar: ninguna de las decisiones faltantes cambia esquema ni fronteras.

## Análisis por dimensión

1. **Alineación con el problema.** Resuelve §2 sin ampliarlo: el dinero de la venta entra al corte
   por la misma tabla que ya cuenta (`fuente = 'dinero'`), el importe entra a ventas y margen, y la
   deuda queda en cartera solo si hay clienta. Abonos, lista, detalle y cancelación son
   consecuencias de "registrar una venta como documento de dinero", no alcance extra. Vender
   servicios sin cita, tarjetas y devoluciones parciales quedan fuera (§5). Sin FAIL.
2. **Encaje con el sistema.** Reutiliza los patrones vigentes: documento con estatus y rastro
   (nunca `DELETE`), estatus de pago derivado y escrito por un solo módulo, caché con invariante
   (`total_productos`, `descuento_*`), transacción única síncrona, zod en el borde IPC, bitácora con
   acción nombrada, comprobante por token con el main decidiendo la ruta, folio correlativo
   generado en el main. Dos patrones nuevos: el CHECK de BR-002 sobre `pagos` (contradice la
   convención escrita de 0004/0005/0006 y pinta la Parte B en una esquina → condición 3) y la
   recreación de tablas en la máquina de la clienta (inevitable para cambiar nulidad en SQLite;
   prevista por la condición 9 del Gate del cobro → condiciones 2 y 13a).
3. **Fronteras.** `pagos`, `descuentos_servicio` y los campos derivados: `cobros.ts` (ya escrito en
   `cobros.ts:25-36`). `salidas_inventario`, lotes y movimientos: `inventario.ts`. `ventas_mostrador`:
   el spec no lo dice; §14 lista a `cobros.ts` como "dinero de la venta" y a nadie como dueño de la
   cabecera. Es decidible sin cambiar la estructura (condición 4), con el mismo reparto que
   `serviciosRealizados.ts` / `cobros.ts` tienen hoy. No es FAIL porque hay una sola respuesta
   coherente con el sistema y el spec la implica.
4. **Acoplamiento.** `ventasMostrador → cobros, inventario` es la dirección que ya existe para
   `serviciosRealizados`; `cobros.ts` no gana imports de módulos de negocio. El cambio de firma de
   las funciones de `cobros.ts` (condición 5) toca a sus lectores (`reportesResumen`,
   `reportesFinanzas`, `clientes`), pero es acoplamiento deseado: el compilador detecta al lector
   que no decidió si incluye ventas. `corte.ts` no cambia (verificado: filtra solo por `fuente`).
5. **Modelo de datos.** Entidad correcta: cabecera con clienta opcional, líneas = salidas, pagos y
   descuentos por FK nullable. Relaciones claras una vez que las FK llevan `restrict` (dinero no
   se borra). Restricciones: "exactamente uno" en `descuentos_servicio` es enforzable y estable
   (condición 2c); BR-002 en `pagos` no lo es a largo plazo (condición 3); el índice parcial de la
   0006 no cubre `servicio_realizado_id` NULL (condición 2c). Migración: atómica con copia previa,
   sin backfill; la recreación con FK activas es correcta solo si las filas reales no tienen
   referencias colgantes (condición 13a). Propiedad explícita tras la condición 4. COB-M1 se cierra
   aquí porque esta es la migración que recrea `pagos` (condición 2b).
6. **Seguridad.** Modelo explícito en §11: PIN único, PIN para cancelar pagos y ventas, sin PIN para
   registrar/abonar/descontar. Frontera de confianza: el renderer manda líneas con precio y pagos;
   el main recalcula total, estatus y rutas (§13) y valida FR-005/BR-003/BR-004/BR-007 dentro de la
   transacción (condición 6). Datos sensibles: ninguno nuevo; "Público general" no captura datos;
   bitácora por folio y montos (BR-009). Riesgo declarado: comprobantes de no clientas en disco.
   No es FAIL: el modelo existe y está escrito.
7. **Escalabilidad.** Volumen de una cabina. Lista paginada de 30; reportes con un lector agregado
   por rango; folio O(n) irrelevante a este volumen.
8. **Modos de falla.** Registro y cancelación en una transacción síncrona (sin interleaving en
   better-sqlite3): stock insuficiente en la línea 3 revierte las líneas 1 y 2 (AC-009). Comprobante
   en dos fases con fallo tolerado y bitácora (condición 10). PIN incorrecto: nada cambia.
   Cancelar una venta ya cancelada: rechazada dentro de la transacción. Pagos ya cortados: ajuste
   negativo en el siguiente corte (`ligarPagosACorteEnTx`, sin cambio). Doble envío: sin llave
   natural (riesgo declarado). Migración: falla cerrada con rollback del lote completo y copia
   previa; la disponibilidad depende de la radiografía (13a).
9. **Reversibilidad.** Esquema: recreación de dos tablas, reversible con la copia previa a migrar.
   Código: módulo nuevo y extensión de `cobros.ts`, fácil. Datos: **reversible con costo** — las
   ventas registradas tras la 0008 no existen para un release anterior y sus pagos con
   `cliente_id` NULL contradicen el tipo viejo. UI: quitar el tipo "Venta" es trivialmente
   reversible.
10. **Complejidad.** La más pequeña que cumple. Alternativas descartadas con razón: columnas de
    descuento en `ventas_mostrador` (§10: la Parte B escribiría en dos lugares); tabla de líneas
    propia (duplicaría `salidas_inventario`); un `servicio_realizado` sintético "venta" (ensucia
    ficha clínica, servicios y ticket promedio: BR-006). Lo único especulativo es el segundo índice
    parcial y el CHECK "exactamente uno", y ambos son invariantes cerrados.

## Respuestas al censo del solicitante (verificado en código)

- **Ninguna tabla tiene FK a `pagos`.** Confirmado: `grep "references(() => pagos"` en `schema.ts`
  y `grep "REFERENCES \`pagos\`"` en `drizzle/*.sql` → 0. La recreación no arrastra hijas.
- **Nadie lee `pagos.cliente_id`.** Confirmado en `electron/services`: el único acceso es la
  escritura en `registrarPagosEnTx` (`cobros.ts:276`); `registrarAnticipoSinComprobanteGuardado`
  lee la clienta desde `citas`. El tipo `RegistrarPagosInput.clienteId` pasa a `string | null`.
- **Toda cifra de "ventas" sale de `servicios_realizados`.** Confirmado: `reportesResumen.ts:46-68`,
  `reportesResumen.ts:205-260` (serie), `dashboard.ts:19-37`, `reportesClientesDetalle.ts:48-78`,
  `reportesFinanzas.ts:69-150` (cartera). Cada uno es un lector a decidir (condición 11).
- **`costoProductosVendidos` exige `servicio_realizado_id`.** Confirmado (`cobros.ts:171-193`).
- **Corte y `cobrosDeDinero` toman cualquier `fuente = 'dinero'` sin filtrar `concepto`.**
  Confirmado (`corte.ts:41-51`, `cobros.ts:206`, `ligarPagosACorteEnTx` `cobros.ts:362-383`). Los
  anticipos sin aplicar se cuentan aparte por `concepto = 'anticipo'` (`corte.ts:60`) y no se ven
  afectados.
- **`cancelarPago` recalcula estatus solo con `servicioRealizadoId`.** Confirmado (`cobros.ts:521`).
  Necesita la rama venta y BR-003 (condiciones 5 y 6).
- **`cancelarSalidaEnTx` cancela por folio + `servicio_realizado_id`.** Confirmado
  (`inventario.ts:717-733`); además rechaza salidas ligadas a servicio salvo opción explícita. La
  venta necesita el mismo trato (condición 7).
- **Migrador y PRAGMA.** `SQLiteSyncDialect.migrate` abre un solo `BEGIN` para todas las pendientes
  (`dialect.js:657-676`); la plantilla `recreate_table` de drizzle-kit 0.31 emite `PRAGMA
  foreign_keys=OFF` … `PRAGMA foreign_keys=ON` alrededor de `CREATE __new_` / `INSERT…SELECT` /
  `DROP` / `RENAME` (`bin.cjs:25196-25232`). SQLite ignora ese PRAGMA dentro de una transacción:
  la recreación corre con FK activas, `DROP TABLE pagos` hace un `DELETE` implícito que solo
  fallaría si hubiera hijas (no las hay), y el `INSERT…SELECT` valida cada FK saliente de cada
  fila real (de ahí la condición 13a).
