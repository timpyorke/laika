import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--accent)] px-4 font-semibold text-[var(--accent-fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-[var(--accent-hover)]",
        secondary: "border-[var(--border-strong)] bg-transparent px-3 text-[var(--foreground-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
        ghost: "border-transparent bg-transparent px-2 text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
        danger: "border-transparent bg-transparent px-2 text-[var(--danger)] hover:bg-[var(--danger-soft)]",
      },
      size: { default: "h-8", sm: "h-7 px-2.5 text-[11.5px]", icon: "h-7 w-7 p-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/**
 * Monospace keyboard hint tucked inside a button, e.g. Send ⌘↵. Hidden from the
 * accessibility tree so the button keeps its plain name — the shortcut is
 * announced via `aria-keyshortcuts` instead.
 */
export function KeyHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span aria-hidden="true" className={cn("font-mono text-[10px] opacity-70", className)}>{children}</span>;
}
