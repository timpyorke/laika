import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useAppStore } from "../../store/use-app-store";
import type { ExtractionSource, VariableExtraction } from "../../types/testing";

const sources: Array<{ value: ExtractionSource; label: string }> = [
  { value: "status", label: "Status code" },
  { value: "header", label: "Response header" },
  { value: "jsonPath", label: "JSON path" },
];

const selectClass = "h-8 min-w-0 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[12.5px]";

export function ExtractionEditor() {
  const extractions = useAppStore((state) => state.draft.extractions);
  const setExtractions = useAppStore((state) => state.setExtractions);
  const update = (id: string, patch: Partial<VariableExtraction>) => setExtractions(extractions.map((item) => item.id === id ? { ...item, ...patch } : item));
  const add = () => setExtractions([...extractions, { id: crypto.randomUUID(), source: "jsonPath", target: "", variableName: "", isSecret: false }]);

  return <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 panel-scroll">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="font-display text-[13.5px] font-semibold">Response chaining</h3>
        <p className="mt-1 text-[11.5px] text-[var(--muted)]">Capture a value from this request&apos;s response into a variable that later requests in the same collection run can use as <code>{"{{variableName}}"}</code>. The value only lasts for that one run.</p>
      </div>
      <Button type="button" size="sm" onClick={add}><Plus size={14} /> Add extraction</Button>
    </div>
    {extractions.length === 0 ? <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border)] p-8 text-center text-[12.5px] text-[var(--muted)]">No extractions yet. Add one to feed this request&apos;s response into a later request.</div> : <div className="grid gap-2">
      {extractions.map((extraction, index) => {
        const needsTarget = extraction.source === "header" || extraction.source === "jsonPath";
        return <fieldset key={extraction.id} className="grid min-w-0 grid-cols-2 gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] p-2 2xl:grid-cols-[minmax(120px,0.9fr)_minmax(130px,1fr)_minmax(120px,1fr)_auto_32px]">
          <legend className="sr-only">Extraction {index + 1}</legend>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Source<select aria-label={`Extraction ${index + 1} source`} className={selectClass} value={extraction.source} onChange={(event) => update(extraction.id, { source: event.target.value as ExtractionSource })}>{sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Target<Input aria-label={`Extraction ${index + 1} target`} disabled={!needsTarget} value={extraction.target} placeholder={extraction.source === "jsonPath" ? "$.data.token" : extraction.source === "header" ? "Authorization" : "Not required"} onChange={(event) => update(extraction.id, { target: event.target.value })} /></label>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Variable name<Input aria-label={`Extraction ${index + 1} variable name`} value={extraction.variableName} placeholder="authToken" onChange={(event) => update(extraction.id, { variableName: event.target.value })} /></label>
          <label className="flex items-center gap-1 self-end pb-1.5 text-[11px] text-[var(--muted)]"><input type="checkbox" checked={extraction.isSecret} onChange={(event) => update(extraction.id, { isSecret: event.target.checked })} /> Secret</label>
          <Button type="button" variant="ghost" size="icon" className="col-span-2 justify-self-end 2xl:col-span-1 2xl:mt-5 2xl:justify-self-auto" aria-label={`Remove extraction ${index + 1}`} onClick={() => setExtractions(extractions.filter((item) => item.id !== extraction.id))}><Trash2 size={14} /></Button>
        </fieldset>;
      })}
    </div>}
  </div>;
}
