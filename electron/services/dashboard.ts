import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { pagos, clientes, serviciosRealizados } from "../db/schema";
import { resumenPendiente } from "./corte";
import { fechaLocalIso, inicioDeMesIso } from "../../shared/fechas";
import type { ResumenDashboard } from "../../shared/types";

export async function resumenDashboard(): Promise<ResumenDashboard> {
  const db = getDb();
  const hoy = fechaLocalIso();
  const inicioMes = inicioDeMesIso();

  const cobradosHoy = db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.estatus, "cobrado"), eq(pagos.fecha, hoy)))
    .all();

  const pendiente = await resumenPendiente();

  const serviciosMes = db
    .select({ precio: serviciosRealizados.precio })
    .from(serviciosRealizados)
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        gte(serviciosRealizados.fecha, inicioMes),
        lte(serviciosRealizados.fecha, hoy),
      ),
    )
    .all();
  const totalMes = serviciosMes.reduce((acc, s) => acc + (s.precio ?? 0), 0);

  const clientasActivas = db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.activo, true))
    .all();

  return {
    cobradoHoy: cobradosHoy.reduce((acc, p) => acc + p.monto, 0),
    pendienteDeCortar: pendiente.total,
    serviciosDelMes: serviciosMes.length,
    ticketPromedioMes: serviciosMes.length > 0 ? totalMes / serviciosMes.length : 0,
    clientasActivas: clientasActivas.length,
  };
}
