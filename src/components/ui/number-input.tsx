import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";

interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Si es false (default), un campo vacío se convierte en 0 en vez de null. */
  allowNull?: boolean;
}

/**
 * Input numérico que mantiene su propio texto en estado local, en vez de recibir el `value`
 * numérico del padre en cada tecleo. Esto evita el bug clásico de React donde un "0" inicial
 * queda pegado en pantalla (ej. "0100") porque el valor numérico redondeado pelea con lo que el
 * usuario está escribiendo. Para forzar una resincronización (ej. al abrir el modal con otro
 * registro), el padre debe pasar una prop `key` distinta.
 */
export function NumberInput({ value, onValueChange, allowNull = false, onFocus, ...props }: NumberInputProps) {
  const [texto, setTexto] = useState(value === null || value === undefined ? "" : String(value));

  return (
    <Input
      type="number"
      value={texto}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        // Quita ceros a la izquierda que sobran de un valor preestablecido (ej. "0" + teclear "1"
        // produce "01" en vez de reemplazar), sin tocar "0" solo ni decimales como "0.5".
        const t = e.target.value.replace(/^(-?)0+(?=\d)/, "$1");
        setTexto(t);
        if (t === "" || t === "-") {
          onValueChange(allowNull ? null : 0);
          return;
        }
        const n = Number(t);
        if (!Number.isNaN(n)) onValueChange(n);
      }}
      {...props}
    />
  );
}
