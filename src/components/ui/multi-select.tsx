import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  className?: string;
}

/** Selector con checkboxes que permite elegir varios valores a la vez (ej. filtrar por "Crítico" y "Bajo" simultáneamente). */
export function MultiSelect({ options, selected, onChange, placeholder, className }: MultiSelectProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, [abierto]);

  function alternar(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const etiqueta =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? placeholder)
        : `${selected.length} seleccionados`;

  return (
    <div className={cn("relative", className)} ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-beige-300 bg-beige-50 px-3 text-sm text-ink-700 hover:bg-beige-100"
      >
        <span className={cn("truncate", selected.length === 0 && "text-ink-500")}>{etiqueta}</span>
        <ChevronDown size={14} className="shrink-0 text-ink-500" />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[180px] overflow-y-auto rounded-lg border border-beige-300 bg-beige-50 shadow-lg">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-b border-beige-200 px-3 py-1.5 text-left text-xs text-jacaranda-700 hover:bg-beige-200"
            >
              Limpiar selección
            </button>
          )}
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-ink-700 hover:bg-beige-200"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected.includes(o.value)}
                onChange={() => alternar(o.value)}
              />
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  selected.includes(o.value) ? "border-jacaranda-600 bg-jacaranda-600 text-beige-50" : "border-beige-300",
                )}
              >
                {selected.includes(o.value) && <Check size={12} />}
              </span>
              {o.label}
            </label>
          ))}
          {options.length === 0 && <p className="px-3 py-2 text-xs text-ink-500">Sin opciones.</p>}
        </div>
      )}
    </div>
  );
}
