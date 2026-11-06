# Auditoría — Cobro v2, delta: comprobante sin candado y comprobantes de anticipo (`comprobantes.ts`, IPC `archivos:*`) — 2026-11-05 (COB-A2, COB-M2…M4, COB-B6…B9)

**Scope:** Solo el delta posterior a la [auditoría de la Parte A](auditoria-cobro-v2-parte-a-2026-11-05.md),
sobre el working tree sin commitear de `atlas/cobro-a` @ `efc4795`, medido contra los dos últimos
addenda del [spec del cobro](spec-modulo-cobro-2026-11-04.md) ("el comprobante deja de ser candado"
y "comprobantes: anticipos, carpetas faltantes y vista previa") y las condiciones 7 y 8 del
[Gate de la ficha clínica](gate-001-ficha-clinica-2026-11-05.md), cuyo mecanismo de fotos reutiliza.
Código: `electron/services/comprobantes.ts` (nuevo), `clientes.ts` (`asegurarCarpetaCliente`),
`serviciosRealizados.ts` (`asegurarCarpetaServicio`, regla de evidencia en `cerrarCita`),
`cobros.ts` (`registrarAbono`, `registrarAnticipo`, `cancelarPago`), `electron/ipc/index.ts`
(`archivos:*`, `cobros:registrarAnticipo`), `preload.ts`, `shared/ipc-contract.ts`,
`shared/schemas.ts` (`esEfectivo`, `requiereEvidencia`, inputs), `shared/types.ts`, renderer
`src/components/cobros/Comprobantes.tsx`, `src/pages/agenda/CierreCitaModal.tsx`,
`src/pages/agenda/PagosDeCita.tsx`, `src/pages/configuracion/Bitacora.tsx`. Superficies: **Dinero** y
**PII de clientas (rutas de lectura/escritura/exportación de archivos)**. Lo que ya cubrió la
Parte A (migración, corte, lectores) no se repite; **no auditado:** cambios de UI (calendario,
colores, listas), ficha clínica, Parte B.
**Method:** Solo lectura. `git diff`/`git status`, lectura de archivos con `file:line`, greps de las
verificaciones de los Gates (cobro cond. 5 y 6; ficha cond. 7 y 8), `npm run typecheck` y
`npm run build` (verdes, 2026-11-05 ~14:5x CST). Prueba empírica de las funciones puras
`rutaDentroDe`/`resolverRealParcial` (copiadas tal cual de `folders.ts:112-140`) y de `esEfectivo`
con `node` sobre carpetas temporales en `/private/tmp` (traversal, symlink hacia fuera, prefijo
parecido, ruta por crear). No se ejecutó la app ni se abrió ninguna BD.
**PII declaration:** Sin PII. Ninguna base real ni respaldo (`~/Library/Application Support` no se
tocó); ninguna carpeta real del negocio se leyó ni escribió. Los casos de §4 son flujos sintéticos
sin sujetos; `CL-0001`/`SRV-0001` son placeholders.
**State as of:** 2026-11-05 15:01 CST, rama `atlas/cobro-a` @ `efc4795` + working tree (34
modificados, 1 eliminado, 12 sin rastrear).

---

## 1. Resumen ejecutivo

1. **El renderer ya no puede elegir ninguna ruta, y el main valida todas las que usa: CORRECTO.**
   Los seis canales `archivos:*` reciben solo ids o un token (`shared/ipc-contract.ts`, diff:
   `subirComprobante(servicioRealizadoId)`, `elegirComprobante()`, `comprobantesCita(citaId)`,
   `vistaPrevia(archivoId, tamano)`, `abrirComprobante(archivoId)`,
   `guardarCopiaComprobante(archivoId)`); el handler viejo que aceptaba `carpetaDestino` del
   renderer desapareció (`git diff electron/ipc/index.ts`). Origen y destino de todo archivo salen de
   diálogos del main (`ipc/index.ts:287-295,320-323`) o de la BD. Escritura: `guardarArchivoDesdeRuta`
   conserva `rutaDentroDe(carpetaDestino, carpetaRaiz)` (`archivos.ts:35`). Lectura, apertura y
   copia: las tres pasan por `rutaComprobante` → `categoria = comprobante` + `rutaDentroDe` +
   `existsSync` (`comprobantes.ts:115-124`). La prueba en `/private/tmp` confirma que `rutaDentroDe`
   rechaza `..`, symlink hacia fuera y prefijo parecido (`Negocio_otro/`), y acepta una subcarpeta
   aún por crear. `grep -rn "file://" src` → 0 (condición 8).
2. **El PIN se quitó exactamente de donde se dijo y se quedó donde se dijo: CORRECTO.** Único
   `verificarPin` en servicios de dinero: `cobros.ts:434` (`cancelarPago`); `serviciosRealizados.ts`
   ya no lo importa (diff) y `cierreCitaInputSchema`/`abonoInputSchema`/`anticipoInputSchema` no
   tienen `pin` (`schemas.ts:177-205`); `cancelarPagoInputSchema` lo exige (`:211`) y la UI lo pide
   (`PagosDeCita.tsx:340,373`).
3. **La regla de evidencia en el servidor es sólida para cierre y abono: CORRECTO.** Una sola
   definición de "efectivo" y de "requiere evidencia" en `shared/schemas.ts:164-171`, usada por el
   main y el renderer; el main la evalúa con `tieneComprobante` (`serviciosRealizados.ts:186-189`,
   `cobros.ts:348-351`) y escribe la marca en bitácora (`serviciosRealizados.ts:345-352`,
   `cobros.ts:378`). Efectivo no pide nada; tarjeta/transferencia sin comprobante y sin
   `sinComprobanteAceptado` → rechazo antes de abrir la transacción.
4. **Para el anticipo, "hay token" se toma como "hay evidencia" antes de comprobar que el token
   exista, y el adjunto corre después del commit.** Si adjuntar falla (token caducado o falso,
   archivo origen desaparecido, copia fallida), el anticipo ya está registrado sin marca en
   bitácora, el handler lanza, y el renderer deja el panel abierto con el botón habilitado y el
   mismo token ya consumido: **un segundo clic registra un segundo anticipo** (dinero duplicado en
   caja hasta que alguien lo cancele con PIN). → **COB-A2** (consecuencia) y **COB-M2** (regla).
5. **`comprobantes.ts` escribe `pagos` fuera de `cobros.ts`.** La verificación de la condición 5 del
   Gate del cobro pasa de 0 a 1 (`comprobantes.ts:82`). Está declarado en el addendum, pero el
   invariante "único escritor" ya tiene una excepción fuera de su dueño y nadie lee la columna
   hoy. → **COB-M3**.
6. **La creación de carpetas vive en los dueños de las tablas y no rompe migración, respaldos ni
   reinicio: CORRECTO en lo estructural.** `asegurarCarpetaCliente` (`clientes.ts:76-85`) y
   `asegurarCarpetaServicio` (`serviciosRealizados.ts:156-170`) son los únicos escritores de
   `carpeta_path` (gate cond. 7b; `grep "update(serviciosRealizados)" comprobantes.ts archivos.ts`
   → 0); las rutas nuevas nacen bajo `Datos/` (`folders.ts:74,91`), así que `migrarRutasCarpetas`
   (`replace` de prefijo viejo, `migracionCarpetas.ts:16-30`) es un no-op sobre ellas; el respaldo
   comprime `Datos/` completo (`respaldos.ts:92-94`) y el reinicio lo vacía completo
   (`folders.ts:102-105`). **Pero** la condición "la carpeta guardada no existe en disco *ahora*"
   también se cumple con un disco externo desmontado o una raíz movida, y entonces se reescribe
   `carpeta_path` en silencio hacia una carpeta nueva (`CL-xxxx_Nombre_2` si la original reaparece):
   carpeta partida, sin bitácora. → **COB-M4**.
7. **Bitácora sin PII: CORRECTO.** Todos los `detalle` nuevos llevan código de servicio, código de
   clienta, fecha/hora, método y monto (`cobros.ts:378,422`, `serviciosRealizados.ts:350`,
   `comprobantes.ts:151-156`); ningún nombre, ruta ni contenido. Deuda cosmética en cómo se marcan
   como sensibles (→ **COB-B8**).
8. **Miniaturas dentro de lo que aprobó la condición 8: CORRECTO con desvíos declarables.** Por
   `archivoId`, una por llamada, perezosa (`Comprobantes.tsx:67-74`, `staleTime: Infinity`), JPEG vía
   `toJPEG(85)`, data URL (CSP ya admite `img-src data:`, `index.html:8`). La miniatura del
   sistema es **asíncrona** (`createThumbnailFromPath`, `comprobantes.ts:135`) y no bloquea; el
   fallback síncrono (`createFromPath` + `resize`, `:141-143`) solo corre si el sistema no la da.
   → **COB-B7** (informativo).
9. **`guardarCopia` es una salida de PII declarada y trazada, no un hueco.** Solo por diálogo de
   guardado del main, origen validado, bitácora `comprobante_copiado` sin contenido
   (`comprobantes.ts:148-156`); mismo nivel de control que la exportación CSV (sin PIN). → **COB-B9**
   (informativo).
10. **Bomba de tiempo (§5):** ninguna con fecha propia. COB-A2 detona la primera vez que un adjunto
    falle en la cabina; COB-M4 la primera sesión con la carpeta raíz inaccesible. Ambas caben en la
    misma evidencia manual que COB-A1 sigue debiendo.

**Veredicto:** integrable **después** de cerrar COB-A2/M2 (un cambio pequeño en
`cobros:registrarAnticipo` + `PagosDeCita.tsx`); sin ellas, el flujo honesto de anticipo con
comprobante puede duplicar dinero ante cualquier fallo de copia.

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Regla de evidencia (reemplaza BR-008)

```
esEfectivo(m)            = m.trim().toLowerCase().startsWith("efectivo")            schemas.ts:164-166
requiereEvidencia(L)     = ∃ l ∈ L : l.monto > 0 ∧ ¬esEfectivo(l.metodoPago)        schemas.ts:169-171

cierre:  sinEvidencia = ¬tieneComprobante(servicio) ∧ requiereEvidencia(pagos)      serviciosRealizados.ts:186
         sinEvidencia ∧ ¬sinComprobanteAceptado → rechazo (antes de la tx)          :187-189
         sinEvidencia → bitácora cobro_sin_comprobante                               :345-352
abono:   idem con input.lineas                                                       cobros.ts:348-351
         marca "· sin comprobante (aceptado)" en pago_registrado                     :378
anticipo: sinEvidencia = requiereEvidencia(lineas) ∧ ¬comprobanteToken               cobros.ts:391   ← token NO validado
         sinEvidencia ∧ ¬sinComprobanteAceptado → rechazo                            :392-394
         marca en anticipo_registrado solo si sinEvidencia                            :422
cancelar: verificarPin SIEMPRE                                                        cobros.ts:434 (BR-009)
```

`esEfectivo` se evalúa sobre el nombre configurado; `registrarPagosEnTx` ya exige que el método esté
en la configuración (`cobros.ts:237-239`). Falsos negativos ("Cash", "Transferencia efectivo") solo
piden una confirmación de más; un falso positivo requeriría un método que **empiece** por
"efectivo" y no sea efectivo. **Diseño** (addendum: "se reconoce por nombre").

### 2.2 Flujo de anticipo con comprobante (IPC `cobros:registrarAnticipo`)

```
renderer  elegirComprobante() ─► main: dialog ─► guardarSeleccion(ruta): valida ext, token=uuid,
                                                   selecciones.set(token, ruta)       comprobantes.ts:38-44
                                                   (si size > 20 → clear() total)     :40
renderer  registrarAnticipo({citaId, lineas, sinComprobanteAceptado, comprobanteToken})
main      1) ids = cobros.registrarAnticipo(datos)     ← tx COMMIT, bitácora sin marca   ipc:338, cobros.ts:398-425
          2) si token: conEvidencia = ids[i] con ¬esEfectivo(lineas[i])                 ipc:340-343
             adjuntarComprobanteAnticipo(token, citaId, conEvidencia):
               consumirSeleccion(token)  → throw "Vuelve a elegir…" si no existe        comprobantes.ts:46-51,69
               asegurarCarpetaCliente(cita.clienteId) + "/Pagos"                        :71-73
               guardarArchivoDesdeRuta (rutaDentroDe, mkdir, copy, insert archivos)     :74-81, archivos.ts:33-63
               update(pagos).set(comprobanteArchivoId)  WHERE id IN conEvidencia        :82
          3) cualquier error de (2) → throw "El anticipo quedó registrado, pero…"       ipc:345-347
renderer  onError → setError; panel sigue abierto; `listo` sigue true; token sigue en estado   PagosDeCita.tsx:255,259,321
```

El orden `ids[i] ↔ lineas[i]` es correcto: `registrarPagosEnTx` inserta en el orden de `lineas`
y devuelve los ids en ese orden (`cobros.ts:231-258`).

### 2.3 Lecturas de archivo

```
rutaComprobante(id): fila archivos ∧ categoria='comprobante' ∧ rutaDentroDe(ruta_fisica, carpetaRaiz) ∧ exists   comprobantes.ts:115-124
vistaPrevia(id, mini|grande): lado 240 | 1600; createThumbnailFromPath (async) → toJPEG(85) → data URL;
                              fallback: solo ext imagen, createFromPath (sync) + resize si width > lado   :131-145
abrirComprobante(id): rutaComprobante → shell.openPath                                                      ipc:312-316
guardarCopia(id):     rutaComprobante → showSaveDialog(defaultPath Downloads/nombreOriginal) → copyFileSync → bitácora   ipc:317-327, comprobantes.ts:148-156
listarComprobantesCita(citaId): archivos categoria=comprobante con entidad cita ∨ servicio_realizado de esa cita;
                                devuelve {id, nombreOriginal, createdAt, origen, esPdf} — sin ruta         :86-112
```

`archivos:listar` (pre-existente, `ipc:328-330`) sigue devolviendo `rutaFisica`, pero ningún
componente del renderer lo llama (`grep "archivos.listar" src` → 0). `clientes.carpetaPath` y
`servicio.carpetaPath` sí llegan al renderer para "Abrir carpeta" (`Clientes.tsx:530-534`,
`CierreCitaModal.tsx:295-299`): pre-existente, validado en `abrirCarpeta` (`folders.ts:149-172`).

### 2.4 Creación de carpetas

```
asegurarCarpetaCliente(id):  si carpeta_path ∧ existsSync → la devuelve;
                             si no → crearCarpetaCliente(raiz, CL-xxxx, nombre) [rutaSinColision → _2, _3…]
                                     update clientes.carpeta_path   (sin bitácora)                clientes.ts:76-85
asegurarCarpetaServicio(id): idem; si falta, primero asegurarCarpetaCliente, luego
                             crearCarpetaServicio(carpetaCliente, SRV-xxxx, fecha, nombreServicio)  serviciosRealizados.ts:156-170
```

### 2.5 Diseño vs. bug

| Comportamiento | Lectura |
|---|---|
| Sin PIN en cierre/abono/anticipo; PIN en cancelar | **Diseño** (addendum "deja de ser candado") |
| Efectivo por prefijo de nombre | **Diseño** declarado |
| Comprobante del servicio se puede subir sobre el borrador `abierto` (desde el cierre) | **Diseño** (addendum: "disponible en el cierre"); `eliminarCita` lo respeta (`citas.ts:290-298`) |
| "Agregar" comprobante solo en citas cerradas en el detalle | **Diseño** (`PagosDeCita.tsx:132`) |
| Anticipo con token: el adjunto corre tras el commit y, si falla, "el anticipo queda registrado y el error lo dice" | **Diseño declarado** en el addendum… |
| …pero el renderer no cierra el panel ni invalida, y permite un segundo registro | **Bug** → COB-A2 |
| …y el token no se valida antes de registrar; `sinEvidencia` queda falso aunque no haya evidencia; sin marca en bitácora | **Bug** → COB-M2 |
| `comprobantes.ts` actualiza `pagos.comprobante_archivo_id` | **Desviación declarada** del Gate del cobro (cond. 5), no re-abierta → COB-M3 |
| Carpeta guardada inexistente ⇒ carpeta nueva y `carpeta_path` reescrito | **Diseño** para "borrada a mano / importada"; **hueco** para "disco desmontado / raíz movida" → COB-M4 |
| `selecciones` sin TTL y `clear()` total a > 20 | **Deuda** → COB-B6 |
| `tipo_mime` NULL, sin `isEmpty()` al subir, validación contra `carpetaRaiz` en vez de `carpetaDatos` | **Desvíos menores** respecto a la letra de las condiciones 7c/7d/8 del Gate de la ficha (que son para fotos) → COB-B7 |

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `archivos` categoría `comprobante`, entidad `servicio_realizado` | `subirComprobanteServicio` → `guardarArchivoDesdeRuta` (ruta de diálogo del main, destino de `asegurarCarpetaServicio`) | ✅ |
| `archivos` categoría `comprobante`, entidad `cita` (anticipos) | `adjuntarComprobanteAnticipo` → carpeta `<clienta>/Pagos` | ✅ ruta; ⚠️ puede faltar aunque el anticipo diga que la tenía (COB-A2/M2) |
| `archivos.tipo_mime` | nadie lo escribe (`grep tipoMime electron/services` → 0) | ⚠️ NULL (COB-B7, igual que antes) |
| `pagos.comprobante_archivo_id` | solo `comprobantes.ts:82`; FK `ON DELETE set null` desde `0000:165`; **ningún lector** (`grep comprobanteArchivoId` → solo ese escritor) | ⚠️ columna de solo escritura (COB-M3) |
| `clientes.carpeta_path` | `crearCliente` (`clientes.ts:92`) y ahora `asegurarCarpetaCliente` (`:83`) | ⚠️ reescritura silenciosa si la carpeta no está montada (COB-M4) |
| `servicios_realizados.carpeta_path` | `abrirCierre` (`serviciosRealizados.ts:128-130`, NULL si la clienta no tiene carpeta) y `asegurarCarpetaServicio` (`:168`) | ⚠️ idem |
| `bitacora.cobro_sin_comprobante` | solo `cerrarCita` (`serviciosRealizados.ts:345-352`) | ✅ sin PII |
| `bitacora.pago_registrado` / `anticipo_registrado` con sufijo "sin comprobante (aceptado)" | `cobros.ts:378,422` | ✅ sin PII; ⚠️ no marcados sensibles en la UI (COB-B8); ⚠️ falta cuando el adjunto falla (COB-A2) |
| `bitacora.comprobante_copiado` | `comprobantes.ts:151-156`, `entidad_id` = archivo | ✅ |
| `selecciones` (memoria del main) | `guardarSeleccion`; token uuid v4 → ruta absoluta de origen | ⚠️ sin caducidad (COB-B6) |
| `PROJECT.md › sensitive_globs` | el addendum pide agregar `comprobantes.ts`; `grep -c comprobantes.ts PROJECT.md` → 0; `pagos.ts` sigue listado (COB-B1) | ⚠️ lo edita Carlos |

## 4. Caso por caso

Flujos **sintéticos**, sin sujetos reales. "Sistema" = lo que hace el código leído; "Esperado" = lo
que dice el addendum o el Gate.

| # | Caso | Valor del sistema | Esperado | Lectura |
|---|---|---|---|---|
| 1 | Cierre, todo en Efectivo, sin comprobante, sin flag | `requiereEvidencia` = false → cierra, sin marca | igual | ✅ |
| 2 | Cierre, Tarjeta, sin comprobante, sin flag (renderer manda `false`/nada) | rechazo "Súbelo o confirma…" antes de la tx (`serviciosRealizados.ts:187-189`), nada escrito | igual | ✅ control en el servidor |
| 3 | Cierre, Tarjeta, sin comprobante, flag `true` | cierra; `cita_cerrada` + `cobro_sin_comprobante` con `SRV-0001` | igual | ✅ |
| 4 | Cierre, Tarjeta, comprobante subido en el borrador (`archivos:subirComprobante(SRV-0001)`) | carpeta del servicio creada si faltaba (y la de la clienta), `tieneComprobante` = true → sin confirmación | igual (corrige "botón bloqueado") | ✅ |
| 5 | Abono Transferencia sin comprobante sin flag | rechazo (`cobros.ts:349-351`) | igual | ✅ |
| 6 | Anticipo Tarjeta sin token sin flag | rechazo (`cobros.ts:392-394`) | igual | ✅ |
| 7 | Anticipo Tarjeta con token **válido**, copia OK | pago + `archivos` (entidad cita, `Pagos/`) + `comprobante_archivo_id`; miniatura "Anticipo" en el detalle | igual | ✅ |
| 8 | Anticipo Tarjeta + Efectivo con token válido | solo el pago de Tarjeta queda ligado (`ipc:343`); el archivo se lista igual | igual | ✅ |
| 9 | Anticipo Tarjeta con token **caducado** (`clear()` tras 21 selecciones) o **falso** (`"x"` desde un renderer comprometido) | `sinEvidencia` = false → pago registrado **sin** marca; `consumirSeleccion` lanza; handler lanza "quedó registrado, pero…" | "control en el servidor… si falta, rechaza" | ❌ COB-M2 |
| 10 | Caso 9 (o archivo origen borrado entre elegir y registrar) y la usuaria vuelve a pulsar "Registrar anticipo" | panel abierto, `listo` true, mismo token → **segundo anticipo** sin confirmación, mismo error | un solo anticipo | ❌ COB-A2 |
| 11 | Clienta sin carpeta (`carpeta_path` NULL) sube comprobante | `asegurarCarpetaCliente` crea `Datos/Clientes/CL-0001_<nombre>` y guarda la ruta | igual | ✅ |
| 12 | Clienta con `carpeta_path` en un disco externo hoy desmontado; se sube comprobante | `existsSync` = false → carpeta **nueva** bajo la raíz actual (`mkdirSync recursive` la crea aunque la raíz sea el mismo punto de montaje) y `carpeta_path` reescrito; al volver el disco, la original queda huérfana del registro | no definido por el addendum | ⚠️ COB-M4 |
| 13 | Clienta con `carpeta_path` en una raíz **anterior** (se cambió `carpetaRaiz` sin mover datos) | la carpeta existe → se devuelve → `guardarArchivoDesdeRuta` rechaza "fuera de la carpeta del negocio" | "corrige el botón bloqueado" | ⚠️ sigue bloqueado en ese caso (pre-existente; COB-M4) |
| 14 | `archivos:vistaPrevia(id)` con un id de `foto_antes` o de un archivo cuya `ruta_fisica` apunta fuera de la raíz | rechazo por categoría / por `rutaDentroDe` | igual | ✅ |
| 15 | `rutaDentroDe` con `..`, symlink hacia fuera, `Negocio_otro/`, ruta por crear, vacía | false, false, false, true, false (prueba en `/private/tmp`) | igual | ✅ |
| 16 | `cobros:cancelarPago` sin `pin` | zod rechaza (`schemas.ts:211`); con PIN malo, `cobros.ts:434` | PIN siempre | ✅ |
| 17 | `guardarCopiaComprobante(id)` | diálogo del main, copia a donde elija la usuaria, bitácora sin contenido | igual | ✅ (COB-B9 informativo) |

Hallazgos:

- **COB-A2** (Alta) — **Fallo parcial del anticipo con comprobante deja la UI lista para duplicar
  el anticipo y sin rastro de que no hay evidencia.** `ipc/index.ts:336-349` registra el anticipo
  (commit) y después adjunta; si `adjuntarComprobanteAnticipo` lanza (token inexistente,
  `comprobantes.ts:48`; origen desaparecido o copia fallida, `archivos.ts:46`; carpeta fuera de la
  raíz, `:35`), el handler **lanza** un error. En `PagosDeCita.tsx:255` ese error solo hace
  `setError`; `onHecho` (invalidar + cerrar panel) no corre; `listo` sigue `true` (`:259,321`) y
  `seleccion.token` sigue en estado. Un segundo clic manda el mismo token: `cobros.ts:391` lo toma
  como evidencia, registra **otro** anticipo (sin pedir confirmación) y vuelve a fallar al
  adjuntar. Cada repetición suma dinero cobrado a la cita y al corte pendiente; se revierte solo
  cancelando con PIN. Además, el primer anticipo quedó con método no efectivo, sin comprobante y
  **sin** la marca "sin comprobante (aceptado)" en `anticipo_registrado` (`cobros.ts:422`) ni fila
  `cobro_sin_comprobante`. Severidad **Alta**: riesgo real en una acción de dinero + rastro
  faltante; no Crítica porque el registro duplicado es visible (dos filas en el panel de pagos) y
  reversible con rastro (BR-001).
- **COB-M2** (Media) — **La regla del servidor para anticipos acepta cualquier cadena como
  evidencia.** `cobros.ts:391` usa `!input.comprobanteToken` sin consultar `selecciones`; el token
  solo se verifica al consumirlo, ya con el pago escrito (`comprobantes.ts:46-51,69`). En el flujo
  honesto ocurre con un token caducado por `clear()` (`:40`); desde un renderer comprometido, con
  `comprobanteToken: "x"` (equivale a mandar `sinComprobanteAceptado: true`, pero **sin** la marca
  en bitácora que el addendum promete). Causa raíz de COB-A2.
- **COB-M3** (Media) — **`update(pagos)` fuera de `cobros.ts`.** `comprobantes.ts:82` escribe
  `pagos.comprobante_archivo_id`; la verificación literal de la condición 5 del Gate del cobro
  (`grep "insert(pagos)\|update(pagos)" fuera de cobros.ts → 0`) ahora da 1. El addendum lo
  declara ("escribe `archivos` y `pagos.comprobante_archivo_id`"), pero el Gate no se enmendó y la
  Parte A lo reportó como cumplido. Hoy **nadie lee** la columna (los comprobantes se listan por
  `entidad_tipo/entidad_id`, `comprobantes.ts:93-100`), así que su valor es solo de trazabilidad.
  Fix de una función: `cobros.ligarComprobanteEnTx(tx, pagoIds, archivoId)` exportada, o que el
  dueño enmiende la condición 5 por escrito.
- **COB-M4** (Media) — **`asegurarCarpeta*` reescribe `carpeta_path` cuando la carpeta "no existe"
  en ese instante, sin distinguir borrada de inaccesible, y sin bitácora.** `clientes.ts:80-84`,
  `serviciosRealizados.ts:160-168`. Casos que disparan la reescritura sin que la carpeta esté
  borrada: carpeta raíz en disco externo/red desmontado; restauración de respaldo a medias; raíz
  movida a mano. `crearCarpetaCliente` → `rutaSinColision` (`folders.ts:28-38,75`) produce
  `CL-xxxx_Nombre_2` si la original reaparece antes del mkdir, y la BD apunta a la nueva. No hay
  pérdida: `archivos.ruta_fisica` es absoluta y sigue válida; el respaldo comprime `Datos/`
  completo (`respaldos.ts:92-94`); `migrarRutasCarpetas` solo reemplaza el prefijo pre-`Datos/`
  (`migracionCarpetas.ts:16-30`) y no se ve afectado; el reinicio vacía `Datos/` entero. Lo que
  se degrada: una clienta con dos carpetas (fotos de la ficha en una, comprobantes en otra), y el
  caso 13 (raíz cambiada sin mover datos) sigue bloqueado aunque el addendum diga "corrige el botón
  bloqueado". Fix: si `carpeta_path` está definida y **cae dentro de la raíz actual**
  (`rutaDentroDe`), recrearla en esa misma ruta con `mkdirSync(recursive)` (sin `_2`); si cae fuera,
  crear la nueva y escribir bitácora `carpeta_recreada` con el código de la clienta/servicio; el
  caso "raíz desmontada" se detecta con `existsSync(carpetaDatos(raiz))` antes de crear nada.
- **COB-B6** (Baja) — `selecciones` (`comprobantes.ts:36-51`) no caduca ni se limpia al cerrar el
  panel; a más de 20 entradas se vacía **entera**, incluida la selección que está en uso en otro
  panel (prueba: 22 selecciones sin consumir → 1 viva). Los tokens son uuid v4 (no adivinables) y
  la ruta nunca sale del main, así que el riesgo es funcional, no de PII. Fix: `archivos:descartarComprobante(token)`
  al cerrar/quitar, o TTL de minutos en vez de `clear()`.
- **COB-B7** (Baja, informativo) — Vista previa frente a la condición 8 del Gate de la ficha:
  cumple lo esencial (por `archivoId`, una por llamada, perezosa, `toJPEG`, sin `file:` ni
  protocolo). Desvíos: (a) valida contra `carpetaRaiz` y no contra `carpetaDatos(raiz)`
  (`comprobantes.ts:120`) — admite `Respaldos/`, solo relevante si alguien edita `archivos` a mano;
  (b) "grande" = 1600 px (gate: ≤ 320) para el visor dentro de la app — ≈ 300-600 KB de base64 por
  apertura, una vez por archivo; (c) el fallback `createFromPath` + `resize` (`:141-143`) es
  síncrono y decodifica la imagen completa en el main, pero solo corre cuando
  `createThumbnailFromPath` (asíncrona, macOS/Windows) falla o devuelve vacío — en Windows un PDF
  sin handler de miniaturas cae a `null` sin decodificar; (d) 7c/7d del Gate (`isEmpty()` al subir,
  `tipo_mime`) no se aplican a comprobantes: solo lista blanca de extensión (`:27-32`) —
  suficiente para abrir con el visor del sistema por extensión, no ejecuta nada; (e) la CSP sigue
  admitiendo `img-src file:` (`index.html:8`, pre-existente) aunque el renderer ya no lo usa.
- **COB-B8** (Baja) — Bitácora: `ACCIONES_SENSIBLES` marca `cobro_sin_comprobante` (`Bitacora.tsx:12`),
  que solo emite el cierre; abono y anticipo llevan la marca como sufijo de `pago_registrado` /
  `anticipo_registrado` y no se resaltan ni se filtran igual. Subir o adjuntar un comprobante no
  deja bitácora (tampoco antes). `schema.ts:274` conserva el comentario "candado de comprobante".
  `PROJECT.md › sensitive_globs` no incluye `comprobantes.ts` (lo pide el addendum; lo edita Carlos)
  y sigue listando `pagos.ts` (COB-B1).
- **COB-B9** (Baja, informativo) — `guardarCopia` es la única ruta por la que un comprobante (que
  puede traer nombre, últimos dígitos de tarjeta o cuenta) sale de la carpeta del negocio: diálogo
  de guardado del main, origen validado, destino libre, bitácora `comprobante_copiado` con el id
  del archivo y sin contenido (`comprobantes.ts:148-156`). Mismo nivel que la exportación CSV (sin
  PIN; `grep pin exportarCsv.ts` → 0). Nada que corregir; se deja escrito como salida de PII
  conocida para el inventario de la superficie.

### Condiciones del Gate de la ficha clínica reutilizadas (7 y 8) — aplicadas a comprobantes

| Cond. | Verificación | Resultado |
|---|---|---|
| 7 — sin parámetro de ruta en la firma | `shared/ipc-contract.ts`: `subirComprobante(servicioRealizadoId)` | ✅ |
| 7b — carpeta ausente la crea el dueño de la tabla | `clientes.ts:76`, `serviciosRealizados.ts:156`; `grep "update(serviciosRealizados)" comprobantes.ts archivos.ts` → 0 | ✅ (⚠️ COB-M4 en el "cuándo") |
| 7c — lista blanca + `isEmpty()` | solo lista blanca (`comprobantes.ts:27-32`) | ⚠️ parcial (B7; PDF no es verificable así) |
| 7d — `tipo_mime` | sigue NULL | ⚠️ (B7) |
| 7e — `guardarArchivoDesdeRuta` conserva `rutaDentroDe` | `archivos.ts:35` | ✅ |
| 8 — por `archivoId`, `rutaDentroDe`, JPEG, perezosa, sin `file:` | `comprobantes.ts:115-145`; `Comprobantes.tsx:67-77`; `grep file:// src` → 0; `grep -c rutaDentroDe comprobantes.ts` → 1 (los tres handlers comparten `rutaComprobante`) | ✅ (⚠️ raíz en vez de `Datos/`, 1600 px: B7) |

### Condiciones del Gate del cobro afectadas por el delta

| Cond. | Verificación | Resultado |
|---|---|---|
| 5 | `grep "insert(pagos)\|update(pagos)"` fuera de `cobros.ts` → 0 | ❌ 1 (`comprobantes.ts:82`) → COB-M3 |
| 6 | `grep "from(pagos)"` fuera de `cobros.ts`/`corte.ts` → 0 | ✅ 0 |
| 15 | comprobante de tarjeta (Parte B) | n/a |

## 5. Riesgos activos — con fechas de detonación

### 5.1 Anticipo duplicado tras un fallo de adjunto (COB-A2/M2)
Mecanismo en §2.2. Permanente mientras `cobros:registrarAnticipo` lance tras el commit y el
renderer no cierre el panel en ese error. No tiene fecha propia: detona la primera vez que, en la
cabina, una foto elegida se mueva/borre antes de registrar, falle la copia, o se acumulen 21
selecciones abandonadas. Cada vez que detona, el dinero de la caja queda inflado en el monto del
anticipo hasta que alguien note las dos filas y cancele una con PIN.

### 5.2 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| 1 | Carpeta única por clienta: la primera sesión con la raíz inaccesible que suba un comprobante parte la carpeta (COB-M4) | sin fecha; depende de dónde esté `carpetaRaiz` en la instalación real |
| 2 | Verificación 5 del Gate del cobro como prueba automática del invariante "único escritor" (COB-M3) | desde este delta |

### 5.3 Causa raíz
Dos: (a) en el anticipo, la **presencia** de un token se usa como prueba de evidencia y el adjunto
se hace fuera de la transacción y se reporta como error, cuando el addendum lo define como éxito
parcial ("queda registrado y el error lo dice") — el contrato IPC devuelve `void` y no puede decir
"registrado, sin comprobante"; (b) `asegurarCarpeta*` interpreta "no existe ahora" como "fue
borrada".

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** no integrar `cobros:registrarAnticipo` con `comprobanteToken` tal como está;
  el resto del delta (regla de evidencia, lectura de comprobantes, subida al servicio) es
  integrable.
- **Decisión A — qué es un anticipo cuyo comprobante no se pudo guardar:** (i) tratarlo como
  "sin comprobante (aceptado)": registrar la marca en bitácora y devolver al renderer un resultado
  con aviso, no un error (recomendado: cumple el addendum tal cual); o (ii) hacer el adjunto parte
  del mismo paso y deshacer el anticipo si falla (más limpio, pero contradice "queda registrado").
- **Decisión B — carpeta guardada inaccesible:** (i) recrear en la misma ruta si cae dentro de la
  raíz actual y rechazar con mensaje ("La carpeta del negocio no está disponible") si la raíz no
  existe (recomendado); o (ii) mantener "crear nueva" pero con bitácora. Y decidir si el caso 13
  (raíz cambiada sin mover datos) se resuelve moviendo datos en `config:actualizar` o se documenta.
- **Decisión C — condición 5 del Gate del cobro:** mover la escritura a `cobros.ts` (recomendado,
  una función) o enmendar la condición por escrito en el Gate.
- **Cambio propuesto (COB-A2 + COB-M2):**
  1. `comprobantes.existeSeleccion(token): boolean` (sin consumir). En `cobros.registrarAnticipo`:
     `const conToken = !!input.comprobanteToken && existeSeleccion(input.comprobanteToken)`;
     `sinEvidencia = requiereEvidencia(lineas) && !conToken`. Un token falso o caducado vuelve a
     exigir `sinComprobanteAceptado` → el renderer muestra la confirmación o "Vuelve a elegir".
  2. El handler devuelve `{ comprobanteGuardado: boolean; aviso?: string }` en lugar de lanzar; si
     el adjunto falla, escribe `cobro_sin_comprobante` (`entidad cita`, detalle con fecha/hora y
     `CL-xxxx`) dentro de una `registrarAccion` propia, y el contrato IPC (`ipc-contract.ts`)
     cambia `registrarAnticipo` a `Promise<ResultadoAnticipo>`.
  3. `PagosDeCita.tsx`: `onSuccess` siempre invalida y cierra el panel; si `aviso`, `toast.warning`.
     Con eso un segundo clic es imposible y el estado queda consistente.
- **Cambio propuesto (COB-M3):** `cobros.ligarComprobanteEnTx(tx, pagoIds, archivoId)`; `comprobantes.ts`
  deja de importar `pagos`. Verificación: el grep de la condición 5 vuelve a 0.
- **Cambio propuesto (COB-M4):** en `asegurarCarpetaCliente`/`asegurarCarpetaServicio`: si
  `carpeta_path` existe en BD y `rutaDentroDe(carpeta_path, carpetaRaiz)` → `mkdirSync(carpeta_path,
  { recursive: true })` y devolverla (sin tocar la BD); si no cae dentro → comportamiento actual +
  bitácora `carpeta_recreada`; si `!existsSync(carpetaDatos(raiz))` → rechazar con mensaje.
- **COB-B6:** `archivos:descartarComprobante(token)` al cerrar el panel o quitar la selección.
- **COB-B8:** marcar como sensibles también `pago_registrado`/`anticipo_registrado` cuando el detalle
  contiene "sin comprobante", o emitir `cobro_sin_comprobante` en abono y anticipo como en el cierre
  (más uniforme). Carlos: `sensitive_globs` + `comprobantes.ts`, − `pagos.ts`.

**Verificación manual pendiente** (solo lectura; BD de prueba con `npm run dev`, nunca la real;
reportar solo conteos):

```sql
-- (a) Anticipos no efectivo, cobrados, sin comprobante en disco ni marca en bitácora
--     (reproduce COB-A2/M2 si > 0 tras forzar un fallo de adjunto)
SELECT COUNT(*) FROM pagos p
 WHERE p.concepto = 'anticipo' AND p.estatus = 'cobrado'
   AND lower(trim(p.metodo_pago)) NOT LIKE 'efectivo%'
   AND NOT EXISTS (SELECT 1 FROM archivos a WHERE a.entidad_tipo = 'cita' AND a.entidad_id = p.cita_id AND a.categoria = 'comprobante')
   AND NOT EXISTS (SELECT 1 FROM bitacora b WHERE b.entidad_id = p.cita_id AND b.detalle LIKE '%sin comprobante (aceptado)%');
-- Esperado tras el fix: 0. Hoy: 1 por cada fallo de adjunto.

-- (b) Anticipos duplicados en la misma cita y el mismo segundo (síntoma de COB-A2)
SELECT cita_id, COUNT(*) FROM pagos WHERE concepto = 'anticipo' AND estatus = 'cobrado'
 GROUP BY cita_id, created_at HAVING COUNT(*) > 1;
-- Esperado: 0 filas.

-- (c) Clientas con carpeta fuera de la raíz actual (caso 13) o con más de una carpeta (COB-M4)
SELECT COUNT(*) FROM clientes WHERE carpeta_path IS NOT NULL AND carpeta_path NOT LIKE '<carpetaRaiz>%';
-- Esperado: 0.

-- (d) Comprobantes de anticipo sin pago ligado (adjunto que falló en el último paso)
SELECT COUNT(*) FROM archivos a WHERE a.entidad_tipo = 'cita' AND a.categoria = 'comprobante'
   AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.comprobante_archivo_id = a.id);
-- Esperado: igual al número de anticipos 100 % efectivo con comprobante (normalmente 0).
```

Prueba manual (BD de prueba, con los números en la nota de evidencia de COB-A1):
1. Anticipo Tarjeta $200 con "Elegir comprobante" → borrar el archivo elegido en el Finder →
   "Registrar anticipo". Hoy: error "quedó registrado, pero…", panel abierto; **volver a pulsar
   registra un segundo anticipo** (consulta (b) → 1 fila). Tras el fix: un solo anticipo, aviso,
   panel cerrado, fila `cobro_sin_comprobante` (consulta (a) → 0).
2. Clienta con `carpeta_path` NULL → subir comprobante desde el cierre → carpeta creada bajo
   `Datos/Clientes/`, botón habilitado.
3. Detalle de una cita con comprobante del servicio + comprobante de anticipo → dos miniaturas,
   "Anticipo" en la segunda; abrir en grande, visor del sistema y "Descargar" → fila
   `comprobante_copiado`.
4. Cancelar pago sin PIN → bloqueado en la UI; con PIN incorrecto → "El PIN de acceso no es correcto."

## 7. Qué sigue

1. **Carlos decide** A (recomendado i), B (recomendado i) y C (recomendado mover a `cobros.ts`), por
   escrito en el addendum del spec.
2. **Engineering prepara** el cambio de COB-A2/M2 (tres puntos), COB-M3 (una función) y COB-M4
   (dos `if`), y vuelve a pasar `npm run typecheck` / `npm run build` y el grep de la condición 5.
3. **Prueba manual** 1-4 sobre BD de prueba y consultas (a)-(d); los conteos entran en la misma nota
   de evidencia que COB-A1 (`evidencia-cobro-v2-parte-a-<fecha>.md`), que sigue siendo la condición
   para el tag.
4. **Carlos edita** `PROJECT.md`: `sensitive_globs` + `electron/services/comprobantes.ts`,
   − `electron/services/pagos.ts` (COB-B1/B8).
5. COB-B6, B7, B9: backlog explícito, sin fecha. Si la ficha clínica adopta `vistaPrevia` para sus
   fotos, hereda B7(a) (validar contra `carpetaDatos`) y la decisión sobre 7c/7d.
