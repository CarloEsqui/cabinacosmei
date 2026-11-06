# Evidencia para auditoría — Descuentos en el cierre y cambio de servicio (2026-11-06)

**Responde a:** [auditoria-descuentos-2026-11-06.md](auditoria-descuentos-2026-11-06.md) (DES-A1, M1,
B1–B5). Cierra la condición 11b del [Gate](gate-001-descuentos-2026-11-06.md).

**Responsable:** sesión de Claude Code del 2026-11-06, rama `atlas/descuentos`. Los comandos de git
los corre Carlos.

**Método y PII:**
- **Pruebas de aceptación.** Corrieron sobre una **copia** de la BD de desarrollo, que solo tiene
  datos ficticios, en el scratchpad de la sesión (`/private/tmp`). Cada corrida usa una copia nueva.
  `carpetaRaiz` apunta a una carpeta de prueba.
- **Respaldo real de la cabina** (automático diario del 2026-11-05).
  - Se copió en modo solo lectura (`chmod 444`) al scratchpad, fuera del repo y fuera de la carpeta
    de datos.
  - Las migraciones se aplicaron sobre una segunda copia escribible.
  - Aquí solo se reportan **conteos y estatus**: ningún nombre, monto individual ni código de clienta.
  - Las carpetas del respaldo tienen nombres de clientas: no se abrieron ni se copian aquí.
- **Cómo se ejecuta:** igual que la Parte A. Se importan los servicios reales de `electron/services/*`
  y el mismo zod que usa el IPC; se empaqueta con esbuild
  (`--external:better-sqlite3 --external:electron`) y corre con
  `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron`.

## RESPUESTAS a los hallazgos

1. **DES-A1 — ¿Existe la evidencia de la condición 11b?** **CORREGIDO: es esta nota.** La salida
   literal de la última corrida, sobre una copia limpia y después de las correcciones DES-B3 y DES-B4:
   ```
   PASA AC-001 — total 850, pagado, pagos 1, corte efectivo +850
   PASA AC-002 — total 870 (servicio −80, productos −50), pagado
   PASA AC-003 — parcial → pagado, saldo 0, pagos 1/850 → 1/850, corte sin cambio
   PASA AC-004 — rechazo: "Con este descuento el total quedaría en $850.00, pero ya se cobraron $1000.00. Para descontar más, primero cancela un pago."; nada escrito: true
   PASA AC-005 — parcial, saldo 150, fila cancelado, bitácora 1
   PASA AC-006 — servicio realizado y cita con el servicio nuevo: true; próxima 2031-03-31 (esperada 2031-03-31); bitácora 1
   PASA BR-001 — cambiar = cancelar el anterior + aplicar: vigentes 1 ($80), cancelados 1, caché 80
   PASA BR-002 — rechazos: "El descuento no puede ser mayor que $500.00." | (zod) "El porcentaje no puede pasar de 100 %." | (zod) "Escribe el motivo del descuento." | "Productos: No hay monto sobre el cual aplicar el descuento."
   PASA BR-010 — cita abierta: "El descuento de una cita abierta se aplica al cerrarla."
   PASA BR-006 — descuento mayor que el precio en el cierre: "El descuento no puede ser mayor que $300.00."
   PASA DES-B4 — servicio desactivado: "Ese servicio está desactivado; elige otro."
   PASA AC-007 — filas que rompen el invariante: 0
   PASA AC-008 — ventas Finanzas 850, Resumen 850; descuentos 150; por motivo [{"motivo":"primera_visita","etiqueta":"Primera visita","monto":150,"cantidad":1}]
   13/13 pasan
   ```
   - **Se concede un matiz:** la primera corrida dio 11/12. AC-002 falló porque **el spec tenía mal
     la suma**: decía $670 y lo correcto es (800 − 80) + (200 − 50) = $870. Se corrigió el spec (§18,
     con nota de la corrección) y la prueba. El código no cambió por esto.
   - En BR-002, dos rechazos los da zod antes de llegar al servicio, con un mensaje en formato JSON
     de zod. Es el mismo camino del IPC. En la UI no se pueden alcanzar, porque `DescuentoCampo`
     valida antes de enviar.
   - **AC-007**, consulta literal (también está en la verificación de `0006_descuentos.sql`):
     ```sql
     SELECT s.id FROM servicios_realizados s
     WHERE ABS(s.descuento_servicio - COALESCE((SELECT SUM(d.monto) FROM descuentos_servicio d
             WHERE d.servicio_realizado_id = s.id AND d.estatus = 'aplicado' AND d.aplica_a = 'servicio'), 0)) >= 0.005
        OR ABS(s.descuento_productos - COALESCE((SELECT SUM(d.monto) FROM descuentos_servicio d
             WHERE d.servicio_realizado_id = s.id AND d.estatus = 'aplicado' AND d.aplica_a = 'productos'), 0)) >= 0.005;
     ```
     Resultado: 0 filas, después de los 13 casos, que incluyen un reemplazo y una cancelación.
   - **AC-009:**
     ```
     $ grep -rn "descuentosServicio\|descuentoServicio:\|descuentoProductos:" electron | grep -E "insert\(|update\(|delete\(|\.set\(" | grep -v "electron/services/cobros.ts\|electron/services/reinicio.ts"
     (sin salida; exit 1)
     ```
     `reinicio.ts` borra la tabla completa al reiniciar los datos (condición 8). Esa es su única escritura.
   - **Migración sobre el respaldo real** (`0004` + `0005` + `0006` juntas, partiendo de `0003`):
     ```
     migraciones: 7
     estatus: abierto/pendiente 6, cerrado/pagado 19, cerrado/parcial 2
     descuentos y caché en 0: { d: 0, c: 0 }
     primera visita corregida con el saldo exacto: pagado
     corte pendiente sin cambio: true
     estatus final: abierto/pendiente 6, cerrado/pagado 20, cerrado/parcial 1
     ```
     - Antes de la corrección, los estatus son los mismos que con la `0005` sola (ver
       [COB-A1](evidencia-cobro-v2-parte-a-2026-11-05.md)). La `0006` no cambia ningún dato.
     - La corrección es la que hará la cosmetóloga desde el detalle de la cita: un descuento en
       modo `$` por el saldo exacto, con motivo "Primera visita".
     - Se dejó sin corregir el otro "parcial", el de una visita posterior: decidir si fue descuento o
       adeudo le toca a la dueña.
2. **DES-M1 — ¿Qué regla hereda CIT-C1 para los descuentos?** **REGISTRADA, sin código.** Se agregó
   el addendum del 2026-11-06 en el [spec](spec-descuentos-2026-11-06.md). La regla:
   - la reversa pasa por `cobros.ts`;
   - cancela o vuelve a aplicar los descuentos;
   - lo hace antes de `recalcularEstatusEnTx` y en la misma transacción.

   Hoy es inalcanzable, como dice el auditor: `inventario.ts:733-735` rechaza cancelar ventas ligadas
   a un servicio.
3. **DES-B1 — ¿Los greps del Gate cuentan la cabecera?** **SE CONCEDE.** Esta es la forma
   reproducible, sin comentarios:
   ```
   $ grep -v "^--" drizzle/0006_descuentos.sql | grep -c "CHECK"                                   → 2
   $ grep -n "CHECK" drizzle/0006_descuentos.sql | grep -v ":--" | grep -c "tipo\|aplica_a\|modo\|motivo"   → 0
   $ grep -v "^--" drizzle/0006_descuentos.sql | grep -c "ALTER TABLE"                             → 2
   $ grep -cE "^\s*UPDATE " drizzle/0006_descuentos.sql                                            → 0
   $ grep "CREATE UNIQUE INDEX" drizzle/0006_descuentos.sql | grep -c "WHERE"                      → 1
   ```
   El patrón `UPDATE ` también da 2 sin comentarios, pero son los `ON UPDATE no action` de las dos
   llaves foráneas que emite drizzle-kit (líneas 97 y 98). No hay ninguna sentencia `UPDATE`.
4. **DES-B2 — ¿Hay una tercera copia del redondeo?** **CORREGIDO en parte, el resto diferido como
   propone el auditor.**
   - `shared/descuentos.ts` exporta `redondearDinero`, con el mismo cuerpo `Number.EPSILON`.
   - El código nuevo lo usa:
     - `reportesFinanzas.ts`, en los tres totales de descuentos;
     - `PagosDeCita.tsx`, en el total nuevo, el máximo y el saldo nuevo.
   - Ya no queda ningún `Math.round(x * 100) / 100` sin `EPSILON` en esos archivos:
     `grep -n "Math.round(.*100" src/pages/agenda/PagosDeCita.tsx electron/services/reportesFinanzas.ts`
     no devuelve nada.
   - `cobros.redondearDinero` y `LineasPago.redondear` (COB-B2) siguen idénticos. Unificarlos queda
     para antes de la Parte B, en su propio cambio.
5. **DES-B3 — ¿Se puede cerrar con la receta del servicio anterior?** **CORREGIDO.**
   - `CierreCitaModal.tsx`: `recetaCargadaDe` pasa de `ref` a estado, y `listoParaCerrar` exige
     `recetaLista`.
   - Se usó estado y no `ref` a propósito. Con un `ref` el botón no se volvería a pintar cuando el
     servicio nuevo no tiene receta, y se quedaría bloqueado.
6. **DES-B4 — ¿El servidor acepta un servicio desactivado?** **CORREGIDO.** `cerrarCita` rechaza
   `cambioDeServicio && !servicioCat.activo`. Probado con el caso DES-B4 de arriba.
7. **DES-B5 — ¿`duracion_min` al cambiar el servicio?** **DECLARADO, sin cambio**, en el addendum
   del spec.

**Cierres operativos del día:**
- **COB-A1, condición 3 (radiografía de la `0005` sobre el respaldo real):** cumplida. Está en la
  [evidencia de la Parte A](evidencia-cobro-v2-parte-a-2026-11-05.md).
- **El comentario "candado de comprobante" de `schema.ts`** (pendiente desde la Parte A) se corrigió
  en esta migración, como estaba previsto.
- `npm run typecheck` y `npm run build` pasan después de DES-B2, B3 y B4.

## Censo después del cambio
Lectores de dinero que pasan por `totalTicket`, `saldoServicio` o `ingresoDelServicio`. El tipo
exige los descuentos, así que el compilador los encontró todos:

| Lector | Estado |
|---|---|
| `cobros.ts` | Define, escribe y lee. `saldosPorCliente`, `recalcularEstatusEnTx` y `estadoCuentaCita` ya incluyen los descuentos. |
| `citas.ts` | Selecciona las dos columnas. Con el `leftJoin` pueden ser `null`, y se tratan como 0. |
| `dashboard.ts`, `reportesResumen.ts` (×2), `reportesFinanzas.ts` (×2), `reportesClientesDetalle.ts` | Seleccionan las dos columnas. |
| `reportesServiciosDetalle.ts` | Selecciona `descuentoServicio`. Su `ingresoDelServicio` es neto del descuento del servicio. |
| `serviciosRealizados.ts` | `cerrarCita` calcula el total neto. `obtenerDetalle` devuelve `precio` bruto y `total` neto (condición 6). |
| `corte.ts` | **INTACTO.** Solo lee `pagos`; un descuento no es pago (BR-004). |
| `clientes.ts` | **INTACTO.** Usa `saldosPorCliente` de `cobros.ts`. |
| `exportarCsv.ts` | **INTACTO.** Consume `reporteFinanzas` y demás servicios, que ya son netos. |

## Estado del árbol de trabajo
- **Rama `atlas/descuentos`**, creada sobre `atlas/selector-buscable` (commit `59843c6`).
- **Todo lo de descuentos está sin commit:** migración, código, notas y esta nota. Carlos hace el
  commit.
- **La BD de desarrollo de Carlos ya tiene la `0006` aplicada**, porque se abrió la app después de
  generarla. Con datos ficticios no importa. La cabecera de la `0006` se escribió después y no
  cambia su SQL.
- **Pendiente antes del tag** (release con `0004` + `0005` + `0006`):
  - la prueba guiada de Carlos en la app: la de la Parte A (AC-001…AC-004) más la de descuentos;
  - la confirmación escrita de la Decisión A (las ventas de meses pasados bajan al corregir);
  - la fila de `APPLIED-MIGRATIONS.md` cuando se instale en la cabina.
