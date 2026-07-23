import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, AlertTriangle } from "lucide-react";
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

  // La última semana (≤7 días) o ya dentro del periodo de gracia se marca en rojo: es cuando de
  // verdad urge renovar. Antes de eso (p. ej. el aviso del mes en el plan anual) va en ámbar.
  const urgente = dias <= 7;
  const Icono = urgente ? AlertTriangle : CalendarClock;

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-6 py-2 text-sm ${
        urgente ? "border-danger-500/30 bg-danger-500/10" : "border-warning-500/30 bg-warning-500/10"
      }`}
    >
      <div className="flex items-center gap-2 text-ink-900">
        <Icono size={16} className={urgente ? "text-danger-500" : "text-warning-500"} />
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
