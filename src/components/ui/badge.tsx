import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-beige-200 text-ink-700",
      jacaranda: "bg-jacaranda-100 text-jacaranda-700",
      success: "bg-success-500/15 text-success-500",
      warning: "bg-warning-500/15 text-warning-500",
      danger: "bg-danger-500/15 text-danger-500",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function semaforoVariant(semaforo: "critico" | "bajo" | "adecuado") {
  if (semaforo === "critico") return "danger" as const;
  if (semaforo === "bajo") return "warning" as const;
  return "success" as const;
}
