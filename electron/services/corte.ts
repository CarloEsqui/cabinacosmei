import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { cortes, pagos } from "../db/schema";
import { registrarAccion } from "./bitacora";
import { ligarPagosACorteEnTx, redondearDinero } from "./cobros";
import { fechaLocalIso } from "../../shared/fechas";
import type { CorteResumenPendiente, CorteRow, CorteResumenPeriodo, DesgloseMetodo } from "../../shared/types";

type Db = ReturnType<typeof getDb>;

function horaActual(): string {
  return new Date().toTimeString().slice(0, 5);
}

function agrupar(filas: { metodoPago: string; monto: number }[], signo = 1): DesgloseMetodo[] {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    mapa.set(f.metodoPago, redondearDinero((mapa.get(f.metodoPago) ?? 0) + signo * f.monto));
  }
  return [...mapa.entries()].map(([metodoPago, monto]) => ({ metodoPago, monto }));
}

function sumar(filas: { monto: number }[]): number {
  return redondearDinero(filas.reduce((acc, f) => acc + f.monto, 0));
}

/**
 * Lo pendiente de cortar, por LIGA y no por fecha (cobro v2, §22.4; DIN-M4). Síncrono a propósito:
 * registrarCorte lo llama DENTRO de su transacción (Gate del cobro, condición 8). Solo dinero.
 *  - cobros: pagos cobrados sin corte (incluye anticipos el día que entran: AC-004);
 *  - ajustes: pagos ya cortados que se cancelaron después y aún no tienen corte de cancelación;
 *  - un pago creado y cancelado dentro del periodo no aparece (BR-011).
 */
function calcularPendiente(db: Pick<Db, "select">): CorteResumenPendiente {
  const anterior = db.select().from(cortes).orderBy(desc(cortes.createdAt)).limit(1).get();

  const cobrados = db
    .select({ metodoPago: pagos.metodoPago, monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.fuente, "dinero"), eq(pagos.estatus, "cobrado"), isNull(pagos.corteId)))
    .all();

  const ajustes = db
    .select({ metodoPago: pagos.metodoPago, monto: pagos.monto })
    .from(pagos)
    .where(
      and(
        eq(pagos.fuente, "dinero"),
        eq(pagos.estatus, "cancelado"),
        isNotNull(pagos.corteId),
        isNull(pagos.corteCancelacionId),
      ),
    )
    .all();

  const anticipos = db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.concepto, "anticipo"), isNull(pagos.servicioRealizadoId), eq(pagos.estatus, "cobrado")))
    .all();

  const totalCobros = sumar(cobrados);
  const totalAjustes = -sumar(ajustes);
  return {
    desglosePorMetodo: agrupar(cobrados),
    totalCobros,
    ajustesPorMetodo: agrupar(ajustes, -1),
    totalAjustes,
    total: redondearDinero(totalCobros + totalAjustes),
    cantidadPagos: cobrados.length,
    cantidadAjustes: ajustes.length,
    desdeFecha: anterior?.fecha ?? null,
    anticiposSinAplicar: { cantidad: anticipos.length, total: sumar(anticipos) },
  };
}

export async function resumenPendiente(): Promise<CorteResumenPendiente> {
  return calcularPendiente(getDb());
}

function mapearCorte(c: typeof cortes.$inferSelect): CorteRow {
  return {
    id: c.id,
    fecha: c.fecha,
    hora: c.hora,
    desglosePorMetodo: JSON.parse(c.desglosePorMetodoJson),
    ajustesPorMetodo: JSON.parse(c.ajustesJson),
    totalAjustes: c.totalAjustes,
    total: c.total,
  };
}

/**
 * Registra el corte en UNA transacción (BR-011, §22.4): calcula el pendiente, rechaza un corte
 * vacío (DIN-M4), inserta el corte con cobros y ajustes por separado, y liga los pagos vía
 * cobros.ts, el único escritor de `pagos` (Gate, condición 5).
 */
export async function registrarCorte(usuarioId?: string): Promise<CorteRow> {
  const db = getDb();
  const id = randomUUID();

  db.transaction((tx) => {
    const resumen = calcularPendiente(tx);
    if (resumen.cantidadPagos === 0 && resumen.cantidadAjustes === 0) {
      throw new Error("No hay cobros ni ajustes pendientes de cortar.");
    }
    tx.insert(cortes)
      .values({
        id,
        fecha: fechaLocalIso(),
        hora: horaActual(),
        desglosePorMetodoJson: JSON.stringify(resumen.desglosePorMetodo),
        ajustesJson: JSON.stringify(resumen.ajustesPorMetodo),
        totalAjustes: resumen.totalAjustes,
        total: resumen.total,
        usuarioId: usuarioId || null,
      })
      .run();
    ligarPagosACorteEnTx(tx, id);
    registrarAccion(tx, {
      usuarioId,
      accion: "corte_registrado",
      entidadTipo: "corte",
      entidadId: id,
      detalle:
        `Total $${resumen.total.toFixed(2)} (${resumen.cantidadPagos} pagos` +
        (resumen.cantidadAjustes > 0
          ? `, ${resumen.cantidadAjustes} ajustes por $${resumen.totalAjustes.toFixed(2)})`
          : ")"),
    });
  });

  return mapearCorte(db.select().from(cortes).where(eq(cortes.id, id)).get()!);
}

export async function listarHistorial(): Promise<CorteRow[]> {
  const db = getDb();
  return db.select().from(cortes).orderBy(desc(cortes.createdAt)).all().map(mapearCorte);
}

export async function resumenDesde(fechaIso: string): Promise<CorteResumenPeriodo> {
  const db = getDb();
  const filas = db.select({ total: cortes.total }).from(cortes).where(gte(cortes.fecha, fechaIso)).all();
  return {
    total: redondearDinero(filas.reduce((acc, f) => acc + f.total, 0)),
    cantidadCortes: filas.length,
  };
}
