#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Ingesta de datos DEMO para probar todas las funciones de Bellora.
//
// Genera un dataset coherente (proveedores, productos, lotes con entradas,
// clientas con historial de visitas, citas de todos los estados, servicios
// cerrados con consumo de insumos, pagos con métodos variados) y lo imprime como
// SQL en stdout para aplicarlo con el CLI de sqlite3.
//
// TODO lo que crea lleva ids con prefijo "demo-" y códigos CL-90xx / SRV-Dxxxx,
// así que NO colisiona con datos reales y se puede limpiar por completo con:
//   node scripts/seed-demo.mjs --limpiar | sqlite3 "<ruta cabina.sqlite3>"
//
// Uso normal:
//   node scripts/seed-demo.mjs | sqlite3 "<ruta cabina.sqlite3>"
// -----------------------------------------------------------------------------

const USUARIO_ID = "1cbdbae9-2f19-4b40-a5b2-d34632551106"; // Itzel (usuario existente)

// --- Helpers de fecha (local) ---
const HOY = new Date();
function iso(offsetDias) {
  const d = new Date(HOY);
  d.setDate(d.getDate() + offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function epoch(offsetDias) {
  const d = new Date(HOY);
  d.setDate(d.getDate() + offsetDias);
  return Math.floor(d.getTime() / 1000);
}

// --- Helper para construir INSERTs ---
function val(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}
const OUT = [];
function insert(tabla, obj) {
  const cols = Object.keys(obj);
  OUT.push(`INSERT INTO ${tabla} (${cols.join(", ")}) VALUES (${cols.map((c) => val(obj[c])).join(", ")});`);
}

const TABLAS_EN_ORDEN_INVERSO = [
  "pagos",
  "movimientos",
  "salidas_inventario",
  "servicios_productos_consumidos",
  "servicios_realizados",
  "citas",
  "entradas_inventario",
  "lotes",
  "servicios_catalogo_productos",
  "clientes",
  "productos",
  "servicios_catalogo",
  "tipos_producto",
  "proveedores",
];
function emitirLimpieza() {
  for (const t of TABLAS_EN_ORDEN_INVERSO) OUT.push(`DELETE FROM ${t} WHERE id LIKE 'demo-%';`);
}

// =============================================================================
if (process.argv.includes("--limpiar")) {
  OUT.push("PRAGMA foreign_keys=ON;", "BEGIN;");
  emitirLimpieza();
  OUT.push("COMMIT;");
  process.stdout.write(OUT.join("\n") + "\n");
  process.exit(0);
}

// --- Definiciones de datos ---
const CATALOGO = [
  { id: "demo-sc-1", nombre: "Limpieza facial profunda", cat: "Facial", dur: 60, precio: 650, period: 30, consume: true },
  { id: "demo-sc-2", nombre: "Peeling químico", cat: "Facial", dur: 45, precio: 900, period: 45, consume: true },
  { id: "demo-sc-3", nombre: "Microdermoabrasión", cat: "Facial", dur: 50, precio: 750, period: 30, consume: true },
  { id: "demo-sc-4", nombre: "Depilación láser", cat: "Corporal", dur: 30, precio: 500, period: 21, consume: false },
];
const PRODUCTOS = [
  { id: "demo-prod-1", sku: "SKU-D001", nombre: "Ácido hialurónico (vial)", tipo: "demo-tipo-1", prov: "demo-prov-1", costo: 120, venta: 0 },
  { id: "demo-prod-2", sku: "SKU-D002", nombre: "Solución peeling glicólico", tipo: "demo-tipo-1", prov: "demo-prov-1", costo: 200, venta: 0 },
  { id: "demo-prod-3", sku: "SKU-D003", nombre: "Crema post-sol", tipo: "demo-tipo-2", prov: "demo-prov-2", costo: 80, venta: 180 },
  { id: "demo-prod-4", sku: "SKU-D004", nombre: "Gasas estériles (paquete)", tipo: "demo-tipo-1", prov: "demo-prov-1", costo: 15, venta: 0 },
];
const LOTES = [
  { id: "demo-lote-1", prod: "demo-prod-1", num: "L-D001", inicial: 20, costo: 120, cad: iso(75) },
  { id: "demo-lote-2", prod: "demo-prod-2", num: "L-D002", inicial: 15, costo: 200, cad: iso(20) }, // por caducar (≤30d)
  { id: "demo-lote-3", prod: "demo-prod-3", num: "L-D003", inicial: 12, costo: 80, cad: iso(150) },
  { id: "demo-lote-4", prod: "demo-prod-4", num: "L-D004", inicial: 100, costo: 15, cad: iso(10) }, // por caducar (≤30d)
  { id: "demo-lote-5", prod: "demo-prod-1", num: "L-D005", inicial: 5, costo: 120, cad: iso(-5) }, // ya caducado con existencia
];
// Lote principal desde el que consume cada producto (el ácido consume del lote-1, no del caducado).
const loteDeProducto = { "demo-prod-1": "demo-lote-1", "demo-prod-2": "demo-lote-2", "demo-prod-3": "demo-lote-3", "demo-prod-4": "demo-lote-4" };
const CLIENTES = [
  { id: "demo-cli-1", cod: "CL-9001", nombre: "Ana Torres", alta: iso(-160), tel: "5551110001" },
  { id: "demo-cli-2", cod: "CL-9002", nombre: "María Gómez", alta: iso(-8), tel: "5551110002" },
  { id: "demo-cli-3", cod: "CL-9003", nombre: "Sofía Ramírez", alta: iso(-140), tel: "5551110003" },
  { id: "demo-cli-4", cod: "CL-9004", nombre: "Lucía Fernández", alta: iso(-200), tel: "5551110004" },
  { id: "demo-cli-5", cod: "CL-9005", nombre: "Valeria Cruz", alta: iso(-60), tel: "5551110005" },
];
const VISITAS = [
  { cli: "demo-cli-1", sc: "demo-sc-1", off: -150, hora: "10:00", pago: "pagado", metodo: "Tarjeta" },
  { cli: "demo-cli-1", sc: "demo-sc-3", off: -118, hora: "11:00", pago: "pagado", metodo: "Efectivo" },
  { cli: "demo-cli-1", sc: "demo-sc-1", off: -88, hora: "10:00", pago: "pagado", metodo: "Transferencia" },
  { cli: "demo-cli-1", sc: "demo-sc-2", off: -55, hora: "16:00", pago: "parcial", metodo: "Tarjeta" },
  { cli: "demo-cli-1", sc: "demo-sc-1", off: -25, hora: "12:00", pago: "pagado", metodo: "Efectivo" },
  { cli: "demo-cli-1", sc: "demo-sc-3", off: -3, hora: "17:00", pago: "pagado", metodo: "Tarjeta" },
  { cli: "demo-cli-2", sc: "demo-sc-4", off: -8, hora: "13:00", pago: "pagado", metodo: "Efectivo" },
  { cli: "demo-cli-2", sc: "demo-sc-1", off: -2, hora: "15:00", pago: "pendiente", metodo: null },
  { cli: "demo-cli-3", sc: "demo-sc-2", off: -140, hora: "11:00", pago: "pagado", metodo: "Tarjeta" },
  { cli: "demo-cli-3", sc: "demo-sc-2", off: -110, hora: "16:00", pago: "pagado", metodo: "Tarjeta" },
  { cli: "demo-cli-3", sc: "demo-sc-3", off: -80, hora: "10:00", pago: "pagado", metodo: "Efectivo" },
  { cli: "demo-cli-3", sc: "demo-sc-2", off: -55, hora: "17:00", pago: "parcial", metodo: "Transferencia" },
  { cli: "demo-cli-4", sc: "demo-sc-1", off: -170, hora: "12:00", pago: "pagado", metodo: "Efectivo" },
  { cli: "demo-cli-4", sc: "demo-sc-1", off: -120, hora: "14:00", pago: "pagado", metodo: "Efectivo" },
  { cli: "demo-cli-5", sc: "demo-sc-3", off: -40, hora: "18:00", pago: "pagado", metodo: "Tarjeta" },
  { cli: "demo-cli-5", sc: "demo-sc-4", off: -12, hora: "13:00", pago: "pagado", metodo: "Efectivo" },
];
const CITAS_EXTRA = [
  { off: 2, hora: "11:00", estado: "programada", cli: "demo-cli-1", sc: "demo-sc-1" },
  { off: 3, hora: "16:00", estado: "programada", cli: "demo-cli-5", sc: "demo-sc-3" },
  { off: 5, hora: "10:00", estado: "confirmada", cli: "demo-cli-2", sc: "demo-sc-4" },
  { off: 6, hora: "13:00", estado: "programada", cli: "demo-cli-3", sc: "demo-sc-2" },
  { off: -10, hora: "12:00", estado: "no_asistio", cli: "demo-cli-4", sc: "demo-sc-1" },
  { off: -6, hora: "17:00", estado: "no_asistio", cli: "demo-cli-3", sc: "demo-sc-3" },
  { off: -12, hora: "15:00", estado: "cancelada", cli: "demo-cli-5", sc: "demo-sc-4" },
  { off: -4, hora: "11:00", estado: "reagendada", cli: "demo-cli-1", sc: "demo-sc-2" },
];

const precioDe = Object.fromEntries(CATALOGO.map((s) => [s.id, s.precio]));
const durDe = Object.fromEntries(CATALOGO.map((s) => [s.id, s.dur]));
const consumeDe = Object.fromEntries(CATALOGO.map((s) => [s.id, s.consume]));
const costoLote = Object.fromEntries(LOTES.map((l) => [l.id, l.costo]));
// Insumos consumidos por cada servicio (mismo criterio en el pre-conteo y al emitir).
function insumosDe(sc) {
  if (!consumeDe[sc]) return [];
  return sc === "demo-sc-2" ? [["demo-prod-2", 1]] : [["demo-prod-1", 1], ["demo-prod-4", 2]];
}

// --- Pre-pasada: consumo total por lote (para fijar la existencia final antes de insertarlo) ---
const consumidoPorLote = Object.fromEntries(LOTES.map((l) => [l.id, 0]));
for (const v of VISITAS) {
  for (const [prod, cant] of insumosDe(v.sc)) consumidoPorLote[loteDeProducto[prod]] += cant;
}
consumidoPorLote["demo-lote-4"] += 3; // merma que se registrará abajo

// =============================================================================
OUT.push("PRAGMA foreign_keys=ON;", "BEGIN;");
emitirLimpieza(); // idempotente: reejecutar reemplaza el demo, no lo duplica

// Proveedores
insert("proveedores", { id: "demo-prov-1", nombre_comercial: "Distribuidora Estética MX", categoria: "Insumos", activo: true, dias_credito: 15, created_at: epoch(-200), updated_at: epoch(-200) });
insert("proveedores", { id: "demo-prov-2", nombre_comercial: "Belleza Profesional SA", categoria: "Reventa", activo: true, dias_credito: 0, created_at: epoch(-200), updated_at: epoch(-200) });

// Tipos de producto
insert("tipos_producto", { id: "demo-tipo-1", nombre_tipo: "Insumo consumible", requiere_caducidad: true, se_consume_en_servicio: true, se_vende: false, activo: true, created_at: epoch(-200), updated_at: epoch(-200) });
insert("tipos_producto", { id: "demo-tipo-2", nombre_tipo: "Producto de reventa", requiere_caducidad: true, se_consume_en_servicio: false, se_vende: true, activo: true, created_at: epoch(-200), updated_at: epoch(-200) });

// Catálogo de servicios
for (const s of CATALOGO) insert("servicios_catalogo", { id: s.id, nombre: s.nombre, categoria_servicio: s.cat, duracion_estimada_min: s.dur, precio_sugerido: s.precio, periodicidad_mantenimiento_dias: s.period, activo: true, consume_inventario: s.consume, created_at: epoch(-200), updated_at: epoch(-200) });

// Productos
for (const p of PRODUCTOS) insert("productos", { id: p.id, sku: p.sku, nombre: p.nombre, tipo_producto_id: p.tipo, proveedor_principal_id: p.prov, unidad_medida: "pieza", costo_base: p.costo, precio_venta: p.venta, stock_minimo_manual: 3, activo: true, created_at: epoch(-200), updated_at: epoch(-200) });

// Recetas (insumos sugeridos)
insert("servicios_catalogo_productos", { id: "demo-scp-1", servicio_catalogo_id: "demo-sc-1", producto_id: "demo-prod-1", cantidad_sugerida: 1 });
insert("servicios_catalogo_productos", { id: "demo-scp-2", servicio_catalogo_id: "demo-sc-1", producto_id: "demo-prod-4", cantidad_sugerida: 2 });
insert("servicios_catalogo_productos", { id: "demo-scp-3", servicio_catalogo_id: "demo-sc-2", producto_id: "demo-prod-2", cantidad_sugerida: 1 });
insert("servicios_catalogo_productos", { id: "demo-scp-4", servicio_catalogo_id: "demo-sc-3", producto_id: "demo-prod-4", cantidad_sugerida: 2 });

// Lotes (existencia ya ajustada por el consumo pre-calculado)
for (const l of LOTES) {
  const disp = l.inicial - consumidoPorLote[l.id];
  const estado = l.id === "demo-lote-5" ? "activo" : disp <= 0 ? "agotado" : "activo";
  insert("lotes", { id: l.id, producto_id: l.prod, proveedor_id: "demo-prov-1", numero_lote: l.num, fecha_compra: iso(-150), fecha_entrada: iso(-150), fecha_caducidad: l.cad, cantidad_inicial: l.inicial, cantidad_disponible: disp, costo_unitario_lote: l.costo, estado, created_at: epoch(-150), updated_at: epoch(-150) });
}

// Entradas de inventario + su movimiento
let folioEntrada = 1;
for (const l of LOTES) {
  const suf = l.id.slice(5);
  insert("entradas_inventario", { id: "demo-ent-" + suf, fecha: iso(-150), folio: "E-D" + String(folioEntrada++).padStart(3, "0"), proveedor_id: "demo-prov-1", producto_id: l.prod, lote_id: l.id, cantidad: l.inicial, costo_unitario: l.costo, total: l.inicial * l.costo, usuario_id: USUARIO_ID, created_at: epoch(-150) });
  insert("movimientos", { id: "demo-mov-ent-" + suf, fecha: iso(-150), tipo: "entrada", producto_id: l.prod, lote_id: l.id, cantidad: l.inicial, referencia_tipo: "entrada_inventario", referencia_id: "demo-ent-" + suf, usuario_id: USUARIO_ID, created_at: epoch(-150) });
}

// Clientas
for (const c of CLIENTES) insert("clientes", { id: c.id, codigo_cliente: c.cod, nombre_completo: c.nombre, telefono: c.tel, fecha_alta: c.alta, activo: true, created_at: epoch(-200), updated_at: epoch(-200) });

// Visitas: cita (asistió) + servicio cerrado + consumo + pago
let nSrv = 1, nCita = 1, nPago = 1, nSal = 1, nCons = 1, folioSalida = 1;
for (const v of VISITAS) {
  const srvId = "demo-srv-" + String(nSrv).padStart(3, "0");
  const citaId = "demo-cita-" + String(nCita++).padStart(3, "0");
  const codigo = "SRV-D" + String(nSrv).padStart(4, "0");
  nSrv++;
  const fecha = iso(v.off);

  insert("citas", { id: citaId, cliente_id: v.cli, servicio_catalogo_id: v.sc, fecha, hora: v.hora, duracion_min: durDe[v.sc], estado: "asistio", origen: "manual", es_mantenimiento: false, profesional_id: USUARIO_ID, recordatorio_activo: true, created_at: epoch(v.off - 4), updated_at: epoch(v.off) });

  const precio = precioDe[v.sc];
  insert("servicios_realizados", { id: srvId, codigo_servicio: codigo, cliente_id: v.cli, servicio_catalogo_id: v.sc, cita_id: citaId, fecha, hora: v.hora, profesional_id: USUARIO_ID, precio, estatus_pago: v.pago, estatus: "cerrado", cerrado_at: epoch(v.off), created_at: epoch(v.off), updated_at: epoch(v.off) });

  for (const [prod, cant] of insumosDe(v.sc)) {
    const loteId = loteDeProducto[prod];
    const salId = "demo-sal-" + String(nSal++).padStart(3, "0");
    // La salida va PRIMERO: el consumo la referencia (salida_inventario_id).
    insert("salidas_inventario", { id: salId, fecha, folio: "S-D" + String(folioSalida++).padStart(3, "0"), producto_id: prod, lote_id: loteId, tipo_salida: "consumo_servicio", cantidad: cant, costo_unitario: costoLote[loteId], valor: cant * costoLote[loteId], cliente_id: v.cli, servicio_realizado_id: srvId, usuario_id: USUARIO_ID, created_at: epoch(v.off) });
    insert("servicios_productos_consumidos", { id: "demo-cons-" + String(nCons++).padStart(3, "0"), servicio_realizado_id: srvId, producto_id: prod, lote_id: loteId, cantidad: cant, salida_inventario_id: salId, created_at: epoch(v.off) });
    insert("movimientos", { id: "demo-mov-" + salId.slice(5), fecha, tipo: "consumo_servicio", producto_id: prod, lote_id: loteId, cantidad: cant, referencia_tipo: "salida_inventario", referencia_id: salId, cliente_id: v.cli, usuario_id: USUARIO_ID, created_at: epoch(v.off) });
  }

  if (v.pago === "pagado") {
    insert("pagos", { id: "demo-pago-" + String(nPago++).padStart(3, "0"), cliente_id: v.cli, servicio_realizado_id: srvId, fecha, monto: precio, metodo_pago: v.metodo, estatus: "cobrado", usuario_id: USUARIO_ID, created_at: epoch(v.off) });
  } else if (v.pago === "parcial") {
    insert("pagos", { id: "demo-pago-" + String(nPago++).padStart(3, "0"), cliente_id: v.cli, servicio_realizado_id: srvId, fecha, monto: Math.round(precio / 2), metodo_pago: v.metodo, estatus: "cobrado", usuario_id: USUARIO_ID, created_at: epoch(v.off) });
  } // "pendiente" → sin pago (genera cartera)
}

// Merma valorizada
insert("salidas_inventario", { id: "demo-sal-merma", fecha: iso(-15), folio: "S-D" + String(folioSalida++).padStart(3, "0"), producto_id: "demo-prod-4", lote_id: "demo-lote-4", tipo_salida: "merma", cantidad: 3, costo_unitario: 15, valor: 45, usuario_id: USUARIO_ID, observaciones: "Paquete dañado (demo)", created_at: epoch(-15) });
insert("movimientos", { id: "demo-mov-merma", fecha: iso(-15), tipo: "merma", producto_id: "demo-prod-4", lote_id: "demo-lote-4", cantidad: 3, referencia_tipo: "salida_inventario", referencia_id: "demo-sal-merma", usuario_id: USUARIO_ID, created_at: epoch(-15) });

// Citas sin servicio (pobla la Agenda con todos los estados)
for (const c of CITAS_EXTRA) {
  const citaId = "demo-cita-" + String(nCita++).padStart(3, "0");
  insert("citas", { id: citaId, cliente_id: c.cli, servicio_catalogo_id: c.sc, fecha: iso(c.off), hora: c.hora, duracion_min: durDe[c.sc], estado: c.estado, origen: "manual", es_mantenimiento: false, profesional_id: USUARIO_ID, recordatorio_activo: true, created_at: epoch(c.off - 5), updated_at: epoch(c.off) });
}

OUT.push("COMMIT;");
process.stdout.write(OUT.join("\n") + "\n");
