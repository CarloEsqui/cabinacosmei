import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
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
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => window.api.proveedores.listar(),
  });

  const [form, setForm] = useState<EntradaInput>(VACIO);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

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
          <div className="grid grid-cols-2 gap-3">
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
              <label className="mb-1 block text-xs font-medium text-ink-500">Folio</label>
              <Input value={form.folio} onChange={(e) => setForm({ ...form, folio: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Producto *</label>
            <Select
              required
              value={form.productoId}
              onChange={(e) => setForm({ ...form, productoId: e.target.value })}
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

          <p className="text-xs text-ink-500">
            Se creará un lote nuevo con los datos de abajo (caducidad propia de este lote).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Número de lote</label>
              <Input
                value={form.numeroLote}
                onChange={(e) => setForm({ ...form, numeroLote: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Fecha de caducidad</label>
              <Input
                type="date"
                value={form.fechaCaducidad}
                onChange={(e) => setForm({ ...form, fechaCaducidad: e.target.value })}
              />
            </div>
          </div>

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
              <NumberInput
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
