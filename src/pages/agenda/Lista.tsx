import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFecha } from "@/lib/format";
import type { CitasFiltro } from "@shared/schemas";

const ESTADO_LABEL: Record<string, string> = {
  programada: "Programada",
  confirmada: "Confirmada",
  asistio: "Asistió",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
  reagendada: "Reagendada",
};

function badgeVariant(estado: string) {
  if (estado === "asistio") return "success" as const;
  if (estado === "cancelada" || estado === "no_asistio") return "danger" as const;
  if (estado === "programada" || estado === "confirmada") return "jacaranda" as const;
  return "neutral" as const;
}

interface ListaTabProps {
  onCerrarCita: (citaId: string) => void;
}

export function ListaTab({ onCerrarCita }: ListaTabProps) {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<CitasFiltro>({});

  const { data: citas = [] } = useQuery({
    queryKey: ["citas", filtro],
    queryFn: () => window.api.citas.listar(filtro),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => window.api.citas.cambiarEstado(id, "cancelada"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["citas"] }),
  });

  const ordenadas = useMemo(
    () => [...citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)),
    [citas],
  );

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Desde</label>
          <Input
            type="date"
            value={filtro.fechaDesde ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Hasta</label>
          <Input
            type="date"
            value={filtro.fechaHasta ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Estado</label>
          <Select
            value={filtro.estado ?? ""}
            onChange={(e) => setFiltro({ ...filtro, estado: e.target.value || undefined })}
            className="min-w-[160px]"
          >
            <option value="">Todos</option>
            {Object.entries(ESTADO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Hora</th>
              <th className="px-4 py-2">Clienta</th>
              <th className="px-4 py-2">Servicio</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((c) => {
              const activa = c.estado === "programada" || c.estado === "confirmada";
              return (
                <tr key={c.id} className="border-t border-beige-200">
                  <td className="px-4 py-2 text-ink-700">{formatFecha(c.fecha)}</td>
                  <td className="px-4 py-2 text-ink-700">{c.hora}</td>
                  <td className="px-4 py-2 font-medium text-ink-900">{c.clienteNombre}</td>
                  <td className="px-4 py-2 text-ink-700">{c.servicioNombre || "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant={badgeVariant(c.estado)}>{ESTADO_LABEL[c.estado] ?? c.estado}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {activa && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => onCerrarCita(c.id)}>
                          <Lock size={14} /> Cerrar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelar.mutate(c.id)}
                          disabled={cancelar.isPending}
                        >
                          <XCircle size={14} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  No hay citas que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
