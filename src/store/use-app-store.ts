import { toast } from "sonner";
import { create } from "zustand";
import * as collectionsClient from "../features/collections/collections-client";
import * as historyClient from "../features/history/history-client";
import { cancelHttpRequest, executeHttpRequest } from "../features/request/request-client";
import { draftFromHistoryEntry, draftFromSavedRequest, serializeRequest, serializeSaveRequest } from "../features/request/request-serialization";
import { normalizeApplicationError } from "../lib/application-error";
import type { ApplicationError, AuthType, BodyMode, HttpMethod, HttpResponse, KeyValueEntry, RequestDraft, RequestEditorTab, ResponseBodyView, ResponseViewerTab } from "../types/http";
import type { Collection, Folder, HistorySummary, RequestSummary } from "../types/workspace";

const emptyRow = (): KeyValueEntry => ({ id: crypto.randomUUID(), enabled: true, key: "", value: "" });

const newDraft = (): RequestDraft => ({
  id: crypto.randomUUID(),
  name: "Untitled request",
  savedRequestId: null,
  collectionId: null,
  folderId: null,
  method: "GET",
  url: "",
  params: [emptyRow()],
  headers: [emptyRow()],
  body: "",
  bodyMode: "none",
  form: [emptyRow()],
  auth: { type: "none", bearerToken: "", username: "", password: "" },
  timeoutMs: 30_000,
});

type Theme = "light" | "dark";
type EntryGroup = "params" | "headers" | "form";

type Attempt<T> = { ok: true; value: T } | { ok: false };

/**
 * Runs a workspace command and reports failures through a notification.
 *
 * Success is reported through the `ok` flag rather than the value, because a
 * command returning `()` arrives as `null` and must not be mistaken for a
 * failure.
 */
async function attempt<T>(operation: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const applicationError = normalizeApplicationError(error);
    toast.error(applicationError.title, { description: applicationError.message });
    return { ok: false };
  }
}

interface AppState {
  theme: Theme;
  draft: RequestDraft;
  requestTab: RequestEditorTab;
  responseTab: ResponseViewerTab;
  responseBodyView: ResponseBodyView;
  environmentDialogOpen: boolean;
  saveDialogOpen: boolean;
  response: HttpResponse | null;
  requestError: ApplicationError | null;
  activeRequestId: string | null;
  isSending: boolean;
  isSaving: boolean;

  workspaceId: string | null;
  collections: Collection[];
  folders: Folder[];
  requests: RequestSummary[];
  workspaceLoading: boolean;
  workspaceError: ApplicationError | null;
  collectionSearch: string;
  expandedNodes: Record<string, boolean>;
  history: HistorySummary[];
  historySearch: string;
  historyLoading: boolean;

  setTheme: (theme: Theme) => void;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setName: (name: string) => void;
  setBodyMode: (bodyMode: BodyMode) => void;
  setBody: (body: string) => void;
  setAuthType: (type: AuthType) => void;
  updateAuth: (patch: Partial<RequestDraft["auth"]>) => void;
  setTimeoutMs: (timeoutMs: number) => void;
  setRequestTab: (tab: RequestEditorTab) => void;
  setResponseTab: (tab: ResponseViewerTab) => void;
  setResponseBodyView: (view: ResponseBodyView) => void;
  setEnvironmentDialogOpen: (open: boolean) => void;
  setSaveDialogOpen: (open: boolean) => void;
  updateEntry: (group: EntryGroup, id: string, patch: Partial<KeyValueEntry>) => void;
  addEntry: (group: EntryGroup) => void;
  removeEntry: (group: EntryGroup, id: string) => void;
  newRequest: () => void;
  sendRequest: () => Promise<void>;
  cancelRequest: () => Promise<void>;

  loadWorkspace: () => Promise<void>;
  setCollectionSearch: (search: string) => void;
  toggleNode: (id: string) => void;
  createCollection: (name: string) => Promise<Collection | null>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  createFolder: (collectionId: string, parentId: string | null, name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, collectionId: string, parentId: string | null) => Promise<boolean>;
  deleteFolder: (id: string) => Promise<void>;
  saveDraft: (collectionId?: string, folderId?: string | null) => Promise<void>;
  openSavedRequest: (id: string) => Promise<void>;
  renameRequest: (id: string, name: string) => Promise<void>;
  duplicateRequest: (id: string) => Promise<void>;
  moveRequest: (id: string, collectionId: string, folderId: string | null) => Promise<boolean>;
  deleteRequest: (id: string) => Promise<void>;

  setHistorySearch: (search: string) => void;
  loadHistory: () => Promise<void>;
  openHistoryEntry: (id: string) => Promise<void>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  draft: newDraft(),
  requestTab: "params",
  responseTab: "body",
  responseBodyView: "pretty",
  environmentDialogOpen: false,
  saveDialogOpen: false,
  response: null,
  requestError: null,
  activeRequestId: null,
  isSending: false,
  isSaving: false,

  workspaceId: null,
  collections: [],
  folders: [],
  requests: [],
  workspaceLoading: true,
  workspaceError: null,
  collectionSearch: "",
  expandedNodes: {},
  history: [],
  historySearch: "",
  historyLoading: false,

  setTheme: (theme) => set({ theme }),
  setMethod: (method) => set((state) => ({ draft: { ...state.draft, method } })),
  setUrl: (url) => set((state) => ({ draft: { ...state.draft, url } })),
  setName: (name) => set((state) => ({ draft: { ...state.draft, name } })),
  setBodyMode: (bodyMode) => set((state) => ({ draft: { ...state.draft, bodyMode } })),
  setBody: (body) => set((state) => ({ draft: { ...state.draft, body } })),
  setAuthType: (type) => set((state) => ({ draft: { ...state.draft, auth: { ...state.draft.auth, type } } })),
  updateAuth: (patch) => set((state) => ({ draft: { ...state.draft, auth: { ...state.draft.auth, ...patch } } })),
  setTimeoutMs: (timeoutMs) => set((state) => ({ draft: { ...state.draft, timeoutMs } })),
  setRequestTab: (requestTab) => set({ requestTab }),
  setResponseTab: (responseTab) => set({ responseTab }),
  setResponseBodyView: (responseBodyView) => set({ responseBodyView }),
  setEnvironmentDialogOpen: (environmentDialogOpen) => set({ environmentDialogOpen }),
  setSaveDialogOpen: (saveDialogOpen) => set({ saveDialogOpen }),
  updateEntry: (group, id, patch) => set((state) => ({
    draft: { ...state.draft, [group]: state.draft[group].map((row) => row.id === id ? { ...row, ...patch } : row) },
  })),
  addEntry: (group) => set((state) => ({ draft: { ...state.draft, [group]: [...state.draft[group], emptyRow()] } })),
  removeEntry: (group, id) => set((state) => ({ draft: { ...state.draft, [group]: state.draft[group].filter((row) => row.id !== id) } })),
  newRequest: () => set({ draft: newDraft(), response: null, requestError: null, requestTab: "params" }),

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
      // The backend writes the history entry as part of the same command, so
      // the list is only refreshed once the request has settled.
      void get().loadHistory();
    }
  },
  cancelRequest: async () => {
    const requestId = get().activeRequestId;
    if (requestId) await cancelHttpRequest(requestId);
  },

  loadWorkspace: async () => {
    set({ workspaceLoading: true });
    try {
      const tree = await collectionsClient.loadWorkspaceTree();
      set({
        workspaceId: tree.workspaceId,
        collections: tree.collections,
        folders: tree.folders,
        requests: tree.requests,
        workspaceError: null,
      });
    } catch (error) {
      set({ workspaceError: normalizeApplicationError(error) });
    } finally {
      set({ workspaceLoading: false });
    }
    await get().loadHistory();
  },
  setCollectionSearch: (collectionSearch) => set({ collectionSearch }),
  toggleNode: (id) => set((state) => ({ expandedNodes: { ...state.expandedNodes, [id]: !state.expandedNodes[id] } })),

  createCollection: async (name) => {
    const created = await attempt(() => collectionsClient.createCollection(name));
    if (!created.ok) return null;
    set((state) => ({
      collections: [...state.collections, created.value],
      expandedNodes: { ...state.expandedNodes, [created.value.id]: true },
    }));
    return created.value;
  },
  renameCollection: async (id, name) => {
    const renamed = await attempt(() => collectionsClient.renameCollection(id, name));
    if (!renamed.ok) return;
    set((state) => ({ collections: state.collections.map((item) => (item.id === id ? renamed.value : item)) }));
  },
  deleteCollection: async (id) => {
    const deleted = await attempt(() => collectionsClient.deleteCollection(id));
    if (!deleted.ok) return;
    await get().loadWorkspace();
  },

  createFolder: async (collectionId, parentId, name) => {
    const created = await attempt(() => collectionsClient.createFolder(collectionId, parentId, name));
    if (!created.ok) return;
    set((state) => ({
      folders: [...state.folders, created.value],
      expandedNodes: { ...state.expandedNodes, [created.value.id]: true },
    }));
  },
  renameFolder: async (id, name) => {
    const renamed = await attempt(() => collectionsClient.renameFolder(id, name));
    if (!renamed.ok) return;
    set((state) => ({ folders: state.folders.map((item) => (item.id === id ? renamed.value : item)) }));
  },
  moveFolder: async (id, collectionId, parentId) => {
    const position = get().folders.filter(
      (folder) => folder.id !== id && folder.collectionId === collectionId && folder.parentId === parentId,
    ).length;
    const moved = await attempt(() => collectionsClient.moveFolder(id, collectionId, parentId, position));
    if (!moved.ok) return false;

    // Reload the canonical tree because moving a folder across collections also
    // moves every descendant folder and saved request in that subtree.
    const refreshed = await attempt(() => collectionsClient.loadWorkspaceTree());
    // The move has already committed. Close the dialog even if refreshing the
    // tree fails; `attempt` reports the refresh problem and a later reload will
    // recover the canonical state without repeating the move.
    if (!refreshed.ok) return true;
    set((state) => {
      const openRequest = refreshed.value.requests.find((request) => request.id === state.draft.savedRequestId);
      return {
        workspaceId: refreshed.value.workspaceId,
        collections: refreshed.value.collections,
        folders: refreshed.value.folders,
        requests: refreshed.value.requests,
        workspaceError: null,
        expandedNodes: { ...state.expandedNodes, [collectionId]: true, ...(parentId ? { [parentId]: true } : {}) },
        draft: openRequest
          ? { ...state.draft, collectionId: openRequest.collectionId, folderId: openRequest.folderId }
          : state.draft,
      };
    });
    return true;
  },
  deleteFolder: async (id) => {
    const deleted = await attempt(() => collectionsClient.deleteFolder(id));
    if (!deleted.ok) return;
    await get().loadWorkspace();
  },

  saveDraft: async (collectionId, folderId) => {
    const { draft } = get();
    const targetCollection = collectionId ?? draft.collectionId;
    if (!targetCollection) {
      set({ saveDialogOpen: true });
      return;
    }
    const target = folderId === undefined ? draft.folderId : folderId;
    set({ isSaving: true });
    const result = await attempt(() => collectionsClient.saveRequest(serializeSaveRequest(draft, targetCollection, target)));
    set({ isSaving: false });
    if (!result.ok) return;
    const saved = result.value;
    set((state) => ({
      draft: { ...state.draft, savedRequestId: saved.id, collectionId: saved.collectionId, folderId: saved.folderId },
      saveDialogOpen: false,
      expandedNodes: { ...state.expandedNodes, [saved.collectionId]: true },
    }));
    toast.success("Request saved", { description: saved.name });
    await get().loadWorkspace();
  },
  openSavedRequest: async (id) => {
    const opened = await attempt(() => collectionsClient.getSavedRequest(id));
    if (!opened.ok) return;
    set({ draft: draftFromSavedRequest(opened.value), response: null, requestError: null, requestTab: "params" });
  },
  renameRequest: async (id, name) => {
    const renamed = await attempt(() => collectionsClient.renameRequest(id, name));
    if (!renamed.ok) return;
    set((state) => ({
      requests: state.requests.map((item) => (item.id === id ? renamed.value : item)),
      draft: state.draft.savedRequestId === id ? { ...state.draft, name: renamed.value.name } : state.draft,
    }));
  },
  duplicateRequest: async (id) => {
    const copied = await attempt(() => collectionsClient.duplicateRequest(id));
    if (!copied.ok) return;
    await get().loadWorkspace();
  },
  moveRequest: async (id, collectionId, folderId) => {
    const position = get().requests.filter(
      (request) => request.id !== id && request.collectionId === collectionId && request.folderId === folderId,
    ).length;
    const moved = await attempt(() => collectionsClient.moveRequest(id, collectionId, folderId, position));
    if (!moved.ok) return false;

    const refreshed = await attempt(() => collectionsClient.loadWorkspaceTree());
    if (!refreshed.ok) return true;
    set((state) => {
      const openRequest = refreshed.value.requests.find((request) => request.id === state.draft.savedRequestId);
      return {
        workspaceId: refreshed.value.workspaceId,
        collections: refreshed.value.collections,
        folders: refreshed.value.folders,
        requests: refreshed.value.requests,
        workspaceError: null,
        expandedNodes: { ...state.expandedNodes, [collectionId]: true, ...(folderId ? { [folderId]: true } : {}) },
        draft: openRequest
          ? { ...state.draft, collectionId: openRequest.collectionId, folderId: openRequest.folderId }
          : state.draft,
      };
    });
    return true;
  },
  deleteRequest: async (id) => {
    const deleted = await attempt(() => collectionsClient.deleteRequest(id));
    if (!deleted.ok) return;
    set((state) => ({
      requests: state.requests.filter((item) => item.id !== id),
      // The editor keeps its contents but is no longer linked to a stored row.
      draft: state.draft.savedRequestId === id ? { ...state.draft, savedRequestId: null } : state.draft,
    }));
  },

  setHistorySearch: (historySearch) => {
    set({ historySearch });
    void get().loadHistory();
  },
  loadHistory: async () => {
    set({ historyLoading: true });
    const search = get().historySearch.trim();
    const loaded = await attempt(() => historyClient.listHistory(search === "" ? null : search));
    set({ historyLoading: false, ...(loaded.ok ? { history: loaded.value } : {}) });
  },
  openHistoryEntry: async (id) => {
    const opened = await attempt(() => historyClient.getHistoryEntry(id));
    if (!opened.ok) return;
    set({ draft: draftFromHistoryEntry(opened.value), response: null, requestError: null, requestTab: "params" });
  },
  deleteHistoryEntry: async (id) => {
    const deleted = await attempt(() => historyClient.deleteHistoryEntry(id));
    if (!deleted.ok) return;
    set((state) => ({ history: state.history.filter((entry) => entry.id !== id) }));
  },
  clearHistory: async () => {
    const cleared = await attempt(() => historyClient.clearHistory());
    if (!cleared.ok) return;
    set({ history: [] });
    toast.success(cleared.value === 1 ? "1 history entry cleared" : `${cleared.value} history entries cleared`);
  },
}));
