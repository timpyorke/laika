import { create } from "zustand";
import { cancelHttpRequest, executeHttpRequest } from "../features/request/request-client";
import { serializeRequest } from "../features/request/request-serialization";
import { normalizeApplicationError } from "../lib/application-error";
import type { ApplicationError, AuthType, BodyMode, HttpMethod, HttpResponse, KeyValueEntry, RequestDraft, RequestEditorTab, ResponseBodyView, ResponseViewerTab } from "../types/http";

const emptyRow = (): KeyValueEntry => ({ id: crypto.randomUUID(), enabled: true, key: "", value: "" });

const initialDraft: RequestDraft = {
  id: crypto.randomUUID(),
  name: "Untitled request",
  method: "GET",
  url: "",
  params: [emptyRow()],
  headers: [emptyRow()],
  body: "",
  bodyMode: "none",
  form: [emptyRow()],
  auth: { type: "none", bearerToken: "", username: "", password: "" },
  timeoutMs: 30_000,
};

type Theme = "light" | "dark";
type EntryGroup = "params" | "headers" | "form";

interface AppState {
  theme: Theme;
  draft: RequestDraft;
  requestTab: RequestEditorTab;
  responseTab: ResponseViewerTab;
  responseBodyView: ResponseBodyView;
  environmentDialogOpen: boolean;
  response: HttpResponse | null;
  requestError: ApplicationError | null;
  activeRequestId: string | null;
  isSending: boolean;
  setTheme: (theme: Theme) => void;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setBodyMode: (bodyMode: BodyMode) => void;
  setBody: (body: string) => void;
  setAuthType: (type: AuthType) => void;
  updateAuth: (patch: Partial<RequestDraft["auth"]>) => void;
  setTimeoutMs: (timeoutMs: number) => void;
  setRequestTab: (tab: RequestEditorTab) => void;
  setResponseTab: (tab: ResponseViewerTab) => void;
  setResponseBodyView: (view: ResponseBodyView) => void;
  setEnvironmentDialogOpen: (open: boolean) => void;
  updateEntry: (group: EntryGroup, id: string, patch: Partial<KeyValueEntry>) => void;
  addEntry: (group: EntryGroup) => void;
  removeEntry: (group: EntryGroup, id: string) => void;
  sendRequest: () => Promise<void>;
  cancelRequest: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  draft: initialDraft,
  requestTab: "params",
  responseTab: "body",
  responseBodyView: "pretty",
  environmentDialogOpen: false,
  response: null,
  requestError: null,
  activeRequestId: null,
  isSending: false,
  setTheme: (theme) => set({ theme }),
  setMethod: (method) => set((state) => ({ draft: { ...state.draft, method } })),
  setUrl: (url) => set((state) => ({ draft: { ...state.draft, url } })),
  setBodyMode: (bodyMode) => set((state) => ({ draft: { ...state.draft, bodyMode } })),
  setBody: (body) => set((state) => ({ draft: { ...state.draft, body } })),
  setAuthType: (type) => set((state) => ({ draft: { ...state.draft, auth: { ...state.draft.auth, type } } })),
  updateAuth: (patch) => set((state) => ({ draft: { ...state.draft, auth: { ...state.draft.auth, ...patch } } })),
  setTimeoutMs: (timeoutMs) => set((state) => ({ draft: { ...state.draft, timeoutMs } })),
  setRequestTab: (requestTab) => set({ requestTab }),
  setResponseTab: (responseTab) => set({ responseTab }),
  setResponseBodyView: (responseBodyView) => set({ responseBodyView }),
  setEnvironmentDialogOpen: (environmentDialogOpen) => set({ environmentDialogOpen }),
  updateEntry: (group, id, patch) => set((state) => ({
    draft: { ...state.draft, [group]: state.draft[group].map((row) => row.id === id ? { ...row, ...patch } : row) },
  })),
  addEntry: (group) => set((state) => ({ draft: { ...state.draft, [group]: [...state.draft[group], emptyRow()] } })),
  removeEntry: (group, id) => set((state) => ({ draft: { ...state.draft, [group]: state.draft[group].filter((row) => row.id !== id) } })),
  sendRequest: async () => {
    if (get().isSending) return;
    const requestId = crypto.randomUUID();
    const request = serializeRequest(get().draft, requestId);
    set({ isSending: true, activeRequestId: requestId, requestError: null, response: null });
    try {
      const response = await executeHttpRequest(request);
      set({ response, responseTab: "body", responseBodyView: "pretty" });
    } catch (error) {
      set({ requestError: normalizeApplicationError(error) });
    } finally {
      if (get().activeRequestId === requestId) set({ isSending: false, activeRequestId: null });
    }
  },
  cancelRequest: async () => {
    const requestId = get().activeRequestId;
    if (requestId) await cancelHttpRequest(requestId);
  },
}));
