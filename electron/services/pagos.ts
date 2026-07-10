import { randomUUID } from "node:crypto";
import type { getDb } from "../db";
import { pagos } from "../db/schema";

// Estructural en vez de nominal: así acepta tanto `db` como el `tx` de una transacción
// (SQLiteTransaction no trae `$client`, que sí exige el tipo completo BetterSQLite3Database).
interface DbLike {
  insert: ReturnType<typeof getDb>["insert"];
}

interface RegistrarPagoInput {
  clienteId: string;
  servicioRealizadoId?: string | null;
  fecha: string;
  monto: number;
  metodoPago: string;
  estatus?: "cobrado" | "cancelado";
  usuarioId?: string;
}

/** Recibe `db` (o una transacción `tx`) para poder registrarse dentro del cierre de cita. */
export function registrarPago(db: DbLike, input: RegistrarPagoInput) {
  const id = randomUUID();
  db.insert(pagos)
    .values({
      id,
      clienteId: input.clienteId,
      servicioRealizadoId: input.servicioRealizadoId || null,
      fecha: input.fecha,
      monto: input.monto,
      metodoPago: input.metodoPago,
      estatus: input.estatus ?? "cobrado",
      usuarioId: input.usuarioId || null,
    })
    .run();
  return id;
}
