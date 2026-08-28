import { Clock3, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Input } from "../../components/ui/input";
import { formatRelativeTime, methodColor } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/use-app-store";
import type { HistorySummary } from "../../types/workspace";

function statusColor(entry: HistorySummary): string {
  if (entry.status === null) return "text-[var(--danger)]";
  if (entry.status >= 500) return "text-[var(--danger)]";
  if (entry.status >= 400) return "text-[#b36a08] dark:text-[#fbbf24]";
  return "text-[#16834b] dark:text-[#4ade80]";
}

export function HistoryPanel() {
  const history = useAppStore((state) => state.history);
  const historySearch = useAppStore((state) => state.historySearch);
  const historyLoading = useAppStore((state) => state.historyLoading);
  const setHistorySearch = useAppStore((state) => state.setHistorySearch);
  const openHistoryEntry = useAppStore((state) => state.openHistoryEntry);
  const deleteHistoryEntry = useAppStore((state) => state.deleteHistoryEntry);
  const clearHistory = useAppStore((state) => state.clearHistory);

  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3 py-3">
        <label className="relative block min-w-0 flex-1">
          <Search className="absolute left-2.5 top-2.5 text-[var(--muted)]" size={15} />
          <Input
            className="w-full pl-8"
            placeholder="Search history"
            aria-label="Search history"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Clear all history"
          title="Clear all history"
          disabled={history.length === 0}
          onClick={() => setConfirmingClear(true)}
        >
          <Trash2 size={15} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3 panel-scroll">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-[var(--muted)]">
            <Clock3 size={24} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
              {historyLoading ? "Loading history…" : historySearch.trim() === "" ? "No request history" : "No matching entries"}
            </p>
            <p className="mt-1 text-xs">
              {historySearch.trim() === "" ? "Completed requests will appear here." : "Try a different name or URL."}
            </p>
          </div>
        ) : (
          <ul>
            {history.map((entry) => (
              <li key={entry.id} className="group flex items-center gap-1 pl-1.5 pr-1.5">
                <button
                  type="button"
                  onClick={() => void openHistoryEntry(entry.id)}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-muted)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("w-11 shrink-0 text-[10px] font-bold", methodColor[entry.method])}>{entry.method}</span>
                    <span className="truncate text-sm">{entry.name}</span>
                  </span>
                  {/* Unsaved requests all record as "Untitled request", so the URL
                      is what actually distinguishes one entry from another. */}
                  <span className="w-full truncate pl-[52px] font-mono text-xs text-[var(--muted)]" title={entry.url}>
                    {entry.url}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 pl-[52px] text-xs text-[var(--muted)]">
                    <span className={cn("shrink-0 font-medium", statusColor(entry))}>
                      {entry.status ?? entry.errorCode?.replace(/_/g, " ").toLowerCase() ?? "failed"}
                    </span>
                    {entry.elapsedMs === null ? null : <span className="shrink-0">{entry.elapsedMs} ms</span>}
                    <span className="ml-auto shrink-0">{formatRelativeTime(entry.createdAt)}</span>
                  </span>
                </button>
                <Button
                  variant="danger"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Delete history entry for ${entry.method} ${entry.url}`}
                  onClick={() => void deleteHistoryEntry(entry.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmingClear}
        title="Clear all history?"
        description="Every history entry in this workspace is deleted. Saved requests and collections are not affected."
        confirmLabel="Clear history"
        onConfirm={() => void clearHistory()}
        onOpenChange={setConfirmingClear}
      />
    </div>
  );
}
