import { AlertTriangle, AlertCircle, Lightbulb, Sparkles, ArrowRight, X } from "lucide-react";
import type { Hallazgo, TonoHallazgo } from "@shared/types";

export const TAB_DE_CATEGORIA: Record<string, string> = {
  Ventas: "finanzas",
  Agenda: "agenda",
  Clientas: "clientes",
  Inventario: "inventario",
};

const ESTILO: Record<TonoHallazgo, { icono: typeof AlertTriangle; color: string; fondo: string; grupo: string }> = {
  critico: { icono: AlertTriangle, color: "text-danger-500", fondo: "bg-danger-500/[0.05] border-danger-500/20", grupo: "Urgente" },
  atencion: { icono: AlertCircle, color: "text-warning-500", fondo: "bg-warning-500/[0.05] border-warning-500/20", grupo: "Importante" },
  positivo: { icono: Sparkles, color: "text-success-500", fondo: "bg-success-500/[0.05] border-success-500/20", grupo: "Oportunidad" },
  informativo: { icono: Lightbulb, color: "text-jacaranda-500", fondo: "bg-jacaranda-500/[0.05] border-jacaranda-400/20", grupo: "Información" },
};

export function grupoDeTono(tono: TonoHallazgo): string {
  return ESTILO[tono].grupo;
}

interface HallazgoCardProps {
  hallazgo: Hallazgo;
  onNavegar: (tab: string) => void;
  onDescartar?: () => void;
  compacto?: boolean;
}

/**
 * Una recomendación accionable, no una fila de tabla: severidad + título con el impacto ya
 * incluido + explicación de una línea + una acción que lleva a la pestaña donde se resuelve
 * (INSTRUCCIONES §8, formato del ejemplo "[Crítico] Producto caducado con existencia / $1,500
 * inmovilizados / Registra el lote como merma... / [Registrar merma] [Ver lote]").
 */
export function HallazgoCard({ hallazgo, onNavegar, onDescartar, compacto = false }: HallazgoCardProps) {
  const est = ESTILO[hallazgo.tono];
  const Icono = est.icono;
  const tab = TAB_DE_CATEGORIA[hallazgo.categoria];

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${est.fondo}`}>
      <Icono size={16} className={`mt-0.5 shrink-0 ${est.color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-ink-900">{hallazgo.titulo}</p>
        {!compacto && <p className="mt-0.5 text-xs leading-snug text-ink-600">{hallazgo.detalle}</p>}
        {tab && (
          <button
            type="button"
            onClick={() => onNavegar(tab)}
            className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${est.color} hover:underline`}
          >
            Ver en {hallazgo.categoria} <ArrowRight size={12} />
          </button>
        )}
      </div>
      {onDescartar && (
        <button
          type="button"
          onClick={onDescartar}
          className="shrink-0 rounded p-1 text-ink-300 hover:bg-beige-200 hover:text-ink-500"
          aria-label="Descartar"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
