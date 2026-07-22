/**
 * Helpers de fecha/hora en horario LOCAL (no UTC).
 *
 * `Date#toISOString()` siempre devuelve componentes en UTC. En México (UTC-6), usar
 * `toISOString().slice(0, 10)` para "la fecha de hoy" hace que cualquier acción realizada
 * entre las 18:00 y las 23:59 quede registrada con la fecha del día siguiente. Estos
 * helpers usan los getters locales (`getFullYear`/`getMonth`/`getDate`) para evitar ese
 * desfase. Úsalos en cualquier lugar que necesite "la fecha/hora de hoy" para persistir datos.
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fechaLocalIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function horaLocal(d: Date = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function sumarDiasIso(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const d = new Date(anio, mes - 1, dia);
  d.setDate(d.getDate() + dias);
  return fechaLocalIso(d);
}

export function inicioDeMesIso(d: Date = new Date()): string {
  return fechaLocalIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function inicioDeSemanaIso(d: Date = new Date()): string {
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  inicio.setDate(inicio.getDate() + diff);
  return fechaLocalIso(inicio);
}

function fechaDesdeIso(iso: string): Date {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

/** Cantidad de días que abarca un rango inclusivo [desde, hasta]. */
export function diasEnRango(desde: string, hasta: string): number {
  const d1 = fechaDesdeIso(desde).getTime();
  const d2 = fechaDesdeIso(hasta).getTime();
  return Math.round((d2 - d1) / 86_400_000) + 1;
}

export type ModoComparacion = "ninguna" | "anterior" | "mes_anterior" | "anio_anterior";

/**
 * Calcula el rango de comparación para un rango [desde, hasta] según el modo:
 * - "anterior": el periodo inmediatamente previo, de EXACTAMENTE la misma duración.
 * - "mes_anterior": el mismo rango corrido un mes hacia atrás.
 * - "anio_anterior": el mismo rango corrido un año hacia atrás.
 * Devuelve null si no hay comparación.
 */
export function rangoComparacion(
  desde: string,
  hasta: string,
  modo: ModoComparacion,
): { desde: string; hasta: string } | null {
  if (modo === "ninguna") return null;

  if (modo === "anterior") {
    const dias = diasEnRango(desde, hasta);
    const finPrev = fechaDesdeIso(desde);
    finPrev.setDate(finPrev.getDate() - 1);
    const iniPrev = new Date(finPrev);
    iniPrev.setDate(iniPrev.getDate() - (dias - 1));
    return { desde: fechaLocalIso(iniPrev), hasta: fechaLocalIso(finPrev) };
  }

  const corrimientoMeses = modo === "mes_anterior" ? 1 : 12;
  const d1 = fechaDesdeIso(desde);
  const d2 = fechaDesdeIso(hasta);
  d1.setMonth(d1.getMonth() - corrimientoMeses);
  d2.setMonth(d2.getMonth() - corrimientoMeses);
  return { desde: fechaLocalIso(d1), hasta: fechaLocalIso(d2) };
}
