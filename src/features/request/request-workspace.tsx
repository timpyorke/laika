import { AlertTriangle, CheckCheck, ChevronDown, CopyPlus, Import, LoaderCircle, Save, Square, Terminal } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, KeyHint } from "../../components/ui/button";
import { CodeEditor } from "../../components/ui/code-editor";
import { Input } from "../../components/ui/input";
import { KeyValueTable } from "../../components/ui/key-value-table";
import { SegmentedControl, SegmentedItem, TabBadge, TabDot, Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { methodColor } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/use-app-store";
import { AUTH_TYPES, BODY_MODES, HTTP_METHODS, type AuthType, type BodyMode, type HttpMethod, type RequestEditorTab } from "../../types/http";
import { CurlDialog } from "./curl-dialog";
import { AssertionEditor, ExtractionEditor } from "../testing";

const bodyLabels: Record<BodyMode, string> = { none: "none", json: "JSON", text: "text", form: "form-data" };
const authLabels: Record<AuthType, string> = { none: "No authentication", bearer: "Bearer token", basic: "Basic auth" };
const authDotColor: Record<AuthType, string> = { none: "var(--fainter)", bearer: "var(--success)", basic: "var(--success)" };

/** Mono note shown at the right of the params/headers footer bar. */
function authSummary(type: AuthType): string {
  if (type === "bearer") return "Auth: Bearer token";
  if (type === "basic") return "Auth: Basic credentials";
  return "Auth: none";
}

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

  const enabledParams = draft.params.filter((row) => row.key.trim() !== "").length;
  const enabledHeaders = draft.headers.filter((row) => row.key.trim() !== "").length;
  const bodyValidJson = draft.bodyMode !== "json" || draft.body.trim() === "" || isValidJson(draft.body);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--background)]" aria-label="Request editor">
      <div className="relative shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
        <form className="flex flex-wrap items-center gap-2 p-2.5" onSubmit={submit}>
          <label className="relative shrink-0">
            <span className="sr-only">HTTP method</span>
            <select
              value={draft.method}
              onChange={(event) => setMethod(event.target.value as HttpMethod)}
              className={cn(
                "h-[34px] w-[100px] cursor-pointer appearance-none rounded-md border border-[var(--border-strong)] bg-[var(--background)] pl-2.5 pr-7 font-mono text-[12px] font-semibold outline-none",
                methodColor[draft.method],
              )}
            >
              {HTTP_METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-[11px] text-[var(--muted-dim)]" size={12} strokeWidth={2} aria-hidden="true" />
          </label>

          <div className={cn(
            "flex h-[34px] min-w-[180px] flex-1 items-center gap-2 rounded-md border bg-[var(--background)] px-2.5 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]",
            isSending ? "border-[var(--accent)]" : "border-[var(--border-strong)]",
          )}>
            <input
              className="h-full min-w-0 flex-1 border-0 bg-transparent font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-[var(--faint)]"
              value={draft.url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Paste or type a URL to begin"
              aria-label="Request URL"
              spellCheck={false}
            />
            {isSending ? <LoaderCircle size={13} strokeWidth={2} className="shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" /> : null}
          </div>

          {isSending ? (
            <Button
              className="h-[34px] gap-[7px] border border-[var(--danger-strong)] bg-[var(--danger-soft)] px-4 font-semibold text-[var(--danger)] shadow-none hover:bg-[var(--danger-soft)]"
              variant="secondary"
              type="button"
              onClick={() => void cancelRequest()}
              aria-keyshortcuts="Escape"
            >
              <Square size={12} strokeWidth={2} /> Cancel <KeyHint className="opacity-75">Esc</KeyHint>
            </Button>
          ) : (
            <Button className="h-[34px] gap-[7px] px-[18px]" type="submit" aria-keyshortcuts="Control+Enter Meta+Enter">
              Send <KeyHint>⌘↵</KeyHint>
            </Button>
          )}
          <Button
            className="h-[34px] px-3.5"
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={() => void saveDraft()}
            title="Save request (Ctrl+S)"
            aria-keyshortcuts="Control+S Meta+S"
          >
            <Save size={14} /> Save
          </Button>
          <Button className="h-[34px]" type="button" variant="ghost" onClick={() => void saveAsDraft()} title="Save as (Ctrl+Shift+S)"><CopyPlus size={14} /><span className="sr-only">Save as</span></Button>
          <Button className="h-[34px]" type="button" variant="ghost" onClick={() => setCurlDialog("generate")} title="Generate cURL"><Terminal size={14} /><span className="sr-only">Generate cURL</span></Button>
          <Button className="h-[34px]" type="button" variant="ghost" onClick={() => setCurlDialog("import")} title="Import cURL"><Import size={14} /><span className="sr-only">Import cURL</span></Button>
        </form>
        {/* Indeterminate rail so a long request reads as in-flight, not stalled. */}
        {isSending ? (
          <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden bg-[var(--accent-soft)]" aria-hidden="true">
            <div className="lk-progress h-full w-[30%] bg-[var(--accent)]" />
          </div>
        ) : null}
      </div>

      <Tabs className="flex min-h-0 flex-1 flex-col" value={requestTab} onValueChange={(value) => setRequestTab(value as RequestEditorTab)}>
        <TabsList aria-label="Request configuration">
          <TabsTrigger value="params">Params <TabBadge active={requestTab === "params"}>{enabledParams}</TabBadge></TabsTrigger>
          <TabsTrigger value="headers">Headers <TabBadge active={requestTab === "headers"}>{enabledHeaders}</TabBadge></TabsTrigger>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="auth">Auth <TabDot color={authDotColor[draft.auth.type]} /></TabsTrigger>
          <TabsTrigger value="tests">Tests</TabsTrigger>
          <TabsTrigger value="chaining">Chaining</TabsTrigger>
          <span className="ml-auto flex items-center whitespace-nowrap font-mono text-[11px] text-[var(--faint)] max-[1100px]:hidden">
            {requestTab === "params" ? "Query params" : requestTab === "headers" ? "Request headers" : requestTab === "body" ? `Content: ${bodyLabels[draft.bodyMode]}` : requestTab === "auth" ? authSummary(draft.auth.type) : requestTab === "chaining" ? "Response chaining" : "Response assertions"}
          </span>
        </TabsList>

        <TabsContent value="params" className="flex min-h-0 flex-col">
          <KeyValueTable
            rows={draft.params}
            keyPlaceholder="Key"
            addLabel="Add param"
            hint={authSummary(draft.auth.type)}
            onChange={(id, patch) => updateEntry("params", id, patch)}
            onAdd={() => addEntry("params")}
            onRemove={(id) => removeEntry("params", id)}
          />
        </TabsContent>

        <TabsContent value="headers" className="flex min-h-0 flex-col">
          <KeyValueTable
            rows={draft.headers}
            keyPlaceholder="Header"
            addLabel="Add header"
            hint={`${draft.headers.filter((row) => row.enabled).length} of ${draft.headers.length} enabled`}
            onChange={(id, patch) => updateEntry("headers", id, patch)}
            onAdd={() => addEntry("headers")}
            onRemove={(id) => removeEntry("headers", id)}
          />
        </TabsContent>

        <TabsContent value="body" className="flex min-h-0 flex-col">
          <div className="flex h-[34px] shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-3">
            <SegmentedControl role="group" aria-label="Body mode">
              {BODY_MODES.map((mode) => (
                <SegmentedItem key={mode} active={draft.bodyMode === mode} onClick={() => setBodyMode(mode)}>
                  {bodyLabels[mode]}
                </SegmentedItem>
              ))}
            </SegmentedControl>
            {draft.bodyMode === "json" ? (
              <span className={cn("ml-auto flex items-center gap-1.5 text-[11.5px]", bodyValidJson ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                {bodyValidJson ? <CheckCheck size={12} /> : <AlertTriangle size={12} />}
                {bodyValidJson ? "Valid JSON" : "Invalid JSON"}
              </span>
            ) : null}
          </div>
          {draft.bodyMode === "none" ? (
            <div className="flex flex-1 items-center justify-center text-[12.5px] text-[var(--muted)]">This request has no body.</div>
          ) : draft.bodyMode === "form" ? (
            <KeyValueTable
              rows={draft.form}
              keyPlaceholder="Field"
              addLabel="Add field"
              onChange={(id, patch) => updateEntry("form", id, patch)}
              onAdd={() => addEntry("form")}
              onRemove={(id) => removeEntry("form", id)}
            />
          ) : (
            <CodeEditor
              className="min-h-0 flex-1 rounded-none border-0"
              value={draft.body}
              onChange={setBody}
              language={draft.bodyMode === "json" ? "json" : "plaintext"}
              ariaLabel="Request body"
            />
          )}
        </TabsContent>

        <TabsContent value="auth" className="overflow-auto p-4 panel-scroll">
          <div className="grid max-w-md gap-4">
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Authentication
              <select
                value={draft.auth.type}
                onChange={(event) => setAuthType(event.target.value as AuthType)}
                className="h-8 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 text-[12.5px] font-normal"
              >
                {AUTH_TYPES.map((type) => <option key={type} value={type}>{authLabels[type]}</option>)}
              </select>
            </label>
            {draft.auth.type === "bearer" ? (
              <label className="grid gap-1.5 text-[12.5px] font-medium">
                Token
                <Input type="password" value={draft.auth.bearerToken} placeholder={draft.auth.hasStoredSecret ? "Stored in secret vault" : undefined} onChange={(event) => updateAuth({ bearerToken: event.target.value })} autoComplete="off" />
                {draft.auth.hasStoredSecret ? <span className="text-[11.5px] font-normal text-[var(--muted)]">Leave blank to keep the stored token.</span> : null}
              </label>
            ) : null}
            {draft.auth.type === "basic" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-[12.5px] font-medium">Username<Input value={draft.auth.username} onChange={(event) => updateAuth({ username: event.target.value })} autoComplete="off" /></label>
                <label className="grid gap-1.5 text-[12.5px] font-medium">Password<Input type="password" value={draft.auth.password} placeholder={draft.auth.hasStoredSecret ? "Stored in secret vault" : undefined} onChange={(event) => updateAuth({ password: event.target.value })} autoComplete="off" />{draft.auth.hasStoredSecret ? <span className="text-[11.5px] font-normal text-[var(--muted)]">Leave blank to keep it.</span> : null}</label>
              </div>
            ) : null}
            <label className="grid max-w-40 gap-1.5 border-t border-[var(--border)] pt-4 text-[12.5px] font-medium">
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
        <TabsContent value="tests" className="flex min-h-0 flex-col"><AssertionEditor /></TabsContent>
        <TabsContent value="chaining" className="flex min-h-0 flex-col"><ExtractionEditor /></TabsContent>
      </Tabs>
      <CurlDialog open={curlDialog !== null} mode={curlDialog ?? "generate"} onOpenChange={(open) => { if (!open) setCurlDialog(null); }} />
    </section>
  );
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
