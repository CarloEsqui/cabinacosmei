import { useQuery } from "@tanstack/react-query";
import { ClipboardList, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * FR-009 / FR-010: aviso de Precaución de la ficha clínica. Solo recibe el resumen (preguntas con Sí
 * y su "Especifique"), nunca la ficha completa (Gate de la ficha, condición 11).
 */
export function AvisoPrecaucion({ clienteId, onAbrirFicha }: { clienteId: string; onAbrirFicha?: () => void }) {
  const { data: aviso } = useQuery({
    queryKey: ["fichaAviso", clienteId],
    queryFn: () => window.api.fichas.aviso(clienteId),
  });
  if (!aviso) return null;

  if (aviso.precauciones.length > 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 py-2 pl-3 pr-2 text-sm text-danger-500">
        <div className="flex min-w-0 items-center gap-2">
          <TriangleAlert size={16} className="shrink-0" />
          <p className="leading-snug">
            <span className="font-semibold">Precaución: </span>
            {aviso.precauciones.map((p, i) => (
              <span key={p.clave}>
                {i > 0 && " · "}
                {p.etiqueta}
                {p.especifique ? ` — ${p.especifique}` : ""}
              </span>
            ))}
          </p>
        </div>
        {onAbrirFicha && (
          <Button variant="ghost" size="sm" className="shrink-0 text-danger-500" onClick={onAbrirFicha}>
            Ver ficha
          </Button>
        )}
      </div>
    );
  }

  if (!onAbrirFicha) return null;
  // FR-010: sin ficha, gris y sin alarma; con ficha y sin precauciones, solo el acceso.
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-500">
      <span className="flex items-center gap-1.5">
        <ClipboardList size={14} /> {aviso.tieneFicha ? "Ficha clínica sin precauciones" : "Sin ficha clínica"}
      </span>
      <Button variant="ghost" size="sm" onClick={onAbrirFicha}>
        {aviso.tieneFicha ? "Ver ficha" : "Llenar ficha"}
      </Button>
    </div>
  );
}
