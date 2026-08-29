import { Box, Clock3, Code2, FlaskConical, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Settings2, Sun, Variable, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CollectionsSidebar, SaveRequestDialog } from "../../features/collections";
import { EnvironmentDialog } from "../../features/environments";
import { HistoryPanel } from "../../features/history";
import { RequestWorkspace } from "../../features/request";
import { ResponsePanel } from "../../features/response";
import { TestRunnerPanel } from "../../features/testing";
import { useAppStore } from "../../store/use-app-store";
import { methodColor } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.innerWidth < 900);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

export function AppShell() {
  const compact = useCompactLayout();
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const setEnvironmentDialogOpen = useAppStore((state) => state.setEnvironmentDialogOpen);
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const newRequest = useAppStore((state) => state.newRequest);
  const environments = useAppStore((state) => state.environments);
  const activeEnvironmentId = useAppStore((state) => state.activeEnvironmentId);
  const setActiveEnvironment = useAppStore((state) => state.setActiveEnvironment);
  const requestTabs = useAppStore((state) => state.requestTabs);
  const activeRequestTabId = useAppStore((state) => state.activeRequestTabId);
  const activateRequestTab = useAppStore((state) => state.activateRequestTab);
  const closeRequestTab = useAppStore((state) => state.closeRequestTab);
  const sendRequest = useAppStore((state) => state.sendRequest);
  const saveDraft = useAppStore((state) => state.saveDraft);
  const saveAsDraft = useAppStore((state) => state.saveAsDraft);
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900);
  const [responseOpen, setResponseOpen] = useState(true);

  const requestClose = (id: string) => {
    const tab = requestTabs.find((item) => item.id === id);
    if (tab?.dirty) setPendingClose(id);
    else closeRequestTab(id);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!requestTabs.some((tab) => tab.dirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const shortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "Enter") { event.preventDefault(); void sendRequest(); return; }
      if (event.key.toLowerCase() === "s") { event.preventDefault(); if (event.shiftKey) void saveAsDraft(); else void saveDraft(); return; }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); newRequest(); return; }
      if (event.key.toLowerCase() === "w") { event.preventDefault(); requestClose(activeRequestTabId); return; }
      if (event.key === "Tab" && requestTabs.length > 1) {
        event.preventDefault();
        const index = requestTabs.findIndex((tab) => tab.id === activeRequestTabId);
        const offset = event.shiftKey ? -1 : 1;
        activateRequestTab(requestTabs[(index + offset + requestTabs.length) % requestTabs.length].id);
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", shortcuts);
    return () => { window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("keydown", shortcuts); };
  }, [activeRequestTabId, activateRequestTab, closeRequestTab, newRequest, requestTabs, saveAsDraft, saveDraft, sendRequest]);

  return (
    <div className="flex h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-3">
        <div className="flex w-[220px] shrink-0 items-center gap-2 max-[899px]:w-auto">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-white dark:text-[#10201e]">
            <Code2 size={16} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold max-[899px]:hidden">Laika</span>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>{sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}</Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center self-stretch border-x border-[var(--border)]">
          <div className="flex h-full min-w-0 flex-1 overflow-x-auto panel-scroll" role="tablist" aria-label="Open requests">
            {requestTabs.map((tab) => (
              <div key={tab.id} className={cn("flex h-full min-w-40 max-w-[260px] items-center gap-2 border-r border-[var(--border)] px-3 text-sm", tab.id === activeRequestTabId ? "bg-[var(--background)]" : "bg-[var(--surface)] text-[var(--muted)]")}>
                <button type="button" role="tab" aria-selected={tab.id === activeRequestTabId} className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => activateRequestTab(tab.id)}>
                  <span className={cn("shrink-0 text-xs font-semibold", methodColor[tab.draft.method])}>{tab.draft.method}</span>
                  <span className="truncate" title={tab.draft.name}>{tab.draft.name}</span>
                  {tab.dirty ? <span className="shrink-0 text-[var(--accent)]" aria-label="Unsaved changes">●</span> : null}
                </button>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Close ${tab.draft.name}`} title="Close request" onClick={() => requestClose(tab.id)}><X size={13} /></Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="ml-1" aria-label="New request" title="New request" onClick={newRequest}>
            <Plus size={16} />
          </Button>
        </div>
        <div className="ml-3 flex items-center gap-1">
          <select
            className="h-8 max-w-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs max-[899px]:hidden"
            value={activeEnvironmentId ?? ""}
            onChange={(event) => void setActiveEnvironment(event.target.value || null)}
            aria-label="Active environment"
            title="Active environment"
          >
            <option value="">No environment</option>
            {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
          </select>
          <Button variant="ghost" size="icon" onClick={() => setEnvironmentDialogOpen(true)} aria-label="Manage environments" title="Environments">
            <Variable size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Use ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Settings" title="Settings">
            <Settings2 size={16} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setResponseOpen((open) => !open)} aria-label={responseOpen ? "Collapse response" : "Expand response"} title={responseOpen ? "Collapse response" : "Expand response"}>{responseOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          {sidebarOpen ? <><ResizablePanel defaultSize="220px" minSize="180px" maxSize="340px">
            <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface)]" aria-label="Workspace navigation">
              <Tabs defaultValue="collections" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="px-2" aria-label="Workspace sections">
                  <TabsTrigger className="flex min-w-0 flex-1 items-center justify-center gap-1 px-1 text-xs" value="collections">
                    <Box size={14} /> Saved
                  </TabsTrigger>
                  <TabsTrigger className="flex min-w-0 flex-1 items-center justify-center gap-1 px-1 text-xs" value="history">
                    <Clock3 size={14} /> History
                  </TabsTrigger>
                  <TabsTrigger className="flex min-w-0 flex-1 items-center justify-center gap-1 px-1 text-xs" value="runs">
                    <FlaskConical size={14} /> Runs
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="collections" className="flex min-h-0 flex-col"><CollectionsSidebar /></TabsContent>
                <TabsContent value="history" className="flex min-h-0 flex-col"><HistoryPanel /></TabsContent>
                <TabsContent value="runs" className="flex min-h-0 flex-col"><TestRunnerPanel /></TabsContent>
              </Tabs>
            </aside>
          </ResizablePanel>
          <ResizableHandle /></> : null}
          <ResizablePanel minSize={compact ? "360px" : "520px"}>
            <ResizablePanelGroup orientation={compact ? "vertical" : "horizontal"}>
              <ResizablePanel defaultSize={responseOpen ? "55%" : "100%"} minSize="260px"><RequestWorkspace /></ResizablePanel>
              {responseOpen ? <><ResizableHandle /><ResizablePanel defaultSize="45%" minSize="220px"><ResponsePanel /></ResizablePanel></> : null}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <EnvironmentDialog />
      <SaveRequestDialog />
      <ConfirmDialog open={pendingClose !== null} title="Discard unsaved changes?" description="This request has changes that have not been saved." confirmLabel="Discard" onConfirm={() => { if (pendingClose) closeRequestTab(pendingClose); setPendingClose(null); }} onOpenChange={(open) => { if (!open) setPendingClose(null); }} />
    </div>
  );
}
