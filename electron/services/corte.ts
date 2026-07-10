import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, gte } from "drizzle-orm";
import { getDb } from "../db";
import { cortes, pagos } from "../db/schema";
import { registrarAccion } from "./bitacora";
import type { CorteResumenPendiente, CorteRow, CorteResumenPeriodo, DesgloseMetodo } from "../../shared/types";

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function horaActual(): string {
  return new Date().toTimeString().slice(0, 5);
}

function agrupar(filas: { metodoPago: string; monto: number }[]): DesgloseMetodo[] {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    mapa.set(f.metodoPago, (mapa.get(f.metodoPago) ?? 0) + f.monto);
  }
  return [...mapa.entries()].map(([metodoPago, monto]) => ({ metodoPago, monto }));
}

function ultimoCorte() {
  const db = getDb();
  return db.select().from(cortes).orderBy(desc(cortes.createdAt)).limit(1).get();
}

/** Todo lo cobrado desde el último corte, sin importar cuántos días hayan pasado. */
export async function resumenPendiente(): Promise<CorteResumenPendiente> {
  const db = getDb();
  const anterior = ultimoCorte();

  const cobrados = db
    .select({ metodoPago: pagos.metodoPago, monto: pagos.monto })
    .from(pagos)
    .where(
      anterior
        ? and(eq(pagos.estatus, "cobrado"), gt(pagos.createdAt, anterior.createdAt))
        : eq(pagos.estatus, "cobrado"),
    )
    .all();

  const desglosePorMetodo = agrupar(cobrados);
  const total = cobrados.reduce((acc, p) => acc + p.monto, 0);

  return {
    desglosePorMetodo,
    total,
    cantidadPagos: cobrados.length,
    desdeFecha: anterior?.fecha ?? null,
  };
}

export async function registrarCorte(usuarioId?: string): Promise<CorteRow> {
  const db = getDb();
  const resumen = await resumenPendiente();

  const id = randomUUID();
  db.insert(cortes)
    .values({
      id,
      fecha: hoyIso(),
      hora: horaActual(),
      desglosePorMetodoJson: JSON.stringify(resumen.desglosePorMetodo),
      total: resumen.total,
      usuarioId: usuarioId || null,
    })
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "corte_registrado",
    entidadTipo: "corte",
    entidadId: id,
    detalle: `Total $${resumen.total.toFixed(2)} (${resumen.cantidadPagos} pagos)`,
  });

  const creado = db.select().from(cortes).where(eq(cortes.id, id)).get()!;
  return {
    id: creado.id,
    fecha: creado.fecha,
    hora: creado.hora,
    desglosePorMetodo: JSON.parse(creado.desglosePorMetodoJson),
    total: creado.total,
  };
}

export async function listarHistorial(): Promise<CorteRow[]> {
  const db = getDb();
  const filas = db.select().from(cortes).orderBy(desc(cortes.createdAt)).all();
  return filas.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    hora: c.hora,
    desglosePorMetodo: JSON.parse(c.desglosePorMetodoJson),
    total: c.total,
  }));
}

export async function resumenDesde(fechaIso: string): Promise<CorteResumenPeriodo> {
  const db = getDb();
  const filas = db.select({ total: cortes.total }).from(cortes).where(gte(cortes.fecha, fechaIso)).all();
  return {
    total: filas.reduce((acc, f) => acc + f.total, 0),
    cantidadCortes: filas.length,
  };
}
