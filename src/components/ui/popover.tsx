import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PopoverProps {
  trigger: (props: { abierto: boolean }) => ReactNode;
  /** Recibe `cerrar` para que una opción (ej. un preset de fecha) pueda cerrar el panel al elegirse. */
  children: (props: { cerrar: () => void }) => ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
}

/**
 * Botón que revela un panel flotante debajo (filtros, selectores de periodo, etc.). Se cierra al
 * hacer clic afuera, con Escape, o llamando a `cerrar()` desde el contenido. Reemplaza hileras de
 * controles siempre visibles por un solo punto de entrada compacto
 * (ver INSTRUCCIONES_REDISENO_VISUAL_REPORTES_BELLORA §4.1).
 */
export function Popover({ trigger, children, align = "start", panelClassName }: PopoverProps) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alHacerClic(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClic);
    window.addEventListener("keydown", alPresionarTecla);
    return () => {
      document.removeEventListener("mousedown", alHacerClic);
      window.removeEventListener("keydown", alPresionarTecla);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setAbierto((v) => !v)}>{trigger({ abierto })}</div>
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute top-[calc(100%+6px)] z-30 rounded-2xl border border-beige-300 bg-beige-50 p-4 shadow-lg",
              align === "end" ? "right-0" : "left-0",
              panelClassName,
            )}
          >
            {children({ cerrar: () => setAbierto(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
