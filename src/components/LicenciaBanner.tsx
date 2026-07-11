import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LicenciaBanner() {
  const { data: estado } = useQuery({
    queryKey: ["licenciaEstado"],
    queryFn: () => window.api.licencia.estado(),
    refetchInterval: 60 * 60 * 1000,
  });

  if (!estado || estado.estado !== "por_vencer") return null;

  const dias = estado.diasRestantes ?? 0;
  const mensaje =
    dias >= 0
      ? `Tu licencia vence en ${dias} ${dias === 1 ? "día" : "días"}.`
      : `Tu licencia venció hace ${-dias} ${-dias === 1 ? "día" : "días"}. Renueva antes de que se bloquee el acceso.`;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning-500/30 bg-warning-500/10 px-6 py-2 text-sm">
      <div className="flex items-center gap-2 text-ink-900">
        <CalendarClock size={16} className="text-warning-500" />
        {mensaje}
      </div>
      <Link to="/configuracion">
        <Button size="sm" variant="secondary">
          Ver matrícula
        </Button>
      </Link>
    </div>
  );
}
