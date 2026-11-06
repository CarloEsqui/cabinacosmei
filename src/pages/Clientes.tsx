import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Archive,
  ArrowLeft,
  ArrowUpDown,
  Cake,
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Mail,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Search,
  SearchX,
  StickyNote,
  Trash2,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatChip } from "@/components/ui/stat-chip";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { useToast } from "@/components/ui/toast";
import { formatFecha, formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import { ClienteFormModal } from "@/components/catalogos/ClienteFormModal";
import { ManchaOrganica, PetalosAlVuelo } from "@/components/ui/decoracion";
import { CitaDetalleModal, ESTADO_CITA } from "@/pages/agenda/CitaDetalleModal";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CierreCitaModal } from "@/pages/agenda/CierreCitaModal";
import { FichaClinicaModal } from "@/components/ficha/FichaClinicaModal";
import { AvisoPrecaucion } from "@/components/ficha/AvisoPrecaucion";
import { VentasDeCliente } from "@/components/ventas/ListaVentas";
import { fechaLocalIso, horaLocal } from "@shared/fechas";
import { Paginador, usePaginacion } from "@/components/ui/paginador";
import type { CitaRow, Cliente } from "@shared/types";

type Orden = "nombre_asc" | "nombre_desc" | "alta_desc" | "alta_asc";

/** A dónde llevar a la usuaria al hacer clic en cada tipo de flag de alerta de una clienta. */
function rutaAlerta(alerta: string, clienteId: string): string | null {
  if (alerta === "Pago pendiente") return `/citas?clienteId=${clienteId}&pago=pendiente`;
  if (alerta === "Por contactar") return "/citas?vista=mantenimientos";
  return null;
}

function AlertaBadge({ alerta, clienteId }: { alerta: string; clienteId: string }) {
  const navigate = useNavigate();
  const ruta = rutaAlerta(alerta, clienteId);
  return (
    <Badge
      variant={alerta === "Pago pendiente" ? "danger" : "warning"}
      className={ruta ? "cursor-pointer hover:opacity-80" : undefined}
      onClick={
        ruta
          ? (e) => {
              e.stopPropagation();
              navigate(ruta);
            }
          : undefined
      }
    >
      {alerta}
    </Badge>
  );
}

export function ClientesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const eliminarHibrido = useEliminarHibrido();
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [expedienteId, setExpedienteId] = useState<string | null>(null);

  // Citas desde la ficha: agendar, reagendar y cerrar sin salir de Clientes.
  const [nuevaCita, setNuevaCita] = useState<{ clienteId: string; fecha?: string } | null>(null);
  const [citaReagendar, setCitaReagendar] = useState<CitaRow | null>(null);
  const [citaEnCierre, setCitaEnCierre] = useState<string | null>(null);

  // Permite llegar directo al expediente de una clienta desde otra página (ej. el drill-down de
  // "en riesgo" / "inactivas" en Reportes, o "Ver ficha" en Citas) vía /clientes?expediente=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("expediente");
    if (id) setExpedienteId(id);
  }, [searchParams]);

  const [busqueda, setBusqueda] = useState("");
  // Como "Archivados" de WhatsApp: la lista principal muestra solo activas; las inactivas viven
  // en su propia vista. Al buscar, la lista principal busca en todas (cada fila marca "Inactiva").
  const [verInactivas, setVerInactivas] = useState(false);
  const [orden, setOrden] = useState<Orden>("nombre_asc");

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["clientes"] });
    queryClient.invalidateQueries({ queryKey: ["clienteExpediente"] });
  }

  async function alternarActivo(c: Cliente) {
    try {
      await window.api.clientes.setActivo(c.id, !c.activo);
      invalidar();
      toast.success(c.activo ? "Clienta desactivada." : "Clienta activada.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(c: Cliente) {
    eliminarHibrido({
      nombre: `a "${c.nombreCompleto}"`,
      eliminar: () => window.api.clientes.eliminar(c.id),
      desactivar: () => window.api.clientes.setActivo(c.id, false),
      onExito: () => {
        invalidar();
        cerrarFicha();
      },
    });
  }

  function abrirNuevo() {
    setEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(c: Cliente) {
    setEditando(c);
    setModalAbierto(true);
  }

  function cerrarFicha() {
    setExpedienteId(null);
    if (searchParams.get("expediente")) setSearchParams({});
  }

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    let lista = clientes.filter((c) => {
      if (
        texto &&
        !c.nombreCompleto.toLowerCase().includes(texto) &&
        !(c.telefono ?? "").includes(texto) &&
        !c.codigoCliente.toLowerCase().includes(texto)
      )
        return false;
      if (verInactivas) return !c.activo;
      if (!texto && !c.activo) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      if (orden === "nombre_asc") return a.nombreCompleto.localeCompare(b.nombreCompleto);
      if (orden === "nombre_desc") return b.nombreCompleto.localeCompare(a.nombreCompleto);
      if (orden === "alta_desc") return b.fechaAlta.localeCompare(a.fechaAlta);
      return a.fechaAlta.localeCompare(b.fechaAlta);
    });
    return lista;
  }, [clientes, busqueda, verInactivas, orden]);

  // Franja de stats (§4): se calculan del array ya cargado por el useQuery de arriba, cero
  // queries nuevas.
  const totalClientas = clientes.length;
  const activas = clientes.filter((c) => c.activo).length;
  const conPagoPendiente = clientes.filter((c) => c.alertas.includes("Pago pendiente")).length;

  const inactivas = totalClientas - activas;
  const hayFiltrosActivos = busqueda.trim().length > 0;
  const claveFiltros = `${busqueda.trim()}|${verInactivas}|${orden}`;
  const paginacion = usePaginacion(filtrados, claveFiltros);

  return (
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      {/* Decoración de sección (§10): lavado suave en la esquina inferior derecha + pétalos
          derivando por la inferior izquierda. `-z-10` + `isolate` las manda al fondo del
          apilamiento: las cards opacas las recortan solas y jamás pisan la lista. */}
      <ManchaOrganica
        className="pointer-events-none absolute bottom-0 right-0 -z-10 hidden select-none lg:block"
        variante={2}
        width={320}
        opacity={0.34}
      />
      <PetalosAlVuelo
        className="pointer-events-none absolute bottom-6 left-6 -z-10 hidden select-none xl:block"
        width={220}
        opacity={0.45}
      />
      <PageHeader
        title="Clientes"
        subtitle="Expediente, historial y carpetas automáticas"
        actions={
          <Button size="sm" onClick={abrirNuevo}>
            <Plus size={16} /> Nueva clienta
          </Button>
        }
      />

      <div className="p-8">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatChip icon={Users} valor={totalClientas} label="Total clientas" />
          <StatChip icon={UserCheck} valor={activas} label="Activas" />
          <StatChip
            icon={Wallet}
            valor={conPagoPendiente}
            label="Con pago pendiente"
            tono={conPagoPendiente > 0 ? "warning" : "neutral"}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
            <Input
              placeholder="Buscar por nombre, código o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="min-w-[260px] max-w-xs pl-8"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ArrowUpDown size={14} className="text-ink-400" />
            <Select
              value={orden}
              onChange={(e) => setOrden(e.target.value as Orden)}
              aria-label="Ordenar clientas"
              className="w-[180px]"
            >
              <option value="nombre_asc">Nombre (A–Z)</option>
              <option value="nombre_desc">Nombre (Z–A)</option>
              <option value="alta_desc">Alta más reciente</option>
              <option value="alta_asc">Alta más antigua</option>
            </Select>
          </div>
        </div>

        <Card
          key={`${verInactivas}|${orden}|${paginacion.pagina}`}
          className="aparecer-suave divide-y divide-beige-200 overflow-hidden"
        >
          {verInactivas ? (
            <button
              type="button"
              onClick={() => setVerInactivas(false)}
              className="group flex w-full items-center gap-3 bg-beige-100/60 px-4 py-3 text-left transition-colors hover:bg-beige-100"
            >
              <ArrowLeft size={18} className="text-ink-500 transition-transform group-hover:-translate-x-0.5" />
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink-900">Clientas inactivas</span>
                <span className="block text-xs text-ink-500">Volver a las clientas activas</span>
              </span>
              <span className="text-xs font-medium text-ink-500">{inactivas}</span>
            </button>
          ) : (
            inactivas > 0 &&
            !hayFiltrosActivos && (
              <button
                type="button"
                onClick={() => setVerInactivas(true)}
                className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-beige-100"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-beige-200 text-ink-500 transition-colors group-hover:bg-jacaranda-100 group-hover:text-jacaranda-600">
                  <Archive size={16} />
                </span>
                <span className="flex-1 text-sm font-medium text-ink-700 group-hover:text-ink-900">
                  Clientas inactivas
                </span>
                <span className="text-xs font-medium text-ink-500">{inactivas}</span>
                <ChevronRight size={16} className="text-ink-300 group-hover:text-jacaranda-600" />
              </button>
            )
          )}
          {paginacion.visibles.map((c) => (
            <FilaCliente key={c.id} cliente={c} onAbrir={() => setExpedienteId(c.id)} />
          ))}
          {filtrados.length === 0 && (
            <div className="px-4 py-6">
              {hayFiltrosActivos ? (
                <EmptyState
                  icon={SearchX}
                  mensaje="Ninguna clienta coincide con la búsqueda."
                  submensaje="Busca por nombre, código o teléfono."
                />
              ) : verInactivas ? (
                <EmptyState
                  ilustracion={IlustracionDocumento}
                  mensaje="No hay clientas inactivas."
                  submensaje="Cuando desactives a una clienta, aparecerá aquí."
                />
              ) : clientes.length > 0 ? (
                <EmptyState
                  ilustracion={IlustracionDocumento}
                  mensaje="Todas tus clientas están inactivas."
                  submensaje="Ábrelas desde “Clientas inactivas” para reactivarlas."
                />
              ) : (
                <EmptyState
                  ilustracion={IlustracionDocumento}
                  mensaje="Aún no hay clientas registradas."
                  submensaje="Registra tu primera clienta con el botón de arriba."
                />
              )}
            </div>
          )}
        </Card>
        {filtrados.length > 0 && (
          <div className="mt-3">
            <Paginador {...paginacion} sustantivo={["clienta", "clientas"]} onCambiar={paginacion.irA} />
          </div>
        )}
      </div>

      <ClienteFormModal open={modalAbierto} onClose={() => setModalAbierto(false)} cliente={editando} />

      {expedienteId && (
        <FichaCliente
          clienteId={expedienteId}
          onClose={cerrarFicha}
          onEditar={(c) => {
            cerrarFicha();
            abrirEditar(c);
          }}
          onAlternarActivo={alternarActivo}
          onEliminar={eliminar}
          onNuevaCita={(clienteId) => setNuevaCita({ clienteId })}
          onCerrarCita={setCitaEnCierre}
          onReagendar={setCitaReagendar}
        />
      )}

      <NuevaCitaModal
        open={!!nuevaCita}
        onClose={() => setNuevaCita(null)}
        clienteInicial={nuevaCita?.clienteId}
        fechaInicial={nuevaCita?.fecha}
      />
      <NuevaCitaModal open={!!citaReagendar} citaEditar={citaReagendar} onClose={() => setCitaReagendar(null)} />
      {citaEnCierre && (
        <CierreCitaModal
          citaId={citaEnCierre}
          onClose={() => setCitaEnCierre(null)}
          onAgendarMantenimiento={(clienteId, fecha) => setNuevaCita({ clienteId, fecha })}
        />
      )}
    </div>
  );
}

/** Una clienta en la lista: toda la fila abre su ficha, donde están todas las acciones. */
function FilaCliente({ cliente: c, onAbrir }: { cliente: Cliente; onAbrir: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      title="Ver ficha de la clienta"
      className="group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-beige-100 focus-visible:bg-beige-100 focus-visible:outline-none"
    >
      <Avatar nombre={c.nombreCompleto} apagado={!c.activo} />
      <div className="min-w-0 flex-1">
        <p className={c.activo ? "truncate font-medium text-ink-900" : "truncate font-medium text-ink-500"}>
          {c.nombreCompleto}
        </p>
        <p className="truncate text-sm text-ink-500">{c.codigoCliente}</p>
      </div>
      <div className="hidden w-[150px] shrink-0 items-center gap-1.5 text-sm text-ink-700 md:flex">
        {c.telefono ? (
          <>
            <Phone size={13} className="text-ink-400" /> {c.telefono}
          </>
        ) : (
          <span className="text-ink-300">Sin teléfono</span>
        )}
      </div>
      <div className="hidden w-[120px] shrink-0 text-sm text-ink-500 lg:block">Alta {formatFecha(c.fechaAlta)}</div>
      <div className="flex w-[230px] shrink-0 flex-wrap justify-end gap-1">
        {!c.activo && <Badge variant="neutral">Inactiva</Badge>}
        {c.alertas.map((alerta) => (
          <AlertaBadge key={alerta} alerta={alerta} clienteId={c.id} />
        ))}
      </div>
      <ChevronRight
        size={18}
        className="shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-jacaranda-600"
      />
    </div>
  );
}

/**
 * Ficha de la clienta, con el mismo lenguaje visual que el detalle de una cita: encabezado con
 * avatar y contacto, su dinero (servicios, cobrado, saldo), sus citas próximas y su historial
 * (cada una abre el detalle de la cita, con cobros incluidos) y sus datos. Todas las acciones de
 * la clienta viven aquí.
 */
function FichaCliente({
  clienteId,
  onClose,
  onEditar,
  onAlternarActivo,
  onEliminar,
  onNuevaCita,
  onCerrarCita,
  onReagendar,
}: {
  clienteId: string;
  onClose: () => void;
  onEditar: (cliente: Cliente) => void;
  onAlternarActivo: (cliente: Cliente) => void;
  onEliminar: (cliente: Cliente) => void;
  onNuevaCita: (clienteId: string) => void;
  onCerrarCita: (citaId: string) => void;
  onReagendar: (cita: CitaRow) => void;
}) {
  const navigate = useNavigate();
  const [citaAbierta, setCitaAbierta] = useState<string | null>(null);
  const [fichaClinica, setFichaClinica] = useState(false);
  const { data: aviso } = useQuery({
    queryKey: ["fichaAviso", clienteId],
    queryFn: () => window.api.fichas.aviso(clienteId),
  });

  const { data: cliente } = useQuery({
    queryKey: ["clienteExpediente", clienteId],
    queryFn: () => window.api.clientes.obtenerExpediente(clienteId),
  });
  const { data: resumen } = useQuery({
    queryKey: ["resumenCliente", clienteId],
    queryFn: () => window.api.citas.resumenCliente(clienteId),
  });
  const { data: citas = [] } = useQuery({
    queryKey: ["citas", { clienteId }],
    queryFn: () => window.api.citas.listar({ clienteId }),
  });

  if (!cliente) {
    return (
      <Modal open onClose={onClose} title="Ficha de clienta" ancho="2xl">
        <p className="text-sm text-ink-500">Cargando...</p>
      </Modal>
    );
  }

  const ahora = `${fechaLocalIso()} ${horaLocal()}`;
  const esActiva = (c: CitaRow) => c.estado === "programada" || c.estado === "confirmada";
  const proximas = citas
    .filter((c) => esActiva(c) && `${c.fecha} ${c.hora}` >= ahora)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const historial = citas
    .filter((c) => !proximas.includes(c))
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  const HISTORIAL_VISIBLE = 5;
  const citaDetalle = citaAbierta ? citas.find((c) => c.id === citaAbierta) : undefined;
  const saldo = resumen?.saldoPendiente ?? 0;

  return (
    <>
      <Modal open onClose={onClose} title="Ficha de clienta" ancho="2xl">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3 rounded-xl bg-beige-100 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar nombre={cliente.nombreCompleto} size="lg" apagado={!cliente.activo} />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-ink-900">{cliente.nombreCompleto}</p>
                <p className="text-sm text-ink-500">{cliente.codigoCliente}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                  {cliente.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone size={14} /> {cliente.telefono}
                    </span>
                  )}
                  {cliente.correo && (
                    <span className="flex min-w-0 items-center gap-1">
                      <Mail size={14} className="shrink-0" /> <span className="truncate">{cliente.correo}</span>
                    </span>
                  )}
                  {cliente.fechaNacimiento && (
                    <span className="flex items-center gap-1">
                      <Cake size={14} /> {formatFecha(cliente.fechaNacimiento)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Badge variant={cliente.activo ? "success" : "neutral"}>{cliente.activo ? "Activa" : "Inactiva"}</Badge>
              {cliente.alertas.map((alerta) => (
                <AlertaBadge key={alerta} alerta={alerta} clienteId={cliente.id} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <DatoFicha label="Servicios" valor={String(resumen?.serviciosCerrados ?? "—")} />
            <DatoFicha label="Total cobrado" valor={formatMoneda(resumen?.totalCobrado)} />
            <DatoFicha
              label="Saldo pendiente"
              valor={formatMoneda(saldo)}
              acento={saldo > 0.005 ? "danger" : "success"}
            />
          </div>

          {/* FR-009: el aviso de Precaución de la ficha clínica (solo el resumen). */}
          <AvisoPrecaucion clienteId={cliente.id} />

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" onClick={() => onNuevaCita(cliente.id)}>
              <CalendarPlus size={16} /> Nueva cita
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setFichaClinica(true)}>
              <ClipboardList size={16} /> {aviso?.tieneFicha ? "Ficha clínica" : "Llenar ficha clínica"}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => onEditar(cliente)}>
              <Pencil size={16} /> Editar datos
            </Button>
            {cliente.carpetaPath && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => window.api.carpetas.abrirCarpeta(cliente.carpetaPath!)}
              >
                <FolderOpen size={16} /> Abrir carpeta
              </Button>
            )}
          </div>

          <SeccionFicha titulo="Próximas citas">
            {proximas.length === 0 ? (
              <p className="text-sm text-ink-500">No tiene citas agendadas.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {proximas.map((c) => (
                  <MiniCita key={c.id} cita={c} onAbrir={() => setCitaAbierta(c.id)} />
                ))}
              </div>
            )}
          </SeccionFicha>

          <SeccionFicha
            titulo="Historial"
            accion={
              historial.length > HISTORIAL_VISIBLE ? (
                <button
                  type="button"
                  className="text-xs font-medium text-jacaranda-700 hover:underline"
                  onClick={() => navigate(`/citas?clienteId=${cliente.id}`)}
                >
                  Ver las {historial.length} en Citas
                </button>
              ) : undefined
            }
          >
            {historial.length === 0 ? (
              <p className="text-sm text-ink-500">Aún no tiene citas pasadas.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {historial.slice(0, HISTORIAL_VISIBLE).map((c) => (
                  <MiniCita key={c.id} cita={c} onAbrir={() => setCitaAbierta(c.id)} />
                ))}
              </div>
            )}
          </SeccionFicha>

          {/* Venta de mostrador (0008): sus compras fuera de cita, con las mismas acciones. */}
          <VentasDeCliente clienteId={cliente.id} />

          <SeccionFicha titulo="Datos">
            <div className="grid grid-cols-2 gap-4">
              <DatoCliente label="Fecha de alta" valor={formatFecha(cliente.fechaAlta)} />
              <DatoCliente label="Contacto de emergencia" valor={cliente.contactoEmergencia} />
              <DatoCliente label="Dirección" valor={cliente.direccion} />
            </div>
          </SeccionFicha>

          {(cliente.notas || cliente.observaciones) && (
            <div className="flex flex-col gap-2 rounded-xl border border-beige-200 p-3">
              {cliente.notas && (
                <div className="flex items-start gap-2 text-sm text-ink-700">
                  <StickyNote size={14} className="mt-0.5 shrink-0 text-ink-400" />
                  <p>{cliente.notas}</p>
                </div>
              )}
              {cliente.observaciones && (
                <div className="flex items-start gap-2 text-sm text-ink-700">
                  <ClipboardList size={14} className="mt-0.5 shrink-0 text-ink-400" />
                  <p>{cliente.observaciones}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-center gap-1 border-t border-beige-200 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onAlternarActivo(cliente)}>
              {cliente.activo ? (
                <>
                  <PowerOff size={14} /> Desactivar
                </>
              ) : (
                <>
                  <Power size={14} /> Activar
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-ink-400 hover:text-danger-500"
              onClick={() => onEliminar(cliente)}
            >
              <Trash2 size={14} /> Eliminar
            </Button>
          </div>
        </div>
      </Modal>

      {fichaClinica && <FichaClinicaModal clienteId={cliente.id} onClose={() => setFichaClinica(false)} />}

      {/* Fuera del modal de la ficha (no anidado en su contenedor animado): se apila encima. */}
      {citaDetalle && (
        <CitaDetalleModal
          cita={citaDetalle}
          onClose={() => setCitaAbierta(null)}
          onCerrarCita={onCerrarCita}
          onReagendar={onReagendar}
        />
      )}
    </>
  );
}

/** Cita compacta dentro de la ficha: hoja de calendario con el día, servicio, hora y estado. */
function MiniCita({ cita, onAbrir }: { cita: CitaRow; onAbrir: () => void }) {
  const estado = ESTADO_CITA[cita.estado] ?? { label: cita.estado, variant: "neutral" as const };
  const fecha = parseISO(cita.fecha);
  const debe = !!cita.servicioRealizadoId && cita.saldoPendiente > 0.005;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex w-full items-center gap-3 rounded-xl border border-beige-200 bg-beige-50 px-3 py-2 text-left transition-colors hover:border-jacaranda-200 hover:bg-beige-100"
    >
      <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-jacaranda-50 py-1 leading-tight">
        <span className="text-[10px] font-semibold uppercase text-jacaranda-600">
          {format(fecha, "MMM", { locale: es }).replace(".", "")}
        </span>
        <span className="text-base font-semibold tabular-nums text-ink-900">{format(fecha, "d")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">
          {cita.servicioNombre || "Sin servicio asignado"}
        </span>
        <span className="block text-xs text-ink-500">
          {format(fecha, "EEEE", { locale: es })} · {cita.hora}
          {fecha.getFullYear() !== new Date().getFullYear() ? ` · ${fecha.getFullYear()}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Badge variant={estado.variant}>{estado.label}</Badge>
        {debe && <Badge variant="danger">Debe {formatMoneda(cita.saldoPendiente)}</Badge>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-ink-300 group-hover:text-jacaranda-600" />
    </button>
  );
}

function SeccionFicha({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  );
}

function DatoFicha({ label, valor, acento }: { label: string; valor: string; acento?: "danger" | "success" }) {
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

function DatoCliente({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="text-sm text-ink-900">{valor || "—"}</p>
    </div>
  );
}
