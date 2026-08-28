import { ChevronDown, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { KeyValueTable } from "../../components/ui/key-value-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAppStore } from "../../store/use-app-store";
import { HTTP_METHODS, type HttpMethod, type RequestEditorTab } from "../../types/http";

const methodColor: Record<HttpMethod, string> = {
  GET: "text-[#16834b] dark:text-[#4ade80]",
  POST: "text-[#b36a08] dark:text-[#fbbf24]",
  PUT: "text-[#2563b8] dark:text-[#60a5fa]",
  PATCH: "text-[#7c4db2] dark:text-[#c084fc]",
  DELETE: "text-[var(--danger)]",
  HEAD: "text-[#0f766e] dark:text-[#2dd4bf]",
  OPTIONS: "text-[#657080] dark:text-[#aab3bf]",
};

export function RequestWorkspace() {
  const draft = useAppStore((state) => state.draft);
  const requestTab = useAppStore((state) => state.requestTab);
  const setMethod = useAppStore((state) => state.setMethod);
  const setUrl = useAppStore((state) => state.setUrl);
  const setRequestTab = useAppStore((state) => state.setRequestTab);
  const updateEntry = useAppStore((state) => state.updateEntry);
  const addEntry = useAppStore((state) => state.addEntry);
  const removeEntry = useAppStore((state) => state.removeEntry);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.url.trim()) {
      toast.error("Enter a request URL");
      return;
    }
    toast.info("Request transport will be connected in the next milestone.");
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface)]" aria-label="Request editor">
      <form className="flex gap-2 border-b border-[var(--border)] p-3" onSubmit={submit}>
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
        <Button className="h-10 px-4" type="submit"><Send size={15} /> Send</Button>
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
        <TabsContent value="body" className="p-4">
          <textarea className="h-full min-h-32 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-sm focus:border-[var(--focus)] focus:outline-none" placeholder="Request body" aria-label="Request body" />
        </TabsContent>
        <TabsContent value="auth" className="p-4 text-sm text-[var(--muted)]">
          <label className="grid max-w-sm gap-2 font-medium text-[var(--foreground)]">
            Authentication
            <select className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal">
              <option>No authentication</option><option disabled>Bearer token</option><option disabled>Basic auth</option>
            </select>
          </label>
        </TabsContent>
      </Tabs>
    </section>
  );
}
