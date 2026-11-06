import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Maximize2, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { ComprobanteRow } from "@shared/types";

/**
 * Comprobantes de una cita (del servicio y de sus anticipos) como miniaturas. Al picar una se abre
 * en grande, con pantalla completa, abrir en el visor del sistema y descargar una copia. Las
 * imágenes llegan del main como data URL (nunca rutas): mismo mecanismo que aprobó el Gate de la
 * ficha clínica (condición 8).
 */
export function Comprobantes({ citaId, servicioRealizadoId }: { citaId: string; servicioRealizadoId?: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [abierto, setAbierto] = useState<ComprobanteRow | null>(null);

  const { data: lista = [] } = useQuery({
    queryKey: ["comprobantesCita", citaId],
    queryFn: () => window.api.archivos.comprobantesCita(citaId),
  });

  const agregar = useMutation({
    mutationFn: () => window.api.archivos.subirComprobante(servicioRealizadoId!),
    onSuccess: (r) => {
      if (!r) return;
      queryClient.invalidateQueries({ queryKey: ["comprobantesCita", citaId] });
      queryClient.invalidateQueries({ queryKey: ["estadoCuentaCita", citaId] });
      toast.success("Comprobante agregado.");
    },
    onError: (e) => toast.error(mensajeDeError(e, "No se pudo subir el comprobante.")),
  });

  // Sin comprobantes y sin servicio cerrado (cita pendiente): nada que mostrar todavía.
  if (lista.length === 0 && !servicioRealizadoId) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Comprobantes</h3>
      <div className="flex flex-wrap gap-2">
        {lista.map((c) => (
          <Miniatura key={c.id} comprobante={c} onAbrir={() => setAbierto(c)} />
        ))}
        {servicioRealizadoId && (
          <button
            type="button"
            disabled={agregar.isPending}
            onClick={() => agregar.mutate()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-beige-300 text-xs text-ink-500 transition-colors hover:border-jacaranda-300 hover:bg-jacaranda-50 hover:text-jacaranda-700 disabled:opacity-50"
          >
            <Plus size={16} />
            Agregar
          </button>
        )}
      </div>
      {/* Portal a <body>: este componente vive dentro del modal de la cita (contenedor con
          transform), y ahí un `fixed` no cubriría la ventana. */}
      {abierto && createPortal(<VisorComprobante comprobante={abierto} onClose={() => setAbierto(null)} />, document.body)}
    </div>
  );
}

function useVistaPrevia(archivoId: string, tamano: "mini" | "grande") {
  return useQuery({
    queryKey: ["vistaPreviaComprobante", archivoId, tamano],
    queryFn: () => window.api.archivos.vistaPrevia(archivoId, tamano),
    staleTime: Infinity,
    retry: false,
  });
}

function Miniatura({ comprobante, onAbrir }: { comprobante: ComprobanteRow; onAbrir: () => void }) {
  const { data: src, isLoading } = useVistaPrevia(comprobante.id, "mini");
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={comprobante.nombreOriginal}
      className="group relative h-20 w-20 overflow-hidden rounded-xl border border-beige-300 bg-beige-100 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jacaranda-400"
    >
      {src ? (
        <img src={src} alt={comprobante.nombreOriginal} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-[10px] text-ink-500">
          <FileText size={20} className="text-jacaranda-600" />
          {isLoading ? "…" : comprobante.esPdf ? "PDF" : "Archivo"}
        </span>
      )}
      {comprobante.origen === "anticipo" && (
        <span className="absolute bottom-1 left-1 rounded-md bg-beige-50/90 px-1 text-[10px] font-medium text-ink-700">
          Anticipo
        </span>
      )}
    </button>
  );
}

function VisorComprobante({ comprobante, onClose }: { comprobante: ComprobanteRow; onClose: () => void }) {
  const toast = useToast();
  const { data: src, isLoading } = useVistaPrevia(comprobante.id, "grande");
  const [completa, setCompleta] = useState(false);

  async function abrirEnVisor() {
    try {
      await window.api.archivos.abrirComprobante(comprobante.id);
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo abrir el comprobante."));
    }
  }
  async function descargar() {
    try {
      if (await window.api.archivos.guardarCopiaComprobante(comprobante.id)) toast.success("Copia guardada.");
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo guardar la copia."));
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title="Comprobante" ancho="2xl">
        <div className="flex flex-col gap-4">
          <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl bg-beige-100">
            {src ? (
              <img src={src} alt={comprobante.nombreOriginal} className="max-h-[55vh] w-auto object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-2 p-8 text-sm text-ink-500">
                <FileText size={32} className="text-jacaranda-600" />
                {isLoading ? "Cargando vista previa…" : "Sin vista previa. Ábrelo en el visor."}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-ink-700">{comprobante.nombreOriginal}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {src && (
              <Button variant="secondary" size="sm" onClick={() => setCompleta(true)}>
                <Maximize2 size={14} /> Pantalla completa
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={abrirEnVisor}>
              <ExternalLink size={14} /> Abrir en el visor
            </Button>
            <Button size="sm" onClick={descargar}>
              <Download size={14} /> Descargar
            </Button>
          </div>
        </div>
      </Modal>
      {completa && src && <PantallaCompleta src={src} alt={comprobante.nombreOriginal} onClose={() => setCompleta(false)} />}
    </>
  );
}

/** Imagen a toda la ventana; Esc o clic fuera cierra (solo esta capa, el detalle sigue abierto). */
function PantallaCompleta({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/90 p-6"
      onClick={onClose}
      role="dialog"
      aria-label="Comprobante en pantalla completa"
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-beige-50/15 text-beige-50 transition-colors hover:bg-beige-50/25"
        aria-label="Cerrar pantalla completa"
      >
        <X size={20} />
      </button>
    </div>
  );
}
