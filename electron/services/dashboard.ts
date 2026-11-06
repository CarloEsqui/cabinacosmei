import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "../db";
import { clientes, serviciosRealizados } from "../db/schema";
import { resumenPendiente } from "./corte";
import { cobrosDeDinero, redondearDinero, totalTicket } from "./cobros";
import { fechaLocalIso, inicioDeMesIso } from "../../shared/fechas";
import type { ResumenDashboard } from "../../shared/types";

export async function resumenDashboard(): Promise<ResumenDashboard> {
  const db = getDb();
  const hoy = fechaLocalIso();
  const inicioMes = inicioDeMesIso();

  // Pagos con fecha de hoy = cobrados hoy (cobro v2: el pago lleva el día del cobro, DIN-M1).
  const cobradosHoy = cobrosDeDinero(db, hoy, hoy);

  const pendiente = await resumenPendiente();

  const serviciosMes = db
    .select({ precio: serviciosRealizados.precio, totalProductos: serviciosRealizados.totalProductos })
    .from(serviciosRealizados)
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        // Igual que Reportes: un servicio "cancelado" no es venta (CIT-M2).
        ne(serviciosRealizados.estatusPago, "cancelado"),
        gte(serviciosRealizados.fecha, inicioMes),
        lte(serviciosRealizados.fecha, hoy),
      ),
    )
    .all();
  const totalMes = serviciosMes.reduce((acc, s) => acc + totalTicket(s), 0);

  const clientasActivas = db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.activo, true))
    .all();

  return {
    cobradoHoy: redondearDinero(cobradosHoy.reduce((acc, p) => acc + p.monto, 0)),
    pendienteDeCortar: pendiente.total,
    serviciosDelMes: serviciosMes.length,
    ticketPromedioMes: serviciosMes.length > 0 ? totalMes / serviciosMes.length : 0,
    clientasActivas: clientasActivas.length,
  };
}
