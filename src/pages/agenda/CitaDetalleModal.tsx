import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  CheckCircle2,
  RotateCcw,
  StickyNote,
  Trash2,
  UserX,
  XCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFecha, formatMoneda } from "@/lib/format";
import { fechaLocalIso, horaLocal } from "@shared/fechas";
import type { CitaRow } from "@shared/types";
import { useAccionesCita } from "@/pages/agenda/useAccionesCita";

export const ESTADO_CITA: Record<string, { label: string; variant: "neutral" | "jacaranda" | "success" | "warning" | "danger" }> = {
  programada: { label: "Programada", variant: "jacaranda" },
  confirmada: { label: "Confirmada", variant: "jacaranda" },
  asistio: { label: "Asistió", variant: "success" },
  no_asistio: { label: "No asistió", variant: "danger" },
  cancelada: { label: "Cancelada", variant: "neutral" },
  reagendada: { label: "Reagendada", variant: "warning" },
};

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
}: {
  cita: CitaRow;
  onClose: () => void;
  onCerrarCita: (citaId: string) => void;
  onReagendar: (cita: CitaRow) => void;
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
          <Badge variant={estado.variant}>{estado.label}</Badge>
        </div>

        {cita.notas && (
          <div className="flex items-start gap-2 text-sm text-ink-700">
            <StickyNote size={14} className="mt-0.5 shrink-0 text-ink-400" />
            <p>{cita.notas}</p>
          </div>
        )}

        {estaCerrada && detalle && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <ResumenDato label="Precio" valor={formatMoneda(detalle.precio)} />
              <ResumenDato label="Cobrado" valor={formatMoneda(detalle.totalCobrado)} />
              <ResumenDato
                label="Saldo"
                valor={formatMoneda(detalle.saldoPendiente)}
                acento={detalle.saldoPendiente > 0 ? "danger" : "success"}
              />
            </div>

            {detalle.productosConsumidos.length > 0 && (
              <SeccionProductos titulo="Insumos usados" items={detalle.productosConsumidos} />
            )}
            {detalle.productosVendidos.length > 0 && (
              <SeccionProductos titulo="Productos vendidos" items={detalle.productosVendidos} />
            )}
            {detalle.pagos.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Pagos</h3>
                <ul className="flex flex-col gap-1 text-sm text-ink-700">
                  {detalle.pagos.map((p, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {formatFecha(p.fecha)} · {p.metodoPago}
                      </span>
                      <span className="font-medium">{formatMoneda(p.monto)}</span>
                    </li>
                  ))}
                </ul>
              </div>
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

function ResumenDato({
  label,
  valor,
  acento,
}: {
  label: string;
  valor: string;
  acento?: "danger" | "success";
}) {
  return (
    <div className="rounded-xl bg-beige-100 px-2 py-2.5">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p
        className={
          acento === "danger"
            ? "text-sm font-semibold text-danger-500"
            : acento === "success"
              ? "text-sm font-semibold text-success-500"
              : "text-sm font-semibold text-ink-900"
        }
      >
        {valor}
      </p>
    </div>
  );
}

function SeccionProductos({
  titulo,
  items,
}: {
  titulo: string;
  items: { productoNombre: string; cantidad: number }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{titulo}</h3>
      <ul className="flex flex-col gap-1 text-sm text-ink-700">
        {items.map((p, i) => (
          <li key={i} className="flex justify-between">
            <span>{p.productoNombre}</span>
            <span className="text-ink-500">× {formatCantidad(p.cantidad)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
