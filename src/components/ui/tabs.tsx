import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: { value: string; label: string }[];
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
            "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === tab.value
              ? "border-jacaranda-600 text-jacaranda-700"
              : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
