import { Clock3 } from "lucide-react";

export function HistoryPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-[var(--muted)]">
      <Clock3 size={24} strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium text-[var(--foreground)]">No request history</p>
      <p className="mt-1 text-xs">Completed requests will appear here.</p>
    </div>
  );
}
