import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

interface StatChipProps {
  /** Icono chico de lucide (opcional), en tono jacaranda discreto. */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Valor destacado (dinero, conteo…). Se muestra en tabular-nums font-semibold. */
  valor: React.ReactNode;
  /** Etiqueta breve bajo/junto al valor. */
  label: string;
  className?: string;
  /** Tono semántico opcional del valor (por defecto tinta). */
  tono?: "neutral" | "success" | "warning" | "danger";
}

const TONO_VALOR: Record<NonNullable<StatChipProps["tono"]>, string> = {
  neutral: "text-ink-900",
  success: "text-success-500",
  warning: "text-warning-500",
  danger: "text-danger-500",
};

/**
 * Stat discreto para franjas por encima de tablas/cards (§4): icono chico + valor tabular y
 * etiqueta menuda. Consume datos ya cargados; nunca dispara queries. Pensado para reutilizarse en
 * todas las secciones (Corte, Inventario, Clientes…).
 */
export function StatChip({ icon: Icon, valor, label, className, tono = "neutral" }: StatChipProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-beige-200/70 bg-beige-50 px-3.5 py-2.5",
        className,
      )}
    >
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-jacaranda-100 text-jacaranda-600">
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0 leading-tight">
        <p className={cn("metric-value truncate text-sm", TONO_VALOR[tono])}>{valor}</p>
        <p className="truncate text-xs text-ink-500">{label}</p>
      </div>
    </div>
  );
}
