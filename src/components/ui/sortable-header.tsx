import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<T extends string> {
  label: string;
  sortKey: T;
  activo: T | null;
  direccion: "asc" | "desc";
  onSort: (key: T) => void;
  className?: string;
}

export function SortableHeader<T extends string>({
  label,
  sortKey,
  activo,
  direccion,
  onSort,
  className,
}: SortableHeaderProps<T>) {
  const esActivo = activo === sortKey;
  const Icon = esActivo ? (direccion === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={cn("px-4 py-2", className)}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-ink-900",
          esActivo && "text-jacaranda-700",
        )}
      >
        {label}
        <Icon size={12} />
      </button>
    </th>
  );
}
