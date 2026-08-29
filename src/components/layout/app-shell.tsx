import { Boxes, ChevronDown, Clock3, FlaskConical, Layers, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Settings2, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CollectionsSidebar, SaveRequestDialog } from "../../features/collections";
import { EnvironmentDialog } from "../../features/environments";
import { HistoryPanel } from "../../features/history";
import { RequestWorkspace } from "../../features/request";
import { ResponsePanel } from "../../features/response";
import { SettingsDialog } from "../../features/settings";
import { TestRunnerPanel } from "../../features/testing";
import { useAppStore } from "../../store/use-app-store";
import { methodColor, methodLabel } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { LaikaMark } from "../ui/laika-mark";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

const appVersion = __APP_VERSION__;

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
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      <header className="flex h-12 shrink-0 items-stretch border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex w-[220px] shrink-0 items-center gap-2.5 border-r border-[var(--border)] px-3 max-[899px]:w-auto">
          <LaikaMark />
          <span className="font-display text-[15.5px] font-semibold tracking-[0.01em] max-[899px]:hidden">Laika</span>
          <span className="rounded border border-[var(--border)] px-1 py-px font-mono text-[10px] text-[var(--faint)] max-[899px]:hidden">{appVersion}</span>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>{sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}</Button>
        </div>

        <div className="flex min-w-0 flex-1 items-end gap-[3px] overflow-hidden px-2 pt-[13px]">
          <div className="flex h-full min-w-0 items-end gap-[3px] overflow-x-auto panel-scroll" role="tablist" aria-label="Open requests">
            {requestTabs.map((tab) => {
              const active = tab.id === activeRequestTabId;
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "flex min-w-0 max-w-[240px] shrink-0 items-center gap-[7px] rounded-t-md px-2 pl-2.5",
                    active
                      ? "h-[35px] border border-b-[var(--background)] border-[var(--border)] border-t-2 border-t-[var(--accent)] bg-[var(--background)]"
                      : "h-[33px] text-[var(--muted)]",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className="flex min-w-0 cursor-pointer items-center gap-[7px] text-left"
                    onClick={() => activateRequestTab(tab.id)}
                  >
                    <span className={cn("shrink-0 font-mono text-[10px] font-semibold tracking-[0.04em]", methodColor[tab.draft.method])}>{methodLabel[tab.draft.method]}</span>
                    <span className={cn("truncate text-[12.5px]", active && "font-medium")} title={tab.draft.name}>{tab.draft.name}</span>
                  </button>
                  {tab.dirty ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-[3px] bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--warning)]" title="Unsaved changes">
                      <span className="h-1 w-1 rounded-full bg-[var(--warning)]" />
                      Unsaved
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded text-[var(--fainter)] hover:text-[var(--foreground)]",
                      active && "bg-[var(--surface-muted)] text-[var(--muted)]",
                    )}
                    aria-label={`Close ${tab.draft.name}`}
                    title="Close request"
                    onClick={() => requestClose(tab.id)}
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="mb-1 ml-1 flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            aria-label="New request"
            title="New request (Ctrl+N)"
            aria-keyshortcuts="Control+N Meta+N"
            onClick={newRequest}
          >
            <Plus size={13} strokeWidth={1.7} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-l border-[var(--border)] px-3">
          <label className="relative flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-strong)] pl-2 max-[899px]:hidden">
            <Layers size={13} className="shrink-0 text-[var(--method-put)]" aria-hidden="true" />
            <select
              className="h-full max-w-36 cursor-pointer appearance-none bg-transparent pr-6 text-[11.5px] text-[var(--foreground-soft)] outline-none"
              value={activeEnvironmentId ?? ""}
              onChange={(event) => void setActiveEnvironment(event.target.value || null)}
              aria-label="Active environment"
              title="Active environment"
            >
              <option value="">No environment</option>
              {environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
            </select>
            <ChevronDown size={11} strokeWidth={2} className="pointer-events-none absolute right-2 text-[var(--muted-dim)]" aria-hidden="true" />
          </label>
          <Button variant="ghost" size="icon" onClick={() => setEnvironmentDialogOpen(true)} aria-label="Manage environments" title="Environments">
            <Boxes size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Use ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
            <Settings2 size={15} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setResponseOpen((open) => !open)} aria-label={responseOpen ? "Collapse response" : "Expand response"} title={responseOpen ? "Collapse response" : "Expand response"}>{responseOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          {sidebarOpen ? <><ResizablePanel defaultSize="220px" minSize="180px" maxSize="340px">
            <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)]" aria-label="Workspace navigation">
              <Tabs defaultValue="collections" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="h-8 gap-0 px-0" aria-label="Workspace sections">
                  <TabsTrigger className="flex-1 justify-center px-1 text-[12px]" value="collections">
                    <Boxes size={13} /> Saved
                  </TabsTrigger>
                  <TabsTrigger className="flex-1 justify-center px-1 text-[12px]" value="history">
                    <Clock3 size={13} /> History
                  </TabsTrigger>
                  <TabsTrigger className="flex-1 justify-center px-1 text-[12px]" value="runs">
                    <FlaskConical size={13} /> Runs
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
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SaveRequestDialog />
      <ConfirmDialog open={pendingClose !== null} title="Discard unsaved changes?" description="This request has changes that have not been saved." confirmLabel="Discard" onConfirm={() => { if (pendingClose) closeRequestTab(pendingClose); setPendingClose(null); }} onOpenChange={(open) => { if (!open) setPendingClose(null); }} />
    </div>
  );
}
