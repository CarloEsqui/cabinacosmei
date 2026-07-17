import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageMinus, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Expandable } from "@/components/ui/expandable";
import { formatFecha } from "@/lib/format";
import type { SalidaInput } from "@shared/schemas";
import { fechaLocalIso } from "@shared/fechas";

const HOY = fechaLocalIso();

const TIPOS_SALIDA: { value: SalidaInput["tipoSalida"]; label: string }[] = [
  { value: "venta", label: "Venta" },
  { value: "consumo_servicio", label: "Consumo en servicio" },
  { value: "merma", label: "Merma" },
  { value: "devolucion", label: "Devolución" },
  { value: "uso_interno", label: "Uso interno" },
  { value: "ajuste", label: "Ajuste" },
];

const VACIO: SalidaInput = {
  fecha: HOY,
  folio: "",
  productoId: "",
  loteId: "",
  tipoSalida: "venta",
  cantidad: 1,
  clienteId: null,
  servicioRealizadoId: null,
  observaciones: "",
};

export function SalidasTab() {
  const queryClient = useQueryClient();
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });

  const [form, setForm] = useState<SalidaInput>(VACIO);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const { data: lotesDisponibles = [] } = useQuery({
    queryKey: ["lotesPorProducto", form.productoId],
    queryFn: () => window.api.inventario.lotesPorProducto(form.productoId),
    enabled: !!form.productoId,
  });

  const registrar = useMutation({
    mutationFn: () => window.api.inventario.registrarSalida(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      setMensaje("Salida registrada. El inventario ya se actualizó.");
      setError(null);
      setForm({ ...VACIO, fecha: HOY });
      setFormKey((k) => k + 1);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo registrar la salida."),
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
              <label className="mb-1 block text-xs font-medium text-ink-500">Tipo de salida *</label>
              <Select
                value={form.tipoSalida}
                onChange={(e) => setForm({ ...form, tipoSalida: e.target.value as SalidaInput["tipoSalida"] })}
              >
                {TIPOS_SALIDA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Producto *</label>
            <Select
              required
              value={form.productoId}
              onChange={(e) => setForm({ ...form, productoId: e.target.value, loteId: "" })}
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
            <label className="mb-1 block text-xs font-medium text-ink-500">
              Lote (opcional — si no eliges, se usa el criterio FEFO/FIFO configurado)
            </label>
            <Select value={form.loteId} onChange={(e) => setForm({ ...form, loteId: e.target.value })}>
              <option value="">Automático (FEFO/FIFO)</option>
              {lotesDisponibles
                .filter((l) => l.cantidadDisponible > 0)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {(l.numeroLote || l.id.slice(0, 8))} — disponible {l.cantidadDisponible}
                    {l.fechaCaducidad ? ` — caduca ${formatFecha(l.fechaCaducidad)}` : ""}
                  </option>
                ))}
            </Select>
          </div>

          {/* En una venta conviene registrar a qué clienta se le vendió; el selector se despliega
              solo cuando el tipo de salida es "venta". */}
          <Expandable open={form.tipoSalida === "venta"}>
            <div className="rounded-xl border border-jacaranda-200 bg-jacaranda-50/60 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-jacaranda-700">
                <UserRound size={14} /> Cliente de la venta
              </div>
              <Select
                value={form.clienteId ?? ""}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value || null })}
              >
                <option value="">Sin cliente asignado</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombreCompleto}
                  </option>
                ))}
              </Select>
            </div>
          </Expandable>

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
            <label className="mb-1 block text-xs font-medium text-ink-500">Observaciones</label>
            <Input
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-danger-500">{error}</p>}
          {mensaje && <p className="text-sm text-success-500">{mensaje}</p>}

          <Button type="submit" disabled={registrar.isPending} className="mt-2">
            <PackageMinus size={16} /> Registrar salida
          </Button>
        </form>
      </Card>
    </div>
  );
}
