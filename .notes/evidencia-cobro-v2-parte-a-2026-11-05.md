# Evidencia para auditoría — Cobro v2 Parte A y delta de comprobantes (2026-11-05)

**Responde a:**
- [auditoria-cobro-v2-parte-a-2026-11-05.md](auditoria-cobro-v2-parte-a-2026-11-05.md) (COB-A1, M1, B1–B5);
- [auditoria-cobro-v2-delta-comprobantes-2026-11-05.md](auditoria-cobro-v2-delta-comprobantes-2026-11-05.md) (COB-A2, M2–M4, B6–B9).

**Responsable:** sesión de Claude Code del 2026-11-05 (rama `atlas/cobro-a`). Los comandos de git los
corre Carlos.

**Método y PII:**
- Toda la ejecución fue sobre **copias** de la BD de desarrollo, que solo tiene datos ficticios
  (CL-0001…CL-0020 con ids `demo-*`), en `/private/tmp` (scratchpad de la sesión).
- La copia se hizo con `sqlite3 .backup`. A cada copia se le apuntó `carpetaRaiz` a una carpeta de
  prueba en `/private/tmp`, y la que corre los AC lleva un PIN de prueba propio.
- No se leyó ningún dato real de la cabina. El único respaldo revisado resultó ser de la app de
  desarrollo: manifest, 20 clientas `demo-*` y 6 migraciones. Se borró.
- **Cómo se ejecuta:** cada prueba importa los servicios reales de `electron/services/*`, se empaqueta
  con esbuild (`--external:better-sqlite3 --external:electron`) y corre con
  `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron`.

## RESPUESTAS a los hallazgos

### Auditoría de la Parte A

1. **COB-A1 — ¿Existe la evidencia de las condiciones 3 y 8 del Gate?** **PARCIAL.**
   - **Condición 8 — CUMPLIDA a nivel de servicios.** AC-001…AC-006 y la parte A de AC-009 se
     corrieron contra los servicios reales sobre una copia de la BD de prueba. Salida literal:
     ```
     PASA AC-001 — total 1000, parcial, saldo 200; pendiente Efectivo +500, Tarjeta +300
     PASA AC-002 — pagado, saldo 0, abono con fecha de hoy, saldo de la clienta 0
     PASA AC-003 — pago cancelado (sigue existiendo), corte anterior 1000 → 1000, ajuste pendiente Tarjeta -300, estatus parcial
     PASA AC-003 (PIN) — cancelar con PIN incorrecto se rechaza
     PASA AC-004 — corte del anticipo 400; cierre con 600 → pagado; anticipo ligado al servicio: true; siguiente corte cuenta 600 (no 1000)
     PASA AC-005 — rechazo: "El pago excede lo que se debe ($500.00)."; pagos sin cambio; servicio abierto
     PASA AC-006 — saldo de la clienta 200 (incluye los 200 de este servicio); el anticipo de 400 no lo vuelve negativo
     PASA AC-009 (A) — K1 400; K2 2400 (Efectivo 1700, Tarjeta 200, Transferencia 500); K3 0 (Efectivo +200, ajuste Tarjeta -200); neto 2800 = ventas 2800; servicios pagado/pagado/pagado/pagado; pagos sin corte 0

     8/8 pasan
     ```
     - AC-009 parte A es la secuencia de §21.4 sin tarjetas de regalo, cortesía ni cupón:
       - Día 1: anticipo de $400 en efectivo.
       - Día 2: $800 = $600 en efectivo + $200 con tarjeta; $500 en efectivo; $500 por transferencia;
         cierre de la cita con anticipo ($800 + producto de $200 = $1,000, pide $600).
       - Día 3: cancelación con PIN del cargo de tarjeta ya cortado, y abono de $200 en efectivo.
     - Ventas netas: 1,000 + 800 + 500 + 500 = 2,800. Neto cortado: 400 + 2,400 + 0 = 2,800.
     - AC-008: `grep -rn "delete(pagos)" electron | grep -v reinicio.ts` no devuelve nada (exit 1).
     - **Matiz que se concede al auditor:** la condición pide `npm run dev`. Estas pruebas ejercitan
       los mismos servicios y el mismo zod que usa el IPC, pero no la capa visual. Carlos tiene una
       prueba guiada de 4 pasos en la app (AC-001…AC-004). Su resultado se agrega aquí antes del tag.
   - **Condición 3 — PENDIENTE.** La radiografía sobre un **respaldo real** de la cabina todavía no se
     corre: DIN-M4, A-003 y el cuadre corte↔ligados con la `0005` aplicada. Carlos conseguirá el .zip
     desde la computadora de la cabina.
     - **El release que lleve la `0005` queda bloqueado** hasta agregar esos tres conteos aquí.
     - El merge a `main` sí procede: el auditor declaró la Parte A "correcta e integrable".
2. **COB-M1 — ¿`pagos.servicio_realizado_id` con `ON DELETE SET NULL`?** **DIFERIDO, como propone el
   auditor.**
   - No existe ninguna ruta que borre un servicio con pagos: `citas.ts` solo borra borradores sin pagos.
   - Pasa a `restrict` en la `0007` (Parte B), que recrea `pagos` de todos modos (condición 9,
     opción b), con su propia radiografía.
3. **COB-B1 — ¿`pagos.ts` sigue en `sensitive_globs`?** **CORREGIDO por Carlos.** El comando
   `sed -i '' 's|  - "electron/services/pagos.ts"|  - "electron/services/comprobantes.ts"|' PROJECT.md`
   cambia esa línea por el archivo nuevo. El cambio está preparado (`M  PROJECT.md`) y entra en el
   commit del contrato.
4. **COB-B2 — ¿Redondeo distinto en el cierre?** **CORREGIDO.**
   - `CierreCitaModal.tsx` usa `redondear`, que ahora se exporta de `LineasPago.tsx` con
     `Number.EPSILON`, igual que `cobros.redondearDinero`.
   - Ya no queda ningún `Math.round(x * 100) / 100` en el cierre.
5. **COB-B3 — ¿`estadoCuentaCita` sin zod?** **CORREGIDO.** `ipc/index.ts` ahora usa
   `cobrosService.estadoCuentaCita(idSchema.parse(citaId))`. Los canales nuevos de archivos también
   validan el id con `idSchema`.
6. **COB-B4 — ¿`estatus_pago` almacenado?** **SE ACEPTA y se registra** como regla para el Gate de
   CIT-C1: todo escritor de `precio`, `total_productos` o de una salida `venta` de un servicio
   cerrado llama a `recalcularEstatusEnTx` en la misma transacción.
7. **COB-B5 — ¿DIN-A3?** **INFORMATIVO**: sigue abierto y no es de esta Parte.

### Auditoría del delta de comprobantes

8. **COB-A2 — ¿Un fallo parcial del anticipo con comprobante permite duplicarlo?** **CORREGIDO**
   (opción A-i del auditor).
   - `cobros:registrarAnticipo` ya no lanza cuando falla el adjunto. Devuelve
     `{ comprobanteGuardado, aviso }` y escribe `cobro_sin_comprobante` en la bitácora
     (`cobros.registrarAnticipoSinComprobanteGuardado`).
   - En `PagosDeCita.tsx`, `onSuccess` siempre invalida y cierra el panel, y muestra el aviso como
     toast. Un segundo clic ya no es posible.
   - El contrato IPC cambió a `Promise<{ comprobanteGuardado: boolean; aviso?: string }>`.
   - **No ejecutado:** forzar el fallo real de la copia requiere la app abierta. Queda como prueba
     manual.
9. **COB-M2 — ¿Cualquier cadena cuenta como token?** **CORREGIDO.**
   - Los tokens viven en el nuevo `seleccionesArchivo.ts`, sin dependencias, con vigencia de 30 min.
   - `cobros.registrarAnticipo` usa `!existeSeleccion(input.comprobanteToken)`.
   - Salida:
     `ok - anticipo con token falso y sin confirmación se rechaza (COB-M2) -> Este anticipo no es en efectivo. Confirma que continúas sin comprobante.`
10. **COB-M3 — ¿`update(pagos)` fuera de `cobros.ts`?** **CORREGIDO** (opción C del auditor).
    - `comprobantes.ts` llama a `cobros.ligarComprobanteEnTx` y ya no importa `pagos`.
    - `grep -rn "insert(pagos)\|update(pagos)" electron | grep -v cobros.ts` no devuelve nada
      (exit 1). La condición 5 del Gate del cobro vuelve a cumplirse literalmente.
11. **COB-M4 — ¿`asegurarCarpeta*` reescribe la ruta si la carpeta no está?** **CORREGIDO** (opción
    B-i).
    - Si `Datos/` del negocio no existe, rechaza sin crear nada.
    - Si la ruta guardada cae dentro de la raíz, la recrea en esa misma ruta (`mkdirSync recursive`,
      sin `_2`).
    - Solo si cae fuera, crea una nueva y deja `carpeta_recreada` en la bitácora.
    - Salida:
      ```
      ok - carpeta de servicio borrada se recrea en la MISMA ruta (COB-M4) true
      ok - carpeta del negocio no disponible: rechaza sin crear nada (COB-M4) -> La carpeta del negocio no está disponible. Revisa que el disco esté conectado.
        ¿se creó algo?: false
      ```
    - El caso 13 del auditor (raíz cambiada en Configuración sin mover los datos) queda **documentado,
      no resuelto**: la app rechaza con mensaje en vez de crear carpetas duplicadas.
12. **COB-B6 — ¿Los tokens no caducan?** **CORREGIDO.**
    - La vigencia es de 30 min en vez del `clear()` a las 20 entradas.
    - `archivos:descartarComprobante` se llama al quitar la selección y al cerrar el panel.
13. **COB-B7 — ¿Desvíos de la condición 8 de la ficha?** Inciso (a) **CORREGIDO**: `rutaComprobante`
    valida contra `carpetaDatos(raiz)`, así que `Respaldos/` queda fuera. Incisos (b)–(e) **se
    aceptan como informativos**: 1,600 px solo para el visor, fallback síncrono solo si falla la
    miniatura del sistema, lista blanca por extensión, y CSP `file:` heredada.
14. **COB-B8 — ¿La bitácora es inconsistente?** **CORREGIDO.**
    - El abono y el anticipo sin evidencia ahora emiten `cobro_sin_comprobante`, igual que el cierre.
    - Salida:
      `ok - anticipo con tarjeta y confirmación deja cobro_sin_comprobante {"entidad_tipo":"cita","detalle":"2026-11-06 10:00 · CL-0012 · anticipo: sin efectivo y sin comprobante (aceptado)."}`
    - El comentario "candado de comprobante" de `schema.ts:274` **no se tocó**: es solo un comentario
      y ese archivo es superficie de Migraciones. Se corrige en la siguiente migración.
15. **COB-B9 — ¿`guardarCopia` como salida de PII?** **INFORMATIVO, aceptado.** Queda en el
    inventario de la superficie PII junto a la exportación CSV.

**Cierres operativos del día:**
- **Regla del comprobante:** la evidencia es opcional y se pide confirmación cuando no es efectivo
  (addendum del spec). Probado:
  - 10 casos de cierre, abono y anticipo;
  - 10 casos de comprobantes;
  - 5 casos más tras las correcciones.

  Todos pasan; las salidas están en el scratchpad de la sesión.
- **Datos de prueba:** la cita "reagendada" ficticia se borró, porque el estado es heredado y ya no
  se asigna.

## Estado del árbol de trabajo
- `0835ac4` (commit de Carlos) contiene la Parte A y el delta, incluidas las correcciones COB-A2/M2/M3/M4/B6/B8.
- **Preparado (`git add`), sin commit:**
  - `PROJECT.md`: consentimiento de la ficha, `fichasClinicas.ts` y `comprobantes.ts` en globs (COB-B1);
  - `.notes/spec-ficha-clinica-2026-11-05.md`;
  - `.notes/gate-001-ficha-clinica-2026-11-05.md`.
- **Modificado sin preparar:**
  - `electron/ipc/index.ts` (COB-B3);
  - `src/components/cobros/LineasPago.tsx` y `src/pages/agenda/CierreCitaModal.tsx` (COB-B2);
  - esta nota.
- `npm run typecheck` y `npm run build`: pasan después de los cambios de COB-B2 y COB-B3.
- **Pendiente antes del tag:**
  - la radiografía de la condición 3 sobre un respaldo real;
  - el resultado de la prueba guiada de Carlos;
  - la fila de `APPLIED-MIGRATIONS.md` para la `0005` cuando se aplique en la cabina.
