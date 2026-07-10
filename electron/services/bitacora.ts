import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { bitacora, usuarios } from "../db/schema";
import type { BitacoraFiltro } from "../../shared/schemas";
import type { BitacoraRow } from "../../shared/types";

// Estructural en vez de nominal: así acepta tanto `db` como el `tx` de una transacción.
interface DbLike {
  insert: ReturnType<typeof getDb>["insert"];
}

interface RegistrarAccionInput {
  usuarioId?: string;
  accion: string;
  entidadTipo?: string;
  entidadId?: string;
  detalle?: string;
}

/** Registro de auditoría: quién hizo qué y cuándo. Recibe `db` o una transacción `tx`. */
export function registrarAccion(db: DbLike, input: RegistrarAccionInput): void {
  db.insert(bitacora)
    .values({
      id: randomUUID(),
      usuarioId: input.usuarioId || null,
      accion: input.accion,
      entidadTipo: input.entidadTipo || null,
      entidadId: input.entidadId || null,
      detalle: input.detalle || null,
    })
    .run();
}

export async function listarBitacora(filtro: BitacoraFiltro): Promise<BitacoraRow[]> {
  const db = getDb();
  const condiciones: SQL[] = [];
  if (filtro.fechaDesde) condiciones.push(gte(bitacora.createdAt, new Date(filtro.fechaDesde)));
  if (filtro.fechaHasta) condiciones.push(lte(bitacora.createdAt, new Date(`${filtro.fechaHasta}T23:59:59`)));
  if (filtro.accion) condiciones.push(eq(bitacora.accion, filtro.accion));

  const filas = db
    .select({
      id: bitacora.id,
      usuarioId: bitacora.usuarioId,
      usuarioNombre: usuarios.nombre,
      accion: bitacora.accion,
      entidadTipo: bitacora.entidadTipo,
      entidadId: bitacora.entidadId,
      detalle: bitacora.detalle,
      createdAt: bitacora.createdAt,
    })
    .from(bitacora)
    .leftJoin(usuarios, eq(usuarios.id, bitacora.usuarioId))
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
    .orderBy(desc(bitacora.createdAt))
    .limit(filtro.limite)
    .all();

  return filas.map((f) => ({ ...f, createdAt: f.createdAt.getTime() }));
}
