# Auditoría — Ficha clínica facial (migración 0007, `fichasClinicas.ts`, fotos en `archivos`, notas del tratamiento, Reinicio) — 2026-11-06 (FIC-*)

**Scope:** Working tree sin commitear sobre `main` @ `d8037e0` (14 archivos modificados, 5 sin
rastrear; irán a la rama `atlas/ficha-clinica`). Código: `drizzle/0007_ficha_clinica.sql`,
`drizzle/meta/0007_snapshot.json`, `drizzle/meta/_journal.json`, `electron/db/schema.ts`;
`electron/services/fichasClinicas.ts` (nuevo, único lector/escritor de `fichas_clinicas` y
`fichas_clinicas_versiones`), `archivos.ts` (`tipoMime`, `eliminarFilasArchivosEnTx`,
`borrarArchivosFisicos`), `clientes.ts` (mensaje de `eliminarCliente`), `reinicio.ts`
(`TABLAS_NEGOCIO`), `serviciosRealizados.ts` (solo `actualizarObservacionesServicio`);
`electron/ipc/index.ts`, `electron/preload.ts`; `shared/{fichaClinica,schemas,types,ipc-contract}.ts`;
UI `src/components/ficha/{FichaClinicaModal,FotosTratamiento,NotasTratamiento,AvisoPrecaucion}.tsx`,
`src/pages/Clientes.tsx`, `src/pages/agenda/CitaDetalleModal.tsx`. Se mide contra el
[spec de la ficha](spec-ficha-clinica-2026-11-05.md) (§6–§7, §13, §17, §18, §21 y el addendum de
numeración: esta migración es la `0007`; donde el Gate dice `0006` se lee `0007`) y las 13
condiciones del [Gate 001](gate-001-ficha-clinica-2026-11-05.md). **No auditado:** el cobro
(Partes A/B, descuentos), SEG-A1 (candado de la app), cifrado en reposo, NOM-004, el diseño visual
contra `docs/DISENO_BELLORA.md`, y los helpers de UI preexistentes (`Modal`, `useConfirm`,
`Expandable`, `SelectBuscable`) más allá de cómo los usa la ficha.
**Method:** Solo lectura. `git status`/`git diff`, lectura completa de los archivos nuevos y de
los diffs, lectura de los módulos de los que depende la ficha (`folders.ts`, `archivos.ts`,
`serviciosRealizados.asegurarCarpetaServicio`, `clientes.asegurarCarpetaCliente`, `bitacora.ts`,
`db/index.ts`, `reinicio.ts`, `respaldos.ts`, `migracionCarpetas.ts`, `citas.eliminarCita`), las
verificaciones por grep de las 13 condiciones del Gate corridas tal cual, `npm run typecheck`
(verde en esta sesión; el solicitante reporta `npm run build` verde). Se leyó la salida de las 17
pruebas de aceptación que el autor corrió contra los servicios reales dentro de un runtime de
Electron sobre una copia de la BD de desarrollo ficticia (archivo temporal de la sesión, no
versionado) y cada caso se trazó en código. No se ejecutó la app en esta auditoría.
**PII declaration:** Sin PII. No se abrió ninguna base real ni respaldo. La salida de pruebas que
se leyó usa datos inventados (`CL-0001`, `SRV-0001`, "penicilina" como valor de prueba del spec).
Ningún nombre, teléfono, nota ni foto.
**State as of:** 2026-11-06 01:29 CST, `main` @ `d8037e0` + working tree (19 entradas en
`git status`).

---

## 1. Resumen ejecutivo

1. **BR-006 (los datos de salud no salen de la ficha) se cumple y es verificable por grep.**
   Ningún módulo fuera de `fichasClinicas.ts` toca las tablas nuevas (`grep -rln … electron/services`
   → vacío; `reinicio.ts` solo lista las tablas del esquema, `reinicio.ts:33-35`); CSV, reportes,
   dashboard y `clientes.ts` → 0 coincidencias (AC-008 ampliado). Lo único que sale hacia el detalle
   de cita y Clientes es `AvisoFicha` (`fichasClinicas.ts:209-214`, `types.ts` `AvisoFicha`). Las
   seis llamadas a `registrarAccion` del módulo y la de `actualizarObservacionesServicio` llevan
   `detalle` fijo o con código (`fichasClinicas.ts:127-133,169-175,306-312,364-370,396-402`;
   `serviciosRealizados.ts:512-518`); el único `console.*` del main con datos es el de la copia
   previa a migrar (`db/index.ts:75`, solo una ruta).
2. **Ninguna ruta cruza el IPC y toda ruta se valida dentro de `Datos/`.** Las once firmas
   `fichas:*` reciben solo ids o un enum (`ipc-contract.ts` bloque `fichas`); `subirFoto` toma la
   ruta del diálogo del main (`ipc/index.ts:350-357`). Miniatura, abrir y quitar pasan por
   `fotoValidada` → categoría `foto_*` + `rutaDentroDe(rutaFisica, carpetaDatos)`
   (`fichasClinicas.ts:317-327`), y el borrado físico vuelve a validar cada ruta antes de
   `unlinkSync` (`archivos.ts:110-124`). `rutaDentroDe` resuelve symlinks en ambos lados
   (`folders.ts:113-141`). Solo filas con categoría `foto_antes`/`foto_despues` pueden borrarse por
   estos canales: un comprobante no es alcanzable (`fotosDe`, `fichasClinicas.ts:217-231`).
3. **Guardar es una sola transacción síncrona con concurrencia optimista y comparación canónica
   (condición 4).** `fichasClinicas.ts:103-177`: lee la vigente, rechaza si `updatedAtEsperado` no
   coincide en milisegundos (`:137-139`; también rechaza "crear" cuando ya existe y "actualizar"
   cuando fue borrada, `:110-112`), compara `jsonCanonico({sexo, ocupacion, datos})` normalizado
   en el main (`:98-101,140-142`) y no inserta versión ni toca `updated_at` si es igual. Sin
   `await` dentro de la transacción. `updated_at` es `timestamp_ms` (`schema.ts:532-533`) con
   `DEFAULT (unixepoch() * 1000)` (`0007:76-77`). Pruebas del autor: AC-003, cond. 4 (dos mensajes
   de rechazo) y BR-004 pasan.
4. **Las versiones son inmutables y autocontenidas (condición 5).** La instantánea copia el JSON
   tal cual estaba guardado más sexo, ocupación, `version_formulario`, `vigente_desde` =
   `updated_at` previo, `vigente_hasta` = momento del guardado y `usuario_id`
   (`fichasClinicas.ts:144-157`). No existe ningún `update(fichasClinicasVersiones)` en el repo
   (grep → 0). Leer una versión usa `safeParse` y nunca lanza; si no valida, viaja `datosCrudos`
   (`:56-64,193-205`; prueba cond. 6 pasa).
5. **La migración `0007` es segura para la instalación real (condición 3).** Solo dos
   `CREATE TABLE` y dos índices; sin comentarios: `ALTER TABLE|__new_|DROP TABLE` → 0; FK
   `cliente_id … ON DELETE restrict` y `ficha_id … ON DELETE restrict` dentro del `CREATE TABLE`
   (`0007:78,94`); journal idx 7 con tag `0007_ficha_clinica`; `0007_snapshot.prevId` = id del
   snapshot `0006`; cabecera completa con la plantilla de Atlas (contexto, qué cambia, decisiones
   Q-001/Q-002, lo que no resuelve, orden, verificación manual). `unixepoch()` ya tiene precedente
   en la `0005`. `respaldarAntesDeMigrar` se dispara por haber pendientes (`db/index.ts:46-77`).
6. **Fotos, miniaturas, notas y reinicio cumplen las condiciones 7, 8, 9 y 10.** Solo servicios
   `cerrado` (`fichasClinicas.ts:289`), carpeta resuelta y creada por el dueño de la tabla
   (`asegurarCarpetaServicio`, `serviciosRealizados.ts:158-177`, que a su vez crea la de la clienta
   con `asegurarCarpetaCliente`), lista blanca + `createFromPath(...).isEmpty()` (`:291-294`),
   `tipo_mime` lleno (`archivos.ts:60`). Miniatura por `archivoId`, una por llamada, JPEG ≤ 320 px
   con `toJPEG`, `{ faltante: true }` si el archivo no está (`:330-346`); la UI la pide al montar
   cada `<img>` y la cachea por id (`FotosTratamiento.tsx:82-86`). `actualizarObservacionesServicio`
   hace `set({ observaciones, updatedAt })` y nada más, exige `cerrado`, y el diff de
   `serviciosRealizados.ts` agrega solo esa función (`:485-518`); `cerrarCita` intacto.
   `fichasClinicasVersiones` y `fichasClinicas` entran en `TABLAS_NEGOCIO` antes de `clientes`
   (`reinicio.ts:33-35`); las filas de fotos caen con `archivos` (`:18`); el disco solo se vacía con
   "eliminar archivos" (`:62-65`); respaldos sin cambios (`respaldos.ts:92-94`).
7. **Un hueco de evidencia, no de código → FIC-A1.** No existe
   `.notes/evidencia-ficha-clinica-2026-11-06.md`: las 17 pruebas viven en un archivo temporal de <!-- atlas-allow: archivo futuro que exige el Gate (Recommended Next Step) y la cabecera de la 0007 -->
   la sesión y la propia cabecera de la `0007` (`:117-118`) apunta a una nota que no está. Igual que
   DES-A1 en el PR anterior: sin la nota, el PR no debe entrar.
8. **Dos cosas baratas ahora y caras después del release:** el borrado de la ficha (FR-011) no
   alcanza los respaldos ni las copias previas a migrar, y ni el pop-up ni el contrato lo dicen
   (FIC-M1); las notas del tratamiento que se están escribiendo se pierden en silencio al cambiar de
   paso o cerrar el modal (FIC-M2). Más cinco de hygiene (FIC-B1…B7) que no bloquean.
9. **Lo que el dueño ya decidió y esta auditoría no reabre:** consentimiento implícito (Q-001 a),
   borrado sin PIN (FR-011), notas no versionadas (condición 9), fotos borradas físicamente al
   quitarlas (§11). Están escritos en el spec, en PROJECT.md y en la cabecera de la migración.

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Guardar (`fichasClinicas.ts:96-180`), una transacción

```
datos      = normalizarFicha(input.datos)                       fichaClinica.ts:220-259 (BR-003/BR-004)
nuevo      = jsonCanonico({ sexo, ocupacion, datos })           fichaClinica.ts:262-268 (claves ordenadas)
vigente    = SELECT … WHERE cliente_id                          fichasClinicas.ts:106
  sin vigente:  updatedAtEsperado debe ser null → INSERT       :109-135
  con vigente:  ms(vigente.updated_at) == updatedAtEsperado    :137-139   (si no → "La ficha cambió en otra ventana")
                anterior = jsonCanonico(mapearFicha(vigente))  :140-141   (relee y normaliza lo guardado)
                anterior == nuevo && misma version → no-op      :142       (BR-002: sin versión, sin updated_at)
                INSERT versión(instantánea de vigente, vigente_desde = vigente.updated_at, vigente_hasta = ahora)  :144-157
                UPDATE vigente (sexo, ocupacion, version, datos, usuario, updated_at = ahora)                       :158-168
                bitácora "Se actualizó la ficha clínica de CL-xxxx"                                                :169-175
```

Forma canónica (`normalizarFicha`): solo claves del catálogo (`PREGUNTAS_SI_NO`, `TIPOLOGIA`),
`"" → null`, "Especifique" solo si la respuesta es `si` **y** la pregunta lo trae en el papel
(`fichaClinica.ts:222-229`), chips sin duplicados y en el orden del catálogo, opción única con a lo
más un valor (`:230-235`), productos sin repetidos (`:237-242`).

### 2.2 Aviso (`fichasClinicas.ts:209-214`)
`precaucionesDe(datos)` = las claves de `PREGUNTAS_PRECAUCION` con respuesta `si`, con su
etiqueta y especifique (`fichaClinica.ts:271-277`). Se calcula al leer; una fila JSON por detalle
de cita abierto, nunca por lista.

### 2.3 Fotos
- Subir (`:276-314`): servicio existe y `cerrado` → extensión en `MIME_FOTO` y
  `nativeImage.createFromPath(origen)` no vacío → `asegurarCarpetaServicio` →
  `guardarArchivoDesdeRuta` (copia con anti-colisión, `archivos.ts:35-64`) → bitácora.
- Miniatura (`:330-346`): `fotoValidada` → `existsSync` → `createThumbnailFromPath` (asíncrono,
  Windows y macOS) → si falla, `createFromPath` + `resize` síncrono.
- Quitar (`:356-374`): `fotoValidada` → tx { borrar fila, bitácora } → `borrarArchivosFisicos`.
- Borrar ficha (`:381-406`): tx { versiones, ficha, filas `foto_*` de todos los servicios de la
  clienta, bitácora con conteo } → borrar archivos; un fallo de disco se cuenta, no revierte.

### 2.4 Diseño vs. bug

| Comportamiento | Lectura |
|---|---|
| Guardar sin cambios no crea versión ni mueve `updated_at` | **Diseño** (BR-002, AC-003) |
| La segunda ventana que guarda es rechazada y debe reabrir; no hay merge | **Diseño** (condición 4) |
| Una clave de pregunta que no está en el catálogo se descarta sin error al guardar | **Diseño declarado** (forma canónica); el costo en versiones viejas es FIC-B2 |
| "Quitar foto" borra el archivo físico; "Borrar ficha" borra todas las fotos de la clienta | **Decisión del dueño** (§11, FR-011) |
| Borrar la ficha no toca `servicios_realizados.observaciones` | **Diseño** (FR-011) |
| Las fotos quedan en disco tras un reinicio sin "eliminar archivos" | **Diseño declarado** (BR-008 corregido, condición 10) |
| Borrar la ficha no la quita de respaldos `.zip` ni de `cabina_antes_de_migrar_*` | **Riesgo aceptado por el Gate (riesgo 3)**, pero el texto de la UI y de PROJECT.md no lo dicen → FIC-M1 |
| Notas del tratamiento se pierden al cambiar de paso sin guardar | **Bug de UI** → FIC-M2 |
| Fotos de un servicio `cerrado` con `estatus_pago = 'cancelado'` se listan como tratamiento | Hoy inalcanzable (sin escritor de `cancelado`); regla a heredar por CIT-C1 → FIC-B7 |

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `fichas_clinicas` (una fila por clienta) | Solo `guardarFicha`; `UNIQUE(cliente_id)` en esquema (`0007:82`) | ✅ escritor único verificado (grep cond. 11 → vacío) |
| `fichas_clinicas_versiones` | Solo `guardarFicha` cuando cambió algo; nunca `UPDATE`; `DELETE` solo en `borrarFicha` y reinicio | ✅ inmutable por construcción |
| `archivos` con `categoria = foto_antes/foto_despues` | `subirFoto` → `guardarArchivoDesdeRuta` (único insert); borradas por `quitarFoto`, `borrarFicha`, reinicio | ✅ `tipo_mime` lleno; `entidad_id` sin FK (hereda el patrón; 7a mantiene la invariante de `eliminarCita`) |
| `servicios_realizados.observaciones` | `cerrarCita` y `actualizarObservacionesServicio` (sin versión) | ✅ `set()` acotado; ⚠️ pérdida de texto no guardado en UI (FIC-M2) |
| `servicios_realizados.carpeta_path` | `asegurarCarpetaServicio` (dueño de la tabla) | ✅ `grep update(serviciosRealizados)` en `fichasClinicas.ts`/`archivos.ts` → 0 |
| `AvisoFicha` | Derivado al leer de `datos` de la vigente | ✅ único dato clínico fuera de la ficha |
| Copias previas a migrar y respaldos `antes_de_*` | `db/index.ts:46-77`, `respaldos.ts` | ⚠️ conservan fichas y fotos después de "Borrar ficha" (FIC-M1) |

## 4. Caso por caso

Sin sujetos reales. Las filas AC/BR/Cond. son las 17 pruebas del autor (salida leída, cada una
trazada en código); las filas G-n son las verificaciones del Gate corridas en esta auditoría.

| # | Caso | Valor del sistema | Esperado | Lectura |
|---|---|---|---|---|
| AC-001 | Guardar Alergias = Sí ("penicilina") → aviso | `[{alergias, "Alergias", "penicilina"}]` | ídem | ✅ |
| BR-004 | Diabetes = No con texto; piel múltiple; color única | especifique `null`; `["seca","sensible"]`; `["normal"]` | ídem | ✅ (`fichaClinica.ts:227,234`) |
| AC-004 | Embarazo sin responder | `null` (no "no") | `null` | ✅ |
| AC-003 | Guardar sin cambios | versiones 0 → 0; `updatedAt` igual | sin versión | ✅ (`:142`) |
| AC-002 | Sí → No y guardar | vigente sin especifique; aviso 0; 1 versión con el Sí; rango de vigencia presente | ídem | ✅ |
| Cond. 4 | Ventana vieja; crear sobre existente | ambas "La ficha cambió en otra ventana; vuelve a abrirla." | rechazo | ✅ (`:110-112,137-139`) |
| Cond. 6 | Versión con formato anterior | `datos: null`, `datosCrudos` con el JSON | no lanza | ✅ |
| AC-006 | Servicio sin `carpeta_path` | carpeta creada dentro de la raíz; foto dentro de la del servicio | ídem | ✅ |
| AC-005 | Foto de antes desde el detalle | `foto_antes`, `image/png`, aparece en el 1° tratamiento | ídem | ✅ |
| Cond. 7 | Ilegible; extensión mala; servicio abierto | los tres mensajes del spec | rechazo sin escribir | ✅ |
| Cond. 8 | Miniatura; archivo borrado a mano; ruta fuera de `Datos/` | JPEG; `faltante`; "fuera de la carpeta del negocio" | ídem | ✅ |
| Cond. 9 | Notas tras el cierre | dinero intacto; bitácora "SRV-0001 · notas del tratamiento actualizadas" | ídem | ✅ |
| BR-006 | Bitácora tras las operaciones | 4 filas, 0 con contenido clínico | 0 | ✅ |
| BR-009 | Borrar clienta con ficha | `HISTORIAL_ASOCIADO` con el mensaje nuevo | restrict + mensaje | ✅ (`clientes.ts:170`) |
| AC-007a | Respaldo tras subir foto | el `.zip` contiene la foto | ídem | ✅ |
| FR-011 | Borrar ficha | ficha 0, versiones 0, fotos 0, archivo fuera del disco, notas conservadas, no borrados 0 | ídem | ✅ |
| AC-007b | Reinicio con "eliminar archivos" | fichas 0, versiones 0, foto fuera del disco | ídem | ✅ |
| G-1 | `git diff -- PROJECT.md` (ya committeado): `fichasClinicas.ts` en `sensitive_globs`, `fichas_clinicas` en `pii.notes`, Q-001 "RESUELTA" | 1 / 1 / sí | cond. 1 y 12 | ✅ |
| G-2 | `grep -c "ON DELETE" 0007` / `grep -c "ficha" clientes.ts` | 7 (las 4 FK nuevas + cabecera) / 1 | ≥ 2 / ≥ 1 | ✅ |
| G-3 | Sin comentarios: `ALTER\|__new_\|DROP` / `CREATE UNIQUE INDEX` / journal / snapshot | 0 / 1 / idx 7 / `prevId` = 0006 | 0 / ≥ 1 / idx 7 | ✅ |
| G-4 | `grep -n updatedAtEsperado schemas.ts fichasClinicas.ts` | 3 | ≥ 2 | ✅ |
| G-6 | `grep -c "fichaClinicaDatosSchema\|PREGUNTAS_PRECAUCION" schemas.ts` / `grep -rn PREGUNTAS_PRECAUCION electron src shared` | 3 / 3 (todas en `shared/`) | ≥ 2 / ≥ 3 | ✅ (literal del Gate sin `shared` → 0, FIC-B1) |
| G-7/9 | `grep update(serviciosRealizados)` en `fichasClinicas.ts`, `archivos.ts` | 0 | 0 | ✅ |
| G-8 | `grep -rn "file://" src` / `grep -c rutaDentroDe fichasClinicas.ts` | 0 / 2 | 0 / ≥ 3 | ✅ / ⚠️ literal (un `fotoValidada` compartido + revalidación en `archivos.ts`, FIC-B1) |
| G-10 | `grep -c fichasClinicas reinicio.ts` | 2 | 2 | ✅ |
| G-11 | lectores fuera del módulo; AC-008 ampliado a `dashboard.ts`, `clientes.ts` | vacío / 0 | vacío / 0 | ✅ |
| G-13 | importadores de `./fichasClinicas` | solo `ipc/index.ts` | ídem | ✅ (§21.1 presente en el spec) |
| AC-009 | `git diff -- package.json` | 0 líneas | sin dependencias | ✅ |
| AC-010 | `npm run typecheck` | verde (esta sesión) | verde | ✅ |

Hallazgos sueltos:

- **FIC-A1** — No existe la nota de evidencia. El Gate (Recommended Next Step) exige pasar
  `/evidencia` sobre PII, Dinero, Reinicio y Migraciones con AC-001…AC-010 antes de integrar, y la
  cabecera de la `0007` (`:117-118`) la cita como paso 4 de su verificación manual. Las 17
  pruebas existen y pasan, pero en un archivo temporal de la sesión que desaparece. Faltan además
  dos pruebas que el Gate pide a mano y que la salida no cubre: cond. 4 desde la UI (abrir la ficha
  desde Clientes y desde el detalle de cita, guardar en ambas) y cond. 8 con ≥ 20 fotos de ≥ 8 MP
  (la ficha abre sin congelar). Severidad alta por evidencia ausente en superficie crítica, no por
  defecto de código.
- **FIC-M1** — El derecho de cancelación que PROJECT.md ofrece como mitigación ("la ficha se puede
  borrar (ficha, versiones y fotos) a petición de la clienta") y el pop-up de FR-011 ("del registro
  y de la carpeta… No se puede deshacer", `FichaClinicaModal.tsx:140`) describen solo la BD y
  `Datos/`. Los `.zip` de respaldo (automáticos diarios y `antes_de_*`, que no se podan) y las
  copias `cabina_antes_de_migrar_*` conservan la ficha y las fotos indefinidamente, y "Restaurar"
  las resucita; el Gate lo nombra como riesgo 3 y el dueño aceptó la clase de riesgo; lo que falta
  es que los dos textos lo digan, para que la cosmetóloga no prometa a una clienta algo que la app
  no hace. Una oración en cada sitio; barato ahora, incómodo después de que exista la primera
  solicitud de borrado.
- **FIC-M2** — Pérdida silenciosa de notas no guardadas. `NotasTratamiento` guarda su texto en
  estado local (`NotasTratamiento.tsx:15-17`). En la ficha, cambiar de paso desmonta `Tratamientos`
  (`FichaClinicaModal.tsx:328-333`) y el texto escrito se pierde sin aviso; la guarda de "Cambios sin
  guardar" solo mira `borrador` (`:99,123-134`), no las notas. En `CitaDetalleModal` no hay guarda:
  cerrar con notas a medias las descarta. Son notas clínicas escritas con la clienta enfrente.
  Fix pequeño: que `NotasTratamiento` reporte `cambio` al padre (callback o ref) y la guarda y el
  cambio de paso lo consideren, o montar los cuatro pasos y ocultar con CSS.
- **FIC-B1** — Dos verificaciones literales del Gate dan "rojo" sobre código correcto:
  `grep -c "rutaDentroDe" fichasClinicas.ts` → 2 (los tres handlers comparten `fotoValidada`, y
  `borrarArchivosFisicos` revalida en `archivos.ts:118`); `grep -rn "PREGUNTAS_PRECAUCION" electron src`
  → 0 (vive en `shared/`, que es donde la condición 6 pide una sola definición). Dejar en la nota de
  evidencia los greps que sí reproducen (con `shared` y con `archivos.ts`).
- **FIC-B2** — El esquema zod es abierto (`z.record` para `respuestas` y `tipologia`, cadenas
  libres para `exposicionSolar` y `bolsas.tipo`, `schemas.ts:331-345`) y la normalización descarta
  en silencio lo que no está en el catálogo. Para la vigente es correcto (la UI manda claves del
  catálogo). Para las versiones no: `leerDatos` también normaliza (`fichasClinicas.ts:57-64`), así
  que si una clave se renombra sin subir `VERSION_FORMULARIO`, la versión vieja no sale como
  "formato anterior" sino con esa respuesta en blanco (el JSON crudo sigue íntegro en BD, nada se
  destruye). Cierre barato: en `listarVersiones`, marcar como `datosCrudos` toda versión con
  `version_formulario !== VERSION_FORMULARIO` o con claves desconocidas, en vez de normalizarla.
- **FIC-B3** — `.webp` está en la lista blanca (`EXTENSIONES_FOTO`, `MIME_FOTO`) pero la regla 7c
  exige que `nativeImage.createFromPath` decodifique el archivo, y la documentación de Electron solo
  garantiza PNG y JPEG para `nativeImage`. Si WEBP no decodifica en Windows, toda foto `.webp`
  recibe "Esa foto no se pudo leer" (seguro, pero contradice al spec). Pendiente de verificación
  manual; si falla, quitar `webp` de las dos listas y del texto del error (tres líneas).
- **FIC-B4** — Orientación EXIF: el camino principal (`createThumbnailFromPath`, miniatura del
  sistema) la respeta; el de respaldo (`createFromPath` + `resize`, `fichasClinicas.ts:339-345`)
  probablemente no, y las fotos de celular en vertical saldrían giradas. Solo afecta a la miniatura
  (abrir en grande usa el visor del sistema). Verificar en Windows con una foto vertical.
- **FIC-B5** — `subirFoto` decodifica la imagen de origen completa y de forma síncrona en el main
  (`createFromPath(rutaOrigen)`, `:292`) antes de copiarla. Es lo que pide 7c y ocurre una vez por
  foto a petición de la usuaria; una foto de 12 MP son décimas de segundo. Informativo: si algún
  día se agrega "subir varias", no repetir este patrón en bucle.
- **FIC-B6** — `FichaClinicaModal` inicializa el borrador en cuanto `isFetched` es true
  (`:89-97`), que también es true para una consulta en caché invalidada: tras borrar la ficha y
  reabrirla rápido, o si la consulta falla (`ficha` undefined → se trata como "sin ficha"), el modal
  puede abrir con datos viejos o vacíos. La condición 4 lo atrapa al guardar ("cambió en otra
  ventana"), así que no se pisa nada, pero la usuaria ve una ficha que no es la vigente. Usar
  `isSuccess && !isFetching` (o `fetchStatus === "idle"`) para inicializar y mostrar el error de
  carga en vez de un formulario vacío.
- **FIC-B7** — `listarTratamientos` toma todo servicio `estatus = 'cerrado'`
  (`fichasClinicas.ts:252`), sin mirar `estatus_pago`. Hoy ningún camino escribe
  `estatus_pago = 'cancelado'` (grep → 0), así que no hay caso; cuando CIT-C1 (reversa de un
  servicio cerrado) exista, un tratamiento cancelado seguiría numerado como realizado. Heredar a
  CIT-C1 junto con DES-M1: excluir o marcar los cancelados en la ficha.
- **Informativo (sin código):** dos `NotasTratamiento` del mismo servicio pueden coexistir
  (detalle de cita → "Ver ficha" → paso 4); cada uno tiene su `base` y el último que guarda gana
  sobre el otro sin aviso. Como las notas no se versionan por decisión del dueño, el texto pisado
  no se recupera. Mismo renderer, misma usuaria; lo cubre FIC-M2 si el estado de notas sube al
  padre.

### Condiciones del Gate, una por una

| # | Condición | Estado |
|---|---|---|
| 1 | Q-001 reconciliado por escrito antes de la migración | ✅ opción (a): PROJECT.md "Marco legal" y `pii.notes` (committeado antes de este diff); spec §17 "RESUELTA 2026-11-05, opción (a)"; cabecera `0007:34-36` |
| 2 | `restrict` explícito en las dos FK; mensaje de `eliminarCliente`; decisión de borrado escrita | ✅ `0007:78,94`; `clientes.ts:170`; FR-011 + Q-002 "RESUELTA" |
| 3 | Migración aditiva, cabecera Atlas, journal | ✅ (sin comentarios 0 / 1 / idx 7 / `prevId` encadenado); cabecera sigue la plantilla sección por sección |
| 4 | Una transacción, comparación canónica, `updatedAtEsperado` | ✅ código `:103-177`; pruebas AC-003 y cond. 4 por servicio; ⚠️ la prueba manual desde la UI con dos modales no está escrita (FIC-A1) |
| 5 | Versiones autocontenidas con rango de vigencia | ✅ `schema.ts:538-551`; spec §21.2; AC-002 muestra el rango |
| 6 | Una sola definición; tri-estado; BR-004 en el main; `safeParse`; `PREGUNTAS_PRECAUCION` compartida | ✅ `shared/fichaClinica.ts` + `schemas.ts:328-345`; el aviso se calcula en el main con la misma constante; ⚠️ esquema abierto (FIC-B2) |
| 7 | Subir foto: sin rutas; a) cerrado; b) carpeta por el dueño; c) lista blanca + `isEmpty`; d) `tipo_mime`; e) `rutaDentroDe` conservado | ✅ a `:289`, b `:295` → `serviciosRealizados.ts:158-177`, c `:291-294`, d `archivos.ts:60`, e `archivos.ts:37-39`; AC-005/006 pasan |
| 8 | Miniaturas y apertura por id, perezosas, JPEG, `faltante`; sin `file:` nuevos | ✅ `:317-353`; `FotosTratamiento.tsx:82-86`; `grep file:// src` → 0; ⚠️ prueba de ≥ 20 fotos no escrita (FIC-A1); greps literales (FIC-B1) |
| 9 | `actualizarObservacionesServicio` con `set()` acotado, bitácora sin contenido, decisión "no se versionan" escrita | ✅ `serviciosRealizados.ts:493-518` (única función del diff); spec §21.5; prueba cond. 9 |
| 10 | Reinicio y respaldos; BR-008 corregido | ✅ `reinicio.ts:33-35`; BR-008 reescrito en el spec; AC-007a/b pasan |
| 11 | BR-006 por grep; solo el aviso sale; `detalle` sin contenido | ✅ los tres greps vacíos/0; revisión del diff: ningún `detalle:` interpola `datos` ni `observaciones` |
| 12 | PROJECT.md: `sensitive_globs` y `pii.notes` | ✅ 1 / 1 |
| 13 | §21 en el spec; nadie importa el módulo salvo `ipc/index.ts` | ✅ §21.1–21.6; grep → solo `ipc/index.ts` |

## 5. Riesgos activos — con fechas de detonación

### 5.1 El Gate se cierra con un documento que no existe (FIC-A1)
Mismo mecanismo que DES-A1: la evidencia se ejecutó en un archivo temporal de la sesión y no en
`.notes/`. No se degrada sola, pero el archivo temporal sí desaparece. Fecha: antes del PR.

### 5.2 El borrado de la ficha es parcial y nadie lo dice (FIC-M1)
Cada respaldo automático diario a partir del release conserva una copia más de todas las fichas y
fotos (`respaldos.ts:92-94`); `antes_de_*` y `cabina_antes_de_migrar_*` no se podan nunca. El día
que una clienta pida borrar sus datos, "Borrar ficha" dejará N copias atrás. Fecha: la primera
solicitud de cancelación después del release; el costo de decirlo hoy es una oración.

### 5.3 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| 1 | Texto de notas del tratamiento escrito y no guardado, al cambiar de paso o cerrar (FIC-M2) | desde el primer uso; cada vez que ocurra |
| 2 | Lectura de versiones viejas si una clave del catálogo cambia sin subir `VERSION_FORMULARIO` (FIC-B2; el JSON crudo no se pierde) | cuando el formato en papel cambie |
| 3 | Tratamientos cancelados numerados como realizados (FIC-B7) | cuando se implemente CIT-C1 |
| 4 | SEG-A1 heredado: el IPC es alcanzable desde la pantalla de bloqueo, y ahora `fichas:obtener` devuelve datos de salud completos. No lo introduce esta feature; sube lo que hay detrás del candado | ya; declarado en el Gate |

### 5.4 Causa raíz
No hay una regla rota en el módulo: la frontera de datos de salud, las rutas, la transacción y la
migración están bien construidas y verificadas. Los huecos son de proceso (evidencia no escrita),
de honestidad en los textos (borrado parcial) y de estado de UI que vive en un componente que se
desmonta.

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** nada que congelar en código. No abrir el PR hasta que exista la nota de
  evidencia (FIC-A1) con las dos pruebas manuales del Gate incluidas.
- **Decisión A — ¿cómo se describe el alcance real del borrado?** Opciones: (a) una oración en el
  pop-up de FR-011 ("Los respaldos anteriores la conservan") y en PROJECT.md → Marco legal
  (mitigación: "…salvo los respaldos y copias previas a migrar ya existentes"); (b) además, un
  pendiente con dueño para podar respaldos a petición. (a) cuesta dos líneas y es honesto; (b) es
  una feature con su propio gate (Respaldos es superficie crítica).
- **Decisión B — ¿CIT-C1 hereda FIC-B7 por escrito ahora?** Una línea junto a DES-M1 donde se
  liste lo que CIT-C1 debe heredar.
- **Cambio propuesto (FIC-A1):** escribir `.notes/evidencia-ficha-clinica-2026-11-06.md` con: (1) <!-- atlas-allow: archivo futuro que exige el Gate y la cabecera de la 0007 -->
  las 17 líneas de salida tal cual (son solo códigos y valores de prueba); (2) los greps de las
  condiciones 3, 6, 7, 8, 9, 10, 11 y 13 con su salida, en la forma que reproduce (FIC-B1); (3) la
  prueba manual de dos modales (cond. 4) y la de ≥ 20 fotos de ≥ 8 MP (cond. 8) con lo observado;
  (4) los conteos de la aplicación de `0004`–`0007` sobre la copia del respaldo real (solo conteos);
  (5) AC-009 y AC-010. Sin nombres ni datos.
- **Cambio propuesto (FIC-M2):** `NotasTratamiento` acepta `onCambio?(sucio: boolean)` y
  `FichaClinicaModal` lo suma a `sucio` y bloquea el cambio de paso con la misma confirmación;
  `CitaDetalleModal` usa la misma guarda en su `onClose`. Alternativa de una línea: montar los
  cuatro pasos y alternar con `hidden`.
- **Cambio propuesto (FIC-B2):** en `listarVersiones`, `datos = v.versionFormulario === VERSION_FORMULARIO ? leerDatos(v.datos) : null`.
- **Cambio propuesto (FIC-B6):** inicializar el borrador con `isSuccess && !isFetching`; si
  `isError`, mostrar `AlertaError` en lugar de "Llenar ficha clínica".
- **Cambio propuesto (FIC-B3/B4):** solo si la verificación manual falla: quitar `webp` de
  `EXTENSIONES_FOTO`, `MIME_FOTO` y del mensaje; para EXIF, si el camino de respaldo gira las
  fotos, documentarlo como limitación (el visor del sistema las muestra bien).

**Pendiente de verificación manual** (de solo lectura, sobre una copia; nunca sobre la BD real):

```sql
-- (1) Estructura tras migrar: las dos FK con restrict dentro del CREATE TABLE
SELECT sql FROM sqlite_master WHERE name IN ('fichas_clinicas', 'fichas_clinicas_versiones');
-- Esperado: cada una con "ON DELETE restrict" en su FK principal y "ON DELETE set null" en usuario_id

-- (2) Índices
SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name LIKE 'fichas_clinicas%';
-- Esperado: fichas_clinicas_cliente_id_unique, fichas_clinicas_versiones_ficha_idx

-- (3) No retroactiva, justo después de migrar
SELECT (SELECT COUNT(*) FROM fichas_clinicas) + (SELECT COUNT(*) FROM fichas_clinicas_versiones);
-- Esperado: 0

-- (4) Milisegundos: después de la primera ficha real
SELECT COUNT(*) FROM fichas_clinicas WHERE updated_at < 1000000000000;
-- Esperado: 0 (un valor en segundos sería < 10^12)

-- (5) Toda versión cerrada antes de abrirse es imposible, y toda versión pertenece a una ficha viva
SELECT COUNT(*) FROM fichas_clinicas_versiones v
 LEFT JOIN fichas_clinicas f ON f.id = v.ficha_id
 WHERE f.id IS NULL OR v.vigente_hasta < v.vigente_desde;
-- Esperado: 0

-- (6) Fotos solo en servicios cerrados y con MIME
SELECT COUNT(*) FROM archivos a JOIN servicios_realizados s ON s.id = a.entidad_id
 WHERE a.categoria IN ('foto_antes','foto_despues') AND (s.estatus <> 'cerrado' OR a.tipo_mime IS NULL);
-- Esperado: 0

-- (7) Bitácora sin contenido clínico (muestra; revisar a ojo que detalle solo lleve códigos)
SELECT accion, detalle FROM bitacora WHERE accion LIKE 'ficha_clinica_%' OR accion LIKE 'foto_tratamiento_%' OR accion = 'observaciones_servicio_actualizadas';
-- Esperado: cada detalle con un CL-xxxx o SRV-xxxx y texto fijo
```

Pruebas manuales en `npm run dev` sobre la BD ficticia (resultado esperado entre paréntesis):
abrir la ficha desde Clientes y desde el detalle de una cita, guardar en la primera, guardar en la
segunda (rechazo "La ficha cambió en otra ventana"); un servicio con ≥ 20 fotos de ≥ 8 MP (la ficha
abre y la ventana responde mientras cargan las miniaturas); subir un `.webp` (acepta o rechaza:
decide FIC-B3); subir una foto vertical de celular (miniatura derecha o girada: decide FIC-B4).

## 7. Qué sigue

1. **Carlos escribe la nota de evidencia** (FIC-A1) con las 17 líneas que ya tiene y corre las
   cuatro pruebas manuales de arriba. → **Carlos decide A** (una oración en el pop-up y en
   PROJECT.md, que es superficie crítica y la edita él).
2. **Ingeniería prepara** FIC-M2 y FIC-B6 en el mismo PR (UI, sin tocar superficie crítica), FIC-B2
   en `fichasClinicas.ts` (una línea, misma auditoría la cubre), y FIC-B3/B4 según lo que digan las
   pruebas.
3. **PR** `atlas/ficha-clinica` → `main` con esta auditoría y la evidencia; CI verde.
4. **Release** con `0004`–`0007`: solo tras lo que ya condiciona el release del cobro (COB-A1,
   condición 11a del Gate de descuentos). Al instalar: fila de la `0007` en `APPLIED-MIGRATIONS.md`
   y consultas (1)–(3) sobre una copia; (4)–(7) después del primer uso real.
5. **Gate de CIT-C1:** hereda FIC-B7 junto con DES-M1, COB-B4 y COB-M1.
