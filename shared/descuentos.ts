/**
 * Descuentos del ticket (spec .notes/spec-descuentos-2026-11-06.md, migración 0006).
 *
 * Un solo cálculo para la vista previa del cierre (renderer) y para el servidor (cobros.ts), con el
 * mismo redondeo (Gate de descuentos, condición 5; COB-B2). El servidor siempre recalcula: el
 * renderer nunca manda un monto como verdad.
 */

export type ModoDescuento = "porcentaje" | "monto";
export type BaseDescuento = "servicio" | "productos";
export type MotivoDescuento = "primera_visita" | "promocion" | "cortesia" | "otro";

export const MOTIVOS_DESCUENTO: { value: MotivoDescuento; label: string }[] = [
  { value: "primera_visita", label: "Primera visita" },
  { value: "promocion", label: "Promoción" },
  { value: "cortesia", label: "Cortesía" },
  { value: "otro", label: "Otro" },
];

export function etiquetaMotivo(motivo: string): string {
  return MOTIVOS_DESCUENTO.find((m) => m.value === motivo)?.label ?? motivo;
}

/**
 * BR-007 del cobro: 2 decimales, el mismo cuerpo que cobros.redondearDinero y LineasPago.redondear
 * (COB-B2). El código nuevo de descuentos usa este; unificar los otros dos queda para antes de la
 * Parte B (DES-B2).
 */
export function redondearDinero(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Monto de un descuento sobre su base. Porcentaje = base × valor / 100; monto = el valor. Nunca
 * supera la base ni baja de 0 (la validación con mensaje vive en `validarDescuento`).
 */
export function calcularDescuento({ modo, valor, base }: { modo: ModoDescuento; valor: number; base: number }): number {
  const b = redondearDinero(Math.max(0, base));
  const v = Math.max(0, valor);
  const monto = modo === "porcentaje" ? redondearDinero((b * v) / 100) : redondearDinero(v);
  return Math.min(monto, b);
}

/** Mensaje de error si el descuento no es válido sobre esa base, o null (BR-002). */
export function validarDescuento({ modo, valor, base }: { modo: ModoDescuento; valor: number; base: number }): string | null {
  if (!(valor > 0)) return "El descuento debe ser mayor a 0.";
  if (modo === "porcentaje" && valor > 100) return "El porcentaje no puede pasar de 100 %.";
  if (!(base > 0)) return "No hay monto sobre el cual aplicar el descuento.";
  if (modo === "monto" && redondearDinero(valor) > redondearDinero(base) + 0.005) {
    return `El descuento no puede ser mayor que $${redondearDinero(base).toFixed(2)}.`;
  }
  if (calcularDescuento({ modo, valor, base }) <= 0) return "El descuento redondeado queda en $0.";
  return null;
}
