import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 text-[12.5px] text-[var(--foreground)] placeholder:text-[var(--faint)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
