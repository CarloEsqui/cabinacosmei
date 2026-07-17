import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import type { Proveedor } from "@shared/types";
import type { ProveedorInput } from "@shared/schemas";

type OrdenKey = "nombreComercial" | "diasCredito";

const VACIO: ProveedorInput = {
  nombreComercial: "",
  razonSocial: "",
  contacto: "",
  telefono: "",
  correo: "",
  rfc: "",
  diasCredito: 0,
  categoria: "",
  activo: true,
  notas: "",
};

export function ProveedoresTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const eliminarHibrido = useEliminarHibrido();
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => window.api.proveedores.listar(),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["proveedores"] });
  }

  async function alternarActivo(p: Proveedor) {
    try {
      await window.api.proveedores.setActivo(p.id, !p.activo);
      invalidar();
      toast.success(p.activo ? "Proveedor desactivado." : "Proveedor activado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(p: Proveedor) {
    eliminarHibrido({
      nombre: `el proveedor "${p.nombreComercial}"`,
      eliminar: () => window.api.proveedores.eliminar(p.id),
      desactivar: () => window.api.proveedores.setActivo(p.id, false),
      onExito: invalidar,
    });
  }

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [form, setForm] = useState<ProveedorInput>(VACIO);

  const guardar = useMutation({
    mutationFn: async () => {
      if (editando) {
        return window.api.proveedores.actualizar(editando.id, form);
      }
      return window.api.proveedores.crear(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      setModalAbierto(false);
      toast.success(editando ? "Proveedor actualizado." : "Proveedor creado.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setModalAbierto(true);
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p);
    setForm({
      nombreComercial: p.nombreComercial,
      razonSocial: p.razonSocial ?? "",
      contacto: p.contacto ?? "",
      telefono: p.telefono ?? "",
      correo: p.correo ?? "",
      rfc: p.rfc ?? "",
      diasCredito: p.diasCredito ?? 0,
      categoria: p.categoria ?? "",
      activo: p.activo,
      notas: p.notas ?? "",
    });
    setModalAbierto(true);
  }

  const [busqueda, setBusqueda] = useState("");
  const [filtrosEstatus, setFiltrosEstatus] = useState<string[]>([]);
  const [orden, setOrden] = useState<OrdenKey>("nombreComercial");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");

  function alternarOrden(key: OrdenKey) {
    if (orden === key) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
    } else {
      setOrden(key);
      setDireccion("asc");
    }
  }

  const filtrados = useMemo(() => {
    let lista = proveedores.filter((p) => {
      if (
        busqueda &&
        !p.nombreComercial.toLowerCase().includes(busqueda.toLowerCase()) &&
        !(p.contacto ?? "").toLowerCase().includes(busqueda.toLowerCase())
      )
        return false;
      if (filtrosEstatus.length > 0 && !filtrosEstatus.includes(p.activo ? "activo" : "inactivo")) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      const cmp =
        orden === "nombreComercial"
          ? a.nombreComercial.localeCompare(b.nombreComercial)
          : (a.diasCredito ?? 0) - (b.diasCredito ?? 0);
      return direccion === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [proveedores, busqueda, filtrosEstatus, orden, direccion]);

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">{proveedores.length} proveedores registrados</p>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo proveedor
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Buscar proveedor o contacto..."
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
              <SortableHeader
                label="Nombre comercial"
                sortKey="nombreComercial"
                activo={orden}
                direccion={direccion}
                onSort={alternarOrden}
              />
              <th className="px-4 py-2">Contacto</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2">Estatus</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr key={p.id} className="border-t border-beige-200">
                <td className="px-4 py-2 font-medium text-ink-900">{p.nombreComercial}</td>
                <td className="px-4 py-2 text-ink-700">{p.contacto || "—"}</td>
                <td className="px-4 py-2 text-ink-700">{p.telefono || "—"}</td>
                <td className="px-4 py-2 text-ink-700">{p.categoria || "—"}</td>
                <td className="px-4 py-2">
                  <Badge variant={p.activo ? "success" : "neutral"}>
                    {p.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarActivo(p)}
                      title={p.activo ? "Desactivar" : "Activar"}
                    >
                      {p.activo ? <PowerOff size={14} /> : <Power size={14} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => eliminar(p)} title="Eliminar">
                      <Trash2 size={14} className="text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  <EmptyState
                    icon={Truck}
                    mensaje={proveedores.length === 0 ? "Aún no hay proveedores registrados." : "Ningún proveedor coincide con los filtros."}
                    submensaje={proveedores.length === 0 ? "Agrega tu primer proveedor con el botón de arriba." : undefined}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar proveedor" : "Nuevo proveedor"}
      >
        <form
          key={editando?.id ?? "nuevo"}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <Field label="Nombre comercial *">
            <Input
              required
              value={form.nombreComercial}
              onChange={(e) => setForm({ ...form, nombreComercial: e.target.value })}
            />
          </Field>
          <Field label="Razón social">
            <Input
              value={form.razonSocial}
              onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacto">
              <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
            </Field>
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Correo">
              <Input
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </Field>
            <Field label="RFC">
              <Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Días de crédito">
              <NumberInput
                placeholder="0"
                value={form.diasCredito}
                onValueChange={(v) => setForm({ ...form, diasCredito: v ?? 0 })}
              />
            </Field>
            <Field label="Categoría">
              <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </Field>
          </div>
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
          <Button type="submit" disabled={guardar.isPending} className="mt-2">
            Guardar
          </Button>
        </form>
      </Modal>
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
