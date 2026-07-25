import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "../db";
import { serviciosRealizados, citas, clientes, serviciosCatalogo, productos, salidasInventario, pagos } from "../db/schema";
import { crearCarpetaServicio } from "./folders";
import { tieneComprobante } from "./archivos";
import { registrarSalidaEnTx, verificarStockSuficiente } from "./inventario";
import { obtenerConfig } from "./config";
import { registrarPago } from "./pagos";
import { verificarPin } from "./auth";
import { registrarAccion } from "./bitacora";
import { sumarDiasIso, fechaLocalIso } from "../../shared/fechas";
import type { CierreCitaInput } from "../../shared/schemas";
import type { ServicioRealizado, DetalleServicioRealizado } from "../../shared/types";

/**
 * Convierte la cantidad capturada de un insumo consumido a PIEZAS (la unidad en la que vive el
 * stock), según el modo de consumo del producto:
 *  - modo "pieza": la cantidad ya viene en piezas, se devuelve igual.
 *  - modo "contenido": la cantidad viene en ml/g; se divide entre el contenido de la pieza para
 *    obtener la fracción de pieza a descontar (usar 5 ml de un bote de 60 ml = 5/60 de pieza).
 * Valida que un producto en modo "contenido" tenga un contenido > 0 configurado.
 */
function aPiezas(db: ReturnType<typeof getDb>, productoId: string, cantidad: number): number {
  const prod = db.select().from(productos).where(eq(productos.id, productoId)).get();
  if (prod?.modoConsumo === "contenido") {
    const contenido = prod.contenidoCantidad;
    if (!contenido || contenido <= 0) {
      throw new Error(
        `El producto "${prod.nombre}" se descuenta por contenido pero no tiene un contenido válido definido. Corrige su presentación en Configuración > Productos.`,
      );
    }
    return cantidad / contenido;
  }
  return cantidad;
}

function generarCodigoServicio(): string {
  const db = getDb();
  const existentes = db
    .select({ codigo: serviciosRealizados.codigoServicio })
    .from(serviciosRealizados)
    .where(like(serviciosRealizados.codigoServicio, "SRV-%"))
    .all();
  let maxN = 0;
  for (const { codigo } of existentes) {
    const match = codigo.match(/-(\d+)$/);
    if (match) maxN = Math.max(maxN, Number(match[1]));
  }
  return `SRV-${String(maxN + 1).padStart(4, "0")}`;
}

async function mapear(fila: typeof serviciosRealizados.$inferSelect): Promise<ServicioRealizado> {
  const db = getDb();
  const cliente = db.select().from(clientes).where(eq(clientes.id, fila.clienteId)).get();
  const servicio = db
    .select()
    .from(serviciosCatalogo)
    .where(eq(serviciosCatalogo.id, fila.servicioCatalogoId))
    .get();
  const comprobante = await tieneComprobante(fila.id);

  return {
    id: fila.id,
    codigoServicio: fila.codigoServicio,
    clienteId: fila.clienteId,
    clienteNombre: cliente?.nombreCompleto ?? "",
    servicioCatalogoId: fila.servicioCatalogoId,
    servicioNombre: servicio?.nombre ?? null,
    citaId: fila.citaId,
    fecha: fila.fecha,
    precio: fila.precio,
    estatusPago: fila.estatusPago,
    estatus: fila.estatus,
    carpetaPath: fila.carpetaPath,
    proximaCitaSugerida: fila.proximaCitaSugerida,
    tieneComprobante: comprobante,
  };
}

/**
 * Abre (o recupera, si ya existía) el borrador de servicio realizado ligado a una cita.
 * Crea su carpeta local de inmediato para poder subir el comprobante antes de confirmar el cierre.
 */
export async function abrirCierre(citaId: string): Promise<ServicioRealizado> {
  const db = getDb();

  const existente = db
    .select()
    .from(serviciosRealizados)
    .where(eq(serviciosRealizados.citaId, citaId))
    .get();
  if (existente) return mapear(existente);

  const cita = db.select().from(citas).where(eq(citas.id, citaId)).get();
  if (!cita) throw new Error("La cita no existe.");
  if (!cita.servicioCatalogoId) throw new Error("La cita no tiene un servicio asignado.");

  const cliente = db.select().from(clientes).where(eq(clientes.id, cita.clienteId)).get();
  if (!cliente) throw new Error("La clienta de esta cita no existe.");

  const servicioCat = db
    .select()
    .from(serviciosCatalogo)
    .where(eq(serviciosCatalogo.id, cita.servicioCatalogoId))
    .get();
  if (!servicioCat) throw new Error("El servicio del catálogo no existe.");

  // Se usa la fecha programada de la cita (no "hoy"), para que un cierre tardío o retroactivo
  // calcule bien la próxima fecha de mantenimiento sugerida.
  const fecha = cita.fecha;
  const codigoServicio = generarCodigoServicio();
  const carpetaPath = cliente.carpetaPath
    ? crearCarpetaServicio(cliente.carpetaPath, codigoServicio, fecha, servicioCat.nombre)
    : null;

  const id = randomUUID();
  db.insert(serviciosRealizados)
    .values({
      id,
      codigoServicio,
      clienteId: cliente.id,
      servicioCatalogoId: servicioCat.id,
      citaId,
      fecha,
      precio: servicioCat.precioSugerido ?? 0,
      estatusPago: "pendiente",
      estatus: "abierto",
      carpetaPath,
    })
    .run();

  const creado = db.select().from(serviciosRealizados).where(eq(serviciosRealizados.id, id)).get()!;
  return mapear(creado);
}

export async function cerrarCita(input: CierreCitaInput, usuarioId?: string): Promise<ServicioRealizado> {
  const db = getDb();

  const servicio = db
    .select()
    .from(serviciosRealizados)
    .where(eq(serviciosRealizados.id, input.servicioRealizadoId))
    .get();
  if (!servicio) throw new Error("El servicio realizado no existe.");
  if (servicio.estatus === "cerrado") throw new Error("Esta cita ya fue cerrada.");

  const tieneComp = await tieneComprobante(servicio.id);
  let cerradoConPinOverride = false;
  if (!tieneComp) {
    if (!input.pinOverride) {
      throw new Error("Debes subir el comprobante de pago, o cerrar con el PIN de acceso.");
    }
    const pinValido = await verificarPin(input.pinOverride);
    if (!pinValido) throw new Error("El PIN de acceso no es correcto.");
    cerradoConPinOverride = true;
  }

  // Misma fecha que se guardó al abrir el cierre (la de la cita), para que consumos, pago y el
  // cálculo de "próxima cita sugerida" queden consistentes con cuándo ocurrió el servicio.
  const fecha = servicio.fecha;

  // El stock SIEMPRE se cuenta en piezas. Para un insumo en modo "contenido" el renderer manda la
  // cantidad en ml/g, así que aquí la convertimos a fracción de pieza (cantidad / contenido de la
  // pieza) antes de tocar nada. Los productos modo "pieza" y las ventas van tal cual (en piezas).
  const consumidosEnPiezas = input.productosConsumidos.map((p) => ({
    productoId: p.productoId,
    cantidad: aPiezas(db, p.productoId, p.cantidad),
  }));

  // Pre-chequeo de stock ANTES de abrir la transacción: da un mensaje claro nombrando todos los
  // faltantes de una vez. Aun así el descuento real vive dentro de la transacción de cierre, así
  // que un fallo posterior (o una carrera contra otra salida) revierte todo sin dejar estado sucio.
  const aDescontar = [...consumidosEnPiezas, ...input.productosVendidos];
  const faltantes = verificarStockSuficiente(aDescontar);
  if (faltantes.length > 0) {
    const detalle = faltantes
      .map((f) => `${f.nombre} (hay ${f.disponible}, se necesitan ${f.solicitado})`)
      .join("; ");
    throw new Error(
      `No hay stock suficiente para cerrar la cita: ${detalle}. Ajusta las cantidades o registra una entrada de inventario primero.`,
    );
  }

  const servicioCat = db
    .select()
    .from(serviciosCatalogo)
    .where(eq(serviciosCatalogo.id, servicio.servicioCatalogoId))
    .get();

  let proximaCitaSugerida: string | null = null;
  if (servicioCat?.periodicidadMantenimientoDias) {
    proximaCitaSugerida = sumarDiasIso(fecha, servicioCat.periodicidadMantenimientoDias);
  }

  // Config y fecha de hoy para elegir lotes en las salidas: se calculan FUERA de la transacción
  // porque obtenerConfig() es async y las transacciones de better-sqlite3 son síncronas (nada async
  // puede correr dentro de una).
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();

  // TODO el cierre en UNA sola transacción: si algo falla a mitad (una salida, registrarPago o
  // cualquier update), better-sqlite3 revierte la transacción completa y el stock NO queda
  // descontado. Antes cada salida abría su propia transacción y el pago iba en otra separada, así
  // que un fallo tras descontar dejaba stock descontado + cita abierta → doble descuento al
  // reintentar. Nada async aquí dentro.
  db.transaction((tx) => {
    for (const p of consumidosEnPiezas) {
      registrarSalidaEnTx(
        tx,
        {
          fecha,
          productoId: p.productoId,
          tipoSalida: "consumo_servicio",
          cantidad: p.cantidad,
          clienteId: servicio.clienteId,
          servicioRealizadoId: servicio.id,
        },
        config.criterioSalidaLotes,
        hoy,
        usuarioId,
      );
    }
    for (const p of input.productosVendidos) {
      registrarSalidaEnTx(
        tx,
        {
          fecha,
          productoId: p.productoId,
          tipoSalida: "venta",
          cantidad: p.cantidad,
          clienteId: servicio.clienteId,
          servicioRealizadoId: servicio.id,
        },
        config.criterioSalidaLotes,
        hoy,
        usuarioId,
      );
    }

    if (input.monto > 0 && input.metodoPago) {
      registrarPago(tx, {
        clienteId: servicio.clienteId,
        servicioRealizadoId: servicio.id,
        fecha,
        monto: input.monto,
        metodoPago: input.metodoPago,
        estatus: "cobrado",
        usuarioId,
      });
    }

    tx.update(serviciosRealizados)
      .set({
        precio: input.precio,
        estatusPago: input.estatusPago,
        estatus: "cerrado",
        observaciones: input.observaciones || null,
        proximaCitaSugerida,
        cerradoAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serviciosRealizados.id, servicio.id))
      .run();

    if (servicio.citaId) {
      tx.update(citas)
        .set({ estado: "asistio", updatedAt: new Date() })
        .where(eq(citas.id, servicio.citaId))
        .run();
    }

    registrarAccion(tx, {
      usuarioId,
      accion: "cita_cerrada",
      entidadTipo: "servicio_realizado",
      entidadId: servicio.id,
      detalle: `${servicio.codigoServicio} · $${input.precio.toFixed(2)}`,
    });
    if (cerradoConPinOverride) {
      registrarAccion(tx, {
        usuarioId,
        accion: "cierre_con_pin_override",
        entidadTipo: "servicio_realizado",
        entidadId: servicio.id,
        detalle: "Cerrado sin comprobante de pago, usando el PIN de acceso.",
      });
    }
  });

  const actualizado = db
    .select()
    .from(serviciosRealizados)
    .where(eq(serviciosRealizados.id, servicio.id))
    .get()!;
  return mapear(actualizado);
}

/**
 * Expediente de una cita ya cerrada: insumos usados, productos vendidos y estado real de pago.
 * Se usa para expandir el detalle de una cita en la lista, en vez de un "expediente" separado.
 */
export async function obtenerDetalle(servicioRealizadoId: string): Promise<DetalleServicioRealizado | null> {
  const db = getDb();
  const servicio = db
    .select()
    .from(serviciosRealizados)
    .where(eq(serviciosRealizados.id, servicioRealizadoId))
    .get();
  if (!servicio) return null;

  const productosConsumidos = db
    .select({ productoNombre: productos.nombre, cantidad: salidasInventario.cantidad })
    .from(salidasInventario)
    .innerJoin(productos, eq(salidasInventario.productoId, productos.id))
    .where(
      and(
        eq(salidasInventario.servicioRealizadoId, servicioRealizadoId),
        eq(salidasInventario.tipoSalida, "consumo_servicio"),
      ),
    )
    .all();

  const productosVendidos = db
    .select({ productoNombre: productos.nombre, cantidad: salidasInventario.cantidad })
    .from(salidasInventario)
    .innerJoin(productos, eq(salidasInventario.productoId, productos.id))
    .where(
      and(eq(salidasInventario.servicioRealizadoId, servicioRealizadoId), eq(salidasInventario.tipoSalida, "venta")),
    )
    .all();

  const pagosFilas = db
    .select({ fecha: pagos.fecha, monto: pagos.monto, metodoPago: pagos.metodoPago })
    .from(pagos)
    .where(and(eq(pagos.servicioRealizadoId, servicioRealizadoId), eq(pagos.estatus, "cobrado")))
    .all();

  const precio = servicio.precio ?? 0;
  const totalCobrado = pagosFilas.reduce((acc, p) => acc + p.monto, 0);
  const saldoPendiente = servicio.estatusPago === "cancelado" ? 0 : Math.max(0, precio - totalCobrado);

  return {
    precio,
    estatusPago: servicio.estatusPago,
    estatus: servicio.estatus,
    observaciones: servicio.observaciones,
    productosConsumidos,
    productosVendidos,
    pagos: pagosFilas,
    totalCobrado,
    saldoPendiente,
  };
}
