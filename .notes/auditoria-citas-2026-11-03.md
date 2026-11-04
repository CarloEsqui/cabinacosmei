# Auditoría — Ciclo de vida de la cita (crear → reagendar → cancelar / no asistió → cerrar → después del cierre) — 2026-11-03 (CIT-C1, CIT-A1…A2, CIT-M1…M3, CIT-B1…B4)

**Scope:** Todos los estados y transiciones de una cita y su efecto sobre `servicios_realizados`,
`pagos`, inventario, bitácora, corte, reportes y recordatorios de mantenimiento. Código del main:
`electron/services/citas.ts`, `serviciosRealizados.ts`, `pagos.ts`, `corte.ts`, `dashboard.ts`,
`reportesAgenda.ts`, `reportesFinanzas.ts`, `reportesResumen.ts`, `reportesServiciosDetalle.ts`,
`reportesClientesDetalle.ts`, `clientes.ts` (saldos), `serviciosCatalogo.ts` (chequeo de citas),
`reinicio.ts` (único borrado), `electron/ipc/index.ts`, `electron/preload.ts`, `shared/schemas.ts`,
`shared/types.ts`, `electron/db/schema.ts`. Renderer: `src/pages/Citas.tsx`, `Agenda.tsx`,
`Dashboard.tsx`, `Clientes.tsx` (alerta de pago), `src/pages/agenda/{Calendario,Lista,
CitaDetalleModal,NuevaCitaModal,CierreCitaModal,Mantenimientos}.tsx`. **Incluye los cambios SIN
commitear de la Fase 1 (R1)** en `citas.ts`, `reportesAgenda.ts` y las cuatro pantallas de agenda.
**No auditado:** aritmética de dinero y de stock ya cubierta por DIN-* y DAT-* (se cita, no se
repite), respaldos, licencias, PII.
**Method:** Lectura de código con citas `archivo:línea` sobre el working tree; `git diff` para
aislar lo no commiteado; grep de canales IPC/preload; y **siete escenarios ejecutados contra una BD
de prueba vacía** construida desde `drizzle/` en el scratchpad de sesión (servicios reales
empaquetados con esbuild y corridos con el Node de Electron, `ELECTRON_RUN_AS_NODE=1`). Solo
lectura sobre el repo; el único archivo escrito es este informe.
**PII declaration:** Sin PII. No se abrió ninguna BD real ni respaldo (ni en `userData` ni en el
Escritorio). La BD de prueba contiene una clienta inventada con código `CL-0001` y un servicio
inventado; el informe no reproduce nombres ni contenido de ninguna base real.
**State as of:** 2026-11-03 23:55 CST, HEAD `da6a134` + working tree con R1 sin commitear.

---

## 1. Resumen ejecutivo

1. **Las guardias del servidor que trajo R1 funcionan para lo que se diseñaron.** Una cita
   cancelada, no asistida o cerrada **no** se puede reagendar, reactivar ni cambiar de estado por
   ningún canal (`citas.ts:126-128,183-191`; escenarios B2, B3, C1–C3 rechazados), "asistió" solo lo
   pone el cierre (`citas.ts:183-185`), reagendar mueve la misma fila dejando "vieja → nueva" en
   bitácora (`citas.ts:145-152`) y una confirmada vuelve a programada al moverse
   (`citas.ts:139-140`). El cierre sigue siendo una sola transacción (DIN resumen 3).
2. **Las seis agregaciones de dinero tratan igual a un servicio `cancelado`** (lo excluyen):
   saldo por cita (`citas.ts:23`), detalle (`serviciosRealizados.ts:341`), saldo por clienta
   (`clientes.ts:26-30`), resumen de clienta (`citas.ts:298`), cartera (`reportesFinanzas.ts:80,138`)
   y ventas/serie/detalles (`reportesResumen.ts:53,206`, `reportesServiciosDetalle.ts:37`,
   `reportesClientesDetalle.ts:60`). **Solo el Dashboard diverge** (→ CIT-M2).
3. **Reporte 1 de la dueña — CONFIRMADO.** La X roja de la Lista es **"Cancelar cita"**, no
   borrar (`Lista.tsx:268-277`, icono fantasma con solo `title`, sin diálogo de confirmación). La
   cita queda `cancelada`, sigue en la lista y en el calendario (atenuada, `Calendario.tsx:89`), y
   pierde todos sus botones (`Lista.tsx:204,230`). **No existe ningún borrado de citas** (ningún
   `citas:eliminar` en `ipc/index.ts`, ningún `delete(citas)` fuera de `reinicio.ts:19`) **ni
   ninguna forma de deshacer una cancelación** (`citas.ts:186-188`). → CIT-M1.
4. **Reporte 2 — CONFIRMADO y refinado.** Cerrar una cita que debía cancelarse la convierte en
   `asistio` + servicio `cerrado` con el precio sugerido (`serviciosRealizados.ts:126,253-271`).
   El corte solo se afecta si se registra monto (botón "pagado" precarga el precio completo,
   `CierreCitaModal.tsx:83`); pero **aun cerrándola "pendiente" con $0** nace una **venta falsa**
   en reportes y una **cuenta por cobrar falsa** contra la clienta (escenario D: ventas 500, saldo
   de la clienta +500, una fila en cartera). Y **no hay camino de reversa**: ni reabrir, ni cancelar
   el servicio, ni cancelar la cita cerrada (C1–C3 rechazados). → **CIT-C1**.
5. **Reporte 3 — CONFIRMADO: "cancelado" en el cierre no cancela nada; hace lo contrario.** Cierra
   el servicio (`estatus=cerrado`, `estatus_pago=cancelado`), marca la cita **`asistio`**, descuenta
   inventario si se capturó, calcula y guarda `proxima_cita_sugerida` y dispara el diálogo "¿Agendar
   mantenimiento?", acepta un pago si se escribió monto (DIN-B3) y la Lista lo pinta "Asistió" +
   "**Pagado**" (`Lista.tsx:28-31`, saldo 0 → "Pagado"). Es una etiqueta de "servicio sin cargo",
   no una cancelación de cita. → CIT-A2.
6. **Hallazgo nuevo y REGRESIÓN del working tree (R1):** con solo **abrir** el modal "Cerrar cita"
   y salir sin cerrar, `abrirCierre` deja un borrador `abierto` (`serviciosRealizados.ts:117-131`) y
   la guardia nueva lo toma por "cita cerrada" porque busca *cualquier* fila, no `estatus='cerrado'`
   (`citas.ts:121-128,178-188`). Desde ese momento la cita **no se puede reagendar, confirmar,
   cancelar ni marcar no asistió** (escenario A: A1–A3 rechazados con el mensaje "Esta ya se
   cerró…") y la Lista le pone "Pago pendiente". Antes de R1 la cancelación sí pasaba. **Debe
   corregirse antes de commitear R1.** → CIT-A1.
7. **Bomba de tiempo (§5):** cada cierre por error (C1) y cada "cancelado" (A2) dejan una venta o
   un pago que ninguna pantalla puede corregir; cada vez que la usuaria "mira" el cierre y se
   arrepiente (A1) una cita queda congelada. Ninguno se repara solo; el único remedio que ofrece el
   producto es "Borrar datos de negocio" (DIN-B1), que destruye soporte fiscal (CFF art. 30).

## 2. Cómo funciona realmente el sistema (referencia)

### 2.1 Estados y transiciones implementadas

`citas.estado` ∈ {programada, confirmada, asistio, no_asistio, cancelada, reagendada}
(`schema.ts:316`; `reagendada` es heredado, ya no se asigna: `reportesAgenda.ts:120`). Existe
además un **sub-estado no modelado**: "activa con borrador abierto" (fila en `servicios_realizados`
con `estatus='abierto'`), que nace al abrir el modal de cierre.

| Estado | Cómo se llega | Acciones en UI | Guardia del servidor | Efectos colaterales |
|---|---|---|---|---|
| **programada** | `crearCita` (`citas.ts:86-110`); reagendar una confirmada con cambio de horario (`citas.ts:140`) | Lista: Cerrar, Reagendar, Confirmar, No asistió (si ya pasó la hora), Cancelar (`Lista.tsx:230-278`). Calendario → detalle: Confirmar, No asistió, Reagendar, Cerrar (`CitaDetalleModal.tsx:129-176`); **sin Cancelar** | `cambiarEstadoCita` exige programada/confirmada y sin fila en `servicios_realizados` (`citas.ts:178-188`); no_asistio solo si la hora pasó (`:189-191`) | bitácora `cita_creada`; cuenta en Dashboard "Próximas citas" si fecha ∈ [hoy, +7] (`Dashboard.tsx:56-92`); cuenta como "cita futura activa" para suprimir recordatorio de mantenimiento si fecha ≥ hoy (`citas.ts:242-247`) |
| **confirmada** | botón Confirmar (`Lista.tsx:244-255`, `CitaDetalleModal.tsx:131-140`) | igual que programada menos Confirmar | igual | bitácora `cita_cambio_estado` |
| **(activa + borrador abierto)** | abrir "Cerrar cita" → `abrirCierre` (`serviciosRealizados.ts:85-135`): inserta `SRV-nnnn` abierto, precio = sugerido, fecha = fecha de la cita, **crea carpeta en disco** si la clienta tiene carpeta (`:113-115`) | Lista muestra los mismos botones **pero todos fallan salvo Cerrar** (CIT-A1); fila expandible con "Pago pendiente" (`Lista.tsx:28-31,207`) | reagendar/cambiar estado rechazados (`citas.ts:121-128,178-188`) | consume un código SRV (`:112`); carpeta vacía en disco; nunca se limpia (CIT-B1) |
| **asistio** | **solo** `cerrarCita` (`serviciosRealizados.ts:266-271`) | Lista: fila expandible (detalle); Calendario: expediente. **Ninguna acción** | `cerrarCita` rechaza segundo cierre (`:146`); `cambiarEstadoCita`/`actualizarCita` rechazan | servicio `cerrado` + precio + `estatus_pago` manual + `proxima_cita_sugerida`; salidas de inventario; 0 o 1 pago `cobrado`; bitácora `cita_cerrada`; diálogo "¿Agendar mantenimiento?" (`CierreCitaModal.tsx:124-134`); entra a ventas, cartera, saldo de clienta, corte (si hubo pago), KPI asistencia |
| **no_asistio** | botón No asistió (solo si `fecha hora ≤ ahora`) | ninguna | terminal: rechaza cualquier cambio (`citas.ts:186`) | KPI No-show e "Ingreso potencial perdido" (`reportesAgenda.ts:127,182-188`); sigue ocupando agenda en KPIs de ocupación/duración (`:121-124`) |
| **cancelada** | X de la Lista (`Lista.tsx:268-277`), sin confirmación, sin motivo | ninguna | terminal (`citas.ts:186`) | KPI Cancelaciones (`reportesAgenda.ts:116-119`); no ocupa agenda; atenuada y tachada en Calendario (`Calendario.tsx:79-89`); deja de contar como "cita futura activa" para mantenimientos. Bitácora: `Nuevo estado: cancelada` (sin motivo) |
| **reagendada** | nadie (heredado) | — | `cambiarEstadoCita` todavía lo acepta (`citas.ts:158-165`) | no ocupa agenda (`reportesAgenda.ts:120`) |
| **borrada** | **no existe** | — | — | solo `reinicio.ts:19` (borrado masivo con FKs apagadas) |

### 2.2 El cierre y sus cuatro etiquetas de pago

```
abrirCierre(citaId)  → fila SRV abierta, precio = catálogo.precioSugerido, fecha = cita.fecha     serviciosRealizados.ts:85-135
cerrarCita(input)    → requiere comprobante o PIN (:148-157); tx {salidas, ≤1 pago, update servicio, cita→asistio, bitácora} (:207-289)
estatusPago (manual, CierreCitaModal.tsx:70-72,235-245; schemas.ts:150):
  pagado    → montoPorDefecto = precio (CierreCitaModal.tsx:83) → pago cobrado → corte, cobrado hoy, cobranza
  parcial   → monto 0 salvo que se escriba → saldo = precio − Σpagos
  pendiente → monto 0 salvo que se escriba → venta + cuenta por cobrar completa
  cancelado → monto 0 salvo que se escriba → EXCLUIDO de ventas/saldos/cartera, pero cita = asistio,
              inventario descontado, mantenimiento sugerido, Dashboard lo cuenta, Lista dice "Pagado"
```

Ninguna etiqueta cambia el `estado` de la cita: **todo cierre termina en `asistio`**
(`serviciosRealizados.ts:266-271`), incluso con `cancelado`.

### 2.3 Diseño vs bug

| Comportamiento | Clasificación |
|---|---|
| Cancelar conserva la fila (no borra) y la muestra tachada | **Diseño** correcto para KPIs; falta borrar/deshacer la cita *sin dinero* → CIT-M1 |
| Guardia "cerrada" = cualquier fila en `servicios_realizados` | **Bug** (regresión de R1) → CIT-A1 |
| `cancelado` cierra, marca asistió y sugiere mantenimiento | **Bug de concepto**: etiqueta de pago usada como si fuera estado de cita → CIT-A2 |
| Sin reversa de un cierre | **Diseño incompleto** (DIN-A4 + DAT-A2 son sus mitades de dinero e inventario; falta la mitad de cita/servicio) → CIT-C1 |
| Dashboard cuenta servicios `cancelado` | **Bug** (filtro faltante) → CIT-M2 |
| Cerrar una cita futura con pago fechado en el futuro | **Diseño** (`pagos.fecha` = fecha de cita, DIN-M1) sin guardia → CIT-M3 |
| Borrador creado al abrir el modal | **Diseño** (para subir comprobante antes de cerrar, `serviciosRealizados.ts:82-83`) con residuos → CIT-B1 |
| Citas pasadas que nadie marcó siguen `programada` | **Diseño** (el KPI de asistencia las cuenta como no cumplidas y avisa, `reportesAgenda.ts:128,207-210`) → CIT-B3 |

## 3. Origen de los datos

| Dato | Origen | Estado |
|---|---|---|
| `citas.estado` | `crearCita` (programada), `cambiarEstadoCita` (confirmada/no_asistio/cancelada), `actualizarCita` (→ programada), `cerrarCita` (asistio) | ✅ un escritor por transición; ⚠️ sin vuelta atrás desde cancelada/no_asistio |
| `servicios_realizados` abiertas | `abrirCierre` al **abrir** el modal | 🔴 residuos sin limpieza; bloquean la cita (CIT-A1) |
| `servicios_realizados.estatus_pago = cancelado` | botón del modal, tal cual (`serviciosRealizados.ts:256`) | 🔴 semántica contradictoria (CIT-A2) |
| `proxima_cita_sugerida` | `cerrarCita` (`:191-194,259`), sin mirar `estatusPago` | ⚠️ se genera para servicios cancelados |
| KPI "Reagendadas" | bitácora `cita_reagendada` por `createdAt` (`reportesAgenda.ts:87-99`) | ✅ correcto; ⚠️ base de tiempo distinta al resto (fecha de la cita) → CIT-B4 |
| Dashboard `serviciosDelMes`/ticket | `dashboard.ts:21-32` sin filtro de `estatus_pago` | 🔴 inconsistente con reportes (CIT-M2) |
| Borrado de citas/servicios/pagos | solo `reinicio.ts` | ✅ correcto para dinero (CFF); ❌ inexistente para citas sin dinero |

## 4. Caso por caso

Escenarios ejecutados en la BD de prueba (clienta inventada `CL-0001`, servicio de $500 con
periodicidad de mantenimiento 1 día, PIN de prueba). Fechas relativas a 2026-11-03.

| # | Escenario | Lo que guardó el sistema | Lo que una cabina espera | Lectura |
|---|---|---|---|---|
| A | Cita de mañana → abrir "Cerrar cita" → salir | `SRV-0001` abierto; reagendar/cancelar/confirmar **rechazados** ("Esta ya se cerró…"); `listarCitas` → `servicioRealizadoId` ≠ null, `saldoPendiente` 500 → Lista "Pago pendiente" | Nada: mirar el cierre no debe cambiar la cita | **CIT-A1** (regresión R1) |
| B | X en la Lista | `cancelada`; sigue en `listarCitas({})`; reactivar/reagendar rechazados; `abrirCierre` por IPC **sí** crea borrador (`SRV-0002`); bitácora "Nuevo estado: cancelada" | Confirmación, motivo, posibilidad de deshacer; borrar si fue un error sin dinero | **CIT-M1**, CIT-B1 |
| C | Cerrar con "cancelado", $0, PIN | cita `asistio`; servicio cerrado/`cancelado`/precio 500/`proxima_cita_sugerida` 2026-11-02; 0 pagos; corte 0; Lista "Asistió"+"Pagado"; Dashboard servicios del mes 1, ticket 500; reportes ventas 0; KPI asistencia 100 %; reabrir/cancelar/reagendar rechazados | O cancelar la cita (no asistió / cancelada, sin inventario ni mantenimiento) o "sin cargo" explícito | **CIT-A2**, CIT-M2, CIT-C1 |
| C' | "cancelado" con $200 Efectivo | 1 pago `cobrado`; corte 200; ventas 0; **el saldo de la clienta baja $200 contra otros servicios** (D muestra 300 en vez de 500) | Rechazo: no hay cobro de algo cancelado | DIN-B3 + nuevo efecto (CIT-A2) |
| D | Cerrar "pendiente", $0 (la cita por error "cerrada para quitarla") | cita `asistio`; ventas +500; saldo clienta +500; 1 fila en cartera; corte intacto | Poder deshacerlo | **CIT-C1** (reporte 2) |
| E | Cerrar cita de **mañana** con $500 Tarjeta | permitido; `pagos.fecha` = mañana; "Cobrado hoy" 0; corte pendiente sí lo incluye; Finanzas lo pondrá mañana | Bloquear o avisar | **CIT-M3** |
| F | Cita de hace 10 días sin tocar | sigue `programada`; KPI asistencia 0 % con advertencia "1 cita(s) pasadas sin marcar" | Una vista "pendientes de marcar" | CIT-B3 |
| G | Códigos tras A–E | `SRV-0001:abierto, SRV-0002:abierto, SRV-0003…0006:cerrado` | Borradores no deberían sobrevivir ni consumir folio | CIT-B1 |

Hallazgos sueltos:

- El botón "Cancelar" solo existe en la pestaña Citas; el detalle del Calendario no lo tiene
  (`CitaDetalleModal.tsx:129-176`). Para cancelar desde la Agenda hay que cambiar de módulo.
- Ni "Cancelar" ni "No asistió" piden confirmación (`Lista.tsx:256-277` llaman `mutate` directo;
  compárese con `Mantenimientos.tsx:37-45`, que sí confirma antes de descartar).
- La guardia de `cerrarCita` sigue fuera de la transacción (DIN-M2); con R1 no cambió.
- `abrirCierre` no verifica el estado de la cita (`serviciosRealizados.ts:95-97`): por IPC una
  cita cancelada puede abrirse y cerrarse, pasando de `cancelada` a `asistio`. La UI lo oculta
  (`Lista.tsx:230`, `CitaDetalleModal.tsx:42`).
- `reagendada` sigue en la lista de estados válidos del servidor, en el filtro de la Lista y en la
  leyenda del Calendario (`citas.ts:158-165`, `Lista.tsx:39`, `CitaDetalleModal.tsx:18`).

## 5. Riesgos activos — con fechas de detonación

### 5.1 Cierres irreversibles que fabrican ventas, cobros o deudas (CIT-C1, CIT-A2)
Mecanismo: `cerrarCita` es la única escritura de dinero y no tiene inversa; `cambiarEstadoCita` y
`actualizarCita` rechazan la cita cerrada; no existe `serviciosRealizados:cancelar` ni
`pagos:cancelar` (`ipc/index.ts:248-257`, `preload.ts:91-96`). Cada cierre equivocado deja: una
venta en `reportesResumen`, una deuda en `clientes.ts`/cartera (o un pago en el corte), una cita
`asistio` en los KPIs y, si el catálogo tiene periodicidad, un recordatorio de mantenimiento.
**Ya detonado** en la prueba manual de la dueña (reporte 2); se repite con cada ocurrencia.

### 5.2 Citas congeladas por el borrador (CIT-A1)
Mecanismo: `abrirCierre` inserta al abrir el modal; la guardia nueva de R1 no filtra por
`estatus`. Detona **en cuanto R1 se publique** (hoy está sin commitear): desde ese release, cada
vez que la usuaria abra "Cerrar" y cierre el modal, esa cita queda sin reagendar ni cancelar.
Antes de R1 el mismo borrador solo producía el badge "Pago pendiente".

### 5.3 Degradaciones programadas
| # | Qué se pierde | Fecha |
|---|---|---|
| 1 | Corregir un cierre por error sin borrar toda la BD (CIT-C1) | Permanente, por cada ocurrencia |
| 2 | Reagendar/cancelar una cita tras asomarse al cierre (CIT-A1) | Primer release con R1 |
| 3 | Coherencia del Dashboard con Reportes (CIT-M2) | Por cada cierre con "cancelado" |
| 4 | Folios `SRV-` y carpetas limpias (CIT-B1) | Acumulativo, desde v0.1.0 |

### 5.4 Causa raíz
La cita y el servicio realizado se modelaron como **una línea de un solo sentido**
(programada → asistió) donde el único evento con efectos reales (el cierre) **no tiene evento
inverso**, y la etiqueta manual de pago (`estatus_pago`) hace de "estado" de cosas que no son pago
(cancelación, cortesía). Las guardias de R1 se apoyaron en la presencia de una fila de servicio
como señal de "cerrada", cuando esa fila nace antes del cierre.

## 6. Plan correctivo propuesto

- **Paso 0 — AHORA (sin código, instrucción a la usuaria):** (1) una cita que no ocurrió se
  **cancela con la X** (Citas → Todas las citas), nunca se cierra; (2) **no usar "cancelado"** en
  el cierre: si la clienta no vino, cancelar o "No asistió" *antes* de abrir el cierre; (3) no abrir
  "Cerrar cita" "para ver" hasta que CIT-A1 esté corregido; (4) si ya se cerró una cita por error,
  anotar el `SRV-` y la fecha en un papel/nota y **no** usar "Borrar datos de negocio" (DIN-B1).
  (5) **No commitear R1 sin la corrección de CIT-A1.**

- **Decisión A — ¿Qué significa "cancelado" en el cierre?** Opciones: (a) **quitar el botón**:
  una cita que no se realizó se cancela desde la agenda; el cierre solo registra servicios que
  ocurrieron (recomendada; coincide con la Decisión A de DIN, estatus derivado); (b) renombrarlo
  "**Sin cargo / cortesía**": precio 0, sin pago, inventario sí, cita `asistio`, mantenimiento sí —
  solo si la cabina regala servicios; (c) convertirlo en "cancelar servicio": cita → `cancelada`,
  sin inventario, sin pago, sin mantenimiento. Determina CIT-A2 y de paso cierra DIN-B3.

- **Decisión B — ¿Borrar citas sin dinero?** Una cita con `estado ∈ {programada, confirmada,
  cancelada, no_asistio}` y **sin servicio cerrado, sin pagos y sin salidas** no es documentación
  contable (CFF art. 30 aplica a pagos/ventas/cortes, PROJECT.md "Marco legal"). Propuesta: borrado
  físico con entrada en bitácora (`cita_eliminada`, detalle "fecha hora · clienta por código ·
  servicio"), eliminando también el borrador abierto si lo hay y su carpeta **solo si está vacía**.
  Alternativa más conservadora: "Deshacer cancelación" (cancelada → programada) + ocultar
  canceladas por defecto en la Lista. Una cita **cerrada** nunca se borra: se cancela (Decisión C).

- **Decisión C — Reversa de un cierre (CIT-C1), en dos tamaños:**
  - *Barato, sin migración:* "**Reabrir cierre**" permitido solo cuando el servicio tiene **0 pagos
    y 0 salidas** (el caso "cerré por error sin cobrar"): `estatus → abierto`, `cerrado_at` y
    `proxima_cita_sugerida` a null, cita → `programada`, bitácora `cierre_reabierto`. Luego la
    cita se cancela o se marca no asistió con los botones normales.
  - *Completo (Gate 001):* "**Cancelar servicio cerrado**" con motivo: pagos → `cancelado`
    (DIN-A4), salidas revertidas (DAT-A2), cita → `cancelada`/`no_asistio`, mantenimiento limpio,
    y ajuste negativo en el siguiente corte si el pago ya se cortó. Es el mismo diseño que el plan
    ya manda a Gate 001 para R2b/DIN-A4; CIT-C1 añade el requisito de **revertir también la cita y
    el servicio** en la misma transacción.

- **Decisión D — ¿Se puede cerrar una cita futura?** Recomendación: bloquear en UI y servidor
  cuando `cita.fecha > hoy` (permitir el mismo día), o cambiar la fecha del pago a la del cobro
  (DIN-M1). Hoy ambas pantallas lo permiten (`Lista.tsx:230-234`, `CitaDetalleModal.tsx:154-175`).

**Cambios propuestos, en orden (superficie crítica = SC; Gate 001 = G):**

1. **CIT-A1 (antes de commitear R1, no SC, sin migración):** en `citas.ts:121-128` y `:178-188`
   filtrar `eq(serviciosRealizados.estatus, "cerrado")`, o mejor, decidir por `actual.estado`
   (`asistio` ⇔ cerrada) y usar la fila solo como doble chequeo. Al **reagendar con borrador
   abierto**, actualizar también `servicios_realizados.fecha` del borrador (y, si cambia el
   servicio del catálogo, su `servicio_catalogo_id`/precio) para que `pagos.fecha` y la fecha de
   mantenimiento no queden con la fecha vieja (`serviciosRealizados.ts:111,161`) — esa línea sí
   toca `serviciosRealizados.ts` (**SC Dinero**; este informe es su auditoría previa). Al
   **cancelar/no asistió con borrador abierto**, borrar el borrador (no tiene pagos ni salidas por
   construcción: solo `cerrarCita` los crea) y su carpeta si está vacía, con bitácora.
   Verificación: repetir el escenario A → A1–A3 deben pasar; `servicios_realizados` sin filas
   abiertas huérfanas.
2. **CIT-A2 (SC: `CierreCitaModal.tsx`, `shared/schemas.ts`, `serviciosRealizados.ts`; sin
   migración):** aplicar la Decisión A. Con (a): quitar `cancelado` del `z.enum` y del modal;
   el servidor rechaza `monto > 0` con cualquier estatus que no sea pagado/parcial (cierra
   DIN-B3). Con (b): etiqueta "Sin cargo", `precio` forzado a 0 y `monto` a 0 en el servidor.
   Mientras se decide, **mínimo**: `cerrarCita` no debe calcular `proximaCitaSugerida` ni poner
   `asistio` cuando `estatusPago === "cancelado"`.
3. **CIT-C1 parte barata (SC Dinero; sin migración):** nuevo IPC `serviciosRealizados:reabrir`
   con la regla de la Decisión C; botón "Reabrir cierre" en el detalle solo si `totalCobrado === 0`
   y sin salidas. La parte completa va al **Gate 001 ya programado** (plan Fase 1 §3) con el
   requisito añadido de revertir cita + servicio + mantenimiento.
4. **CIT-M1 (no SC si no hay dinero; Decisión B):** diálogo de confirmación en "Cancelar" y "No
   asistió" (reutilizar `useConfirm`), campo de motivo opcional que vaya a bitácora, botón
   "Cancelar" también en `CitaDetalleModal`, y "Eliminar cita" (o "Deshacer cancelación") con las
   condiciones de la Decisión B. Si se elige borrado físico, el servidor debe verificar en la misma
   transacción que no existe servicio cerrado/pagos/salidas antes de `delete(citas)`.
5. **CIT-M2 (Dashboard, 1 línea):** `dashboard.ts:24-29` añadir
   `inArray(serviciosRealizados.estatusPago, ["pagado","parcial","pendiente"])`.
6. **CIT-M3 (Decisión D):** guardia `cita.fecha <= hoy` en `cerrarCita` (SC) y ocultar "Cerrar"
   en UI para citas futuras.
7. **CIT-B1:** `abrirCierre` debe rechazar citas que no estén programada/confirmada
   (`serviciosRealizados.ts:95-97`); diferir la creación de carpeta y folio al primer uso real
   (subir comprobante o cerrar) o limpiar borradores de citas canceladas/no asistidas.
8. **CIT-B2/B4:** retirar `reagendada` de `ESTADOS_CITA_VALIDOS`, del filtro y de la leyenda
   cuando la verificación manual confirme 0 filas; documentar en la fórmula del KPI que
   "Reagendadas" se cuenta por fecha del movimiento.

**Verificación manual pendiente** (solo lectura, sobre un respaldo abierto fuera del repo;
reportar solo conteos):

```sql
-- CIT-A1 / B1: borradores abiertos que hoy congelan citas y consumen folios
SELECT COUNT(*) FROM servicios_realizados WHERE estatus = 'abierto';
-- Esperado tras el fix: 0 huérfanos (solo los de citas en proceso de cierre ese día)

-- CIT-A1: citas activas con borrador (las que la usuaria no podrá reagendar/cancelar con R1)
SELECT COUNT(*) FROM citas c JOIN servicios_realizados s ON s.cita_id = c.id
 WHERE s.estatus = 'abierto' AND c.estado IN ('programada','confirmada');
-- Esperado: 0. Cada fila > 0 es una cita congelada.

-- CIT-A2: cierres marcados "cancelado" (citas que figuran como asistidas sin serlo)
SELECT COUNT(*), SUM(precio) FROM servicios_realizados WHERE estatus = 'cerrado' AND estatus_pago = 'cancelado';
-- y cuántos de ellos tienen pagos (DIN-B3, dinero en corte sin venta)
SELECT COUNT(*) FROM pagos p JOIN servicios_realizados s ON s.id = p.servicio_realizado_id
 WHERE s.estatus_pago = 'cancelado' AND p.estatus = 'cobrado';
-- Esperado: 0 en la segunda; la primera cuantifica CIT-A2

-- CIT-C1: cierres sin cobro ni insumos (candidatos a "cerré por error" / reabrir barato)
SELECT COUNT(*) FROM servicios_realizados s WHERE s.estatus = 'cerrado'
  AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.servicio_realizado_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM salidas_inventario x WHERE x.servicio_realizado_id = s.id);
-- Esperado: cualquier valor; cada fila es una venta/deuda que podría ser falsa y hoy no se corrige

-- CIT-M3: servicios cerrados con fecha futura (pagos que "Cobrado hoy" no muestra)
SELECT COUNT(*) FROM servicios_realizados WHERE estatus = 'cerrado' AND fecha > date('now','localtime');
-- Esperado: 0

-- CIT-B2: estado heredado
SELECT COUNT(*) FROM citas WHERE estado = 'reagendada';
-- Esperado: 0 (si es 0, se puede retirar el estado)

-- CIT-B3: citas pasadas sin marcar (lo que el KPI de asistencia cuenta como no cumplidas)
SELECT COUNT(*) FROM citas WHERE estado IN ('programada','confirmada') AND fecha < date('now','localtime');
-- Esperado: idealmente 0; > 0 justifica una vista "pendientes de marcar"
```

## 7. Qué sigue

1. **Claude corrige CIT-A1 en el working tree** (cambio 1) y repite los escenarios A y B en BD de
   prueba → **Carlos commitea R1** solo con esa corrección incluida.
2. **Carlos decide A (significado de "cancelado"), B (borrar cita sin dinero) y D (cerrar futuras)**
   → Claude prepara cambios 2, 4, 5 y 6; los que tocan `CierreCitaModal.tsx`, `serviciosRealizados.ts`
   o `dashboard.ts` cierran con `/evidencia` contra este informe y contra DIN.
3. **Decisión C, parte barata ("Reabrir cierre" sin pagos ni salidas)** en el mismo release que
   R3 (DIN-A1): comparte archivo y transacción.
4. **Decisión C, parte completa** entra al **Gate 001** ya previsto para R2b/DIN-A4 (plan Fase 1
   §3) con el requisito añadido: revertir cita, servicio y mantenimiento en la misma transacción.
5. **Carlos corre las consultas de §6 sobre un respaldo** y anexa solo conteos: fijan cuántas
   citas están hoy congeladas, cuántos cierres "cancelado" hay y cuántos cierres sin cobro son
   candidatos a reabrir.
6. Backlog aceptado: CIT-B1 (limpieza de borradores), CIT-B2, CIT-B3 (vista de pendientes),
   CIT-B4 (nota en la fórmula del KPI).

---

## Anexo — Tabla de hallazgos

| Código | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| CIT-C1 | 🔴 Crítica | Un cierre no se puede deshacer ni corregir por ningún camino; un cierre por error fabrica una venta y una cuenta por cobrar (o un pago en el corte) permanentes; el único remedio del producto es el borrado masivo (CFF art. 30) | `serviciosRealizados.ts:146,253-271`; `citas.ts:126,186`; sin `serviciosRealizados:cancelar`/`reabrir` ni `pagos:*` en `ipc/index.ts:248-257`, `preload.ts:91-96`; escenarios C1–C3, D. Mitades ya codificadas: DIN-A4 (pagos), DAT-A2 (salidas), DIN-B1 (reinicio) |
| CIT-A1 | 🟠 Alta (regresión R1, sin commitear) | Abrir el modal de cierre y salir deja un borrador `abierto` que la guardia nueva toma por "cerrada": la cita ya no se puede reagendar, confirmar, cancelar ni marcar no asistió; mensaje engañoso; Lista muestra "Pago pendiente" | `citas.ts:121-128,178-188` (cualquier fila, sin `estatus`); `serviciosRealizados.ts:85-135`; `Lista.tsx:28-31,207`; escenario A |
| CIT-A2 | 🟠 Alta | "cancelado" en el cierre no cancela: cierra el servicio, pone la cita `asistio`, descuenta inventario, sugiere mantenimiento, acepta pago (DIN-B3) que además reduce el saldo de otros servicios de la clienta; la Lista lo pinta "Asistió"+"Pagado" | `CierreCitaModal.tsx:70-72,83,124-134,235-245`; `schemas.ts:150`; `serviciosRealizados.ts:191-194,241-271`; `clientes.ts:26-45`; `citas.ts:298-311`; `Lista.tsx:28-31`; `reportesAgenda.ts:126`; escenarios C, C' |
| CIT-M1 | 🟡 Media | Cancelar y No asistió son de un clic, sin confirmación, sin motivo e irreversibles; no existe borrar ni deshacer para una cita sin dinero; Cancelar solo está en la Lista | `Lista.tsx:256-277`; `CitaDetalleModal.tsx:129-176`; `citas.ts:186-188`; sin `citas:eliminar` en `ipc/index.ts`; `reinicio.ts:19`; escenario B |
| CIT-M2 | 🟡 Media | Dashboard cuenta servicios `cancelado` en "Servicios del mes" y "Ticket promedio"; Reportes los excluyen | `dashboard.ts:21-32` vs `reportesResumen.ts:53`; escenario C (1/500 vs 0/0) |
| CIT-M3 | 🟡 Media | Se puede cerrar una cita futura: el pago queda fechado en el futuro, "Cobrado hoy" no lo muestra, el corte sí, Finanzas lo pone en otro periodo | `Lista.tsx:230-234`; `CitaDetalleModal.tsx:154-175`; `serviciosRealizados.ts:109-111,159-161,245` sin guardia; escenario E; extiende DIN-M1 |
| CIT-B1 | ⚪ Baja | Borradores huérfanos: folio `SRV-` y carpeta en disco al abrir el modal, nunca se limpian; `abrirCierre` no valida el estado de la cita (una cancelada puede cerrarse por IPC y pasar a `asistio`) | `serviciosRealizados.ts:95-97,112-115,266-271`; escenarios B4, G |
| CIT-B2 | ⚪ Baja | Estado heredado `reagendada` sigue aceptado por el servidor y visible en filtro y leyenda | `citas.ts:158-165`; `Lista.tsx:39`; `CitaDetalleModal.tsx:18`; `reportesAgenda.ts:120` |
| CIT-B3 | ⚪ Baja | Citas pasadas sin marcar quedan `programada` indefinidamente; solo el KPI avisa | `reportesAgenda.ts:128,207-210`; `citas.ts:245`; escenario F |
| CIT-B4 | ⚪ Info | KPI "Reagendadas" usa fecha del movimiento (bitácora) mientras el resto usa fecha de la cita | `reportesAgenda.ts:87-99` vs `:69-79` |

Anti-lista (no perseguir ahora): **crear una cita nueva al reagendar** (estado `reagendada` +
fila nueva) — Carlos ya decidió mover la misma fila y el KPI se resolvió por bitácora; reabrir si
hace falta historial de horarios anteriores más allá de la bitácora. **Confirmación automática de
citas pasadas** (programada → no_asistio por cron) — decisión de la usuaria, no del sistema; reabrir
si la consulta de CIT-B3 devuelve decenas de filas.
