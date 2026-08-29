import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex h-[34px] shrink-0 items-stretch gap-[18px] overflow-hidden border-b border-[var(--border)] px-3", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]",
        "data-[state=active]:font-medium data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-[inset_0_-2px_0_var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("min-h-0 flex-1", className)} {...props} />;
}

/**
 * Count pill beside a tab label. `active` inverts it so the selected tab's
 * count reads as a filled chip rather than a recessed one.
 */
export function TabBadge({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px font-mono text-[10px] leading-[14px]",
        active ? "bg-[var(--success)] text-[var(--background)]" : "bg-[var(--surface-muted)] text-[var(--muted)]",
      )}
    >
      {children}
    </span>
  );
}

/** Small dot used where a tab reports state rather than a count (e.g. Auth). */
export function TabDot({ color }: { color: string }) {
  return <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />;
}

/**
 * Segmented control — Pretty/Raw, body modes, and anywhere the design shows a
 * recessed track with one raised segment.
 */
export function SegmentedControl({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex h-6 items-center rounded-md bg-[var(--surface-muted)] p-0.5 text-[11px]", className)} {...props} />;
}

export function SegmentedItem({ active, className, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex h-full cursor-pointer items-center rounded px-2.5 text-[var(--muted)] transition-colors",
        active && "bg-[var(--segment-active)] font-medium text-[var(--foreground)] shadow-[0_0_0_1px_var(--segment-active-ring)]",
        className,
      )}
      {...props}
    />
  );
}
