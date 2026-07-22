import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Si es false (default), un campo vacío se convierte en 0 en vez de null. */
  allowNull?: boolean;
}

const formateador = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatear(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return formateador.format(n);
}

/**
 * Campo de dinero: muestra "$1,234.50" cuando está en reposo y un número plano y editable
 * mientras se escribe. El símbolo "$" es un prefijo fijo; el input guarda su propio texto para no
 * pelear con el valor numérico del padre (mismo motivo que NumberInput). Al enfocar selecciona
 * todo el contenido para poder reemplazar un valor preestablecido de un tirón.
 */
export function MoneyInput({
  value,
  onValueChange,
  allowNull = false,
  className,
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [enfocado, setEnfocado] = useState(false);
  const [texto, setTexto] = useState(value === null || value === undefined ? "" : String(value));

  // En reposo mostramos el formato con separador de miles; al escribir, el texto crudo.
  const mostrado = enfocado ? texto : formatear(value);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
        $
      </span>
      <Input
        type="text"
        inputMode="decimal"
        className={cn("pl-6 tabular-nums", className)}
        value={mostrado}
        onFocus={(e) => {
          const el = e.currentTarget;
          setTexto(value === null || value === undefined ? "" : String(value));
          setEnfocado(true);
          // Tras el re-render (el texto cambia de formateado a crudo) seleccionamos todo.
          requestAnimationFrame(() => el.select());
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setEnfocado(false);
          onBlur?.(e);
        }}
        onChange={(e) => {
          // Solo dígitos y un punto decimal; quita ceros a la izquierda sobrantes.
          let t = e.target.value.replace(/[^0-9.]/g, "");
          const partes = t.split(".");
          if (partes.length > 2) t = `${partes[0]}.${partes.slice(1).join("")}`;
          t = t.replace(/^0+(?=\d)/, "");
          setTexto(t);
          if (t === "" || t === ".") {
            onValueChange(allowNull ? null : 0);
            return;
          }
          const n = Number(t);
          if (!Number.isNaN(n)) onValueChange(n);
        }}
        {...props}
      />
    </div>
  );
}
