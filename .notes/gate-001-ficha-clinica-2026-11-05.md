# Gate 001 — Architecture Gate: Ficha clínica facial (2026-11-05)

**Fecha:** 2026-11-05 · **Diseño evaluado:** [spec-ficha-clinica-2026-11-05.md](spec-ficha-clinica-2026-11-05.md)
(§10 datos nuevos, §11 autorización, §13 no funcionales, §14 integraciones, §15 restricciones, §17
preguntas abiertas con la decisión escrita del dueño) · **Repo:** rama `atlas/cobro-a` @ `efc4795`
con la Parte A del cobro sin commitear (`drizzle/0005_cobro_v2.sql` presente; la ficha será la
`0006` y la Parte B pasa a la `0007`, addendum 2026-11-05 del spec del cobro) · **Disparadores:**
módulo nuevo (servicio de fichas clínicas), cambio de BD significativo (dos tablas que corren solas
en la máquina de la clienta), datos **sensibles** nuevos (salud y rostro, LFPDPPP 2025), API
interna nueva (canales `fichas:*`), escritura nueva sobre `servicios_realizados` (superficie
Dinero), cambio en Reinicio (superficie Respaldos/Reinicio), difícil de revertir (una vez
capturados, los datos de salud existen en BD, respaldos y copias previas a migrar).
**Método:** solo lectura sobre `electron/services/{archivos,folders,respaldos,reinicio,clientes,
serviciosRealizados,citas,bitacora,exportarCsv,usuarios,migracionCarpetas}.ts`, `electron/db/{schema,
index}.ts`, `electron/ipc/index.ts`, `electron/preload.ts`, `electron/main.ts`, `index.html`,
`shared/*`, `src/pages/Clientes.tsx`, `src/pages/agenda/{CitaDetalleModal,CierreCitaModal}.tsx`,
migraciones `0000`, `0004` y `0005`, journal de drizzle, `package.json`, PROJECT.md y la plantilla de
cabecera de Atlas. No se abrió ninguna base real ni respaldo. Sin PII: clientas solo por código.

```text
Architecture Gate
Decision:
PASS WITH CONDITIONS
Summary:
El diseño resuelve exactamente el problema de §2 (antecedentes en papel, sin aviso de
contraindicación en la cita, sin fotos ligadas al tratamiento) con la arquitectura más pequeña que
cabe en este sistema: dos tablas nuevas (`fichas_clinicas` 1:1 con la clienta y
`fichas_clinicas_versiones` como instantáneas del estado anterior), fotos como filas de `archivos`
con dos categorías nuevas dentro de la carpeta del servicio que ya existe, notas del tratamiento
en la columna `servicios_realizados.observaciones` que ya existe, y miniaturas servidas por el
main como data URL (la CSP de `index.html` ya permite `img-src data:`; no hay `<img>` en el
renderer hoy, así que es la primera imagen que se dibuja). Las cinco decisiones técnicas que se
pidieron juzgar salen bien paradas: (1) JSON validado con zod es la elección correcta para
`datos` — 45 preguntas que ninguna consulta filtra, un formato en papel que cambiará, y un
precedente ya vivo (`configuracion.valor` parseado con zod en `config.ts:14`, `cortes.*_json`);
columnas tipadas duplicarían 45 columnas en la tabla de versiones sin ganar nada; (2) el
versionado "vigente + instantánea previa en una transacción" es el modelo mínimo que cumple
FR-006/BR-002, pero tiene dos huecos que se vuelven condiciones: la comparación "¿cambió algo?"
debe ser canónica y la ficha se abre desde dos sitios (Clientes y detalle de cita), así que un
guardado puede pisar otro en silencio — y lo que se pisa puede ser una contraindicación; (3)
reutilizar `archivos` es correcto y el diseño corrige de paso un defecto del patrón actual:
`archivos:subirComprobante` deja que el renderer elija `carpetaDestino` (`ipc/index.ts:284`),
mientras que aquí el main resuelve la ruta desde el servicio (BR-007); falta decidir quién crea la
carpeta cuando el servicio o la clienta no la tienen (`serviciosRealizados.ts:126` deja
`carpetaPath` null si la clienta no tiene carpeta); (4) data URL con `nativeImage` es la opción
más pequeña y segura frente a `file:` (el renderer leería cualquier imagen del disco y no funciona
bajo el dev server) o un protocolo propio (registro privilegiado + cambio de CSP, que solo se
justifica si llega un visor dentro de la app); el riesgo real es otro: `nativeImage.createFromPath`
es síncrono en el main, y decodificar decenas de fotos de celular de golpe congela toda la app, así
que las miniaturas deben pedirse de una en una y de forma perezosa; (5) editar `observaciones` tras
el cierre es legítimo (no es dinero) pero debe vivir en `serviciosRealizados.ts`, el dueño de la
tabla, con un `set()` que toque solo esa columna, y pasa por auditoría por regla del contrato. Lo
que impide un PASS limpio: Q-001 es un conflicto entre la decisión del dueño (consentimiento
implícito) y el contrato vigente (PROJECT.md exige "el flujo de consentimiento" para notas
clínicas y fotos); este gate no puede aprobar un diseño que contradice el contrato tal como está
escrito, ni puede resolverlo por el dueño — la salida es que el dueño reconcilie ambos por escrito
(edita el contrato o adopta la opción b) antes de generar la `0006`, que es donde la opción b
cuesta dos columnas y después costaría una migración más. Q-002 no cambia la arquitectura, pero
con `restrict` y sin una acción de "borrar ficha" los datos de salud de una clienta solo
desaparecen con el reinicio de datos; eso debe ser una decisión escrita, no una omisión.
Blocking Issues: <!-- atlas-allow: encabezado de la plantilla del Gate, no es un nombre de persona -->
Ninguno a nivel de arquitectura. Las condiciones 1 y 2 son decisiones del dueño que faltan por
escrito (regla del gate: se piden, no se suponen); ninguna obliga a cambiar la estructura
propuesta, y el diseño de datos admite la opción (b) de Q-001 sin rehacerse, como dice el spec.
Conditions:
1. Q-001 reconciliado por escrito ANTES de generar `0006`. O bien (a) el dueño edita PROJECT.md
   (sección "Marco legal relevante" y `pii.notes`) registrando que la ficha clínica y las fotos
   entran con consentimiento tácito como riesgo aceptado, con fecha y el pendiente del abogado;
   o bien (b) `fichas_clinicas` gana `consentimiento_firmado_at` (texto ISO, nullable) y
   `consentimiento_nota` (texto, nullable) en la misma `0006`, con la casilla en el paso Datos.
   Un chat no enmienda el contrato: hasta que uno de los dos esté hecho, el release que lleve la
   `0006` no sale.
   Verificar: §17 Q-001 marcado "resuelta" con fecha y opción; si (a), `git diff main -- PROJECT.md`
   toca "Marco legal" o `pii.notes`; si (b), `grep -c "consentimiento" drizzle/0006_*.sql` ≥ 2 y
   `grep -c "consentimiento" shared/schemas.ts` ≥ 1.
2. Q-002 decidido por escrito y reflejado en el esquema. La FK `fichas_clinicas.cliente_id` lleva
   `ON DELETE restrict` explícito en la `0006` (drizzle-kit sí lo emite dentro de `CREATE TABLE`,
   `0000_lively_nuke.sql:57`; verificar que aparezca) y `fichas_clinicas_versiones.ficha_id`
   lleva `ON DELETE restrict` o `cascade` según se decida (si se borra una ficha, sus versiones
   no pueden quedar huérfanas). `eliminarCliente` (`clientes.ts:134-138`) amplía su mensaje para
   nombrar la ficha clínica. Y el dueño escribe si existe o no una acción "Borrar ficha clínica"
   (derecho de cancelación LFPDPPP; con PIN, borra ficha, versiones y fotos) — si no existe, §17
   lo registra como riesgo aceptado hasta que se resuelva NOM-004.
   Verificar: `grep -n "ON DELETE" drizzle/0006_*.sql` muestra las dos FK; `grep -c "ficha" electron/services/clientes.ts` ≥ 1
   en el mensaje de `eliminarCliente`; §17 Q-002 "resuelta" con la decisión sobre borrado.
3. Migración `0006` puramente aditiva y generada en una rama que ya contiene la `0005`: solo
   `CREATE TABLE` e índices (`CREATE UNIQUE INDEX` sobre `fichas_clinicas.cliente_id`; índice
   sobre `fichas_clinicas_versiones.ficha_id`), ningún `ALTER` sobre tablas existentes, cabecera
   con la plantilla de Atlas (`templates/migration-header.sql`: evidencia, qué cambia, decisiones
   deliberadas incluidas Q-001/Q-002, verificación manual al final), entrada idx 6 en el journal.
   Verificar: `grep -c "ALTER TABLE\|__new_\|DROP TABLE" drizzle/0006_*.sql` → 0;
   `grep -c "CREATE UNIQUE INDEX" drizzle/0006_*.sql` ≥ 1; `drizzle/meta/_journal.json` con idx 6
   y tag `0006_*`; las primeras líneas del archivo siguen la plantilla.
4. Guardar en UNA transacción con comparación canónica y control de concurrencia optimista. El
   input de `fichas:guardar` lleva `updatedAtEsperado` (el `updated_at` que el modal cargó);
   dentro de `db.transaction`: leer la vigente; si no existe → insertar; si
   `updated_at != updatedAtEsperado` → rechazar con "La ficha cambió en otra ventana; vuelve a
   abrirla"; comparar el estado completo (sexo, ocupación, `datos`) normalizado en el main (claves
   ordenadas, `undefined` → `null`, especifique descartado cuando la respuesta no es Sí); si es
   igual → no insertar versión, no tocar `updated_at`; si cambió → insertar la instantánea previa,
   actualizar la vigente, bitácora. Sin `await` dentro de la transacción (patrón de `cobros.ts`).
   Verificar: `grep -n "updatedAtEsperado" shared/schemas.ts electron/services/fichasClinicas.ts` ≥ 2;
   AC-003 en BD de prueba; prueba manual: abrir la ficha desde Clientes y desde el detalle de una
   cita, guardar en la primera, guardar en la segunda → la segunda es rechazada.
5. Semántica de `fichas_clinicas_versiones` escrita y autocontenida. Cada fila guarda la
   instantánea COMPLETA del estado anterior (sexo, ocupación, `datos`, `version_formulario`), más
   `vigente_desde` (= el `updated_at` que tenía la vigente) y `vigente_hasta` (= momento del
   guardado que la reemplazó) y `usuario_id` del guardado que la reemplazó. Así una versión se lee
   sola, sin reconstruir nada, y "fecha" en FR-006 deja de ser ambigua.
   Verificar: `schema.ts` define esas columnas en `fichasClinicasVersiones`; §10 del spec las
   describe; AC-002 en BD de prueba muestra la versión con su rango de vigencia.
6. Una sola definición del formulario en `shared/schemas.ts`: `fichaClinicaDatosSchema` con toda
   respuesta nullable (tri-estado, BR-003), BR-004 aplicado en el main (no solo en la UI),
   `version_formulario` entero NOT NULL = 1, y la lista de FR-009 como constante exportada
   (`PREGUNTAS_PRECAUCION`) usada tanto por el cálculo del aviso en el main como por la UI. Leer
   una versión vieja usa `safeParse` y nunca lanza: si no valida, la vista muestra "versión con
   formato anterior" con el JSON tal cual.
   Verificar: `grep -c "fichaClinicaDatosSchema\|PREGUNTAS_PRECAUCION" shared/schemas.ts` ≥ 2;
   `grep -rn "PREGUNTAS_PRECAUCION" electron src | wc -l` ≥ 3; AC-002 y AC-004 en BD de prueba
   (guardar Alergias = No con texto en especifique → la fila guarda `null`).
7. Subir foto: canal nuevo `fichas:subirFoto(servicioRealizadoId, 'antes' | 'despues')` sin
   ningún parámetro de ruta; el main resuelve la carpeta. Reglas escritas en el spec y en el
   código: (a) solo servicios con `estatus = 'cerrado'` aceptan fotos (así `eliminarCita`,
   `citas.ts:292-298`, nunca ve una foto en un borrador y su mensaje "comprobante subido" sigue
   siendo cierto); (b) si `servicios_realizados.carpeta_path` es null, la crea una función de
   `serviciosRealizados.ts` (dueño de la tabla) a partir de `clientes.carpeta_path`; si la clienta
   tampoco tiene carpeta, se crea primero con `crearCarpetaCliente` (precedente `clientes.ts:76`)
   o se rechaza con mensaje — el spec elige; (c) extensión en lista blanca Y
   `nativeImage.createFromPath(ruta).isEmpty()` → rechazo "Esa foto no se pudo leer…";
   (d) `archivos.tipo_mime` se llena (hoy `guardarArchivoDesdeRuta` lo deja null);
   (e) `guardarArchivoDesdeRuta` conserva su `rutaDentroDe`.
   Verificar: la firma en `shared/ipc-contract.ts` no tiene parámetro de ruta;
   `grep -n "update(serviciosRealizados)" electron/services/fichasClinicas.ts electron/services/archivos.ts` → 0;
   AC-005 y AC-006 en BD de prueba, incluido el caso "clienta sin carpeta".
8. Miniaturas y apertura por `archivoId`, una por llamada y perezosas. `fichas:miniatura(archivoId)`
   resuelve `ruta_fisica` desde `archivos`, valida `rutaDentroDe(rutaFisica, carpetaDatos(raiz))`,
   redimensiona a ≤ 320 px y devuelve `data:image/jpeg;base64,…` construido con `toJPEG(…)` (no
   `toDataURL()`, que emite PNG y pesa 3-5×); archivo ausente → `{ faltante: true }` (flujo
   "Foto no encontrada"). `fichas:abrirFoto(archivoId)` → misma validación → `shell.openPath`.
   `fichas:quitarFoto(archivoId)` → misma validación → borra fila y archivo, bitácora. La UI pide
   cada miniatura al montarse su `<img>` (una query por foto, cacheada por `archivoId`), nunca
   todas las de la ficha en un solo IPC. Sin `file:` nuevos en el renderer, sin protocolo propio,
   sin cambio de CSP.
   Verificar: `grep -rn "file://" src` → 0; ninguna firma de `fichas:*` en `shared/ipc-contract.ts`
   recibe rutas; `grep -c "rutaDentroDe" electron/services/fichasClinicas.ts` ≥ 3 (o donde vivan
   los tres handlers); prueba manual con ≥ 20 fotos de celular (≥ 8 MP) en un servicio: la ficha
   abre sin congelar la ventana.
9. Notas del tratamiento tras el cierre: `actualizarObservacionesServicio(id, observaciones,
   usuarioId)` vive en `serviciosRealizados.ts`, su `set()` contiene exactamente `observaciones` y
   `updatedAt`, no toca `estatus`, `estatus_pago`, `precio`, `total_productos` ni `cerrado_at`,
   y registra `observaciones_servicio_actualizadas` en bitácora con el código del servicio y sin
   contenido. El spec escribe en §7 la decisión de que estas notas NO se versionan (a diferencia
   de la ficha) como decisión del dueño, y la integración pasa por auditoría de la superficie
   Dinero por regla 1 del contrato (el archivo está en `sensitive_globs`).
   Verificar: `grep -n "update(serviciosRealizados)" electron/services/fichasClinicas.ts` → 0;
   el diff de `serviciosRealizados.ts` agrega una sola función y ninguna línea en `cerrarCita`;
   `grep -n "no se versionan\|no se versiona" .notes/spec-ficha-clinica-2026-11-05.md` ≥ 1.
10. Reinicio y respaldos. `fichasClinicasVersiones` y `fichasClinicas` entran en `TABLAS_NEGOCIO`
    (`reinicio.ts:15-33`) antes de `clientes`. BR-008 se corrige: las fotos se borran del disco
    solo si la usuaria marca "eliminar archivos" (`reinicio.ts:62-65`); con la opción apagada los
    archivos de salud quedan en disco sin fila en la BD, y el spec lo dice tal cual. Respaldos no
    cambia (`crearRespaldo` ya comprime `Datos/` completo y `aplicarRespaldoDesdeArchivo` lo
    restaura; `migrarRutasCarpetas` ya reescribe `archivos.ruta_fisica`).
    Verificar: `grep -c "fichasClinicas" electron/services/reinicio.ts` → 2; AC-007 en BD de
    prueba (zip contiene las fotos; tras reinicio con "eliminar archivos" las dos tablas y la
    carpeta del servicio quedan vacías); texto de BR-008 actualizado.
11. BR-006 verificable por grep, no por promesa. Ningún lector fuera de `fichasClinicas.ts` toca
    las tablas nuevas; `clientes:obtenerExpediente` y el detalle de cita reciben solo el resumen
    del aviso (preguntas marcadas + especifique), nunca `datos` completo; todas las llamadas a
    `registrarAccion` del módulo llevan `detalle` fijo o con código (`CL-0001`, `SRV-0001`).
    Verificar: `grep -rln "fichasClinicas\b\|fichas_clinicas" electron/services | grep -v "fichasClinicas.ts\|reinicio.ts"`
    → vacío; AC-008 ampliado a `electron/services/dashboard.ts electron/services/clientes.ts`
    → 0; revisión del diff: ningún `detalle:` en `fichasClinicas.ts` interpola texto de `datos`
    ni de `observaciones`.
12. PROJECT.md en el mismo PR, editado por el dueño: `sensitive_globs` agrega
    `electron/services/fichasClinicas.ts`; `pii.notes` nombra `fichas_clinicas`,
    `fichas_clinicas_versiones` y las categorías `foto_antes`/`foto_despues` como datos
    sensibles de salud y rostro. Si Q-001 sale por (a), es el mismo cambio.
    Verificar: `grep -c "fichasClinicas.ts" PROJECT.md` → 1; `grep -c "fichas_clinicas" PROJECT.md` ≥ 1.
13. El spec gana una sección de diseño técnico (como §22 del cobro) antes de implementar: nombre
    del módulo (`electron/services/fichasClinicas.ts`), tabla de canales `fichas:*` con firmas,
    dueño de cada tabla/columna que se escribe (`fichas_clinicas*` → fichasClinicas;
    `archivos` → archivos.ts; `servicios_realizados.observaciones` y `carpeta_path` →
    serviciosRealizados.ts) y la dirección de dependencias:
    `fichasClinicas → archivos, folders, serviciosRealizados, bitacora, config`; nadie importa
    `fichasClinicas` salvo `ipc/index.ts` y `reinicio.ts`.
    Verificar: sección presente en el spec; `grep -rln "from \"./fichasClinicas\"" electron/services`
    → solo `reinicio.ts` (si lo importa) y ninguno más.
Key Risks:
- Guardado cruzado entre el modal de Clientes y el del detalle de cita: sin la condición 4, la
  segunda ventana pisa la primera en silencio; ninguna versión se pierde (la instantánea captura el
  estado intermedio), pero la vigente puede perder un "Embarazo: Sí" recién capturado, y FR-009 deja
  de avisar.
- Main congelado por miniaturas: `nativeImage.createFromPath` + `resize` son síncronos; 30 fotos
  de 12 MP decodificadas en un solo handler son varios segundos con la UI muerta. La condición 8 lo
  evita por diseño; si aun así resulta lento, el siguiente paso es cachear las miniaturas en disco
  dentro de la carpeta del servicio (así entran al respaldo), no un protocolo nuevo.
- Datos sensibles nuevos en una BD, una carpeta y unos respaldos sin cifrar (PROJECT.md → pii).
  Esta feature no lo empeora técnicamente, pero cambia lo que hay dentro: respuestas de salud
  estructuradas y fotos de rostro. Las copias `cabina_antes_de_migrar_*.sqlite3` y los respaldos
  "antes_de_*" (que nunca se podan) las conservan indefinidamente. SEG-A1 sigue abierto: el IPC
  es alcanzable desde la pantalla de bloqueo, así que "app desbloqueada" en §11 describe la UI, no
  la frontera real.
- NOM-004 pendiente: si la cosmiatría cuenta como atención médica, "Quitar foto" (borra el archivo)
  y las notas no versionadas (condición 9) van contra la conservación del expediente. Hoy es un
  pendiente del dueño; las condiciones 2 y 9 dejan la decisión escrita para que no se descubra
  después.
- Deriva del formulario: todo el valor del JSON depende de la disciplina de `version_formulario`
  y de un solo esquema (condición 6). Una pregunta renombrada sin subir la versión hace ilegibles
  las versiones viejas en silencio.
- `archivos.entidad_id` sin FK (texto): las fotos de un servicio no se borran con él. Hoy ningún
  camino borra servicios cerrados y `eliminarCita` rechaza borradores con archivos; la condición
  7(a) mantiene esa invariante.
- La carpeta de la clienta en disco lleva su nombre (`folders.ts:74`); las fotos de rostro quedan
  bajo esa ruta. Patrón ya existente, no introducido aquí; se anota porque sube el costo de un
  disco perdido.
Accepted Trade-offs:
- `datos` como JSON validado con zod en lugar de ~45 columnas tipadas: la integridad vive en el
  esquema de zod y en un solo escritor, no en la BD; aceptable porque ninguna consulta filtra por
  pregunta, BR-006 prohíbe reportes sobre esos datos, y `json_extract` de SQLite existe si algún
  día hiciera falta.
- Versionado por instantánea del estado anterior (no bitácora de eventos ni diffs): la lectura es
  trivial, el costo es copiar un blob pequeño por guardado real; BR-002 lo exige así.
- Miniaturas como data URL por IPC en lugar de un protocolo propio: base64 por imagen (≈ 20-60 KB a
  320 px JPEG) y una llamada por foto; proporcional a decenas de fotos por clienta, no a miles.
- Abrir en grande con el visor del sistema (`shell.openPath`), sin visor dentro de la app ni
  comparador: fuera de alcance por §5.
- Recomendación para casa con `{productoId, nombre}` copiado dentro de `datos`, sin FK: la ficha
  no cambia si el producto se edita, desactiva o borra; es lo que pide §10.
- Notas del tratamiento editables sin versionar (condición 9 pide que quede escrito).
- Autorización: PIN único de la app, sin PIN extra para ver o editar datos de salud (§11); es el
  modelo de roles de PROJECT.md, no un defecto de este diseño. La bitácora registra cuándo, no
  quién (`usuarios.ts:27-29`, un solo usuario por defecto).
- Sin cifrado de BD, carpeta ni respaldos: fuera del alcance de esta feature, declarado en §10 y
  §15; sigue siendo el pendiente más caro del contrato.
Recommended Next Step: <!-- atlas-allow: encabezado de la plantilla del Gate, no es un nombre de persona -->
El dueño cierra las condiciones 1 y 2 por escrito (Q-001: (a) editar PROJECT.md o (b) dos
columnas; Q-002: `restrict` y si existe "Borrar ficha") y la 13 (sección técnica del spec). Con
eso, generar la `0006` en una rama que ya contenga la `0005` committeada, cumplir 3, 5 y 6 en el
mismo commit, implementar el módulo con 4, 7, 8, 9, 10 y 11, y pasar `/evidencia` sobre las
superficies PII (`archivos.ts`, `clientes.ts`, `fichasClinicas.ts`), Dinero
(`serviciosRealizados.ts`), Reinicio (`reinicio.ts`) y Migraciones (`drizzle/0006`, `schema.ts`)
antes de integrar, con los AC-001…AC-010 ejecutados sobre una BD de datos ficticios. El release
que lleve la `0006` sale después de que `APPLIED-MIGRATIONS.md` tenga la fila verificada de la
`0005`. No hace falta volver a este gate salvo que Q-001 o NOM-004 traigan un flujo nuevo
(firma dentro de la app, bloqueo de borrado por retención) o que se agregue un visor con protocolo
propio.
```

## Análisis de soporte

### Entradas requeridas

| Entrada | Estado | Dónde |
|---|---|---|
| Problem statement | Presente | spec §2 (formato en papel de 5 páginas, sin aviso en cita, sin fotos ligadas) |
| Feature specification | Presente | spec §3–§19, FR-001…FR-010, BR-001…BR-009, AC-001…AC-010 |
| Arquitectura existente | Inspeccionada | `schema.ts` (`archivos`, `servicios_realizados`, `clientes`), `db/index.ts` (migrador + copia previa), `archivos.ts`, `folders.ts`, `respaldos.ts`, `reinicio.ts`, `clientes.ts`, `citas.ts`, `serviciosRealizados.ts`, `bitacora.ts`, `exportarCsv.ts`, `ipc/index.ts`, `preload.ts`, `main.ts`, `index.html`, migraciones `0000`/`0004`/`0005` |
| Diseño técnico | Presente pero delgado | §10 (tablas, JSON, reutilización de `archivos`), §13 (rutas, miniaturas), §14 (integraciones). No nombra el módulo ni los canales IPC: condición 13 |
| Restricciones | Presentes | §15 (`0006`, sin dependencias nuevas, marco legal); PROJECT.md (migración automática, repo público, PII) |
| Decisiones del dueño por escrito | Presentes con un conflicto | Ficha vigente + versiones (FR-006); consentimiento implícito (Q-001) — en conflicto con el contrato; Q-002 propuesto, no decidido |

Las decisiones existen por escrito; lo que falta es reconciliar una con el contrato (Q-001) y
cerrar otra que el spec deja abierta (Q-002). Ninguna cambia la estructura, por eso el veredicto
no es FAIL por entradas insuficientes y las dos se piden como condiciones previas a la `0006`.

### Cómo trató este gate el conflicto de Q-001

El contrato (PROJECT.md, "Marco legal relevante") dice: "Cualquier feature de fotos de tratamiento
o notas clínicas entra por Gate 001 y requiere el flujo de consentimiento". El dueño decidió en chat
que el consentimiento es implícito. Un gate aplica el contrato tal como está escrito y no decide
por el dueño; tampoco puede ignorar una decisión suya. La única salida coherente es que las dos
fuentes digan lo mismo, por escrito, y el único que puede editar el contrato es el dueño (es
superficie crítica). Por eso la condición 1 ofrece las dos salidas del spec sin elegir: (a) cambia
el contrato y registra el riesgo; (b) cumple el contrato con dos columnas y una casilla. Se exige
antes de generar la `0006` porque (b) es gratis dentro de esa migración y cara después (una
migración nueva corre sola en la máquina de la clienta). El release queda condicionado, no la
escritura del código.

### Las diez dimensiones

1. **Alineación con el problema.** Uno a uno con §2: antecedentes (FR-002/003/004), aviso
   (FR-009/010), fotos por tratamiento (FR-007). Sexo/ocupación y recomendación para casa están en
   el papel. Las versiones son decisión escrita del dueño. Nada sobra; las exclusiones de §5
   (PDF, comparador, otras fichas) acotan bien.
2. **Encaje con el sistema.** Sigue los patrones vigentes: zod en `shared/schemas.ts`, canales
   IPC por namespace, `registrarAccion(tx, …)` dentro de la transacción, migraciones aditivas con
   cabecera (`0004`, `0005`), JSON validado al leer (`config.ts:14`), `rutaDentroDe` para toda
   ruta (`folders.ts:139`). Mejora un patrón: hoy el renderer manda `carpetaDestino`
   (`ipc/index.ts:284`, `CierreCitaModal.tsx:112`); el diseño lo resuelve en el main (BR-007).
   Patrón nuevo: la primera imagen que el renderer dibuja; la CSP ya lo permite (`img-src data:`).
3. **Fronteras.** Claras para las tablas nuevas (módulo nuevo), `archivos` (archivos.ts) y
   `observaciones` (serviciosRealizados.ts, condición 9). Ambiguas en dos puntos que la condición
   7 cierra: quién crea la carpeta del servicio ausente y quién escribe `carpeta_path` (debe ser
   el dueño de `servicios_realizados`). El spec no nombra módulo ni canales (condición 13). No es
   FAIL: la responsabilidad es decidible sin cambiar la estructura.
4. **Acoplamiento.** `fichasClinicas → archivos, folders, serviciosRealizados, bitacora`; el
   detalle de cita y Clientes consumen `fichas:alerta`/`fichas:obtener`. Ningún módulo existente
   depende del nuevo salvo `reinicio.ts` (lista de tablas) e `ipc`. Mínimo y en la dirección
   correcta.
5. **Modelo de datos.** `fichas_clinicas` 1:1 por `UNIQUE(cliente_id)` (BR-001 enforzable en
   esquema). `fichas_clinicas_versiones` N:1 con `ficha_id`; inmutabilidad (BR-002) es de
   aplicación (ningún `update` sobre la tabla), aceptable. JSON vs columnas: JSON, por las razones
   del Summary; precedentes `configuracion.valor`, `alertas.metadata_json`,
   `cortes.desglose_por_metodo_json`/`ajustes_json`. Fotos en `archivos` con `categoria` texto
   (`schema.ts:400`): ya admite valores nuevos sin migración; `tipo_mime` existe y hoy nadie lo
   llena (condición 7d). Migración: dos `CREATE TABLE`, atómica en el migrador (un BEGIN), con copia
   previa `cabina_antes_de_migrar_*` (`db/index.ts:46-77`); drizzle-kit emite `ON DELETE` dentro
   de `CREATE TABLE` (`0000:57`), a diferencia de `ALTER … ADD` (nota del gate de cobro).
   Propiedad explícita: condición 13. Q-002: `restrict` es lo coherente con el esquema (casi todo
   `restrict`, `eliminarOFallarConHistorial` ya traduce el error); el hueco es que no hay ningún
   camino para borrar datos de salud de una clienta salvo el reinicio de datos (condición 2).
6. **Seguridad.** Modelo explícito en §11 (app desbloqueada, PIN único; confirmación para quitar
   foto). Frontera de confianza: el renderer no recibe rutas de escritura (BR-007) ni elige dónde
   leer (condición 8: todo por `archivoId`); `rutaDentroDe` en cada handler de archivo. Datos
   sensibles nuevos: salud y rostro; BR-006 los mantiene fuera de CSV/reportes/dashboard/bitácora/
   logs (condición 11 lo hace verificable). Lo que el modelo no cubre y se declara: SEG-A1 abierto
   (IPC desde la pantalla de bloqueo), sin cifrado, un solo usuario. No es FAIL: el modelo existe y
   está escrito; sus límites coinciden con los del contrato.
7. **Escalabilidad.** Volumen de una cabina: una ficha por clienta, decenas de versiones, decenas
   de fotos. El único costo no trivial es decodificar fotos de celular en el main de forma
   síncrona; la condición 8 lo acota a una por llamada y perezosa. El aviso FR-009 se calcula al
   abrir un detalle de cita (una fila JSON), no por lista.
8. **Modos de falla.** Foto ilegible → rechazo sin escribir (7c); archivo borrado a mano →
   `faltante` y quitar del registro (8); carpeta ausente → se crea (7b); guardar concurrente →
   rechazo explícito (4); guardar sin cambios → no-op (4); transacción única para ficha + versión
   (§13, 4); migración falla cerrada con copia previa. Hueco cubierto: `shell.openPath` que falla
   solo no abre (§14). Hueco declarado: archivos huérfanos en disco tras reinicio sin "eliminar
   archivos" (10).
9. **Reversibilidad.** Esquema: aditivo, la app anterior lo ignora — fácil. Código: módulo
   aislado — fácil. Datos: una vez capturados, los datos de salud y las fotos viven en la BD, en
   la carpeta, en todos los respaldos y en las copias previas a migrar; "quitar foto" borra el
   archivo. **Reversible con costo** en el sentido de que desinstalar la feature no des-captura
   los datos; de ahí que Q-001/Q-002 se exijan antes de la `0006` y no después.
10. **Complejidad.** La más pequeña que cumple: dos tablas, cero dependencias, cero protocolos,
    cero cambios de CSP, reutilización de `archivos`, `folders`, `respaldos` y `reinicio` sin
    modificar su contrato. Lo único que el gate agrega es un campo (`updatedAtEsperado`) y dos
    columnas de vigencia en versiones; ambos son baratos y evitan errores que afectan al aviso de
    seguridad de la clienta.

### Respuestas a los puntos que pidió el solicitante

- **JSON + zod vs columnas tipadas.** JSON. Ninguna consulta filtra por pregunta; BR-006 prohíbe
  reportes; el formato cambiará (`version_formulario`); columnas tipadas obligarían a duplicar
  45 columnas en versiones y a una migración por cada pregunta nueva, que corre sola en la máquina
  de la clienta. Costo aceptado: integridad en zod, no en la BD (condición 6).
- **Versionado y transacciones.** Modelo correcto (vigente + instantánea previa). Huecos:
  comparación canónica, concurrencia entre dos modales, semántica de la fecha de la versión
  (condiciones 4 y 5). Una sola `db.transaction` síncrona, como `cobros.ts`.
- **Fotos en `archivos` con categorías nuevas y rutas resueltas en el main.** Correcto y mejor
  que el patrón actual. Falta decidir la creación de carpetas ausentes y restringir a servicios
  cerrados (condición 7).
- **Miniaturas al renderer sandboxeado.** Data URL vía `nativeImage` por `archivoId`, una por
  llamada, JPEG. `file:` descartado (lee cualquier imagen del disco, no funciona bajo Vite dev,
  expone rutas); protocolo propio descartado por ahora (registro privilegiado + CSP; solo se
  justifica con un visor en la app). Riesgo real: bloqueo síncrono del main (condición 8).
- **`observaciones` tras el cierre en superficie Dinero.** Permitido: no es dinero, pero la
  escritura vive en el dueño de la tabla con un `set()` acotado y pasa por auditoría (condición
  9). Que las notas no se versionen es una decisión del dueño que debe quedar escrita.
- **FK al borrar clienta (Q-002).** `restrict`, explícito en la `0006`; el gate no decide si existe
  "Borrar ficha", solo exige que se decida (condición 2).
- **Reinicio y respaldos.** Respaldos: sin cambios (verificado en `respaldos.ts:68-103` y
  `:176-215`). Reinicio: agregar las dos tablas (condición 10) y corregir BR-008.
- **`sensitive_globs`.** Agregar `electron/services/fichasClinicas.ts`; `archivos.ts`,
  `clientes.ts`, `serviciosRealizados.ts` y `reinicio.ts` ya están. Lo edita Carlos (condición 12).

### Lo que este veredicto no cubre

Impresión/PDF de la ficha, comparador de fotos, captura desde cámara, cifrado de datos en reposo,
cierre de SEG-A1 y la resolución legal de NOM-004: todos fuera de alcance por §5/§15 o pendientes
del contrato con dueño asignado. Si alguno entra, trae su propio gate.
