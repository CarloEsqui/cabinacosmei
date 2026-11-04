# Feature Specification — Cancelación de entradas y salidas de inventario (R2b-inventario) (2026-11-04)

## 1. Feature
**Name:** Cancelar entradas y salidas sueltas capturadas por error (DAT-A2; R2 de la usuaria: "no se
puede eliminar una salida").
**Status:** Draft, listo para Gate 001.
**Owner:** Carlos.

## 2. Problem
- **Current Situation.** No existe ningún camino para cancelar ni borrar entradas o salidas: no hay
  IPC (`shared/ipc-contract.ts`, solo `registrarEntrada`/`registrarSalida`), ningún servicio hace
  `delete` sobre esas tablas y Movimientos es de solo lectura
  ([auditoría DAT](auditoria-integridad-datos-2026-11-03.md) §1.5, DAT-A2).
- **Problem.** Una entrada capturada por error (producto, cantidad o lote equivocado) se queda para
  siempre:
  - infla el stock y las compras;
  - el lote no se puede borrar (DAT-B7);
  - el producto no se puede borrar porque tiene historial;
  - "corregir" con otra entrada u otra salida ensucia más los datos.

  Lo mismo pasa con una merma o un ajuste equivocados, incluida una "Dar de baja" accidental (DAT-A5).
- **Impact.** Stock, valor del inventario, compras y mermas falsos en reportes. Carlos lo reportó en
  la prueba manual del 2026-11-04.

## 3. Desired Outcome
Desde Movimientos, una entrada o salida equivocada se **cancela** con un motivo. El stock vuelve a
como estaba, el documento queda visible pero tachado, y ningún reporte lo cuenta. Nada se borra.

## 4. Users and Roles
Operadora única con la app desbloqueada. **Sin PIN** (decisión de Carlos); motivo obligatorio y
confirmación.

## 5. Scope
**In:**
- cancelar una **entrada** si nada de ella se ha consumido;
- cancelar una **salida suelta**: tipos merma, devolución, uso interno, ajuste o venta registrada
  desde el formulario de salidas, **sin** `servicio_realizado_id`;
- filtro `vigente` en todas las lecturas;
- UI en Movimientos.

**Out:**
- **salidas ligadas a un servicio** (consumo y venta del cierre de cita): su reversa es la de un
  servicio cerrado completo (CIT-C1), que depende de la cancelación de pagos del cobro v2 y tendrá
  su propio Gate;
- editar una entrada o salida (se cancela y se vuelve a capturar);
- borrar un lote o un producto.

## 6. Functional Requirements
- **FR-001 — `cancelarEntrada(id, motivo)`.** En una transacción:
  - rechaza si ya está cancelada, si el motivo está vacío, o si `lote.cantidad_disponible <
    entrada.cantidad` ("ya se usó parte de este lote: cancela primero esas salidas");
  - lote: `cantidad_disponible -= q`, `cantidad_inicial -= q`; si queda en 0, `agotado`;
  - movimiento nuevo `cancelacion_entrada` con `cantidad = -q`;
  - la entrada pasa a `cancelada` con fecha, motivo y usuaria;
  - bitácora `entrada_cancelada`.
- **FR-002 — `cancelarSalida(id, motivo)`.** En una transacción:
  - rechaza si ya está cancelada, si el motivo está vacío, o si `servicio_realizado_id` no es nulo
    (fuera de alcance, mensaje claro);
  - lote: `cantidad_disponible += q`; si estaba `agotado` vuelve a `activo`; si estaba `bloqueado`
    se queda así; `cantidad_inicial` intacta;
  - movimiento `cancelacion_salida` con `+q`;
  - la salida pasa a `cancelada`;
  - bitácora `salida_cancelada`.
  - Una salida de varias filas (mismo folio, varios lotes) se cancela **por folio completo**, todas
    sus filas juntas.
- **FR-003 — Lecturas.** Toda lectura de `entradas_inventario` o `salidas_inventario` que cuente
  stock, compras, ventas, consumos o mermas filtra `estatus = 'vigente'`. `listarMovimientos` muestra
  el original **y** su cancelación.
- **FR-004 — UI.** En Movimientos, acción "Cancelar…" en entradas y salidas sueltas vigentes:
  - confirmación con el motivo como campo obligatorio;
  - las filas canceladas se ven en gris, tachadas, con su motivo;
  - las salidas ligadas a una cita no ofrecen la acción y muestran "se corrige desde la cita".

## 7. Business Rules
- **BR-001** — Nunca `DELETE` de entradas, salidas ni movimientos. Folio, valor y costo originales
  intactos (CFF art. 30).
- **BR-002** — Invariante de lote: `cantidad_disponible = Σ entradas vigentes − Σ salidas vigentes`.
  Es la misma consulta de verificación de la auditoría DAT (§6), extendida con `estatus`.
- **BR-003** — Una entrada solo se cancela si su cantidad completa sigue disponible en el lote.
- **BR-004** — Las salidas ligadas a un servicio realizado no se cancelan por esta vía.

## 8. Data (propuesta técnica)
Migración **`0004`** (pasa a ser la siguiente; el cobro v2 se vuelve `0005`/`0006`, ver §11). Con
cabecera auditada (`templates/migration-header.sql`). Solo `ALTER TABLE … ADD COLUMN`, sin
recreación:
- `entradas_inventario` y `salidas_inventario` agregan:
  - `estatus TEXT NOT NULL DEFAULT 'vigente'`;
  - `cancelada_at INTEGER`;
  - `cancelada_motivo TEXT`;
  - `cancelada_por_usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL`.
- Backfill: ninguno (el DEFAULT deja todo como `vigente`).
- Los enums viven en zod y en el servicio, no en CHECK (misma regla que la condición 2 del Gate de
  cobro).

## 9. Lecturas a migrar (censo 2026-11-04, `grep -rn "from(entradasInventario)\|from(salidasInventario)" electron/services`)
- `reportesInventarioDetalle.ts`: 6 lecturas (compras, consumos, mermas, rotación).
- `reportesResumen.ts`: 2 (mermas y devoluciones del periodo y de la serie).
- `reportesFinanzas.ts`: 1 (compras / gasto en inventario).
- `serviciosRealizados.ts`: 2 (detalle de insumos y vendidos). Solo son salidas ligadas a un
  servicio, que no se pueden cancelar, pero se filtra igual por consistencia. **Archivo de
  superficie crítica (Dinero):** el cambio es una cláusula `WHERE`.
- `inventario.ts`: 4 (último costo, listado de movimientos, entrada recién creada y salidas recién
  creadas).
- `citas.ts`: 1 (`eliminarCita` busca salidas del borrador; una cancelada no debe bloquear).
- `proveedores.ts`: 1 (¿el proveedor tiene entradas?). Una cancelada **sigue** contando como
  referencia; se deja sin filtro.
- `movimientos` (`inventario.ts`, `listarMovimientos`): muestra todo, incluidas las filas de
  cancelación.

## 10. Acceptance Criteria
- **AC-001.** Entrada de 10 por error, sin uso → cancelar → stock −10, lote agotado, compras del
  periodo −(10 × costo), Movimientos muestra la entrada tachada y su cancelación.
- **AC-002.** Entrada de 10 con 3 consumidas → cancelar se rechaza con el mensaje de FR-001.
- **AC-003.** Merma de 5 (por ejemplo, una "Dar de baja" accidental) → cancelar → el lote recupera
  5 y vuelve a `activo`. Si estaba caducado, vuelve a "+X caducado".
- **AC-004.** Salida de consumo de un cierre de cita → la acción no se ofrece, y el servidor la
  rechaza si se llama por IPC.
- **AC-005.** Cancelar dos veces → rechazado. Motivo vacío → rechazado.
- **AC-006.** Después de cada AC, la consulta del invariante BR-002 devuelve 0 lotes inconsistentes.
- **AC-007.** `grep -rn "delete(entradasInventario)\|delete(salidasInventario)\|delete(movimientos)" electron/services`
  → solo `reinicio.ts`.

## 11. Constraints, decisiones y relación con otros diseños
- **Decisiones de Carlos (2026-11-04):** inventario antes que el cobro; cancelar **sin PIN**, con
  motivo obligatorio y confirmación.
- **Numeración:** esta migración ocupa `0004`. El [Gate del cobro v2](gate-001-modulo-cobro-2026-11-04.md)
  nombra `0004` (Parte A) y `0005` (Parte B); pasan a `0005` y `0006` con el mismo contenido, y sus
  condiciones 1 y 2 aplican a esos números.
- Migración automática en la máquina de la clienta, precedida por la copia de `respaldarAntesDeMigrar`
  (DAT-A4). Antes del tag, `APPLIED-MIGRATIONS.md` registra la fila.
- **Riesgo aceptado (sin PIN):** con la app abierta, cualquiera puede cancelar movimientos de
  inventario. No hay dinero directo, pero cambia stock, compras y mermas. Mitigación: motivo
  obligatorio, bitácora y filas tachadas visibles en Movimientos. La bitácora registra cuándo, no
  quién (un solo usuario, SEG-A1).

## 12. Reversibility
Columnas aditivas con DEFAULT; la versión anterior de la app las ignora. **Reversible a bajo costo.**
