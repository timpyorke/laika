import { Group, Panel, Separator, type GroupProps } from "react-resizable-panels";
import { cn } from "../../lib/utils";

export const ResizablePanel = Panel;

export function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}

/**
 * 5px gutter in the chrome colour with a three-dot grip, matching the splitter
 * between the request and response panes in the design.
 */
export function ResizableHandle({ className }: { className?: string }) {
  return (
    <Separator
      className={cn(
        "group relative z-10 flex w-[5px] shrink-0 cursor-col-resize items-center justify-center border-x border-[var(--border)] bg-[var(--surface)] outline-none transition-colors hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)]",
        "aria-[orientation=horizontal]:h-[5px] aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:border-x-0 aria-[orientation=horizontal]:border-y",
        className,
      )}
    >
      <span className="flex flex-col gap-[3px] group-aria-[orientation=horizontal]:flex-row group-hover:opacity-0">
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-strong)]" />
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-strong)]" />
        <span className="h-[3px] w-[3px] rounded-full bg-[var(--border-strong)]" />
      </span>
    </Separator>
  );
}
