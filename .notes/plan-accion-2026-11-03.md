# Action plan — Arranque Atlas: auditoría general + peticiones de la cabina
### 2026-11-03 · Arranque de Atlas + 3 auditorías + 3 peticiones de la usuaria

> **Why this document exists:** es el primer plan del proyecto bajo Atlas. Consolida tres
> auditorías independientes del mismo día:
> [integridad de datos](auditoria-integridad-datos-2026-11-03.md) (`DAT-`),
> [dinero](auditoria-dinero-2026-11-03.md) (`DIN-`) y
> [seguridad, PII y releases](auditoria-seguridad-pii-releases-2026-11-03.md) (`SEG-`), más tres
> peticiones de la usuaria: **(R1)** reagendar una cita, **(R2)** eliminar un producto o una salida
> de productos (error `SqliteError: FOREIGN KEY constraint failed`), **(R3)** anotar dos métodos
> de pago. Los códigos tienen prefijo porque las tres auditorías corrieron en paralelo; nunca se
> renumeran. No reemplaza a ningún documento anterior.

---

## Peticiones de la usuaria — diagnóstico

| Petición | Diagnóstico | Tipo | Hallazgo |
|---|---|---|---|
| **R1** Reagendar cita | El backend existe y está expuesto (`citas.ts:112` `actualizarCita`, `ipc/index.ts:236`, `preload.ts:84`), pero **ninguna pantalla llama** `window.api.citas.actualizar` (grep en `src/` vacío). `Citas.tsx:54` promete "reagendar". | Feature sin cablear | — (diagnóstico propio, no es superficie crítica) |
| **R2a** Eliminar producto → error FK | `errores.ts:12-14` solo reconoce `SQLITE_CONSTRAINT_FOREIGNKEY`; `ON DELETE RESTRICT` (todas las FKs de historial) produce `SQLITE_CONSTRAINT_TRIGGER` → el error crudo cruza IPC y el diálogo "Desactivar en su lugar" nunca aparece. Afecta productos, lotes, clientas, tipos y servicios. | **Bug** | DAT-A1 (+ DAT-B1, DAT-B8) |
| **R2b** Eliminar salida | No existe ningún camino para cancelar o revertir salidas ni entradas. Una salida tipo `venta` es registro de dinero (CFF art. 30): se **cancela/revierte**, no se borra. | Diseño faltante | DAT-A2, DIN-A4 |
| **R3** Dos métodos de pago | **Hoy no se puede.** La tabla `pagos` ya admite N filas por servicio y corte/reportes ya suman por método, pero el cierre captura un solo `metodoPago`/`monto` (`shared/schemas.ts:148-149`, `CierreCitaModal.tsx:68-69`), inserta un solo pago (`serviciosRealizados.ts:241-251`) y no hay flujo de abono posterior. No requiere migración. | Feature faltante | DIN-A1 (+ DIN-A2, DIN-M2) |

Nota sobre R2a: **un producto con historial no se puede borrar físicamente, y es correcto**
(perdería la trazabilidad de compras/ventas). Lo que falla es el mensaje. Tras el fix aparecerá
"No se puede eliminar → Desactivar en su lugar", que lo saca de listas y búsquedas.

---

## Verified state as of 2026-11-03

| Finding | Status | Evidence |
|---|---|---|
| SEG-C1 — "PAT" en blob colgante | ✅ Closed — **falso positivo** | Es el secreto falso de la prueba del hook pre-commit del propio arranque (`git add` + `git rm --cached`). Blob `fbca69d`: mtime 2026-11-03 12:22:55 (mismo minuto que la prueba), 51 bytes (= "scanned ~51 bytes" de gitleaks), cuerpo `token = "ghp_" + 36 aleatorios`. No es un token real; nada que revocar. Limpieza opcional: `git prune`. |
| DAT-A1 — FK no reconocida | 🟢 Almost (falta clic E2E en UI) | `electron/services/errores.ts:12-14` (verificado en el main thread) |
| DAT-C1 — respaldo previo a "Borrar datos" se poda | 🟢 Almost (falta E2E en UI) | `respaldos.ts:17,22,113-135` (prefijo `cabina_auto_` → entra a la poda de 3); `reinicio.ts:52`; `Respaldos.tsx:282-283` promete "siempre podrás restaurarlo" (verificado en el main thread) |
| Llaves privadas / registro de clientas de licencias | ✅ Nunca versionados | `git log --all` vacío para `keys/licencia-privada.pem` y `keys/clientes-licencias.json`; gitleaks de historial completo limpio |
| Frontera Electron | ✅ Sólida | contextIsolation + sandbox + CSP + zod + `rutaDentroDe` (auditoría SEG, resumen ejecutivo) |
| Transacciones de stock y de cierre | ✅ Sólidas | auditorías DAT y DIN, resumen ejecutivo |

---

## Phase 0 — HOY · Contener lo irreversible (Carlos + Claude, ~2 h)

Por qué primero: son las únicas cosas que pueden destruir datos o dinero sin aviso, y el fix de
DAT-A1 resuelve el reporte de la usuaria en cinco pantallas a la vez (la de mayor palanca del tablero).

1. [x] **DAT-A1 + DAT-B1 + DAT-B8** (evidencia: [evidencia-fase0-integridad-2026-11-03.md](evidencia-fase0-integridad-2026-11-03.md); falta clic E2E en UI) — `esErrorForeignKey` acepta también `SQLITE_CONSTRAINT_TRIGGER`
       cuando el mensaje es `FOREIGN KEY constraint failed`; `mensajeDeError` quita los prefijos
       `SqliteError:`/`ErrorConHistorial:`; el mensaje de producto menciona las recetas de servicio.
       `electron/services/errores.ts`, `src/lib/errores.ts`, `productos.ts:119`. *No es superficie crítica.* (Claude)
2. [x] **DAT-C1** (misma evidencia; la poda ahora solo toca `cabina_auto_diario_`; falta E2E en UI) — el respaldo previo a "Borrar datos de negocio"/"Restablecer" usa un prefijo propio
       que la poda nunca toca (o se crea como manual). `respaldos.ts` es **superficie crítica** →
       la auditoría DAT ya existe; cerrar con `/evidencia`. (Claude)
3. [x] **DAT-A4** (misma evidencia; E2E bajo Electron cerrado) — respaldo automático antes de `migrate()` **solo si hay migraciones pendientes**;
       obligatorio antes de publicar cualquier release que traiga una migración (R2b lo hará).
       `electron/db/index.ts` = superficie crítica → misma auditoría + evidencia. (Claude)
4. [ ] **SEG-A3 / SEG-C2 (parte barata)** — en GitHub: confirmar 2FA (passkey/llave) en la cuenta;
       ruleset sobre `main` (PR + checks `CI` y `Atlas guard` requeridos) y sobre tags `v*` (solo el
       owner crea/borra). (Carlos, UI de GitHub, ~20 min)
5. [ ] **SEG-C3 (contención legal)** — imprimir aviso de privacidad + consentimiento expreso por
       escrito para datos de salud y recabarlo en papel con cada clienta mientras se decide la
       captura en la app. (Carlos; validar texto con abogado)

**Closing verification:** en `npm run dev` con BD de prueba: borrar un producto con entradas →
aparece "Desactivar en su lugar" y funciona; "Borrar datos de negocio" + 4 respaldos automáticos
→ el respaldo de seguridad sigue en la lista; `npm run typecheck` y `npm run build` verdes;
`gh api repos/CarloEsqui/cabinacosmei/rulesets` lista los dos rulesets.

---

## Phase 1 — ESTA SEMANA · Peticiones de la usuaria (Claude implementa, Carlos decide y commitea, ~1–2 días)

1. [x] **R1 Reagendar** — cablear `citas.actualizar` en `CitaDetalleModal` (botón "Reagendar" que
       reutiliza `NuevaCitaModal` en modo edición). Sin migración, sin superficie crítica, sin Gate.
       **Decidido (Carlos, 2026-11-03):** se mueve la misma cita (bitácora guarda "fecha vieja → nueva");
       solo citas programadas/confirmadas, bloqueado en el servidor para cerradas. Botón en el
       detalle del Calendario y en la Lista. Si cambia fecha u hora, una cita confirmada vuelve a
       programada. *E2E en UI pendiente (Carlos).*
   1b. [x] **Estados de cita sin uso** (hallado al implementar R1): "No asistió", "Confirmada" y
       "Reagendada" no se asignaban en ningún lado, así que los KPIs No-show y Reagendadas marcaban 0.
       **Decidido (Carlos):** botones "Confirmar" (programadas) y "No asistió" (solo si la hora ya
       pasó) en detalle y Lista; el KPI "Reagendadas" cuenta `cita_reagendada` de la bitácora.
       `cambiarEstadoCita` ahora rechaza cambios en citas cerradas o inactivas y nunca pone
       "asistio" (eso solo lo hace el cierre). Prueba del servidor bajo el SQLite de Electron con BD de
       prueba: 8/8 casos esperados (no-show futuro rechazado, confirmada→programada al mover,
       no asistida no se reagenda ni cancela, KPI reagendadas = 1).
2. [ ] **R3 Dos métodos de pago (DIN-A1)** — `pagos: [{metodoPago, monto}]` en el esquema de cierre,
       lista de filas en el modal, un `registrarPago` por fila **dentro de la transacción existente**,
       `estatusPago` derivado en el servidor de la suma (cierra DIN-A2 en el cierre) y el chequeo
       "ya cerrada" movido dentro de la transacción (DIN-M2). Sin migración. **Superficie crítica
       (dinero):** auditoría DIN existe → `/evidencia` antes de integrar.
       **Decisión de Carlos:** ¿hace falta también "registrar abono" después del cierre (clienta que
       paga el resto otro día)? Recomendado: sí, en la misma entrega, porque hoy un saldo pendiente
       no se puede cobrar nunca.
2b. [ ] **Ciclo de vida de la cita** — auditoría [auditoria-citas-2026-11-03.md](auditoria-citas-2026-11-03.md)
       (CIT-C1, A1–A2, M1–M3, B1–B4), pedida por Carlos tras probar la app.
       - [x] **CIT-A1** (regresión de R1, nunca publicada) corregida antes de commitear R1; evidencia
         [evidencia-cit-a1-2026-11-04.md](evidencia-cit-a1-2026-11-04.md).
       **Decisiones de Carlos (2026-11-04):**
       - **A → quitar "cancelado" del cierre (CIT-A2, cierra DIN-B3).** El cierre solo registra
         servicios que ocurrieron; la cita que no ocurrió se cancela o se marca no asistió desde la
         agenda. SC Dinero: va junto con R3 (mismo esquema y modal).
       - **B → "Eliminar cita" + "Deshacer cancelación" (CIT-M1).** Eliminar solo si no hay servicio
         cerrado, pagos ni salidas (chequeo en la misma transacción, bitácora `cita_eliminada` con
         código de clienta, nunca nombre); deshacer: cancelada → programada. Cancelar y No asistió
         piden confirmación; Cancelar también en el detalle del Calendario.
       - **C → solo la reversa completa (CIT-C1).** Sin "Reabrir" barato: "Cancelar servicio
         cerrado" (pagos, salidas, cita y mantenimiento en una transacción) entra al **Gate 001**
         de R2b/DIN-A4 (ítem 3) como requisito añadido.
       - **D → se permite cerrar citas futuras; el pago lleva la fecha del día en que se cobra
         (CIT-M3, resuelve el "Cobrado hoy" de DIN-M1).** Aplica también a cierres tardíos y a los
         abonos de R3. Consumos y mantenimiento siguen con la fecha de la cita. SC Dinero: va con R3.
       - [x] **CIT-M1** (Decisión B) y **CIT-M2** implementados; evidencia
         [evidencia-cit-m1-m2-2026-11-04.md](evidencia-cit-m1-m2-2026-11-04.md). "Reactivar" cubre
         también "No asistió". *E2E en UI pendiente (Carlos).*
       - [ ] **A + D** van con R3 (ítem 2). [ ] **C** va al Gate 001 del ítem 3.
         Backlog: CIT-B1–B4.
3. [ ] **R2b Cancelar salidas/entradas (DAT-A2, DIN-A4)** — **Gate 001 primero** (cambio de BD
       significativo + dinero): diseño de cancelación/reversa (estado `cancelada` + motivo + fecha,
       devolver `cantidadDisponible` al lote, movimiento inverso, bitácora; ventas y pagos se
       cancelan, nunca se borran). Implementar solo con veredicto PASS, después de DAT-A4.
4. [ ] **DAT-M3 + SEG-M2 (un fix cierra dos)** — normalizar rutas del zip al restaurar (zip slip) y
       validar cabecera/`integrity_check` del `.sqlite3` antes de sobrescribir (DAT-A3).
5. [ ] **SEG-A1** — en producción: sin DevTools ni menú de desarrollo; reintentos de PIN con espera
       creciente; IPC de datos rechaza llamadas antes del desbloqueo.
6. [ ] **SEG-M3, SEG-B1** — `carpetaRaiz` pide PIN y no acepta raíces de disco; `openExternal` solo
       `https:`/`http:`/`mailto:`.
7. [ ] **SEG-M6** — agregar la frontera Electron (`electron/main.ts`, `preload.ts`, `ipc/index.ts`,
       `services/auth.ts`) a `critical_surfaces`, `sensitive_globs` y CODEOWNERS en el mismo PR.
8. [ ] **SEG-A3 (pipeline)** — acciones fijadas por SHA; `contents: write` solo en el paso de publicar.

**Closing verification:** demo con BD de prueba: reagendar una cita y verla movida en
Calendario/Lista; cerrar una cita con efectivo + tarjeta y ver el corte con ambos métodos y el
total correcto; cancelar una salida y ver el stock devuelto y el movimiento inverso; evidencias
publicadas para DAT y DIN; verificación verde; CI verde en el PR.

---

## Phase 2 — ESTE MES · Calidad de números, legal y deuda (Carlos decide, Claude implementa)

- [ ] **DIN-A3 + DAT-M6 (un fix cierra dos)** — escribir `servicios_productos_consumidos` al consumir
      en un servicio, para que el margen deje de ser 100 % ficticio.
- [ ] **DIN-A5** — la venta de producto en el cierre usa `precio_venta` y suma al ingreso.
- [ ] **DIN-M1 / DIN-M3 / DIN-M4** — una sola base de tiempo para "cobrado hoy"/corte; dinero redondeado
      a centavos (idealmente enteros en centavos, con migración y Gate); corte reproducible (liga pago↔corte).
- [ ] **DAT-M1, DAT-M2, DAT-M4, DAT-M5, DAT-B3, DAT-B6** — reinicio en transacción y sin vaciar
      bitácora; redondeo de fracciones de pieza; regla de migraciones que reconstruyen tablas; bitácora de restauración.
- [ ] **SEG-M5 (ARCO)** — borrar una clienta borra/anonimiza su carpeta y su nombre en bitácora.
- [ ] **SEG-M1** — quitar del repo público la liga nombre de la operadora ↔ UUID (`scripts/seed-demo.mjs`).
- [ ] **SEG-B2, SEG-B3, DIN-B2, DIN-B3** — residuos RETIRED (`unidad_medida` aún se escribe), canal de errores del updater, campos de pago sin uso, `cancelado` con monto.
- [ ] **Fotos de avance del tratamiento** (idea de Carlos) — **Gate 001 + flujo de consentimiento
      LFPDPPP primero** (dato sensible); nunca antes de SEG-C3.
- [ ] **Verificación** — decidir si se agregan lint y pruebas automatizadas (`[pending]` en PROJECT.md). (Carlos)
- [ ] **Legal** — confirmar con abogado (LFPDPPP), contador (qué registros cuentan para CFF art. 30) y
      COFEPRIS/autoridad estatal (si aplica NOM-004). (Carlos) Decide también DIN-B1 (¿se permite
      seguir borrando pagos con "Borrar datos de negocio"?).

**Closing verification:** reporte de Servicios muestra costo de insumos > 0 en un servicio con
consumo; evidencias de cierre de cada auditoría con todos sus C/A respondidos.

---

## What NOT to chase (anti-list)

| Hallazgo | Por qué no ahora | Reopen if |
|---|---|---|
| SEG-C2 — certificado de firma de código (~USD 200–400/año) | Una sola instalación; con 2FA + rulesets (Phase 0) la cuenta deja de ser un ancla débil | Una segunda instalación, o cualquier señal de acceso no reconocido a la cuenta |
| SEG-A2 — cifrar SQLite (SQLCipher) y respaldos | Cambio nativo pesado y arriesgado para una instalación; cifrado de disco del SO (BitLocker/FileVault) cubre el robo de laptop por casi cero costo → **acción: activarlo en la máquina de la cabina** (Carlos) | Respaldos que salen de la máquina (nube/USB compartida) o un incidente |
| SEG-M4 — licencia evadible | La única usuaria es de confianza; endurecerlo no protege datos | Venta a cabinas desconocidas |
| DAT-B5 — `when` del journal escritos a mano | Funciona por monotonía; queda como regla: el journal solo lo escribe `db:generate` | Un `when` fuera de orden |
| DAT-B2, DAT-B7 — reactivar lote agotado / "eliminar lote" imposible | Latentes, la UI no los expone de forma dañina; DAT-A1 ya hace que "eliminar lote" ofrezca bloquear | La UI expone re-entrada a lote existente |

---

### Stored checklist — si algún día hay más de una instalación
(Keep, do not execute now.)
- Certificado de firma de código y `publisherName` en `package.json` (SEG-C2).
- `APPLIED-MIGRATIONS.md` con una fila por instalación y verificación por respaldo.
- Releases escalonados: probar el instalador en una máquina antes de etiquetar.

---

**Golden rules this plan leaves behind:**
- El dinero y el inventario con historial **se cancelan o se desactivan; no se borran**.
- Un respaldo de seguridad existe solo si la poda no lo puede tocar y si ya se restauró una vez.
- Ninguna migración sale en un release sin respaldo previo a `migrate()` (DAT-A4).
- Datos de salud o fotos: primero consentimiento, luego feature.
