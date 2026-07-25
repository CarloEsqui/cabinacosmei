import { cn } from "@/lib/utils";

interface TabsProps {
  /** `badge`: número de pendientes que requieren atención; con > 0 se muestra un globito. */
  tabs: { value: string; label: string; badge?: number }[];
  value: string;
  onChange: (value: string) => void;
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-beige-300 px-8">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === tab.value
              ? "border-jacaranda-600 text-jacaranda-700"
              : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-beige-50">
              {tab.badge > 99 ? "99+" : tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
