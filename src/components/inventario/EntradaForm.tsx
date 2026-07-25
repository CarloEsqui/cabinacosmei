import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Expandable } from "@/components/ui/expandable";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { ProductoFormModal } from "@/components/catalogos/ProductoFormModal";
import { NuevoProveedorModal } from "@/components/catalogos/NuevoProveedorModal";
import type { EntradaInput } from "@shared/schemas";
import type { Producto } from "@shared/types";
import { fechaLocalIso } from "@shared/fechas";

const HOY = fechaLocalIso();

const VACIO: EntradaInput = {
  fecha: HOY,
  folio: "",
  proveedorId: null,
  productoId: "",
  loteId: "",
  numeroLote: "",
  fechaCaducidad: "",
  ubicacion: "",
  cantidad: 1,
  costoUnitario: 0,
  numeroFactura: "",
  metodoPago: "",
  observaciones: "",
};

/**
 * Formulario de entrada de inventario, reutilizable dentro de un modal. Conserva toda la lógica
 * original (caducidad condicional, precarga de costo base, MoneyInput con key por producto) y suma
 * el alta rápida encadenada: "+" para crear producto o proveedor sin salir.
 * `onRegistrado` se llama tras una entrada exitosa (el modal contenedor la usa para cerrarse).
 */
export function EntradaForm({ onRegistrado }: { onRegistrado?: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["tiposProducto"],
    queryFn: () => window.api.tiposProducto.listar(),
  });
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => window.api.proveedores.listar(),
  });

  const [form, setForm] = useState<EntradaInput>(VACIO);
  const [formKey, setFormKey] = useState(0);
  const [nuevoProducto, setNuevoProducto] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  // Qué hacer al terminar: cerrar el modal o quedarse para capturar otra entrada.
  const mantenerAbierto = useRef(false);

  const productoSel = productos.find((p) => p.id === form.productoId);
  const tipoSel = tipos.find((t) => t.id === productoSel?.tipoProductoId);
  const requiereCaducidad = tipoSel?.requiereCaducidad ?? false;

  // Al elegir producto: precarga su costo base y limpia caducidad si la categoría no la maneja.
  function seleccionarProducto(id: string) {
    const prod = productos.find((p) => p.id === id);
    aplicarProducto(prod, id);
  }
  function aplicarProducto(prod: Producto | undefined, id: string) {
    const tipo = tipos.find((t) => t.id === prod?.tipoProductoId);
    const permiteCaducidad = tipo?.requiereCaducidad ?? false;
    setForm((f) => ({
      ...f,
      productoId: id,
      costoUnitario: prod?.costoBase ?? 0,
      fechaCaducidad: permiteCaducidad ? f.fechaCaducidad : "",
    }));
    setFormKey((k) => k + 1); // re-monta el MoneyInput de costo para reflejar el costo base
  }

  const registrar = useMutation({
    mutationFn: () => window.api.inventario.registrarEntrada(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      toast.success("Entrada registrada. El inventario ya se actualizó.");
      setForm({ ...VACIO, fecha: HOY });
      setFormKey((k) => k + 1);
      if (!mantenerAbierto.current) onRegistrado?.();
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  return (
    <>
      <form
        key={formKey}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          registrar.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Fecha *</label>
          <Input
            type="date"
            required
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Producto *</label>
          <div className="flex gap-1.5">
            <Select
              className="flex-1"
              required
              value={form.productoId}
              onChange={(e) => seleccionarProducto(e.target.value)}
            >
              <option value="">Selecciona un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              className="px-2.5"
              title="Nuevo producto"
              onClick={() => setNuevoProducto(true)}
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Proveedor</label>
          <div className="flex gap-1.5">
            <Select
              className="flex-1"
              value={form.proveedorId ?? ""}
              onChange={(e) => setForm({ ...form, proveedorId: e.target.value || null })}
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombreComercial}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              className="px-2.5"
              title="Nuevo proveedor"
              onClick={() => setNuevoProveedor(true)}
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>

        <Expandable open={requiereCaducidad}>
          <div className="rounded-xl border border-jacaranda-200 bg-jacaranda-50/60 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-jacaranda-700">
              <CalendarClock size={14} /> Control por caducidad
            </div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Fecha de caducidad</label>
            <Input
              type="date"
              tabIndex={requiereCaducidad ? undefined : -1}
              value={form.fechaCaducidad}
              onChange={(e) => setForm({ ...form, fechaCaducidad: e.target.value })}
            />
            <p className="mt-1 text-xs text-ink-400">
              Este producto requiere control por caducidad. Aplica a este ingreso.
            </p>
          </div>
        </Expandable>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Cantidad (piezas) *</label>
            <NumberInput
              min={0}
              step="0.01"
              required
              placeholder="0"
              value={form.cantidad}
              onValueChange={(v) => setForm({ ...form, cantidad: v ?? 0 })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Costo unitario</label>
            <MoneyInput
              key={form.productoId}
              placeholder="0.00"
              value={form.costoUnitario}
              onValueChange={(v) => setForm({ ...form, costoUnitario: v ?? 0 })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Número de factura</label>
            <Input
              value={form.numeroFactura}
              onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Ubicación</label>
            <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            type="submit"
            disabled={registrar.isPending}
            className="flex-1"
            onClick={() => (mantenerAbierto.current = false)}
          >
            <PackagePlus size={16} /> Registrar entrada
          </Button>
          <Button
            type="submit"
            variant="secondary"
            disabled={registrar.isPending}
            onClick={() => (mantenerAbierto.current = true)}
          >
            Y agregar otra
          </Button>
        </div>
      </form>

      <ProductoFormModal
        open={nuevoProducto}
        onClose={() => setNuevoProducto(false)}
        onGuardado={(creado) => {
          setNuevoProducto(false);
          aplicarProducto(creado, creado.id);
        }}
      />
      <NuevoProveedorModal
        open={nuevoProveedor}
        onClose={() => setNuevoProveedor(false)}
        onCreado={(prov) => {
          setNuevoProveedor(false);
          setForm((f) => ({ ...f, proveedorId: prov.id }));
        }}
      />
    </>
  );
}
