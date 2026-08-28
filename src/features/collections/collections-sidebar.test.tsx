import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/use-app-store";
import type { WorkspaceTree } from "../../types/workspace";
import { CollectionsSidebar } from "./collections-sidebar";

const collectionsClient = vi.hoisted(() => ({
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

const historyClient = vi.hoisted(() => ({
  listHistory: vi.fn(),
  getHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  clearHistory: vi.fn(),
}));

vi.mock("./collections-client", () => collectionsClient);
vi.mock("../history/history-client", () => historyClient);
vi.mock("../request/request-client", () => ({ executeHttpRequest: vi.fn(), cancelHttpRequest: vi.fn() }));

const workspace = (): WorkspaceTree => ({
  workspaceId: "workspace-1",
  collections: [
    { id: "collection-1", name: "APIs", description: "", position: 0, createdAt: 1, updatedAt: 1 },
    { id: "collection-2", name: "Production", description: "", position: 1, createdAt: 1, updatedAt: 1 },
  ],
  folders: [
    { id: "folder-1", collectionId: "collection-1", parentId: null, name: "Users", position: 0 },
    { id: "folder-child", collectionId: "collection-1", parentId: "folder-1", name: "Archived", position: 0 },
    { id: "folder-other", collectionId: "collection-1", parentId: null, name: "Orders", position: 1 },
    { id: "folder-2", collectionId: "collection-2", parentId: null, name: "Live", position: 0 },
  ],
  requests: [
    { id: "request-1", collectionId: "collection-1", folderId: "folder-1", name: "List users", method: "GET", url: "https://example.com/users", position: 0 },
  ],
});

describe("collections sidebar moving", () => {
  beforeEach(() => {
    for (const mock of [...Object.values(collectionsClient), ...Object.values(historyClient)]) mock.mockReset();
    historyClient.listHistory.mockResolvedValue([]);
    useAppStore.setState({
      ...workspace(),
      workspaceLoading: false,
      workspaceError: null,
      collectionSearch: "",
      expandedNodes: { "collection-1": true, "folder-1": true, "collection-2": true },
    });
  });

  it("moves a request to a folder in another collection", async () => {
    const user = userEvent.setup();
    const movedWorkspace = workspace();
    movedWorkspace.requests = [
      { ...movedWorkspace.requests[0], collectionId: "collection-2", folderId: "folder-2", position: 0 },
    ];
    collectionsClient.moveRequest.mockResolvedValue(null);
    collectionsClient.loadWorkspaceTree.mockResolvedValue(movedWorkspace);
    render(<CollectionsSidebar />);

    await user.click(screen.getByRole("button", { name: "Move List users" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Destination collection"), "collection-2");
    await user.selectOptions(within(dialog).getByLabelText("Destination folder"), "folder-2");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    await waitFor(() => expect(collectionsClient.moveRequest).toHaveBeenCalledWith(
      "request-1", "collection-2", "folder-2", 0,
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not offer a folder or its descendants as its own destination", async () => {
    const user = userEvent.setup();
    collectionsClient.moveFolder.mockResolvedValue(null);
    collectionsClient.loadWorkspaceTree.mockResolvedValue({
      ...workspace(),
      folders: workspace().folders.map((folder) => (
        folder.id === "folder-1" ? { ...folder, parentId: "folder-other", position: 0 } : folder
      )),
    });
    render(<CollectionsSidebar />);

    await user.click(screen.getByRole("button", { name: "Move Users" }));
    const dialog = screen.getByRole("dialog");
    const destination = within(dialog).getByLabelText("Destination folder");
    expect(within(destination).queryByRole("option", { name: "Users" })).not.toBeInTheDocument();
    expect(within(destination).queryByRole("option", { name: "Users / Archived" })).not.toBeInTheDocument();

    await user.selectOptions(destination, "folder-other");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    await waitFor(() => expect(collectionsClient.moveFolder).toHaveBeenCalledWith(
      "folder-1", "collection-1", "folder-other", 0,
    ));
  });
});
