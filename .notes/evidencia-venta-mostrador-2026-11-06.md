# Evidencia para auditoría — Venta de productos en mostrador (2026-11-06)

**Responde a:** [auditoria-venta-mostrador-2026-11-06.md](auditoria-venta-mostrador-2026-11-06.md)
(VEN-A1, VEN-M1, VEN-B1…B6). Cierra la evidencia que pide el
[Gate](gate-001-venta-mostrador-2026-11-06.md), condiciones 13a y 13b.

**Responsable:** sesión de Claude Code del 2026-11-06. Los comandos de git los corre Carlos.

**Método y PII:**
- **Pruebas funcionales (13b).** Corrieron sobre una **copia** de la BD de desarrollo, que solo
  tiene datos ficticios, en el scratchpad de la sesión (`/private/tmp`), con una copia nueva en cada
  corrida.
  - La copia parte de la `0006`; `initDb` le aplica la `0007` y la `0008`.
  - Los productos son de prueba (`pA` con 20 piezas, `pB` con 1). `carpetaRaiz` apunta a una
    carpeta de prueba y se usa un PIN de prueba.
  - Corren **dentro de Electron real** (`app.whenReady()`), porque el reinicio de AC-010 usa
    `app.getVersion()`. El bundle de esbuild importa los servicios reales de `electron/services/*`
    y los esquemas zod del IPC.
- **Radiografía (13a).** Sobre una copia escribible del respaldo automático real del 2026-11-05,
  fuera del repo, la misma de la [evidencia de la ficha](evidencia-ficha-clinica-2026-11-06.md).
  Solo se reportan conteos y sumas.

## RESPUESTAS a los hallazgos

1. **VEN-A1 — ¿Quitar o reducir el descuento de una venta sin clienta deja una deuda que nadie
   debe?** **CORREGIDO**, con la regla que ya había fijado el dueño para BR-003: una deuda sin
   clienta solo puede existir si hay un nombre de referencia a quien cobrarle.
   - **Main.** `cobros.exigirSinDeudaHuerfanaEnTx` corre dentro de la transacción, en las ramas
     venta de `aplicarDescuento` y `quitarDescuento`. Sin clienta y sin nombre, si queda saldo,
     lanza y el cambio se revierte. Con nombre se permite y el saldo queda a ese nombre, igual que un
     pago suelto cancelado.
   - **UI.** En esas ventas, "Quitar" y "Cambiar descuento" no aparecen, y el detalle explica que se
     cancela la venta y se registra de nuevo.
   - **Se concede el matiz del auditor.** El comentario de `saldoVentasSinClienta` decía "solo con
     nombre" y el código no filtraba. Hoy el filtro sobra, porque los dos caminos que crean deuda
     sin clienta (pago suelto y descuento) exigen nombre. El lector se reemplazó (VEN-B1).
   - Prueba **VEN-A1** (abajo):
     - sin nombre, quitar y reducir se rechazan, y la venta sigue pagada con su descuento de $100;
     - con nombre, quitar la deja parcial y en cartera con $100.
   - Esta interpretación no es la opción (a) recomendada por el auditor, que bloqueaba también con
     nombre. Se eligió (b) por coherencia con BR-003. Queda para que Carlos la confirme.
2. **VEN-M1 — ¿Una venta cancelada muestra su total bruto?** **CORREGIDO** (decisión B (a) del
   auditor, en su variante "no cancelar el descuento"):
   - `cancelarVenta` ya no cancela el descuento; queda como parte del ticket cancelado;
   - además, `recalcularCacheDescuentoVentaEnTx` ya no escribe en una venta que no esté vigente;
   - ningún reporte la cuenta, porque todos filtran `estatus = 'vigente'`.
   - Prueba **VEN-M1**: la venta de $500 con 15 % queda cancelada con total $425 y su descuento de
     $75 visible.
   - FR-009 del spec queda corregido en el addendum de la auditoría.
   - Regla heredada a CIT-C1: cancelar un servicio cerrado no debe reescribir sus cachés de
     descuento.
3. **VEN-B1 — ¿Cuatro lectores de `ventas_mostrador`?** **CORREGIDO en lo que importaba.**
   - Las dos carteras (Resumen y Finanzas) leen ahora un solo lector: `ventasMostrador.ventasConSaldo`,
     con el saldo calculado y no la caché de estatus.
   - `saldosPorCliente` sigue en `cobros.ts`, porque es la definición única del saldo de una
     clienta (condición 6 del Gate del cobro).
   - `ventasDelRango` es el lector de ventas por periodo.
   - Censo (salida literal):
     ```
     $ grep -rn "from(ventasMostrador)" electron/services | cut -d: -f1 | sort | uniq -c
       10 electron/services/cobros.ts
        1 electron/services/comprobantes.ts
        9 electron/services/ventasMostrador.ts
     ```
   - Lo que hace cada archivo:
     - **`cobros.ts`:** lee la fila para el estatus, la caché, el abono, los descuentos, BR-003,
       VEN-A1 y `saldosPorCliente`.
     - **`comprobantes.ts`:** lee la clienta para decidir la carpeta del comprobante.
     - **`ventasMostrador.ts`:** lee la cabecera, el detalle, las listas, `ventasDelRango` y
       `ventasConSaldo`.
   - Ningún reporte lee la tabla por su cuenta.
4. **VEN-B2 — ¿Greps del Gate que fallan literalmente?** **SE CONCEDE; no se tocó código para
   "arreglarlos".** Las condiciones se cumplen así:

   | Condición | Por qué el grep literal no da lo esperado |
   |---|---|
   | 2 | Hay 3 `ALTER TABLE`: un `ADD` y dos `RENAME`. Además, `UPDATE` solo aparece en `ON UPDATE no action`; no hay sentencias `UPDATE`. |
   | 3 | `schemas.ts` usa el camelCase `ventaMostrador…` (6 coincidencias). |
   | 6 | El `throw` de BR-003 está en la línea siguiente a la condición. |
   | 7 | El rechazo del tipo venta está en la línea siguiente a la firma de `registrarSalida`. |
   | 9 | `types.ts` usa `VentaMostrador` con mayúscula (5 coincidencias). |
   | 11 | Finanzas lee vía `ventasConSaldo` (VEN-B1) y Clientes vía `saldosPorCliente`. |
5. **VEN-B3 — ¿El mensaje de `eliminarCliente` está desactualizado?** **CORREGIDO**: ahora dice
   "citas, servicios, pagos, compras de productos o ficha clínica".
6. **VEN-B4 — ¿El doble envío no está declarado en el spec?** **CORREGIDO**: está declarado en el
   addendum de la auditoría del spec (§9).
   - El botón se deshabilita mientras se registra.
   - El modal se cierra al registrar, aunque falle el comprobante.
   - El diálogo de "sin comprobante" es modal.
7. **VEN-B5 — ¿El importe por producto puede diferir un centavo del total?** **CORREGIDO de raíz**:
   una venta es siempre en piezas enteras.
   - `lineaVentaMostradorSchema.cantidad` es `int`, y la UI lo avisa antes.
   - Con cantidades enteras y el mismo precio, el importe agrupado es igual a la suma de las líneas.
   - Prueba **VEN-B5**: 1.5 piezas se rechazan.
8. **VEN-B6 — ¿Queda un comprobante huérfano si todo termina en efectivo?** **CORREGIDO**: el token
   solo viaja si algún pago no es en efectivo. Si no viaja, el modal lo descarta al cerrarse, igual
   que antes.

## 13a — Radiografía sobre la copia del respaldo real (`0004`…`0008` en un solo lote)
- **Antes de migrar.** La copia está en la `0003`:
  ```
  migr|4
  (PRAGMA foreign_key_check: sin filas)
  pagos|cobrado|21|13021.0
  con_comprobante|0
  sin_srv|0
  salidas|1
  ok                      ← integrity_check
  ```
- **Migración.** Con el mismo `initDb` de la app y la copia de seguridad previa automática:
  `migrate ok`.
- **Después de migrar:**
  ```
  migr|9
  fk_check_filas|0
  pagos|cobrado|21|13021.0
  con_comprobante|0
  sin_srv|0
  salidas|1
  ok
  concepto|servicio|21
  con_corte|11
  venta_id_no_null|0
  ventas|0
  descuentos|0
  fk|cancelado_por|RESTRICT     fk|cita_id|RESTRICT        fk|cliente_id|RESTRICT
  fk|comprobante_archivo_id|SET NULL                       fk|corte_cancelacion_id|RESTRICT
  fk|corte_id|RESTRICT          fk|servicio_realizado_id|RESTRICT
  fk|usuario_id|SET NULL        fk|venta_mostrador_id|RESTRICT
  idx|descuentos_servicio_manual_vigente_uq   idx|descuentos_servicio_servicio_idx
  idx|descuentos_servicio_venta_manual_vigente_uq
  idx|pagos_cita_idx   idx|pagos_corte_idx   idx|pagos_servicio_realizado_idx
  notnull_cliente|0
  salida_fk|RESTRICT
  ck_renombrado|1
  ```
  - `con_corte` no existe antes de la `0005`; los 11 los liga el backfill de esa migración. Es la
    misma cifra de la evidencia de la `0006`.
- **Reglas del esquema** (verificación 3 de la cabecera), sobre la copia migrada, cada una dentro
  de `BEGIN … ROLLBACK`:
  ```
  Error: stepping, UNIQUE constraint failed: descuentos_servicio.venta_mostrador_id, descuentos_servicio.aplica_a (19)
  Error: stepping, CHECK constraint failed: descuentos_servicio_destino_ck (19)
  pago sin clienta ok
  Error: stepping, FOREIGN KEY constraint failed (19)
  ventas tras rollback|0
  ```
- **Hallazgo previo a la auditoría, ya corregido en la cabecera (decisión 2).** drizzle-kit 0.31
  listaba la columna nueva en el `SELECT` de la tabla vieja. Con el `better-sqlite3` del proyecto,
  eso falla así:
  ```
  insert error: no such column: "v_id" - should this be a string literal in single-quotes?
  ```
  Habría revertido el lote entero al abrir la app.
  - En la misma prueba se confirmó que un `CHECK` calificado con `"__new_…"` se reescribe al hacer
    `RENAME` y sigue vigente.
- **Nota del harness.** La primera corrida de la radiografía aplicó solo 8 migraciones, porque la
  carpeta `drizzle` del harness era una copia vieja.
  - Se comparó: `0004`…`0007` son idénticas a las del repo (`cmp`), así que la evidencia de la ficha
    sigue valiendo.
  - La copia se reemplazó por un enlace al repo.

## 13b — Pruebas funcionales: salida literal de la última corrida
```
migraciones: 9
PASA AC-001 — VTA-0001 pagado; stock 20 → 18; pendiente de corte +500; ventas del día +500
PASA AC-002 — "Sin clienta, la venta se paga completa: faltan $100.00."; stock y pagos sin cambio
PASA AC-003 — parcial: parcial; nombre con clienta → null; saldo de la clienta +300; en cartera: true; abono $300 → pagado
PASA AC-004 — total 425 (pagado); descuentos primera visita +75; 50 % después de cobrar: "Con este descuento el total quedaría en $250.00, pero ya se cobraron $425.00. Para descontar más, primero cancela un pago."
PASA AC-005 — PIN incorrecto: "El PIN de acceso no es correcto." (sin cambios: true); cancelada: cancelada; pagos cobrados 0; salidas vigentes 0; stock +1; ajuste del próximo corte -300; ventas del día −300; dos veces: "Esta venta ya estaba cancelada."
PASA AC-006 — archivo en Datos/Comprobantes/Ventas: true; ligado al pago: true; tarjeta sin comprobante ni confirmación: "Este cobro no es en efectivo y no tiene comprobante. Elige el comprobante o confirma que continúas sin él."
PASA AC-008 — salida suelta tipo venta: "Las ventas se registran con "Vender producto", para que su dinero entre al corte." | cancelar desde Movimientos: "Esta salida es de una venta de mostrador; se cancela desde la venta, no desde Movimientos."
PASA AC-009 — "Stock insuficiente de Crema prueba pB: disponible 1, se necesitan 3."; stock del otro producto sin cambio: true; ventas sin cambio
PASA AC-011 — sin nombre: "Esta venta no tiene clienta ni nombre de referencia: cancela la venta completa." | con nombre: parcial, en cartera $100 "(sin registro)": true; abono → pagado
PASA AC-012 — precio 0: [zod] "El precio debe ser mayor a $0. Para regalar, usa un descuento de cortesía." | 100 % cortesía: total 0, pagado, 0 pagos; descuentos cortesía +250
PASA BR-002/004/009 — pago sin clienta fuera de venta: "Este pago necesita una clienta." | producto inactivo: "Crema prueba pB está desactivado; no se puede vender." | 13 filas de bitácora de ventas, con nombres: 0
PASA VEN-A1 — sin nombre — quitar: "Esta venta no tiene clienta ni nombre de referencia y quedaría debiendo. Para cambiar el precio, cancela la venta y regístrala de nuevo." | reducir: rechazado true; queda pagado con descuento 100 | con nombre — quitar: parcial, en cartera $100
PASA VEN-M1 — cancelada: total 425, descuentos visibles 1 ($75)
PASA VEN-B5 — 1.5 piezas: rechazado true
PASA AC-010 — reinicio: sin error; ventas 0, pagos 0

15/15 pasan
```
- El mensaje de AC-012 sale como un arreglo JSON de zod; aquí se abrevió a `[zod] "…"`.
- AC-007 es la radiografía 13a.
- La bitácora se revisó buscando el nombre de la clienta de prueba y el nombre de referencia en
  todas las filas `venta_*` y en las de entidad `venta_mostrador`: hay 0 coincidencias.

## Censo después del cambio
- **Escritores de la cabecera fuera de su dueño:**
  ```
  $ grep -rn "insert(ventasMostrador)\|update(ventasMostrador)" electron/services | grep -v "ventasMostrador.ts\|cobros.ts" | wc -l
  0
  ```
- **`cobros.ts` no importa el módulo de ventas:** `grep -c 'from "./ventasMostrador"' electron/services/cobros.ts` → 0.
- **`ventasMostrador.ts` no escribe columnas derivadas:**
  `grep -n 'estatusPago\|descuento:' electron/services/ventasMostrador.ts | grep -c 'set('` → 0.
- **Lectores de `pagos` fuera de `cobros.ts` y `corte.ts`:** solo `ventasMostrador.ts`, en la
  cancelación, para listar los pagos cobrados de la venta. `exportarCsv.ts` no lee `pagos`.
- **El Inicio no cuenta ventas en "servicios" ni en el ticket promedio (A-003):**
  `grep -c ventasMostrador electron/services/dashboard.ts` → 0.
  - "Cobrado hoy" y "pendiente de corte" sí las cuentan, porque se leen por `fuente`.
- **Corte sin cambios.** `corte.ts` no se tocó; AC-001 y AC-005 prueban que cuenta los pagos de
  venta y su ajuste.
- **Superficies intactas:** `respaldos.ts` no cambió (comprime la BD y `Datos/` completos);
  `serviciosRealizados.cerrarCita` no cambió, y sus pagos siguen con clienta (BR-002).
- **Sin dependencias nuevas:** `git diff -- package.json` → vacío.

## Estado del árbol de trabajo
- Todo sin commit en `atlas/venta-mostrador`. PROJECT.md (`sensitive_globs`) lo editó Carlos.
- `npm run typecheck` y `npm run build` pasan después de las correcciones.
- **Pendiente antes del tag** (release con `0004`…`0008`):
  - las pruebas manuales de Carlos en `npm run dev`: Parte A, descuentos, ficha y esta venta;
  - la fila de `APPLIED-MIGRATIONS.md` cuando se instale en la cabina;
  - que Carlos confirme la interpretación de VEN-A1.
