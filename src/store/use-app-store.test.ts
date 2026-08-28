import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryEntry, HistorySummary, SavedRequest, WorkspaceTree } from "../types/workspace";
import { useAppStore } from "./use-app-store";

const collections = vi.hoisted(() => ({
  loadWorkspaceTree: vi.fn(),
  createCollection: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveFolder: vi.fn(),
  saveRequest: vi.fn(),
  getSavedRequest: vi.fn(),
  renameRequest: vi.fn(),
  duplicateRequest: vi.fn(),
  moveRequest: vi.fn(),
  deleteRequest: vi.fn(),
}));

const history = vi.hoisted(() => ({
  HISTORY_PAGE_SIZE: 100,
  listHistory: vi.fn(),
  getHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  clearHistory: vi.fn(),
}));

vi.mock("../features/collections/collections-client", () => collections);
vi.mock("../features/history/history-client", () => history);
vi.mock("../features/request/request-client", () => ({
  executeHttpRequest: vi.fn(),
  cancelHttpRequest: vi.fn(),
}));

const tree = (): WorkspaceTree => ({
  workspaceId: "workspace-1",
  collections: [{ id: "collection-1", name: "APIs", description: "", position: 0, createdAt: 1, updatedAt: 1 }],
  folders: [{ id: "folder-1", collectionId: "collection-1", parentId: null, name: "Users", position: 0 }],
  requests: [
    { id: "saved-1", collectionId: "collection-1", folderId: "folder-1", name: "List users", method: "GET", url: "https://example.com/users", position: 0 },
  ],
});

const savedRequest = (): SavedRequest => ({
  id: "saved-1",
  collectionId: "collection-1",
  folderId: "folder-1",
  name: "List users",
  method: "GET",
  url: "https://example.com/users",
  params: [],
  headers: [],
  bodyMode: "none",
  body: "",
  form: [],
      auth: { type: "none" },
      hasAuthSecret: false,
  timeoutMs: 30_000,
});

const historyEntry = (): HistorySummary => ({
  id: "history-1",
  requestId: "saved-1",
  name: "List users",
  method: "GET",
  url: "https://example.com/users",
  status: 200,
  statusText: "OK",
  elapsedMs: 12,
  sizeBytes: 34,
  errorCode: null,
  createdAt: 1_700_000_000_000,
});

describe("workspace store", () => {
  beforeEach(() => {
    for (const mock of [...Object.values(collections), ...Object.values(history)]) {
      if (typeof mock === "function") mock.mockReset();
    }
    collections.loadWorkspaceTree.mockResolvedValue(tree());
    history.listHistory.mockResolvedValue([historyEntry()]);
    const draft = { ...useAppStore.getState().draft, id: crypto.randomUUID(), savedRequestId: null, collectionId: null, folderId: null, name: "Untitled request" };
    useAppStore.setState({
      collections: [],
      folders: [],
      requests: [],
      history: [],
      historySearch: "",
      workspaceError: null,
      saveDialogOpen: false,
      draft,
      requestTabs: [{ id: draft.id, draft, dirty: false }],
      activeRequestTabId: draft.id,
    });
  });

  it("loads the tree and history together", async () => {
    await useAppStore.getState().loadWorkspace();

    const state = useAppStore.getState();
    expect(state.workspaceId).toBe("workspace-1");
    expect(state.collections).toHaveLength(1);
    expect(state.requests[0].name).toBe("List users");
    expect(state.history).toHaveLength(1);
    expect(state.workspaceLoading).toBe(false);
  });

  it("surfaces a recoverable error instead of throwing when the database is unavailable", async () => {
    collections.loadWorkspaceTree.mockRejectedValue({ code: "DATABASE_UNAVAILABLE" });

    await useAppStore.getState().loadWorkspace();

    const state = useAppStore.getState();
    expect(state.workspaceError?.code).toBe("DATABASE_UNAVAILABLE");
    expect(state.workspaceLoading).toBe(false);
  });

  it("asks where to save a draft that has no target yet", async () => {
    await useAppStore.getState().saveDraft();

    expect(collections.saveRequest).not.toHaveBeenCalled();
    expect(useAppStore.getState().saveDialogOpen).toBe(true);
  });

  it("keeps edits isolated across request tabs and marks them dirty", () => {
    const firstId = useAppStore.getState().activeRequestTabId;
    useAppStore.getState().setUrl("https://first.example");
    expect(useAppStore.getState().requestTabs[0].dirty).toBe(true);

    useAppStore.getState().newRequest();
    const secondId = useAppStore.getState().activeRequestTabId;
    useAppStore.getState().setUrl("https://second.example");
    useAppStore.getState().activateRequestTab(firstId);
    expect(useAppStore.getState().draft.url).toBe("https://first.example");

    useAppStore.getState().closeRequestTab(firstId);
    expect(useAppStore.getState().activeRequestTabId).toBe(secondId);
    expect(useAppStore.getState().draft.url).toBe("https://second.example");
  });

  it("links the draft to the stored row after saving", async () => {
    collections.saveRequest.mockResolvedValue(savedRequest());

    await useAppStore.getState().saveDraft("collection-1", "folder-1");

    expect(collections.saveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: "collection-1", folderId: "folder-1" }),
    );
    const { draft } = useAppStore.getState();
    expect(draft.savedRequestId).toBe("saved-1");
    expect(draft.collectionId).toBe("collection-1");
    expect(useAppStore.getState().saveDialogOpen).toBe(false);
  });

  it("reuses the existing target on a repeat save", async () => {
    collections.saveRequest.mockResolvedValue(savedRequest());
    useAppStore.setState({
      draft: { ...useAppStore.getState().draft, savedRequestId: "saved-1", collectionId: "collection-1", folderId: "folder-1" },
    });

    await useAppStore.getState().saveDraft();

    expect(collections.saveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "saved-1", collectionId: "collection-1", folderId: "folder-1" }),
    );
    expect(useAppStore.getState().saveDialogOpen).toBe(false);
  });

  it("opens a saved request into the editor", async () => {
    collections.getSavedRequest.mockResolvedValue({ ...savedRequest(), name: "Reopened", url: "https://example.com/reopened" });

    await useAppStore.getState().openSavedRequest("saved-1");

    const { draft, response } = useAppStore.getState();
    expect(draft.name).toBe("Reopened");
    expect(draft.url).toBe("https://example.com/reopened");
    expect(draft.savedRequestId).toBe("saved-1");
    expect(response).toBeNull();
  });

  it("unlinks the editor when the request behind it is deleted", async () => {
    // A Tauri command returning `()` resolves to null, not undefined.
    collections.deleteRequest.mockResolvedValue(null);
    useAppStore.setState({
      requests: tree().requests,
      draft: { ...useAppStore.getState().draft, savedRequestId: "saved-1" },
    });

    await useAppStore.getState().deleteRequest("saved-1");

    expect(useAppStore.getState().requests).toHaveLength(0);
    expect(useAppStore.getState().draft.savedRequestId).toBeNull();
  });

  it("moves a request and keeps the open draft linked to its new destination", async () => {
    collections.moveRequest.mockResolvedValue(null);
    collections.loadWorkspaceTree.mockResolvedValue({
      ...tree(),
      collections: [
        ...tree().collections,
        { id: "collection-2", name: "Production", description: "", position: 1, createdAt: 1, updatedAt: 1 },
      ],
      folders: [
        ...tree().folders,
        { id: "folder-2", collectionId: "collection-2", parentId: null, name: "Live", position: 0 },
      ],
      requests: [
        { ...tree().requests[0], collectionId: "collection-2", folderId: "folder-2", position: 0 },
      ],
    });
    useAppStore.setState({
      ...tree(),
      draft: {
        ...useAppStore.getState().draft,
        savedRequestId: "saved-1",
        collectionId: "collection-1",
        folderId: "folder-1",
      },
    });

    const moved = await useAppStore.getState().moveRequest("saved-1", "collection-2", "folder-2");

    expect(moved).toBe(true);
    expect(collections.moveRequest).toHaveBeenCalledWith("saved-1", "collection-2", "folder-2", 0);
    expect(useAppStore.getState().draft.collectionId).toBe("collection-2");
    expect(useAppStore.getState().draft.folderId).toBe("folder-2");
  });

  it("reloads the canonical subtree after moving a folder", async () => {
    collections.moveFolder.mockResolvedValue(null);
    collections.loadWorkspaceTree.mockResolvedValue({
      ...tree(),
      folders: [{ ...tree().folders[0], parentId: "folder-2", position: 0 }],
    });
    useAppStore.setState(tree());

    const moved = await useAppStore.getState().moveFolder("folder-1", "collection-1", "folder-2");

    expect(moved).toBe(true);
    expect(collections.moveFolder).toHaveBeenCalledWith("folder-1", "collection-1", "folder-2", 0);
    expect(useAppStore.getState().folders[0].parentId).toBe("folder-2");
  });

  it("reopens a history entry as an unsaved draft", async () => {
    const entry: HistoryEntry = {
      ...historyEntry(),
      request: {
        method: "POST",
        url: "https://example.com/orders",
        params: [],
        headers: [],
        bodyMode: "json",
        body: "{}",
        form: [],
        authType: "none",
        authUsername: "",
        timeoutMs: 15_000,
      },
      responseHeaders: [],
      responseBody: null,
      responseTruncated: false,
    };
    history.getHistoryEntry.mockResolvedValue(entry);

    await useAppStore.getState().openHistoryEntry("history-1");

    const { draft } = useAppStore.getState();
    expect(draft.method).toBe("POST");
    expect(draft.url).toBe("https://example.com/orders");
    expect(draft.savedRequestId).toBeNull();
  });

  it("searches history through the backend rather than filtering locally", async () => {
    useAppStore.getState().setHistorySearch("orders");
    await vi.waitFor(() => expect(history.listHistory).toHaveBeenCalledWith("orders"));
  });

  it("clears the history list", async () => {
    history.clearHistory.mockResolvedValue(3);
    useAppStore.setState({ history: [historyEntry()] });

    await useAppStore.getState().clearHistory();

    expect(useAppStore.getState().history).toHaveLength(0);
  });
});
