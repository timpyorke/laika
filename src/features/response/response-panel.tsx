import { AlertTriangle, Clipboard, Inbox, LoaderCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store/use-app-store";
import type { HttpResponse, ResponseBodyView, ResponseViewerTab } from "../../types/http";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusColor(status: number) {
  if (status < 300) return "text-[var(--status-success)]";
  if (status < 400) return "text-[var(--status-redirect)]";
  if (status < 500) return "text-[var(--status-client)]";
  return "text-[var(--status-server)]";
}

function prettyBody(response: HttpResponse) {
  if (!response.body) return "";
  try { return JSON.stringify(JSON.parse(response.body), null, 2); } catch { return response.body; }
}

export function ResponsePanel() {
  const response = useAppStore((state) => state.response);
  const error = useAppStore((state) => state.requestError);
  const isSending = useAppStore((state) => state.isSending);
  const responseTab = useAppStore((state) => state.responseTab);
  const bodyView = useAppStore((state) => state.responseBodyView);
  const setResponseTab = useAppStore((state) => state.setResponseTab);
  const setBodyView = useAppStore((state) => state.setResponseBodyView);
  const sendRequest = useAppStore((state) => state.sendRequest);

  const visibleBody = response ? (bodyView === "pretty" ? prettyBody(response) : response.body) : "";
  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(visibleBody);
      toast.success("Response copied");
    } catch {
      toast.error("Could not copy response");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface)]" aria-label="Response viewer">
      <header className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-4">
        <h2 className="text-sm font-semibold">Response</h2>
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--muted)]">
          <span className={response ? statusColor(response.status) : undefined}>{response ? `${response.status} ${response.statusText}` : "Status --"}</span>
          <span>{response ? `${response.elapsedMs} ms` : "Time --"}</span>
          <span>{response ? formatBytes(response.sizeBytes) : "Size --"}</span>
        </div>
      </header>

      {isSending ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-[var(--muted)]">
          <LoaderCircle className="animate-spin" size={26} />
          <p className="mt-3 text-sm font-medium text-[var(--foreground)]">Waiting for response</p>
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="text-[var(--danger)]" size={28} strokeWidth={1.7} />
          <p className="mt-3 text-sm font-semibold">{error.title}</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">{error.message}</p>
          {error.details?.variables ? <p className="mt-2 max-w-sm break-words rounded bg-[var(--surface-muted)] px-3 py-2 font-mono text-xs">{error.details.variables}</p> : null}
          {error.code !== "CANCELLED" ? (
            <Button className="mt-4" variant="secondary" size="sm" onClick={() => void sendRequest()}>
              <RotateCw size={14} /> Retry
            </Button>
          ) : null}
        </div>
      ) : response ? (
        <Tabs className="flex min-h-0 flex-1 flex-col" value={responseTab} onValueChange={(value) => setResponseTab(value as ResponseViewerTab)}>
          <TabsList aria-label="Response data">
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">Headers <span className="ml-1 text-xs">{response.headers.length}</span></TabsTrigger>
          </TabsList>
          <TabsContent value="body" className="flex min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] px-3">
              <div className="flex rounded-md border border-[var(--border)] bg-[var(--background)] p-0.5">
                {(["pretty", "raw"] as ResponseBodyView[]).map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={bodyView === view}
                    onClick={() => setBodyView(view)}
                    className={cn("h-6 cursor-pointer rounded px-2.5 text-xs capitalize text-[var(--muted)]", bodyView === view && "bg-[var(--surface-raised)] text-[var(--foreground)] shadow-sm")}
                  >{view}</button>
                ))}
              </div>
              <Button className="ml-auto" variant="ghost" size="icon" onClick={() => void copyBody()} aria-label="Copy response" title="Copy response">
                <Clipboard size={15} />
              </Button>
            </div>
            {response.truncated ? (
              <div className="border-b border-[var(--border)] bg-amber-500/10 px-3 py-2 text-xs text-[var(--status-client)]">Response stopped at the 10 MB display limit.</div>
            ) : null}
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 panel-scroll">{visibleBody || "(Empty response body)"}</pre>
          </TabsContent>
          <TabsContent value="headers" className="overflow-auto p-4 panel-scroll">
            <div className="grid grid-cols-[minmax(120px,0.7fr)_minmax(180px,1.3fr)] border-b border-[var(--border)] pb-2 text-xs font-medium uppercase text-[var(--muted)]">
              <span>Name</span><span>Value</span>
            </div>
            {response.headers.map((header, index) => (
              <div key={`${header.name}-${index}`} className="grid grid-cols-[minmax(120px,0.7fr)_minmax(180px,1.3fr)] gap-3 border-b border-[var(--border)] py-2 text-xs">
                <span className="font-medium">{header.name}</span><span className="break-all font-mono text-[var(--muted)]">{header.value}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="text-center text-[var(--muted)]">
            <Inbox className="mx-auto" size={28} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-[var(--foreground)]">No response yet</p>
            <p className="mt-1 text-xs">Send a request to inspect its response.</p>
          </div>
        </div>
      )}
    </section>
  );
}
