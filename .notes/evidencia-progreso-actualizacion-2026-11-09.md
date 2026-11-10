# Evidencia para auditoría — Barra de progreso de la actualización (2026-11-09)

**Responde a:** [auditoria-progreso-actualizacion-2026-11-09.md](auditoria-progreso-actualizacion-2026-11-09.md)
(ACT-M1…M3, ACT-B1…B6; veredicto APROBADO CON CONDICIONES, C0 / A0 / M3 / B6). Diseño:
[spec-progreso-actualizacion-2026-11-09.md](spec-progreso-actualizacion-2026-11-09.md).

**Responsable:** sesión de Claude Code del 2026-11-09. Los comandos de git los corre el dueño.

**Método y PII:**
- El servicio real `electron/services/actualizaciones.ts` se empaquetó con esbuild contra un `autoUpdater` falso (un `EventEmitter`) y una ventana falsa que registra lo que se envía y puede "destruirse". Se dispararon las secuencias de eventos de cada escenario de la auditoría (§4).
- El aviso se renderizó en Electron sin ventana visible, con `window.api` simulado, en siete estados.
- No se abrió ninguna base de datos. No hay datos personales en este documento. La ruta con nombre de usuario de la prueba ACT-B4 es ficticia.

## Decisiones del dueño (2026-11-09)

- **Decision A (ACT-M2):** (i) corregir el texto. No se cambia a instalación silenciosa.
- **Decision B (ACT-M1):** se acepta la consulta de solo lectura `actualizaciones:estado`.

## RESPUESTAS a los hallazgos

1. **ACT-M1 — Eventos perdidos antes de que el aviso exista. CORREGIDO.**
   - El estado vive en el proceso principal (`let estado` en `actualizaciones.ts`), y cada listener lo actualiza a través de `cambiar()`.
   - El renderer recibe el estado completo por un solo canal, `actualizaciones:cambio`, y al montarse lo consulta con `actualizaciones:estado`. Esto va más allá de lo que proponía la auditoría: en lugar de cuatro eventos sueltos más una consulta, la máquina de estados vive en un solo lugar y el aviso solo la refleja. Se quitaron `onDisponible`/`onDescargada`; el aviso era su único consumidor (`grep` sin otros usos).
   - Para la carrera entre la suscripción y la consulta, el aviso se suscribe primero. Si llega un cambio antes de que responda la consulta, la respuesta se descarta.
   - Prueba: "S1 montaje tardío: estado guardado con progreso" ✔. En el render, el caso `montaje-tardio` muestra 43 % sin eventos, y el caso `evento` muestra que el cambio gana sobre la consulta (87 %).
2. **ACT-M2 — Texto inexacto. CORREGIDO (Decision A-i).**
   - El texto nuevo es: "Al reiniciar se abre el instalador: sigue sus pasos y al final pulsa **Terminar** para que la app vuelva a abrirse."
   - No nombra el botón intermedio. La página "¿para quién instalar?" precede a la de carpeta, que se salta al actualizar, así que su botón puede decir "Siguiente" o "Instalar".
   - El instalador es multilenguaje: `nsisLang.js:16-26` usa todos los idiomas incluidos si `installerLanguages` no está definido, y el `package.json` no lo define. "Terminar" es el texto en español de Windows. Queda pendiente confirmarlo en la cabina (E2E).
3. **ACT-M3 — Error en la fase de instalación mudo. CORREGIDO.** Un `error` con el estado en `descargada` pasa a `{tipo:"error", fase:"instalacion"}`, con el texto "No se pudo iniciar la instalación… Cierra la app y vuelve a abrirla para intentarlo de nuevo." Prueba: "S7 error en instalación" ✔.
4. **ACT-B1 — Sin guarda `isDestroyed`. CORREGIDO.**
   - `cambiar()` guarda el estado y solo envía si la ventana existe y no está destruida.
   - `inicializarActualizaciones` limpia la referencia en `closed`.
   - Prueba: "S11 ventana destruida: no lanza y guarda estado" ✔. "ventana recreada recibe cambios" ✔, con un solo listener de progreso.
5. **ACT-B2 — Sin guarda de finitud. CORREGIDO.**
   - Un `porcentaje` no finito se trata como "Preparando…".
   - El porcentaje se acota entre 0 y 99.
   - `tiempoRestante` devuelve `null` ante `NaN` o `Infinity`; las comparaciones están negadas para que `NaN` no pase.
   - Render: el caso `nan` muestra "Preparando…".
6. **ACT-B3 — Búsqueda manual durante la descarga. CORREGIDO.**
   - Los errores que electron-updater marca con `"Cannot check for updates"` (`AppUpdater.js:271`) no cambian el estado.
   - Un `update-available` de la misma versión con una descarga en curso no reinicia la barra.
   - Pruebas: S9 ✔ y S10 ✔.
7. **ACT-B4 — Payload de error crudo. CORREGIDO.** Se envía solo `codigo` (`error.code`, p. ej. `ERR_CHECKSUM_MISMATCH`) y `fase`, nunca `error.message`. Prueba: "B4 no se envía error.message" ✔. El error simulado contenía una ruta con un nombre de usuario ficticio, y esa ruta no aparece en lo enviado. El aviso todavía no distingue códigos; queda disponible para cuando se cierre SEG-C2 (SEG-B3).
8. **ACT-B5 — Total en la ruta diferencial. DOCUMENTADO** en spec §6.
9. **ACT-B6 — Rechazo no manejado de `downloadPromise`. FUERA DE ESTE CAMBIO.** Es preexistente y no lo introduce este PR. Queda como verificación pendiente §6.4 de la auditoría.

## Prueba de la máquina de estados (salida literal)

```text
OK   listeners una sola vez
OK   S0 estado inicial null
OK   búsqueda fallida sin descarga → null
OK   progreso sin disponible se ignora
OK   S1 montaje tardío: estado guardado con progreso
OK   S10 búsqueda manual misma versión no reinicia barra
OK   S9 búsqueda manual fallida no marca error
OK   S4/S5 error de descarga
OK   B4 no se envía error.message
OK   descargada
OK   progreso tardío tras descargada se ignora
OK   S7 error en instalación
OK   cada cambio se envía por actualizaciones:cambio
OK   S11 ventana destruida: no lanza y guarda estado
OK   ventana recreada recibe cambios
todas pasan
```

La primera corrida marcó 1 falla en "cada cambio se envía…". La causa estaba en la prueba, no en el código: se esperaban 8 envíos, pero S9 y S10 no deben enviar nada (correcto), así que son 6. Se corrigió la expectativa y se repitió la corrida.

## Render (siete estados)

Se revisaron capturas de `preparando`, `montaje-tardio`, `evento`, `nan`, `descargada`, `error-descarga` y `error-instalacion`. Las capturas están en el scratchpad de la sesión y no se suben al repo.

## E2E — PENDIENTE (requiere Windows y un release real)

1. **ACT-M1 en la cabina.** Con el release que incluya este cambio *y* el siguiente: abrir la app, tardar ≥ 5 s en el PIN y desbloquear. Esperado: aviso "Descargando" con barra.
2. **ACT-M2.** Pulsar "Reiniciar e instalar". Esperado: el asistente en español, con la página final y el botón "Terminar"; la app se abre al pulsarlo.
3. Anotar la hora de "Descargando" y la de "lista" para tener el tiempo real de descarga en la cabina.

## Verificación de contrato

`npm run typecheck`: verde. `npm run build`: verde (renderer, main y preload).

## Estado del working tree

Seis archivos modificados, sin commitear: `electron/ipc/index.ts`, `electron/preload.ts`, `electron/services/actualizaciones.ts`, `shared/ipc-contract.ts`, `shared/types.ts` y `src/components/ActualizacionBanner.tsx`. A eso se suman las tres notas de `.notes/` (spec, auditoría y esta evidencia).
