import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoneda } from "@/lib/format";
import {
  MOTIVOS_DESCUENTO,
  calcularDescuento,
  validarDescuento,
  type BaseDescuento,
  type ModoDescuento,
  type MotivoDescuento,
} from "@shared/descuentos";
import type { DescuentoCaptura } from "@shared/schemas";

/** Lo que se está capturando. `valor` null = sin descuento. */
export interface DescuentoBorrador {
  modo: ModoDescuento;
  valor: number | null;
  motivo: MotivoDescuento | null;
  motivoDetalle: string;
}

export const DESCUENTO_VACIO: DescuentoBorrador = { modo: "porcentaje", valor: null, motivo: null, motivoDetalle: "" };

export function hayDescuento(b: DescuentoBorrador): boolean {
  return b.valor !== null && b.valor > 0;
}

/** Monto de la vista previa: el mismo cálculo que hace el servidor (Gate, condición 5). */
export function montoDescuento(b: DescuentoBorrador, base: number): number {
  if (!hayDescuento(b) || base <= 0) return 0;
  return calcularDescuento({ modo: b.modo, valor: b.valor!, base });
}

/** Mensaje si el borrador no se puede enviar, o null. Sin valor = sin descuento = sin error. */
export function errorDescuento(b: DescuentoBorrador, base: number): string | null {
  if (!hayDescuento(b)) return null;
  const e = validarDescuento({ modo: b.modo, valor: b.valor!, base });
  if (e) return e;
  if (!b.motivo) return "Elige el motivo del descuento.";
  if (b.motivo === "otro" && !b.motivoDetalle.trim()) return "Escribe el motivo del descuento.";
  return null;
}

export function descuentoParaEnviar(b: DescuentoBorrador, aplicaA: BaseDescuento): DescuentoCaptura | null {
  if (!hayDescuento(b) || !b.motivo) return null;
  return {
    aplicaA,
    modo: b.modo,
    valor: b.valor!,
    motivo: b.motivo,
    ...(b.motivo === "otro" ? { motivoDetalle: b.motivoDetalle.trim() } : {}),
  };
}

/**
 * Captura compacta de un descuento: % o $, el valor y, solo cuando hay valor, los motivos en
 * botones rápidos. Sin valor ocupa una sola línea (spec de descuentos, §12).
 */
export function DescuentoCampo({
  etiqueta,
  base,
  value,
  onChange,
}: {
  etiqueta: string;
  base: number;
  value: DescuentoBorrador;
  onChange: (b: DescuentoBorrador) => void;
}) {
  const monto = montoDescuento(value, base);
  const error = errorDescuento(value, base);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-ink-500">{etiqueta}</span>
        <div className="flex overflow-hidden rounded-xl border border-beige-300" role="group" aria-label="Tipo de descuento">
          {(["porcentaje", "monto"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, modo: m })}
              className={cn(
                "h-10 w-9 text-sm",
                value.modo === m ? "bg-jacaranda-500 text-white" : "bg-beige-50 text-ink-700 hover:bg-beige-100",
              )}
              aria-pressed={value.modo === m}
            >
              {m === "porcentaje" ? "%" : "$"}
            </button>
          ))}
        </div>
        <NumberInput
          // key por modo: NumberInput guarda su texto; al cambiar de % a $ se reinicia el valor.
          key={value.modo}
          className="w-24"
          allowNull
          min={0}
          step="0.01"
          placeholder={value.modo === "porcentaje" ? "0 %" : "$0"}
          value={value.valor}
          onValueChange={(v) => onChange({ ...value, valor: v })}
          aria-label={`${etiqueta} (${value.modo === "porcentaje" ? "porcentaje" : "monto"})`}
        />
        <span className={cn("w-24 text-right text-sm tabular-nums", monto > 0 ? "text-success-500" : "text-ink-400")}>
          {monto > 0 ? `− ${formatMoneda(monto)}` : "—"}
        </span>
      </div>

      {hayDescuento(value) && (
        <div className="flex flex-col gap-2 pl-1">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo del descuento">
            {MOTIVOS_DESCUENTO.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onChange({ ...value, motivo: m.value })}
                aria-pressed={value.motivo === m.value}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  value.motivo === m.value
                    ? "border-jacaranda-500 bg-jacaranda-50 font-medium text-jacaranda-700"
                    : "border-beige-300 bg-beige-50 text-ink-700 hover:bg-beige-100",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {value.motivo === "otro" && (
            <Input
              placeholder="Motivo (sin nombres ni datos de salud)"
              maxLength={120}
              value={value.motivoDetalle}
              onChange={(e) => onChange({ ...value, motivoDetalle: e.target.value })}
            />
          )}
          {error && <p className="text-xs text-danger-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
