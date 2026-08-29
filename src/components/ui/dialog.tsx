import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  /** Mono chip beside the title, e.g. "4 environments · 1 active". */
  meta?: ReactNode;
  children: ReactNode;
}

export function DialogContent({ className, title, description, meta, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(5,10,20,0.66)] backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-3 pr-12">
          <DialogPrimitive.Title className="font-display text-[14.5px] font-semibold">{title}</DialogPrimitive.Title>
          {meta ? <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--faint)]">{meta}</span> : null}
        </div>
        {description ? (
          <DialogPrimitive.Description className="px-3.5 pt-3 text-[12px] leading-relaxed text-[var(--muted)]">{description}</DialogPrimitive.Description>
        ) : null}
        <div className="p-3.5">{children}</div>
        <DialogPrimitive.Close asChild>
          <Button className="absolute right-3 top-2.5 border border-[var(--border)]" variant="ghost" size="icon" aria-label="Close dialog">
            <X size={13} />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
