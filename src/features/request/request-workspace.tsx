import { ChevronDown, CopyPlus, Import, Save, Send, Square, Terminal } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { CodeEditor } from "../../components/ui/code-editor";
import { Input } from "../../components/ui/input";
import { KeyValueTable } from "../../components/ui/key-value-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { methodColor } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/use-app-store";
import { AUTH_TYPES, BODY_MODES, HTTP_METHODS, type AuthType, type BodyMode, type HttpMethod, type RequestEditorTab } from "../../types/http";
import { CurlDialog } from "./curl-dialog";

const bodyLabels: Record<BodyMode, string> = { none: "None", json: "JSON", text: "Text", form: "Form" };
const authLabels: Record<AuthType, string> = { none: "No authentication", bearer: "Bearer token", basic: "Basic auth" };

export function RequestWorkspace() {
  const [curlDialog, setCurlDialog] = useState<"generate" | "import" | null>(null);
  const draft = useAppStore((state) => state.draft);
  const requestTab = useAppStore((state) => state.requestTab);
  const isSending = useAppStore((state) => state.isSending);
  const setMethod = useAppStore((state) => state.setMethod);
  const setUrl = useAppStore((state) => state.setUrl);
  const setBodyMode = useAppStore((state) => state.setBodyMode);
  const setBody = useAppStore((state) => state.setBody);
  const setAuthType = useAppStore((state) => state.setAuthType);
  const updateAuth = useAppStore((state) => state.updateAuth);
  const setTimeoutMs = useAppStore((state) => state.setTimeoutMs);
  const setRequestTab = useAppStore((state) => state.setRequestTab);
  const updateEntry = useAppStore((state) => state.updateEntry);
  const addEntry = useAppStore((state) => state.addEntry);
  const removeEntry = useAppStore((state) => state.removeEntry);
  const sendRequest = useAppStore((state) => state.sendRequest);
  const cancelRequest = useAppStore((state) => state.cancelRequest);
  const isSaving = useAppStore((state) => state.isSaving);
  const saveDraft = useAppStore((state) => state.saveDraft);
  const saveAsDraft = useAppStore((state) => state.saveAsDraft);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isSending) void cancelRequest();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRequest, isSending]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendRequest();
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface)]" aria-label="Request editor">
      <form className="flex flex-wrap gap-2 border-b border-[var(--border)] p-3" onSubmit={submit}>
        <label className="relative shrink-0">
          <span className="sr-only">HTTP method</span>
          <select
            value={draft.method}
            onChange={(event) => setMethod(event.target.value as HttpMethod)}
            className={`h-10 w-[108px] appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-sm font-semibold ${methodColor[draft.method]}`}
          >
            {HTTP_METHODS.map((method) => <option key={method}>{method}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 text-[var(--muted)]" size={15} />
        </label>
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 font-mono text-sm placeholder:font-sans placeholder:text-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
          value={draft.url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://api.example.com/v1/resource"
          aria-label="Request URL"
          spellCheck={false}
        />
        {isSending ? (
          <Button className="h-10 px-4" variant="danger" type="button" onClick={() => void cancelRequest()}>
            <Square size={14} fill="currentColor" /> Cancel
          </Button>
        ) : (
          <Button className="h-10 px-4" type="submit" aria-keyshortcuts="Control+Enter Meta+Enter"><Send size={15} /> Send</Button>
        )}
        <Button
          className="h-10 px-3"
          type="button"
          variant="secondary"
          disabled={isSaving}
          onClick={() => void saveDraft()}
          title="Save request (Ctrl+S)"
          aria-keyshortcuts="Control+S Meta+S"
        >
          <Save size={15} /> Save
        </Button>
        <Button className="h-10 px-3" type="button" variant="ghost" onClick={() => void saveAsDraft()} title="Save as (Ctrl+Shift+S)"><CopyPlus size={15} /><span className="sr-only">Save as</span></Button>
        <Button className="h-10 px-3" type="button" variant="ghost" onClick={() => setCurlDialog("generate")} title="Generate cURL"><Terminal size={15} /><span className="sr-only">Generate cURL</span></Button>
        <Button className="h-10 px-3" type="button" variant="ghost" onClick={() => setCurlDialog("import")} title="Import cURL"><Import size={15} /><span className="sr-only">Import cURL</span></Button>
      </form>

      <Tabs className="flex min-h-0 flex-1 flex-col" value={requestTab} onValueChange={(value) => setRequestTab(value as RequestEditorTab)}>
        <TabsList aria-label="Request configuration">
          <TabsTrigger value="params">Params</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="auth">Auth</TabsTrigger>
        </TabsList>
        <TabsContent value="params" className="overflow-auto panel-scroll">
          <KeyValueTable rows={draft.params} keyPlaceholder="Parameter" onChange={(id, patch) => updateEntry("params", id, patch)} onAdd={() => addEntry("params")} onRemove={(id) => removeEntry("params", id)} />
        </TabsContent>
        <TabsContent value="headers" className="overflow-auto panel-scroll">
          <KeyValueTable rows={draft.headers} keyPlaceholder="Header" onChange={(id, patch) => updateEntry("headers", id, patch)} onAdd={() => addEntry("headers")} onRemove={(id) => removeEntry("headers", id)} />
        </TabsContent>
        <TabsContent value="body" className="flex min-h-0 flex-col overflow-auto p-4 panel-scroll">
          <div className="flex w-fit rounded-md border border-[var(--border)] bg-[var(--background)] p-0.5" aria-label="Body mode">
            {BODY_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={draft.bodyMode === mode}
                onClick={() => setBodyMode(mode)}
                className={cn("h-7 cursor-pointer rounded px-3 text-xs font-medium text-[var(--muted)]", draft.bodyMode === mode && "bg-[var(--surface-raised)] text-[var(--foreground)] shadow-sm")}
              >
                {bodyLabels[mode]}
              </button>
            ))}
          </div>
          {draft.bodyMode === "none" ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">This request has no body.</div>
          ) : draft.bodyMode === "form" ? (
            <div className="-mx-4 mt-2"><KeyValueTable rows={draft.form} keyPlaceholder="Field" onChange={(id, patch) => updateEntry("form", id, patch)} onAdd={() => addEntry("form")} onRemove={(id) => removeEntry("form", id)} /></div>
          ) : (
            <CodeEditor
              className="mt-3 min-h-40 flex-1"
              value={draft.body}
              onChange={setBody}
              language={draft.bodyMode === "json" ? "json" : "plaintext"}
              ariaLabel="Request body"
            />
          )}
        </TabsContent>
        <TabsContent value="auth" className="overflow-auto p-4 panel-scroll">
          <div className="grid max-w-md gap-5">
            <label className="grid gap-2 text-sm font-medium">
              Authentication
              <select
                value={draft.auth.type}
                onChange={(event) => setAuthType(event.target.value as AuthType)}
                className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal"
              >
                {AUTH_TYPES.map((type) => <option key={type} value={type}>{authLabels[type]}</option>)}
              </select>
            </label>
            {draft.auth.type === "bearer" ? (
              <label className="grid gap-2 text-sm font-medium">
                Token
                <Input type="password" value={draft.auth.bearerToken} placeholder={draft.auth.hasStoredSecret ? "Stored in secret vault" : undefined} onChange={(event) => updateAuth({ bearerToken: event.target.value })} autoComplete="off" />
                {draft.auth.hasStoredSecret ? <span className="text-xs font-normal text-[var(--muted)]">Leave blank to keep the stored token.</span> : null}
              </label>
            ) : null}
            {draft.auth.type === "basic" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm font-medium">Username<Input value={draft.auth.username} onChange={(event) => updateAuth({ username: event.target.value })} autoComplete="off" /></label>
                <label className="grid gap-2 text-sm font-medium">Password<Input type="password" value={draft.auth.password} placeholder={draft.auth.hasStoredSecret ? "Stored in secret vault" : undefined} onChange={(event) => updateAuth({ password: event.target.value })} autoComplete="off" />{draft.auth.hasStoredSecret ? <span className="text-xs font-normal text-[var(--muted)]">Leave blank to keep it.</span> : null}</label>
              </div>
            ) : null}
            <label className="grid max-w-40 gap-2 border-t border-[var(--border)] pt-4 text-sm font-medium">
              Timeout (seconds)
              <Input
                type="number"
                min="0.1"
                max="300"
                step="0.1"
                value={draft.timeoutMs / 1000}
                onChange={(event) => setTimeoutMs(Math.round(Number(event.target.value) * 1000))}
              />
            </label>
          </div>
        </TabsContent>
      </Tabs>
      <CurlDialog open={curlDialog !== null} mode={curlDialog ?? "generate"} onOpenChange={(open) => { if (!open) setCurlDialog(null); }} />
    </section>
  );
}
