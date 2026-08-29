import { AlertTriangle, Clipboard, Clock3, Inbox, LoaderCircle, RotateCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, KeyHint } from "../../components/ui/button";
import { CodeEditor } from "../../components/ui/code-editor";
import { Input } from "../../components/ui/input";
import { SegmentedControl, SegmentedItem, TabBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { formatBytes, statusColorVar } from "../../lib/http-display";
import { useAppStore } from "../../store/use-app-store";
import type { HttpResponse, ResponseBodyView, ResponseViewerTab } from "../../types/http";

function prettyBody(response: HttpResponse) {
  if (!response.body) return "";
  try { return JSON.stringify(JSON.parse(response.body), null, 2); } catch { return response.body; }
}

/** Status pill: dot + code + text, tinted with the band colour. */
function StatusPill({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded border px-2 py-[3px] font-mono text-[11.5px] font-semibold"
      style={{
        color: dim ? "var(--fainter)" : color,
        borderColor: dim ? "var(--border)" : `color-mix(in srgb, ${color} 34%, transparent)`,
        background: dim ? "transparent" : `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      {dim ? null : <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

function MetaBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3">{children}</div>
  );
}

/** Bottom rail — the design's mono status line under every response state. */
function FooterBar({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-3 font-mono text-[10.5px] text-[var(--faint)]">
      <span className="truncate">{left}</span>
      {right ? <span className="ml-auto shrink-0 truncate">{right}</span> : null}
    </div>
  );
}

export function ResponsePanel() {
  const [bodySearch, setBodySearch] = useState("");
  const [headerSearch, setHeaderSearch] = useState("");
  const response = useAppStore((state) => state.response);
  const error = useAppStore((state) => state.requestError);
  const isSending = useAppStore((state) => state.isSending);
  const responseTab = useAppStore((state) => state.responseTab);
  const bodyView = useAppStore((state) => state.responseBodyView);
  const setResponseTab = useAppStore((state) => state.setResponseTab);
  const setBodyView = useAppStore((state) => state.setResponseBodyView);
  const sendRequest = useAppStore((state) => state.sendRequest);
  const draftUrl = useAppStore((state) => state.draft.url);
  const timeoutMs = useAppStore((state) => state.draft.timeoutMs);

  const visibleBody = response ? (bodyView === "pretty" ? prettyBody(response) : response.body) : "";
  const responseLanguage = response?.contentType?.toLowerCase().includes("json") || /^\s*[[{]/.test(visibleBody) ? "json" : "plaintext";
  const bodyMatches = bodySearch ? visibleBody.toLowerCase().split(bodySearch.toLowerCase()).length - 1 : 0;
  const bodyLines = visibleBody ? visibleBody.split("\n").length : 0;
  const visibleHeaders = useMemo(() => response?.headers.filter((header) => `${header.name} ${header.value}`.toLowerCase().includes(headerSearch.toLowerCase())) ?? [], [headerSearch, response]);
  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(visibleBody);
      toast.success("Response copied");
    } catch {
      toast.error("Could not copy response");
    }
  };

  if (isSending) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-[var(--background)]" aria-label="Response viewer">
        <MetaBar>
          <StatusPill label="Sending" color="var(--status-client)" />
          <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--muted)]"><Clock3 size={12} /> in flight</span>
          <span className="font-mono text-[11px] text-[var(--muted-dim)]">timeout {Math.round(timeoutMs / 1000)} s</span>
        </MetaBar>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[18px] px-12">
          <div className="flex items-center gap-2.5">
            <LoaderCircle className="animate-spin text-[var(--accent)]" size={18} strokeWidth={2} />
            <span className="font-display text-[15px] font-semibold">Waiting for response…</span>
          </div>
          <div className="flex w-full max-w-[380px] flex-col gap-2.5" aria-hidden="true">
            {[88, 66, 78, 44, 60].map((width, index) => (
              <span key={width} className="h-[9px] rounded-[3px] bg-[var(--surface-muted)]" style={{ width: `${width}%`, opacity: 1 - index * 0.12 }} />
            ))}
          </div>
          <div className="flex flex-col items-center gap-1.5 text-center font-mono text-[11px] text-[var(--muted-dim)]">
            <span>Request sent · awaiting first byte</span>
            <span>Cancel with Esc — nothing is saved until a response arrives</span>
          </div>
        </div>
        <FooterBar left="1 request in flight" right="Offline-first · nothing leaves this PC" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-[var(--background)]" aria-label="Response viewer">
        <MetaBar>
          <StatusPill label="No response" color="var(--danger)" />
          <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--muted)]"><Clock3 size={12} /> request failed</span>
          <span className="font-mono text-[11.5px] text-[var(--muted)]">0 B</span>
        </MetaBar>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 panel-scroll">
          <div className="rounded-md border border-[color-mix(in_srgb,var(--danger-strong)_38%,transparent)] bg-[var(--danger-soft)] p-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} strokeWidth={1.7} className="shrink-0 text-[var(--danger)]" />
              <span className="font-mono text-[12px] font-semibold tracking-[0.04em] text-[var(--danger)]">{error.code}</span>
              {error.recoverable ? (
                <span className="ml-auto rounded border border-[color-mix(in_srgb,var(--danger-strong)_28%,transparent)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--muted)]">recoverable</span>
              ) : null}
            </div>
            <div className="mt-2.5 font-display text-[14px] font-semibold">{error.title}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--foreground-soft)]">{error.message}</p>
            {error.details?.variables ? (
              <p className="mt-2 break-words rounded bg-[var(--surface-muted)] px-2.5 py-2 font-mono text-[11.5px]">{error.details.variables}</p>
            ) : null}
            {error.code !== "CANCELLED" ? (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" className="h-[30px] px-3" onClick={() => void sendRequest()}>
                  <RotateCw size={12} /> Retry <KeyHint>⌘↵</KeyHint>
                </Button>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-md border border-[var(--border)]">
            <div className="flex h-[26px] items-center border-b border-[var(--border)] bg-[var(--surface)] px-2.5 label-caps">Diagnostics</div>
            <dl className="grid grid-cols-[92px_1fr] gap-y-1 bg-[var(--surface-sunken)] px-2.5 py-2 font-mono text-[11.5px] leading-5 text-[var(--muted)]">
              <dt className="text-[var(--faint)]">url</dt>
              <dd className="truncate">{draftUrl || "—"}</dd>
              <dt className="text-[var(--faint)]">timeout</dt>
              <dd>{timeoutMs} ms</dd>
              <dt className="text-[var(--faint)]">code</dt>
              <dd>{error.code}</dd>
            </dl>
          </div>
        </div>
        <FooterBar left="Request failed" right="saved to History" />
      </section>
    );
  }

  if (!response) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-[var(--background)]" aria-label="Response viewer">
        <MetaBar>
          <StatusPill label="no response" color="var(--fainter)" dim />
          <span className="font-mono text-[11.5px] text-[var(--fainter)]">— ms</span>
          <span className="font-mono text-[11.5px] text-[var(--fainter)]">— B</span>
        </MetaBar>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 px-14 text-center">
          <Inbox size={26} strokeWidth={1.4} className="text-[var(--border-strong)]" aria-hidden="true" />
          <span className="text-[13px] font-medium text-[var(--muted-dim)]">Responses show up here</span>
          <p className="max-w-[300px] text-[12px] leading-relaxed text-[var(--fainter)]">
            Status, timing, headers and a pretty-printed body — every run is written to History automatically.
          </p>
        </div>
        <FooterBar left="No request sent yet" right="Offline-first · nothing leaves this PC" />
      </section>
    );
  }

  const statusColor = statusColorVar(response.status);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--background)]" aria-label="Response viewer">
      <MetaBar>
        <StatusPill label={`${response.status} ${response.statusText}`.trim()} color={statusColor} />
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] text-[var(--muted)]"><Clock3 size={12} /> {response.elapsedMs} ms</span>
        <span className="shrink-0 font-mono text-[11.5px] text-[var(--muted)]">{formatBytes(response.sizeBytes)}</span>
        {response.contentType ? <span className="truncate font-mono text-[11px] text-[var(--faint)]">{response.contentType.split(";")[0]}</span> : null}
        <Button className="ml-auto border border-[var(--border)]" variant="ghost" size="icon" onClick={() => void copyBody()} aria-label="Copy response" title="Copy response">
          <Clipboard size={13} />
        </Button>
      </MetaBar>

      <Tabs className="flex min-h-0 flex-1 flex-col" value={responseTab} onValueChange={(value) => setResponseTab(value as ResponseViewerTab)}>
        <TabsList className="h-8 gap-4" aria-label="Response data">
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="headers">Headers <TabBadge active={responseTab === "headers"}>{response.headers.length}</TabBadge></TabsTrigger>
          <SegmentedControl className="ml-auto self-center">
            {(["pretty", "raw"] as ResponseBodyView[]).map((view) => (
              <SegmentedItem key={view} active={bodyView === view} onClick={() => setBodyView(view)} className="capitalize">{view}</SegmentedItem>
            ))}
          </SegmentedControl>
        </TabsList>

        <TabsContent value="body" className="flex min-h-0 flex-col">
          <div className="flex h-[34px] shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-3">
            <label className="relative block max-w-56 flex-1">
              <Search className="absolute left-2 top-2 text-[var(--muted-dim)]" size={13} aria-hidden="true" />
              <Input className="h-7 w-full pl-7 text-[11.5px]" value={bodySearch} onChange={(event) => setBodySearch(event.target.value)} placeholder="Search response" aria-label="Search response body" />
            </label>
            {bodySearch ? <span className="font-mono text-[11px] text-[var(--muted-dim)]">{bodyMatches} matches</span> : null}
          </div>
          {response.truncated ? (
            <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-3 py-1.5 text-[11.5px] text-[var(--status-client)]">
              Response stopped at the 10 MB display limit.
            </div>
          ) : null}
          <CodeEditor className="min-h-0 flex-1 rounded-none border-0" value={visibleBody || "(Empty response body)"} language={responseLanguage} readOnly ariaLabel="Response body" />
        </TabsContent>

        <TabsContent value="headers" className="flex min-h-0 flex-col">
          <div className="flex h-[34px] shrink-0 items-center border-b border-[var(--border-subtle)] px-3">
            <label className="relative block max-w-64 flex-1">
              <Search className="absolute left-2 top-2 text-[var(--muted-dim)]" size={13} aria-hidden="true" />
              <Input className="h-7 w-full pl-7 text-[11.5px]" value={headerSearch} onChange={(event) => setHeaderSearch(event.target.value)} placeholder="Filter headers" aria-label="Filter response headers" />
            </label>
          </div>
          <div className="flex h-7 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-3 label-caps">
            <span className="w-[190px] shrink-0">Name</span>
            <span className="min-w-0 flex-1">Value</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto panel-scroll">
            {visibleHeaders.map((header, index) => (
              <div key={`${header.name}-${index}`} className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-3 py-[7px] font-mono text-[12px]">
                <span className="w-[190px] shrink-0 break-all text-[var(--code-key)]">{header.name}</span>
                <span className="min-w-0 flex-1 break-all text-[var(--foreground)]">{header.value}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <FooterBar
        left={`${bodyLines} line${bodyLines === 1 ? "" : "s"} · ${response.headers.length} headers`}
        right={`${response.truncated ? "truncated · " : ""}${formatBytes(response.sizeBytes)} received`}
      />
    </section>
  );
}
