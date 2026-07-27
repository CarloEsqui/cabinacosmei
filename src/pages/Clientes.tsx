import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Pencil, FolderOpen, IdCard, Trash2, Power, PowerOff, Users, UserCheck, Wallet, SearchX } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/sortable-header";
import { StatChip } from "@/components/ui/stat-chip";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { useToast } from "@/components/ui/toast";
import { formatFecha } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import { ClienteFormModal } from "@/components/catalogos/ClienteFormModal";
import { ManchaOrganica, PetalosAlVuelo } from "@/components/ui/decoracion";
import type { Cliente } from "@shared/types";

type OrdenKey = "nombreCompleto" | "fechaAlta";

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

  // Permite llegar directo al expediente de una clienta desde otra página (ej. el drill-down de
  // "en riesgo" / "inactivas" en Reportes) vía /clientes?expediente=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("expediente");
    if (id) setExpedienteId(id);
  }, [searchParams]);

  const [busqueda, setBusqueda] = useState("");
  const [filtrosEstatus, setFiltrosEstatus] = useState<string[]>([]);
  const [orden, setOrden] = useState<OrdenKey>("nombreCompleto");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["clientes"] });
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
      onExito: invalidar,
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

  function alternarOrden(key: OrdenKey) {
    if (orden === key) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
    } else {
      setOrden(key);
      setDireccion("asc");
    }
  }

  const filtrados = useMemo(() => {
    let lista = clientes.filter((c) => {
      if (
        busqueda &&
        !c.nombreCompleto.toLowerCase().includes(busqueda.toLowerCase()) &&
        !(c.telefono ?? "").includes(busqueda) &&
        !c.codigoCliente.toLowerCase().includes(busqueda.toLowerCase())
      )
        return false;
      if (filtrosEstatus.length > 0 && !filtrosEstatus.includes(c.activo ? "activo" : "inactivo")) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      const cmp =
        orden === "nombreCompleto"
          ? a.nombreCompleto.localeCompare(b.nombreCompleto)
          : a.fechaAlta.localeCompare(b.fechaAlta);
      return direccion === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [clientes, busqueda, filtrosEstatus, orden, direccion]);

  // Franja de stats (§4): se calculan del array ya cargado por el useQuery de arriba, cero
  // queries nuevas.
  const totalClientas = clientes.length;
  const activas = clientes.filter((c) => c.activo).length;
  const conPagoPendiente = clientes.filter((c) => c.alertas.includes("Pago pendiente")).length;

  const hayFiltrosActivos = busqueda.trim().length > 0 || filtrosEstatus.length > 0;

  return (
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      {/* Decoración de sección (§10): lavado suave en la esquina inferior derecha + pétalos
          derivando por la inferior izquierda. `-z-10` + `isolate` las manda al fondo del
          apilamiento: las cards opacas las recortan solas y jamás pisan la tabla. */}
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

        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder="Buscar por nombre, código o teléfono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="max-w-xs"
          />
          <MultiSelect
            options={[
              { value: "activo", label: "Activo" },
              { value: "inactivo", label: "Inactivo" },
            ]}
            selected={filtrosEstatus}
            onChange={setFiltrosEstatus}
            placeholder="Todos los estatus"
            className="max-w-[160px]"
          />
        </div>

        <Card className="overflow-x-auto">
          <table className="tabla-bellora">
            <thead>
              <tr>
                <th>Código</th>
                <SortableHeader
                  label="Nombre"
                  sortKey="nombreCompleto"
                  activo={orden}
                  direccion={direccion}
                  onSort={alternarOrden}
                  className="px-4 py-2.5"
                />
                <th>Teléfono</th>
                <SortableHeader
                  label="Fecha de alta"
                  sortKey="fechaAlta"
                  activo={orden}
                  direccion={direccion}
                  onSort={alternarOrden}
                  className="px-4 py-2.5"
                />
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody key={`${filtrosEstatus.join()}|${orden}|${direccion}`} className="aparecer-suave">
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td className="text-ink-500">{c.codigoCliente}</td>
                  <td
                    className="cursor-pointer font-medium text-ink-900 hover:text-jacaranda-700"
                    onClick={() => setExpedienteId(c.id)}
                  >
                    {c.nombreCompleto}
                  </td>
                  <td>{c.telefono || "—"}</td>
                  <td>{formatFecha(c.fechaAlta)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={c.activo ? "success" : "neutral"}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </Badge>
                      {c.alertas.map((alerta) => (
                        <AlertaBadge key={alerta} alerta={alerta} clienteId={c.id} />
                      ))}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ink-400"
                        onClick={() => setExpedienteId(c.id)}
                        title="Expediente"
                      >
                        <IdCard size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ink-400"
                        onClick={() => abrirEditar(c)}
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ink-400"
                        onClick={() => alternarActivo(c)}
                        title={c.activo ? "Desactivar" : "Activar"}
                      >
                        {c.activo ? <PowerOff size={14} /> : <Power size={14} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ink-400 hover:text-danger-500"
                        onClick={() => eliminar(c)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    {hayFiltrosActivos ? (
                      <EmptyState
                        icon={SearchX}
                        mensaje="Ninguna clienta coincide con los filtros."
                        submensaje="Ajusta la búsqueda o el estatus para ver más resultados."
                      />
                    ) : (
                      <EmptyState
                        ilustracion={IlustracionDocumento}
                        mensaje="Aún no hay clientas registradas."
                        submensaje="Registra tu primera clienta con el botón de arriba."
                      />
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {clientes.length > 0 && (
            <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
              Mostrando {filtrados.length} de {clientes.length} {clientes.length === 1 ? "clienta" : "clientas"}
            </div>
          )}
        </Card>
      </div>

      <ClienteFormModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        cliente={editando}
      />

      {expedienteId && (
        <ExpedienteModal
          clienteId={expedienteId}
          onClose={() => {
            setExpedienteId(null);
            if (searchParams.get("expediente")) setSearchParams({});
          }}
          onEditar={(c) => {
            setExpedienteId(null);
            abrirEditar(c);
          }}
        />
      )}
    </div>
  );
}

function ExpedienteModal({
  clienteId,
  onClose,
  onEditar,
}: {
  clienteId: string;
  onClose: () => void;
  onEditar: (cliente: Cliente) => void;
}) {
  const { data: cliente } = useQuery({
    queryKey: ["clienteExpediente", clienteId],
    queryFn: () => window.api.clientes.obtenerExpediente(clienteId),
  });

  if (!cliente) {
    return (
      <Modal open onClose={onClose} title="Ficha de clienta">
        <p className="text-sm text-ink-500">Cargando...</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Ficha de clienta · ${cliente.nombreCompleto}`}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-beige-100 p-4">
          <div>
            <p className="text-lg font-semibold text-ink-900">{cliente.nombreCompleto}</p>
            <p className="text-sm text-ink-500">{cliente.codigoCliente}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={cliente.activo ? "success" : "neutral"}>
                {cliente.activo ? "Activo" : "Inactivo"}
              </Badge>
              {cliente.alertas.map((alerta) => (
                <AlertaBadge key={alerta} alerta={alerta} clienteId={cliente.id} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm" onClick={() => onEditar(cliente)}>
              <Pencil size={14} /> Editar
            </Button>
            {cliente.carpetaPath && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.api.carpetas.abrirCarpeta(cliente.carpetaPath!)}
              >
                <FolderOpen size={14} /> Abrir carpeta
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <DatoCliente label="Teléfono" valor={cliente.telefono} />
          <DatoCliente label="Correo" valor={cliente.correo} />
          <DatoCliente
            label="Fecha de nacimiento"
            valor={cliente.fechaNacimiento ? formatFecha(cliente.fechaNacimiento) : null}
          />
          <DatoCliente label="Fecha de alta" valor={formatFecha(cliente.fechaAlta)} />
          <DatoCliente label="Contacto de emergencia" valor={cliente.contactoEmergencia} />
          <DatoCliente label="Dirección" valor={cliente.direccion} />
        </div>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Notas</h3>
          <p className="text-sm text-ink-700">{cliente.notas || "Sin notas."}</p>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Observaciones</h3>
          <p className="text-sm text-ink-700">{cliente.observaciones || "Sin observaciones."}</p>
        </div>

        <p className="text-xs text-ink-500">
          Para ver sus citas, servicios y pagos, búscala por nombre o código en la sección{" "}
          <span className="font-medium text-jacaranda-700">Citas</span>.
        </p>
      </div>
    </Modal>
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
