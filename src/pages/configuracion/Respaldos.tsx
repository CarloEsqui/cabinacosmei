import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, FolderOpen, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFechaHoraMs } from "@/lib/format";

function formatearTamanio(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function RespaldosTab() {
  const queryClient = useQueryClient();
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: respaldos = [] } = useQuery({
    queryKey: ["respaldos"],
    queryFn: () => window.api.respaldos.listar(),
  });

  const crear = useMutation({
    mutationFn: () => window.api.respaldos.crear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["respaldos"] }),
  });

  const restaurar = useMutation({
    mutationFn: (id: string) => window.api.respaldos.restaurar(id, pin),
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo restaurar el respaldo."),
  });

  return (
    <div className="p-8">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup size={18} className="text-jacaranda-500" /> Respaldos locales
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-ink-500">
            Copia completa de la base de datos, guardada en la carpeta "Respaldos" dentro de tu carpeta raíz.
            Como todo vive en esta máquina, crea un respaldo con regularidad (por ejemplo, antes de cerrar el
            día).
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={crear.isPending} onClick={() => crear.mutate()}>
              <DatabaseBackup size={16} /> Crear respaldo ahora
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.api.respaldos.abrirCarpeta()}>
              <FolderOpen size={16} /> Abrir carpeta de respaldos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Tamaño</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {respaldos.map((r) => (
              <tr key={r.id} className="border-t border-beige-200">
                <td className="whitespace-nowrap px-4 py-2 text-ink-700">{formatFechaHoraMs(r.createdAt)}</td>
                <td className="px-4 py-2 text-ink-700">{r.nombreArchivo}</td>
                <td className="px-4 py-2 text-ink-700">{formatearTamanio(r.tamanioBytes)}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setRestaurando(r.id)}>
                    <RotateCcw size={14} /> Restaurar
                  </Button>
                </td>
              </tr>
            ))}
            {respaldos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-500">
                  Aún no se ha creado ningún respaldo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {restaurando && (
        <div className="mt-4 rounded-xl border border-danger-500/40 bg-danger-500/5 p-4">
          <p className="mb-2 text-sm font-medium text-ink-900">
            Esto reemplazará todos los datos actuales con este respaldo y reiniciará la aplicación. Escribe
            tu PIN de acceso para confirmar.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="PIN de acceso"
              className="max-w-40"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <Button
              variant="danger"
              size="sm"
              disabled={pin.length < 4 || restaurar.isPending}
              onClick={() => restaurar.mutate(restaurando)}
            >
              Confirmar restauración
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setRestaurando(null);
                setPin("");
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
