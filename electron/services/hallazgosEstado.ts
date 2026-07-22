import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { hallazgosEstado } from "../db/schema";
import type { EstadoHallazgo } from "../../shared/types";

function clave(hallazgoId: string, fechaDesde: string, fechaHasta: string): string {
  return `${hallazgoId}|${fechaDesde}|${fechaHasta}`;
}

/**
 * Estados guardados para TODOS los hallazgos de un rango exacto. Un hallazgo es un tipo (ej.
 * "clientas_riesgo"), no una entidad con id propio, así que el estado se ata a (tipo, rango) — si
 * el mismo tipo reaparece en un periodo distinto con cifras nuevas, vuelve a verse como "nuevo".
 */
export function obtenerEstados(fechaDesde: string, fechaHasta: string): Map<string, EstadoHallazgo> {
  const db = getDb();
  const filas = db
    .select({ hallazgoId: hallazgosEstado.hallazgoId, estado: hallazgosEstado.estado })
    .from(hallazgosEstado)
    .where(and(eq(hallazgosEstado.fechaDesde, fechaDesde), eq(hallazgosEstado.fechaHasta, fechaHasta)))
    .all();
  return new Map(filas.map((f) => [f.hallazgoId, f.estado as EstadoHallazgo]));
}

export function establecerEstadoHallazgo(
  hallazgoId: string,
  fechaDesde: string,
  fechaHasta: string,
  estado: EstadoHallazgo,
  usuarioId?: string,
): void {
  const db = getDb();
  const valorClave = clave(hallazgoId, fechaDesde, fechaHasta);
  db.insert(hallazgosEstado)
    .values({
      id: randomUUID(),
      clave: valorClave,
      hallazgoId,
      fechaDesde,
      fechaHasta,
      estado,
      usuarioId: usuarioId || null,
    })
    .onConflictDoUpdate({
      target: hallazgosEstado.clave,
      set: { estado, updatedAt: new Date() },
    })
    .run();
}
