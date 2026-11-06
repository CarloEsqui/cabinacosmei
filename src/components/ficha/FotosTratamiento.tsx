import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, ImagePlus, Images, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { FotoTratamiento } from "@shared/types";

type Momento = "antes" | "despues";
const TITULO: Record<Momento, string> = { antes: "Antes", despues: "Después" };
/** Cuántas fotos se ven en la pila; el resto se cuenta en la etiqueta. */
const VISIBLES_EN_PILA = 4;

/** Lo que se refresca cuando cambian las fotos o las notas de un tratamiento. */
export function invalidarTratamientos(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["fotosServicio", "fichaTratamientos", "detalleServicio"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Fotos de antes y después de un servicio cerrado (FR-007). Cada momento es una pila de hasta 4
 * fotos; al picarla se abre un carrusel. Las miniaturas se piden una por una y se cachean por id, y
 * la foto grande solo se pide para la que se está mirando (Gate, condición 8). Nunca hay rutas en
 * el renderer: solo ids.
 */
export function FotosTratamiento({ servicioRealizadoId, fotos }: { servicioRealizadoId: string; fotos?: FotoTratamiento[] }) {
  const { data: consultadas } = useQuery({
    queryKey: ["fotosServicio", servicioRealizadoId],
    queryFn: () => window.api.fichas.fotosServicio(servicioRealizadoId),
    enabled: !fotos,
  });
  const lista = fotos ?? consultadas ?? [];
  const porMomento: Record<Momento, FotoTratamiento[]> = {
    antes: lista.filter((f) => f.momento === "antes"),
    despues: lista.filter((f) => f.momento === "despues"),
  };
  const [abierto, setAbierto] = useState<{ momento: Momento; indice: number } | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {(["antes", "despues"] as const).map((m) => (
          <PilaFotos
            key={m}
            momento={m}
            servicioRealizadoId={servicioRealizadoId}
            fotos={porMomento[m]}
            onAbrir={() => setAbierto({ momento: m, indice: 0 })}
          />
        ))}
      </div>
      {createPortal(
        <AnimatePresence>
          {abierto && (
            <Carrusel
              porMomento={porMomento}
              momento={abierto.momento}
              indice={abierto.indice}
              onCambiar={(momento, indice) => setAbierto({ momento, indice })}
              onCerrar={() => setAbierto(null)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/** Miniatura de una foto, cacheada por id (una llamada por foto). */
function useMiniatura(archivoId: string) {
  return useQuery({
    queryKey: ["fotoMiniatura", archivoId],
    queryFn: () => window.api.fichas.miniatura(archivoId),
    staleTime: Infinity,
  });
}

function useSubirFoto(servicioRealizadoId: string, momento: Momento) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => window.api.fichas.subirFoto(servicioRealizadoId, momento),
    onSuccess: (foto) => {
      if (foto) invalidarTratamientos(queryClient);
    },
    onError: (e) => toast.error(mensajeDeError(e, "No se pudo guardar la foto.")),
  });
}

// Posición de cada foto de la pila (0 = la de enfrente), en reposo y al pasar el mouse.
const ABANICO = [
  { r: 0, x: 0, y: 0 },
  { r: -5, x: -9, y: -3 },
  { r: 4, x: 9, y: -5 },
  { r: -8, x: -14, y: -7 },
];

function PilaFotos({
  momento,
  servicioRealizadoId,
  fotos,
  onAbrir,
}: {
  momento: Momento;
  servicioRealizadoId: string;
  fotos: FotoTratamiento[];
  onAbrir: () => void;
}) {
  const subir = useSubirFoto(servicioRealizadoId, momento);
  const [encima, setEncima] = useState(false);
  const visibles = fotos.slice(0, VISIBLES_EN_PILA);
  const etiqueta = momento === "antes" ? "antes" : "después";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-500">
          {TITULO[momento]}
          {fotos.length > 0 && <span className="ml-1.5 text-ink-400">{fotos.length}</span>}
        </p>
        {fotos.length > 0 && (
          <button
            type="button"
            disabled={subir.isPending}
            onClick={() => subir.mutate()}
            title={`Agregar foto de ${etiqueta}`}
            className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs text-jacaranda-600 hover:bg-jacaranda-50 disabled:opacity-50"
          >
            <Plus size={12} /> Agregar
          </button>
        )}
      </div>

      {fotos.length === 0 ? (
        <button
          type="button"
          disabled={subir.isPending}
          onClick={() => subir.mutate()}
          className="flex h-36 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-beige-300 text-xs text-ink-500 transition-colors hover:border-beige-400 hover:bg-beige-100 disabled:opacity-50"
        >
          <ImagePlus size={18} />
          Agregar foto de {etiqueta}
        </button>
      ) : (
        <button
          type="button"
          onClick={onAbrir}
          onMouseEnter={() => setEncima(true)}
          onMouseLeave={() => setEncima(false)}
          onFocus={() => setEncima(true)}
          onBlur={() => setEncima(false)}
          title={`Ver fotos de ${etiqueta}`}
          className="relative flex h-36 items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-jacaranda-400"
        >
          {/* Se pintan de atrás hacia adelante para que la primera quede encima. */}
          {[...visibles].reverse().map((f) => {
            const i = visibles.indexOf(f);
            const p = ABANICO[i];
            const k = encima ? 1.6 : 1;
            return (
              <motion.div
                key={f.id}
                className="absolute h-28 w-[70%] overflow-hidden rounded-lg border-2 border-beige-50 bg-beige-200 shadow-md"
                style={{ zIndex: VISIBLES_EN_PILA - i }}
                animate={{ rotate: p.r * k, x: p.x * k, y: p.y * k, scale: 1 - i * 0.03 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
                <ImagenMiniatura foto={f} />
              </motion.div>
            );
          })}
          {fotos.length > 1 && (
            <span className="absolute bottom-2 right-[17%] z-10 flex items-center gap-1 rounded-full bg-ink-900/65 px-2 py-0.5 text-[11px] font-medium text-beige-50 backdrop-blur-sm">
              <Images size={11} />
              {fotos.length}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

function ImagenMiniatura({ foto, className = "" }: { foto: FotoTratamiento; className?: string }) {
  const { data } = useMiniatura(foto.id);
  if (data && "dataUrl" in data) {
    return <img src={data.dataUrl} alt="" draggable={false} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-beige-200 text-ink-400 ${data ? "" : "animate-pulse"} ${className}`}>
      {data && <ImageOff size={16} />}
    </div>
  );
}

/**
 * Carrusel a pantalla completa. Va en un portal porque los modales usan `transform` y un `fixed`
 * adentro quedaría atrapado. Escucha el teclado en captura para que Escape y las flechas no le
 * lleguen al modal de abajo.
 */
function Carrusel({
  porMomento,
  momento,
  indice,
  onCambiar,
  onCerrar,
}: {
  porMomento: Record<Momento, FotoTratamiento[]>;
  momento: Momento;
  indice: number;
  onCambiar: (momento: Momento, indice: number) => void;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const [direccion, setDireccion] = useState(0);
  const fotos = porMomento[momento];
  const actual = fotos[Math.min(indice, fotos.length - 1)];
  const otro: Momento = momento === "antes" ? "despues" : "antes";

  // Si se quitó la última foto de este momento, pasa al otro o se cierra.
  useEffect(() => {
    if (fotos.length === 0) {
      if (porMomento[otro].length > 0) onCambiar(otro, 0);
      else onCerrar();
    } else if (indice > fotos.length - 1) {
      onCambiar(momento, fotos.length - 1);
    }
  }, [fotos.length, indice, momento, otro, porMomento, onCambiar, onCerrar]);

  function mover(paso: number) {
    if (fotos.length < 2) return;
    setDireccion(paso);
    setConfirmandoQuitar(false);
    onCambiar(momento, (indice + paso + fotos.length) % fotos.length);
  }

  const teclado = useRef({ mover, onCerrar, confirmandoQuitar, setConfirmandoQuitar });
  teclado.current = { mover, onCerrar, confirmandoQuitar, setConfirmandoQuitar };
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      const t = teclado.current;
      if (e.key === "Escape") {
        if (t.confirmandoQuitar) t.setConfirmandoQuitar(false);
        else t.onCerrar();
      } else if (e.key === "ArrowLeft") t.mover(-1);
      else if (e.key === "ArrowRight") t.mover(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, []);

  const quitar = useMutation({
    mutationFn: (id: string) => window.api.fichas.quitarFoto(id),
    onSuccess: () => {
      setConfirmandoQuitar(false);
      invalidarTratamientos(queryClient);
    },
    onError: (e) => toast.error(mensajeDeError(e, "No se pudo quitar la foto.")),
  });

  if (!actual) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col bg-ink-900/90 text-beige-50 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onCerrar}
    >
      {/* Barra superior: qué momento se está viendo, posición y acciones. */}
      <div className="flex items-center justify-between gap-3 px-5 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex rounded-full bg-beige-50/10 p-1 text-sm">
          {(["antes", "despues"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={porMomento[m].length === 0}
              onClick={() => {
                setConfirmandoQuitar(false);
                onCambiar(m, 0);
              }}
              className={`rounded-full px-4 py-1.5 transition-colors disabled:opacity-40 ${
                m === momento ? "bg-beige-50 font-medium text-ink-900" : "text-beige-50/80 hover:text-beige-50"
              }`}
            >
              {TITULO[m]} <span className={m === momento ? "text-ink-500" : "text-beige-50/50"}>{porMomento[m].length}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              window.api.fichas.abrirFoto(actual.id).catch((e) => toast.error(mensajeDeError(e, "No se pudo abrir la foto.")))
            }
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-beige-50/80 hover:bg-beige-50/10 hover:text-beige-50"
          >
            <ExternalLink size={15} /> Abrir en el visor
          </button>
          <button
            type="button"
            onClick={() => setConfirmandoQuitar(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-beige-50/80 hover:bg-beige-50/10 hover:text-beige-50"
          >
            <Trash2 size={15} /> Quitar
          </button>
          <button
            type="button"
            onClick={onCerrar}
            title="Cerrar (Esc)"
            className="ml-2 rounded-full p-2 text-beige-50/80 hover:bg-beige-50/10 hover:text-beige-50"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Foto grande con flechas. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16">
        {fotos.length > 1 && (
          <BotonFlecha lado="izquierda" onClick={() => mover(-1)} />
        )}
        <AnimatePresence initial={false} mode="popLayout" custom={direccion}>
          <motion.div
            key={actual.id}
            custom={direccion}
            initial={{ opacity: 0, x: direccion * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direccion * -40 }}
            transition={{ duration: 0.18 }}
            className="flex h-full w-full items-center justify-center"
          >
            <FotoGrande foto={actual} />
          </motion.div>
        </AnimatePresence>
        {fotos.length > 1 && (
          <BotonFlecha lado="derecha" onClick={() => mover(1)} />
        )}
      </div>

      {/* Confirmación en el mismo carrusel, o la tira de miniaturas. */}
      <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-5 pb-5 pt-3" onClick={(e) => e.stopPropagation()}>
        {confirmandoQuitar ? (
          <div className="flex items-center gap-4 rounded-xl bg-beige-50 px-4 py-3 text-sm text-ink-900 shadow-lg">
            <span>¿Quitar esta foto? Se borra de la carpeta del servicio y no se puede deshacer.</span>
            <button
              type="button"
              onClick={() => setConfirmandoQuitar(false)}
              className="rounded-lg px-3 py-1.5 text-ink-700 hover:bg-beige-200"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={quitar.isPending}
              onClick={() => quitar.mutate(actual.id)}
              className="rounded-lg bg-danger-500 px-3 py-1.5 font-medium text-beige-50 hover:opacity-90 disabled:opacity-50"
            >
              Quitar foto
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-beige-50/60">
              {TITULO[momento]} · {indice + 1} de {fotos.length}
            </p>
            {fotos.length > 1 && (
              <div className="flex max-w-full gap-2 overflow-x-auto px-1 py-1">
                {fotos.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setDireccion(i > indice ? 1 : -1);
                      onCambiar(momento, i);
                    }}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-md transition ${
                      i === indice ? "opacity-100 ring-2 ring-beige-50" : "opacity-50 hover:opacity-80"
                    }`}
                  >
                    <ImagenMiniatura foto={f} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function BotonFlecha({ lado, onClick }: { lado: "izquierda" | "derecha"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={lado === "izquierda" ? "Anterior (←)" : "Siguiente (→)"}
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-beige-50/10 p-3 text-beige-50 transition-colors hover:bg-beige-50/20 ${
        lado === "izquierda" ? "left-4" : "right-4"
      }`}
    >
      {lado === "izquierda" ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
    </button>
  );
}

/** La foto a ≤ 1600 px; mientras llega se muestra la miniatura que ya está en caché. */
function FotoGrande({ foto }: { foto: FotoTratamiento }) {
  const { data: mini } = useMiniatura(foto.id);
  const { data, isError } = useQuery({
    queryKey: ["fotoVista", foto.id],
    queryFn: () => window.api.fichas.vista(foto.id),
    staleTime: Infinity,
    gcTime: 60_000, // Fotos grandes: no se quedan en memoria mucho después de verlas.
  });
  const alt = `Foto de ${foto.momento === "antes" ? "antes" : "después"}`;

  if (isError || (data && "faltante" in data)) {
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-beige-50/70" onClick={(e) => e.stopPropagation()}>
        <ImageOff size={28} /> Foto no encontrada en su carpeta
      </div>
    );
  }
  const src = data && "dataUrl" in data ? data.dataUrl : mini && "dataUrl" in mini ? mini.dataUrl : null;
  if (!src) return <div className="h-1/2 w-1/2 max-w-md animate-pulse rounded-xl bg-beige-50/10" />;
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      className={`max-h-full max-w-full rounded-lg object-contain shadow-2xl ${data ? "" : "blur-sm"}`}
    />
  );
}
