import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface ExpandableProps {
  /** Cuando es true, el contenido se despliega con animación; cuando es false, se colapsa. */
  open: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Contenedor que despliega/colapsa su contenido con una animación suave (reveal).
 *
 * Mide la altura real del contenido con un ResizeObserver y anima `max-height` exactamente entre 0
 * y esa altura. Así la animación dura completa (es perceptible) sin importar cuánto mida el
 * contenido, funciona con contenido de alto variable (p. ej. una lista que crece) y nunca lo
 * recorta. Se anima `max-height` (no `height`) porque es la propiedad más fiable para esto.
 */
export function Expandable({ open, children, className }: ExpandableProps) {
  const contenidoRef = useRef<HTMLDivElement>(null);
  const [alturaContenido, setAlturaContenido] = useState(0);

  useLayoutEffect(() => {
    const el = contenidoRef.current;
    if (!el) return;
    const medir = () => setAlturaContenido(el.scrollHeight);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`overflow-hidden transition-all duration-300 ease-out ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      } ${className ?? ""}`}
      style={{ maxHeight: open ? alturaContenido : 0 }}
      aria-hidden={!open}
    >
      <div ref={contenidoRef}>{children}</div>
    </div>
  );
}
