import { AlertTriangle, CheckCircle2, Download, Play, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { normalizeApplicationError } from "../../lib/application-error";
import { useAppStore } from "../../store/use-app-store";
import type { ChainPreflightWarning, TestRun, TestRunSummary } from "../../types/testing";
import { exportTestRun, getTestRun, listTestRuns, preflightCollectionRun, runCollection } from "./testing-client";

const selectClass = "h-7 w-full cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[11.5px]";

export function TestRunnerPanel() {
  const collections = useAppStore((state) => state.collections);
  const requests = useAppStore((state) => state.requests);
  const environments = useAppStore((state) => state.environments);
  const activeEnvironmentId = useAppStore((state) => state.activeEnvironmentId);
  const [collectionId, setCollectionId] = useState("");
  const [environmentId, setEnvironmentId] = useState(activeEnvironmentId ?? "");
  const [running, setRunning] = useState(false);
  const [recent, setRecent] = useState<TestRunSummary[]>([]);
  const [run, setRun] = useState<TestRun | null>(null);
  const [warnings, setWarnings] = useState<ChainPreflightWarning[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { if (!collectionId && collections[0]) setCollectionId(collections[0].id); }, [collectionId, collections]);
  useEffect(() => { setEnvironmentId(activeEnvironmentId ?? ""); }, [activeEnvironmentId]);
  useEffect(() => { void listTestRuns().then(setRecent).catch(() => undefined); }, []);
  useEffect(() => {
    setConfirmed(false);
    if (!collectionId) { setWarnings([]); return; }
    void preflightCollectionRun({ collectionId, environmentId: environmentId || null })
      .then((report) => setWarnings(report.warnings))
      .catch(() => setWarnings([]));
  }, [collectionId, environmentId]);

  const requestCount = useMemo(() => requests.filter((request) => request.collectionId === collectionId).length, [collectionId, requests]);
  const needsConfirmation = warnings.length > 0 && !confirmed;
  const execute = async () => {
    if (!collectionId || requestCount === 0) return;
    setRunning(true);
    try {
      const next = await runCollection({ collectionId, environmentId: environmentId || null });
      setRun(next);
      setRecent(await listTestRuns());
      setConfirmed(false);
      toast[next.status === "passed" ? "success" : "error"](`Collection run ${next.status}`, { description: `${next.passedRequests}/${next.totalRequests} requests passed` });
    } catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    } finally { setRunning(false); }
  };
  const handleRunClick = () => {
    if (needsConfirmation) { setConfirmed(true); return; }
    void execute();
  };
  const open = async (id: string) => {
    try { setRun(await getTestRun(id)); }
    catch (error) { const normalized = normalizeApplicationError(error); toast.error(normalized.title, { description: normalized.message }); }
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="grid gap-2 border-b border-[var(--border-subtle)] p-2">
      <label className="grid gap-1 text-[11px] font-medium text-[var(--muted)]">Collection<select className={selectClass} value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">Select collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label>
      <label className="grid gap-1 text-[11px] font-medium text-[var(--muted)]">Environment<select className={selectClass} value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}><option value="">Workspace variables only</option>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
      {warnings.length > 0 ? <ul className="grid gap-1 rounded-md border border-[var(--warning)] bg-[var(--surface-sunken)] p-2 text-[11px] text-[var(--warning)]" aria-label="Chaining warnings">
        {warnings.map((warning) => <li key={`${warning.requestId}-${warning.variableName}`} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 shrink-0" size={12} /><span>{warning.requestName} needs <code>{`{{${warning.variableName}}}`}</code>, which no earlier request in this run sets.</span></li>)}
      </ul> : null}
      <Button size="sm" disabled={running || !collectionId || requestCount === 0} onClick={handleRunClick}><Play size={13} fill="currentColor" />{running ? "Running sequentially…" : needsConfirmation ? "Run anyway" : `Run ${requestCount} request${requestCount === 1 ? "" : "s"}`}</Button>
      {collectionId && requestCount === 0 ? <p className="text-[11.5px] text-[var(--muted)]">Add a saved request to this collection before running it.</p> : null}
    </div>

    <div className="min-h-0 flex-1 overflow-auto p-2 panel-scroll">
      {run ? <section aria-label="Test run results" className="grid gap-2">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] p-2">
          <div className="flex items-center gap-2">
            {run.status === "passed" ? <CheckCircle2 className="text-[var(--success)]" size={16} /> : <XCircle className="text-[var(--danger)]" size={16} />}
            <strong className="min-w-0 flex-1 truncate text-[11.5px]">{run.collectionName}</strong>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Export test run as JSON" title="Export JSON" onClick={() => exportTestRun(run)}><Download size={13} /></Button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{run.passedRequests} passed · {run.failedRequests} failed · {run.durationMs} ms{run.environmentName ? ` · ${run.environmentName}` : ""}</p>
        </div>
        {run.results.map((result) => <div key={result.id} className="rounded-md border border-[var(--border)] p-2 text-[11.5px]">
          <div className="flex items-start gap-2">{result.status === "passed" ? <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--success)]" size={14} /> : <XCircle className="mt-0.5 shrink-0 text-[var(--danger)]" size={14} />}<div className="min-w-0"><strong className="block truncate">{result.requestName}</strong><span className="text-[11px] text-[var(--muted)]">{result.method} · {result.responseStatus ?? result.errorCode ?? "Error"} · {result.elapsedMs ?? "--"} ms</span></div></div>
          {result.assertionResults.length ? <ul className="mt-2 grid gap-1 border-t border-[var(--border)] pt-2">{result.assertionResults.map((assertion) => <li key={assertion.assertionId} className={assertion.passed ? "text-[var(--muted)]" : "text-[var(--danger)]"}>{assertion.passed ? "✓" : "×"} {assertion.message}</li>)}</ul> : null}
          {result.extractionResults.length ? <ul className="mt-2 grid gap-1 border-t border-[var(--border)] pt-2">{result.extractionResults.map((extraction) => <li key={extraction.extractionId} className={extraction.found ? "text-[var(--muted)]" : "text-[var(--danger)]"}>{extraction.found ? "✓" : "×"} {extraction.found ? `Captured {{${extraction.variableName}}}${extraction.valuePreview !== null ? `: ${extraction.valuePreview}` : " (secret)"}` : `{{${extraction.variableName}}} not found in response`}</li>)}</ul> : null}
        </div>)}
      </section> : <div className="py-8 text-center text-[11.5px] text-[var(--muted)]">Run a collection to see assertion results.</div>}

      {recent.length ? <section className="mt-4 border-t border-[var(--border)] pt-3" aria-label="Recent test runs"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Recent runs</h3><div className="grid gap-1">{recent.map((item) => <button key={item.id} type="button" className="flex items-center gap-2 rounded p-1.5 text-left text-[11.5px] hover:bg-[var(--surface-muted)]" onClick={() => void open(item.id)}>{item.status === "passed" ? <CheckCircle2 className="text-[var(--success)]" size={13} /> : <XCircle className="text-[var(--danger)]" size={13} />}<span className="min-w-0 flex-1 truncate">{item.collectionName}</span><span className="text-[10px] text-[var(--muted)]">{item.passedRequests}/{item.totalRequests}</span></button>)}</div></section> : null}
    </div>
  </div>;
}
