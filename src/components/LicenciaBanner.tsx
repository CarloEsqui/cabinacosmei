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

  // "vencida" también se muestra: dentro del periodo de gracia el acceso sigue, así que este es
  // justo el momento en que más urge avisar que el bloqueo está por caer (antes se ocultaba aquí).
  if (!estado || (estado.estado !== "por_vencer" && estado.estado !== "vencida")) return null;

  const dias = estado.diasRestantes ?? 0;
  const vencida = estado.estado === "vencida";
  const mensaje = vencida
    ? "Tu licencia venció y el acceso se bloqueará en cualquier momento. Renueva ahora para no interrumpir tu trabajo."
    : dias >= 0
      ? `Tu licencia vence en ${dias} ${dias === 1 ? "día" : "días"}.`
      : `Tu licencia venció hace ${-dias} ${-dias === 1 ? "día" : "días"}. Renueva antes de que se bloquee el acceso.`;

  // Vencida, o dentro de la última semana (≤7 días), se marca en rojo: es cuando de verdad urge
  // renovar. Antes de eso (p. ej. el aviso del mes en el plan anual) va en ámbar.
  const urgente = vencida || dias <= 7;
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
