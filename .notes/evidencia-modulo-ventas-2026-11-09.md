# Evidencia para auditoría — Módulo Ventas y regla sin crédito (2026-11-09)

**Responde a:** [auditoria-modulo-ventas-2026-11-09.md](auditoria-modulo-ventas-2026-11-09.md)
(VMD-B1…B4; veredicto APTO PARA INTEGRAR, C0 / A0 / M0 / B4). Diseño y decisiones del dueño:
[spec de la venta, §23](spec-venta-mostrador-2026-11-06.md).

**Responsable:** sesión de Claude Code del 2026-11-09. Los comandos de git los corre el dueño.

**Método y PII:**
- Las pruebas funcionales corrieron sobre una **copia** de la BD de desarrollo, que solo tiene
  datos ficticios. Es el respaldo automático previo a la `0008`, copiado al scratchpad de la sesión
  (`/private/tmp`).
  - `initDb` le aplica la `0008` (salida: `migraciones: 9`).
  - Los productos son de prueba (`pA` con 20 piezas, `pB` con 1), con un PIN de prueba.
  - Corren **dentro de Electron real** (`app.whenReady()`), con los servicios reales de
    `electron/services/*` y los esquemas zod del IPC, empaquetados con esbuild.
- No se abrió la BD real. No hay nombres en este documento.

## RESPUESTAS a los hallazgos

1. **VMD-B1 — ¿La spec conserva tramos que contradicen BR-003 estricta sin marcarlos?**
   **CORREGIDO.** Se marcaron "(Reemplazado en §23 …)" los cinco tramos:
   - §9, venta con nombre y un pago cancelado (tachado);
   - §20, Lista (A-004);
   - §20, cancelar un pago suelto sin clienta;
   - §22.3, fila `cancelarPago`;
   - §22.5, fila de cartera ("desde §23 no debería darse; si se diera, se muestra").

   BR-003, FR-006, FR-009, FR-011, §11, §12 y el addendum de VEN-A1 ya estaban al día.
2. **VMD-B2 — ¿El carrito se descarta sin aviso al cambiar la llave de montaje?** **CORREGIDO**
   con el segundo fix que propuso el auditor: llave estable, y el `inicio` se aplica con un efecto.
   - `Ventas.tsx`: `PuntoDeVenta` ya no recibe `key`, así que nunca se remonta. Recibe
     `inicioId = location.key` solo cuando llega un atajo (`?cliente=` o "Repetir venta") y sus
     datos ya cargaron. En cualquier otro caso recibe `null`.
   - `PuntoDeVenta.tsx`: cada `inicioId` se aplica una sola vez (`useRef`).
     - Con el carrito vacío, se aplica directo.
     - Con productos, primero pregunta "¿Reemplazar la venta en curso?" y ofrece "Reemplazar" o
       "Conservar la venta en curso".
   - Las dos secuencias del auditor:
     - **(a)** Con productos capturados llega un atajo: ahora pregunta antes de reemplazar.
     - **(b)** Se llegó por un atajo y luego se vuelve por el menú: `inicioId` es `null`, el
       componente sigue montado y el carrito se conserva.
   - **Matiz del auditor, concedido:** la promesa de §23.4 solo se cumplía entre pestañas. Ahora
     también se cumple entre navegaciones dentro de `/ventas`.
   - Salir del módulo (por ejemplo, a Inicio) sigue vaciando el carrito, como cualquier captura
     sin guardar. El comprobante elegido se descarta al desmontar.
3. **VMD-B3 — ¿El texto libre de "Otro" llega a la bitácora?** **ACEPTADO, informativo.**
   - Es el mismo patrón ya aceptado de `cancelarPago` y `quitarDescuento`.
   - El placeholder advierte "sin nombres ni datos de salud", y con los chips la exposición baja
     respecto al motivo libre obligatorio que había antes.
   - El *Reopen if* del auditor se adopta tal cual: si alguna exportación empieza a incluir
     `motivo_cancelacion` o `bitacora.detalle`.
4. **VMD-B4 — ¿`ventasPorCobrar` escala?** **DIFERIDO con umbral.** Para el volumen de una cabina
   es instantáneo. Se adopta el umbral del auditor: reabrir si
   `SELECT COUNT(*) FROM ventas_mostrador WHERE estatus='vigente' AND cliente_id IS NOT NULL`
   supera ~5 000 o la pestaña tarda en abrir.
   - El fix escrito sería filtrar `estatus_pago <> 'pagado'` en SQL y confirmar con el cálculo.

**Cierres operativos del día:** ninguno; no hubo cuentas, tokens ni limpiezas.

## TRABAJO — Regla sin crédito, motivo opcional y lecturas del módulo

### PASO 0 — Diagnóstico
Hallazgos del dueño al probar (spec §23.1):
1. Movimientos ofrecía "Cancelar…" en una salida de venta y luego la rechazaba (AC-008).
2. No se podía cancelar sin motivo.
3. Con nombre de referencia sí se permitía deuda sin clienta, y el dueño la prohíbe.
4. La venta estaba escondida.

La causa de (3) está confirmada en el código previo: `cobros.ts` tenía
`if (!v.clienteId && !v.nombreReferencia)` en `cancelarPago` y
`if (!v || v.clienteId || v.nombreReferencia) return;` en `exigirSinDeudaHuerfanaEnTx`.

### Cambio aplicado
- **Main:**
  - `cobros.ts`: las dos condiciones quedan solo por clienta;
  - `ventasMostrador.ts`: motivo opcional, `admiteSaldo`, `ventasPorCobrar` y
    `productosFrecuentes`;
  - `inventario.ts`: `listarMovimientos` agrega `ventaMostradorId` y `ventaFolio` con un
    `LEFT JOIN` de lectura;
  - `reportesResumen.ts`: solo el comentario;
  - IPC, preload y contrato: `ventas:porCobrar` y `ventas:frecuentes`.
- **Compartido:** `schemas.ts` (motivo opcional) y `types.ts` (`admiteSaldo` y `ProductoFrecuente`).
- **UI:**
  - nuevos: `pages/Ventas.tsx`, `ventas/PuntoDeVenta.tsx` y `ventas/PorCobrar.tsx`;
  - `VentaDetalleModal` (chips, Repetir venta, `panelInicial`), `ListaVentas`, `Movimientos`
    ("Ver venta"), `AppShell`, `App`, `Inventario` (sin pestaña Ventas), `Dashboard`, `Resumen` e
    `invalidar.ts`;
  - se borra `VenderProductoModal.tsx`.
- **Sin cambios a propósito:**
  - la migración `0008` y el esquema (`motivo_cancelacion` ya era nullable);
  - cancelar un **pago** suelto con clienta sigue pidiendo PIN y motivo (FR-006 del cobro);
  - los lectores de cartera (`ventasConSaldo`, Finanzas) se quedan defensivos, porque §23.3 decide
    mostrar en vez de esconder.

### Aplicación
No hay migración nueva. Verificación del contrato, al final del trabajo y con VMD-B1/B2 aplicados:

```
> npm run typecheck   →  tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.electron.json   (sin errores)
> npm run build       →  … dist-electron/preload.js  8.76 kB │ gzip: 1.64 kB
                         ✓ built in 4ms
                         exit=0
```

### Censo posterior
Salida literal de los greps sobre `electron`, `shared` y `src`:

```
## permitePagoSuelto            0
## VenderProductoModal          0
## tab=ventas                   0
## reglas sin clienta en main
electron/services/ventasMostrador.ts:154:    if (!clienteId && Math.abs(suma - total) > TOLERANCIA) {
electron/services/cobros.ts:177:    if (!v.clienteId) continue;
electron/services/cobros.ts:565:      if (!v.clienteId) {
electron/services/cobros.ts:1014:  if (!v || v.clienteId) return;
## llamadas a exigirSinDeudaHuerfanaEnTx
827:      exigirSinDeudaHuerfanaEnTx(tx, v.id);
867:      exigirSinDeudaHuerfanaEnTx(tx, v.id);
## admiteSaldo
electron/services/ventasMostrador.ts:406:    admiteSaldo: Boolean(v.clienteId),
shared/types.ts:675:  admiteSaldo: boolean;
src/components/ventas/VentaDetalleModal.tsx:176 / :207 / :211 / :265
## motivo opcional
shared/schemas.ts:304:  motivo: z.string().trim().max(120).optional(),     (cancelarVentaInputSchema)
## atajos a /ventas
AppShell.tsx:25 · VentaDetalleModal.tsx:134 (Repetir) · ListaVentas.tsx:114 (?cliente=) · Dashboard.tsx:244 · inventario/Resumen.tsx:176
```

Cada superficie del mecanismo:
- **Registrar** (`ventasMostrador.ts:154`): **INTACTA**. FR-005 ya exigía pago completo sin
  clienta.
- **Cancelar un pago** (`cobros.ts:565`): **cambiada**; rechaza sin clienta, con o sin nombre.
- **Aplicar o cambiar descuento** (`:827`) y **quitar descuento** (`:867`): **cambiadas** vía
  `exigirSinDeudaHuerfanaEnTx` (`:1014`).
- **`saldosPorCliente`** (`cobros.ts:177`): **INTACTA**. Es lectura y ya saltaba las ventas sin
  clienta.
- **`schemas.ts:211`** (`motivo` de `quitarDescuento`): **INTACTA**. Ya era opcional; aparece en el
  grep por la misma expresión.
- **Registrar abono** (`registrarAbonoVenta`): **INTACTO**. Solo baja el saldo, nunca lo crea.

### E2E — CERRADO
Corrida en Electron real sobre una copia nueva. Salida literal, recortada solo en el arreglo JSON
del error de zod de AC-012:

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
PASA AC-011 — sin nombre: "Esta venta no tiene clienta y no puede quedar debiendo: cancela la venta completa." | con nombre: "Esta venta no tiene clienta y no puede quedar debiendo: cancela la venta completa."; queda pagado con 2 pagos; en cartera: false
PASA AC-012 — precio 0: "[ … "message": "El precio debe ser mayor a $0. Para regalar, usa un descuento de cortesía." … ]" | 100 % cortesía: total 0, pagado, 0 pagos; descuentos cortesía +250
PASA BR-002/004/009 — pago sin clienta fuera de venta: "Este pago necesita una clienta." | producto inactivo: "Crema prueba pB está desactivado; no se puede vender." | 12 filas de bitácora de ventas, con nombres: 0
ventas por estatus: [{"estatus":"cancelada","neto":300},{"estatus":"vigente","neto":2075}]
PASA VEN-A1 — sin nombre — quitar: "Esta venta no tiene clienta y quedaría debiendo. Para cambiar el precio, cancela la venta y regístrala de nuevo." | reducir: rechazado true; queda pagado con descuento 100 | con nombre — quitar: "Esta venta no tiene clienta y quedaría debiendo. Para cambiar el precio, cancela la venta y regístrala de nuevo."; queda pagado con 100 | admiteSaldo sin clienta false, con clienta true
PASA VEN-M1 — cancelada: total 425, descuentos visibles 1 ($75)
PASA VEN-B5 — 1.5 piezas: rechazado true
PASA §23-1 sin motivo — PIN incorrecto sin motivo: "El PIN de acceso no es correcto." | cancelada, motivo null; stock +1; bitácora: "VTA-0011 · total $250.00 · 1 pago(s) cancelado(s) · motivo: sin motivo"
PASA §23-2 por cobrar — 1 venta(s); la nueva debe $200; todas con clienta y saldo: true; la ya pagada no aparece: true
PASA §23-3 frecuentes — primero pA con 13 piezas (vigentes en BD: 13)
PASA §23-4 movimientos — salida de VTA-0001: ventaMostradorId ok true, folio VTA-0001
PASA AC-010 — reinicio: sin error; ventas 0, pagos 0

19/19 pasan
```

- **AC-011 y VEN-A1** cambiaron de expectativa: **con** nombre de referencia ahora también se
  rechaza, que es la regla del dueño.
- Las demás son las mismas de la evidencia del 2026-11-06, más las cuatro de §23.
- **Matiz:** la corrida es anterior a la corrección de VMD-B2, que solo toca el renderer
  (`Ventas.tsx` y `PuntoDeVenta.tsx`). El main no cambió después de la corrida.
  - Lo que VMD-B2 promete se confirma en la prueba manual del dueño en `npm run dev`:
    1. capturar productos;
    2. ir a la ficha de una clienta y picar "Vender producto";
    3. debe preguntar antes de reemplazar.

## Estado del working tree

Todo sin commitear, sobre `6392b21` en `atlas/venta-mostrador` (PR #7 abierto). Espera el commit
del dueño, que agrega este trabajo al mismo PR, porque corrige una regla de código aún no
publicado:
- modificados: `electron/ipc/index.ts`, `electron/preload.ts`, `electron/services/{cobros,inventario,ventasMostrador,reportesResumen}.ts`, `shared/{ipc-contract,schemas,types}.ts`, `src/App.tsx`, `src/components/AppShell.tsx`, `src/components/ventas/{ListaVentas,VentaDetalleModal,invalidar}.tsx|ts`, `src/pages/{Dashboard,Inventario}.tsx`, `src/pages/inventario/{Movimientos,Resumen}.tsx`, `.notes/spec-venta-mostrador-2026-11-06.md`;
- nuevos: `src/pages/Ventas.tsx`, `src/components/ventas/{PuntoDeVenta,PorCobrar}.tsx`,
  `.notes/auditoria-modulo-ventas-2026-11-09.md` y este archivo;
- borrado: `src/components/ventas/VenderProductoModal.tsx`.
