import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Expandable } from "@/components/ui/expandable";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { NuevaCategoriaModal } from "@/components/catalogos/NuevaCategoriaModal";
import { NuevoProveedorModal } from "@/components/catalogos/NuevoProveedorModal";
import type { Producto } from "@shared/types";
import type { ProductoInput } from "@shared/schemas";

// Presentaciones y unidades comunes; "Otro" habilita un campo de texto libre.
const PRESENTACIONES = ["Bote", "Frasco", "Ampolleta", "Tubo", "Sobre", "Pieza"];
const UNIDADES = ["ml", "g", "pzas"];

const VACIO: ProductoInput = {
  nombre: "",
  linea: "",
  tipoProductoId: null,
  unidadMedida: "",
  proveedorPrincipalId: null,
  costoBase: 0,
  precioVenta: 0,
  stockMinimoManual: null,
  ubicacion: "",
  presentacion: "",
  contenidoCantidad: null,
  contenidoUnidad: "",
  modoConsumo: "pieza",
  activo: true,
  observaciones: "",
};

function desde(p: Producto): ProductoInput {
  return {
    nombre: p.nombre,
    linea: p.linea ?? "",
    tipoProductoId: p.tipoProductoId,
    unidadMedida: p.unidadMedida ?? "",
    proveedorPrincipalId: p.proveedorPrincipalId,
    costoBase: p.costoBase ?? 0,
    precioVenta: p.precioVenta ?? 0,
    stockMinimoManual: p.stockMinimoManual,
    ubicacion: p.ubicacion ?? "",
    presentacion: p.presentacion ?? "",
    contenidoCantidad: p.contenidoCantidad,
    contenidoUnidad: p.contenidoUnidad ?? "",
    modoConsumo: p.modoConsumo === "contenido" ? "contenido" : "pieza",
    activo: p.activo,
    observaciones: p.observaciones ?? "",
  };
}

/**
 * Formulario completo de producto en un modal, reutilizable tanto en Configuración > Productos
 * como en el alta rápida encadenada desde una entrada de inventario. Incluye "+" para crear
 * categoría o proveedor sin salir (modales apilados que autoseleccionan lo recién creado).
 */
export function ProductoFormModal({
  open,
  onClose,
  producto = null,
  onGuardado,
}: {
  open: boolean;
  onClose: () => void;
  producto?: Producto | null;
  onGuardado?: (p: Producto) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: tipos = [] } = useQuery({
    queryKey: ["tiposProducto"],
    queryFn: () => window.api.tiposProducto.listar(),
  });
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => window.api.proveedores.listar(),
  });

  const [form, setForm] = useState<ProductoInput>(producto ? desde(producto) : VACIO);
  const [presentacionOtro, setPresentacionOtro] = useState(
    () => !!producto?.presentacion && !PRESENTACIONES.includes(producto.presentacion),
  );
  const [unidadOtro, setUnidadOtro] = useState(
    () => !!producto?.contenidoUnidad && !UNIDADES.includes(producto.contenidoUnidad),
  );
  const [nuevaCategoria, setNuevaCategoria] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  // Se incrementa en cada apertura para re-montar el <form> (y con él los NumberInput/MoneyInput,
  // que guardan su propio texto interno) tras reinicializar el estado; así no arrastran cifras del
  // producto anterior.
  const [sesion, setSesion] = useState(0);

  // El modal se mantiene montado (para conservar su animación de salida), así que al abrirlo hay
  // que reinicializar el formulario con el producto en edición o en blanco.
  useEffect(() => {
    if (!open) return;
    setForm(producto ? desde(producto) : VACIO);
    setPresentacionOtro(!!producto?.presentacion && !PRESENTACIONES.includes(producto.presentacion));
    setUnidadOtro(!!producto?.contenidoUnidad && !UNIDADES.includes(producto.contenidoUnidad));
    setSesion((s) => s + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, producto?.id]);

  const tipoSel = tipos.find((t) => t.id === form.tipoProductoId);
  const categoriaConsume = tipoSel?.seConsumeEnServicio ?? false;
  const modoContenido = form.modoConsumo === "contenido";
  const contenidoFaltante =
    categoriaConsume && modoContenido && !(form.contenidoCantidad && form.contenidoCantidad > 0);

  const guardar = useMutation({
    mutationFn: async () => {
      // Si la categoría no se consume en servicios, el modo de consumo no aplica: se guarda como
      // "pieza" para no arrastrar un "contenido" oculto que el backend rechazaría sin contenido.
      const payload = { ...form, modoConsumo: categoriaConsume ? form.modoConsumo : ("pieza" as const) };
      if (producto) return window.api.productos.actualizar(producto.id, payload);
      return window.api.productos.crear(payload);
    },
    onSuccess: (creado) => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      toast.success(producto ? "Producto actualizado." : "Producto creado.");
      if (creado && onGuardado) onGuardado(creado);
      onClose();
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  const valuePresentacion = presentacionOtro ? "Otro" : form.presentacion || "";
  const valueUnidad = unidadOtro ? "Otro" : form.contenidoUnidad || "";

  return (
    <>
      <Modal open={open} onClose={onClose} title={producto ? "Editar producto" : "Nuevo producto"}>
        <form
          key={`${producto?.id ?? "nuevo"}-${sesion}`}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (contenidoFaltante) return;
            guardar.mutate();
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Datos generales</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Nombre *</label>
            <Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">SKU</label>
              <p className="flex h-10 items-center text-sm text-ink-500">
                {producto?.sku || "Se genera automáticamente"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Línea / marca</label>
              <Input value={form.linea ?? ""} onChange={(e) => setForm({ ...form, linea: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Categoría</label>
              <div className="flex gap-1.5">
                <Select
                  className="flex-1"
                  value={form.tipoProductoId ?? ""}
                  onChange={(e) => setForm({ ...form, tipoProductoId: e.target.value || null })}
                >
                  <option value="">Sin categoría</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombreTipo}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="px-2.5"
                  title="Nueva categoría"
                  onClick={() => setNuevaCategoria(true)}
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Proveedor principal</label>
              <div className="flex gap-1.5">
                <Select
                  className="flex-1"
                  value={form.proveedorPrincipalId ?? ""}
                  onChange={(e) => setForm({ ...form, proveedorPrincipalId: e.target.value || null })}
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
                  size="md"
                  className="px-2.5"
                  title="Nuevo proveedor"
                  onClick={() => setNuevoProveedor(true)}
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Precios</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Costo base</label>
              <MoneyInput
                placeholder="0.00"
                value={form.costoBase}
                onValueChange={(v) => setForm({ ...form, costoBase: v ?? 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Precio de venta</label>
              <MoneyInput
                placeholder="0.00"
                value={form.precioVenta}
                onValueChange={(v) => setForm({ ...form, precioVenta: v ?? 0 })}
              />
            </div>
          </div>

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Presentación</p>
          {/* La pieza en la que se cuenta el stock y, opcionalmente, su contenido. */}
          <div className="rounded-xl border border-beige-300 bg-beige-100/60 p-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Pieza</label>
                <Select
                  value={valuePresentacion}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "Otro") {
                      setPresentacionOtro(true);
                      setForm({ ...form, presentacion: "" });
                    } else {
                      setPresentacionOtro(false);
                      setForm({ ...form, presentacion: v });
                    }
                  }}
                >
                  <option value="">Sin definir</option>
                  {PRESENTACIONES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="Otro">Otro...</option>
                </Select>
                {presentacionOtro && (
                  <Input
                    className="mt-1.5"
                    placeholder="Ej. Vial"
                    value={form.presentacion ?? ""}
                    onChange={(e) => setForm({ ...form, presentacion: e.target.value })}
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Contenido</label>
                <NumberInput
                  allowNull
                  min={0}
                  step="0.01"
                  placeholder="Ej. 60"
                  value={form.contenidoCantidad ?? null}
                  onValueChange={(v) => setForm({ ...form, contenidoCantidad: v })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Unidad</label>
                <Select
                  value={valueUnidad}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "Otro") {
                      setUnidadOtro(true);
                      setForm({ ...form, contenidoUnidad: "" });
                    } else {
                      setUnidadOtro(false);
                      setForm({ ...form, contenidoUnidad: v });
                    }
                  }}
                >
                  <option value="">—</option>
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="Otro">Otro...</option>
                </Select>
                {unidadOtro && (
                  <Input
                    className="mt-1.5"
                    placeholder="Ej. oz"
                    value={form.contenidoUnidad ?? ""}
                    onChange={(e) => setForm({ ...form, contenidoUnidad: e.target.value })}
                  />
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              El stock siempre se cuenta en piezas (ej. "Bote"). El contenido es opcional y sirve para
              descontar por ml/g al usarse en un servicio.
            </p>
          </div>

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Inventario</p>
          {/* Modo de consumo: solo relevante si la categoría se consume en servicios. */}
          <Expandable open={categoriaConsume}>
            <div className="rounded-xl border border-jacaranda-200 bg-jacaranda-50/60 p-3">
              <label className="mb-1 block text-xs font-medium text-jacaranda-700">
                Al usarse en un servicio...
              </label>
              <Select
                value={form.modoConsumo}
                onChange={(e) => setForm({ ...form, modoConsumo: e.target.value as "pieza" | "contenido" })}
              >
                <option value="pieza">Se descuenta la pieza completa al usarse</option>
                <option value="contenido">Se descuenta por contenido usado (ml/g)</option>
              </Select>
              {contenidoFaltante && (
                <p className="mt-1.5 text-xs text-danger-500">
                  Para descontar por contenido necesitas definir el contenido de la pieza (ej. 60 ml)
                  arriba.
                </p>
              )}
            </div>
          </Expandable>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Stock mínimo manual</label>
              <NumberInput
                allowNull
                placeholder="Usar umbral general"
                value={form.stockMinimoManual ?? null}
                onValueChange={(v) => setForm({ ...form, stockMinimoManual: v })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Ubicación física</label>
              <Input value={form.ubicacion ?? ""} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Activo
          </label>
          <Button type="submit" disabled={guardar.isPending || contenidoFaltante} className="mt-2 w-full">
            Guardar
          </Button>
        </form>
      </Modal>

      <NuevaCategoriaModal
        open={nuevaCategoria}
        onClose={() => setNuevaCategoria(false)}
        onCreado={(tipo) => {
          setForm((f) => ({ ...f, tipoProductoId: tipo.id }));
          setNuevaCategoria(false);
        }}
      />
      <NuevoProveedorModal
        open={nuevoProveedor}
        onClose={() => setNuevoProveedor(false)}
        onCreado={(prov) => {
          setForm((f) => ({ ...f, proveedorPrincipalId: prov.id }));
          setNuevoProveedor(false);
        }}
      />
    </>
  );
}
