import { toast } from "sonner";
import { create } from "zustand";
import * as collectionsClient from "../features/collections/collections-client";
import * as historyClient from "../features/history/history-client";
import * as environmentClient from "../features/environments/environment-client";
import { cancelHttpRequest, executeHttpRequest } from "../features/request/request-client";
import { draftFromHistoryEntry, draftFromSavedRequest, serializeRequest, serializeSaveRequest } from "../features/request/request-serialization";
import { normalizeApplicationError } from "../lib/application-error";
import type { ApplicationError, AuthType, BodyMode, HttpMethod, HttpResponse, KeyValueEntry, RequestDraft, RequestEditorTab, ResponseBodyView, ResponseViewerTab } from "../types/http";
import type { Collection, Folder, HistorySummary, RequestSummary } from "../types/workspace";
import type { Environment, EnvironmentVariable, SaveVariableInput, SecretStoreStatus } from "../types/environment";
import type { RequestAssertion } from "../types/testing";

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
  auth: { type: "none", bearerToken: "", username: "", password: "", hasStoredSecret: false },
  timeoutMs: 30_000,
  assertions: [],
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
  requestTabs: RequestTabState[];
  activeRequestTabId: string;

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
  environments: Environment[];
  environmentVariables: EnvironmentVariable[];
  activeEnvironmentId: string | null;
  secretStoreStatus: SecretStoreStatus;

  setTheme: (theme: Theme) => void;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setName: (name: string) => void;
  setBodyMode: (bodyMode: BodyMode) => void;
  setBody: (body: string) => void;
  setAuthType: (type: AuthType) => void;
  updateAuth: (patch: Partial<RequestDraft["auth"]>) => void;
  setTimeoutMs: (timeoutMs: number) => void;
  setAssertions: (assertions: RequestAssertion[]) => void;
  setRequestTab: (tab: RequestEditorTab) => void;
  setResponseTab: (tab: ResponseViewerTab) => void;
  setResponseBodyView: (view: ResponseBodyView) => void;
  setEnvironmentDialogOpen: (open: boolean) => void;
  setSaveDialogOpen: (open: boolean) => void;
  updateEntry: (group: EntryGroup, id: string, patch: Partial<KeyValueEntry>) => void;
  addEntry: (group: EntryGroup) => void;
  removeEntry: (group: EntryGroup, id: string) => void;
  newRequest: () => void;
  activateRequestTab: (id: string) => void;
  closeRequestTab: (id: string) => void;
  saveAsDraft: () => Promise<void>;
  importDraft: (draft: RequestDraft) => void;
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
  moveFolder: (id: string, collectionId: string, parentId: string | null, position?: number) => Promise<boolean>;
  deleteFolder: (id: string) => Promise<void>;
  saveDraft: (collectionId?: string, folderId?: string | null) => Promise<void>;
  openSavedRequest: (id: string) => Promise<void>;
  renameRequest: (id: string, name: string) => Promise<void>;
  duplicateRequest: (id: string) => Promise<void>;
  moveRequest: (id: string, collectionId: string, folderId: string | null, position?: number) => Promise<boolean>;
  deleteRequest: (id: string) => Promise<void>;

  setHistorySearch: (search: string) => void;
  loadHistory: () => Promise<void>;
  openHistoryEntry: (id: string) => Promise<void>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadEnvironments: () => Promise<void>;
  createEnvironment: (name: string) => Promise<void>;
  renameEnvironment: (id: string, name: string) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (id: string | null) => Promise<void>;
  saveEnvironmentVariable: (variable: SaveVariableInput) => Promise<void>;
  deleteEnvironmentVariable: (id: string) => Promise<void>;
  unlockSecretStore: (password: string) => Promise<boolean>;
  lockSecretStore: () => Promise<void>;
}

export interface RequestTabState {
  id: string;
  draft: RequestDraft;
  dirty: boolean;
}

function updateActiveDraft(state: AppState, draft: RequestDraft, dirty = true) {
  return {
    draft,
    requestTabs: state.requestTabs.map((tab) =>
      tab.id === state.activeRequestTabId ? { ...tab, draft, dirty } : tab,
    ),
  };
}

const initialDraft = newDraft();

export const useAppStore = create<AppState>((set, get) => ({
  // Dark is Laika's default; the light "paper" theme is opt-in, and an explicit
  // OS light preference is still honoured on first launch.
  theme: window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  draft: initialDraft,
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
  requestTabs: [{ id: initialDraft.id, draft: initialDraft, dirty: false }],
  activeRequestTabId: initialDraft.id,

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
  environments: [],
  environmentVariables: [],
  activeEnvironmentId: null,
  secretStoreStatus: { initialized: false, unlocked: false },

  setTheme: (theme) => set({ theme }),
  setMethod: (method) => set((state) => updateActiveDraft(state, { ...state.draft, method })),
  setUrl: (url) => set((state) => updateActiveDraft(state, { ...state.draft, url })),
  setName: (name) => set((state) => updateActiveDraft(state, { ...state.draft, name })),
  setBodyMode: (bodyMode) => set((state) => updateActiveDraft(state, { ...state.draft, bodyMode })),
  setBody: (body) => set((state) => updateActiveDraft(state, { ...state.draft, body })),
  setAuthType: (type) => set((state) => updateActiveDraft(state, { ...state.draft, auth: { ...state.draft.auth, type, hasStoredSecret: type === state.draft.auth.type && state.draft.auth.hasStoredSecret } })),
  updateAuth: (patch) => set((state) => updateActiveDraft(state, {
    ...state.draft,
    auth: {
      ...state.draft.auth,
      ...patch,
      hasStoredSecret: ("bearerToken" in patch || "password" in patch) ? false : state.draft.auth.hasStoredSecret,
    },
  })),
  setTimeoutMs: (timeoutMs) => set((state) => updateActiveDraft(state, { ...state.draft, timeoutMs })),
  setAssertions: (assertions) => set((state) => updateActiveDraft(state, { ...state.draft, assertions })),
  setRequestTab: (requestTab) => set({ requestTab }),
  setResponseTab: (responseTab) => set({ responseTab }),
  setResponseBodyView: (responseBodyView) => set({ responseBodyView }),
  setEnvironmentDialogOpen: (environmentDialogOpen) => set({ environmentDialogOpen }),
  setSaveDialogOpen: (saveDialogOpen) => set({ saveDialogOpen }),
  updateEntry: (group, id, patch) => set((state) => updateActiveDraft(state, { ...state.draft, [group]: state.draft[group].map((row) => row.id === id ? { ...row, ...patch } : row) })),
  addEntry: (group) => set((state) => updateActiveDraft(state, { ...state.draft, [group]: [...state.draft[group], emptyRow()] })),
  removeEntry: (group, id) => set((state) => updateActiveDraft(state, { ...state.draft, [group]: state.draft[group].filter((row) => row.id !== id) })),
  newRequest: () => set((state) => {
    const draft = newDraft();
    return { draft, requestTabs: [...state.requestTabs, { id: draft.id, draft, dirty: false }], activeRequestTabId: draft.id, response: null, requestError: null, requestTab: "params" };
  }),
  activateRequestTab: (id) => set((state) => {
    const tab = state.requestTabs.find((item) => item.id === id);
    return tab ? { activeRequestTabId: id, draft: tab.draft, response: null, requestError: null } : {};
  }),
  closeRequestTab: (id) => set((state) => {
    const index = state.requestTabs.findIndex((tab) => tab.id === id);
    if (index < 0) return {};
    const remaining = state.requestTabs.filter((tab) => tab.id !== id);
    if (remaining.length === 0) {
      const draft = newDraft();
      return { requestTabs: [{ id: draft.id, draft, dirty: false }], activeRequestTabId: draft.id, draft, response: null, requestError: null };
    }
    if (id !== state.activeRequestTabId) return { requestTabs: remaining };
    const next = remaining[Math.min(index, remaining.length - 1)];
    return { requestTabs: remaining, activeRequestTabId: next.id, draft: next.draft, response: null, requestError: null };
  }),
  importDraft: (draft) => set((state) => ({ draft, requestTabs: [...state.requestTabs, { id: draft.id, draft, dirty: true }], activeRequestTabId: draft.id, response: null, requestError: null, requestTab: "params" })),

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
    await get().loadEnvironments();
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
  moveFolder: async (id, collectionId, parentId, targetPosition) => {
    const position = targetPosition ?? get().folders.filter(
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
        requestTabs: state.requestTabs.map((tab) => {
          const request = refreshed.value.requests.find((item) => item.id === tab.draft.savedRequestId);
          return request ? { ...tab, draft: { ...tab.draft, collectionId: request.collectionId, folderId: request.folderId } } : tab;
        }),
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
    set((state) => {
      const draft = {
        ...state.draft,
        savedRequestId: saved.id,
        collectionId: saved.collectionId,
        folderId: saved.folderId,
        auth: saved.hasAuthSecret
          ? { ...state.draft.auth, bearerToken: "", password: "", hasStoredSecret: true }
          : { ...state.draft.auth, hasStoredSecret: false },
      };
      return {
        ...updateActiveDraft(state, draft, false),
        saveDialogOpen: false,
        expandedNodes: { ...state.expandedNodes, [saved.collectionId]: true },
      };
    });
    toast.success("Request saved", { description: saved.name });
    await get().loadWorkspace();
  },
  openSavedRequest: async (id) => {
    const existing = get().requestTabs.find((tab) => tab.draft.savedRequestId === id);
    if (existing) {
      get().activateRequestTab(existing.id);
      return;
    }
    const opened = await attempt(() => collectionsClient.getSavedRequest(id));
    if (!opened.ok) return;
    const draft = draftFromSavedRequest(opened.value);
    set((state) => ({ draft, requestTabs: [...state.requestTabs, { id: draft.id, draft, dirty: false }], activeRequestTabId: draft.id, response: null, requestError: null, requestTab: "params" }));
  },
  renameRequest: async (id, name) => {
    const renamed = await attempt(() => collectionsClient.renameRequest(id, name));
    if (!renamed.ok) return;
    set((state) => ({
      requests: state.requests.map((item) => (item.id === id ? renamed.value : item)),
      draft: state.draft.savedRequestId === id ? { ...state.draft, name: renamed.value.name } : state.draft,
      requestTabs: state.requestTabs.map((tab) => tab.draft.savedRequestId === id ? { ...tab, draft: { ...tab.draft, name: renamed.value.name } } : tab),
    }));
  },
  duplicateRequest: async (id) => {
    const copied = await attempt(() => collectionsClient.duplicateRequest(id));
    if (!copied.ok) return;
    await get().loadWorkspace();
  },
  moveRequest: async (id, collectionId, folderId, targetPosition) => {
    const position = targetPosition ?? get().requests.filter(
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
        requestTabs: state.requestTabs.map((tab) => {
          const request = refreshed.value.requests.find((item) => item.id === tab.draft.savedRequestId);
          return request ? { ...tab, draft: { ...tab.draft, collectionId: request.collectionId, folderId: request.folderId } } : tab;
        }),
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
      requestTabs: state.requestTabs.map((tab) => tab.draft.savedRequestId === id ? { ...tab, dirty: true, draft: { ...tab.draft, savedRequestId: null } } : tab),
    }));
  },
  saveAsDraft: async () => {
    set((state) => updateActiveDraft(state, {
      ...state.draft,
      savedRequestId: null,
      name: state.draft.name.endsWith(" copy") ? state.draft.name : `${state.draft.name} copy`,
    }));
    const { collectionId, folderId } = get().draft;
    if (collectionId) await get().saveDraft(collectionId, folderId);
    else set({ saveDialogOpen: true });
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
    const draft = draftFromHistoryEntry(opened.value);
    set((state) => ({ draft, requestTabs: [...state.requestTabs, { id: draft.id, draft, dirty: false }], activeRequestTabId: draft.id, response: null, requestError: null, requestTab: "params" }));
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
  loadEnvironments: async () => {
    const [loaded, status] = await Promise.all([
      attempt(() => environmentClient.loadEnvironmentState()),
      attempt(() => environmentClient.secretStoreStatus()),
    ]);
    if (loaded.ok) set({ environments: loaded.value.environments, environmentVariables: loaded.value.variables, activeEnvironmentId: loaded.value.activeEnvironmentId });
    if (status.ok) set({ secretStoreStatus: status.value });
  },
  createEnvironment: async (name) => {
    const result = await attempt(() => environmentClient.createEnvironment(name));
    if (result.ok) await get().loadEnvironments();
  },
  renameEnvironment: async (id, name) => {
    const result = await attempt(() => environmentClient.renameEnvironment(id, name));
    if (result.ok) await get().loadEnvironments();
  },
  deleteEnvironment: async (id) => {
    const result = await attempt(() => environmentClient.deleteEnvironment(id));
    if (result.ok) await get().loadEnvironments();
  },
  setActiveEnvironment: async (id) => {
    const result = await attempt(() => environmentClient.setActiveEnvironment(id));
    if (result.ok) set({ activeEnvironmentId: id });
  },
  saveEnvironmentVariable: async (variable) => {
    const result = await attempt(() => environmentClient.saveEnvironmentVariable(variable));
    if (result.ok) await get().loadEnvironments();
  },
  deleteEnvironmentVariable: async (id) => {
    const result = await attempt(() => environmentClient.deleteEnvironmentVariable(id));
    if (result.ok) await get().loadEnvironments();
  },
  unlockSecretStore: async (password) => {
    const result = await attempt(() => environmentClient.unlockSecretStore(password));
    if (!result.ok) return false;
    set({ secretStoreStatus: result.value });
    return true;
  },
  lockSecretStore: async () => {
    const result = await attempt(() => environmentClient.lockSecretStore());
    if (result.ok) set({ secretStoreStatus: result.value });
  },
}));
