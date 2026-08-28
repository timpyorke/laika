import { GripVertical } from "lucide-react";
import { Group, Panel, Separator, type GroupProps } from "react-resizable-panels";
import { cn } from "../../lib/utils";

export const ResizablePanel = Panel;

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}

export function ResizableHandle({ className }: { className?: string }) {
  return (
    <Separator
      className={cn(
        "group relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center bg-[var(--border)] outline-none transition-colors hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] aria-[orientation=horizontal]:h-1 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize",
        className,
      )}
    >
      <span className="absolute flex h-7 w-3 items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--surface)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-aria-[orientation=horizontal]:h-3 group-aria-[orientation=horizontal]:w-7">
        <GripVertical className="group-aria-[orientation=horizontal]:rotate-90" size={10} />
      </span>
    </Separator>
  );
}
