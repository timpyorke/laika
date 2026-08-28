import { Plus, Trash2 } from "lucide-react";
import type { KeyValueEntry } from "../../types/http";
import { Button } from "./button";
import { Input } from "./input";

interface KeyValueTableProps {
  rows: KeyValueEntry[];
  keyPlaceholder: string;
  onChange: (id: string, patch: Partial<KeyValueEntry>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

export function KeyValueTable({ rows, keyPlaceholder, onChange, onAdd, onRemove }: KeyValueTableProps) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-[32px_minmax(120px,1fr)_minmax(140px,1.3fr)_32px] gap-2 border-b border-[var(--border)] pb-2 text-xs font-medium uppercase text-[var(--muted)] max-[700px]:grid-cols-[24px_minmax(72px,1fr)_minmax(88px,1.3fr)_28px] max-[700px]:gap-1">
        <span /><span>Key</span><span>Value</span><span />
      </div>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div className="grid grid-cols-[32px_minmax(120px,1fr)_minmax(140px,1.3fr)_32px] items-center gap-2 max-[700px]:grid-cols-[24px_minmax(72px,1fr)_minmax(88px,1.3fr)_28px] max-[700px]:gap-1" key={row.id}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={row.enabled}
              onChange={(event) => onChange(row.id, { enabled: event.target.checked })}
              aria-label={`Enable ${row.key || keyPlaceholder}`}
            />
            <Input value={row.key} onChange={(event) => onChange(row.id, { key: event.target.value })} placeholder={keyPlaceholder} aria-label={keyPlaceholder} />
            <Input value={row.value} onChange={(event) => onChange(row.id, { value: event.target.value })} placeholder="Value" aria-label={`${keyPlaceholder} value`} />
            <Button className="max-[700px]:w-7" type="button" variant="ghost" size="icon" onClick={() => onRemove(row.id)} aria-label="Remove row">
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" className="mt-3" variant="secondary" size="sm" onClick={onAdd}>
        <Plus size={14} /> Add row
      </Button>
    </div>
  );
}
