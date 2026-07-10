import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ActualizacionBanner() {
  const [estado, setEstado] = useState<{ tipo: "disponible" | "descargada"; version: string } | null>(null);

  useEffect(() => {
    const quitarDisponible = window.api.actualizaciones.onDisponible((info) =>
      setEstado({ tipo: "disponible", version: info.version }),
    );
    const quitarDescargada = window.api.actualizaciones.onDescargada((info) =>
      setEstado({ tipo: "descargada", version: info.version }),
    );
    return () => {
      quitarDisponible();
      quitarDescargada();
    };
  }, []);

  if (!estado) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-jacaranda-300 bg-jacaranda-50 px-6 py-2 text-sm">
      <div className="flex items-center gap-2 text-jacaranda-800">
        {estado.tipo === "descargada" ? <RefreshCw size={16} /> : <Download size={16} />}
        {estado.tipo === "descargada"
          ? `Actualización ${estado.version} lista para instalar.`
          : `Descargando actualización ${estado.version}...`}
      </div>
      {estado.tipo === "descargada" && (
        <Button size="sm" onClick={() => window.api.actualizaciones.instalarYReiniciar()}>
          Reiniciar e instalar
        </Button>
      )}
    </div>
  );
}
