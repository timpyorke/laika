import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useAppStore } from "../../store/use-app-store";
import type { AssertionKind, AssertionOperator, RequestAssertion } from "../../types/testing";

const kinds: Array<{ value: AssertionKind; label: string }> = [
  { value: "status", label: "Status code" },
  { value: "header", label: "Response header" },
  { value: "jsonPath", label: "JSON path" },
  { value: "responseTime", label: "Response time" },
];

const operators: Record<AssertionKind, Array<{ value: AssertionOperator; label: string }>> = {
  status: [{ value: "equals", label: "equals" }, { value: "notEquals", label: "does not equal" }, { value: "lessThan", label: "less than" }, { value: "greaterThan", label: "greater than" }],
  header: [{ value: "exists", label: "exists" }, { value: "notExists", label: "does not exist" }, { value: "equals", label: "equals" }, { value: "contains", label: "contains" }],
  jsonPath: [{ value: "exists", label: "exists" }, { value: "notExists", label: "does not exist" }, { value: "equals", label: "equals" }, { value: "contains", label: "contains" }],
  responseTime: [{ value: "lessThan", label: "less than" }, { value: "lessThanOrEqual", label: "at most" }, { value: "greaterThan", label: "greater than" }],
};

const defaults: Record<AssertionKind, Pick<RequestAssertion, "operator" | "target" | "expected">> = {
  status: { operator: "equals", target: "", expected: "200" },
  header: { operator: "exists", target: "Content-Type", expected: "" },
  jsonPath: { operator: "exists", target: "$.data", expected: "" },
  responseTime: { operator: "lessThan", target: "", expected: "1000" },
};

const selectClass = "h-8 min-w-0 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[12.5px]";

export function AssertionEditor() {
  const assertions = useAppStore((state) => state.draft.assertions);
  const setAssertions = useAppStore((state) => state.setAssertions);
  const update = (id: string, patch: Partial<RequestAssertion>) => setAssertions(assertions.map((item) => item.id === id ? { ...item, ...patch } : item));
  const changeKind = (id: string, kind: AssertionKind) => update(id, { kind, ...defaults[kind] });
  const add = () => setAssertions([...assertions, { id: crypto.randomUUID(), kind: "status", ...defaults.status }]);

  return <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 panel-scroll">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="font-display text-[13.5px] font-semibold">Response assertions</h3>
        <p className="mt-1 text-[11.5px] text-[var(--muted)]">Assertions run after this saved request. Use variables such as <code>{"{{expectedId}}"}</code> instead of storing sensitive expected values.</p>
      </div>
      <Button type="button" size="sm" onClick={add}><Plus size={14} /> Add assertion</Button>
    </div>
    {assertions.length === 0 ? <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border)] p-8 text-center text-[12.5px] text-[var(--muted)]">No assertions yet. A request with no assertions passes when it completes successfully.</div> : <div className="grid gap-2">
      {assertions.map((assertion, index) => {
        const needsTarget = assertion.kind === "header" || assertion.kind === "jsonPath";
        const needsExpected = assertion.operator !== "exists" && assertion.operator !== "notExists";
        return <fieldset key={assertion.id} className="grid min-w-0 grid-cols-2 gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] p-2 2xl:grid-cols-[minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(130px,1fr)_minmax(120px,1fr)_32px]">
          <legend className="sr-only">Assertion {index + 1}</legend>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Type<select aria-label={`Assertion ${index + 1} type`} className={selectClass} value={assertion.kind} onChange={(event) => changeKind(assertion.id, event.target.value as AssertionKind)}>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Operator<select aria-label={`Assertion ${index + 1} operator`} className={selectClass} value={assertion.operator} onChange={(event) => update(assertion.id, { operator: event.target.value as AssertionOperator })}>{operators[assertion.kind].map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}</select></label>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Target<Input aria-label={`Assertion ${index + 1} target`} disabled={!needsTarget} value={assertion.target} placeholder={assertion.kind === "jsonPath" ? "$.data.id" : assertion.kind === "header" ? "Content-Type" : "Not required"} onChange={(event) => update(assertion.id, { target: event.target.value })} /></label>
          <label className="grid gap-1 text-[11px] text-[var(--muted)]">Expected<Input aria-label={`Assertion ${index + 1} expected value`} disabled={!needsExpected} value={assertion.expected} placeholder={assertion.kind === "responseTime" ? "Milliseconds" : "Expected value"} onChange={(event) => update(assertion.id, { expected: event.target.value })} /></label>
          <Button type="button" variant="ghost" size="icon" className="col-span-2 justify-self-end 2xl:col-span-1 2xl:mt-5 2xl:justify-self-auto" aria-label={`Remove assertion ${index + 1}`} onClick={() => setAssertions(assertions.filter((item) => item.id !== assertion.id))}><Trash2 size={14} /></Button>
        </fieldset>;
      })}
    </div>}
  </div>;
}
