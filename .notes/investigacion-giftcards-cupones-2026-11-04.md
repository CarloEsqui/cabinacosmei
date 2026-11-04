# Investigación: tarjetas de regalo y cupones en el módulo de cobro

Fecha: 2026-11-04 · Alcance: investigación web + razonamiento. No se tocó ningún archivo del repo.
Contexto del repo (solo lectura): `electron/services/corte.ts` suma **todo** `pagos.estatus='cobrado'` desde el último corte y lo agrupa por `metodo_pago`. Esto importa para el punto 5: hoy cualquier método de pago se suma al total del corte.

---

## 0. Resumen ejecutivo

- Los sistemas de salón y POS separan siempre tres cosas: **(1) la venta de la tarjeta**, que es dinero que entra pero no es venta de servicio (es un pasivo); **(2) el canje**, que es una forma de pago que **no** es dinero nuevo; **(3) los descuentos y cupones**, que reducen el total del ticket y nunca son forma de pago.
- Si la tarjeta de regalo se maneja solo como un string de `metodo_pago`, el corte actual cuenta el mismo dinero dos veces: una al vender la tarjeta y otra al canjearla. Si la venta de la tarjeta no se registra, el corte de ese día no cuadra con la caja.
- **Recomendación:** modelo A (tabla de tarjetas + libro de movimientos + columna en `pagos` que distinga "dinero" de "aplicación de saldo"), más cupones como descuento en el ticket (C). Las cortesías también se aplican como descuento. Dejar el monedero por cliente y la lealtad para después; se modela "instrumento de saldo" de forma genérica para no cerrarles la puerta.
- Legal (México): la LFPC no tiene un artículo específico sobre vigencia de tarjetas de regalo. Sí obliga a informar y respetar plazos y condiciones (art. 7) y, en promociones, a anunciar condiciones y plazo (art. 48). En lo fiscal, para persona física el ingreso y el IVA se causan cuando se **cobra** (al vender la tarjeta), no cuando se canjea. Todo esto se debe confirmar con la contadora.

---

## 1. Cómo lo modela el software establecido

### 1.1 Tabla comparativa

| Sistema | Tarjeta de saldo (monto, canje parcial) | Vale por servicio | Cómo reporta la venta | Cómo reporta el canje | Regalo / cortesía | Fuente |
|---|---|---|---|---|---|---|
| **Square** | Sí, saldo recargable, canje parcial, se usa como *tender* | No es nativo (se simula con un monto) | "Gift card sales" queda **fuera** de gross/net sales, pero **sí** entra en "Total collected" | La venta pagada con tarjeta de regalo sí cuenta en gross sales (el ingreso se reconoce al canjear) | Se vende la tarjeta y se aplica un descuento del 100% (comp); el reporte de Comps tiene columnas de "Gift Cards Comped" | [Square 5381](https://squareup.com/help/article/5381), [comunidad: comp de gift card](https://community.squareup.com/t5/Payments-Troubleshooting/How-do-I-comp-a-Gift-Card-or-eGift-Card/m-p/712512/highlight/true), [cargar sin vender](https://community.squareup.com/t5/Questions-How-To/loading-gift-cards-without-quot-Selling-quot-them/m-p/606214) |
| **Fresha** | Sí. Los antiguos "vouchers" se fusionaron en gift cards | Absorbido en gift cards | "Gift card sales" va en **Other sales**, no en Sales | "Gift card redemptions" va en **Liabilities > Redemptions**. "Payments" **excluye** los canjes | Los vouchers vencidos se honran con un *deal* de descuento del 100% | [Finance summary](https://www.fresha.com/help-center/knowledge-base/reports/335-finance-summary-article-1), [Sales summary](https://www.fresha.com/help-center/knowledge-base/reports/338-sales-summary-article-1), [Liability activity](https://www.fresha.com/help-center/knowledge-base/reports/357-liability-activity-article-1) |
| **Shopify POS** | Sí, código de 16 caracteres, saldo | No | Las tarjetas se tratan como pasivo y no aparecen en el reporte de ventas, sino en el de pagos. Hay un reporte de "Gift card liabilities" | El ingreso se reconoce al canjear | Se pueden emitir tarjetas sin cobro desde el admin | [comunidad Shopify](https://community.shopify.com/t/why-arent-gift-card-sales-appearing-in-my-sales-reports/28298/5), [A2X](https://support.a2xaccounting.com/en/articles/3718547-accounting-for-shopify-gift-cards), [Webgility](https://www.webgility.com/blog/shopify-gift-card-accounting-quickbooks) |
| **AgendaPro** (LatAm, opera en MX) | "Gift card de monto": saldo para cualquier servicio o producto, canje "en un solo pago o en varios pagos parciales" | "Gift card de servicio": servicios específicos al precio original. Si se canjea otro servicio, se convierte en monto | Se vende como un ítem del carrito ("Nueva venta") | Se canjea en la caja. La diferencia se paga con otro medio | No documentado | [blog AgendaPro](https://agendapro.com/blog/tarjetas-de-regalo-en-agendapro/) |
| **Mangomint / Vagaro / Booksy** | Sí (Mangomint documenta venta, canje en checkout y descuentos sobre gift cards) | Vagaro y Booksy manejan paquetes y certificados. No encontré documentación pública detallada de reportes | — | — | — | [Mangomint help](https://www.mangomint.com/learn/help-articles/giftcards/selling-and-redeeming-gift-cards/) (solo índice) |

Patrón común:
1. **Instrumento de saldo** (monto inicial, saldo, canje parcial y múltiple). El "vale por un facial" se modela como tarjeta de monto con una nota o un servicio sugerido (AgendaPro), o desaparece dentro del mismo concepto (Fresha).
2. **Venta = "otras ventas" o pasivo**, separada de las ventas de servicio, pero **sí suma al dinero recibido**.
3. **Canje = forma de pago que no es dinero.** No entra en "Payments" (Fresha) ni en la caja. El servicio pagado con la tarjeta **sí** cuenta como venta en ese momento.
4. **Cortesía:** se emite con descuento del 100% (Square) o como *deal* de descuento (Fresha). No hay dinero en la emisión.
5. **Cupones / descuentos:** son una línea de descuento sobre el ticket que reduce la venta neta (Square: "Net sales = gross − returns − discounts and comps"). Nunca son forma de pago.

### 1.2 Reembolsos y reversos
- Square: el reembolso de un pago hecho con tarjeta de regalo **regresa a la tarjeta**, y el reembolso a tarjeta de regalo no mueve dinero ([Square 6168](https://squareup.com/help/article/6168)). Convertir saldo en efectivo ("cash out") se hace fuera del POS según la comunidad (fuentes contradictorias, [hilo](https://community.squareup.com/t5/Questions-How-To/Clearing-balance-on-gift-card-quot-cash-out-quot-option/m-p/140709)).
- Fresha, Liability activity: los movimientos son *Issue / Redemption / Refund*. Un monto negativo es un canje y uno positivo es un canje revertido.
- Regla general: **cancelar un pago con tarjeta de regalo = movimiento inverso que devuelve el saldo**, sin efecto en la caja. **Cancelar la venta de una tarjeta** solo procede si no tiene uso (saldo = monto inicial). Si tiene uso, la política más común es no reembolsar en efectivo, aunque en México este punto es incierto (ver §3).

### 1.3 Códigos (práctica recomendada para un solo local)
| Aspecto | Recomendación |
|---|---|
| Generación | Aleatoria con `crypto.randomBytes`, **nunca secuencial**: un folio secuencial permite adivinar el siguiente. |
| Alfabeto | Base32 de Crockford (sin I, L, O, U) para evitar confusiones al teclear. |
| Formato | Prefijo + 8 caracteres + 1 dígito verificador, p. ej. `CC-7K3M-9QX2-H`. 8 caracteres base32 = 40 bits, más que suficiente para un local. |
| Dígito verificador | Símbolo de verificación mod-37 de Crockford o Luhn mod-N. Detecta errores de tecleo antes de consultar la BD. |
| Unicidad | Índice `UNIQUE(codigo)` y se reintenta en caso de colisión. |
| Impreso | Código, monto, fecha de emisión, **vigencia**, condiciones ("no canjeable por efectivo", si la contadora lo valida) y nombre del negocio. Opcional: QR con el código. |
| Antifraude | Validar saldo y estatus antes de aplicar. Nunca permitir saldo negativo. Cancelaciones y ajustes con PIN y motivo, igual que la cancelación de pagos. Cada canje queda en el libro de movimientos. Las tarjetas emitidas fuera del sistema se dan de alta con su saldo actual. |

---

## 2. Tratamiento contable (breve)

| Evento | Asiento contable (base devengado, NIF D-1 / IFRS 15) |
|---|---|
| Venta de tarjeta $1,000 | Caja +1,000 / **Pasivo** (ingreso diferido) +1,000. **No** es ingreso. |
| Canje $600 en servicio | Pasivo −600 / **Ingreso por servicio** +600. No entra efectivo. |
| Tarjeta de cortesía | Sin asiento al emitir (no hay dinero). Al canjear: descuento o gasto de promoción. El ingreso neto es solo lo pagado con dinero. |
| Saldo que nunca se usa (*breakage*) | Se reconoce como ingreso en proporción a los canjes, o cuando el uso es remoto o vence (IFRS 15 B44–B47). |

Fuentes: [Deloitte DART 8.8](https://dart.deloitte.com/USDART/home/codification/revenue/asc606-10/roadmap-revenue-recognition/chapter-8-step-5-determine-when/8-8-customers-unexercised-rights-breakage), [PwC Viewpoint 7.4](https://viewpoint.pwc.com/dt/us/en/pwc/accounting_guides/revenue_from_contrac/revenue_from_contrac_US/chapter_7_options_to_US/74unexercised_rights_US.html), [BDO IFRS 15 vouchers](https://www.bdo.co.uk/en-gb/insights/business-edge/business-edge-2017/ifrs-15-in-the-spotlight). La NIF D-1 mexicana está alineada con IFRS 15. **No verifiqué el texto de la NIF D-1**; confirmar con la contadora.

> Importante: para una **persona física** (RESICO o actividad empresarial), lo fiscal va por **flujo de efectivo** (ver §3.2). Contablemente el ingreso se difiere hasta el canje, pero fiscalmente ya se causó al vender la tarjeta. Por eso la app necesita **dos vistas**: "dinero recibido" (base del corte y del cálculo fiscal) y "ventas" (servicios prestados, de gestión).

---

## 3. México: marco legal y fiscal

### 3.1 Protección al consumidor (LFPC, texto vigente, última reforma DOF 12-12-2025)
Fuente oficial: [LFPC en diputados.gob.mx](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf) (descargada y revisada el 2026-11-04).

| Punto | Lo que dice / implica | Confianza |
|---|---|---|
| ¿Hay una regla específica sobre tarjetas de regalo o su vigencia? | **No.** El texto completo no contiene "tarjeta de regalo", "certificado de regalo" ni "monedero" en este sentido. Tampoco encontré una guía vigente de PROFECO sobre el tema. | Alta (sobre el texto de la ley) |
| Art. 7: informar y respetar | El proveedor debe "informar y respetar los precios, tarifas, garantías, … términos, restricciones, plazos, fechas, modalidades … y demás condiciones" ofrecidas o convenidas. ⇒ La **vigencia y las condiciones se informan al vender** (impresas en la tarjeta y en el comprobante) y se respetan. | Alta |
| Art. 7 Bis | Informar el monto total a pagar. | Alta |
| Art. 10, 2º párrafo | Prohíbe "cláusulas o condiciones abusivas o impuestas". Una vigencia muy corta o la pérdida del saldo sin aviso podría impugnarse como abusiva. | Media (interpretación) |
| Art. 12 | Entregar "factura, recibo o comprobante" de cada operación. ⇒ Ticket de la venta de la tarjeta y de cada canje. | Alta |
| Arts. 46–48 y 50: promociones (cortesías, cupones) | Art. 48 fr. I: en los anuncios "deberán indicarse las condiciones, así como el plazo de duración"; **"si no se fija plazo … se presume que son indefinidos"** hasta que se revoque públicamente. Art. 50: si no se cumple la promoción, el consumidor puede exigir el cumplimiento o la diferencia. ⇒ **Todo cupón o cortesía debe tener vigencia y condiciones explícitas.** | Alta (texto) / Media (aplicación a cupones de un solo local) |
| ¿Puede vencer el saldo no usado? | No hay una prohibición expresa en la LFPC. Grandes emisores mexicanos fijan vigencia (p. ej. Palacio de Hierro: 12 meses, [T&C](https://www.elpalaciodehierro.com/on/demandware.static/-/Library-Sites-palacio-content-global/default/PDF/Informativas/Terminos-y-condiciones/PH-Terminos-Condiciones-GiftCards.pdf)). Práctica sugerida: vigencia informada (12 meses), y que la app permita **extenderla con PIN**. | **Media-baja: confirmar con la contadora o un abogado** |
| ¿Hay que reembolsar el saldo en efectivo? | La LFPC no lo exige expresamente para estos instrumentos. "No canjeable por efectivo" es práctica común. | **Baja: confirmar** |
| Reformas en curso | Encontré iniciativas en la Cámara relacionadas con programas de lealtad y tarjetas de regalo (consentimiento), pero ninguna aprobada sobre vigencia. | Baja (búsqueda no exhaustiva) |

### 3.2 Fiscal (SAT)
Fuentes oficiales: [LIVA](https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf), [LISR](https://www.diputados.gob.mx/LeyesBiblio/pdf/LISR.pdf) (PDF consultado con última reforma DOF 01-04-2024; puede haber una versión posterior) y [Anexo 20, Guía de llenado CFDI 4.0](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Anexo_20_Guia_de_llenado_CFDI.pdf).

| Punto | Fundamento | Conclusión para la cabina | Confianza |
|---|---|---|---|
| ¿Cuándo se causa el IVA? | LIVA art. 1-B: son "efectivamente cobradas" las contraprestaciones recibidas "aun cuando aquéllas correspondan a anticipos, depósitos o a cualquier otro concepto". Art. 17: en servicios, el IVA se paga al cobrarse efectivamente. | **Al vender la tarjeta** (entra el dinero). El canje no causa IVA de nuevo. | Media-alta |
| ¿Cuándo es ingreso para ISR (persona física)? | LISR art. 102 (actividad empresarial): acumulable cuando es "efectivamente percibido … aun cuando … correspondan a anticipos, a depósitos". Art. 113-E (RESICO): se paga sobre ingresos "amparados por CFDI efectivamente cobrados". | **Al vender la tarjeta.** El vencimiento del saldo no genera un ingreso fiscal adicional. | Media-alta (depende del régimen; confirmar cuál tiene) |
| CFDI de la venta de la tarjeta | Guía de llenado, Apéndice 6: hay **anticipo** cuando "no se conoce o no se ha determinado el bien o servicio … o el precio". | Tarjeta de **monto** = anticipo: CFDI de anticipo al cobrarla y, al canjear, CFDI del servicio relacionado (TipoRelacion 07) con el procedimiento de aplicación de anticipo. "**Vale por un facial**" (servicio y precio determinados) podría facturarse como el servicio desde la venta. Si factura al público en general con CFDI global, la venta entra en el global del periodo en que se cobró. | Media-baja: **confirmar con la contadora** |
| Forma de pago en el CFDI del canje | Guía de llenado, pregunta 31: cuando se recibe una tarjeta de regalo como medio de pago (o se da una bonificación con ella), se registra la **clave "01" (Efectivo)**. | Si factura el canje, la forma de pago es 01. (El SAT la equipara con efectivo, pero el corte de la app **no** debe tratarla como dinero nuevo.) | Alta (texto de la guía) |
| Cortesía / tarjeta regalada | LIVA art. 15 fr. III: están exentos del IVA los servicios "prestados en forma gratuita". | La parte cubierta por una cortesía no causa IVA. Se registra como descuento o cortesía, no como cobro. | Media |
| Contabilidad | NIF D-1 / IFRS 15 difieren el ingreso hasta el canje (§2). | Sirve para gestión. Lo fiscal sigue el flujo. | Media |

**Debe confirmarse con la contadora:** régimen fiscal de la dueña (RESICO vs. actividad empresarial), si emite CFDI por operación o global, cómo factura la venta de tarjetas (anticipo vs. servicio), y la política de vigencia y no-reembolso impresa en la tarjeta.

---

## 4. Modelos de datos candidatos (SQLite)

Hay un principio común a todos los modelos correctos: **cada renglón de `pagos` debe declarar si es dinero que entra o la aplicación de un saldo ya cobrado.** El corte suma solo lo primero. Esto también resuelve los **anticipos** ya decididos: el anticipo es dinero el día que se cobra y es aplicación de saldo cuando se cierra la cita.

### Modelo N (ingenuo, como referencia): "Tarjeta de regalo" como otro string en `metodo_pago`
Sin tabla de tarjetas, sin saldo, sin vigencia. **Descartado** (ver §5).

### Modelo A: `tarjetas_regalo` + libro de movimientos + `pagos` con fuente
```sql
tarjetas_regalo(
  id TEXT PK, codigo TEXT UNIQUE NOT NULL,
  tipo TEXT CHECK (tipo IN ('venta','cortesia')),       -- futuro: 'servicio' (vale)
  monto_inicial REAL NOT NULL, vigencia_hasta TEXT,      -- fecha local
  estatus TEXT CHECK (estatus IN ('activa','agotada','vencida','cancelada')),
  compradora_cliente_id TEXT NULL, beneficiaria_cliente_id TEXT NULL,
  servicio_sugerido_id TEXT NULL,                         -- "vale por un facial" informativo
  nota TEXT, created_at TEXT)
movimientos_tarjeta(
  id TEXT PK, tarjeta_id TEXT FK NOT NULL,
  tipo TEXT CHECK (tipo IN ('emision','alta_migracion','redencion','reverso_redencion',
                            'cancelacion','ajuste','vencimiento','extension')),
  monto REAL NOT NULL,              -- con signo; saldo = SUM(monto)
  pago_id TEXT NULL, descuento_id TEXT NULL,
  motivo TEXT, usuario_id TEXT, created_at TEXT)
-- pagos: columnas nuevas
pagos.concepto  TEXT CHECK (concepto IN ('servicio','anticipo','venta_tarjeta'))
pagos.fuente    TEXT CHECK (fuente IN ('dinero','tarjeta_regalo'))   -- 'anticipo' cuando se aplique
pagos.tarjeta_regalo_id TEXT NULL
pagos.servicio_realizado_id  -> NULL permitido cuando concepto='venta_tarjeta'
-- descuentos en el ticket (cupones y cortesías)
descuentos_servicio(id, servicio_realizado_id, tipo CHECK IN ('cupon','cortesia','manual'),
                    cupon_id NULL, tarjeta_regalo_id NULL, monto, motivo, usuario_id, created_at)
```
- **Corte:** `SUM(monto) WHERE estatus='cobrado' AND fuente='dinero'` agrupado por método, más ajustes negativos por cancelaciones posteriores. Una línea **informativa** "Aplicado de tarjetas de regalo" que no suma al total.
- **Ventas:** precio del servicio + productos − `descuentos_servicio`.
- **Cobrado (aplicado a servicios):** `pagos` con `concepto='servicio'` (de cualquier fuente). Sirve para el estado pagado/parcial derivado.
- **Dinero recibido:** igual al corte. Incluye las ventas de tarjetas, en una línea propia "Venta de tarjetas de regalo".
- **Pasivo de tarjetas:** `SUM(saldo)` de las tarjetas `tipo='venta'` y `estatus='activa'`. Las cortesías vigentes se muestran aparte (compromiso sin dinero).
- **Complejidad:** media (2 tablas nuevas + 3 columnas + 1 tabla de descuentos). El libro de movimientos replica el patrón que la app ya usa para inventario (`movimientos`).
- **Lealtad después:** `tipo` admite un valor nuevo ('puntos') o el libro se renombra a un genérico `instrumentos_saldo` / `movimientos_saldo`. Los anticipos pueden ser `fuente='anticipo'` sin tabla nueva.

### Modelo B: monedero o saldo genérico por cliente
```sql
movimientos_saldo(id, cliente_id NOT NULL, origen CHECK IN ('anticipo','tarjeta','cortesia','puntos','reembolso'),
                  monto, vigencia_hasta NULL, pago_id NULL, codigo NULL, created_at)
-- la tarjeta física solo "carga" el monedero del beneficiario
```
- **Corte, ventas y cobrado:** igual que A (`pagos.fuente='saldo'`).
- **Problemas:** la tarjeta de regalo es **al portador**: la compradora no es la beneficiaria, y la beneficiaria puede no ser clienta todavía. Hay que dar de alta a alguien o asignar el saldo a la persona equivocada. Varias cargas con vigencias distintas exigen consumo FIFO por vigencia. Tampoco se puede consultar "¿cuánto le queda a esta tarjeta?" sin reconstruirlo.
- **Complejidad:** alta para el beneficio actual.
- **Lealtad:** encaja de forma natural (los puntos son otro origen). Es su principal ventaja y la razón para dejar abierta la evolución A → B.

### Modelo C: cupones como descuento (complemento de A o B, no alternativa)
```sql
cupones(id, codigo UNIQUE, tipo CHECK IN ('porcentaje','monto'), valor,
        aplica_a CHECK IN ('todo','servicios','servicio_especifico'), servicio_id NULL,
        vigencia_desde, vigencia_hasta, usos_max NULL, usos_max_por_cliente NULL,
        monto_minimo NULL, activo, condiciones TEXT, created_at)
-- uso = renglón en descuentos_servicio(tipo='cupon', cupon_id); usos = COUNT(*) no cancelados
```
- **Nunca es pago.** Reduce la venta. El corte no lo ve.
- Validaciones: vigencia, `usos_max`, uno por clienta (requiere cliente en el ticket) y no acumulable (regla: un descuento por ticket, por ahora).
- **Complejidad:** baja.

---

## 5. Escenarios

Notación. Corte = dinero por método (lo que debe haber en caja o banco). Ventas = servicios prestados netos de descuentos. Cobrado = pagos aplicados a servicios. Adeudo = saldo pendiente de la clienta. Pasivo = saldo vivo de tarjetas vendidas.
Suposición: S3 se canjea en un servicio de $400.

### 5.1 Modelo N (ingenuo): dónde se rompe

| Esc. | Renglones creados | Corte (total) | Lo real | Error |
|---|---|---|---|---|
| S1 (opción a: registrar la venta) | `pagos` Efectivo $1,000 (sin servicio, si el esquema lo permite) | Efectivo 1,000 | 1,000 | — |
| S2 | `pagos` "Tarjeta de regalo" $600 + Tarjeta $200 | +600 (T. regalo) +200 | +200 | **+600 fantasma** |
| S3 | `pagos` "Tarjeta de regalo" $400 | +400 | 0 | **+400 fantasma** |
| Acumulado S1–S3 | | **2,200** | **1,200** | **Se cuentan $1,000 dos veces** |
| S1 (opción b: no registrar la venta, como hoy) | nada | 0 | 1,000 en caja | La caja tiene $1,000 sin explicar ese día y luego aparecen 1,000 "cobrados" que no entraron |
| S4 | método "Cortesía" $300 + Efectivo $200 | +500 | +200 | +300 fantasma; ventas 500 en lugar de 200 |
| S5 | método "Cupón" $100 + Transferencia $400 | +500 | +400 | +100 fantasma; ventas 500 en lugar de 400 |
| Control | — | — | — | Sin saldo: la misma tarjeta se puede canjear dos veces. Sin vigencia. Sin pasivo |

### 5.2 Modelo A + C (recomendado): renglones y cifras

| Esc. | Renglones creados | Corte (dinero por método) | Ventas | Cobrado (servicios) | Adeudo clienta | Pasivo tarjetas |
|---|---|---|---|---|---|---|
| **S1** venta de $1,000 en efectivo | `tarjetas_regalo` T1 (venta, 1,000, vigencia +12m). `movimientos_tarjeta` emision +1,000. `pagos` P1 {concepto venta_tarjeta, fuente dinero, Efectivo, 1,000, tarjeta T1, servicio NULL} | Efectivo **+1,000** (línea "Venta tarjetas de regalo") | 0 | 0 | 0 | **1,000** |
| **S2** facial $800 = 600 de T1 + 200 tarjeta bancaria | `pagos` P2 {servicio SR2, fuente tarjeta_regalo, T1, 600}. `movimientos_tarjeta` redencion −600 (pago P2). `pagos` P3 {SR2, fuente dinero, Tarjeta, 200} | Tarjeta **+200**. Informativo: "aplicado T. regalo 600" (no suma) | +800 | +800 → SR2 pagado | 0 | **400** |
| **S3** canje de los $400 restantes | `pagos` P4 {SR3, tarjeta_regalo, T1, 400}. Mov. redencion −400. T1 → `agotada` | **0**. Informativo 400 | +400 | +400 | 0 | **0** |
| Acumulado S1–S3 | | **1,200** (1,000 ef. + 200 tarj.) | **1,200** | 1,200 | 0 | 0 |
| **S4** cortesía de $300 en servicio de $500, resto en efectivo | `tarjetas_regalo` T2 (cortesia, 300). Mov. emision +300 (**sin** pago). Al canjear: `descuentos_servicio` D1 {SR4, cortesia, T2, 300}. Mov. redencion −300 (descuento D1). `pagos` P5 {SR4, dinero, Efectivo, 200} | Efectivo **+200** | Bruto 500, cortesía −300, **neto 200** | 200 | 0 | Sin cambio. "Cortesías vigentes" 300 → 0 |
| **S5** cupón del 20% en $500, resto por transferencia | `descuentos_servicio` D2 {SR5, cupon, C1, 100}. `pagos` P6 {SR5, dinero, Transferencia, 400} | Transferencia **+400** | Bruto 500, cupón −100, **neto 400** | 400 | 0 | — |
| **S6** se cancela P3 (Tarjeta $200 de S2) con PIN después del corte | P3 `estatus=cancelado`, motivo, usuario, `cancelado_at`. Si la corrección es "en realidad fue efectivo": nuevo P3' {SR2, dinero, Efectivo, 200} | Siguiente corte: Tarjeta **−200** (ajuste). Si se registra P3': Efectivo **+200** | Sin cambio (800) | 600 → SR2 **parcial**, o 800 si hay P3' | 200, o 0 si hay P3' | Sin cambio: la tarjeta de regalo no participó |
| S6-bis (si se cancela P2, el canje) | P2 cancelado. Mov. **reverso_redencion +600** en T1. Si T1 estaba vencida o agotada, se reactiva con PIN | **Sin efecto** en el corte (no era dinero) | Sin cambio | 800 → 200 | 600 | +600 de nuevo |
| **S7** reembolso el mismo día, sin uso, de una tarjeta T3 vendida en efectivo | Solo si saldo(T3) = monto_inicial. P7 `cancelado` con PIN y motivo. Mov. cancelacion −1,000. T3 → `cancelada` | Antes del corte: P7 ya no suma (**neto 0**). Si el corte ya se hizo: siguiente corte Efectivo **−1,000** | 0 | 0 | 0 | −1,000 (vuelve a lo previo) |

Notas:
- La **alta de tarjetas vendidas fuera del sistema** (las que ya existen hoy) usa el movimiento `alta_migracion` **sin** renglón en `pagos`. Ese dinero entró antes, y si se crea un pago aparecería en el corte de hoy.
- Las tarjetas bancarias y las de regalo tienen nombres que se confunden. Conviene que el método de pago se llame "Tarjeta débito/crédito" y el instrumento "Tarjeta de regalo" (o "Certificado").
- El método "Tarjeta de regalo" **no** debe vivir en la lista configurable de métodos. Lo marca `fuente`, y la UI lo ofrece solo al capturar un código válido.

### 5.3 Modelo B (monedero por cliente): diferencias contra A
| Esc. | Qué cambia |
|---|---|
| S1 | El saldo tiene que cargarse a **una clienta**. Si la compradora regala la tarjeta, el saldo queda en la persona equivocada, o hay que registrar a la beneficiaria antes de saber quién es. El corte es igual (+1,000 efectivo). |
| S2/S3 | `movimientos_saldo` −600 y −400 con `pagos.fuente='saldo'`. El corte, las ventas y el cobrado son iguales a A. |
| S4 | La cortesía queda como saldo de la clienta. Para que las ventas den 200, el origen `cortesia` tiene que tratarse como descuento en los reportes, lo que añade una regla especial. |
| S5 | Igual que A (el cupón va en C). |
| S6/S7 | Igual, pero "reembolsar la tarjeta T3" requiere encontrar qué carga del monedero corresponde a T3. Si ya se mezclaron saldos, es ambiguo. |
| Resultado | Cifras correctas con más trabajo. Más complejo y peor ajustado al instrumento al portador. Solo gana cuando llegue la lealtad. |

### 5.4 Cuadro de cifras finales (S1–S5, sin S6/S7)

| Métrica | Modelo N | Modelo A+C | Modelo B+C |
|---|---|---|---|
| Corte: Efectivo | 1,200 | 1,200 (1,000 venta tarjeta + 200 S4) | 1,200 |
| Corte: Tarjeta bancaria | 200 | 200 | 200 |
| Corte: Transferencia | 400 | 400 | 400 |
| Corte: "T. regalo / Cortesía / Cupón" | 1,000 + 300 + 100 | 0 (solo informativo) | 0 |
| **Corte total** | **3,200** (incorrecto) | **1,800** (correcto) | **1,800** (correcto) |
| Ventas de servicios (netas) | 2,200 (incorrecto) | **1,800** (800+400+200+400) | 1,800 (si la cortesía se trata como descuento) |
| Dinero recibido (base fiscal de una persona física) | — | 1,800 | 1,800 |
| Pasivo de tarjetas vendidas | no existe | 0 | 0 |

(Cuadre: 1,800 de dinero = 1,000 de la tarjeta + 200 + 200 + 400. Ventas 1,800 = 800 + 400 + 200 + 400. Coinciden porque la tarjeta vendida se consumió completa. Si quedara saldo, la diferencia es exactamente el pasivo.)

---

## 6. Recomendación

**Modelo A + C, mínimo:**
1. `pagos` recibe `concepto` (servicio | anticipo | venta_tarjeta), `fuente` (dinero | tarjeta_regalo; más tarde anticipo) y `tarjeta_regalo_id`. `servicio_realizado_id` pasa a ser nullable solo para `venta_tarjeta`. **El corte filtra `fuente='dinero'`.** Este es el cambio que evita el doble conteo y sirve también para los anticipos.
2. `tarjetas_regalo` + `movimientos_tarjeta` (saldo = suma del libro). Tipos `venta` y `cortesia`. Vigencia obligatoria al emitir, impresa y extensible con PIN. Canje parcial y múltiple. Nunca saldo negativo.
3. `descuentos_servicio` para cupones y cortesías. `cupones` con vigencia, `usos_max` y un uso por clienta. Los descuentos reducen las ventas y nunca son pago.
4. Cancelaciones: el pago cancelado con PIN revierte el movimiento de la tarjeta. La venta de una tarjeta solo se cancela si no tiene uso. Si el corte ya pasó, el ajuste aparece en negativo en el siguiente corte (igual que lo ya decidido).
5. Reportes: "Venta de tarjetas de regalo" va en una línea propia del dinero recibido y no en ventas. Hay que agregar "Pasivo de tarjetas" y "Cortesías vigentes".

**Dejar para después:** monedero por cliente y puntos de lealtad (evolucionar el libro a `instrumentos_saldo` cuando lleguen), vales por servicio con precio congelado (por ahora `servicio_sugerido_id` informativo), venta en línea, QR o escaneo, cupones acumulables o con reglas complejas, *breakage* contable automático (basta un reporte de tarjetas vencidas con saldo), y la facturación CFDI desde la app.

**Antes de implementar:** confirmar con la contadora el régimen fiscal, cómo factura la venta de tarjetas (anticipo vs. servicio), la vigencia que se imprimirá y si se puede declarar "no reembolsable en efectivo". El diseño pasa por el Gate 001: toca `pagos` y el corte, que son superficies críticas.
