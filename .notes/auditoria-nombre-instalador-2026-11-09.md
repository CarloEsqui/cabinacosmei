# Auditoría — Nombre del instalador y pipeline de auto-update — 2026-11-09 (REL-)

**Scope:** El cambio sin commitear en `package.json` (rama `atlas/progreso-actualizacion`, PR #8):
`build.nsis.artifactName = "Bellora-Dashboard-Setup-${version}.${ext}"` y bump `0.2.0 → 0.2.1`.
Se audita la cadena completa de nombres: electron-builder (`app-builder-lib` 26.15.3) → `latest.yml`
→ `.github/workflows/build-windows.yml` → `softprops/action-gh-release@v2` → GitHub Releases →
`electron-updater` 6.8.9 en las instalaciones existentes (v0.1.4 y v0.2.0). **Fuera de alcance:** la
barra de progreso del mismo PR (ya auditada en `auditoria-progreso-actualizacion-2026-11-09.md`),
la validación de licencias, la firma de código (no hay), y los releases duplicados `v0.1.3`
(documentados en `auditoria-seguridad-pii-releases-2026-11-03.md`).
**Method:** Inspección de código en `node_modules/` (versiones fijadas por `package-lock.json` en HEAD
y en los tags `v0.1.4` y `v0.2.0`), lectura del workflow, `gh release view` / `gh api` de solo
lectura, `curl -I` contra los assets publicados, y lectura del código fuente de
`softprops/action-gh-release` en el tag `v2` (commit `3bb12739`, descargado a scratchpad, fuera del
repo). No se ejecutó electron-builder (lo corre la sesión principal). Nada se modificó.
**PII declaration:** Sin datos personales. Solo metadatos públicos de releases, nombres de archivo y
código de librerías. La única instalación real se menciona como "la instalación", nunca por nombre.
**State as of:** 2026-11-09 (hora local). Último release `v0.2.0` publicado `2026-11-09T20:11:42Z`;
assets renombrados por API a las `2026-11-10T01:15:29Z` / `01:15:30Z` (UTC).

---

## 1. Resumen ejecutivo

1. **El `artifactName` propuesto es CORRECTO y suficiente: los tres nombres coinciden exactamente con
   lo que `electron-updater` pedirá.** Con el patrón, `NsisTarget` produce
   `Bellora-Dashboard-Setup-0.2.1.exe` (`NsisTarget.js:137`, `platformPackager.js:552-566`,
   `macroExpander.js`), que pasa `isSafeGithubName` (`platformPackager.js:687-689`, regex
   `^[0-9A-Za-z._-]+$`) → `computeSafeArtifactNameIfNeeded` devuelve `null`
   (`platformPackager.js:690-695`) → `latest.yml` toma `path`/`files[0].url` del *basename real del
   archivo* (`updateInfoBuilder.js:134-143`; la rama de reescritura `:100-107` no se activa). El
   blockmap es `<archivo>.blockmap` (`differentialUpdateInfoBuilder.js:67`). `softprops` sube cada
   archivo con `basename(path)` (`github.ts:259`) y GitHub no toca un nombre sin espacios. El
   updater pide `/releases/download/<tag>/<url con espacios→guiones>` (`GitHubProvider.js:179-185`)
   y `<pathname>.blockmap` (`Provider.js:22-23`): **misma cadena en los tres puntos.**
2. **La versión de `electron-updater` es idéntica en las dos instalaciones reales posibles y en HEAD
   (6.8.9)** — `package-lock.json` línea 5458 en `v0.1.4`, `v0.2.0` y la rama actual — así que el
   análisis anterior aplica por igual a quien actualice desde v0.1.4 o desde v0.2.0.
3. **La causa raíz del incidente es de DISEÑO (contrato roto entre dos herramientas), no un bug de
   ninguna de ellas.** electron-builder escribe en `latest.yml` el *nombre seguro* que **su propio
   publicador** usaría al subir (`updateInfoBuilder.js:100-107`), pero deja el archivo en disco con
   espacios (patrón por defecto `${productName} Setup ${version}.${ext}`, `NsisTarget.js:100-104`).
   Al pasar a `--publish never` + `softprops` (commit `4cbeaae`, RETIRED en PROJECT.md), el archivo
   se subió con su basename con espacios y GitHub lo normalizó a puntos (`softprops/util.ts:201-203`
   codifica exactamente esa regla: `replace(/ /g, '.')`). v0.1.4 funcionó porque aún usaba
   `--publish always` (`build-windows.yml` en `v0.1.4`, líneas 27-29). El cambio auditado elimina la
   discrepancia en su origen: el nombre en disco ya es el nombre seguro.
4. **Cambiar el nombre del instalador NO afecta a las instalaciones existentes.** Clave de
   desinstalación, carpeta de instalación, accesos directos, `userData` y la caché del updater
   derivan de `appId`, `productName` y `name`, nunca del nombre del `.exe` (§2.3). El flujo
   `--updated` y la descarga diferencial son indiferentes al nombre (§2.4).
5. **La descarga diferencial desde v0.2.0 funcionará; desde v0.1.4 caerá a descarga completa sin
   error visible.** URL del blockmap viejo desde v0.2.0 →
   `.../download/v0.2.0/Bellora-Dashboard-Setup-0.2.0.exe.blockmap` = **HTTP 200** (verificado tras
   el renombrado). Desde v0.1.4 → `.../download/v0.1.4/Bellora-Dashboard-Setup-0.1.4.exe.blockmap`
   = **HTTP 404** (v0.1.4 nunca tuvo blockmap, ya señalado en SEG-A3); `AppUpdater.js:703-711` lo
   captura, lo *loguea* y devuelve `true` → descarga completa (`NsisUpdater.js:47-50`). No emite
   `error`, así que `actualizaciones.ts` no muestra nada raro.
6. **El workflow sigue cumpliendo `fail_on_unmatched_files: true`.** Los globs `release/*.exe`,
   `release/*.blockmap`, `release/latest.yml` (`build-windows.yml:50-53`) casan con los nuevos
   nombres. Ninguna otra ruta del repo depende del nombre viejo (grep: solo `package.json:56`).
7. **Lo que falta es una barrera que haga visible una recurrencia (REL-M1).** Hoy el pipeline puede
   publicar un `latest.yml` cuyo `path` no existe como asset y CI sigue verde; el incidente fue
   silencioso hasta que la instalación se quedó en "Descargando…". La barrera es un paso de ~10
   líneas antes de publicar.

**Veredicto: APROBADO CON CONDICIONES (C0 / A0 / M1 / B3).** El cambio corrige la causa raíz y es
seguro para las instalaciones existentes. Condición: antes de empujar el tag `v0.2.1`, la
verificación local (§6, pendiente) debe mostrar `path:` de `latest.yml` == nombre del `.exe` en
`release/`. REL-M1 se recomienda en este mismo PR porque toca `.github/` (superficie crítica) y
esta auditoría ya lo cubre.

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Del patrón al archivo en disco (electron-builder 26.15.3)

```
installerFilename = expandArtifactNamePattern(nsisOptions, "exe", arch, defaultPattern, false)   NsisTarget.js:137
  pattern = nsis.artifactName || win.artifactName || config.artifactName || default              platformPackager.js:552-556
  default = "${productName} Setup ${version}.${ext}"   → "Bellora Dashboard Setup 0.2.0.exe"      NsisTarget.js:100-104
  nuestro = "Bellora-Dashboard-Setup-${version}.${ext}" → "Bellora-Dashboard-Setup-0.2.1.exe"     package.json:56
  ${version} = appInfo.version (package.json "version"), ${ext} = "exe"                            macroExpander.js (default branch / extra)
  sin ${arch} en el patrón → el arch no se inserta                                                 macroExpander.js (solo sustituye macros presentes)
installerPath = release/<installerFilename>                                                        NsisTarget.js:139, package.json directories.output
blockMapFile  = installerPath + ".blockmap"                                                        differentialUpdateInfoBuilder.js:67
```

### 2.2 Del archivo a `latest.yml` (el contrato que se rompió)

```
safeArtifactName = computeSafeArtifactNameIfNeeded(installerFilename, …)                          NsisTarget.js:303
  isSafeGithubName(n) = /^[0-9A-Za-z._-]+$/.test(n)                                               platformPackager.js:687-689
  seguro → null; con espacios → espacios→guiones; si aún no es seguro → nombre genérico             platformPackager.js:690-703
latest.yml: url = path = basename(event.file)                                                     updateInfoBuilder.js:134-143
  si safeArtifactName != null && provider == github → url = path = safeArtifactName                updateInfoBuilder.js:100-107
```

Con el patrón **por defecto** (v0.2.0): archivo en disco `Bellora Dashboard Setup 0.2.0.exe`,
`safeArtifactName = Bellora-Dashboard-Setup-0.2.0.exe`, `latest.yml` dice el seguro. Ese contrato
asume que quien sube es el `GitHubPublisher` de electron-builder (que usa `safeArtifactName`).
`softprops` no conoce ese contrato: sube `basename(path)` (`github.ts:259`) y GitHub convierte
espacios en puntos (`util.ts:201-203`, `alignAssetName`). Resultado del incidente: asset
`Bellora.Dashboard.Setup.0.2.0.exe`, `latest.yml` apuntando a `Bellora-Dashboard-Setup-0.2.0.exe`,
404 en el updater. **Diseño, no bug**: cada herramienta hizo lo documentado.

Con el patrón **propuesto** (v0.2.1): archivo `Bellora-Dashboard-Setup-0.2.1.exe` → seguro →
`safeArtifactName = null` → `latest.yml` = basename real → `softprops` sube ese basename → GitHub lo
conserva → **un solo nombre en toda la cadena**.

### 2.3 Lo que el updater pide (electron-updater 6.8.9, igual en v0.1.4, v0.2.0 y HEAD)

```
tag        ← feed atom del repo (último release)                                                    GitHubProvider.js:43-57
latest.yml ← /<owner>/<repo>/releases/download/<tag>/latest.yml                                    GitHubProvider.js:114-118, 183-185
exe URL    ← /<owner>/<repo>/releases/download/<tag>/<files[0].url con / /g → "-">                 GitHubProvider.js:179-185, Provider.js:124-131
blockmap nuevo ← <exe URL pathname> + ".blockmap"                                                  Provider.js:22-23
blockmap viejo ← <exe URL pathname>.replace(/<newVersion>/g, oldVersion) + ".blockmap"             Provider.js:24
nombre en caché ← basename(exe URL pathname)  → pending/Bellora-Dashboard-Setup-0.2.1.exe          AppUpdater.js:573-583, 588-589
```

Para v0.2.1 desde una instalación v0.2.0: blockmap viejo =
`/CarloEsqui/cabinacosmei/releases/download/v0.2.0/Bellora-Dashboard-Setup-0.2.0.exe.blockmap`
(nótese que el `replace` global también reescribe el segmento del tag, por eso apunta al release
correcto) → **200**. Desde v0.1.4: `.../v0.1.4/Bellora-Dashboard-Setup-0.1.4.exe.blockmap` → **404**
→ `httpExecutor.js:155-157` rechaza con `HttpError` → `AppUpdater.js:703-711` loguea
`Cannot download differentially, fallback to full download` y devuelve `true` →
`NsisUpdater.js:47-50` baja el instalador completo. **No hay evento `error`.** El blockmap viejo solo
se descarga si no hay `current.blockmap` en caché (`AppUpdater.js:697-699`).

### 2.4 Lo que NO depende del nombre del instalador

| Elemento | De dónde sale | Cita |
|---|---|---|
| Clave de desinstalación (`UNINSTALL_APP_KEY`, `APP_GUID`) | `options.guid` o UUID v5 de `appId` (`com.bellora.dashboard`) | `NsisTarget.js:157-163,176-177`; `installer.nsh:104-125` |
| Nombre en "Programas y características" | `uninstallDisplayName` o `${productName} ${version}` | `NsisTarget.js:473` |
| Carpeta de instalación (`APP_FILENAME`) | `productFilename` = `productName` saneado (`Bellora Dashboard`) | `NsisTarget.js:166`; `targetUtil.js:40-42`; `appInfo.js:55-57` |
| Accesos directos (`SHORTCUT_NAME`) | `shortcutName` o `productName` | `NsisTarget.js:461`; `installer.nsh:106` |
| `userData` (donde vive `cabina.sqlite3`) | `app.getPath("userData")` → nombre de la app | `electron/main.ts:127`; `electron/db/index.ts:78-82` |
| Caché del updater | `updaterCacheDirName` = `name` saneado en minúsculas + `-updater` → `bellora-dashboard-updater` | `appInfo.js:126-128`; `AppUpdater.js:545-550` |
| Copia del instalador en caché para diferencial | NSIS copia `$EXEPATH` a `$LOCALAPPDATA\bellora-dashboard-updater\installer.exe` — nombre **normalizado**, sea cual sea el del `.exe` descargado | `installer.nsh:93`; `NsisTarget.js:502`; `builder-util-runtime/out/index.js:46`; `AppUpdater.js:668`; `NsisUpdater.js:49` |
| Flujo `--updated` | `NsisUpdater.js:101-131` lanza el `.exe` descargado (ruta en caché) con `["--updated"]`; NSIS relanza la app con `--updated` | `NsisUpdater.js:107`; `common.nsh:123-129`; `installUtil.nsh:205-206` |

Ninguno de estos lee el nombre del archivo del instalador. El cambio es invisible para la
instalación existente.

### 2.5 Workflow

`build-windows.yml:28-29` compila con `--publish never`; `:43-56` publica
`release/*.exe`, `release/*.blockmap`, `release/latest.yml` con `fail_on_unmatched_files: true`.
`upload-artifact` (`:35-38`) sube `release/*.exe`. Los nuevos nombres casan con los tres globs. El
`__uninstaller.exe` temporal se borra antes de emitir el artefacto (`NsisTarget.js:302,349`), así que
`release/*.exe` solo casa con el instalador.

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `artifactName` y versión 0.2.1 | `git diff package.json` (sin commitear) | ✅ correcto |
| Versiones de librerías en HEAD | `node_modules/*/package.json`: electron-updater 6.8.9, electron-builder/app-builder-lib 26.15.3, builder-util-runtime 9.7.0 | ✅ |
| Versiones en los tags instalados | `git show v0.1.4:package-lock.json`, `v0.2.0:package-lock.json` línea 5458 → electron-updater 6.8.9; línea 3220/5195 → 26.15.3 | ✅ idénticas a HEAD |
| Lógica de nombres | `platformPackager.js`, `NsisTarget.js`, `updateInfoBuilder.js`, `differentialUpdateInfoBuilder.js`, `macroExpander.js` | ✅ leída, citada |
| Lógica del updater | `GitHubProvider.js`, `Provider.js`, `AppUpdater.js`, `NsisUpdater.js`, `httpExecutor.js` | ✅ leída, citada |
| Assets reales `v0.2.0` | `gh api repos/.../releases/tags/v0.2.0` | ✅ 3 assets con nombre con guiones, `state=uploaded`, `uploader=github-actions[bot]`, renombrados 2026-11-10T01:15Z |
| Assets reales `v0.1.4` | `gh release view v0.1.4` | ⚠️ solo `.exe` + `latest.yml`, **sin `.blockmap`** (SEG-A3) |
| `latest.yml` de `v0.2.0` | `curl -sL` | ✅ `path`/`url` = `Bellora-Dashboard-Setup-0.2.0.exe`, `size: 119939237` = tamaño del asset |
| HTTP de assets | `curl -sIL` | ✅ 200 `.exe` y `.blockmap` v0.2.0 con guiones; 404 nombre con puntos (ya no existe); 404 blockmap v0.1.4 (nunca existió) |
| Comportamiento de `softprops` | `src/github.ts:259` (`name: basename(path)`), `src/util.ts:201-203` (`alignAssetName`), tag `v2` → `3bb12739` | ✅ confirma el mecanismo del incidente |
| Referencias al nombre viejo | `grep -ri` en el repo sin `node_modules/release/dist` | ✅ solo `package.json:56`; no hay README; `docs/DISENO_BELLORA.md` y `ci.yml` no lo mencionan |
| Runs del workflow | `gh run list --workflow=build-windows.yml` | ✅ `v0.2.0` run `42690009270` success — el verde no detectó el nombre roto |

## 4. Caso por caso

No hay sujetos (clientas) en esta superficie. La tabla recorre cada combinación origen→destino de
la actualización para la instalación real:

| # | Instalación origen | Pide `latest.yml` de | Pide `.exe` | Pide blockmap viejo | Resultado |
|---|---|---|---|---|---|
| 1 | v0.1.4 → v0.2.0 (hoy, tras renombrar) | `v0.2.0/latest.yml` (200) | `v0.2.0/Bellora-Dashboard-Setup-0.2.0.exe` (200) | `v0.1.4/…0.1.4.exe.blockmap` (404) | ✅ descarga completa, sin error visible |
| 2 | v0.1.4 → v0.2.1 (tras el tag) | `v0.2.1/latest.yml` | `v0.2.1/Bellora-Dashboard-Setup-0.2.1.exe` | `v0.1.4/…0.1.4.exe.blockmap` (404) | ✅ descarga completa, sin error visible |
| 3 | v0.2.0 → v0.2.1 | `v0.2.1/latest.yml` | `v0.2.1/Bellora-Dashboard-Setup-0.2.1.exe` | `v0.2.0/Bellora-Dashboard-Setup-0.2.0.exe.blockmap` (200) | ✅ diferencial (requiere `installer.exe` en caché, copiado por NSIS al instalar v0.2.0) |
| 4 | v0.2.0 instalada a mano desde el `.exe` con puntos | igual que #3 | igual que #3 | igual que #3 | ✅ NSIS copió ese `.exe` como `installer.exe` igualmente (`installer.nsh:93`) |

Hallazgos sueltos:

- **Antes del renombrado**, el caso #1 era: `.exe` → 404 → `httpExecutor.download` rechaza → `error`
  con `code = HTTP_ERROR_404`. El banner de v0.1.4 (sin la corrección ACT-M* del PR #8) no manejaba
  ese estado y quedó en "Descargando…". Con PR #8 el estado pasa a `error/descarga` con el código.
  Esto ya está cubierto por la auditoría anterior; se cita solo como cierre del incidente.
- El `sha512` y `size` de `latest.yml` v0.2.0 coinciden con el asset renombrado (verificado por la
  sesión principal; `size: 119939237` coincide con `gh api`). Renombrar no altera el contenido.

## 5. Riesgos activos — con fechas de detonación

### 5.1 Recurrencia silenciosa del desajuste de nombres (REL-M1)
Mecanismo: `build-windows.yml` no comprueba que `latest.yml` `path` exista como archivo en
`release/` ni que sea un nombre seguro para GitHub. Cualquier cambio futuro de `productName`, de
`artifactName` (p. ej. agregar `${productName}` con espacios, o un `${arch}`), o un cambio del
patrón por defecto en una actualización de electron-builder, reproduce el incidente **con CI
verde**. No detona solo: requiere una edición. Pero cuando detona, lo hace en todas las
instalaciones a la vez y solo se ve desde la máquina de la clienta.

### 5.2 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| — | Ninguna: el cambio no introduce deuda que crezca con el tiempo. | — |

### 5.3 Causa raíz
El pipeline mezcla dos herramientas con contratos distintos sobre el nombre del asset: electron-builder
escribe en `latest.yml` el nombre que **él** subiría; `softprops` sube el nombre que **hay en
disco**; GitHub normaliza espacios a puntos. Mientras el nombre en disco sea ya seguro (lo que hace
el `artifactName` propuesto), los tres contratos coinciden. La regla a conservar: **el
`artifactName` de Windows debe cumplir `^[0-9A-Za-z._-]+$` mientras se publique con `softprops`.**

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA:** nada que congelar; el release `v0.2.0` ya está reparado (assets renombrados,
  HTTP 200). No crear el tag `v0.2.1` hasta que la verificación local (abajo) confirme los nombres.
- **Decisión A — ¿incluir la barrera REL-M1 en el PR #8?** (a) Sí, en el mismo PR: toca `.github/`
  (superficie crítica) y esta auditoría la cubre; cierra la recurrencia antes del primer tag con el
  nuevo nombre. (b) No, PR aparte: requiere su propia declaración en el guard de Atlas y deja el tag
  `v0.2.1` sin barrera. Recomendación: (a).
- **Decisión B — ¿documentar la regla en PROJECT.md → RETIRED?** La entrada de `--publish always`
  dice "Reopen if: electron-builder garantiza publicación atómica" pero no registra la consecuencia
  descubierta (el nombre seguro). Una línea evita que alguien quite `artifactName` creyendo que es
  cosmético (REL-B1).

- **Cambio propuesto (REL-M1):** un paso en `build-windows.yml` entre "Compilar" y "Publicar
  release", solo en tags:

  ```yaml
        - name: Verificar latest.yml contra los archivos a publicar
          if: startsWith(github.ref, 'refs/tags/')
          shell: pwsh
          run: |
            $yml  = Get-Content release/latest.yml -Raw
            $path = [regex]::Match($yml, '(?m)^path:\s*(.+)$').Groups[1].Value.Trim()
            $url  = [regex]::Match($yml, '(?m)^\s*-\s*url:\s*(.+)$').Groups[1].Value.Trim()
            if ($path -ne $url) { throw "latest.yml: path ($path) != files[0].url ($url)" }
            if ($path -notmatch '^[0-9A-Za-z._-]+$') { throw "Nombre no seguro para GitHub Releases: $path" }
            foreach ($f in @("release/$path", "release/$path.blockmap")) {
              if (-not (Test-Path -LiteralPath $f)) { throw "latest.yml apunta a $f pero no existe" }
            }
            $ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
            if ("v$ver" -ne $env:GITHUB_REF_NAME) { throw "Tag $env:GITHUB_REF_NAME no coincide con package.json v$ver" }
  ```

  1. `path == url`: ambos campos son los que lee el updater (`Provider.js:104-122` usa `files` y cae a
     `path`); deben ser el mismo.
  2. Regex `^[0-9A-Za-z._-]+$`: es literalmente `isSafeGithubName` (`platformPackager.js:688`); si
     el nombre lo pasa, electron-builder no reescribe `latest.yml` y GitHub no lo normaliza.
  3. `Test-Path` del `.exe` y del `.blockmap`: garantiza que lo que `softprops` subirá tiene
     exactamente el nombre que `latest.yml` anuncia.
  4. Tag == `v<version>`: cierra REL-B3 en la misma línea (ver abajo).

  Opcional (post-publicación, misma confianza pero desde el lado de GitHub): un paso final con
  `gh release view $env:GITHUB_REF_NAME --json assets --jq '.assets[].name'` que falle si no
  contiene `$path`.

**Verificación manual pendiente** (de solo lectura; la corre la sesión principal sobre la
compilación local de verificación):

```sh
grep -E '^(path|  - url):' release/latest.yml
# Esperado: dos líneas, ambas "Bellora-Dashboard-Setup-0.2.1.exe"

ls release | grep -E '^Bellora-Dashboard-Setup-0\.2\.1\.exe(\.blockmap)?$'
# Esperado: 2 líneas (el .exe y el .blockmap); NO debe existir "Bellora Dashboard Setup 0.2.1.exe"

grep -c ' ' release/latest.yml | cat
# Esperado: espacios solo en los campos YAML, nunca dentro del nombre (inspección visual del punto 1)
```

Tras publicar `v0.2.1` (desde cualquier máquina, sin tocar nada):

```sh
gh release view v0.2.1 --json assets --jq '.assets[].name'
# Esperado: Bellora-Dashboard-Setup-0.2.1.exe, Bellora-Dashboard-Setup-0.2.1.exe.blockmap, latest.yml

curl -sIL -o /dev/null -w '%{http_code}\n' https://github.com/CarloEsqui/cabinacosmei/releases/download/v0.2.1/Bellora-Dashboard-Setup-0.2.1.exe
curl -sIL -o /dev/null -w '%{http_code}\n' https://github.com/CarloEsqui/cabinacosmei/releases/download/v0.2.1/Bellora-Dashboard-Setup-0.2.1.exe.blockmap
# Esperado: 200 y 200
```

## Hallazgos

| Código | Severidad | Hallazgo | Fix |
|---|---|---|---|
| REL-M1 | 🟡 Medium | `build-windows.yml` no verifica que `latest.yml` `path`/`url` exista en `release/` ni que sea un nombre seguro para GitHub; una recurrencia pasa CI en verde y rompe el auto-update de todas las instalaciones hasta reparar a mano. Medium y no High porque la causa raíz queda corregida por el cambio auditado, la recurrencia exige una edición humana y el daño es reversible (renombrar assets), sin pérdida de datos ni dinero. | Paso de verificación propuesto en §6. |
| REL-B1 | ⚪ Low | La regla "el `artifactName` de Windows debe ser seguro para GitHub mientras se publique con `softprops`" no está escrita en ningún sitio del repo; `package.json` no admite comentarios y la entrada RETIRED de PROJECT.md no registra la consecuencia. | Una línea en PROJECT.md → RETIRED (`--publish always`) y/o en el comentario del paso "Publicar release" del workflow. |
| REL-B2 | ⚪ Info | Cualquier instalación aún en v0.1.4 hará siempre descarga completa (~115 MB) en su primera actualización porque `v0.1.4` no tiene `.blockmap` (404 verificado); el fallback es silencioso por diseño (`AppUpdater.js:703-711`). A partir de v0.2.0 la ruta diferencial queda disponible. | Ninguno; conocimiento operativo para el dueño. |
| REL-B3 | ⚪ Low | El pipeline no comprueba que el tag `vX.Y.Z` coincida con `package.json.version`. Si difieren, `latest.yml` anuncia una versión distinta a la del tag; el `.exe` se descarga igual (la URL usa el tag del feed), pero la URL del blockmap viejo (`Provider.js:24`, reemplazo de versión en todo el pathname) apuntaría al tag equivocado → siempre descarga completa, y el historial de releases queda inconsistente. | Última línea del paso propuesto en §6 (cero costo adicional). |

## 7. Qué sigue

1. **Sesión principal** corre la compilación local de verificación y confirma las tres salidas de
   §6 (`latest.yml`, `.exe`, `.blockmap` con el nombre nuevo).
2. **Carlos decide** Decisión A (REL-M1 en PR #8 o aparte) y Decisión B (línea en RETIRED).
3. **Ingeniería prepara** el paso del workflow (si A = sí) y la línea de PROJECT.md; la declaración
   del PR #8 en el guard de Atlas debe enlazar esta auditoría además de la de progreso, porque
   `package.json` y `.github/**` están en `sensitive_globs`.
4. **Carlos** hace merge y empuja el tag `v0.2.1`; después corre los dos `curl -I` de §6 (esperado
   200/200) y `gh release view v0.2.1` (tres assets con el nombre nuevo).
5. En la máquina de la cabina, la instalación debe pasar a v0.2.1 por sí sola; con PR #8, un fallo
   se vería ahora como estado `error` con código, no como "Descargando…" eterno.
