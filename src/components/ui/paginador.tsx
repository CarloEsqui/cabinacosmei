import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const POR_PAGINA = 30;

/**
 * Corta una lista ya filtrada y ordenada en páginas. `reinicio` es cualquier valor que cambie
 * cuando cambian los filtros: al cambiar, vuelve a la página 1. Si la lista se encoge (por ej.
 * se elimina un registro de la última página), la página se ajusta a la última que exista.
 */
export function usePaginacion<T>(items: T[], reinicio: string, porPagina = POR_PAGINA) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));

  useEffect(() => setPagina(1), [reinicio]);

  const actual = Math.min(pagina, totalPaginas);
  const inicio = (actual - 1) * porPagina;
  return {
    pagina: actual,
    totalPaginas,
    visibles: items.slice(inicio, inicio + porPagina),
    desde: items.length === 0 ? 0 : inicio + 1,
    hasta: Math.min(inicio + porPagina, items.length),
    total: items.length,
    irA: setPagina,
  };
}

/** Números a mostrar: siempre la primera y la última, y las vecinas de la actual. */
function numerosVisibles(pagina: number, total: number): (number | "…")[] {
  const set = new Set([1, total, pagina - 1, pagina, pagina + 1].filter((n) => n >= 1 && n <= total));
  const orden = [...set].sort((a, b) => a - b);
  const salida: (number | "…")[] = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1] > 1) salida.push("…");
    salida.push(n);
  });
  return salida;
}

export function Paginador({
  pagina,
  totalPaginas,
  desde,
  hasta,
  total,
  sustantivo,
  onCambiar,
}: {
  pagina: number;
  totalPaginas: number;
  desde: number;
  hasta: number;
  total: number;
  /** Singular y plural: ["cita", "citas"]. */
  sustantivo: [string, string];
  onCambiar: (pagina: number) => void;
}) {
  const nombre = total === 1 ? sustantivo[0] : sustantivo[1];
  if (totalPaginas <= 1) {
    return (
      <p className="px-1 text-xs text-ink-500">
        {total} {nombre}
      </p>
    );
  }

  function ir(n: number) {
    onCambiar(n);
    // Al cambiar de página se regresa arriba, como en cualquier listado paginado.
    document.querySelector("[data-scroll-principal]")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const botonBase =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-1" aria-label="Páginas">
      <p className="text-xs text-ink-500">
        {desde}–{hasta} de {total} {nombre}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(botonBase, "gap-1 text-ink-700 hover:bg-beige-200")}
          disabled={pagina === 1}
          onClick={() => ir(pagina - 1)}
        >
          <ChevronLeft size={16} /> Anterior
        </button>
        {numerosVisibles(pagina, totalPaginas).map((n, i) =>
          n === "…" ? (
            <span key={`hueco-${i}`} className="px-1 text-ink-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === pagina ? "page" : undefined}
              className={cn(
                botonBase,
                n === pagina ? "bg-jacaranda-600 text-beige-50 shadow-sm" : "text-ink-700 hover:bg-beige-200",
              )}
              onClick={() => ir(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(botonBase, "gap-1 text-ink-700 hover:bg-beige-200")}
          disabled={pagina === totalPaginas}
          onClick={() => ir(pagina + 1)}
        >
          Siguiente <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
