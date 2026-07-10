import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { getDb } from "../db";
import { serviciosRealizados, citas, clientes, serviciosCatalogo } from "../db/schema";
import { crearCarpetaServicio } from "./folders";
import { tieneComprobante } from "./archivos";
import { registrarSalida } from "./inventario";
import { registrarPago } from "./pagos";
import { verificarPin } from "./auth";
import { registrarAccion } from "./bitacora";
import type { CierreCitaInput } from "../../shared/schemas";
import type { ServicioRealizado } from "../../shared/types";

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
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

  const fecha = hoyIso();
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

  const fecha = hoyIso();

  // Cada salida ya es atómica por sí misma (inventario.registrarSalida abre su propia transacción).
  for (const p of input.productosConsumidos) {
    await registrarSalida(
      {
        fecha,
        productoId: p.productoId,
        tipoSalida: "consumo_servicio",
        cantidad: p.cantidad,
        clienteId: servicio.clienteId,
        servicioRealizadoId: servicio.id,
      },
      usuarioId,
    );
  }
  for (const p of input.productosVendidos) {
    await registrarSalida(
      {
        fecha,
        productoId: p.productoId,
        tipoSalida: "venta",
        cantidad: p.cantidad,
        clienteId: servicio.clienteId,
        servicioRealizadoId: servicio.id,
      },
      usuarioId,
    );
  }

  const servicioCat = db
    .select()
    .from(serviciosCatalogo)
    .where(eq(serviciosCatalogo.id, servicio.servicioCatalogoId))
    .get();

  let proximaCitaSugerida: string | null = null;
  if (servicioCat?.periodicidadMantenimientoDias) {
    const proxima = new Date(fecha);
    proxima.setDate(proxima.getDate() + servicioCat.periodicidadMantenimientoDias);
    proximaCitaSugerida = proxima.toISOString().slice(0, 10);
  }

  db.transaction((tx) => {
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
