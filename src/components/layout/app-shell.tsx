import { Box, Clock3, Code2, Moon, Plus, Settings2, Sun, Variable, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CollectionsSidebar, SaveRequestDialog } from "../../features/collections";
import { EnvironmentDialog } from "../../features/environments";
import { HistoryPanel } from "../../features/history";
import { RequestWorkspace } from "../../features/request";
import { ResponsePanel } from "../../features/response";
import { useAppStore } from "../../store/use-app-store";
import { methodColor } from "../../lib/http-display";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
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
  const method = useAppStore((state) => state.draft.method);
  const requestName = useAppStore((state) => state.draft.name);
  const isSaved = useAppStore((state) => state.draft.savedRequestId !== null);
  const setTheme = useAppStore((state) => state.setTheme);
  const setEnvironmentDialogOpen = useAppStore((state) => state.setEnvironmentDialogOpen);
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const newRequest = useAppStore((state) => state.newRequest);
  const environments = useAppStore((state) => state.environments);
  const activeEnvironmentId = useAppStore((state) => state.activeEnvironmentId);
  const setActiveEnvironment = useAppStore((state) => state.setActiveEnvironment);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  return (
    <div className="flex h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] px-3">
        <div className="flex w-[220px] shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-white dark:text-[#10201e]">
            <Code2 size={16} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold">Laika</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center self-stretch border-x border-[var(--border)]">
          <div className="flex h-full min-w-0 max-w-[280px] items-center gap-2 border-r border-[var(--border)] bg-[var(--background)] px-3 text-sm">
            <span className={cn("shrink-0 font-semibold", methodColor[method])}>{method}</span>
            <span className="truncate" title={requestName}>{requestName}</span>
            {isSaved ? null : <span className="shrink-0 text-xs text-[var(--muted)]">Unsaved</span>}
            <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0" aria-label="Close request" title="Close request" onClick={newRequest}>
              <X size={14} />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="ml-1" aria-label="New request" title="New request" onClick={newRequest}>
            <Plus size={16} />
          </Button>
        </div>
        <div className="ml-3 flex items-center gap-1">
          <select
            className="h-8 max-w-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
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
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="220px" minSize="180px" maxSize="340px">
            <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface)]" aria-label="Workspace navigation">
              <Tabs defaultValue="collections" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="px-2" aria-label="Workspace sections">
                  <TabsTrigger className="flex flex-1 items-center justify-center gap-2 px-1" value="collections">
                    <Box size={14} /> Collections
                  </TabsTrigger>
                  <TabsTrigger className="flex flex-1 items-center justify-center gap-2 px-1" value="history">
                    <Clock3 size={14} /> History
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="collections" className="flex min-h-0 flex-col"><CollectionsSidebar /></TabsContent>
                <TabsContent value="history" className="flex min-h-0 flex-col"><HistoryPanel /></TabsContent>
              </Tabs>
            </aside>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={compact ? "360px" : "520px"}>
            <ResizablePanelGroup orientation={compact ? "vertical" : "horizontal"}>
              <ResizablePanel defaultSize="55%" minSize="260px"><RequestWorkspace /></ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize="45%" minSize="220px"><ResponsePanel /></ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <EnvironmentDialog />
      <SaveRequestDialog />
    </div>
  );
}
