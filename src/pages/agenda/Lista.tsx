import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, XCircle, Search, X, ChevronDown, ChevronUp, SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionCalendario } from "@/components/ui/ilustraciones";
import { useToast } from "@/components/ui/toast";
import { formatFecha, formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
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
  const toast = useToast();
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
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  const ordenadas = useMemo(() => {
    // Más recientes/próximas primero (orden descendente), no las más antiguas.
    let lista = [...citas].sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
    if (filtrosPago.length > 0) {
      lista = lista.filter((c) => filtrosPago.includes(estatusPagoCita(c)));
    }
    return lista;
  }, [citas, filtrosPago]);

  // Distingue "aún no hay citas" (vacío real) de "ninguna coincide" (vacío por filtros) para el
  // EmptyState §2 — sin disparar queries nuevas, solo mirando los filtros ya en estado.
  const hayFiltrosActivos = !!(
    filtro.fechaDesde ||
    filtro.fechaHasta ||
    (filtro.estados && filtro.estados.length > 0) ||
    filtrosPago.length > 0 ||
    clienteSeleccionado
  );

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <BuscadorCliente seleccionado={clienteSeleccionado} onSeleccionar={seleccionarCliente} />
        <MultiSelect
          options={Object.entries(ESTADO_LABEL).map(([valor, label]) => ({ value: valor, label }))}
          selected={filtro.estados ?? []}
          onChange={(estados) => setFiltro({ ...filtro, estados: estados.length > 0 ? estados : undefined })}
          placeholder="Todos los estados"
          className="min-w-[170px]"
        />
        <MultiSelect
          options={[
            { value: "pendiente", label: "Pago pendiente" },
            { value: "pagado", label: "Pagado" },
          ]}
          selected={filtrosPago}
          onChange={setFiltrosPago}
          placeholder="Todos los pagos"
          className="min-w-[160px]"
        />
        <RangoFechas
          desde={filtro.fechaDesde}
          hasta={filtro.fechaHasta}
          onDesde={(v) => setFiltro({ ...filtro, fechaDesde: v })}
          onHasta={(v) => setFiltro({ ...filtro, fechaHasta: v })}
        />
      </div>

      {clienteSeleccionado && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-xl border border-beige-300 bg-beige-50 p-4 text-sm">
          <span className="font-medium text-ink-900">{clienteSeleccionado.nombreCompleto}</span>
          <span className="text-ink-700">
            Servicios cerrados: <strong>{resumenCliente?.serviciosCerrados ?? "—"}</strong>
          </span>
          <span className="text-ink-700">
            Total cobrado: <strong>{formatMoneda(resumenCliente?.totalCobrado)}</strong>
          </span>
          <span className={resumenCliente && resumenCliente.saldoPendiente > 0.005 ? "text-danger-500" : "text-ink-700"}>
            Saldo pendiente: <strong>{formatMoneda(resumenCliente?.saldoPendiente)}</strong>
          </span>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <th></th>
              <th>Fecha</th>
              <th className="num">Hora</th>
              <th>Clienta</th>
              <th>Servicio</th>
              <th>Estado</th>
              <th>Pago</th>
              <th></th>
            </tr>
          </thead>
          <tbody
            key={`${filtro.fechaDesde}|${filtro.fechaHasta}|${(filtro.estados ?? []).join()}|${filtrosPago.join()}|${clienteSeleccionado?.id ?? ""}`}
            className="aparecer-suave"
          >
            {ordenadas.map((c) => {
              const activa = c.estado === "programada" || c.estado === "confirmada";
              const pago = estatusPagoCita(c);
              const expandible = !!c.servicioRealizadoId;
              return (
                <Fragment key={c.id}>
                  <tr
                    className={cn(expandible && "cursor-pointer")}
                    onClick={() => expandible && setExpandido(expandido === c.id ? null : c.id)}
                  >
                    <td className="text-ink-500">
                      {expandible && (expandido === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                    </td>
                    <td>{formatFecha(c.fecha)}</td>
                    <td className="num">{c.hora}</td>
                    <td className="font-medium text-ink-900">{c.clienteNombre}</td>
                    <td>{c.servicioNombre || "—"}</td>
                    <td>
                      <Badge variant={badgeVariant(c.estado)}>{ESTADO_LABEL[c.estado] ?? c.estado}</Badge>
                    </td>
                    <td>
                      {pago !== "no_aplica" && (
                        <Badge variant={pago === "pendiente" ? "danger" : "success"}>{PAGO_LABEL[pago]}</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      {activa && (
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="secondary" size="sm" onClick={() => onCerrarCita(c.id)}>
                            <Lock size={14} /> Cerrar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-ink-400 hover:text-danger-500"
                            onClick={() => cancelar.mutate(c.id)}
                            disabled={cancelar.isPending}
                            title="Cancelar cita"
                          >
                            <XCircle size={14} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandible && expandido === c.id && (
                    <tr className="bg-beige-100">
                      <td colSpan={8} className="px-4 py-3">
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
                          <DetalleCita servicioRealizadoId={c.servicioRealizadoId!} />
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6">
                  {hayFiltrosActivos ? (
                    <EmptyState
                      icon={SearchX}
                      mensaje="Ninguna cita coincide con los filtros."
                      submensaje="Ajusta las fechas, el estado, el pago o la clienta para ver más resultados."
                    />
                  ) : (
                    <EmptyState
                      ilustracion={IlustracionCalendario}
                      mensaje="Aún no hay citas registradas."
                      submensaje="Agenda tu primera cita con el botón “Nueva cita” de arriba."
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {citas.length > 0 && (
          <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
            Mostrando {ordenadas.length} de {citas.length} {citas.length === 1 ? "cita" : "citas"}
          </div>
        )}
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
        <p className="text-ink-700">Precio: {formatMoneda(detalle.precio)}</p>
        <p className="text-ink-700">Cobrado: {formatMoneda(detalle.totalCobrado)}</p>
        <p className={detalle.saldoPendiente > 0.005 ? "font-medium text-danger-500" : "text-success-500"}>
          {detalle.saldoPendiente > 0.005
            ? `Saldo pendiente: ${formatMoneda(detalle.saldoPendiente)}`
            : "Pagado por completo"}
        </p>
        {detalle.pagos.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {detalle.pagos.map((p, i) => (
              <p key={i} className="text-xs text-ink-500">
                {formatFecha(p.fecha)} · {p.metodoPago} · {formatMoneda(p.monto)}
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
          className="max-w-xs min-w-[220px] pl-8"
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

/**
 * Rango Desde–Hasta agrupado en un solo control visual (§1): dos inputs de fecha nativos unidos
 * por un guion, dentro de un contenedor con borde común — en vez de dos <Input> sueltos con label.
 */
function RangoFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde?: string;
  hasta?: string;
  onDesde: (valor?: string) => void;
  onHasta: (valor?: string) => void;
}) {
  return (
    <div className="flex h-10 items-center gap-1.5 rounded-xl border border-beige-300 bg-beige-50 px-3">
      <input
        type="date"
        value={desde ?? ""}
        onChange={(e) => onDesde(e.target.value || undefined)}
        aria-label="Desde"
        className="w-[118px] border-0 bg-transparent p-0 text-sm text-ink-900 focus:outline-none focus:ring-0"
      />
      <span className="text-ink-400">–</span>
      <input
        type="date"
        value={hasta ?? ""}
        onChange={(e) => onHasta(e.target.value || undefined)}
        aria-label="Hasta"
        className="w-[118px] border-0 bg-transparent p-0 text-sm text-ink-900 focus:outline-none focus:ring-0"
      />
    </div>
  );
}
