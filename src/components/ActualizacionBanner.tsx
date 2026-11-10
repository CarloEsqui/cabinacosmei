import { useEffect, useState } from "react";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoActualizacion, ProgresoActualizacion } from "@shared/types";

const MB = 1024 * 1024;

function megas(bytes: number): string {
  return (bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0);
}

function tiempoRestante(p: ProgresoActualizacion): string | null {
  if (!(p.bytesPorSegundo > 0) || !(p.total > p.transferido)) return null;
  const segundos = (p.total - p.transferido) / p.bytesPorSegundo;
  if (!Number.isFinite(segundos)) return null;
  if (segundos < 60) return "menos de 1 min";
  const minutos = Math.ceil(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

export function ActualizacionBanner() {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);

  useEffect(() => {
    // El aviso se monta después del PIN, cuando la descarga quizá ya empezó: primero escucha y luego
    // pide el estado actual; si mientras tanto llegó un cambio, ese es más reciente (ACT-M1).
    let recibioCambio = false;
    const quitar = window.api.actualizaciones.onCambio((nuevo) => {
      recibioCambio = true;
      setEstado(nuevo);
    });
    window.api.actualizaciones
      .estado()
      .then((actual) => {
        if (!recibioCambio) setEstado(actual);
      })
      .catch(() => {});
    return quitar;
  }, []);

  if (!estado) return null;

  if (estado.tipo === "error") {
    return (
      <div className="flex items-center gap-2 border-b border-beige-300 bg-beige-50 px-6 py-2 text-sm text-ink-700">
        <AlertTriangle size={16} className="shrink-0 text-warning-500" />
        {estado.fase === "descarga"
          ? `No se pudo descargar la actualización ${estado.version}. Se volverá a intentar la próxima vez que abras la app.`
          : `No se pudo iniciar la instalación de la actualización ${estado.version}. Cierra la app y vuelve a abrirla para intentarlo de nuevo.`}
      </div>
    );
  }

  if (estado.tipo === "descargada") {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-jacaranda-300 bg-jacaranda-50 px-6 py-2 text-sm">
        <div className="flex items-center gap-2 text-jacaranda-800">
          <RefreshCw size={16} className="shrink-0" />
          <span>
            <span className="font-semibold">Actualización {estado.version} lista.</span> Al reiniciar se abre el
            instalador: sigue sus pasos y al final pulsa <span className="font-semibold">Terminar</span> para que la
            app vuelva a abrirse.
          </span>
        </div>
        <Button size="sm" onClick={() => window.api.actualizaciones.instalarYReiniciar()}>
          Reiniciar e instalar
        </Button>
      </div>
    );
  }

  // Sin un porcentaje válido se queda en "Preparando…" (ACT-B2).
  const p = estado.progreso && Number.isFinite(estado.progreso.porcentaje) ? estado.progreso : null;
  // floor con tope 99: que nunca diga 100 % antes de que la descarga termine de verdad.
  const porcentaje = p ? Math.min(99, Math.max(0, Math.floor(p.porcentaje))) : 0;
  const restante = p ? tiempoRestante(p) : null;

  return (
    <div className="border-b border-jacaranda-300 bg-jacaranda-50 px-6 py-2 text-sm">
      <div className="flex items-center justify-between gap-3 text-jacaranda-800">
        <div className="flex min-w-0 items-center gap-2">
          <Download size={16} className="shrink-0" />
          <span className="truncate">
            Descargando actualización {estado.version}
            <span className="text-jacaranda-700/80"> · puedes seguir trabajando</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 tabular-nums">
          {p ? (
            <>
              <span className="text-jacaranda-700/80">
                {megas(p.transferido)} de {megas(p.total)} MB
                {restante && ` · quedan ${restante}`}
              </span>
              <span className="metric-value w-10 text-right">{porcentaje} %</span>
            </>
          ) : (
            <span className="text-jacaranda-700/80">Preparando…</span>
          )}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Descarga de la actualización"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p ? porcentaje : undefined}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-jacaranda-100"
      >
        <div
          className={
            p
              ? "h-full rounded-full bg-jacaranda-500 transition-[width] duration-700 ease-out"
              : "h-full w-full animate-pulse rounded-full bg-jacaranda-200"
          }
          style={p ? { width: `${porcentaje}%` } : undefined}
        />
      </div>
    </div>
  );
}
