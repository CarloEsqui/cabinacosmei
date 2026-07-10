import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b border-beige-300 bg-beige-50 px-8 py-5 shadow-sm shadow-ink-900/[0.03]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-jacaranda-700">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
