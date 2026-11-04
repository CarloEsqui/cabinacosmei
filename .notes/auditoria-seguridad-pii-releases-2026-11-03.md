# Audit — seguridad-pii-releases (Electron/IPC, licencias y pipeline de releases, PII y contrato) — 2026-11-03 (SEG-*)

**Scope:** Código en el working tree de `main` @ `4cbeaae` más los archivos sin commitear del arranque Atlas (PROJECT.md, CODEOWNERS, .github/, githooks/). Tres partes: (1) frontera de seguridad Electron — `electron/main.ts`, `electron/preload.ts`, `electron/ipc/index.ts`, `index.html`, `electron/services/{archivos,folders,exportarCsv,respaldos,reinicio,auth,config}.ts`; (2) licencias y releases — `electron/services/{licencia,matricula,actualizaciones}.ts`, `scripts/{generar-llaves,firmar-licencia,listar-licencias}.mjs`, `keys/`, `.github/workflows/build-windows.yml`, `package.json → build/publish`, `electron-updater` 6.8.9 en `node_modules`; (3) PII y marco legal — `electron/db/schema.ts`, `drizzle/0000_lively_nuke.sql`, `scripts/seed-demo.mjs`, historial completo de git (`--all`, 15 commits, 5 tags, objetos colgantes), y la auditoría `contrato` (PROJECT.md vs. repo). **Fuera de alcance:** lógica de dinero, migraciones e inventario (otras auditorías en paralelo), y la máquina real de la cabina (no se tocó ninguna instalación ni respaldo real).
**Method:** Inspección de código con cita `archivo:línea`; `git log --all`, `git fsck --lost-found`, `gitleaks git --redact` sobre todo el historial (local, solo lectura); `bash githooks/validate-notes --all`; `npm run typecheck` (sin emitir); consultas de solo lectura a la API de GitHub con `gh` (protección de rama, rulesets, releases, colaboradores). Ninguna escritura fuera de este archivo. No se abrió ninguna base de datos.
**PII declaration:** No se tocó ninguna BD ni respaldo real. Los barridos del historial se reportan solo como conteos y rutas; ningún valor se transcribe. El token encontrado en un blob colgante (SEG-C1) se describe por formato, nunca por valor. El nombre de pila de la operadora que aparece en el repo público (SEG-M1) no se repite aquí.
**State as of:** 2026-11-03T18:33Z — `main` = `4cbeaae`, último release publicado `v0.1.4` (2026-07-27), `package.json` 0.1.4, Electron 43.1.0, electron-updater 6.8.9, gitleaks 8.x local.

---

## 1. Executive summary

1. **La frontera Electron está bien configurada y las entradas se validan — CORRECTO.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`electron/main.ts:60-65`); CSP sin `unsafe-inline` para scripts (`index.html:6-9`); todo canal que muta datos pasa por un esquema zod (`electron/ipc/index.ts:124-384`); ningún canal acepta SQL ni comandos; las rutas de archivos las elige el proceso main vía diálogo, nunca el renderer (`ipc/index.ts:263-277, 321-327, 386-392`); `rutaDentroDe` resuelve symlinks antes de `shell.openPath` y antes de escribir comprobantes (`electron/services/folders.ts:112-140, 149-156`; `archivos.ts:35`). No hay `innerHTML`/`dangerouslySetInnerHTML`/`eval` en el renderer (grep vacío).
2. **Las llaves y el registro de licencias NUNCA entraron a git — CORRECTO.** En todo el historial (`git log --all --name-only`) el único archivo bajo `keys/` es `keys/licencia-publica.pem` (commit `9f57d71`, por diseño). `gitleaks` sobre los 15 commits: 0 hallazgos. Sin correos en el historial; las únicas líneas con forma de teléfono son 5 de datos demo en `scripts/seed-demo.mjs` (sufijos secuenciales, claramente ficticios) y 1 timestamp en `drizzle/meta/0000_snapshot.json`.
3. **Las operaciones destructivas re-verifican el PIN y respaldan antes — CORRECTO.** `respaldos.ts:219-220, 239-240` y `reinicio.ts:49-52, 85-88`; PIN con scrypt + salt de 16 bytes + `timingSafeEqual` (`auth.ts:8-55`). Licencia: firma Ed25519 verificada contra llave pública embebida, atada a la matrícula de hardware, con detección de retroceso de reloj (`licencia.ts:65-113`).
4. **El enforcement local está armado y falla cerrado — CORRECTO.** `core.hooksPath = githooks`; `pre-commit` bloquea sin gitleaks (`githooks/pre-commit:17-23`); `validate-notes --all` corre limpio; CI (`ci.yml`) escanea el historial completo y el job `notes-pii` falla si falta PROJECT.md. `npm run typecheck` pasa (ejecutado en esta auditoría).
5. **SEG-C1 — Un token con formato de GitHub PAT (`ghp_…`) vive en un blob colgante del `.git` local.** No es alcanzable desde ningún ref, no está en el working tree y los objetos colgantes no se envían con `push`, así que **no es público**; pero existe en disco y, si sigue vigente, es la llave que publica releases que todas las instalaciones descargan. Revocar hoy.
6. **SEG-C2 — La cadena de confianza del auto-update es la cuenta de GitHub, nada más.** El instalador Windows no está firmado (sin `certificateFile`/`publisherName` en `package.json:51-54`, sin paso de firma en `build-windows.yml`), y por eso `electron-updater` **omite** la verificación Authenticode (`node_modules/electron-updater/out/NsisUpdater.js:84-91`). Quien pueda crear un release en `CarloEsqui/cabinacosmei` obtiene ejecución de código en la máquina de la cabina, con todo el expediente de clientas dentro.
7. **SEG-C3 — No existe captura de consentimiento ni aviso de privacidad en ninguna parte del código**, mientras `clientes.notas/observaciones` admiten texto libre con datos de salud (`schema.ts:224-225`; `shared/schemas.ts:101-102`). La LFPDPPP 2025 exige consentimiento expreso y por escrito para datos sensibles: la exposición legal ya existe hoy y crece con cada clienta nueva.
8. **SEG-A1 — El PIN y la licencia son un candado de interfaz, no de datos.** Los 90+ handlers IPC se registran sin estado de sesión (`ipc/index.ts:80-394`), `desbloqueado` es estado de React (`src/App.tsx:46, 86-88`), no hay throttling en `auth:verificarPin` y el menú por defecto de Electron conserva "Toggle Developer Tools" en el empaquetado (no hay `Menu`/`devTools:false`, grep vacío). Desde la pantalla de PIN, con Ctrl+Shift+I, `window.api.respaldos.exportar(id)` copia el respaldo completo sin cifrar a cualquier ruta sin PIN (`ipc/index.ts:331-341`). <!-- atlas-allow: "Toggle Developer Tools" es un elemento del menú de Electron, no una persona -->
9. **Bomba de tiempo (§5):** cada respaldo automático diario (`respaldos.ts:259-269`) y cada export de CSV/respaldo produce otra copia **sin cifrar** del expediente completo; combinado con SEG-C3, cada día sin aviso de privacidad acumula datos sensibles tratados sin base legal.

**Veredicto:** FAIL para integrar cambios en las superficies "Licencias/releases" y "PII" sin atender Wave 1; la frontera Electron en sí es sólida y no requiere rediseño.

## 2. How the system actually works (reference)

### 2.1 Frontera renderer ↔ main
```
renderer (sandbox, sin Node)  --window.api.*-->  preload (contextBridge, electron/preload.ts:4-156)
   --ipcRenderer.invoke(canal, args)-->  ipcMain.handle(canal) (electron/ipc/index.ts:84-394)
   --(zod .parse en mutaciones)-->  services/*.ts  --> better-sqlite3 (cabina.sqlite3 en userData, db/index.ts:36)
```
- No hay sesión en main: `registrarIpc()` se llama una vez al crear la ventana (`main.ts:110`) y cada handler ejecuta sin preguntar si la UI está desbloqueada ni si la licencia está activa. **Diseño** (comentario en `folders.ts:143-147` ya trata al renderer como "potencialmente comprometido", pero solo para rutas).
- Navegación: `setWindowOpenHandler` niega ventanas nuevas y manda **cualquier** URL a `shell.openExternal` (`main.ts:96-99`); `will-navigate` permite `file://*` y el dev server, y desvía el resto a `openExternal` (`main.ts:100-107`).
- CSP: `default-src 'self'` cubre `script-src`/`connect-src`; `img-src` admite `data:` y `file:` (`index.html:8`).

### 2.2 PIN
`crearPin` exige `^\d{4,8}$` y rechaza si ya existe (`auth.ts:27-35`); hash = scrypt(pin, salt16, 64) guardado como `salt:hash` en `configuracion['auth.pinHash']` (`auth.ts:36-43`). `verificarPin` compara con `timingSafeEqual` (`auth.ts:46-55`). No hay contador de intentos ni retardo. El espacio de un PIN de 4 dígitos es 10 000; scrypt con parámetros por defecto tarda decenas de ms, así que una fuerza bruta local por consola termina en minutos.

### 2.3 Archivos y rutas
- Raíz de confianza = `config.carpetaRaiz` (`shared/config.ts:16`, `z.string()` sin restricción). Se fija por diálogo (`ipc/index.ts:106-115`) **o** por `config:actualizar` con cualquier cadena (`ipc/index.ts:95-99`), y `asegurarEstructuraRaiz` crea carpetas ahí y **mueve** `Clientes|Inventario|Comprobantes|Servicios` dentro de `Datos/` si existen sueltas (`folders.ts:47-57`).
- `abrirCarpeta` y `guardarArchivoDesdeRuta` validan contra esa raíz con `rutaDentroDe` (`folders.ts:130-140`). Correcto **mientras la raíz sea confiable**; si la raíz es `/` o `C:\`, todo pasa.
- Restauración (`respaldos.ts:155-215`): valida que exista `manifest.json` y `cabina.sqlite3`, sobrescribe la BD, borra `Datos/` y escribe cada entrada `archivos/<rel>` en `path.join(carpetaDatos, rel)` (`respaldos.ts:197-204`) **sin normalizar `rel`** → Zip Slip (SEG-M2). **Bug**, no diseño.

### 2.4 Licencia
```
token = base64url(payloadJson) + "." + base64url(Ed25519.sign(payloadJson, privada))   (scripts/firmar-licencia.mjs:42-47)
estado = verify(pública embebida) ∧ installId == matricula(hardware) ∧ hoy ≥ ultimaFechaVista
       → activa | por_vencer | vencida (gracia 3 d) | invalida | no_activada             (licencia.ts:82-113)
```
- `licencia.json` (userData) guarda el token y `ultimaFechaVista` **en texto plano editable** (`licencia.ts:51-54, 120-123`).
- `matricula`: sha256 de MachineGuid / IOPlatformUUID / primera MAC; si todo falla, la constante `"sin-identificador-disponible"` (`matricula.ts:27-49`) → matrícula idéntica en cualquier equipo degradado.
- La UI deja entrar solo con `activa|por_vencer` (`App.tsx:26, 82-84`); main no lo exige.

### 2.5 Releases y auto-update
```
tag v* (push de cualquier colaborador) → build-windows.yml (permissions: contents: write, :9-10)
  → npm ci (corre postinstall + scripts de dependencias, :23) → electron-builder --win --publish never (:32)
  → softprops/action-gh-release@v2 publica .exe + .blockmap + latest.yml con GITHUB_TOKEN (:46-56)
app (empaquetada) → autoUpdater.checkForUpdates() al arrancar (main.ts:112-114; autoDownload=true, actualizaciones.ts:18)
  → compara latest.yml (sha512) → descarga → verifySignature(): publisherName == null → se omite (NsisUpdater.js:84-91)
  → renderer muestra "instalar y reiniciar" → quitAndInstall (actualizaciones.ts:36-38)
```
- Estado en GitHub (lectura con `gh`, 2026-11-03): rama `main` **sin protección** (404), **sin rulesets** (`[]`), **sin protección de tags** (404), 1 colaborador, repo público con forks permitidos. Commits y tags **sin firma** (`%G?` = `N` en los 15). Tags son ligeros (apuntan a commits, no objetos tag).
- Residuo del enfoque RETIRED `--publish always`: siguen existiendo **dos releases con el tag `v0.1.3`** en GitHub. El release `v0.1.4` solo tiene `.exe` + `latest.yml` (sin `.blockmap`), lo que indica que el `build-windows.yml` actual (commit `4cbeaae`, posterior al tag) **nunca ha corrido de punta a punta** con un tag real.

### 2.6 PII: dónde vive
| Dato | Dónde | Cifrado |
|---|---|---|
| Expediente (nombre, tel, correo, nacimiento, dirección, contacto de emergencia, notas/observaciones) | `clientes` en `cabina.sqlite3` (`schema.ts:213-233`, `drizzle/0000_lively_nuke.sql:63-79`) | No |
| Nombre completo duplicado | nombre de carpeta `CL-xxxx_<nombre>` (`folders.ts:73`), `bitacora.detalle` (`clientes.ts:122, 150`) | No |
| Archivos por clienta (comprobante hoy; `foto|documento|factura` admitidos en `archivos.categoria`, `schema.ts:342`) | `<carpetaRaiz>/Datos/Clientes/…` | No |
| Respaldos .zip (BD + `Datos/`) | `<carpetaRaiz>/Respaldos/`, 3 automáticos + manuales ilimitados (`respaldos.ts:22, 118-135`); exportables a cualquier ruta (`ipc/index.ts:331-341`) | No |
| CSV "clientas" (nombre + métricas) | ruta elegida por la usuaria (`exportarCsv.ts:102-112, 158-167`) | No |
| Registro de licencias (nombre del negocio, matrícula, montos) | `keys/clientes-licencias.json` local, ignorado (`.gitignore:19-20`) | No, pero fuera de git |

## 3. Data origin

| Data | Origin | Status |
|---|---|---|
| `clientes.*` incl. notas de salud | captura manual en UI (`clienteInputSchema`) | 🔴 sin consentimiento/aviso (SEG-C3) |
| `archivos` + carpetas en disco | diálogo de archivo → copia a `Datos/` | ⚠️ sin cifrar; nombre en ruta (SEG-A2, SEG-M5) |
| Respaldos .zip | automático diario/6 h + manual + previo a borrar/restaurar | ⚠️ sin cifrar, exportable sin PIN (SEG-A1, SEG-A2) |
| `licencia.json` | `licencia:instalarToken` | ⚠️ anti-rollback editable (SEG-M4) |
| `keys/licencia-privada.pem`, `keys/clientes-licencias.json` | `scripts/generar-llaves.mjs`, `scripts/firmar-licencia.mjs` | ✅ nunca en historial (verificado `git log --all`) |
| `keys/licencia-publica.pem` | commit `9f57d71`; además embebida en `licencia.ts:12-15` | ✅ por diseño |
| Release `.exe` + `latest.yml` | CI en tag, `GITHUB_TOKEN` | 🔴 sin firma de código (SEG-C2) |
| Blob colgante con token `ghp_…` | `.git/objects` local, no alcanzable, no empujado | 🔴 revocar (SEG-C1) |
| `scripts/seed-demo.mjs` | datos demo | ⚠️ 5 clientas ficticias OK; comentario con nombre real de la operadora + UUID real (SEG-M1) |

## 4. Case by case

Los "sujetos" de esta auditoría son canales IPC y superficies, no personas. Reachability = qué puede invocar el renderer **antes** de desbloquear PIN/licencia.

| # | Canal / superficie | Validación de entrada | PIN exigido en main | Lectura |
|---|---|---|---|---|
| 1 | `clientes:listar/obtenerExpediente` (`ipc:194, 201`) | id sin esquema (solo `eq`) | No | 🔴 expediente completo sin PIN (SEG-A1) |
| 2 | `respaldos:exportar` (`ipc:331-341`) | id de respaldo | No | 🔴 copia BD+archivos a cualquier ruta sin PIN |
| 3 | `reportes:exportarCsv` (`ipc:378-394`) | zod | No | 🟠 nombres a CSV sin PIN |
| 4 | `respaldos:restaurar / restaurarDesdeArchivo` (`ipc:316-330`) | PIN re-verificado | Sí | ✅ pero Zip Slip (SEG-M2) |
| 5 | `datos:borrarNegocio / restablecerFabrica` (`ipc:344-349`) | PIN re-verificado | Sí | ✅ |
| 6 | `config:actualizar` (`ipc:95-104`) | zod (`carpetaRaiz: z.string()`) | No | 🟠 raíz de confianza escribible (SEG-M3) |
| 7 | `carpetas:abrirCarpeta` (`ipc:117`) | `rutaDentroDe` | No | ✅ (depende de #6) |
| 8 | `archivos:subirComprobante` (`ipc:260-278`) | `carpetaDestino` validada; `entidadTipo/Id` libres | No | ✅ ruta; ⚪ tipo/id sin esquema |
| 9 | `auth:verificarPin` (`ipc:86`) | regex solo en crear | — | 🟠 sin throttling (SEG-A1) |
| 10 | `licencia:instalarToken` (`ipc:89`) | firma Ed25519 + matrícula | — | ✅ |
| 11 | `actualizaciones:instalarYReiniciar` (`ipc:294`) | — | No | ⚪ solo instala lo ya descargado |
| 12 | `setWindowOpenHandler` / `will-navigate` (`main.ts:96-107`) | sin allowlist de protocolo | — | ⚪ (SEG-B1) |

### Hallazgos

**SEG-C1 (Critical) — Token con formato GitHub PAT en un blob colgante del `.git` local.** `git fsck --lost-found` reporta 1 blob colgante y 1 commit colgante (`4614fa4`, "Update package.json", 2026-07-10, inocuo). El blob contiene una línea `token = "ghp_<redactado>"`. Verificado: 0 commits alcanzables con `ghp_` (`git log --all -S`), 0 archivos del working tree (excluyendo `node_modules`). No viajó a GitHub (los objetos colgantes no se empujan), pero cualquier copia del repo local (Time Machine, `.zip` del proyecto) lo contiene y, si está vigente, un PAT con `repo` publica releases (→ SEG-C2). **Fix now:** revocar el token en GitHub → Settings → Developer settings; después `git reflog expire --expire=now --all && git gc --prune=now` (lo corre Carlos; no se hizo aquí porque muta el repo).

**SEG-C2 (Critical) — Auto-update sin firma de código: la cuenta de GitHub es el único ancla.** Evidencia: `package.json:51-54` (`win.target: nsis`, sin `certificateFile`/`publisherName`), `build-windows.yml` sin `CSC_LINK`/signtool, `NsisUpdater.js:84-91` (sin `publisherName` → `verifySignature` devuelve `null` y la instalación continúa), sha512 en `latest.yml` solo prueba integridad frente al mismo origen. Vectores que terminan en un release malicioso: compromiso de la cuenta `CarloEsqui` (sin evidencia de 2FA/llave de hardware — no verificable desde aquí), un PAT filtrado (SEG-C1), `softprops/action-gh-release@v2` y `actions/*@v4` en tags flotantes (`build-windows.yml:16, 18, 38, 48`), o un `postinstall` malicioso de cualquier dependencia durante `npm ci` (`:23`) bajo un job con `contents: write` (`:9-10`). Consecuencia: ejecución de código en la máquina de la cabina con la usuaria dándole clic a "instalar". **Esto es diseño (sin certificado) + configuración (permisos/pins), no bug.**

**SEG-C3 (Critical, legal) — Datos sensibles sin consentimiento ni aviso de privacidad.** `git grep -i "consentimiento|aviso de privacidad|privacidad|LFPDPPP|ARCO"` en `electron src shared drizzle docs scripts` → 0 resultados. El esquema no tiene columna de consentimiento ni fecha de aviso (`drizzle/0000_lively_nuke.sql:63-79`). `clientes.notas/observaciones` son texto libre donde PROJECT.md reconoce que caben datos de salud. La LFPDPPP (DOF 20-mar-2025, art. sobre datos sensibles) exige consentimiento expreso y por escrito; la sanción es monetaria y la exposición existe hoy, por cada clienta. No es asesoría legal; es la lectura literal del marco que PROJECT.md ya adoptó.

**SEG-A1 (High) — Candado de PIN/licencia solo en el renderer; DevTools abiertos; sin throttling.** `registrarIpc()` incondicional (`main.ts:110`; `ipc/index.ts:80-82`), `desbloqueado` y `ESTADOS_QUE_DEJAN_ENTRAR` son estado de React (`App.tsx:26, 46, 82-88`), ningún `Menu.setApplicationMenu`/`devTools: false` (grep vacío), ningún contador de intentos en `auth.ts:46-55`. Prueba reproducible (pendiente, §6): abrir la app empaquetada, en la pantalla de PIN pulsar Ctrl+Shift+I y ejecutar `await window.api.clientes.listar()`. Hoy devuelve filas. Mitiga parcialmente que la BD está en el perfil de usuario de Windows (quien se sienta en la máquina ya pasó el login del SO), por eso High y no Critical.

**SEG-A2 (High) — Datos en reposo y respaldos sin cifrar; export sin PIN.** `db/index.ts:16-18` abre SQLite sin clave; `respaldos.ts:66-94` arma el zip sin contraseña; `respaldos:exportar` y `reportes:exportarCsv` no re-verifican PIN. Robo o pérdida de la laptop = vulneración de datos sensibles con obligación de notificar (LFPDPPP). **Diseño.** La mitigación barata es a nivel SO (BitLocker en la máquina de la cabina), no en la app.

**SEG-A3 (High) — Pipeline de releases sin barreras mecánicas.** Sin protección de rama, sin rulesets, sin protección de tags, commits/tags sin firma, acciones en tags flotantes, `contents: write` para todo el job (incluido `npm ci`), `.blockmap` exigido por `fail_on_unmatched_files` pero ausente en el release real `v0.1.4` → el workflow vigente no tiene evidencia de haber corrido. Lo que ya es correcto: `--publish never` + publicación atómica (RETIRED cumplido), `releaseType: release` (sin prereleases), gitleaks versionado en CI.

**SEG-M1 (Medium) — Identificación de la operadora en el repo público.** `scripts/seed-demo.mjs:18` empareja el nombre de pila de la usuaria real con el UUID real de su fila `usuarios` ("usuario existente"); `src/components/MensajeSorpresa.tsx` es un mensaje personal que confirma la relación. Rompe la regla de PROJECT.md ("un nombre y su número NUNCA coexisten"), aunque aquí es la operadora, no una clienta. El historial muestra 1 commit; ya es público, por lo que reescribir historia tiene valor limitado — decisión del owner (§6). Las 5 clientas del seed son ficticias (nombres genéricos, teléfonos con sufijo secuencial): sin hallazgo.

**SEG-M2 (Medium) — Zip Slip en restauración de respaldo.** `respaldos.ts:200-203`: `relativa = entryName.slice("archivos/".length)`; `destino = path.join(carpetaDatos, relativa)` sin comprobar que `destino` quede dentro de `carpetaDatos`. Una entrada `archivos/../../x` escribe fuera. Requiere que la usuaria restaure un zip manipulado (PIN + diálogo), pero PROJECT.md contempla mover respaldos entre máquinas. Tampoco hay límite de tamaño (zip bomb). **Bug.** Fix: reutilizar `rutaDentroDe(destino, carpetaDatos)` por entrada y rechazar el zip entero si una falla, antes de borrar `Datos/`.

**SEG-M3 (Medium) — La raíz de confianza es escribible por IPC sin PIN.** `config:actualizar` acepta `carpetaRaiz` arbitraria (`shared/config.ts:16`; `ipc/index.ts:95-99`) y de inmediato `asegurarEstructuraRaiz` crea/mueve carpetas ahí (`folders.ts:47-66`). Con la raíz en `C:\` o `/`, `rutaDentroDe` deja pasar cualquier ruta a `shell.openPath` y a `copyFileSync`, y `vaciarCarpetasDeDatos` borraría `<raíz>/Datos` (con PIN). Fix: que `carpetaRaiz` solo cambie por el canal de diálogo (`carpetas:elegirCarpetaRaiz`) y que `configSchema` rechace rutas raíz del sistema.

**SEG-M4 (Medium) — Enforcement de licencia evadible por diseño.** (a) la UI es el único gate (igual que SEG-A1); (b) `ultimaFechaVista` en JSON editable (`licencia.ts:51-54`); (c) matrícula constante si fallan `reg`/`ioreg`/MAC (`matricula.ts:35`) → un token emitido para un equipo degradado sirve en cualquier otro degradado; (d) `expira` no se valida como fecha al verificar (`licencia.ts:74-76`). Exposición monetaria hoy mínima (1 instalación); crece con cada instalación. **Diseño/deuda.**

**SEG-M5 (Medium) — Derechos ARCO incompletos: borrar una clienta no borra su nombre en disco ni en bitácora.** `eliminarCliente` solo borra la fila (`clientes.ts:156-168`); la carpeta `CL-xxxx_<nombre>` (`folders.ts:73`) y `bitacora.detalle` con el nombre (`clientes.ts:122, 150`) persisten. Una solicitud de cancelación no se puede cumplir con la app. Fix: carpeta nombrada solo por código (`CL-xxxx`), `detalle` sin nombre (ya hay `entidadId`), y borrado/renombrado de carpeta al eliminar.

**SEG-M6 (Medium, contrato) — Superficies que huelen a críticas y no están en `sensitive_globs`/CODEOWNERS.** La frontera de seguridad completa queda fuera: `electron/main.ts` (webPreferences, navegación), `electron/preload.ts` (cada canal expuesto), `electron/ipc/index.ts` (validación), `electron/services/auth.ts` (el único control de acceso), `electron/services/config.ts` + `shared/config.ts` (raíz de confianza), `shared/schemas.ts` (capa de validación), `index.html` (CSP), `.gitignore` (lo único que mantiene la llave privada fuera de git), `package-lock.json` (cadena de suministro del release), `vite.config.ts`, `scripts/listar-licencias.mjs` y `scripts/seed-demo.mjs` (leen/escriben datos de clientes), `src/App.tsx`, `src/pages/Lock.tsx`, `src/pages/Activacion.tsx` (los gates), `electron/services/reportesClientesDetalle.ts` y `citas.ts` (lectura de PII). `critical_surfaces` tampoco nombra "frontera Electron (IPC/preload/CSP/auth)". `roles.model` dice que el renderer "solo habla con el main por IPC" — cierto, pero omite que el main no verifica sesión (SEG-A1).

**SEG-B1 (Low) — `openExternal` sin allowlist de protocolo.** `main.ts:97, 105` pasan cualquier URL (`file:`, `smb:`, esquemas registrados) al SO. Hoy no hay sinks de HTML ni `href` dinámicos en `src` (grep vacío), así que requiere un compromiso previo del renderer. Fix de una línea: permitir solo `https:`/`http:`/`mailto:`.

**SEG-B2 (Low, contrato/RETIRED) — Residuos de enfoques retirados.** (a) `productos.unidad_medida`: RETIRED dice "se conserva solo para no perder datos viejos", pero sigue escribiéndose en alta y edición (`productos.ts:58, 89`), aceptándose en `shared/schemas.ts:31` y existiendo en el modelo del formulario (`ProductoFormModal.tsx:26, 45`). (b) `--publish always`: ya no está en código (solo un comentario explicativo en `build-windows.yml:26`), pero sobreviven dos releases `v0.1.3` en GitHub. (c) `.atlas-notes-allow` arrastra el término `Grupo SOAL`, de otro proyecto: inocuo, pero cada término ahí debilita el guard.

**SEG-B3 (Low) — Eventos de error del updater sin canal en preload.** `actualizaciones.ts:27-29` emite `actualizaciones:error`; `preload.ts:111-124` no lo expone, así que un fallo de descarga/verificación es invisible para la usuaria. Útil cuando se cierre SEG-C2 (un rechazo de firma debe verse).

## 5. Active risks — with detonation dates

### 5.1 Acumulación de copias sin cifrar
`asegurarRespaldoAutomaticoDiario` corre al arrancar y cada 6 h (`main.ts:144-148`), conserva 3 automáticos y **todos** los manuales (`respaldos.ts:22, 127`). Cada día produce al menos un zip con el expediente completo en texto claro en el mismo disco que la BD. Permanente mientras no haya cifrado de disco (SEG-A2).

### 5.2 Scheduled degradations
| # | What is lost | Date |
|---|---|---|
| 1 | Base legal para tratar datos de salud: no la hay desde la primera clienta con notas; la ley vigente es del 20-mar-2025 | **Ya detonó**; crece por clienta |
| 2 | Vigencia del PAT colgante (SEG-C1): desconocida — los PAT clásicos pueden no expirar | Hoy, hasta revocar |
| 3 | Licencia mensual/anual de la única instalación (`licencia.ts:108`): 3 días de gracia tras `expira` | Fecha del token actual (no visible desde el repo; ver `keys/clientes-licencias.json` localmente) |
| 4 | Confianza en `build-windows.yml`: el workflow vigente no ha publicado nunca; el primer tag nuevo es la prueba en producción | Próximo `vX.Y.Z` |

### 5.3 Root cause
La app fue diseñada como "un solo equipo, una sola persona, sin red": la autorización vive en la UI, la confidencialidad en el login del SO, y la cadena de releases en una cuenta personal. Cada supuesto es razonable para 1 instalación y deja de serlo con 2, o con una laptop perdida, o con una clienta que ejerza ARCO.

## 6. Proposed corrective plan

- **Step 0 — NOW (Carlos, < 1 h):** (1) Revocar el token `ghp_…` en GitHub y luego `git reflog expire --expire=now --all && git gc --prune=now` en el clon local (SEG-C1). (2) Confirmar 2FA con llave de hardware/passkey en la cuenta `CarloEsqui` (SEG-C2). (3) Activar en GitHub un ruleset que proteja `main` (PR + checks `Atlas guard`/`CI` requeridos) y los tags `v*` (solo el owner crea/borra) (SEG-A3). (4) Imprimir y empezar a recabar en papel un aviso de privacidad + consentimiento expreso para datos de salud con cada clienta, mientras se decide la captura en la app (SEG-C3).
- **Decision A — ¿Firmar el instalador Windows?** Opciones: (i) certificado OV/EV de firma de código (costo anual; además elimina SmartScreen) + `win.publisherName` → electron-updater verifica Authenticode; (ii) Azure Trusted Signing (más barato, requiere cuenta Azure); (iii) no firmar y aceptar el riesgo por escrito en PROJECT.md con las mitigaciones de Step 0. Desbloquea cerrar SEG-C2.
- **Decision B — ¿Cifrado de disco en la máquina de la cabina?** BitLocker (Windows Pro) o cifrado de dispositivo: cero cambios en la app, cierra la mayor parte de SEG-A2. Confirmar edición de Windows y si existe. Alternativa posterior: SQLCipher + zip con contraseña (cambio mayor; Gate 001).
- **Decision C — SEG-M1:** ¿reescribir historia para quitar el nombre de pila del seed (fuerza `push --force` y rompe clones) o solo corregir hacia adelante? Recomendación: corregir hacia adelante (quitar el comentario y `MensajeSorpresa`, que PROJECT.md ya marca como temporal) y anotar en el ledger que el dato fue público entre 2026-07 y la fecha del fix.
- **Decision D — Consentimiento en la app:** campos `consentimiento_sensibles_fecha`, `aviso_privacidad_version` en `clientes` + archivo firmado en `Documentos/`, y bloqueo de `notas`/`observaciones` (o aviso) sin consentimiento registrado. Entra por Gate 001 (cambio de esquema + legal). Pendiente de abogado como ya dice PROJECT.md.

- **Proposed change (SEG-A1, "sesión en main"):** (1) `let sesionDesbloqueada = false` en `ipc/index.ts`; `auth:verificarPin` y `auth:crearPin` la ponen en `true`; (2) un wrapper `protegido(handler)` que lance `Error("SESION_BLOQUEADA")` si no está desbloqueada, aplicado a todo canal salvo `auth:*`, `licencia:*`, `app:*`, `actualizaciones:*`; (3) contador de intentos fallidos con retardo exponencial (p. ej. 5 fallos → 30 s, persistido en `configuracion`); (4) `Menu.setApplicationMenu(null)` o `webPreferences.devTools: !app.isPackaged`; (5) `respaldos:exportar` y `reportes:exportarCsv` piden PIN como `restaurar`.
- **Proposed change (SEG-M2):** en `aplicarRespaldoDesdeArchivo`, antes de `rmSync`, iterar entradas y exigir `rutaDentroDe(path.join(carpetaDatos, relativa), carpetaDatos)`; rechazar si alguna falla o si `entry.header.size` supera un tope.
- **Proposed change (SEG-M3):** quitar `carpetaRaiz` de los campos que `config:actualizar` acepta del renderer (solo el canal de diálogo la fija); en `configSchema`, `refine` que rechace `path.parse(r).root === r`.
- **Proposed change (SEG-A3, pins):** fijar `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `softprops/action-gh-release` por SHA; `npm ci --ignore-scripts` + `npm rebuild better-sqlite3` explícito; `permissions: contents: read` a nivel job y `contents: write` solo en el step de publicación (o un job separado con `needs`). Borrar el release `v0.1.3` duplicado.
- **Proposed change (SEG-M5):** carpeta de clienta = `CL-xxxx` sin nombre (requiere migración de rutas, ya existe `migracionCarpetas.ts` como patrón); `detalle` en bitácora = código, no nombre; `eliminarCliente` renombra la carpeta a `_eliminada_CL-xxxx` o la borra.
- **Proposed change (SEG-M6, contrato):** agregar a `critical_surfaces` "Frontera Electron: IPC, preload, CSP, auth, raíz de confianza" y a `sensitive_globs`/CODEOWNERS las rutas listadas en SEG-M6; agregar `.gitignore` y `package-lock.json`.
- **Proposed change (SEG-B1/B2/B3):** allowlist de protocolo en `main.ts:96-107`; dejar de escribir `unidadMedida` y quitarla del esquema de entrada; exponer `onError` en preload; limpiar `Grupo SOAL` de `.atlas-notes-allow`.

**Pending manual verification** (pasteable, solo lectura, con resultado esperado):

```text
-- SEG-C1: ¿el PAT sigue vivo? (NO probarlo con curl: usar la UI de GitHub)
GitHub → Settings → Developer settings → Personal access tokens → buscar tokens creados ~2026-07
-- Esperado: ninguno activo tras Step 0 (revocar aunque parezca caducado).

-- SEG-C2 / A3: estado de la cuenta y el repo (gh, solo lectura)
gh api user --jq .two_factor_authentication            # Esperado: true
gh api repos/CarloEsqui/cabinacosmei/rulesets --jq length   # Hoy: 0. Esperado tras Step 0: >= 1
gh release list --repo CarloEsqui/cabinacosmei           # Hoy: v0.1.3 aparece dos veces. Esperado: una.

-- SEG-A1: bypass del PIN (app empaquetada, pantalla de PIN, Ctrl+Shift+I → consola)
await window.api.clientes.listar()
-- Hoy: devuelve filas. Esperado tras el fix: lanza "SESION_BLOQUEADA" (y DevTools no abre en empaquetado).

-- SEG-A2: cifrado de disco en la máquina de la cabina (PowerShell como admin)
manage-bde -status C:
-- Esperado: "Protection Status: Protection On".

-- SEG-M2: Zip Slip (SOLO en una máquina de pruebas con BD de prueba)
-- Construir un zip con manifest.json, cabina.sqlite3 de prueba y una entrada "archivos/../zipslip.txt";
-- restaurarlo desde "Restaurar desde archivo".
-- Hoy: aparece zipslip.txt junto a la carpeta raíz. Esperado tras el fix: la restauración se rechaza sin borrar Datos/.

-- SEG-C3: ausencia de consentimiento en el esquema (sobre un respaldo, fuera del repo)
sqlite3 cabina.sqlite3 "PRAGMA table_info(clientes);" | grep -ci consent
-- Hoy: 0. Esperado tras Decision D: >= 1.
```

## 7. What follows

1. **Carlos — hoy:** Step 0 completo (revocar PAT + gc local, 2FA/passkey, ruleset en `main` y tags `v*`, aviso de privacidad en papel). Anotar en `.notes/atlas-log.md`.
2. **Carlos decide A, B, C, D** (firma de código, BitLocker, historia del seed, consentimiento en app) y lo registra en PROJECT.md (anti-lista o plan).
3. **Ingeniería prepara (Wave 2, esta semana):** sesión en main + throttling + DevTools cerrados + PIN en exports (SEG-A1); fix Zip Slip (SEG-M2); raíz de confianza solo por diálogo (SEG-M3); pins por SHA y permisos mínimos en `build-windows.yml` (SEG-A3); `openExternal` con allowlist (SEG-B1). Cada uno con su evidencia `.notes/evidencia-…` respondiendo al código SEG-*.
4. **Contrato (Wave 2):** PROJECT.md + `sensitive_globs` + CODEOWNERS con la frontera Electron (SEG-M6); RETIRED actualizado con la realidad de `unidad_medida` (SEG-B2).
5. **Wave 3 (este mes):** firma del instalador si Decision A = sí, y en ese momento `publisherName` + `onError` visible (SEG-C2, SEG-B3); diseño de consentimiento/ARCO vía Gate 001 (SEG-C3, SEG-M5); carpetas por código sin nombre (SEG-M5).
6. **Primer tag después de estos cambios** es la prueba real de `build-windows.yml` (§5.2 #4): verificar que el release trae `.exe` + `.blockmap` + `latest.yml` una sola vez.
