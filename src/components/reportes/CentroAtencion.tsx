import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Sparkles } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { HallazgoCard, grupoDeTono } from "@/components/reportes/HallazgoCard";
import { mensajeDeError } from "@/lib/errores";
import type { ResumenFiltro } from "@shared/schemas";
import type { EstadoHallazgo, Hallazgo } from "@shared/types";

const ORDEN_GRUPOS = ["Urgente", "Importante", "Oportunidad", "Información"];

/**
 * Centro de atención: reemplaza la lista plana de hallazgos por un panel agrupado por severidad
 * (INSTRUCCIONES §8). El estado (descartado/restaurado) se persiste por (tipo de hallazgo, rango
 * de fechas) en la base de datos — si el mismo tipo reaparece en otro periodo con cifras nuevas,
 * vuelve a mostrarse como nuevo.
 */
export function useHallazgos(filtro: ResumenFiltro) {
  return useQuery({
    queryKey: ["reporteHallazgos", filtro],
    queryFn: () => window.api.reportes.hallazgos(filtro),
  });
}

function useEstablecerEstado(filtro: ResumenFiltro) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: { hallazgoId: string; estado: EstadoHallazgo }) =>
      window.api.reportes.establecerEstadoHallazgo({
        hallazgoId: input.hallazgoId,
        fechaDesde: filtro.fechaDesde,
        fechaHasta: filtro.fechaHasta,
        estado: input.estado,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reporteHallazgos", filtro] }),
    onError: (e) => toast.error(mensajeDeError(e)),
  });
}

export function CentroAtencionDrawer({
  open,
  onClose,
  hallazgos,
  filtro,
  onNavegar,
}: {
  open: boolean;
  onClose: () => void;
  hallazgos: Hallazgo[];
  filtro: ResumenFiltro;
  onNavegar: (tab: string) => void;
}) {
  const establecerEstado = useEstablecerEstado(filtro);
  const descartados = useMemo(() => hallazgos.filter((h) => h.estado === "descartado"), [hallazgos]);

  const grupos = useMemo(() => {
    const activos = hallazgos.filter((h) => h.estado !== "descartado");
    const mapa = new Map<string, Hallazgo[]>();
    for (const h of activos) {
      const g = grupoDeTono(h.tono);
      mapa.set(g, [...(mapa.get(g) ?? []), h]);
    }
    return ORDEN_GRUPOS.map((g) => ({ grupo: g, items: mapa.get(g) ?? [] })).filter((g) => g.items.length > 0);
  }, [hallazgos]);

  return (
    <Drawer open={open} onClose={onClose} title="Centro de atención" subtitle={`${hallazgos.length} punto(s) encontrados en el periodo`}>
      {hallazgos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Sparkles size={22} className="text-success-500" />
          <p className="text-sm text-ink-600">Todo en orden: no encontramos nada que requiera tu atención.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map((g) => (
            <div key={g.grupo}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{g.grupo}</h3>
              <div className="flex flex-col gap-2">
                {g.items.map((h) => (
                  <HallazgoCard
                    key={h.id}
                    hallazgo={h}
                    onNavegar={(tab) => {
                      onNavegar(tab);
                      onClose();
                    }}
                    onDescartar={() => establecerEstado.mutate({ hallazgoId: h.id, estado: "descartado" })}
                  />
                ))}
              </div>
            </div>
          ))}
          {descartados.length > 0 && (
            <button
              type="button"
              onClick={() => {
                for (const h of descartados) establecerEstado.mutate({ hallazgoId: h.id, estado: "nuevo" });
              }}
              className="flex items-center gap-1.5 self-start text-xs font-medium text-ink-400 hover:text-ink-700"
            >
              <RotateCcw size={12} /> Restaurar {descartados.length} descartado(s)
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}
