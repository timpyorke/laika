import { Check, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { KeyValueEntry } from "../../types/http";
import { cn } from "../../lib/utils";

interface KeyValueTableProps {
  rows: KeyValueEntry[];
  keyPlaceholder: string;
  /** Footer label, e.g. "Add param". */
  addLabel: string;
  /** Mono note pinned to the right of the footer bar. */
  hint?: ReactNode;
  onChange: (id: string, patch: Partial<KeyValueEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

const cellKey = "w-[190px] shrink-0 max-[900px]:w-[120px]";
const cellAction = "flex w-[34px] shrink-0 items-center justify-center";
const cellToggle = "flex w-[30px] shrink-0 items-center justify-center";

/**
 * Dense request table: 28px header, 30px rows, hairline rules, and a ghost
 * trailing row that turns into a real one as soon as it is typed into.
 */
export function KeyValueTable({ rows, keyPlaceholder, addLabel, hint, onChange, onAdd, onRemove }: KeyValueTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] label-caps">
        <span className={cellToggle} />
        <span className={cellKey}>Key</span>
        <span className="min-w-0 flex-1">Value</span>
        <span className={cellAction} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto panel-scroll">
        {rows.map((row) => (
          <div className="flex h-[30px] items-center border-b border-[var(--border-subtle)] font-mono text-[12px]" key={row.id}>
            <label className={cn(cellToggle, "h-full cursor-pointer")}>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={row.enabled}
                onChange={(event) => onChange(row.id, { enabled: event.target.checked })}
                aria-label={`Enable ${row.key || keyPlaceholder}`}
              />
              <span
                className={cn(
                  "flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-[var(--focus)]",
                  row.enabled ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]" : "border-[var(--border-strong)]",
                )}
              >
                {row.enabled ? <Check size={9} strokeWidth={3.4} /> : null}
              </span>
            </label>
            <input
              className={cn(cellKey, "h-full min-w-0 border-0 bg-transparent text-[var(--code-key)] outline-none placeholder:text-[var(--fainter)] focus:bg-[var(--surface-muted)]")}
              value={row.key}
              onChange={(event) => onChange(row.id, { key: event.target.value })}
              placeholder={keyPlaceholder}
              aria-label={keyPlaceholder}
              spellCheck={false}
            />
            <input
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-[var(--foreground)] outline-none placeholder:text-[var(--fainter)] focus:bg-[var(--surface-muted)]"
              value={row.value}
              onChange={(event) => onChange(row.id, { value: event.target.value })}
              placeholder="Value"
              aria-label={`${keyPlaceholder} value`}
              spellCheck={false}
            />
            <button
              type="button"
              className={cn(cellAction, "h-full cursor-pointer text-[var(--fainter)] hover:text-[var(--danger)]")}
              onClick={() => onRemove(row.id)}
              aria-label="Remove row"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {/* Decorative next-row affordance; the labelled control lives in the footer. */}
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="flex h-[30px] w-full cursor-pointer items-center border-b border-[var(--border-subtle)] text-left font-mono text-[12px] text-[var(--fainter)] hover:bg-[var(--surface-muted)]"
          onClick={onAdd}
        >
          <span className={cellToggle}>
            <span className="h-[13px] w-[13px] rounded-[3px] border border-dashed border-[var(--border-strong)]" />
          </span>
          <span className={cellKey}>{keyPlaceholder}</span>
          <span className="min-w-0 flex-1">Value</span>
          <span className={cellAction} />
        </button>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-3.5 border-t border-[var(--border)] bg-[var(--surface)] px-3 text-[11.5px] text-[var(--muted-dim)]">
        <button type="button" className="flex cursor-pointer items-center gap-1.5 text-[var(--foreground-soft)] hover:text-[var(--foreground)]" onClick={onAdd}>
          <Plus size={12} /> {addLabel}
        </button>
        {hint ? <span className="ml-auto truncate font-mono text-[11px]">{hint}</span> : null}
      </div>
    </div>
  );
}
