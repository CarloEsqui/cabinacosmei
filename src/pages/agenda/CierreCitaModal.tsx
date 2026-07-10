import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Upload, FolderOpen, Lock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";

interface FilaProducto {
  productoId: string;
  cantidad: number;
}

interface CierreCitaModalProps {
  citaId: string;
  onClose: () => void;
}

export function CierreCitaModal({ citaId, onClose }: CierreCitaModalProps) {
  const queryClient = useQueryClient();

  const { data: servicio } = useQuery({
    queryKey: ["abrirCierre", citaId],
    queryFn: () => window.api.serviciosRealizados.abrirCierre(citaId),
  });
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });
  const { data: receta = [] } = useQuery({
    queryKey: ["recetaServicio", servicio?.servicioCatalogoId],
    queryFn: () => window.api.serviciosCatalogo.listarReceta(servicio!.servicioCatalogoId),
    enabled: !!servicio?.servicioCatalogoId,
  });

  const [precio, setPrecio] = useState<number | null>(null);
  const [consumidos, setConsumidos] = useState<FilaProducto[]>([]);
  const recetaPrecargadaRef = useRef(false);

  useEffect(() => {
    if (recetaPrecargadaRef.current) return;
    if (receta.length === 0) return;
    recetaPrecargadaRef.current = true;
    setConsumidos(receta.map((r) => ({ productoId: r.productoId, cantidad: r.cantidadSugerida })));
  }, [receta]);
  const [vendidos, setVendidos] = useState<FilaProducto[]>([]);
  const [metodoPago, setMetodoPago] = useState("");
  const [monto, setMonto] = useState<number | null>(null);
  const [estatusPago, setEstatusPago] = useState<"pagado" | "parcial" | "pendiente" | "cancelado">(
    "pendiente",
  );
  const [observaciones, setObservaciones] = useState("");
  const [usarPin, setUsarPin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const precioEfectivo = precio ?? servicio?.precio ?? 0;
  const montoEfectivo = monto ?? precioEfectivo;

  const subirComprobante = useMutation({
    mutationFn: () => {
      if (!servicio?.carpetaPath) throw new Error("Aún no existe la carpeta del servicio.");
      return window.api.archivos.subirComprobante("servicio_realizado", servicio.id, servicio.carpetaPath);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abrirCierre", citaId] });
    },
  });

  const cerrar = useMutation({
    mutationFn: () => {
      if (!servicio) throw new Error("No se pudo abrir el servicio.");
      return window.api.serviciosRealizados.cerrarCita({
        servicioRealizadoId: servicio.id,
        precio: precioEfectivo,
        productosConsumidos: consumidos.filter((f) => f.productoId && f.cantidad > 0),
        productosVendidos: vendidos.filter((f) => f.productoId && f.cantidad > 0),
        metodoPago,
        monto: montoEfectivo,
        estatusPago,
        observaciones,
        pinOverride: usarPin ? pin : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["citas"] });
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo cerrar la cita."),
  });

  function agregarFila(lista: FilaProducto[], setLista: (f: FilaProducto[]) => void) {
    setLista([...lista, { productoId: "", cantidad: 1 }]);
  }
  function actualizarFila(
    lista: FilaProducto[],
    setLista: (f: FilaProducto[]) => void,
    index: number,
    cambios: Partial<FilaProducto>,
  ) {
    setLista(lista.map((f, i) => (i === index ? { ...f, ...cambios } : f)));
  }
  function quitarFila(lista: FilaProducto[], setLista: (f: FilaProducto[]) => void, index: number) {
    setLista(lista.filter((_, i) => i !== index));
  }

  if (!servicio) {
    return (
      <Modal open onClose={onClose} title="Cerrar cita">
        <p className="text-sm text-ink-500">Preparando el cierre...</p>
      </Modal>
    );
  }

  const puedeSubirComprobante = !!servicio.carpetaPath;
  const requiereMetodoPago = montoEfectivo > 0;
  const comprobanteResuelto = servicio.tieneComprobante || (usarPin && pin.length >= 4);
  const listoParaCerrar = comprobanteResuelto && (!requiereMetodoPago || !!metodoPago);

  const motivoBloqueo = !comprobanteResuelto
    ? "Sube el comprobante de pago o usa el PIN de acceso para continuar."
    : requiereMetodoPago && !metodoPago
      ? "Selecciona un método de pago para registrar el cobro."
      : null;

  return (
    <Modal open onClose={onClose} title={`Cerrar cita · ${servicio.clienteNombre}`}>
      <div className="flex flex-col gap-5">
        <div className="rounded-xl bg-beige-100 p-3 text-sm">
          <p className="font-medium text-ink-900">
            {servicio.servicioNombre} · {servicio.codigoServicio}
          </p>
          <p className="text-xs text-ink-500">{servicio.fecha}</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Precio del servicio</label>
          <NumberInput
            placeholder="0.00"
            value={precio ?? servicio.precio ?? 0}
            onValueChange={setPrecio}
          />
        </div>

        <ListaProductos
          titulo="Productos consumidos (insumos)"
          filas={consumidos}
          productos={productos}
          onAgregar={() => agregarFila(consumidos, setConsumidos)}
          onActualizar={(i, c) => actualizarFila(consumidos, setConsumidos, i, c)}
          onQuitar={(i) => quitarFila(consumidos, setConsumidos, i)}
        />

        <ListaProductos
          titulo="Productos vendidos (venta adicional)"
          filas={vendidos}
          productos={productos}
          onAgregar={() => agregarFila(vendidos, setVendidos)}
          onActualizar={(i, c) => actualizarFila(vendidos, setVendidos, i, c)}
          onQuitar={(i) => quitarFila(vendidos, setVendidos, i)}
        />

        <div>
          <h3 className="mb-2 text-sm font-semibold text-jacaranda-700">Pago</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">
                Método de pago {requiereMetodoPago && "*"}
              </label>
              <Select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                <option value="">Selecciona</option>
                {(config?.metodosPago ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Monto</label>
              <NumberInput placeholder="0.00" value={monto ?? precioEfectivo} onValueChange={setMonto} />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-ink-500">Estatus de pago</label>
            <div className="flex gap-2">
              {(["pagado", "parcial", "pendiente", "cancelado"] as const).map((op) => (
                <Button
                  key={op}
                  type="button"
                  size="sm"
                  variant={estatusPago === op ? "primary" : "secondary"}
                  onClick={() => setEstatusPago(op)}
                >
                  {op}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Observaciones</label>
          <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        <div className="rounded-xl border border-beige-300 p-3">
          <h3 className="mb-2 text-sm font-semibold text-jacaranda-700">Comprobante de pago</h3>
          {servicio.tieneComprobante ? (
            <div className="flex items-center justify-between">
              <Badge variant="success">Comprobante subido</Badge>
              {servicio.carpetaPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.api.carpetas.abrirCarpeta(servicio.carpetaPath!)}
                >
                  <FolderOpen size={14} /> Ver carpeta
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!puedeSubirComprobante || subirComprobante.isPending}
                onClick={() => subirComprobante.mutate()}
              >
                <Upload size={14} /> Subir comprobante
              </Button>
              <p className="text-xs text-ink-500">
                No se puede cerrar la cita sin comprobante, salvo con el PIN de acceso.
              </p>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={usarPin} onChange={(e) => setUsarPin(e.target.checked)} />
                Cerrar sin comprobante usando el PIN de acceso
              </label>
              {usarPin && (
                <Input
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN de acceso"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger-500">{error}</p>}
        {!error && motivoBloqueo && <p className="text-xs text-ink-500">{motivoBloqueo}</p>}

        <Button disabled={!listoParaCerrar || cerrar.isPending} onClick={() => cerrar.mutate()}>
          <Lock size={16} /> Cerrar cita
        </Button>
      </div>
    </Modal>
  );
}

function ListaProductos({
  titulo,
  filas,
  productos,
  onAgregar,
  onActualizar,
  onQuitar,
}: {
  titulo: string;
  filas: FilaProducto[];
  productos: { id: string; nombre: string }[];
  onAgregar: () => void;
  onActualizar: (index: number, cambios: Partial<FilaProducto>) => void;
  onQuitar: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jacaranda-700">{titulo}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAgregar}>
          <Plus size={14} /> Agregar
        </Button>
      </div>
      {filas.length === 0 && <p className="text-xs text-ink-500">Ninguno agregado.</p>}
      <div className="flex flex-col gap-2">
        {filas.map((fila, i) => (
          <div key={i} className="flex gap-2">
            <Select
              className="flex-1"
              value={fila.productoId}
              onChange={(e) => onActualizar(i, { productoId: e.target.value })}
            >
              <option value="">Selecciona un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
            <NumberInput
              className="w-24"
              placeholder="1"
              value={fila.cantidad}
              onValueChange={(v) => onActualizar(i, { cantidad: v ?? 1 })}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => onQuitar(i)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
