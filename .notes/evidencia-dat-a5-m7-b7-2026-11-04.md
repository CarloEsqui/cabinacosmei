# Evidence — Lotes caducados sin baja posible (DAT-A5), stock inflado (DAT-M7) y "Eliminar lote" inútil (DAT-B7) (2026-11-04)

**Responde a:** reporte de Carlos en prueba manual ("los caducados siguen sumando y no hay forma de
eliminarlos; desactivar no sirve") y a DAT-B7 de
[auditoria-integridad-datos-2026-11-03.md](auditoria-integridad-datos-2026-11-03.md).
**Códigos nuevos (addendum a la serie DAT, nunca renumerar):**
- **DAT-A5:** un lote caducado no se puede sacar del inventario por ningún camino.
- **DAT-M7:** el stock total suma lotes caducados.

**Method / PII:** servicios reales empaquetados con esbuild y corridos con el Node de Electron contra
una BD de prueba desde `drizzle/`. Producto y lotes inventados; ninguna BD real abierta.

## Diagnosis (antes del cambio)
- **DAT-A5.** `registrarSalidaEnTx` rechazaba cualquier salida de un lote caducado o bloqueado,
  **incluida la merma** ("Este lote está caducado y no puede usarse"). La selección automática
  FEFO/FIFO también los excluye. Resultado: las existencias caducadas quedaban para siempre, en la
  lista de caducados y en el Dashboard. "Desactivar el producto" solo lo ocultaba del Resumen.
- **DAT-M7.** `resumenInventario` sumaba `cantidad_disponible` de todos los lotes activos sin mirar
  la caducidad, así que el total, el semáforo y el valor del inventario incluían lo caducado.
- **Inconsistencia de regla.** La lista de caducados tomaba `fecha ≤ hoy`, mientras que las salidas
  permiten usar el lote el día de su fecha (`fecha < hoy` = caducado). Un lote que vencía hoy
  aparecía "caducado" pero se podía consumir.
- **DAT-B7.** El bote de basura de cada lote siempre terminaba en "Bloquear en su lugar", porque
  todo lote tiene su entrada (FK).

## Fix applied
- `darDeBajaLote(loteId, motivo?)` (IPC `inventario:darDeBajaLote`): en una transacción registra
  como **merma** todo lo que queda del lote. El lote queda en 0 y `agotado`. Movimiento, costo y
  bitácora quedan como en cualquier salida, y el motivo por defecto es "Baja por caducidad". Nada se
  borra.
- En `registrarSalidaEnTx`, con lote fijo, **merma y devolución** pueden tomar un lote caducado o
  bloqueado. Para usarlo (consumo, venta, uso interno, ajuste) sigue prohibido.
- Regla única: **un lote caduca al día siguiente de su fecha.** Caducados = `fecha < hoy`; próximos
  = `fecha ≥ hoy`.
- `resumenInventario`:
  - `stockTotal` cuenta solo lotes activos **no caducados**;
  - nuevo `stockCaducado`, que el Resumen muestra como "+X caducado" en rojo;
  - la próxima caducidad ignora los lotes ya caducados.
- UI:
  - botón "Dar de baja" en Inventario → Caducidad;
  - en el detalle de lotes del Resumen, "Dar de baja" reemplaza al bote de basura (DAT-B7: se quita
    el botón que nunca podía funcionar);
  - insignias "Caducado" y "Agotado".

## E2E — servidor (proxy fiel); UI pendiente (Carlos)
Lotes: VENCIDO (ayer, 5), HOY (hoy, 3), VIGENTE (+60 días, 10).
```
Resumen: stockTotal = 13 (esperado 13) | stockCaducado = 5 (esperado 5) | próxima caducidad = hoy
Caducados: [ 'VENCIDO' ] | Próximos: [ 'HOY' ]
1 consumir del lote VENCIDO → RECHAZADO: Este lote está caducado y no puede usarse.
2 consumir del lote HOY → OK
3 dar de baja VENCIDO → OK
   lote: agotado 0 | merma: [ { tipo: 'merma', cant: 5, valor: 50, obs: 'Baja por caducidad' } ]
4 dar de baja VENCIDO otra vez → RECHAZADO: Este lote ya no tiene existencias.
Resumen tras baja: stockTotal = 12 | stockCaducado = 0 | caducados: 0
5 dar de baja lote BLOQUEADO vigente → OK
   VIGENTE: agotado 0
Resumen final: stockTotal = 2 (esperado 2: HOY 3−1) | stockCaducado = 0
```
`npm run typecheck` → exit 0.

## Post-fix census
- Consumidores de `stockTotal`:
  - `Dashboard.tsx` (stock bajo) y el semáforo ahora ven solo stock usable (correcto);
  - `Resumen.tsx:88`: el valor del inventario ya no incluye caducados (correcto: lo caducado es
    pérdida, se ve en la merma);
  - `exportarCsv.ts:192`: exporta el stock usable. Archivo de superficie PII: no se editó; hereda el
    cambio.
- `eliminarLote` (IPC) sigue existiendo, pero ninguna pantalla lo llama. Se deja para no tocar la
  superficie; candidato a RETIRED.
- La merma ya cuenta en los reportes: `reportesResumen.ts:87-93` suma `salidas_inventario.valor` de
  tipo merma y devolución.

## Anexo — "Desactivar en su lugar no funciona" (mismo reporte de Carlos)

**Diagnóstico:** `productos.listar()` devuelve activos e inactivos, y los selectores de producto no
filtraban:
- `EntradaForm.tsx`;
- `SalidaForm.tsx`;
- `CierreCitaModal.tsx` (insumos y vendidos).

Además, Configuración → Productos mostraba todo por defecto. Un producto desactivado seguía
apareciendo en todas partes.

**Fix:**
- Los tres selectores muestran `p.activo || p.id === <ya elegido>`. El ya elegido se conserva, por
  ejemplo si viene en la receta de un servicio.
- Configuración → Productos arranca con el filtro "Activo"; los inactivos siguen a un clic.
- `CierreCitaModal.tsx` es un archivo de superficie crítica (Dinero). El cambio solo filtra las
  opciones del `<select>`; no toca cálculo ni escritura.

`npm run typecheck` → exit 0. E2E en UI: lo hace Carlos.
