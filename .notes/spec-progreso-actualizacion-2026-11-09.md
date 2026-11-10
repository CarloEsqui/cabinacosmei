# Spec — Barra de progreso de la actualización automática

Fecha: 2026-11-09 · Rama sugerida: `atlas/progreso-actualizacion` · Superficie crítica: "Licencias y pipeline de releases/auto-update" (`electron/services/actualizaciones.ts`)

## 1. Problema

En la cabina reportan que, mientras se actualiza, no se sabe cuánto falta y la espera se hace tediosa. El aviso actual solo dice "Descargando actualización X…", sin avance, y el instalador pesa unos 115 MB. Además:

- `actualizaciones:error` ya se emite desde el proceso principal, pero el preload no lo expone.
- Si la descarga falla (por ejemplo, se cae el internet), el aviso se queda en "Descargando…" para siempre.

## 2. Alcance

1. **Proceso principal.** Reenviar el evento `download-progress` de electron-updater al renderer como `actualizaciones:progreso`, con:
   - `porcentaje`
   - `transferido`
   - `total`
   - `bytesPorSegundo`

   electron-updater solo calcula el progreso si el listener ya existe cuando arranca la descarga (`NsisUpdater` revisa `listenerCount(DOWNLOAD_PROGRESS)`). Lo registramos en `inicializarActualizaciones`, que corre antes de `checkForUpdates`. El evento llega a lo más una vez por segundo (`ProgressCallbackTransform`). La descarga diferencial con blockmap también lo emite.
2. **Preload / contrato.** Agregar `onProgreso` y `onError`, con el mismo patrón de suscripción y desuscripción que `onDisponible` y `onDescargada`.
3. **Banner (`ActualizacionBanner.tsx`).** Tiene cuatro estados:
   - **Preparando:** franja tenue indeterminada, hasta que llega el primer progreso.
   - **Descargando:** barra, `N %`, "X de Y MB" y "quedan ~Z min". El tiempo restante se calcula como (total − transferido) / bytesPorSegundo. El porcentaje usa `floor` con tope en 99, para no mostrar 100 % antes de `update-downloaded`. También dice "puedes seguir trabajando".
   - **Lista:** botón "Reiniciar e instalar", que antes ya existía, más una explicación de lo que pasa al reiniciar. *(Texto reemplazado en §2b: el instalador asistido no se reabre solo.)*
   - **Error durante la descarga:** aviso de que se reintentará la próxima vez que se abra la app. Solo pasa de *descargando* a *error*. Un error sin descarga en curso (por ejemplo, sin internet al revisar) no muestra nada, igual que hoy.

## 2b. Ajustes tras la auditoría (2026-11-09)

Ver [auditoría](auditoria-progreso-actualizacion-2026-11-09.md) y [evidencia](evidencia-progreso-actualizacion-2026-11-09.md).

- **Estado único en el proceso principal (ACT-M1, Decision B del dueño).** Esto reemplaza los puntos 1 y 2 de §2: ya no hay eventos sueltos `disponible`/`progreso`/`descargada`/`error`.
  - El main guarda `EstadoActualizacion` y lo envía completo por `actualizaciones:cambio`.
  - El aviso lo consulta al montarse con `actualizaciones:estado`, que es de solo lectura. Así se ve aunque la descarga haya empezado durante el PIN.
- **Texto de "lista" (ACT-M2, Decision A-i del dueño).** Se reemplaza "vuelve a abrirse sola" por "Al reiniciar se abre el instalador: sigue sus pasos y al final pulsa Terminar para que la app vuelva a abrirse". No se cambia a instalación silenciosa.
- **Error en la instalación (ACT-M3).** Aviso propio, que pide cerrar y reabrir la app.
- **Errores de búsqueda (ACT-B3).** Se ignoran y no interrumpen una descarga en curso.
- **Payload de error (ACT-B4).** Solo lleva `codigo` y `fase`; no lleva el mensaje crudo.

## 3. Fuera de alcance

- **Progreso de la fase de instalación.** Esa ventana la dibuja el instalador NSIS (`oneClick: false`, `quitAndInstall()` no silencioso), no la app.
- **Cambios a `autoDownload`, `autoInstallOnAppQuit`, al flujo de `quitAndInstall` o a la configuración de electron-builder.** No se toca nada de cómo se descarga, verifica o instala.

## 4. Gate 001

No se dispara. No hay módulo nuevo, dependencia, cambio de BD ni de fronteras. Solo se agregan, sobre el servicio existente, un canal de estado y una consulta de solo lectura (§2b). Es reversible y no cambia cómo se descarga o instala.

## 5. Limitación conocida

La barra aparece desde la actualización *siguiente* a la versión que la incluya. La versión que la trae se descarga con el banner viejo, porque el banner que ve la cabina es el de la versión instalada.

## 6. Verificación

- `npm run typecheck` y `npm run build`.
- Vista previa renderizada de los cuatro estados con eventos simulados.
- El progreso real solo se puede observar en Windows con una descarga real (próximo release).
- **Ruta diferencial (ACT-B5).** Si el updater baja solo los bloques que cambiaron, el total mostrado ("X de Y MB") es lo que falta por bajar, no los ~115 MB del instalador. Es correcto.
