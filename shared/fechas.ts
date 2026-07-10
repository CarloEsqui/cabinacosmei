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
