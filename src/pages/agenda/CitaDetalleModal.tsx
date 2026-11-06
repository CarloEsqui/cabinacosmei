import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  CheckCircle2,
  PackageOpen,
  RotateCcw,
  StickyNote,
  Trash2,
  TriangleAlert,
  UserX,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatFecha, formatMoneda } from "@/lib/format";
import { fechaLocalIso, horaLocal } from "@shared/fechas";
import type { CitaRow, ProductoConStock, RecetaItem } from "@shared/types";
import { useAccionesCita } from "@/pages/agenda/useAccionesCita";
import { PagosDeCita } from "@/pages/agenda/PagosDeCita";

/**
 * Un color por estado, el mismo en todas partes (puntos del calendario, franja de la lista de
 * Citas, insignias): amarillo = programada (falta confirmar), verde = confirmada, morado = asistió,
 * rojo = no asistió, gris = cancelada. "Reagendada" es heredado: reagendar mueve la misma cita y ese
 * estado ya no se asigna; se conserva solo para leer registros viejos (`legado`, fuera de filtros).
 */
export const ESTADO_CITA: Record<
  string,
  {
    label: string;
    variant: "neutral" | "jacaranda" | "success" | "warning" | "danger" | "info";
    color: string;
    legado?: boolean;
  }
> = {
  programada: { label: "Programada", variant: "warning", color: "#c98a3a" },
  confirmada: { label: "Confirmada", variant: "success", color: "#6f9767" },
  asistio: { label: "Asistió", variant: "jacaranda", color: "#603a95" },
  no_asistio: { label: "No asistió", variant: "danger", color: "#b8543f" },
  cancelada: { label: "Cancelada", variant: "neutral", color: "#9a8f81" },
  reagendada: { label: "Reagendada", variant: "info", color: "#5b7c99", legado: true },
};

/** Estados que se ofrecen en filtros y leyendas (sin los heredados). */
export const ESTADOS_VIGENTES = Object.entries(ESTADO_CITA).filter(([, e]) => !e.legado);

export function colorEstadoCita(estado: string): string {
  return ESTADO_CITA[estado]?.color ?? "#603a95";
}

function formatCantidad(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Detalle de una cita al hacer clic en el calendario. Para citas pendientes ofrece cerrarla;
 * para citas ya cerradas muestra el expediente: insumos consumidos, productos vendidos, pagos
 * y saldo. Funciona para cualquier estado (antes solo las pendientes reaccionaban al clic).
 */
export function CitaDetalleModal({
  cita,
  onClose,
  onCerrarCita,
  onReagendar,
  cobrarAlAbrir = false,
}: {
  cita: CitaRow;
  onClose: () => void;
  onCerrarCita: (citaId: string) => void;
  onReagendar: (cita: CitaRow) => void;
  /** Abre directo el panel de registrar pago (botón "Cobrar" de la lista de Citas). */
  cobrarAlAbrir?: boolean;
}) {
  const estado = ESTADO_CITA[cita.estado] ?? { label: cita.estado, variant: "neutral" as const };
  const puedeCerrarse = cita.estado === "programada" || cita.estado === "confirmada";
  const estaCerrada = !!cita.servicioRealizadoId && cita.estado === "asistio";
  const yaPasoLaHora = `${cita.fecha} ${cita.hora}` <= `${fechaLocalIso()} ${horaLocal()}`;

  const inactiva = cita.estado === "cancelada" || cita.estado === "no_asistio";
  const { ejecutar, ocupado } = useAccionesCita();

  const { data: detalle } = useQuery({
    queryKey: ["detalleServicio", cita.servicioRealizadoId],
    queryFn: () => window.api.serviciosRealizados.obtenerDetalle(cita.servicioRealizadoId!),
    enabled: estaCerrada,
  });

  return (
    <Modal open onClose={onClose} title="Detalle de la cita">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-beige-100 p-4">
          <div className="flex items-start gap-3">
            <Avatar nombre={cita.clienteNombre} size="lg" apagado={cita.estado === "cancelada"} />
            <div>
              <p className="text-lg font-semibold text-ink-900">{cita.clienteNombre}</p>
              <p className="text-sm text-ink-700">{cita.servicioNombre ?? "Sin servicio asignado"}</p>
              <div className="mt-2 flex items-center gap-3 text-sm text-ink-500">
                <span className="flex items-center gap-1">
                  <CalendarDays size={14} /> {formatFecha(cita.fecha)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {cita.hora}
                  {cita.duracionMin ? ` · ${cita.duracionMin} min` : ""}
                </span>
              </div>
            </div>
          </div>
          <Badge variant={estado.variant}>{estado.label}</Badge>
        </div>

        {cita.notas && (
          <div className="flex items-start gap-2 text-sm text-ink-700">
            <StickyNote size={14} className="mt-0.5 shrink-0 text-ink-400" />
            <p>{cita.notas}</p>
          </div>
        )}

        {/* Lo que la cosmetóloga debe tener listo antes de que llegue la clienta. */}
        {puedeCerrarse && cita.servicioCatalogoId && (
          <InsumosAPreparar servicioCatalogoId={cita.servicioCatalogoId} />
        )}

        {/* Cobro v2: total / cobrado / saldo, pagos, abonos, anticipos y cancelaciones. */}
        <PagosDeCita cita={cita} cobrarAlAbrir={cobrarAlAbrir} />

        {estaCerrada && detalle && (
          <div className="flex flex-col gap-3">
            {detalle.productosConsumidos.length > 0 && (
              <SeccionProductos titulo="Insumos usados" items={detalle.productosConsumidos} />
            )}
            {detalle.productosVendidos.length > 0 && (
              <SeccionProductos titulo="Productos vendidos" items={detalle.productosVendidos} />
            )}
            {detalle.observaciones && (
              <p className="text-sm text-ink-500">{detalle.observaciones}</p>
            )}
          </div>
        )}

        {puedeCerrarse && (cita.estado === "programada" || yaPasoLaHora) && (
          <div className="flex gap-2">
            {cita.estado === "programada" && (
              <Button
                variant="secondary"
                className="flex-1"
                disabled={ocupado}
                onClick={() => ejecutar(cita, "confirmada", onClose)}
              >
                <BadgeCheck size={16} /> Confirmar
              </Button>
            )}
            {yaPasoLaHora && (
              <Button
                variant="secondary"
                className="flex-1 text-danger-500"
                disabled={ocupado}
                onClick={() => ejecutar(cita, "no_asistio", onClose)}
              >
                <UserX size={16} /> No asistió
              </Button>
            )}
          </div>
        )}

        {puedeCerrarse && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                onClose();
                onReagendar(cita);
              }}
            >
              <CalendarClock size={16} /> Reagendar
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                onClose();
                onCerrarCita(cita.id);
              }}
            >
              <CheckCircle2 size={16} /> Cerrar cita
            </Button>
          </div>
        )}

        {(puedeCerrarse || inactiva) && (
          <div className="flex justify-center gap-1 border-t border-beige-200 pt-3">
            {puedeCerrarse && (
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => ejecutar(cita, "cancelada", onClose)}>
                <XCircle size={14} /> Cancelar cita
              </Button>
            )}
            {inactiva && (
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => ejecutar(cita, "reactivar", onClose)}>
                <RotateCcw size={14} /> Reactivar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-ink-400 hover:text-danger-500"
              disabled={ocupado}
              onClick={() => ejecutar(cita, "eliminar", onClose)}
            >
              <Trash2 size={14} /> Eliminar
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SeccionProductos({
  titulo,
  items,
}: {
  titulo: string;
  items: { productoNombre: string; cantidad: number; precioUnitario?: number | null }[];
}) {
  return (
    <div className="rounded-xl border border-beige-200 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{titulo}</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {items.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-ink-900">{p.productoNombre}</span>
            <span className="shrink-0 rounded-lg bg-beige-100 px-2.5 py-1 font-medium tabular-nums text-ink-700">
              × {formatCantidad(p.cantidad)}
              {p.precioUnitario != null && ` · ${formatMoneda(p.precioUnitario)} c/u`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Insumos de la receta del servicio, con la existencia actual de cada uno. Es una guía para
 * preparar la cabina: lo que de verdad se descuenta se captura al cerrar la cita.
 */
function InsumosAPreparar({ servicioCatalogoId }: { servicioCatalogoId: string }) {
  const { data: receta = [] } = useQuery({
    queryKey: ["recetaServicio", servicioCatalogoId],
    queryFn: () => window.api.serviciosCatalogo.listarReceta(servicioCatalogoId),
  });
  const { data: inventario = [] } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
    enabled: receta.length > 0,
  });

  if (receta.length === 0) return null;

  return (
    <div className="rounded-xl border border-beige-200 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <PackageOpen size={14} /> Insumos a preparar
      </h3>
      <ul className="flex flex-col gap-2.5">
        {receta.map((r) => (
          <FilaInsumo key={r.id} item={r} producto={inventario.find((p) => p.id === r.productoId)} />
        ))}
      </ul>
    </div>
  );
}

function FilaInsumo({ item, producto }: { item: RecetaItem; producto?: ProductoConStock }) {
  // Los productos en modo "contenido" llevan la receta en ml/g; el resto, en piezas.
  const porContenido = producto?.modoConsumo === "contenido" && !!producto.contenidoCantidad;
  const pieza = (producto?.presentacion || "pieza").toLowerCase();
  const cantidad = porContenido
    ? `${formatCantidad(item.cantidadSugerida)} ${producto?.contenidoUnidad || "ml"}`
    : `${formatCantidad(item.cantidadSugerida)} ${item.cantidadSugerida === 1 ? pieza : `${pieza}s`}`;
  const piezasNecesarias = porContenido
    ? item.cantidadSugerida / (producto?.contenidoCantidad ?? 1)
    : item.cantidadSugerida;

  let aviso: { texto: string; clase: string } | null = null;
  if (producto) {
    const hay = `${formatCantidad(producto.stockTotal)} ${producto.stockTotal === 1 ? pieza : `${pieza}s`}`;
    if (producto.stockTotal + 1e-9 < piezasNecesarias) {
      aviso = { texto: `No alcanza · hay ${hay}`, clase: "text-danger-500" };
    } else if (producto.semaforo !== "adecuado") {
      aviso = { texto: `Quedan ${hay}`, clase: "text-warning-500" };
    } else {
      aviso = { texto: `Hay ${hay}`, clase: "text-ink-400" };
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="truncate text-ink-900">{item.productoNombre}</p>
        {aviso && (
          <p className={`flex items-center gap-1 text-xs ${aviso.clase}`}>
            {aviso.clase !== "text-ink-400" && <TriangleAlert size={12} />}
            {aviso.texto}
          </p>
        )}
      </div>
      <span className="shrink-0 rounded-lg bg-beige-100 px-2.5 py-1 text-sm font-medium tabular-nums text-ink-700">
        {cantidad}
      </span>
    </li>
  );
}
