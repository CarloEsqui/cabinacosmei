# Evidence for audit — CIT-A1: citas congeladas por el borrador de cierre (2026-11-04)

**Responde a:** [auditoria-citas-2026-11-03.md](auditoria-citas-2026-11-03.md), cambio propuesto 1
(§6) · plan [plan-accion-2026-11-03.md](plan-accion-2026-11-03.md), Phase 1 ítem R1/1b.
**Responsible:** sesión Claude Code (main thread), a petición de Carlos.
**Method / PII:** ninguna BD real abierta. Servicios reales empaquetados con esbuild y corridos con
el Node de Electron (`ELECTRON_RUN_AS_NODE=1`) contra una BD de prueba creada desde `drizzle/` en el
scratchpad. Clienta inventada `CL-0001`, servicios inventados.

## ANSWERS to the auditor's findings

**CIT-A1 — ¿abrir el modal de cierre y salir congela la cita?** CONFIRMED (regresión de R1, nunca
commiteada) y CORREGIDO en `electron/services/citas.ts`:

1. **Guardias** (`actualizarCita`, `cambiarEstadoCita`): "cerrada" ahora significa servicio con
   `estatus = "cerrado"` (helper `servicioDeCita`), no "existe cualquier fila". El borrador
   `abierto` ya no bloquea.
2. **Lista** (`listarCitas`): el `leftJoin` a `servicios_realizados` exige `estatus = "cerrado"`.
   Una cita con borrador ya no aparece con "Pago pendiente" ni como expandible. Este error era
   anterior a R1; el auditor lo describe dentro de CIT-A1.
3. **Reagendar con borrador**: en la misma transacción que mueve la cita, el borrador toma la
   fecha nueva y, si cambió el servicio, el servicio y el precio sugerido nuevos. Antes el cierre
   habría fechado pago, consumos y mantenimiento con la fecha vieja (`serviciosRealizados.ts:161`).
   El `UPDATE` filtra `estatus = "abierto"`, así que no puede tocar un servicio cerrado.

Concedido al auditor, y **no** cerrado aquí: cancelar o marcar no asistió deja el borrador en la BD.
Ya no afecta a la cita ni a la Lista, pero sigue consumiendo un folio `SRV-` y una carpeta. Eso es
CIT-B1 (backlog). No se borra porque la tabla de archivos puede referenciarlo (comprobante subido
antes de cerrar).

## E2E — CERRADO (servidor, proxy fiel); UI pendiente (Carlos)

Escenario A del auditor, repetido después del fix:

```
== Escenario A: abrir cierre y salir sin cerrar ==
   lista: servicioRealizadoId = null saldo = 0
A1 confirmar con borrador → OK
A2 reagendar con borrador (otro dia y otro servicio) → OK
   borrador tras reagendar: { fecha: '2026-11-06', esperado: '2026-11-06', servicio: 's2', precio: 800, estatus: 'abierto' }
   estado cita: programada
A3 cancelar con borrador → OK
== Cita cerrada de verdad ==
   lista: estado = asistio servicioRealizadoId presente = true saldo = 500
C1 reagendar cerrada → RECHAZADO: Solo se pueden reagendar citas programadas o confirmadas. …
C2 cancelar cerrada → RECHAZADO: Solo se puede cambiar el estado de citas programadas o confirmadas.
```

Regresión de R1 (8 casos previos) re-corrida: 8/8 iguales que antes. No-show futuro rechazado,
confirmada pasa a programada al mover, no asistida no se reagenda ni se cancela, KPI reagendadas
= 1, KPI no-show = 100.

`npm run typecheck` → exit 0. `npm run build` no se corre en esta sesión (el sandbox cuelga Vite):
lo corre Carlos, y CI lo re-verifica en el PR.

## Post-fix census

`grep -n "serviciosRealizados" electron/services/citas.ts`:
- `listarCitas`: join filtrado a cerrado → CORREGIDO. Mapea `servicioRealizadoId` y `saldoPendiente`;
  sus consumidores son `Lista.tsx` (badge de pago y fila expandible) y `CitaDetalleModal.tsx`
  (`estaCerrada`, que ya exigía `asistio`).
- `actualizarCita`, `cambiarEstadoCita`: guardia vía `servicioDeCita` → CORREGIDO.
- `listarMantenimientosNoProgramados`, `descartarMantenimiento`, `resumenCliente`: ya filtraban o
  usaban `estatus = "cerrado"`, o ids de servicios cerrados → INTACTOS.
- `serviciosRealizados.ts` (`abrirCierre`, `cerrarCita`): INTACTO. `abrirCierre` sigue devolviendo
  el borrador existente, que ahora trae la fecha y el servicio sincronizados.

## Working tree state

Sin commitear, en la rama de la fase 1 (los commits los hace Carlos): R1 + 1b + este fix en
`electron/services/citas.ts`, `electron/services/reportesAgenda.ts` y `src/pages/agenda/*`, más el
informe de auditoría de citas y esta evidencia.
