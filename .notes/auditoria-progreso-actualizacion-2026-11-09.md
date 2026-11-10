# Audit — Barra de progreso del auto-update (banner) — 2026-11-09 (ACT-M1…M3, ACT-B1…B6)

**Scope:** El cambio sin commitear en el working tree sobre `main @ aca84a9` que agrega progreso de descarga y canal de error al banner de actualización: `electron/services/actualizaciones.ts`, `electron/preload.ts`, `shared/ipc-contract.ts`, `shared/types.ts`, `src/components/ActualizacionBanner.tsx`, con su spec `.notes/spec-progreso-actualizacion-2026-11-09.md`. Se leyó además el contexto que determina su comportamiento: `electron/main.ts`, `src/App.tsx`, `src/components/AppShell.tsx`, `src/pages/configuracion/General.tsx`, `electron/ipc/index.ts`, `package.json → build`, `.github/workflows/build-windows.yml`, y el código fuente real de `electron-updater` 6.8.9 (`node_modules/electron-updater/out/*`, `builder-util-runtime`) y las plantillas NSIS de `app-builder-lib` (electron-builder ^26.15.3). **Fuera de alcance:** licencias (`licencia.ts`, `matricula.ts`), la cadena de confianza del release (ya cubierta por SEG-C2 en `auditoria-seguridad-pii-releases-2026-11-03.md`), y cualquier instalación real.
**Method:** Inspección de código con `file:line`; `git diff` del working tree; `npm run typecheck` (`tsc --noEmit`, no escribe nada) sobre el working tree; dos lecturas HTTP públicas y de solo lectura al release `v0.2.0` (`latest.yml`, API de assets y `HEAD` del `.exe`) para confirmar las cabeceras de las que depende el progreso. No se ejecutó la app, no se tocó ninguna BD ni respaldo.
**PII declaration:** Sin datos personales. No se consultó ninguna base de datos. Las únicas peticiones de red fueron a metadatos públicos del release; la URL firmada de corta vida que devuelve GitHub en la redirección no se transcribe aquí. El reporte no contiene nombres, códigos de clienta ni rutas de máquinas reales.
**State as of:** working tree sobre `aca84a9` (2026-11-09 14:06 -0600) con los 5 archivos modificados sin commitear; `electron-updater` 6.8.9; release público vigente `v0.2.0` (`latest.yml`, `releaseDate 2026-11-09T20:11:28Z`).

---

## 1. Executive summary

1. **El listener de `download-progress` NO cambia cómo se descarga, verifica o instala — CORRECTO.** Con un listener presente, electron-updater solo inserta un `Transform` de paso (`ProgressCallbackTransform` / `ProgressDifferentialDownloadCallbackTransform`) *antes* del `DigestTransform` sha512 en la misma tubería (`httpExecutor.js:462-471`, `DifferentialDownloader.js:105-124`). La ruta diferencial vs. completa se decide igual que antes (`NsisUpdater.js:47-51`), la verificación de firma no cambia (`NsisUpdater.js:52-57`, sigue siendo `null` por falta de `publisherName` — SEG-C2), y `autoDownload`/`autoInstallOnAppQuit`/`quitAndInstall` no se tocan (`actualizaciones.ts:18-19, 46-48`).
2. **El progreso sí se emite en las dos rutas reales (completa y diferencial con blockmap) y el listener existe antes de que arranque la descarga — CORRECTO.** `inicializarActualizaciones` corre en `main.ts:111` y `buscarActualizaciones` en `main.ts:113`; `executeDownload` y `differentialDownloadInstaller` consultan `listenerCount` en ese momento (`AppUpdater.js:567-569, 675-677`). El proveedor GitHub fija `isUseMultipleRangeRequest: false` (`GitHubProvider.js:16`), que es justo la rama en la que el descargador diferencial crea el transform de progreso (`DifferentialDownloader.js:105`). El asset real del release responde `content-length: 119939237` y `accept-ranges: bytes`, condición necesaria para la ruta completa (`httpExecutor.js:463-466`); el `.blockmap` (124 KB) está publicado.
3. **IPC sin fugas ni superficie nueva — CORRECTO.** Los listeners de `autoUpdater` se registran una sola vez (`actualizaciones.ts:15-16`) y solo se reemplaza la referencia a la ventana; el preload crea un closure por suscripción y lo retira con la misma referencia (`preload.ts:169-178`); el banner limpia los cuatro al desmontar (`ActualizacionBanner.tsx:45-50`). Lo nuevo es solo recepción de eventos; `npm run typecheck` pasa en verde sobre el working tree.
4. **ACT-M1 — En el único camino automático (arranque), la barra casi nunca se verá.** El banner vive dentro de `AppShell` (`AppShell.tsx:127`), que solo se monta tras la licencia y el PIN (`App.tsx:78-84`); la búsqueda arranca *antes* de cargar el renderer (`main.ts:111-119`). `update-available` y los primeros `download-progress` llegan mientras la usuaria teclea el PIN y se pierden (nadie escucha; el main no guarda el último estado). Al montarse, `progreso` se descarta porque `prev?.tipo !== "descargando"` (`ActualizacionBanner.tsx:36`) y `error` también (`:43`); solo sobrevive `descargada`, que es incondicional (`:39`). Resultado: en la cabina el aviso pasará de "nada" a "lista", igual que hoy. Es la pieza que invalida el objetivo de la spec. Fix de ~20 líneas (§6).
5. **ACT-M2 — El texto "Al reiniciar, la app se cierra, se instala y vuelve a abrirse sola" promete algo que el instalador asistido no hace.** `quitAndInstall()` por defecto lanza el instalador con `["--updated", "--force-run"]` sin `/S` (`BaseUpdater.js:13-16`, `NsisUpdater.js:107-113`). Con `oneClick: false` (`package.json:56`) se usa `assistedInstaller.nsh`, donde `--force-run` solo se honra si la instalación es silenciosa (`installSection.nsh:104-110`); la app se relanza únicamente cuando la usuaria pulsa "Terminar" en la página final con la casilla "Ejecutar" marcada (`assistedInstaller.nsh:46-64`), y antes tiene que pasar la página "¿para quién instalar?" (`assistedInstaller.nsh:18-20`, `multiUserUi.nsh:31-92`, sin salto por `isUpdated`). Solo se saltan licencia y carpeta (`assistedInstaller.nsh:14, 25`).
6. **ACT-M3 — Un error en la fase de instalación sigue siendo invisible.** Si `quitAndInstall` falla (`BaseUpdater.js:50-53`, `NsisUpdater.js:131-147`) el updater emite `error` con el banner en `descargada`, y el banner lo ignora por diseño (`ActualizacionBanner.tsx:43`). La usuaria pulsa "Reiniciar e instalar" y no pasa nada, sin aviso. Con `onError` ya expuesto, el fix es una rama más.
7. **Sin bomba de tiempo.** Nada en el cambio degrada solo con el calendario. El único "detonador" es el primer release que lleve esta barra *y* el siguiente: ahí ACT-M1 se manifestará como "la barra no funciona" (§5).

## 2. How the system actually works (reference)

### 2.1 Secuencia en el proceso principal

```
main.ts:109-113   establecerVentanaPrincipal → registrarIpc → inicializarActualizaciones(win) → buscarActualizaciones()   (no se espera)
main.ts:116-119   loadURL/loadFile  ← el renderer EMPIEZA a cargar después de lanzar la búsqueda
actualizaciones.ts:13-16   guard listenersRegistrados: listeners de autoUpdater una sola vez; ventanaPrincipal se reasigna en cada llamada
actualizaciones.ts:18-19   autoDownload = true; autoInstallOnAppQuit = false   (sin cambios)
actualizaciones.ts:21-39   update-available → "actualizaciones:disponible"; download-progress → "actualizaciones:progreso"
                           update-downloaded → "actualizaciones:descargada"; error → "actualizaciones:error" (error.message)
```

Orden garantizado por electron-updater: `doCheckForUpdates` emite `update-available` (`AppUpdater.js:414, 429`) **antes** de invocar `downloadUpdate` (`:422`); cada `webContents.send` conserva orden. El último `download-progress` (100 %) sale en `_flush` (`ProgressCallbackTransform.js:37-51`), que ocurre antes del `callback` de fin de archivo (`httpExecutor.js:487-490`) → `done` → `dispatchUpdateDownloaded` (`AppUpdater.js:591-602`, `BaseUpdater.js:28-36`). Por tanto `disponible → progreso* → descargada` es el orden real; el banner no puede recibir `progreso` antes de `disponible` ni después de `descargada`.

### 2.2 Qué hace exactamente el listener de progreso en electron-updater

- Descarga completa: `executeDownload` (`AppUpdater.js:559-569`) pone `onProgress` solo si hay listener; `configurePipes` (`httpExecutor.js:457-476`) encadena `[ProgressCallbackTransform (si content-length)] → DigestTransform(sha512) → fileOut`. El transform de progreso solo cuenta bytes y los reenvía (`ProgressCallbackTransform.js:16-36`); emite como máximo cada 1000 ms (`:24-25`) y nunca el 100 % intermedio (`:24`, "will be emitted on _flush").
- Descarga diferencial: `differentialDownloadInstaller` (`AppUpdater.js:643-712`) baja los dos blockmaps (`Provider.js:22-26` deriva las URLs) y crea `GenericDifferentialDownloader`; en `doDownloadFile` (`DifferentialDownloader.js:105-120`), como el proveedor GitHub no usa multi-range (`GitHubProvider.js:16`, `Provider.js:27-29`), se crea `ProgressDifferentialDownloadCallbackTransform` con `grandTotal = Σ bytes de operaciones DOWNLOAD` (no el tamaño del instalador). El descargador llama `beginFileCopy/beginRangeDownload/endRangeDownload` (`DifferentialDownloader.js:176-204`); los tramos copiados de disco no emiten (`ProgressDifferentialDownloadCallbackTransform.js:29-33`). Si lo diferencial falla, solo se *loguea* y se cae a descarga completa (`AppUpdater.js:704-711`) — **no** emite `error`.
- `percent = transferred / total * 100` (`ProgressCallbackTransform.js:30`); `bytesPerSecond = round(transferred / segundos desde el inicio)` → es **velocidad promedio acumulada**, no instantánea (`:31`). Con `total = content-length` real (119 939 237) no hay división por cero; la primera emisión ocurre ≥ 1 s después del inicio.

### 2.3 Máquina de estados del banner (`ActualizacionBanner.tsx`)

```
null ──disponible──▶ descargando{progreso:null}  ("Preparando…", barra indeterminada)         :32-34, :107-125
descargando ──progreso──▶ descargando{progreso}  (N %, X de Y MB, quedan ~Z)                :35-37, :85-86
descargando ──error──▶ error                     ("No se pudo descargar… se volverá a intentar") :42-44, :57-64
cualquiera ──descargada──▶ descargada            ("lista" + botón)                           :38-40, :66-80
(progreso | error) en estado ≠ descargando → se ignoran                                       :36, :43
porcentaje = min(99, floor(p.porcentaje))                                                     :85
tiempoRestante: null si bytesPorSegundo ≤ 0 o total ≤ transferido; ceil a minutos; horas      :17-26
megas: MiB (1024²) etiquetado "MB"; 1 decimal bajo 10 MB, entero arriba                      :11-15
```

Es **diseño** (y correcto): el floor con tope 99 impide mostrar 100 % antes de `update-downloaded`; el `error` sin descarga en curso no muestra nada; `descargada` es incondicional. Son **bugs/omisiones**: que ningún estado sobreviva al montaje tardío del banner (ACT-M1); que `error` en estado `descargada` sea mudo (ACT-M3); sin guardas `Number.isFinite` (ACT-B2).

### 2.4 Qué pasa al pulsar "Reiniciar e instalar"

```
ipc/index.ts:476 → actualizaciones.ts:46-48 autoUpdater.quitAndInstall()
BaseUpdater.js:13-16   install(isSilent=false, isForceRunAfter=autoRunAppAfterInstall=true)   (default true: AppUpdater.js:119)
BaseUpdater.js:42-63   quitAndInstallCalled=true → doInstall({isSilent:false, isForceRunAfter:true, isAdminRightsRequired})
NsisUpdater.js:107-113 args = ["--updated", "--force-run"]   (sin "/S" porque isSilent=false)
BaseUpdater.js:129-147 spawn detached del instalador → BaseUpdater.js:18-22 app.quit()
Instalador (oneClick:false → installer.nsi:37-40 → assistedInstaller.nsh):
  allowOnlyOneInstallerInstance.nsh:105-125  espera 300 ms + 1 s a que la app salga; si no, la cierra   ("se cierra" ✔)
  multiUserUi.nsh:31-92     página "¿para quién instalar?" — NO se salta por isUpdated; preselecciona la opción existente (:141-142)
  assistedInstaller.nsh:14,25 + common.nsh:110-121   licencia y carpeta SÍ se saltan (isUpdated)
  assistedInstaller.nsh:46   página de instalación (progreso del NSIS)                         ("se instala" ✔)
  installSection.nsh:104-110 doStartApp solo si isForceRun AND Silent → aquí NO corre
  assistedInstaller.nsh:50-63 página final con casilla "Ejecutar" (StartApp con --updated) → requiere clic en "Terminar"
```

"Vuelve a abrirse sola" solo se cumple cuando la usuaria llega al final del asistente y pulsa "Terminar" con la casilla marcada. `NsisTarget.js:402-421` confirma que `RUN_AFTER_FINISH` (autoarranque en la sección) solo se define para `oneClick`; para el asistido solo existe `HIDE_RUN_AFTER_FINISH`.

### 2.5 Fuentes del evento `error` y qué ve el banner

| Origen | Cita | Estado del banner al llegar | Texto mostrado | ¿Preciso? |
|---|---|---|---|---|
| Falla la búsqueda al arrancar (sin internet, 403 API) | `AppUpdater.js:271` | `null` | nada | ✔ (spec §2.3) |
| Falla la búsqueda **manual** mientras ya hay descarga en curso | `General.tsx:216-226` → `AppUpdater.js:271` | `descargando` | "No se pudo descargar…" | ✘ la descarga sigue; se autocorrige al llegar `descargada` (ACT-B3) |
| Falla la descarga (red, `ERR_CHECKSUM_MISMATCH` `httpExecutor.js:431`, firma `NsisUpdater.js:56`) | `AppUpdater.js:449-460, 476-478` | `descargando` | "No se pudo descargar… próxima vez que abras la app" | ✔ `removeFileIfAny` limpia caché (`AppUpdater.js:609-616, 633`); al siguiente arranque se vuelve a bajar; no hay reintento en sesión |
| Falla `quitAndInstall` (sin archivo, spawn) | `BaseUpdater.js:50-53`, `NsisUpdater.js:131-147` | `descargada` | nada | ✘ (ACT-M3) |
| Falla lo diferencial | `AppUpdater.js:704-711` | — | no emite `error`; cae a completa | ✔ |

## 3. Data origin

| Data | Origin | Status |
|---|---|---|
| Eventos `update-available`, `download-progress`, `update-downloaded`, `error` | `electron-updater` 6.8.9 en `node_modules` (leído, no asumido) | ✅ emitidos en el orden descrito en §2.1 |
| `content-length` / `accept-ranges` del `.exe` | `HEAD` público al asset de `v0.2.0` tras la redirección | ✅ `119939237` / `bytes` |
| `.blockmap` publicado (ruta diferencial) | API pública de releases + `build-windows.yml:50-53` | ✅ presente (124 231 B) |
| `latest.yml` (`size: 119939237`) | `releases/latest/download/latest.yml` | ✅ coincide con el asset |
| Config NSIS (`oneClick:false`, `allowToChangeInstallationDirectory`, sin `perMachine`) | `package.json:55-60` | ✅ leída; determina §2.4 |
| Estado del banner en el renderer | Solo memoria de React; el main no conserva el último evento | 🔴 se pierde todo lo emitido antes del montaje (ACT-M1) |
| Mensaje de error reenviado al renderer | `error.message` crudo (`actualizaciones.ts:38`) | ⚠️ puede traer rutas locales/URLs; el banner no lo pinta (ACT-B4) |

## 4. Case by case

No hay sujetos (sin PII). La tabla recorre los escenarios reales de eventos, con la lectura del código.

| # | Escenario | Estado que alcanza el banner | Esperado | Reading |
|---|---|---|---|---|
| S1 | Arranque; API GitHub responde en 0.5–3 s; usuaria teclea PIN en > 3 s (caso típico) | `null` hasta `descargada` | `descargando` con barra | 🔴 ACT-M1: `disponible` y `progreso` emitidos sin suscriptor; `AppShell` aún no montado (`App.tsx:82-84`) |
| S2 | Arranque; PIN tecleado antes de que responda la API (raro) | `descargando` → barra → `descargada` | igual | ✅ |
| S3 | "Buscar actualizaciones" en Configuración con la app abierta | `descargando` → barra → `descargada` | igual | ✅ único camino en que la barra se ve con certeza hoy |
| S4 | Corte de internet a mitad de descarga (S3 en curso) | `error` | `error` | ✅ y el texto es exacto (se vuelve a intentar al abrir) |
| S5 | Corte de internet a mitad de descarga iniciada en S1 | `null` (sigue sin verse nada) | `error` | 🔴 ACT-M1: el `error` llega con `prev = null` y se descarta |
| S6 | Ruta diferencial (blockmap viejo en caché) | barra con `total` = bytes a bajar, p. ej. "4 de 18 MB" | — | ⚪ correcto pero distinto de "115 MB"; documentar (ACT-B5) |
| S7 | Usuaria pulsa "Reiniciar e instalar" y el instalador no arranca | `descargada` (mudo) | aviso | 🟡 ACT-M3 |
| S8 | Usuaria pulsa "Reiniciar e instalar" y todo va bien | app se cierra → asistente NSIS (2 páginas + Terminar) → app abre | "vuelve a abrirse sola" | 🟡 ACT-M2: requiere 2–3 clics |
| S9 | Búsqueda manual repetida con descarga ya en curso, la búsqueda **falla** | `error` mientras la descarga sigue | `descargando` | ⚪ ACT-B3; se autocorrige en `descargada` |
| S10 | Búsqueda manual repetida con descarga ya en curso, la búsqueda **tiene éxito** | vuelve a `descargando{progreso:null}` ("Preparando…" ≤ 1 s) | `descargando{progreso}` | ⚪ ACT-B3, parpadeo; `downloadUpdate` reutiliza la promesa en vuelo (`AppUpdater.js:442-445`) |
| S11 | Ventana destruida con descarga en curso (Windows: cerrar = salir) | `webContents.send` lanza "Object has been destroyed" dentro de `_transform` | silencio | ⚪ ACT-B1; ventana de exposición de ms al salir, pero el listener dispara cada segundo |
| S12 | `percent` no finito | "NaN %" y `width: NaN%` | barra indeterminada | ⚪ ACT-B2; no alcanzable con 6.8.9 y `content-length` > 0, pero sin guarda |

Hallazgos sueltos:

**ACT-M1 (Medium) — Eventos perdidos antes de que el banner exista.** Evidencia: `main.ts:111-119` lanza la búsqueda antes de `loadFile`; `App.tsx:78-84` no monta `AppShell` hasta licencia + PIN; `AppShell.tsx:127` es el único punto de montaje del banner; `actualizaciones.ts:21-39` hace `send` sin guardar estado; electron-updater no ofrece consulta de "estado actual". `ActualizacionBanner.tsx:36, 43` descartan `progreso`/`error` si no hubo `disponible`. Es un **bug de integración** (no de electron-updater) que ya afectaba al banner viejo ("Descargando…" casi nunca se veía), pero ahora deja sin efecto la feature completa. Likelihood: alta en cada arranque con actualización disponible; ease of fix: alta.

**ACT-M2 (Medium) — Texto de "lista" inexacto.** `ActualizacionBanner.tsx:72-73` vs. §2.4. Es **diseño del instalador** (`oneClick:false` elegido por el dueño), no un bug del cambio; lo inexacto es la frase. Para una usuaria no técnica, "vuelve a abrirse sola" + un asistente que espera clics = "la app desapareció". Alternativas en §6 (Decision A).

**ACT-M3 (Medium) — Error en fase de instalación mudo.** `ActualizacionBanner.tsx:42-44` solo transiciona desde `descargando`. Pre-existente (SEG-B3 lo señalaba como "canal sin exponer"); este cambio expone el canal y deja la rama sin usar. Recuperable: al reabrir, `validateDownloadedPath` (`AppUpdater.js:604-608`) reutiliza el archivo y el botón reaparece.

**ACT-B1 (Low) — Sin guarda `isDestroyed()` en un listener que dispara cada segundo.** `actualizaciones.ts:26-33` (y los tres listeners viejos) acceden a `ventanaPrincipal?.webContents`; en una `BrowserWindow` destruida eso lanza. La excepción nace **dentro** de `onProgress` → `_transform` (`ProgressCallbackTransform.js:26`) → sale por el `pipe` → `uncaughtException` → `dialog.showErrorBox` (`main.ts:15-18`), potencialmente durante el `app.quit()` de Windows (`main.ts:165-169`). En macOS la ventana nunca se destruye (`main.ts:85-91`). Probabilidad baja (≈ 1 tick/s contra una ventana de pocos ms); fix trivial.

**ACT-B2 (Low) — Sin guarda de finitud.** `ActualizacionBanner.tsx:85` (`Math.min(99, Math.floor(NaN))` = `NaN`) y `:17-26` (`NaN <= 0` es `false` → "NaN h"). No reproducible con 6.8.9 hoy (`_flush` fija `percent: 100`, `_transform` solo emite en modo DOWNLOAD con `grandTotal > 0`), pero el contrato `ProgresoActualizacion` no lo garantiza.

**ACT-B3 (Low) — Búsqueda manual durante una descarga confunde al banner** (S9/S10). `General.tsx:216-226` permite relanzar `checkForUpdates` con descarga en vuelo; `AppUpdater.js:253-275` no lo impide y emite `error` o un segundo `update-available` (`:429`). Dato útil: el segundo argumento del evento `error` lleva el prefijo literal `"Cannot check for updates: "` solo en los fallos de búsqueda (`AppUpdater.js:271`) y `(e.stack || e).toString()` en los demás (`:477`); el listener actual lo ignora (`actualizaciones.ts:37`).

**ACT-B4 (Low) — Payload de error crudo y sin código.** `actualizaciones.ts:38` reenvía `error.message`, que en fallos de archivo incluye la ruta de caché (`%LOCALAPPDATA%\…\pending\…`, con el nombre de usuario de Windows) o URLs. El banner **no** lo renderiza (correcto), pero `onError(callback: (mensaje: string) => void)` (`ipc-contract.ts:252`) invita a hacerlo en el futuro. Además se pierde `error.code` (`ERR_CHECKSUM_MISMATCH`, `ERR_UPDATER_INVALID_SIGNATURE`), que es lo que SEG-B3 quería ver cuando se cierre SEG-C2: hoy un rechazo de integridad se mostraría como un corte de red.

**ACT-B5 (Info) — Semántica del total en ruta diferencial y unidades.** En diferencial `total` es `grandTotal` de tramos a descargar (`DifferentialDownloader.js:106-117`), no 115 MB; el texto "X de Y MB" seguirá siendo verdadero pero sorprenderá al verificar. `megas()` usa MiB etiquetado "MB" (convención Windows). Sin acción de código; anotar en la spec §6.

**ACT-B6 (Low, pre-existente, diseño de electron-updater) — Rechazo no manejado de `downloadPromise`.** `AppUpdater.js:422` devuelve la promesa dentro del resultado y `:468-470` relanza el error; nadie en `main.ts`/`actualizaciones.ts` la encadena (`buscarActualizaciones` solo espera `checkForUpdates`, `actualizaciones.ts:42-44`). `main.ts` registra `uncaughtException` (`:15-18`) pero no `unhandledRejection`. No lo introduce este cambio; queda como verificación pendiente (§6) porque el comportamiento por defecto de Electron 43 ante rechazos no manejados en el main no es verificable desde `node_modules`.

## 5. Active risks — with detonation dates

### 5.1 La barra "no funciona" en su primera observación real
Mecanismo: la spec §5 ya advierte que la barra solo se ve a partir de la actualización *siguiente* a la que la incluye. En esa actualización el camino será S1 (arranque + PIN), donde ACT-M1 hace que no se vea nada hasta "lista". El dueño concluirá que la feature falló y gastará un ciclo de release en diagnosticarlo. Permanente mientras el main no conserve el último estado.

### 5.2 Scheduled degradations
| # | What is lost | Date |
|---|---|---|
| 1 | Progreso visible en el camino automático (ACT-M1) | Primer release posterior al que incluya la barra (p. ej. el update `v0.2.1 → v0.2.2`); no hay fecha calendario |
| — | Nada más degrada solo con el tiempo | — |

### 5.3 Root cause
El estado del updater vive únicamente como eventos efímeros `main → renderer`; el renderer que los necesita se monta tarde (licencia + PIN) y el main no conserva ni reexpone el último estado. Todo lo demás (M2, M3) son textos y ramas, no estructura.

## 6. Proposed corrective plan

- **Step 0 — NOW:** No hay nada que congelar: el cambio no muta datos ni altera la instalación. Sí conviene **no** cortar release con esta rama hasta cerrar ACT-M1, porque el ciclo de verificación de la barra cuesta un release entero (§5.1).
- **Decision A — ¿Qué prometer en el texto de "lista"? (ACT-M2):** (i) **Ajustar el texto** a lo que el asistente hace: p. ej. "Al reiniciar se cierra la app y se abre el instalador: pulsa *Siguiente* y luego *Terminar* para que la app vuelva a abrirse." Costo cero, sin tocar el flujo de instalación. (ii) **Hacer verdad la frase** con `autoUpdater.quitAndInstall(true, true)` (`/S --force-run` → `installSection.nsh:106-109` relanza sola). Cambia la ruta de instalación en una superficie crítica (instalación silenciosa; una instalación por máquina exige elevación — `installer.nsi:96-121`), contradice la spec §3 y requiere su propia auditoría + prueba en Windows. Recomendación: (i) ahora; (ii) solo si el dueño quiere además quitar el asistente de todas las actualizaciones.
- **Decision B — ¿Se acepta un `invoke` adicional de solo lectura?** La spec §2 acotó el alcance a "un evento IPC". Cerrar ACT-M1 bien requiere además `actualizaciones:estado` (consulta). Sigue sin disparar Gate 001 (sin módulo, dependencia ni frontera nueva; reversible). Alternativa sin `invoke`: reenviar el último estado desde el main en `did-finish-load`, pero eso no cubre el montaje tras el PIN, así que no resuelve S1.
- **Proposed change (ACT-M1):** (1) En `actualizaciones.ts`, un `let ultimoEstado: EstadoActualizacion | null` que cada listener actualiza antes del `send` (`disponible` → `{tipo:"descargando", version, progreso:null}`; `progreso` → mezcla; `descargada` → `{tipo:"descargada", version}`; `error` → `{tipo:"error", version}` solo si estaba `descargando`). (2) `ipcMain.handle("actualizaciones:estado", () => ultimoEstado)` en `ipc/index.ts` junto a `:475-476`, y `obtenerEstado(): Promise<EstadoActualizacion | null>` en contrato + preload. (3) En el banner, al montar: `obtenerEstado().then(setEstado)` **antes** de suscribirse (o suscribirse y luego consultar, descartando la consulta si ya llegó un evento). Con esto S1 y S5 pasan a comportarse como S3/S4, y una recarga del renderer también recupera el estado. El tipo `EstadoActualizacion` puede ser exactamente el `Estado` que ya existe en `ActualizacionBanner.tsx:6-9`, movido a `shared/types.ts`.
- **Proposed change (ACT-M3):** en `onError`, si `prev?.tipo === "descargada"` → `{tipo:"errorInstalacion", version}` con texto "No se pudo iniciar la instalación. Cierra la app y vuelve a abrirla para intentarlo de nuevo." (al reabrir, el archivo cacheado se revalida y el botón reaparece: `AppUpdater.js:604-608`).
- **Proposed change (ACT-B1):** en los cuatro listeners, `if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;` y en `inicializarActualizaciones` un `mainWindow.on("closed", () => { if (ventanaPrincipal === mainWindow) ventanaPrincipal = null; })`.
- **Proposed change (ACT-B2):** `const porcentaje = p && Number.isFinite(p.porcentaje) ? Math.min(99, Math.max(0, Math.floor(p.porcentaje))) : null;` y tratar `null` como "Preparando…"; en `tiempoRestante`, `if (!Number.isFinite(segundos)) return null;`.
- **Proposed change (ACT-B3/B4, juntos):** el listener de `error` recibe `(error, mensaje)`; reenviar `{ codigo: error.code ?? null, fase: mensaje?.startsWith("Cannot check for updates") ? "busqueda" : ultimoEstado?.tipo === "descargada" ? "instalacion" : "descarga" }` en vez de `error.message`. El banner ignora `fase === "busqueda"` (cierra S9/S10) y puede distinguir `ERR_CHECKSUM_MISMATCH`/`ERR_UPDATER_INVALID_SIGNATURE` cuando SEG-C2 se cierre. Esto cierra SEG-B3 completo.
- **ACT-B5:** una línea en la spec §6: "en ruta diferencial el total mostrado es lo que falta por bajar, no 115 MB".
- **ACT-B6:** fuera de este cambio; si la verificación pendiente muestra que Electron 43 trata el rechazo como fatal, añadir `process.on("unhandledRejection", …)` junto a `main.ts:15-18` en su propio PR.

**Pending manual verification** (solo lectura, con resultado esperado):

```text
-- 1. ACT-M1: reproducir en Windows con un release de prueba (o en dev con forceDevUpdateConfig):
--    abrir la app, esperar en la pantalla de PIN ≥ 5 s, desbloquear.
-- Expected (sin fix): sin banner hasta "Actualización X lista." — nunca "Descargando".
-- Expected (con fix): banner "Descargando" con barra al desbloquear.

-- 2. ACT-M2: en Windows, pulsar "Reiniciar e instalar".
-- Expected: la app se cierra; aparece el asistente con la página "¿para quién instalar?"
--   (opción actual preseleccionada), luego progreso, luego página final con casilla
--   "Ejecutar Bellora Dashboard"; la app NO se relanza hasta pulsar "Terminar".

-- 3. Cabeceras del asset (ya verificado 2026-11-09, repetir tras cada release):
curl -sIL "https://github.com/CarloEsqui/cabinacosmei/releases/latest/download/latest.yml" | grep -i "^HTTP"
-- Expected: 302 … 200. Y para el .exe (nombre con puntos, como lo publica GitHub):
-- Expected: content-length igual al "size" de latest.yml y accept-ranges: bytes.

-- 4. ACT-B6: comportamiento de Electron 43 ante unhandledRejection en el main.
--    Con la app en dev: en la consola del main, `Promise.reject(new Error("x"))`.
-- Expected a confirmar: solo warning en consola (no cierra la app). Si cierra, aplicar el handler propuesto.

-- 5. Verificación de contrato: npm run typecheck && npm run build
-- Expected: verde (typecheck ya verificado en verde en esta auditoría; build no se corrió aquí).
```

## 7. What follows

1. **Carlos decide** Decision A (texto vs. instalación silenciosa) y Decision B (aceptar `actualizaciones:estado`). Recomendado: texto (i) + aceptar el `invoke`.
2. **Ingeniería prepara**, en la misma rama `atlas/progreso-actualizacion`: ACT-M1 (estado en main + consulta al montar), ACT-M3 (rama `descargada → errorInstalacion`), ACT-B1 (guarda `isDestroyed`), ACT-B2 (finitud), ACT-B3/B4 (payload `{codigo, fase}`), y el texto de ACT-M2. Todo cabe en un PR pequeño; ninguno dispara Gate 001.
3. **Verificación** `npm run typecheck && npm run build` + vista previa de los estados con eventos simulados (spec §6), ahora incluyendo "estado inicial recuperado al montar" y "errorInstalacion".
4. **Carlos corta release** y, en el *siguiente* release, ejecuta las verificaciones manuales 1 y 2 en la máquina de la cabina (o en una VM Windows) y deja la evidencia en `.notes/evidencia-progreso-actualizacion-<fecha>.md` cerrando ACT-M1…M3 por código.
5. Actualizar `plan-accion-2026-11-03.md`: SEG-B3 queda cubierto por ACT-B4 cuando se aplique el payload con `codigo`.
