import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--accent)] px-3 text-white hover:bg-[var(--accent-hover)] dark:text-[#10201e]",
        secondary: "border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
        ghost: "border-transparent bg-transparent px-2 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
        danger: "border-transparent bg-transparent px-2 text-[var(--danger)] hover:bg-red-500/10",
      },
      size: { default: "h-9", sm: "h-8 text-xs", icon: "h-8 w-8 p-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
