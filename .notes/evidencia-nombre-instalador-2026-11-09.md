# Evidencia para auditoría — Nombre del instalador y barrera de release (2026-11-09)

**Responde a:** [auditoria-nombre-instalador-2026-11-09.md](auditoria-nombre-instalador-2026-11-09.md)
(REL-M1, REL-B1…B3; veredicto APROBADO CON CONDICIONES, C0 / A0 / M1 / B3).

**Responsable:** sesión de Claude Code del 2026-11-09. Los comandos de git y `gh` que modifican algo los corre el dueño.

**PII:** ninguna. Solo se hicieron lecturas públicas del release y simulaciones en el scratchpad.

## Incidente y mitigación (contexto)

- **Síntoma.** La cabina, en v0.1.4, se quedó unos 20 min en "Descargando actualización 0.2.0…".
- **Causa:**
  - `latest.yml` de v0.2.0 anunciaba `Bellora-Dashboard-Setup-0.2.0.exe`, y esa URL devolvía **404**.
  - El asset publicado se llamaba `Bellora.Dashboard.Setup.0.2.0.exe`. GitHub convierte los espacios del nombre local en puntos.
  - La versión instalada no muestra los errores del updater (ACT-M3 / SEG-B3), por eso el aviso no cambiaba.
- **Integridad.** El sha512 del asset coincide con `latest.yml` (`NPDM0Er…jMkA==`, 119 939 237 bytes).
- **Mitigación.** El dueño renombró los dos assets de v0.2.0 (`.exe` y `.blockmap`) con `gh api -X PATCH …/releases/assets/<id> -f name=…`. Después, `curl -I -L` a la URL con guiones dio **200**.

## RESPUESTAS a los hallazgos

1. **Condición del veredicto: el `path` de `latest.yml` debe coincidir con el archivo en `release/`. CUMPLIDA con evidencia de función, no de compilación completa.**
   - La compilación local `electron-builder --win nsis` se quedó detenida tras imprimir la versión. Hubo dos intentos: 18 min y 1 min, sin crear la carpeta de salida. Se abortó.
   - En su lugar se evaluaron las funciones que deciden el nombre, cargando `app-builder-lib` 26.15.3 del repo:

     ```text
     archivo en disco: Bellora-Dashboard-Setup-0.2.1.exe
     safeArtifactName nuevo -> null
     safeArtifactName viejo -> Bellora-Dashboard-Setup-0.2.0.exe
     ```

   - Con `null`, `updateInfoBuilder.js:134` usa `path.basename(event.file)` como `url`/`path`, y eso es igual al archivo en disco. El caso viejo reproduce el incidente: el archivo con espacios contra `latest.yml` con guiones.
   - **La comprobación real** la hace la barrera REL-M1 en CI, antes de publicar (punto 2).
2. **REL-M1 — Barrera en el workflow. CORREGIDO** con el paso que propone la auditoría (§6), sin cambios, en `build-windows.yml` entre "Compilar" y "Publicar release", solo en tags.
   - YAML válido (`js-yaml`). Orden de pasos: `… Compilar | Compilar sin publicar | upload-artifact | Verificar latest.yml… | Publicar release`.
   - No hay `pwsh` en la máquina de desarrollo. La lógica se simuló con las mismas expresiones regulares en Python:

     ```text
     --- v0.2.0 (incidente):
     FALLA latest.yml apunta a release/Bellora-Dashboard-Setup-0.2.0.exe pero no existe
     --- v0.2.1 (con fix):
     OK: Bellora-Dashboard-Setup-0.2.1.exe y su .blockmap existen; tag v0.2.1 = v0.2.1
     --- tag distinto a package.json:
     FALLA tag v0.2.2 != v0.2.1
     ```

   - Si el paso de PowerShell fallara por sintaxis, se bloquea la publicación: el release no sale, pero nada queda roto. Se corrige y se vuelve a etiquetar.
3. **REL-B1 — Regla no documentada. PARCIAL.** El comentario del paso en el workflow explica el incidente y la regla. La línea en PROJECT.md → RETIRED queda para el dueño, porque PROJECT.md lo edita él.
4. **REL-B2 — v0.1.4 siempre hace descarga completa. ACEPTADO.** Es información operativa: v0.1.4 no tiene `.blockmap`, y el fallback a la descarga completa es silencioso por diseño.
5. **REL-B3 — Tag vs `package.json`. CORREGIDO** en la última línea del mismo paso (simulación arriba).

## E2E — PENDIENTE (al etiquetar v0.2.1)

1. En el run del tag, el paso "Verificar latest.yml…" imprime `OK: Bellora-Dashboard-Setup-0.2.1.exe …`.
2. Los assets del release se llaman `Bellora-Dashboard-Setup-0.2.1.exe` y `….exe.blockmap`, y la URL de `latest.yml` responde 200.

## Verificación de contrato

`npm run typecheck` y `npm run build`: verdes.

## Estado del working tree

Modificados: `package.json` (`nsis.artifactName`, versión 0.2.1) y `.github/workflows/build-windows.yml` (paso de verificación). Nuevos: la auditoría y esta evidencia.
