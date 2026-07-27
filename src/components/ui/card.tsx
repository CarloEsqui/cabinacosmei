import type { ComponentType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-beige-300 bg-beige-50 shadow-sm shadow-ink-900/5",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between px-5 pt-5", className)} {...props} />;
}

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Icono de marca (lucide) para el header de card estándar §3. Al pasarlo, el título adopta el
   * lenguaje canónico: icono 16px en jacaranda-500 + texto en tinta (text-ink-900). Sin icono se
   * conserva el estilo heredado (jacaranda-700) por compatibilidad con los usos existentes; las
   * otras olas migran al estándar simplemente añadiendo `icon`.
   */
  icon?: ComponentType<{ size?: number; className?: string }>;
}

export function CardTitle({ className, icon: Icon, children, ...props }: CardTitleProps) {
  if (Icon) {
    return (
      <h3
        className={cn("flex items-center gap-2 text-sm font-semibold text-ink-900", className)}
        {...props}
      >
        <Icon size={16} className="shrink-0 text-jacaranda-500" />
        {children}
      </h3>
    );
  }
  return (
    <h3 className={cn("font-semibold text-jacaranda-700", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 pt-3", className)} {...props} />;
}
