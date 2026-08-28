import { Braces, Inbox } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAppStore } from "../../store/use-app-store";
import type { ResponseViewerTab } from "../../types/http";

export function ResponsePanel() {
  const responseTab = useAppStore((state) => state.responseTab);
  const setResponseTab = useAppStore((state) => state.setResponseTab);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface)]" aria-label="Response viewer">
      <header className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-4">
        <h2 className="text-sm font-semibold">Response</h2>
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>Status --</span><span>Time --</span><span>Size --</span>
        </div>
      </header>
      <Tabs className="flex min-h-0 flex-1 flex-col" value={responseTab} onValueChange={(value) => setResponseTab(value as ResponseViewerTab)}>
        <TabsList aria-label="Response data">
          <TabsTrigger value="body">Body</TabsTrigger><TabsTrigger value="headers">Headers</TabsTrigger>
        </TabsList>
        <TabsContent value="body" className="flex items-center justify-center p-6">
          <div className="text-center text-[var(--muted)]">
            <Inbox className="mx-auto" size={28} strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-[var(--foreground)]">No response yet</p>
            <p className="mt-1 text-xs">Send a request to inspect its response.</p>
          </div>
        </TabsContent>
        <TabsContent value="headers" className="flex items-center justify-center p-6">
          <div className="text-center text-[var(--muted)]">
            <Braces className="mx-auto" size={26} strokeWidth={1.5} />
            <p className="mt-3 text-sm">Response headers will appear here.</p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
