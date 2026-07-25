import { useState } from "react";
import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { ExportCsvTipo, MovimientosFiltro, ResumenFiltro } from "@shared/schemas";

interface BotonExportarCsvProps {
  tipo: ExportCsvTipo;
  filtro: ResumenFiltro | MovimientosFiltro;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
  /** Tooltip nativo (útil cuando el botón está deshabilitado). */
  title?: string;
}

/**
 * Botón "Exportar CSV" reutilizable: abre el diálogo nativo para guardar el archivo y muestra un
 * toast de éxito/error. Se usa en Reportes (detalle de la pestaña activa) e Inventario (stock y
 * movimientos).
 */
export function BotonExportarCsv({
  tipo,
  filtro,
  label = "Exportar CSV",
  variant = "secondary",
  size = "md",
  className,
  disabled,
  title,
}: BotonExportarCsvProps) {
  const toast = useToast();
  const [cargando, setCargando] = useState(false);

  async function exportar() {
    setCargando(true);
    try {
      const ok = await window.api.reportes.exportarCsv(tipo, filtro);
      if (ok) toast.success("Archivo exportado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || cargando}
      onClick={exportar}
      title={title}
    >
      <Download size={16} /> {label}
    </Button>
  );
}
