import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Lock, XCircle, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFecha } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CitasFiltro } from "@shared/schemas";
import type { Cliente, CitaRow } from "@shared/types";

const PAGO_LABEL: Record<string, string> = {
  pagado: "Pagado",
  pendiente: "Pago pendiente",
};

/** "no_aplica" = la cita aún no se cierra, así que no tiene un estatus de pago que mostrar o filtrar. */
function estatusPagoCita(c: CitaRow): "pagado" | "pendiente" | "no_aplica" {
  if (!c.servicioRealizadoId) return "no_aplica";
  return c.saldoPendiente > 0.005 ? "pendiente" : "pagado";
}

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
  const [searchParams] = useSearchParams();
  const [filtro, setFiltro] = useState<CitasFiltro>(() => ({
    fechaDesde: searchParams.get("desde") ?? undefined,
    fechaHasta: searchParams.get("hasta") ?? undefined,
  }));

  const [filtrosPago, setFiltrosPago] = useState<string[]>(
    () => searchParams.get("pago")?.split(",").filter(Boolean) ?? [],
  );
  const [expandido, setExpandido] = useState<string | null>(null);

  // Si se llega desde un enlace (ej. la tarjeta "Citas próximas" del Dashboard, o el flag de
  // "Pago pendiente" de una clienta) mientras esta pestaña ya estaba montada, el filtro debe
  // reaccionar al cambio de la URL.
  useEffect(() => {
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    if (desde || hasta) {
      setFiltro((f) => ({ ...f, fechaDesde: desde ?? f.fechaDesde, fechaHasta: hasta ?? f.fechaHasta }));
    }
    const pago = searchParams.get("pago");
    if (pago) setFiltrosPago(pago.split(",").filter(Boolean));
  }, [searchParams]);

  const { data: citas = [] } = useQuery({
    queryKey: ["citas", filtro],
    queryFn: () => window.api.citas.listar(filtro),
  });

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  // Si se llega desde un enlace con "clienteId" (ej. el flag "Pago pendiente" de una clienta en
  // el listado de Clientes), se precarga esa clienta como si se hubiera buscado a mano.
  useEffect(() => {
    const clienteId = searchParams.get("clienteId");
    if (!clienteId || clienteSeleccionado?.id === clienteId) return;
    window.api.clientes.obtenerExpediente(clienteId).then((cliente) => {
      if (cliente) {
        setClienteSeleccionado(cliente);
        setFiltro((f) => ({ ...f, clienteId: cliente.id }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data: resumenCliente } = useQuery({
    queryKey: ["resumenCliente", clienteSeleccionado?.id],
    queryFn: () => window.api.citas.resumenCliente(clienteSeleccionado!.id),
    enabled: !!clienteSeleccionado,
  });

  function seleccionarCliente(c: Cliente | null) {
    setClienteSeleccionado(c);
    setFiltro((f) => ({ ...f, clienteId: c?.id }));
  }

  const cancelar = useMutation({
    mutationFn: (id: string) => window.api.citas.cambiarEstado(id, "cancelada"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["citas"] }),
  });

  const ordenadas = useMemo(() => {
    let lista = [...citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    if (filtrosPago.length > 0) {
      lista = lista.filter((c) => filtrosPago.includes(estatusPagoCita(c)));
    }
    return lista;
  }, [citas, filtrosPago]);

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-end gap-3">
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
          <MultiSelect
            options={Object.entries(ESTADO_LABEL).map(([valor, label]) => ({ value: valor, label }))}
            selected={filtro.estados ?? []}
            onChange={(estados) => setFiltro({ ...filtro, estados: estados.length > 0 ? estados : undefined })}
            placeholder="Todos"
            className="min-w-[160px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Pago</label>
          <MultiSelect
            options={[
              { value: "pendiente", label: "Pago pendiente" },
              { value: "pagado", label: "Pagado" },
            ]}
            selected={filtrosPago}
            onChange={setFiltrosPago}
            placeholder="Todos"
            className="min-w-[150px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Clienta</label>
          <BuscadorCliente seleccionado={clienteSeleccionado} onSeleccionar={seleccionarCliente} />
        </div>
      </div>

      {clienteSeleccionado && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-xl border border-beige-300 bg-beige-50 p-4 text-sm">
          <span className="font-medium text-ink-900">{clienteSeleccionado.nombreCompleto}</span>
          <span className="text-ink-700">
            Servicios cerrados: <strong>{resumenCliente?.serviciosCerrados ?? "—"}</strong>
          </span>
          <span className="text-ink-700">
            Total cobrado: <strong>${(resumenCliente?.totalCobrado ?? 0).toFixed(2)}</strong>
          </span>
          <span className={resumenCliente && resumenCliente.saldoPendiente > 0.005 ? "text-danger-500" : "text-ink-700"}>
            Saldo pendiente: <strong>${(resumenCliente?.saldoPendiente ?? 0).toFixed(2)}</strong>
          </span>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Hora</th>
              <th className="px-4 py-2">Clienta</th>
              <th className="px-4 py-2">Servicio</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Pago</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((c) => {
              const activa = c.estado === "programada" || c.estado === "confirmada";
              const pago = estatusPagoCita(c);
              const expandible = !!c.servicioRealizadoId;
              return (
                <Fragment key={c.id}>
                  <tr
                    className={cn("border-t border-beige-200", expandible && "cursor-pointer hover:bg-beige-100")}
                    onClick={() => expandible && setExpandido(expandido === c.id ? null : c.id)}
                  >
                    <td className="px-4 py-2 text-ink-500">
                      {expandible && (expandido === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </td>
                    <td className="px-4 py-2 text-ink-700">{formatFecha(c.fecha)}</td>
                    <td className="px-4 py-2 text-ink-700">{c.hora}</td>
                    <td className="px-4 py-2 font-medium text-ink-900">{c.clienteNombre}</td>
                    <td className="px-4 py-2 text-ink-700">{c.servicioNombre || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant={badgeVariant(c.estado)}>{ESTADO_LABEL[c.estado] ?? c.estado}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {pago !== "no_aplica" && (
                        <Badge variant={pago === "pendiente" ? "danger" : "success"}>{PAGO_LABEL[pago]}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {activa && (
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                  {expandible && expandido === c.id && (
                    <tr className="border-t border-beige-200 bg-beige-100">
                      <td colSpan={8} className="px-4 py-3">
                        <DetalleCita servicioRealizadoId={c.servicioRealizadoId!} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-500">
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

/** Expediente de una cita ya cerrada: insumos usados, productos vendidos y estado real de pago. */
function DetalleCita({ servicioRealizadoId }: { servicioRealizadoId: string }) {
  const { data: detalle } = useQuery({
    queryKey: ["detalleServicio", servicioRealizadoId],
    queryFn: () => window.api.serviciosRealizados.obtenerDetalle(servicioRealizadoId),
  });

  if (!detalle) return <p className="text-xs text-ink-500">Cargando...</p>;

  return (
    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Pago</h4>
        <p className="text-ink-700">Precio: ${detalle.precio.toFixed(2)}</p>
        <p className="text-ink-700">Cobrado: ${detalle.totalCobrado.toFixed(2)}</p>
        <p className={detalle.saldoPendiente > 0.005 ? "font-medium text-danger-500" : "text-success-500"}>
          {detalle.saldoPendiente > 0.005
            ? `Saldo pendiente: $${detalle.saldoPendiente.toFixed(2)}`
            : "Pagado por completo"}
        </p>
        {detalle.pagos.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {detalle.pagos.map((p, i) => (
              <p key={i} className="text-xs text-ink-500">
                {formatFecha(p.fecha)} · {p.metodoPago} · ${p.monto.toFixed(2)}
              </p>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Insumos usados</h4>
        {detalle.productosConsumidos.length === 0 && <p className="text-xs text-ink-500">Ninguno registrado.</p>}
        {detalle.productosConsumidos.map((p, i) => (
          <p key={i} className="text-ink-700">
            {p.productoNombre} · {p.cantidad}
          </p>
        ))}
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Productos vendidos</h4>
        {detalle.productosVendidos.length === 0 && <p className="text-xs text-ink-500">Ninguno.</p>}
        {detalle.productosVendidos.map((p, i) => (
          <p key={i} className="text-ink-700">
            {p.productoNombre} · {p.cantidad}
          </p>
        ))}
        {detalle.observaciones && (
          <p className="mt-2 text-xs text-ink-500">Observaciones: {detalle.observaciones}</p>
        )}
      </div>
    </div>
  );
}

function BuscadorCliente({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: Cliente | null;
  onSeleccionar: (cliente: Cliente | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });

  useEffect(() => {
    function alClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  if (seleccionado) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-lg border border-beige-300 bg-beige-50 px-3 text-sm">
        <span className="font-medium text-ink-900">{seleccionado.nombreCompleto}</span>
        <span className="text-xs text-ink-500">{seleccionado.codigoCliente}</span>
        <button
          type="button"
          onClick={() => onSeleccionar(null)}
          className="text-ink-500 hover:text-danger-500"
          title="Quitar filtro de clienta"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const coincidencias =
    texto.trim().length > 0
      ? clientes
          .filter(
            (c) =>
              c.nombreCompleto.toLowerCase().includes(texto.toLowerCase()) ||
              c.codigoCliente.toLowerCase().includes(texto.toLowerCase()),
          )
          .slice(0, 8)
      : [];

  return (
    <div className="relative" ref={contenedorRef}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
        <Input
          placeholder="Buscar por nombre o código..."
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          className="min-w-[220px] pl-8"
        />
      </div>
      {abierto && coincidencias.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-lg border border-beige-300 bg-beige-50 shadow-lg">
          {coincidencias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSeleccionar(c);
                setTexto("");
                setAbierto(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-beige-200"
            >
              <span className="font-medium text-ink-900">{c.nombreCompleto}</span>
              <span className="text-xs text-ink-500">{c.codigoCliente}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
