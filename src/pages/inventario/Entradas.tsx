import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, PackagePlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Expandable } from "@/components/ui/expandable";
import type { EntradaInput } from "@shared/schemas";
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

export function EntradasTab() {
  const queryClient = useQueryClient();
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
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const productoSel = productos.find((p) => p.id === form.productoId);
  const tipoSel = tipos.find((t) => t.id === productoSel?.tipoProductoId);
  // Por defecto NO se pide caducidad: solo aparece cuando el producto elegido pertenece a una
  // categoría marcada como "Requiere control por caducidad".
  const requiereCaducidad = tipoSel?.requiereCaducidad ?? false;

  // Al elegir producto: precarga su costo base como costo unitario de la entrada (editable) y,
  // si la categoría no maneja caducidad, limpia cualquier fecha que se hubiera puesto.
  function seleccionarProducto(id: string) {
    const prod = productos.find((p) => p.id === id);
    const tipo = tipos.find((t) => t.id === prod?.tipoProductoId);
    const permiteCaducidad = tipo?.requiereCaducidad ?? false;
    setForm({
      ...form,
      productoId: id,
      costoUnitario: prod?.costoBase ?? 0,
      fechaCaducidad: permiteCaducidad ? form.fechaCaducidad : "",
    });
  }

  const registrar = useMutation({
    mutationFn: () => window.api.inventario.registrarEntrada(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      setMensaje("Entrada registrada. El inventario ya se actualizó.");
      setError(null);
      setForm({ ...VACIO, fecha: HOY });
      setFormKey((k) => k + 1);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo registrar la entrada."),
  });

  return (
    <div className="p-8">
      <Card className="max-w-xl p-5">
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
            <Select
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
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Proveedor</label>
            <Select
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
          </div>

          {/* El módulo de caducidad solo se despliega (con animación) cuando el producto elegido
              pertenece a una categoría que sí requiere control por caducidad. */}
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
              <label className="mb-1 block text-xs font-medium text-ink-500">Cantidad *</label>
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
              {/* key por producto: al cambiar de producto, el NumberInput se re-monta para reflejar
                  el costo base recién precargado (mantiene su texto interno, no se resincroniza solo). */}
              <NumberInput
                key={form.productoId}
                min={0}
                step="0.01"
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

          {error && <p className="text-sm text-danger-500">{error}</p>}
          {mensaje && <p className="text-sm text-success-500">{mensaje}</p>}

          <Button type="submit" disabled={registrar.isPending} className="mt-2">
            <PackagePlus size={16} /> Registrar entrada
          </Button>
        </form>
      </Card>
    </div>
  );
}
