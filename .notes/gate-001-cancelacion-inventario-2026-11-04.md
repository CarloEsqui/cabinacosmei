# Gate 001 — Architecture Gate: Cancelación de entradas y salidas de inventario (R2b-inventario, DAT-A2) (2026-11-04)

**Fecha:** 2026-11-04 · **Diseño evaluado:** [spec-cancelacion-inventario-2026-11-04.md](spec-cancelacion-inventario-2026-11-04.md)
(§6 FR, §7 BR, §8 propuesta técnica, §9 censo de lecturas, §11 decisiones escritas) · **Responde a:**
[auditoria-integridad-datos-2026-11-03.md](auditoria-integridad-datos-2026-11-03.md) §6 "Proposed change
(DAT-A2)", DAT-B7, DAT-M2, DAT-M4, DAT-A4 · **Relación:** [gate-001-modulo-cobro-2026-11-04.md](gate-001-modulo-cobro-2026-11-04.md)
(numeración `0004` → `0005`/`0006`), [evidencia-dat-a5-m7-b7-2026-11-04.md](evidencia-dat-a5-m7-b7-2026-11-04.md)
(`darDeBajaLote`, en el working tree sin commitear) · **Repo:** rama `atlas/fase1` @ `5180996` + working tree.
**Disparadores:** cambio de BD significativo (migración que corre sola en la máquina de la clienta), API interna
nueva (`inventario:cancelarEntrada` / `cancelarSalida`), cambio de semántica en lecturas de dos superficies
críticas (Dinero: `serviciosRealizados.ts`, `reportesFinanzas.ts`; Migraciones: `drizzle/`, `electron/db/`),
decisión de autorización (sin PIN).
**Método:** solo lectura sobre `electron/db/schema.ts`, `drizzle/0000–0003` + `meta/_journal.json`,
`electron/db/index.ts`, `electron/services/{inventario,reportesInventarioDetalle,reportesResumen,reportesFinanzas,serviciosRealizados,citas,proveedores,bitacora,usuarios,exportarCsv}.ts`,
`electron/ipc/index.ts`, `shared/{schemas,types,ipc-contract}.ts`, `src/pages/inventario/Movimientos.tsx`,
`src/components/inventario/SalidaForm.tsx`; censo con `grep`; lectura del generador instalado
(`drizzle-kit 0.31.10`, `bin.cjs`: `SQLiteAlterTableAddColumnConvertor`, `sqliteCombineStatements`,
`applySqliteSnapshotsDiff`). Se intentó `drizzle-kit generate` sobre una copia en el scratchpad (schema
parchado + `drizzle/` copiado, `node_modules` por symlink): el proceso se queda colgado tras leer la config en
este sandbox (misma clase de cuelgue que `vite build`), así que la promesa "sin recreación" se verificó en el
código del generador, no en su salida. `drizzle/` del repo intacto (`git status --porcelain drizzle electron/db`
vacío). Ninguna base real ni respaldo abierto. Sin PII.

```text
Architecture Gate
Decision:
PASS WITH CONDITIONS
Summary:
El diseño resuelve exactamente DAT-A2 / R2b con la semántica que la auditoría recomendó (Decisión A: estado
`cancelada` sobre la fila + movimiento de reversa, folio y valor intactos, CFF art. 30) y con el patrón que ya
usa el proyecto: transacción síncrona de better-sqlite3, `registrarAccion(tx, …)` dentro de ella, enums en
zod y no en CHECK, migración aditiva generada por drizzle-kit, lote como única fuente de stock
(`cantidad_disponible`) y `movimientos` como libro legible. La invariante BR-002 se sostiene en las cuatro
operaciones (entrada, salida, cancelación de entrada, cancelación de salida), incluidas las entradas sumadas a
un lote existente (`registrarEntrada` con `loteId` suma a `cantidad_inicial`, `inventario.ts:325`; cancelar
resta la misma cantidad) y la merma de un lote caducado (`darDeBajaLote` → `registrarSalidaEnTx`, el lote
vuelve a `activo` con stock y `resumenInventario` lo muestra como "+X caducado", AC-003). Verificado en el
generador instalado: una columna nueva con `NOT NULL DEFAULT` y una columna FK nueva de una sola columna se
emiten como `ALTER TABLE … ADD` (el `create_reference` se descarta en `sqliteCombineStatements` cuando la
columna se agrega en el mismo diff; el orden `jsonAddColumnsStatemets` → `jsonCreatedReferencesForAlteredTables`
lo garantiza); no hay `recreate_table`. Salvedad real: el convertor emite `REFERENCES usuarios(id)` SIN
`ON DELETE SET NULL`, así que la BD quedará con NO ACTION aunque `schema.ts` y el snapshot digan `set null`
(condición 2). El censo de §9 es completo en lo que importa (17 lecturas reales; las 12 que cuentan algo
están nombradas) pero mal etiquetado en `inventario.ts`: no existe lectura de "último costo"; las dos lecturas
que faltan por nombrar son los generadores de folio (`inventario.ts:66,75`), que deben quedar SIN filtro
(condición 1). Lo que impide un PASS limpio son huecos de precisión, no de estructura: tolerancia flotante en
BR-003 (DAT-M2), clave de agrupación de "cancelar por folio", convención de signo en `movimientos.cantidad`,
reutilización del cuerpo por CIT-C1, y el registro del corrimiento de numeración que este diseño impone al
Gate del cobro. Sin PIN es aceptable: no toca registros de dinero, la acción es reversible por recaptura, y la
mitigación escrita (motivo obligatorio, bitácora, fila tachada) existe; solo hace falta que §11 describa la
frontera real (condición 9), igual que se pidió al cobro. No hace falta ninguna decisión nueva del propietario.
Blocking Issues:
Ninguno.
Conditions:
1. Censo corregido en §9: `inventario.ts` tiene 4 lecturas con `from(...)` — `generarFolioEntrada` (:66) y
   `generarFolioSalida` (:75) quedan SIN filtro de estatus, de forma deliberada (el correlativo debe contar
   los documentos cancelados o se repetiría un folio) —, más `registrarEntrada` (:394) y
   `registrarSalidaEnTx` (:570), que no necesitan filtro, y `listarMovimientos` (:642-643, `leftJoin`).
   "Último costo" se elimina del censo. `exportarCsv.ts:202` se agrega como lector que hereda
   `listarMovimientos` (archivo de superficie PII: solo etiquetas).
   Verificar: `grep -rn "from(entradasInventario)\|from(salidasInventario)" electron/services | wc -l` → 17;
   `grep -c "vigente" electron/services/reportesInventarioDetalle.ts` ≥ 6, `reportesResumen.ts` ≥ 2,
   `reportesFinanzas.ts` ≥ 1, `serviciosRealizados.ts` ≥ 2, `citas.ts` ≥ 1;
   `sed -n 60,80p electron/services/inventario.ts | grep -c estatus` → 0.
2. Migración `0004` generada con `npm run db:generate` en la rama, revisada a mano (DAT-M4) y con cabecera
   de `templates/migration-header.sql`. La cabecera declara como DECISIÓN DELIBERADA que la FK
   `cancelada_por_usuario_id` queda en la BD con `ON DELETE NO ACTION` (drizzle-kit 0.31 no emite la cláusula
   en `ADD COLUMN`) mientras `schema.ts` dice `set null`, aceptado porque ningún camino borra `usuarios`
   (`reinicio.ts:12` los conserva). Si se prefiere la semántica exacta, la cláusula se agrega a mano en el
   `.sql` y la cabecera lo dice.
   Verificar: `grep -c "__new_\|DROP TABLE\|PRAGMA foreign_keys\|CREATE TABLE" drizzle/0004_*.sql` → 0;
   `grep -c "^ALTER TABLE" drizzle/0004_*.sql` → 8; `grep -c "REFERENCES usuarios(id)" drizzle/0004_*.sql`
   → 2; `grep -c "NO ACTION\|ON DELETE" drizzle/0004_*.sql` ≥ 1 (en la cabecera o en el SQL);
   `grep -rn "delete(usuarios)" electron | wc -l` → 0; `drizzle/meta/_journal.json` idx 4 con tag que
   contiene `cancelacion`.
3. Tolerancia flotante (DAT-M2) en las dos funciones nuevas: BR-003 rechaza solo si
   `lote.cantidad_disponible + 1e-6 < entrada.cantidad`; "queda en 0 → agotado" usa `<= 1e-6`; las cantidades
   escritas al lote se redondean (`Math.round(x * 1e6) / 1e6`) para que cancelar no deje residuos que
   impidan el siguiente `agotado`. AC-006 usa la consulta de la auditoría con `> 1e-6`.
   Verificar: `grep -c "1e-6" electron/services/inventario.ts` ≥ 3; prueba con lote de 1 pieza, tres
   consumos de 1/3 cancelados y luego la entrada cancelada → lote `agotado`, invariante 0.
4. Clave de agrupación de FR-002 escrita en el spec: una salida de varias filas es "todas las filas de
   `salidas_inventario` con el mismo `folio` y `servicio_realizado_id IS NULL`"; el servicio resuelve el grupo
   DENTRO de la transacción a partir del id recibido, rechaza todo-o-nada si cualquier fila del grupo ya está
   cancelada o ligada a un servicio, y escribe una sola fila de bitácora por grupo. El folio sigue siendo
   generado (los formularios no lo capturan: `SalidaForm.tsx:28`, `EntradaForm.tsx:22`); la cabecera o el
   spec lo anotan como supuesto.
   Verificar: AC nuevo con salida FEFO repartida en 2 lotes → una cancelación deja ambas filas `cancelada`,
   ambos lotes restaurados; `SELECT folio FROM salidas_inventario GROUP BY folio HAVING COUNT(DISTINCT estatus) > 1`
   → 0 filas en la BD de prueba tras todos los AC.
5. Cuerpo reutilizable para CIT-C1 sin cambiar de dirección de dependencias: `cancelarSalidaEnTx(tx, …)` y
   `cancelarEntradaEnTx(tx, …)` exportados con el mismo patrón que `registrarSalidaEnTx`; la regla BR-004
   (rechazar `servicio_realizado_id`) vive en el wrapper público o en un parámetro explícito, para que la
   reversa de un servicio cerrado (su propio Gate) pueda cancelar las filas ligadas dentro de SU transacción.
   `inventario.ts` no importa `serviciosRealizados`.
   Verificar: `grep -c "export function cancelarSalidaEnTx\|export function cancelarEntradaEnTx" electron/services/inventario.ts`
   → 2; `grep -c "serviciosRealizados" electron/services/inventario.ts` → 0.
6. Una sola convención de signo en `movimientos.cantidad`. Hoy toda fila es positiva y `tipo` da la
   dirección (`inventario.ts:377,549`); FR-001 propone `−q` para `cancelacion_entrada` y FR-002 `+q` para
   `cancelacion_salida`, lo que mezcla dos convenciones en la misma tabla. Se elige una (recomendado:
   positiva, `tipo` manda, como hoy), se escribe en el comentario de `schema.ts:193-205`, y el movimiento de
   cancelación lleva `fecha` = día de la cancelación, `referencia_id` = id del documento original y
   `observaciones` = motivo, para que Movimientos se lea en orden cronológico.
   Verificar: `SELECT COUNT(*) FROM movimientos WHERE cantidad < 0` → 0 en la BD de prueba (o, si se elige
   signo, el comentario del esquema lo dice y Movimientos.tsx muestra el signo); `grep -n "cancelacion_" electron/db/schema.ts` ≥ 1.
7. Contrato y UI completos, no solo el servicio: `MovimientoRow` expone lo que FR-004 necesita
   (`referenciaTipo`, `referenciaId`, `estatus` del documento, `canceladaMotivo`, `servicioRealizadoId` o
   equivalente); `TIPO_LABEL` (`Movimientos.tsx`) y `ETIQUETA_MOVIMIENTO` (`exportarCsv.ts`) conocen los dos
   tipos nuevos; el IPC valida con zod (`motivo: z.string().trim().min(1)`) y canal + preload + contrato
   quedan en los tres archivos.
   Verificar: `grep -c "cancelacion_entrada\|cancelacion_salida" src/pages/inventario/Movimientos.tsx electron/services/exportarCsv.ts`
   ≥ 1 por archivo; `grep -c "inventario:cancelarEntrada\|inventario:cancelarSalida" shared/ipc-contract.ts electron/preload.ts electron/ipc/index.ts`
   ≥ 2 por archivo; `npm run typecheck` → exit 0.
8. Corrimiento de numeración registrado, no solo afirmado: el Gate del cobro nombra `0004`/`0005` en sus
   condiciones 1 y 2; esos greps pasan a `drizzle/0005_*.sql` / `0006_*.sql`. Se agrega un addendum fechado
   al spec del cobro (§22.3) o al final de su verdicto — sin reescribir el verdicto — y la migración `0005`
   del cobro se genera SOLO en una rama que ya contiene `0004_*cancelacion*` y `meta/0004_snapshot.json`
   (dos `0004` en ramas paralelas producirían snapshots divergentes).
   Verificar: `grep -n "0005" .notes/spec-modulo-cobro-2026-11-04.md` ≥ 1 con fecha; cuando exista,
   `jq '.entries[4].tag' drizzle/meta/_journal.json` contiene `cancelacion` y `.entries[5].tag` es del cobro.
9. §11 describe la frontera real del riesgo aceptado: con SEG-A1 abierto el IPC es alcanzable desde la
   pantalla de PIN (no solo "con la app abierta"); la bitácora registra cuándo y qué, no quién
   (`usuarios.ts:27-29`); y los reportes son retroactivos — una cancelación saca el documento de las compras
   o mermas del periodo ORIGINAL, no del periodo en que se cancela, porque el inventario no tiene cierres de
   periodo (a diferencia de `pagos`/`cortes`).
   Verificar: `grep -n "SEG-A1" .notes/spec-cancelacion-inventario-2026-11-04.md` en §11 con la palabra
   "PIN" o "bloqueo" en la misma oración; `grep -c "retroactiv" .notes/spec-cancelacion-inventario-2026-11-04.md` ≥ 1.
10. Evidencia antes de integrar, sobre BD de prueba (nunca la real): AC-001…AC-007 más los AC de las
    condiciones 3 y 4, el caso "lote bloqueado dado de baja y merma cancelada" (queda `activo`, ver riesgos) y
    el caso "entrada a lote existente cancelada", con el mismo arnés de
    `evidencia-dat-a5-m7-b7-2026-11-04.md`; `/evidencia` sobre las superficies "Migraciones" y "Dinero"
    (`serviciosRealizados.ts`, `reportesFinanzas.ts` están en `sensitive_globs`); fila `0004` en
    `APPLIED-MIGRATIONS.md` después del release, nunca antes.
    Verificar: `.notes/evidencia-cancelacion-inventario-<fecha>.md` con la salida de cada AC y la consulta <!-- atlas-allow: archivo futuro que crea la condición 10 -->
    BR-002 → 0; `npm run typecheck` → exit 0.
Key Risks:
- Estado previo del lote no se conserva: `darDeBajaLote` sobre un lote `bloqueado` lo deja `agotado`
  (`registrarSalidaEnTx` pone `agotado` al llegar a 0, `inventario.ts:517`); cancelar esa merma lo
  reactiva como `activo`, no como `bloqueado`. Lo mismo si se cancela la última entrada de un lote
  bloqueado ("queda en 0 → agotado"). Aceptable (la operadora vuelve a bloquear; la insignia lo muestra),
  pero debe aparecer en la evidencia de la condición 10.
- `lotes.costo_unitario_lote`, caducidad y proveedor nacen de la PRIMERA entrada (`inventario.ts:336-345`)
  y sobreviven a su cancelación; las salidas posteriores siguen valuándose a ese costo. Con una sola
  entrada por lote (el caso típico) el lote queda en 0 y no importa; con varias, el costo puede ser el de
  una entrada cancelada. Trade-off aceptado abajo.
- Deriva silenciosa entre `schema.ts` (`set null`) y la BD (`NO ACTION`) en la FK nueva: `drizzle-kit check`
  no la ve porque compara snapshots. Hoy inocua (nadie borra usuarios); la condición 2 la deja escrita.
- Omitir `estatus = 'vigente'` en un solo lector vuelve a contar una compra o merma cancelada. La condición 1
  lo hace verificable por grep; el riesgo residual es un lector nuevo futuro.
- SEG-A1 sigue abierto: el candado vive en el renderer. Este diseño no lo empeora (no crea valor ni mueve
  dinero), pero la aceptación debe nombrarlo (condición 9).
- Reportes retroactivos: una cancelación hecha meses después cambia las compras de un mes ya revisado. Sin
  cierre de periodo en inventario no hay alternativa barata; se documenta (condición 9).
Accepted Trade-offs:
- Estado sobre la fila + movimiento de reversa, en lugar de contra-documento: conserva folio, `valor` y
  `total` originales (CFF art. 30) y es el mismo patrón que `pagos.estatus = cancelado` del cobro v2.
- `cantidad_inicial` se decrementa al cancelar una entrada: mantiene "inicial = Σ entradas vigentes" y
  evita que el porcentaje consumido del lote quede falso. Es coherente con `registrarEntrada` + `loteId`.
- Sin PIN para cancelar: decisión escrita del propietario; no toca `pagos`, `cortes` ni `servicios_realizados`;
  reversible por recaptura; motivo + bitácora + fila tachada. El gate exige solo la frontera escrita.
- El lote no se borra aunque todas sus entradas se cancelen (DAT-B7 / Decisión C siguen abiertas): el lote
  queda `agotado` con historial. Correcto bajo "nunca DELETE".
- Enums (`vigente | cancelada`, tipos de movimiento) en zod y en el servicio, no en CHECK: evita recrear
  tablas (DAT-M4) y es la regla ya fijada por el Gate del cobro.
- `proveedores.ts:65` sigue contando entradas canceladas como referencia al proveedor: conservador y
  correcto (la FK es `set null`, el guard es de aplicación).
- Las salidas ligadas a un servicio se rechazan aquí y se resuelven en CIT-C1: evita un camino que
  dejaría un servicio cerrado con insumos "devueltos" y pago intacto.
Recommended Next Step:
Implementar en este orden, en la rama `atlas/fase1` con el working tree de `darDeBajaLote` ya commiteado:
(1) `schema.ts` + `npm run db:generate` → `0004_cancelacion_inventario` con cabecera y revisión DAT-M4
(condición 2); (2) `cancelarEntradaEnTx` / `cancelarSalidaEnTx` + wrappers con tolerancia y clave de grupo
(condiciones 3-6); (3) filtros en los 12 lectores (condición 1); (4) IPC + preload + contrato + Movimientos
(condición 7); (5) correcciones de texto en el spec y addendum al cobro (condiciones 8-9); (6) arnés de AC y
`/evidencia` (condición 10). Después, el cobro v2 Parte A entra como `0005` sin volver a su gate.
```

## Análisis de soporte

### Entradas requeridas

| Entrada | Estado | Dónde |
|---|---|---|
| Problem statement | Presente | spec §2; auditoría DAT §1.5 y DAT-A2; reporte de la prueba manual del 2026-11-04 |
| Feature specification | Presente | spec §3–§7, §10 |
| Arquitectura existente | Inspeccionada | `schema.ts:125-206`, `drizzle/0000–0003` + journal, `db/index.ts` (DAT-A4 implementado), `inventario.ts` completo (incluido `darDeBajaLote` sin commitear), lectores listados en Método, `ipc/index.ts:170-194`, `Movimientos.tsx`, generador drizzle-kit instalado |
| Diseño técnico | Presente | spec §8 (migración), §6 (algoritmos), §9 (censo) |
| Restricciones | Presentes | PROJECT.md (`apply_method` automático, CFF art. 30, repo público, sin tests); DAT-M2, DAT-M4 |
| Decisiones del propietario por escrito | Presentes | spec §4 y §11: inventario antes que cobro; sin PIN con motivo y confirmación; fuera de alcance salidas ligadas a servicio, edición y borrado de lote |

Ninguna decisión falta. Los puntos que este verdicto deja como condición (clave de grupo, signo, tolerancia,
frontera del riesgo) son técnicos o de redacción; ninguno obliga a una nueva ronda cuando se cierren.

### Las diez dimensiones

1. **Alineación con el problema.** Uno a uno con DAT-A2 y con R2b de la usuaria; el alcance excluye con
   justificación las salidas de un servicio cerrado (CIT-C1 depende de la cancelación de pagos del cobro v2).
   No resuelve un problema distinto ni más amplio. "Dar de baja accidental" (DAT-A5) queda cubierto porque
   `darDeBajaLote` produce una merma suelta sin `servicio_realizado_id`.
2. **Encaje con el sistema.** Mismo patrón que `registrarSalidaEnTx` / `registrarSalida` (cuerpo sobre `tx`,
   wrapper con transacción), `registrarAccion(tx, …)`, `usuarioActualId()` desde el IPC, zod en
   `shared/schemas.ts`, canal por namespace `inventario:*`, migración aditiva como `0003`. El estado sobre la
   fila replica `pagos.estatus` / `servicios_realizados.estatus`. Único desajuste: el censo etiqueta mal dos
   lecturas (condición 1).
3. **Fronteras.** `inventario.ts` es propietario de `lotes`, `entradas`, `salidas` y `movimientos` (ya lo es: ningún
   otro servicio escribe en ellas, `reinicio.ts` aparte); la cancelación vive ahí. BR-004 define el límite con
   `serviciosRealizados.ts`. Lo único ambiguo era quién decide la regla BR-004 cuando llegue CIT-C1; la
   condición 5 lo fija sin cambiar la dirección `serviciosRealizados → inventario`.
4. **Acoplamiento.** No crea dependencias nuevas: los reportes ya leen las tablas; solo ganan una cláusula.
   `citas.ts:286` gana un filtro que hoy es inerte (no se pueden cancelar salidas ligadas) pero correcto.
5. **Modelo de datos.** Cuatro columnas aditivas con DEFAULT o nullable; sin backfill; sin índice nuevo
   (`estatus` tiene dos valores; a esta escala no aporta). Restricciones de aplicación, verificadas dentro de
   la transacción. Invariante BR-002 comprobada caso por caso:
   - entrada nueva: `+q` a `inicial` y `disponible`; cancelarla: `−q` a ambas, solo si `disponible ≥ q`;
   - entrada a lote existente (`inventario.ts:321-330`): idéntico; con E1=10, E2=5 y 8 consumidas,
     cancelar E2 deja `disponible 2 = 10 − 8` y `inicial 10`; cancelar E1 se rechaza (7 < 10);
   - salida: `−tomar` por lote; cancelarla: `+q` por fila del grupo; `inicial` intacta;
   - merma de lote caducado: cancelar devuelve `q`, `agotado → activo`; `lotesCaducados` (`:272-290`) lo
     vuelve a listar porque filtra por `disponible > 0 AND fecha < hoy` sin mirar `estado`; `resumenInventario`
     lo suma a `stockCaducado`, no a `stockTotal`. AC-003 es correcto.
   Migración: el migrador síncrono corre todo en un BEGIN (verificado en el Gate del cobro) y `db/index.ts`
   copia la BD antes (DAT-A4, ya implementado). La salida del generador se predijo desde `bin.cjs`:
   `_prepareSqliteAddColumns` adjunta `referenceData` a la columna nueva; `sqliteCombineStatements` descarta
   el `create_reference` de una columna recién agregada (no multicolumna) y no produce `recreate_table` para
   `sqlite_alter_table_add_column` salvo que la columna sea PK; `SQLiteAlterTableAddColumnConvertor` escribe
   `ALTER TABLE \`t\` ADD \`c\` text DEFAULT 'vigente' NOT NULL;` y
   `… ADD \`cancelada_por_usuario_id\` text REFERENCES usuarios(id);` — sin `ON DELETE`. De ahí la condición 2.
6. **Seguridad.** Modelo explícito: sin PIN, decisión escrita, con motivo obligatorio, confirmación, bitácora
   y rastro visible. Lo que se puede alterar sin PIN: stock, compras y mermas de reportes; no `pagos`, no
   `cortes`, no PII. Es menos de lo que ya se puede hacer sin PIN hoy (registrar una entrada o una salida).
   La aceptación describe mal la frontera (SEG-A1: alcanzable desde la pantalla de PIN) — condición 9, misma
   exigencia que la condición 10 del cobro. `cancelada_motivo` es texto libre: tratarlo como `clientes.notas`
   (sin nombres en bitácora ni en CSV); la UI debería pedirlo. Validación de entrada en el main con zod.
7. **Escalabilidad.** Volumen de una cabina. `generarFolioSalida` carga todos los folios (ya lo hace hoy);
   `listarMovimientos` está limitado a 500. Nada nuevo.
8. **Modos de falla.** Transacción síncrona, nada async dentro (el patrón de `cerrarCita`); doble clic → la
   segunda llamada ve `cancelada` dentro de la transacción y rechaza (AC-005); motivo vacío rechazado en zod y
   en el servicio; grupo parcial imposible si se resuelve dentro de la transacción (condición 4); migración
   falla cerrada con copia previa. Residuos flotantes: sin la condición 3, un lote con 9.9999999 rechazaría
   cancelar una entrada de 10 legítima.
9. **Reversibilidad.** Esquema aditivo: fácil. Datos: una cancelación se deshace recapturando; nada se borra.
   Un downgrade de la app contaría las filas canceladas (no conoce el filtro): irrelevante salvo rollback de
   release, y el respaldo previo a migrar lo cubre. **Fácilmente reversible.** La numeración `0004` sí es
   difícil de revertir una vez publicada: por eso la condición 8 pide generar el cobro encima, no en paralelo.
10. **Complejidad.** La mínima que cumple: dos funciones, dos canales, cuatro columnas por tabla, una acción
    en una pantalla existente. Alternativas más simples (borrar) violan CFF; más complejas (contra-documento,
    versionado) no aportan.

### Respuestas a las preguntas del solicitante

- **¿Censo §9 completo?** Sí en lo sustantivo: 17 `from(...)` reales (`reportesInventarioDetalle` 6,
  `reportesResumen` 2, `reportesFinanzas` 1, `serviciosRealizados` 2, `citas` 1, `proveedores` 1,
  `inventario` 4) + `listarMovimientos` por `leftJoin`. Los 12 que cuentan dinero, stock o unidades están
  nombrados. Falta nombrar los dos generadores de folio como "sin filtro, deliberado" y quitar "último
  costo", que no existe; `exportarCsv.ts` hereda. `dashboard.ts` y `reportesServiciosDetalle.ts` no leen
  estas tablas (el segundo lee `servicios_productos_consumidos`, vacía por DAT-M6).
- **¿drizzle-kit 0.31 emite `ALTER TABLE ADD COLUMN` sin recrear?** Sí, verificado en el código del
  generador instalado (no en su salida: el proceso se cuelga en este sandbox). Con una salvedad que el Gate
  del cobro no registró: la FK agregada por `ADD COLUMN` sale sin `ON DELETE`. Aplica también a
  `pagos.corte_id`, `pagos.cita_id`, `pagos.cancelado_por` y `pagos.tarjeta_regalo_id` del cobro v2 —
  conviene que ese diseño lo tenga en cuenta al escribir su cabecera.
- **Invariante y casos límite.** BR-002 se sostiene en todos los casos analizados (dimensión 5). Casos que
  el spec no decide y este verdicto fija como condición: tolerancia (3), clave de grupo por folio (4),
  signo del movimiento (6). Caso aceptado como riesgo: lote bloqueado que vuelve `activo`.
- **Autorización sin PIN.** Adecuada con la frontera escrita correctamente (condición 9). Argumentos: no
  hay registro de dinero involucrado (las ventas sueltas no crean `pagos`, `inventario.ts` no inserta en
  esa tabla); la acción es reversible; la mitigación nombrada existe de verdad (a diferencia de "quién", que
  no existe con un solo usuario). Registrar una entrada o salida tampoco pide PIN hoy; cancelarla no es más
  privilegiado que crearla.
- **Numeración y conflicto con el cobro.** Correr `0004`→`0005`/`0006` no invalida ninguna condición del
  Gate del cobro: sus condiciones 1 y 2 son sobre contenido y se verifican con greps que solo cambian de
  número; su condición 2 prohíbe CHECK o cambios de nulidad sobre `salidas_inventario`, y este diseño hace
  `ADD COLUMN` (permitido). `salidas_inventario.precio_unitario_venta` (cobro) y `estatus` (este) coexisten.
  Parte A no cancela salidas; CIT-C1 lo hará llamando el `EnTx` de la condición 5. El único riesgo real es
  generar ambas `0004` en ramas paralelas: condición 8.
- **¿Hace falta algo más del propietario?** No. Todo lo pendiente es técnico o de redacción.

### Lo que este verdicto no cubre

CIT-C1 (reversa de un servicio cerrado) tiene su propio Gate. Decisión C / DAT-B7 (borrar lote) sigue
abierta y no cambia con este diseño. No se evaluó la UI más allá de FR-004 y del contrato que necesita.
