# Atlas log — Bellora Dashboard (Dashboard-Cabinacosmei)

Append-only. One entry per working session, written by the closure ritual.
Newest entry last. Never rewrite history; correct with a later annotation.

---

## [2026-11-04] · atlas/arranque → main (PR #1), atlas/fase1 · Desde 2026-11-03: Arranque Atlas, Fase 0 y Fase 1 (citas, inventario, diseño del cobro)

- **Gates/audits run:**
  - **Auditorías del arranque** (agente auditor):
    - integridad de datos → [auditoria-integridad-datos-2026-11-03.md](auditoria-integridad-datos-2026-11-03.md);
    - dinero → [auditoria-dinero-2026-11-03.md](auditoria-dinero-2026-11-03.md);
    - seguridad/PII/releases → [auditoria-seguridad-pii-releases-2026-11-03.md](auditoria-seguridad-pii-releases-2026-11-03.md).
  - **Auditoría del ciclo de vida de la cita** (agente auditor, pedida por Carlos tras prueba
    manual): NO funciona al 100 %, C=1 A=2 M=3 B=4 →
    [auditoria-citas-2026-11-03.md](auditoria-citas-2026-11-03.md). Detectó una regresión propia
    de esta sesión (CIT-A1) antes de commitearla.
  - **Gate 001 cobro v2 (A+B)** → PASS WITH CONDITIONS, 0 bloqueos, 16 condiciones →
    [gate-001-modulo-cobro-2026-11-04.md](gate-001-modulo-cobro-2026-11-04.md).
  - **Gate 001 cancelación de inventario** → PASS WITH CONDITIONS, 0 bloqueos, 10 condiciones →
    [gate-001-cancelacion-inventario-2026-11-04.md](gate-001-cancelacion-inventario-2026-11-04.md).
  - **Evidencias:**
    - [Fase 0 integridad](evidencia-fase0-integridad-2026-11-03.md) (DAT-A1/B1/B8/C1/A4);
    - [CIT-A1](evidencia-cit-a1-2026-11-04.md);
    - [CIT-M1/M2](evidencia-cit-m1-m2-2026-11-04.md);
    - [DAT-A5/M7/B7](evidencia-dat-a5-m7-b7-2026-11-04.md), con los hallazgos nuevos DAT-A5 y
      DAT-M7 como addendum de la serie DAT;
    - [cancelación de inventario](evidencia-cancelacion-inventario-2026-11-04.md) (las 10
      condiciones respondidas).
  - **Investigación** de tarjetas de regalo y cupones, con un prototipo SQL ejecutable que encontró
    un defecto de diseño en la regla del corte (BR-011) →
    [investigacion-giftcards-cupones-2026-11-04.md](investigacion-giftcards-cupones-2026-11-04.md),
    [prototipo-cobro-tarjetas-2026-11-04.sql](prototipo-cobro-tarjetas-2026-11-04.sql).
- **Contract:**
  - **Arranque:** PROJECT.md, CLAUDE.md, CODEOWNERS, APPLIED-MIGRATIONS.md, CI + atlas-guard,
    githooks (merge de PR #1, `da6a134`).
  - **Superficies críticas tocadas en atlas/fase1** (sin push):
    - Migraciones: `drizzle/0004_cancelacion_inventario.sql`, `schema.ts`;
    - Dinero: filtros `vigente` en `serviciosRealizados.ts` y `reportesFinanzas.ts`; selector de
      `CierreCitaModal.tsx`; `dashboard.ts`;
    - PII: etiquetas en `exportarCsv.ts`.
  - **Propuesto y pendiente del dueño:** `cobros.ts`, `tarjetasRegalo.ts` y `cupones.ts` en
    `sensitive_globs` (condición 7 del Gate del cobro) y la frontera Electron (SEG-M6).
  - **Candidatos a RETIRED:**
    - "motivo obligatorio para cancelar inventario" (Carlos lo descartó);
    - el botón "Eliminar lote" (nunca podía funcionar, DAT-B7) y el IPC `inventario:eliminarLote`,
      que quedó sin llamadores;
    - "cancelado" como estatus de pago en el cierre (Decisión A, se retira con el cobro v2).
- **Rule friction:**
  - **bottleneck → redesign.** La verificación `npm run build` no se puede correr en el sandbox de
    Claude Code: Vite se cuelga en "transforming". En la Mac de Carlos tardó 19 m 42 s; en CI,
    30 s. Toda evidencia de esta sesión dice "build: lo corre Carlos". El contrato exige una
    verificación que el agente no puede ejecutar. Hay que decidir si CI es la verificación de build
    del agente o investigar la lentitud local (hipótesis: proyecto en `~/Documents` sincronizado
    con iCloud).
  - **read but broken → automate.** El arranque usó un secreto falso para probar el hook de
    gitleaks y dejó un blob colgante que la auditoría de seguridad marcó como SEG-C1 (falso
    positivo). La prueba del arranque debería limpiar su blob (`git prune`) o usar un repo
    temporal.
  - **decoration candidate / automate.** validate-notes advierte "cita inexistente" en citas con
    varios rangos (`archivo:68-69,218-230`). Son warnings falsos en todas las auditorías; o el
    validador entiende rangos múltiples, o la plantilla los prohíbe.
  - **prevented something real.** La auditoría independiente de citas atrapó la regresión CIT-A1
    del propio agente antes del commit, y el prototipo de la Parte B atrapó el defecto del corte
    (reembolso del mismo día como −$1,000 en el corte siguiente) antes del Gate. El Gate de
    cancelación detectó que drizzle-kit 0.31 omite `ON DELETE` en `ADD COLUMN`.
- **Assumptions this session worked under:**
  - el `npm run build` de Carlos (2026-11-03) y el CI de PR #1 siguen siendo representativos:
    **6 commits de atlas/fase1 no tienen build verificado**;
  - drizzle-kit generate sí corre en el sandbox (lo hizo para la 0004; el Gate lo vio colgarse);
  - la BD local de desarrollo de Carlos contiene solo datos de prueba (`npm run dev` le aplicará la
    0004);
  - no existen hoy `pagos.estatus = cancelado` (A-003 del cobro, sin verificar en la BD real).
- **FAIL overrides:** none. Decisiones del dueño que contradicen recomendaciones, registradas:
  - crear cortesías y cupones sin PIN, con riesgo reescrito exigido por la condición 10 del Gate
    del cobro;
  - cancelar inventario sin PIN y sin motivo, en contra de la condición 7 del Gate de cancelación;
    el addendum del spec lo registra.
- **Outcome annotations:** primera entrada del ledger; nada previo que anotar.
- **Open items with owner:**
  - **build:** `npm run build` sobre atlas/fase1 · desde 2026-11-04 · Carlos (o CI del PR) · antes
    del PR.
  - **pruebas en UI:** E2E de reagendar, confirmar, eliminar y reactivar citas, dar de baja lotes y
    cancelar entradas o salidas · Carlos · antes del PR.
  - **contrato:** `PROJECT.md` `sensitive_globs` += `cobros.ts`, `tarjetasRegalo.ts`, `cupones.ts`
    · Carlos · antes de crearlos.
  - **cobro v2, Parte A:** implementación (migración **0005**: el addendum de numeración está en el
    spec) · Claude, próxima sesión. Antes del release, Carlos corre sobre un respaldo real la
    radiografía de la condición 3 del Gate del cobro.
  - **Q-001 contadora:** régimen fiscal, CFDI de tarjetas, vigencia de 12 meses, "no reembolsable"
    · Carlos · antes del release de la Parte B.
  - **decisiones de la Parte B:** condiciones 9 y 10 del Gate del cobro (venta de tarjeta a quien
    no es clienta; autorización de `alta_migracion` y `ajuste`) · Carlos.
  - **cerrar Phase 0:** ítems 4–5 (2FA + rulesets en GitHub; aviso de privacidad y consentimiento,
    SEG-C3) · Carlos · abiertos desde 2026-11-03.
  - **migraciones aplicadas:** `APPLIED-MIGRATIONS.md` filas 0000–0003 sin verificar · Carlos ·
    desde 2026-11-03.
  - **backlog Phase 1:** DAT-M3/SEG-M2, DAT-A3, SEG-A1, SEG-M3, SEG-B1, SEG-M6, SEG-A3; CIT-B1–B4;
    CIT-C1 (reversa de un servicio cerrado: Gate propio, reutiliza `cancelarSalidaEnTx`).
- **Lesson:** El dueño encuentra en diez minutos de uso real lo que tres auditorías de código no
  vieron (no se puede dar de baja un caducado, "desactivar" no oculta, motivo de más). La prueba
  manual del dueño es una entrada de auditoría de primera clase: después de cada entrega, pedirla
  antes de avanzar, y convertir cada reporte en hallazgo con código.
