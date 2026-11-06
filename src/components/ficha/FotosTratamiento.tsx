import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, ImagePlus, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { FotoTratamiento } from "@shared/types";

/** Lo que se refresca cuando cambian las fotos o las notas de un tratamiento. */
export function invalidarTratamientos(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["fotosServicio", "fichaTratamientos", "detalleServicio"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Fotos de antes y después de un servicio cerrado (FR-007). Dos columnas; cada miniatura la pide
 * su propio componente al montarse, una por llamada y cacheada por id (Gate, condición 8). Nunca
 * hay rutas en el renderer: solo ids.
 */
export function FotosTratamiento({ servicioRealizadoId, fotos }: { servicioRealizadoId: string; fotos?: FotoTratamiento[] }) {
  const { data: consultadas } = useQuery({
    queryKey: ["fotosServicio", servicioRealizadoId],
    queryFn: () => window.api.fichas.fotosServicio(servicioRealizadoId),
    enabled: !fotos,
  });
  const lista = fotos ?? consultadas ?? [];

  return (
    <div className="grid grid-cols-2 gap-3">
      <ColumnaFotos titulo="Antes" momento="antes" servicioRealizadoId={servicioRealizadoId} fotos={lista.filter((f) => f.momento === "antes")} />
      <ColumnaFotos titulo="Después" momento="despues" servicioRealizadoId={servicioRealizadoId} fotos={lista.filter((f) => f.momento === "despues")} />
    </div>
  );
}

function ColumnaFotos({
  titulo,
  momento,
  servicioRealizadoId,
  fotos,
}: {
  titulo: string;
  momento: "antes" | "despues";
  servicioRealizadoId: string;
  fotos: FotoTratamiento[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const subir = useMutation({
    mutationFn: () => window.api.fichas.subirFoto(servicioRealizadoId, momento),
    onSuccess: (foto) => {
      if (foto) invalidarTratamientos(queryClient);
    },
    onError: (e) => toast.error(mensajeDeError(e, "No se pudo guardar la foto.")),
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-ink-500">{titulo}</p>
      <div className="grid grid-cols-2 gap-2">
        {fotos.map((f) => (
          <Miniatura key={f.id} foto={f} />
        ))}
        <button
          type="button"
          disabled={subir.isPending}
          onClick={() => subir.mutate()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-beige-300 text-xs text-ink-500 hover:bg-beige-100 disabled:opacity-50"
        >
          <ImagePlus size={18} />
          {fotos.length === 0 ? `Agregar foto de ${momento === "antes" ? "antes" : "después"}` : "Agregar otra"}
        </button>
      </div>
    </div>
  );
}

function Miniatura({ foto }: { foto: FotoTratamiento }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data } = useQuery({
    queryKey: ["fotoMiniatura", foto.id],
    queryFn: () => window.api.fichas.miniatura(foto.id),
    staleTime: Infinity,
  });

  async function quitar() {
    const r = await confirm({
      titulo: "Quitar foto",
      mensaje: "La foto se borra de la carpeta del servicio y del registro. No se puede deshacer.",
      confirmarLabel: "Quitar foto",
      cancelarLabel: "Volver",
    });
    if (r !== "confirmado") return;
    try {
      await window.api.fichas.quitarFoto(foto.id);
      invalidarTratamientos(queryClient);
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo quitar la foto."));
    }
  }

  const faltante = data && "faltante" in data;
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl bg-beige-100">
      {data && "dataUrl" in data ? (
        <button
          type="button"
          className="h-full w-full"
          title="Abrir en grande"
          onClick={() =>
            window.api.fichas.abrirFoto(foto.id).catch((e) => toast.error(mensajeDeError(e, "No se pudo abrir la foto.")))
          }
        >
          <img src={data.dataUrl} alt={`Foto de ${foto.momento === "antes" ? "antes" : "después"}`} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-ink-500">
          {faltante ? (
            <>
              <ImageOff size={16} /> Foto no encontrada
            </>
          ) : (
            "Cargando…"
          )}
        </div>
      )}
      <button
        type="button"
        onClick={quitar}
        title="Quitar foto"
        className="absolute right-1 top-1 rounded-full bg-ink-900/60 p-1 text-beige-50 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}
