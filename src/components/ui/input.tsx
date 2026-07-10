import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-beige-300 bg-beige-50 px-3 text-sm text-ink-900",
        "placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-jacaranda-400",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
