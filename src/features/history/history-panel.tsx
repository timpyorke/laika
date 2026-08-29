import { Clock3, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Input } from "../../components/ui/input";
import { formatRelativeTime, methodColor, methodLabel } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/use-app-store";
import type { HistorySummary } from "../../types/workspace";

function statusColor(entry: HistorySummary): string {
  if (entry.status === null) return "text-[var(--status-server)]";
  if (entry.status >= 500) return "text-[var(--status-server)]";
  if (entry.status >= 400) return "text-[var(--status-client)]";
  if (entry.status >= 300) return "text-[var(--status-redirect)]";
  return "text-[var(--status-success)]";
}

/** Failures show the error code where a status would be, matching the design. */
function statusLabel(entry: HistorySummary): string {
  if (entry.status !== null) return String(entry.status);
  return "ERR";
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
      <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] p-2">
        <label className="relative block min-w-0 flex-1">
          <Search className="absolute left-2 top-[9px] text-[var(--faint)]" size={12} aria-hidden="true" />
          <Input
            className="h-7 w-full pl-7 text-[11.5px]"
            placeholder="Search history"
            aria-label="Search history"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear all history"
          title="Clear all history"
          disabled={history.length === 0}
          onClick={() => setConfirmingClear(true)}
        >
          <Trash2 size={13} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto panel-scroll">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 px-5 py-12 text-center">
            <Clock3 size={24} strokeWidth={1.4} className="text-[var(--border-strong)]" aria-hidden="true" />
            <p className="text-[12px] font-medium text-[var(--muted)]">
              {historyLoading ? "Loading history…" : historySearch.trim() === "" ? "No request history" : "No matching entries"}
            </p>
            <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
              {historySearch.trim() === "" ? "Every run is written here automatically and kept on this PC." : "Try a different name or URL."}
            </p>
          </div>
        ) : (
          <ul>
            {history.map((entry) => (
              <li key={entry.id} className="group relative border-b border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => void openHistoryEntry(entry.id)}
                  className="flex w-full min-w-0 cursor-pointer flex-col gap-[3px] px-2.5 py-1.5 pr-7 text-left hover:bg-[var(--surface-muted)]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("shrink-0 font-mono text-[10px] font-semibold", methodColor[entry.method])}>{methodLabel[entry.method]}</span>
                    <span className={cn("shrink-0 font-mono text-[10.5px] font-semibold", statusColor(entry))}>{statusLabel(entry)}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--fainter)]">{formatRelativeTime(entry.createdAt)}</span>
                  </span>
                  <span className="w-full truncate font-mono text-[11px] text-[var(--foreground-soft)]" title={entry.url}>
                    {entry.url}
                  </span>
                  <span className="flex w-full min-w-0 items-center gap-2 font-mono text-[10px] text-[var(--faint)]">
                    <span className="min-w-0 truncate">{entry.name}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {entry.errorCode ? <span className="text-[var(--status-server)]">{entry.errorCode}</span> : null}
                      {entry.elapsedMs === null ? null : <span>{entry.elapsedMs} ms</span>}
                    </span>
                  </span>
                </button>
                <Button
                  variant="danger"
                  size="icon"
                  className="absolute right-0.5 top-1.5 h-6 w-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Delete history entry for ${entry.method} ${entry.url}`}
                  onClick={() => void deleteHistoryEntry(entry.id)}
                >
                  <Trash2 size={12} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex h-8 shrink-0 items-center border-t border-[var(--border)] px-2.5 text-[11.5px] text-[var(--muted-dim)]">
        <span>{history.length} {history.length === 1 ? "entry" : "entries"}</span>
        <span className="ml-auto font-mono text-[10.5px] text-[var(--fainter)]">stored locally</span>
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
