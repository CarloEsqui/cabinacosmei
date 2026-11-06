import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { List, Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OpcionBuscable {
  value: string;
  label: string;
  /** Texto secundario que también se busca (ej. código de clienta, línea del producto). */
  detalle?: string;
}

interface SelectBuscableProps {
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionBuscable[];
  /** Primera opción de la lista, con valor "" (ej. "Selecciona una clienta" o "Sin proveedor"). */
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const MAX_RESULTADOS = 8;

/** Minúsculas y sin acentos: "Lucía" se encuentra escribiendo "lucia". */
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Lista desplegable con una lupa al lado. La lupa cambia la MISMA barra a modo escribir: se teclea
 * parte del nombre (en cualquier orden, sin acentos) y aparecen solo las coincidencias. Al elegir
 * una, la barra vuelve a ser la lista con esa opción seleccionada. Escape también regresa a la lista.
 * Pensada para listas que crecen (clientas, productos, proveedores, servicios).
 */
export function SelectBuscable({
  value,
  onChange,
  opciones,
  placeholder,
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SelectBuscableProps) {
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number } | null>(null);

  const resultados = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    const coincide = opciones.filter((o) => {
      const donde = normalizar(`${o.label} ${o.detalle ?? ""}`);
      return palabras.every((p) => donde.includes(p));
    });
    // Primero las que empiezan con lo escrito; después el resto en su orden original.
    const inicio = palabras[0] ?? "";
    const empiezan = coincide.filter((o) => normalizar(o.label).startsWith(inicio));
    const resto = coincide.filter((o) => !normalizar(o.label).startsWith(inicio));
    return [...empiezan, ...resto].slice(0, MAX_RESULTADOS);
  }, [texto, opciones]);

  useEffect(() => setActivo(0), [texto]);

  // La lista de resultados va en un portal: el Modal tiene scroll propio y un contenedor
  // transformado que recortaría o desplazaría un menú posicionado dentro de él.
  useLayoutEffect(() => {
    if (!buscando) return;
    function medir() {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPosicion({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [buscando]);

  function abrirBusqueda() {
    setTexto("");
    setBuscando(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cerrarBusqueda() {
    setBuscando(false);
    setTexto("");
    setPosicion(null);
  }

  function elegir(o: OpcionBuscable) {
    onChange(o.value);
    cerrarBusqueda();
  }

  return (
    <div className={cn("flex min-w-0 gap-1.5", className)}>
      {buscando ? (
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={cerrarBusqueda}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((i) => Math.min(i + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              // Nunca envía el formulario desde aquí: Enter elige la coincidencia marcada.
              e.preventDefault();
              if (resultados[activo]) elegir(resultados[activo]);
            } else if (e.key === "Escape") {
              // Solo regresa a la lista; no debe cerrar el modal que contiene el campo.
              e.preventDefault();
              e.stopPropagation();
              cerrarBusqueda();
            }
          }}
          placeholder="Escribe para buscar…"
          aria-label={ariaLabel ? `Buscar: ${ariaLabel}` : "Buscar"}
          className={cn(
            "h-10 min-w-0 flex-1 rounded-xl border border-jacaranda-400 bg-beige-50 px-3 text-sm text-ink-900",
            "focus:outline-none focus:ring-2 focus:ring-jacaranda-400",
          )}
        />
      ) : (
        <Select
          className="min-w-0 flex-1"
          required={required}
          disabled={disabled}
          value={value}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
      {!disabled && (
        <Button
          type="button"
          variant="secondary"
          className="px-2.5"
          title={buscando ? "Volver a la lista" : "Buscar escribiendo"}
          // mousedown evita que el input pierda el foco antes del clic (cerraría y reabriría).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (buscando ? cerrarBusqueda() : abrirBusqueda())}
        >
          {buscando ? <List size={16} /> : <Search size={16} />}
        </Button>
      )}

      {buscando &&
        posicion &&
        createPortal(
          <ul
            role="listbox"
            style={{ top: posicion.top, left: posicion.left, width: posicion.width }}
            className="fixed z-[60] max-h-72 overflow-y-auto rounded-xl border border-beige-300 bg-beige-50 py-1 shadow-lg"
          >
            {resultados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-500">Sin coincidencias.</li>
            ) : (
              resultados.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={i === activo}
                  // mousedown + preventDefault: elige antes de que el blur cierre la búsqueda.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(o);
                  }}
                  onMouseEnter={() => setActivo(i)}
                  className={cn(
                    "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm",
                    i === activo ? "bg-jacaranda-50 text-jacaranda-700" : "text-ink-900",
                    o.value === value && "font-medium",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.detalle && <span className="shrink-0 text-xs text-ink-500">{o.detalle}</span>}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
