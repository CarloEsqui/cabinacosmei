import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  /** Convierte el número (posiblemente decimal durante la animación) a texto para mostrar. */
  format?: (n: number) => string;
  durationMs?: number;
}

/**
 * Muestra un número que "cuenta" animadamente desde 0 (o desde su valor anterior) hasta el valor
 * actual, con easing suave. Útil para cifras destacadas (KPIs, totales). Respeta la preferencia
 * de reducir movimiento del sistema.
 */
export function AnimatedNumber({ value, format, durationMs = 700 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const desdeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const valorInicial = desdeRef.current;
    const delta = value - valorInicial;
    if (reduce || delta === 0) {
      setDisplay(value);
      desdeRef.current = value;
      return;
    }
    const inicio = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - inicio) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(valorInicial + delta * eased);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        desdeRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  const fmt = format ?? ((n) => String(Math.round(n)));
  return <>{fmt(display)}</>;
}
