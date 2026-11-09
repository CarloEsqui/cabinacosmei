import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { PuntoDeVenta, type InicioVenta } from "@/components/ventas/PuntoDeVenta";
import { ListaVentas } from "@/components/ventas/ListaVentas";
import { PorCobrar } from "@/components/ventas/PorCobrar";
import type { EstadoRepetirVenta } from "@/components/ventas/VentaDetalleModal";

/**
 * Módulo Ventas (spec de la venta, §23): vender productos sin cita, el historial y lo que las
 * clientas deben de sus compras. Se llega desde el menú y desde los atajos "Vender producto" de
 * Inicio, Inventario y la ficha de la clienta (`?cliente=`), o con "Repetir venta" (state).
 */
export function VentasPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const repetirId = (location.state as EstadoRepetirVenta | null)?.repetir ?? null;
  const clienteParam = searchParams.get("cliente");
  const [tab, setTab] = useState("vender");

  // Un atajo (clienta o repetir) siempre aterriza en "Vender", aunque la página ya estuviera abierta.
  useEffect(() => {
    if (repetirId || clienteParam) setTab("vender");
  }, [location.key, repetirId, clienteParam]);

  const { data: porCobrar = [] } = useQuery({
    queryKey: ["ventas", "porCobrar"],
    queryFn: () => window.api.ventas.porCobrar(),
  });

  const tabs = [
    { value: "vender", label: "Vender" },
    { value: "historial", label: "Historial" },
    { value: "porCobrar", label: "Por cobrar", badge: porCobrar.length },
  ];

  return (
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      <PageHeader title="Ventas" subtitle="Venta de productos sin cita, historial y saldos por cobrar" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {/* El punto de venta se queda montado al cambiar de pestaña: el carrito no se pierde. */}
      <div className={tab === "vender" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <Vender repetirId={repetirId} clienteId={clienteParam} atajo={repetirId || clienteParam ? location.key : null} />
      </div>
      {tab === "historial" && <ListaVentas onVender={() => setTab("vender")} />}
      {tab === "porCobrar" && <PorCobrar ventas={porCobrar} />}
    </div>
  );
}

/**
 * Arma el inicio del carrito que trae un atajo. Para "Repetir venta" espera la venta original y el
 * catálogo: cada producto se repite con su precio actual de catálogo (o el de aquella venta si ya no
 * tiene precio). El punto de venta nunca se remonta (VMD-B2): aplica cada atajo una vez y, si ya hay
 * productos en el carrito, pregunta antes de reemplazarlo.
 */
function Vender({ repetirId, clienteId, atajo }: { repetirId: string | null; clienteId: string | null; atajo: string | null }) {
  const { data: original } = useQuery({
    queryKey: ["ventaDetalle", repetirId],
    queryFn: () => window.api.ventas.detalle(repetirId!),
    enabled: !!repetirId,
  });
  const { data: productos } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
  });
  const { data: clientes } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });

  const listo = !repetirId || (!!original && !!productos && !!clientes);
  const inicio = useMemo<InicioVenta | undefined>(() => {
    if (repetirId && original && productos && clientes) {
      const activa = original.clienteId && clientes.some((c) => c.id === original.clienteId && c.activo);
      return {
        clienteId: activa ? original.clienteId! : undefined,
        nombreReferencia: original.clienteId ? undefined : (original.nombreReferencia ?? undefined),
        lineas: original.lineas
          .filter((l) => productos.some((p) => p.id === l.productoId && p.activo))
          .reduce<NonNullable<InicioVenta["lineas"]>>((acc, l) => {
            // Una línea partida en dos precios se vuelve a juntar en una.
            const previa = acc.find((x) => x.productoId === l.productoId);
            if (previa) {
              previa.cantidad = (previa.cantidad ?? 0) + l.cantidad;
              return acc;
            }
            const actual = productos.find((p) => p.id === l.productoId)?.precioVenta;
            return [...acc, { productoId: l.productoId, cantidad: l.cantidad, precioUnitario: actual && actual > 0 ? actual : l.precioUnitario }];
          }, []),
      };
    }
    if (clienteId) return { clienteId };
    return undefined;
  }, [repetirId, original, productos, clientes, clienteId]);

  return <PuntoDeVenta inicio={atajo && listo ? inicio : undefined} inicioId={atajo && listo ? atajo : null} />;
}
