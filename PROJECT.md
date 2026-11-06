---
project: "Bellora Dashboard (cabinacosmei)"
description: "App de escritorio (Electron + SQLite local) para administrar una cabina de cosmetología y cosmiatría: clientas, agenda, servicios, cobros, inventario por lotes y reportes. Hoy la usa una sola cabina."
status: active            # active | maintenance | frozen

paths:
  docs: "docs/"
  notes: ".notes/"                # VERSIONED in a PUBLIC repo — anything committed here is public.
  migrations: "drizzle/"

database:
  engine: "sqlite"
  migration_naming: "NNNN_nombre.sql generado por drizzle-kit (npm run db:generate) + entrada en drizzle/meta/_journal.json; secuencial, nunca renumerar ni editar una migración ya publicada"
  apply_method: "Automático: migrate() en electron/db/index.ts corre al abrir la app en CADA instalación (cabina.sqlite3 en userData). Una migración publicada en un release se aplica sola en la máquina de la clienta al actualizar."
  applied_log: "APPLIED-MIGRATIONS.md"

verification:               # commands that must pass before any work is "done".
  - "npm run typecheck"
  - "npm run build"

pii:
  present: true
  # Operative rule (enforced by validate-notes): documents may state a #ID's ROLE;
  # a name and its number NEVER coexist in the same repo — that mapping is the key
  # that retroactively de-anonymizes every #N in every document.
  notes: "Tabla clientes: nombre, teléfono, correo, fecha de nacimiento, dirección, contacto de emergencia, notas/observaciones en texto libre (pueden contener datos de salud = datos SENSIBLES, LFPDPPP 2025). Ficha clínica facial (desde 2026-11-05): tablas fichas_clinicas y fichas_clinicas_versiones = datos de salud SENSIBLES, sin registro de consentimiento por decisión del dueño (ver Marco legal). Tabla archivos + carpetas por clienta/servicio en disco (el esquema ya admite categoria 'foto'; las fotos de tratamiento usan foto_antes / foto_despues). Todo en SQLite y disco SIN cifrar, en la máquina de la cabina. Respaldos .zip también sin cifrar. keys/clientes-licencias.json (datos de clientas del negocio de licencias) está en .gitignore y NUNCA se versiona. En notas/evidencia: referirse a clientas solo por código (CL-0001) o rol, nunca por nombre; nunca pegar contenido de la BD real."
  subject_pattern: "CL-[0-9]{4}"

critical_surfaces:          # an AUDIT is required BEFORE integrating changes here
  - "PROJECT.md — this contract itself"
  - "the enforcement layer — .github/ workflows, PR template, githooks/, CODEOWNERS"
  - "Migraciones y arranque de BD — drizzle/, electron/db/ (corren solas en la máquina de la clienta, irreversibles)"
  - "Dinero — pagos, cierre de cita, corte de caja, reportes financieros"
  - "Respaldos, restauración y reinicio de datos"
  - "Licencias y pipeline de releases/auto-update"
  - "PII de clientas — rutas de lectura/escritura/exportación de datos personales y archivos"

sensitive_globs:            # machine-readable shadow of critical_surfaces
  - "PROJECT.md"
  - "CODEOWNERS"
  - ".github/**"
  - "githooks/**"
  - ".atlas-notes-allow"
  - "drizzle/**"
  - "electron/db/**"
  - "electron/services/comprobantes.ts"
  - "electron/services/corte.ts"
  - "electron/services/serviciosRealizados.ts"
  - "electron/services/reportesFinanzas.ts"
  - "src/pages/agenda/CierreCitaModal.tsx"
  - "src/pages/Corte.tsx"
  - "electron/services/cobros.ts"
  - "electron/services/tarjetasRegalo.ts"
  - "electron/services/cupones.ts"
  - "electron/services/respaldos.ts"
  - "electron/services/reinicio.ts"
  - "electron/services/migracionCarpetas.ts"
  - "electron/services/licencia.ts"
  - "electron/services/matricula.ts"
  - "electron/services/actualizaciones.ts"
  - "scripts/generar-llaves.mjs"
  - "scripts/firmar-licencia.mjs"
  - "keys/**"
  - "package.json"
  - "electron/services/clientes.ts"
  - "electron/services/archivos.ts"
  - "electron/services/folders.ts"
  - "electron/services/exportarCsv.ts"
  - "electron/services/fichasClinicas.ts"

roles:
  model: "Sin roles. Un único PIN (scrypt + salt) en configuracion['auth.pinHash'], verificado en electron/services/auth.ts; la tabla usuarios existe pero no separa permisos. El renderer corre con contextIsolation + sandbox y solo habla con el main por IPC (electron/ipc/index.ts)."
  privileged: "Quien conoce el PIN puede todo: cobrar, borrar, restaurar respaldos (piden PIN de nuevo) y reiniciar datos. Releases y licencias: solo Carlos (llave privada local en keys/, fuera de git)."

git:
  default_branch: "main"
  flow: "rama -> PR -> CI verde -> merge; tag vX.Y.Z dispara build-windows.yml y publica el release que consume el auto-update. Commits, tags y pushes los ejecuta Carlos (Claude prepara y explica)."
  protections: "404 (2026-11-03) — repo PÚBLICO, protección de rama disponible pero no configurada: CODEOWNERS solo da visibilidad, nada exige revisión ni checks verdes. Rung 3 disponible: marcar los jobs de Atlas guard y CI como required checks."
---

# Bellora Dashboard (cabinacosmei)

Bellora Dashboard es una app de escritorio Electron (React + Vite en el renderer, `better-sqlite3`
+ drizzle en el main) que administra una cabina de cosmetología y cosmiatría: expediente de
clientas, agenda y mantenimientos, cierre de citas con cobro y comprobante, corte de caja,
inventario por lotes con caducidad, proveedores y reportes. Toda la información vive **en la
máquina de la cabina** (`cabina.sqlite3` en la carpeta de datos del usuario, más una carpeta raíz
con subcarpetas por clienta y servicio). No hay servidor: un error en una migración o en un release
llega directo a los datos reales de la usuaria, sin red de seguridad más allá de sus respaldos.

Hoy hay **una sola instalación real**. Se distribuye por GitHub Releases (`CarloEsqui/cabinacosmei`,
repo **público**) y se actualiza sola con `electron-updater`; el acceso está condicionado a una
licencia firmada con la llave privada de Carlos. La usuaria es cosmetóloga, no técnica: la UI está
en español y en tono cálido (ver `docs/DISENO_BELLORA.md`, normativo para toda la UI).

Dos cosas que hay que saber antes de tocar nada: (1) las migraciones de `drizzle/` se aplican solas
al abrir la app y las llaves foráneas están activas (`foreign_keys = ON`, casi todas `restrict`),
así que borrar registros con historial falla por diseño; (2) el repo es público, así que todo lo que
se versione en `.notes/` es público.

## Critical surfaces — why each one

- **PROJECT.md (this contract)** — a silently weakened contract disables every gate
  downstream: the system only protects what this file names.
- **The enforcement layer (.github/, githooks/, CODEOWNERS)** — a PR that weakens or
  deletes the guard produces no red, only absence; it must at least be declarable.
  Incluye `build-windows.yml`, que publica el instalador que todas las instalaciones descargan.
- **Migraciones y arranque de BD** — `migrate()` corre en la máquina de la clienta al abrir la app;
  una migración mala corrompe o bloquea su única copia de los datos y no hay forma de revertirla a
  distancia. `electron/db/index.ts` además define `foreign_keys` y `ejecutarSinForeignKeys`.
- **Dinero (pagos, cierre de cita, corte, reportes financieros)** — un error aquí descuadra la caja
  de la cabina. Además, el Código Fiscal de la Federación (art. 30) obliga a conservar la
  documentación contable 5 años: borrar pagos o ventas en lugar de cancelarlos puede destruir
  soporte fiscal. Regla: los registros de dinero se cancelan/revierten, no se borran.
- **Respaldos, restauración y reinicio** — `restaurarRespaldo` sobrescribe el archivo de BD y
  `reinicio.ts` borra masivamente con las FKs apagadas: un error es pérdida de datos irreversible.
- **Licencias y releases** — una licencia mal validada bloquea a la usuaria fuera de su propio
  negocio; un release malo llega por auto-update a todas las instalaciones sin intervención.
- **PII de clientas** — datos personales y potencialmente **sensibles** (salud en notas; fotos de
  tratamiento si se agregan). La LFPDPPP vigente (DOF 20-mar-2025) exige aviso de privacidad y
  consentimiento **expreso y por escrito** para datos sensibles; la autoridad ahora es la Secretaría
  Anticorrupción y Buen Gobierno. Agregado como superficie crítica en el arranque por la
  investigación legal que pidió Carlos; él puede retirarlo con justificación.

## Verification

- `npm run typecheck` — tsc sobre el renderer y sobre el proceso main de Electron.
- `npm run build` — typecheck + `vite build` (renderer + main/preload).
- **No existen lint ni tests automatizados** hoy. `[pending: Carlos decide si se agregan — owner: Carlos]`.
  Mientras tanto, "verde" en lógica de negocio (inventario, cobros, FKs) exige además una prueba
  manual con `npm run dev` sobre una BD de prueba, **nunca** sobre una copia de la BD real de la
  cabina sin anonimizar.
- Para diagnosticar con datos reales: pedir a la usuaria un respaldo, abrirlo localmente fuera del
  repo, consultas de solo lectura, y reportar en `.notes/` solo conteos y códigos (CL-0001), jamás
  nombres, teléfonos ni notas.

### Marco legal relevante (investigación del arranque, 2026-11-03 — no es asesoría legal)

- **LFPDPPP 2025** — datos de salud = sensibles → consentimiento expreso y por escrito + aviso de
  privacidad que los identifique. Cualquier feature de fotos de tratamiento o notas clínicas entra
  por Gate 001 y requiere el flujo de consentimiento. `[pending: validar con abogado — owner: Carlos]`
  **Riesgo aceptado por el dueño (2026-11-05), solo para la ficha clínica facial** (spec
  `.notes/spec-ficha-clinica-2026-11-05.md`, Gate 001 condición 1, opción a): la ficha no lleva
  flujo ni registro de consentimiento en la app; Carlos considera el consentimiento implícito
  porque la clienta entrega sus datos. Es una excepción acotada a esa feature, no un cambio de la
  regla: cualquier otra feature con datos sensibles sigue requiriendo el flujo de consentimiento.
  Mitigación: la ficha se puede borrar (ficha, versiones y fotos) a petición de la clienta.
- **CFF art. 30** — conservar documentación contable 5 años → no borrar pagos/ventas/cortes.
  `[pending: confirmar con contador si la cabina factura y qué registros cuentan — owner: Carlos]`
- **NOM-004-SSA3-2012 (expediente clínico)** — aplica a establecimientos de atención médica; si la
  cosmiatría que se ofrece incluye procedimientos considerados atención médica, el historial de
  clienta podría tener que conservarse ≥5 años. `[pending: confirmar con COFEPRIS/autoridad estatal — owner: Carlos]`

### Adopción del guard de notas

`.notes/` nace vacío en este arranque: no hay notas heredadas, así que el job `notes-pii` queda
**armado** desde el primer push (camino i, sin hallazgos que remediar).

### Procedencia

Scaffold instalado desde Atlas core `c6e9944` (2026-11-03); el working tree de Atlas tenía un
cambio sin commitear en `.notes/atlas-log.md` (no afecta a los archivos de scaffold copiados).

## RETIRED

- **`electron-builder --publish always` desde CI** (v0.1.x) — subía cada archivo con su propia
  llamada a la API y, por carrera, creaba releases duplicados con el mismo tag. Reemplazado por
  compilar con `--publish never` y publicar los tres archivos en un solo paso atómico
  (`softprops/action-gh-release`). Reopen if: electron-builder garantiza publicación atómica.
- **`productos.unidad_medida` como texto libre** (v0.1.3) — reemplazado por el modelo
  presentación/contenido/modo de consumo; la columna se conserva solo para no perder datos viejos.
  Reopen if: nunca; se puede eliminar en una migración auditada cuando ya no haya datos legados.
