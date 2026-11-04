# Evidence for audit — CIT-M1 (cancelar / eliminar / deshacer) y CIT-M2 (Dashboard) (2026-11-04)

**Responde a:** [auditoria-citas-2026-11-03.md](auditoria-citas-2026-11-03.md), cambios propuestos 4 y 5
(§6), con la **Decisión B** de Carlos registrada en el plan
[plan-accion-2026-11-03.md](plan-accion-2026-11-03.md) (Phase 1, ítem 2b).
**Responsible:** sesión Claude Code (main thread), a petición de Carlos.
**Method / PII:** ninguna BD real abierta. Servicios reales empaquetados con esbuild y corridos con
el Node de Electron contra una BD de prueba creada desde `drizzle/` en el scratchpad. Clienta
inventada `CL-0001`; el nombre inventado se usó solo para comprobar que la bitácora no lo guarda.

## ANSWERS to the auditor's findings

**CIT-M1 — Cancelar y No asistió son de un clic e irreversibles; no existe borrar ni deshacer;
Cancelar solo está en la Lista.** CORREGIDO según la Decisión B ("Eliminar + Deshacer"):

- `eliminarCita` (`electron/services/citas.ts`, IPC `citas:eliminar`) borra la cita solo si **no
  tiene dinero ni inventario**. Todo se verifica dentro de una transacción:
  - estado distinto de `asistio`;
  - ningún servicio `cerrado`;
  - el borrador, si existe, sin pagos, sin salidas y sin comprobante en `archivos`.

  Si el borrador está limpio, se borra junto con la cita. Su carpeta se quita solo si está vacía
  (`rmdir`). La bitácora `cita_eliminada` guarda fecha, hora, **código** de clienta y estado. Con un
  comprobante subido se rechaza con "cancélala en lugar de eliminarla", para no dejar archivos
  huérfanos.
- `reactivarCita` (IPC `citas:reactivar`): cancelada o no asistida vuelve a `programada`, con
  bitácora `cita_reactivada`. **Nota de alcance:** la Decisión B dice "deshacer cancelación"; se
  extendió también a "No asistió" porque sufre el mismo clic irreversible. Si Carlos no lo quiere,
  basta con quitar `no_asistio` de la guardia.
- Hook compartido `src/pages/agenda/useAccionesCita.ts`: Cancelar, No asistió y Eliminar piden
  confirmación con `useConfirm`, con el botón de salida rotulado "Volver" para no confundirlo con
  "Cancelar cita". Lo usan la Lista y el detalle del Calendario, que ahora también tiene "Cancelar
  cita", "Reactivar" y "Eliminar".
- Razón legal (PROJECT.md "Marco legal"): una cita sin servicio cerrado, sin pagos y sin salidas no
  es documentación contable. Una cita **cerrada** nunca se elimina ni se reactiva: su reversa es
  CIT-C1, que va al Gate 001 (Decisión C).

**CIT-M2 — el Dashboard cuenta servicios `cancelado`.** CORREGIDO: `dashboard.ts` filtra
`ne(estatusPago, "cancelado")`, igual que `reportesResumen.ts:53`. Se mantiene aunque la Decisión A
quite "cancelado" del cierre, porque las filas viejas con ese valor siguen en las BD existentes.

## E2E — CERRADO (servidor, proxy fiel); UI pendiente (Carlos)

```
E1 eliminar activa sin borrador → OK              sigue en BD: false
E2 eliminar activa con borrador → OK              cita en BD: false | borrador en BD: false
E3 eliminar con comprobante subido → RECHAZADO: Esta cita tiene un comprobante subido; cancélala en lugar de eliminarla.
E4 eliminar cerrada → RECHAZADO: Esta cita ya se cerró con su servicio y pago; no se puede eliminar.
E4 reactivar cerrada → RECHAZADO: Solo se puede reactivar una cita cancelada o marcada como no asistida.
R1 reactivar cancelada → OK                       estado: programada
R2 reactivar programada → RECHAZADO
R3 reactivar no asistida → OK                     estado: programada
E5 eliminar cancelada → OK
bitacora cita_eliminada: 3 | detalle: 2026-11-05 10:00 · CL-0001 · estado programada | contiene nombre: false
Dashboard (solo un cierre, con 'cancelado'): serviciosDelMes = 0 ticket = 0
```

Regresiones re-corridas sin cambios: R1 (8 casos) y CIT-A1 (escenario A + cita cerrada).
`npm run typecheck` → exit 0. `npm run build`: lo corre Carlos (el sandbox cuelga Vite).

## Post-fix census

- `delete(citas)`: antes solo existía en `reinicio.ts:19` (borrado masivo). Ahora también existe en
  `eliminarCita`, protegido como se describe arriba. FKs hacia `citas`:
  - `servicios_realizados.cita_id` (`set null`): el borrador se borra antes que la cita, y un
    servicio cerrado bloquea el borrado.
  - `citas.servicio_origen_id`: es una FK de salida, no de entrada.
- `delete(serviciosRealizados)`: solo un borrador `abierto` sin pagos, salidas ni archivos. Sus
  FKs entrantes son: `servicios_productos_consumidos` (`cascade`, vacío en un borrador porque solo
  `cerrarCita` escribe), `pagos` y `salidas_inventario` (`set null`, verificados vacíos) y
  `citas.servicio_origen_id` (`set null`).
- Consumidores de `cambiarEstado` en el renderer: solo `useAccionesCita`. La mutación propia de
  `Lista.tsx` se retiró.

## Working tree state

Sin commitear en `atlas/fase1` (sobre `791cd9b`): `electron/services/citas.ts`,
`electron/services/dashboard.ts`, `electron/ipc/index.ts`, `electron/preload.ts`,
`shared/ipc-contract.ts`, `src/pages/agenda/{CitaDetalleModal,Lista}.tsx`,
`src/pages/agenda/useAccionesCita.ts` (nuevo), esta evidencia y el plan.
