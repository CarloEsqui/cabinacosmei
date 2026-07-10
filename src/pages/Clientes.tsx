import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, FolderOpen, IdCard, Trash2, Power, PowerOff } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { formatFecha } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import type { Cliente } from "@shared/types";
import type { ClienteInput } from "@shared/schemas";

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

const VACIO: ClienteInput = {
  nombreCompleto: "",
  telefono: "",
  correo: "",
  fechaNacimiento: "",
  direccion: "",
  contactoEmergencia: "",
  activo: true,
  notas: "",
  observaciones: "",
};

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
  const [form, setForm] = useState<ClienteInput>(VACIO);
  const [expedienteId, setExpedienteId] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtrosEstatus, setFiltrosEstatus] = useState<string[]>([]);
  const [orden, setOrden] = useState<OrdenKey>("nombreCompleto");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");

  const guardar = useMutation({
    mutationFn: async () => {
      if (editando) return window.api.clientes.actualizar(editando.id, form);
      return window.api.clientes.crear(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      setModalAbierto(false);
      toast.success(editando ? "Clienta actualizada." : "Clienta creada.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

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
    setForm(VACIO);
    setModalAbierto(true);
  }

  function abrirEditar(c: Cliente) {
    setEditando(c);
    setForm({
      nombreCompleto: c.nombreCompleto,
      telefono: c.telefono ?? "",
      correo: c.correo ?? "",
      fechaNacimiento: c.fechaNacimiento ?? "",
      direccion: c.direccion ?? "",
      contactoEmergencia: c.contactoEmergencia ?? "",
      activo: c.activo,
      notas: c.notas ?? "",
      observaciones: c.observaciones ?? "",
    });
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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
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
          <table className="w-full text-sm">
            <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2">Código</th>
                <SortableHeader
                  label="Nombre"
                  sortKey="nombreCompleto"
                  activo={orden}
                  direccion={direccion}
                  onSort={alternarOrden}
                />
                <th className="px-4 py-2">Teléfono</th>
                <SortableHeader
                  label="Fecha de alta"
                  sortKey="fechaAlta"
                  activo={orden}
                  direccion={direccion}
                  onSort={alternarOrden}
                />
                <th className="px-4 py-2">Estatus</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-t border-beige-200">
                  <td className="px-4 py-2 text-ink-500">{c.codigoCliente}</td>
                  <td
                    className="cursor-pointer px-4 py-2 font-medium text-ink-900 hover:text-jacaranda-700"
                    onClick={() => setExpedienteId(c.id)}
                  >
                    {c.nombreCompleto}
                  </td>
                  <td className="px-4 py-2 text-ink-700">{c.telefono || "—"}</td>
                  <td className="px-4 py-2 text-ink-700">{formatFecha(c.fechaAlta)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={c.activo ? "success" : "neutral"}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </Badge>
                      {c.alertas.map((alerta) => (
                        <AlertaBadge key={alerta} alerta={alerta} clienteId={c.id} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setExpedienteId(c.id)} title="Expediente">
                        <IdCard size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => abrirEditar(c)} title="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => alternarActivo(c)}
                        title={c.activo ? "Desactivar" : "Activar"}
                      >
                        {c.activo ? <PowerOff size={14} /> : <Power size={14} />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => eliminar(c)} title="Eliminar">
                        <Trash2 size={14} className="text-danger-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                    {clientes.length === 0
                      ? "Aún no hay clientas registradas."
                      : "Ninguna clienta coincide con los filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar clienta" : "Nueva clienta"}
      >
        <form
          key={editando?.id ?? "nuevo"}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <Field label="Nombre completo *">
            <Input
              required
              value={form.nombreCompleto}
              onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Field>
            <Field label="Correo">
              <Input
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de nacimiento">
              <Input
                type="date"
                value={form.fechaNacimiento}
                onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
              />
            </Field>
            <Field label="Contacto de emergencia">
              <Input
                value={form.contactoEmergencia}
                onChange={(e) => setForm({ ...form, contactoEmergencia: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Dirección">
            <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Field>
          <Field label="Notas">
            <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Activo
          </label>
          {!editando && (
            <p className="text-xs text-ink-500">
              Al guardar se creará automáticamente la carpeta local de esta clienta.
            </p>
          )}
          <Button type="submit" disabled={guardar.isPending} className="mt-2">
            Guardar
          </Button>
        </form>
      </Modal>

      {expedienteId && (
        <ExpedienteModal
          clienteId={expedienteId}
          onClose={() => setExpedienteId(null)}
          onEditar={(c) => {
            setExpedienteId(null);
            abrirEditar(c);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      {children}
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
