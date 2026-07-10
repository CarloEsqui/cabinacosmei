import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, FolderOpen, RotateCcw, Upload, Download, AlertTriangle, Trash2, Eraser } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { formatFechaHoraMs } from "@/lib/format";

function formatearTamanio(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function RespaldosTab() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [restaurando, setRestaurando] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [restaurandoDesdeArchivo, setRestaurandoDesdeArchivo] = useState(false);
  const [pinArchivo, setPinArchivo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const { data: respaldos = [] } = useQuery({
    queryKey: ["respaldos"],
    queryFn: () => window.api.respaldos.listar(),
  });

  const crear = useMutation({
    mutationFn: () => window.api.respaldos.crear(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["respaldos"] });
      toast.success("Respaldo creado.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  const restaurar = useMutation({
    mutationFn: (id: string) => window.api.respaldos.restaurar(id, pin),
    onError: (e) => setError(mensajeDeError(e)),
  });

  const restaurarArchivo = useMutation({
    mutationFn: () => window.api.respaldos.restaurarDesdeArchivo(pinArchivo),
    onSuccess: (aplicado) => {
      if (!aplicado) {
        // El usuario canceló el selector de archivos; no hubo cambios.
        setRestaurandoDesdeArchivo(false);
        setPinArchivo("");
      }
      // Si `aplicado` es true, la app se reinicia sola — no hay nada más que hacer aquí.
    },
    onError: (e) => setErrorArchivo(mensajeDeError(e)),
  });

  const exportar = useMutation({
    mutationFn: (id: string) => window.api.respaldos.exportar(id),
    onSuccess: (guardado) => {
      if (guardado) toast.success("Respaldo exportado.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  return (
    <div className="flex flex-col gap-4 p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup size={18} className="text-jacaranda-500" /> Respaldos completos
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-ink-500">
            Un respaldo es un solo archivo <strong>.zip</strong> con la base de datos completa{" "}
            <strong>y los archivos físicos</strong> (comprobantes, fotos, expedientes), guardado junto a la
            carpeta de datos del negocio. La app crea uno automáticamente todos los días mientras esté abierta
            (se marca como "Automático" en la tabla), pero como todo vive en esta máquina, de vez en cuando
            guarda también una copia fuera de la computadora (USB, nube, correo) usando "Exportar".
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={crear.isPending} onClick={() => crear.mutate()}>
              <DatabaseBackup size={16} /> Crear respaldo ahora
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRestaurandoDesdeArchivo(true)}>
              <Upload size={16} /> Restaurar desde archivo...
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.api.respaldos.abrirCarpeta()}>
              <FolderOpen size={16} /> Abrir carpeta de respaldos
            </Button>
          </div>

          {restaurandoDesdeArchivo && (
            <div className="rounded-xl bg-beige-100 p-3">
              <p className="mb-2 text-sm text-ink-700">
                Elige un archivo <code>.zip</code> (o un <code>.sqlite3</code> heredado) y confirma con tu PIN
                de acceso. Se crea un respaldo del estado actual antes de aplicar el que elijas.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN de acceso"
                  className="max-w-40"
                  value={pinArchivo}
                  onChange={(e) => setPinArchivo(e.target.value.replace(/\D/g, ""))}
                />
                <Button
                  size="sm"
                  disabled={pinArchivo.length < 4 || restaurarArchivo.isPending}
                  onClick={() => restaurarArchivo.mutate()}
                >
                  Elegir archivo y restaurar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRestaurandoDesdeArchivo(false);
                    setPinArchivo("");
                    setErrorArchivo(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
              {errorArchivo && <p className="mt-2 text-sm text-danger-500">{errorArchivo}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Tamaño</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {respaldos.map((r) => (
              <tr key={r.id} className="border-t border-beige-200">
                <td className="whitespace-nowrap px-4 py-2 text-ink-700">{formatFechaHoraMs(r.createdAt)}</td>
                <td className="px-4 py-2 text-ink-700">{r.nombreArchivo}</td>
                <td className="px-4 py-2 text-ink-700">{formatearTamanio(r.tamanioBytes)}</td>
                <td className="px-4 py-2">
                  <Badge variant={r.esAutomatico ? "warning" : "neutral"}>
                    {r.esAutomatico ? "Automático" : "Manual"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={exportar.isPending}
                      onClick={() => exportar.mutate(r.id)}
                      title="Exportar copia"
                    >
                      <Download size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRestaurando(r.id)} title="Restaurar">
                      <RotateCcw size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {respaldos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                  Aún no se ha creado ningún respaldo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {restaurando && (
        <div className="rounded-xl border border-danger-500/40 bg-danger-500/5 p-4">
          <p className="mb-2 text-sm font-medium text-ink-900">
            Esto reemplazará todos los datos y archivos actuales con este respaldo y reiniciará la aplicación.
            Se crea un respaldo del estado actual antes, por seguridad. Escribe tu PIN de acceso para confirmar.
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

      <ZonaDePeligro />
    </div>
  );
}

function ZonaDePeligro() {
  const toast = useToast();
  const [accion, setAccion] = useState<"borrar_negocio" | "restablecer_fabrica" | null>(null);
  const [eliminarArchivos, setEliminarArchivos] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const borrarNegocio = useMutation({
    mutationFn: () => window.api.datos.borrarNegocio(pin, eliminarArchivos),
    onSuccess: () => {
      toast.success("Datos de negocio borrados. Recargando...");
      window.location.reload();
    },
    onError: (e) => setError(mensajeDeError(e)),
  });

  const restablecerFabrica = useMutation({
    mutationFn: () => window.api.datos.restablecerFabrica(pin, eliminarArchivos),
    onError: (e) => setError(mensajeDeError(e)),
  });

  function cerrarPanel() {
    setAccion(null);
    setPin("");
    setEliminarArchivos(false);
    setError(null);
  }

  const mutacionActiva = accion === "borrar_negocio" ? borrarNegocio : restablecerFabrica;

  return (
    <Card className="border-danger-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-danger-500">
          <AlertTriangle size={18} /> Zona de peligro
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-ink-500">
          Para empezar de cero (por ejemplo, al terminar de probar la app). Ambas acciones crean primero un
          respaldo automático — siempre podrás restaurarlo después.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAccion("borrar_negocio")}>
            <Eraser size={16} /> Borrar datos de negocio
          </Button>
          <Button variant="danger" size="sm" onClick={() => setAccion("restablecer_fabrica")}>
            <Trash2 size={16} /> Restablecer de fábrica
          </Button>
        </div>

        {accion && (
          <div className="rounded-xl border border-danger-500/40 bg-danger-500/5 p-4">
            {accion === "borrar_negocio" ? (
              <p className="mb-2 text-sm font-medium text-ink-900">
                Borra clientas, citas, inventario, servicios, pagos y cortes. Tu PIN y la configuración de la
                app se conservan.
              </p>
            ) : (
              <p className="mb-2 text-sm font-medium text-ink-900">
                Borra absolutamente todo, incluido tu PIN y la configuración. La app quedará como recién
                instalada y te pedirá crear un PIN nuevo al reiniciar.
              </p>
            )}
            <label className="mb-3 flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={eliminarArchivos}
                onChange={(e) => setEliminarArchivos(e.target.checked)}
              />
              También eliminar los archivos físicos (comprobantes, fotos, expedientes)
            </label>
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
                disabled={pin.length < 4 || mutacionActiva.isPending}
                onClick={() => mutacionActiva.mutate()}
              >
                {accion === "borrar_negocio" ? "Confirmar borrado" : "Confirmar restablecimiento"}
              </Button>
              <Button variant="secondary" size="sm" onClick={cerrarPanel}>
                Cancelar
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-danger-500">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
