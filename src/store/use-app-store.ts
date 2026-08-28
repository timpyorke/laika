import { create } from "zustand";
import type { HttpMethod, KeyValueEntry, RequestDraft, RequestEditorTab, ResponseViewerTab } from "../types/http";

const emptyRow = (): KeyValueEntry => ({ id: crypto.randomUUID(), enabled: true, key: "", value: "" });

const initialDraft: RequestDraft = {
  id: crypto.randomUUID(),
  name: "Untitled request",
  method: "GET",
  url: "",
  params: [emptyRow()],
  headers: [emptyRow()],
  body: "",
  bodyType: "none",
};

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  draft: RequestDraft;
  requestTab: RequestEditorTab;
  responseTab: ResponseViewerTab;
  environmentDialogOpen: boolean;
  setTheme: (theme: Theme) => void;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setRequestTab: (tab: RequestEditorTab) => void;
  setResponseTab: (tab: ResponseViewerTab) => void;
  setEnvironmentDialogOpen: (open: boolean) => void;
  updateEntry: (group: "params" | "headers", id: string, patch: Partial<KeyValueEntry>) => void;
  addEntry: (group: "params" | "headers") => void;
  removeEntry: (group: "params" | "headers", id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  draft: initialDraft,
  requestTab: "params",
  responseTab: "body",
  environmentDialogOpen: false,
  setTheme: (theme) => set({ theme }),
  setMethod: (method) => set((state) => ({ draft: { ...state.draft, method } })),
  setUrl: (url) => set((state) => ({ draft: { ...state.draft, url } })),
  setRequestTab: (requestTab) => set({ requestTab }),
  setResponseTab: (responseTab) => set({ responseTab }),
  setEnvironmentDialogOpen: (environmentDialogOpen) => set({ environmentDialogOpen }),
  updateEntry: (group, id, patch) => set((state) => ({
    draft: { ...state.draft, [group]: state.draft[group].map((row) => row.id === id ? { ...row, ...patch } : row) },
  })),
  addEntry: (group) => set((state) => ({
    draft: { ...state.draft, [group]: [...state.draft[group], emptyRow()] },
  })),
  removeEntry: (group, id) => set((state) => ({
    draft: { ...state.draft, [group]: state.draft[group].filter((row) => row.id !== id) },
  })),
}));
