import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, FolderOpen, IdCard } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/sortable-header";
import { formatFecha } from "@/lib/format";
import type { Cliente } from "@shared/types";
import type { ClienteInput } from "@shared/schemas";

type OrdenKey = "nombreCompleto" | "fechaAlta";

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
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteInput>(VACIO);
  const [expedienteId, setExpedienteId] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
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
    },
  });

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
      if (filtroEstatus === "activo" && !c.activo) return false;
      if (filtroEstatus === "inactivo" && c.activo) return false;
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
  }, [clientes, busqueda, filtroEstatus, orden, direccion]);

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
          <Select
            value={filtroEstatus}
            onChange={(e) => setFiltroEstatus(e.target.value)}
            className="max-w-[160px]"
          >
            <option value="">Todos los estatus</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </Select>
        </div>

        <Card className="overflow-hidden">
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
                    <Badge variant={c.activo ? "success" : "neutral"}>
                      {c.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setExpedienteId(c.id)}>
                        <IdCard size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => abrirEditar(c)}>
                        <Pencil size={14} />
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

      {expedienteId && <ExpedienteModal clienteId={expedienteId} onClose={() => setExpedienteId(null)} />}
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

function ExpedienteModal({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const { data: expediente } = useQuery({
    queryKey: ["clienteExpediente", clienteId],
    queryFn: () => window.api.clientes.obtenerExpediente(clienteId),
  });

  if (!expediente) {
    return (
      <Modal open onClose={onClose} title="Expediente">
        <p className="text-sm text-ink-500">Cargando...</p>
      </Modal>
    );
  }

  const { cliente, citas, servicios, pagos } = expediente;

  return (
    <Modal open onClose={onClose} title={`Expediente · ${cliente.nombreCompleto}`}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between rounded-xl bg-beige-100 p-3">
          <div className="text-sm text-ink-700">
            <p className="font-medium text-ink-900">{cliente.codigoCliente}</p>
            <p className="text-xs text-ink-500">{cliente.telefono || "Sin teléfono"}</p>
          </div>
          {cliente.carpetaPath && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.api.carpetas.abrirCarpeta(cliente.carpetaPath!)}
            >
              <FolderOpen size={16} /> Abrir carpeta
            </Button>
          )}
        </div>

        <ExpedienteSeccion titulo="Citas">
          {citas.length === 0 && <p className="text-xs text-ink-500">Sin citas registradas aún.</p>}
          {citas.map((c) => (
            <div key={c.id} className="flex justify-between text-sm">
              <span className="text-ink-700">
                {formatFecha(c.fecha)} {c.hora} — {c.servicioNombre ?? "Servicio"}
              </span>
              <Badge variant="neutral">{c.estado}</Badge>
            </div>
          ))}
        </ExpedienteSeccion>

        <ExpedienteSeccion titulo="Servicios realizados">
          {servicios.length === 0 && <p className="text-xs text-ink-500">Sin servicios registrados aún.</p>}
          {servicios.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span className="text-ink-700">
                {formatFecha(s.fecha)} — {s.servicioNombre ?? "Servicio"} ({s.codigoServicio})
              </span>
              <span className="text-ink-500">${(s.precio ?? 0).toFixed(2)}</span>
            </div>
          ))}
        </ExpedienteSeccion>

        <ExpedienteSeccion titulo="Pagos">
          {pagos.length === 0 && <p className="text-xs text-ink-500">Sin pagos registrados aún.</p>}
          {pagos.map((p) => (
            <div key={p.id} className="flex justify-between text-sm">
              <span className="text-ink-700">
                {formatFecha(p.fecha)} — {p.metodoPago}
              </span>
              <span className="text-ink-900">${p.monto.toFixed(2)}</span>
            </div>
          ))}
        </ExpedienteSeccion>
      </div>
    </Modal>
  );
}

function ExpedienteSeccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-jacaranda-700">{titulo}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
