import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/use-app-store";
import type { HistorySummary } from "../../types/workspace";
import { HistoryPanel } from "./history-panel";

const historyClient = vi.hoisted(() => ({
  HISTORY_PAGE_SIZE: 100,
  listHistory: vi.fn(),
  getHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  clearHistory: vi.fn(),
}));

vi.mock("./history-client", () => historyClient);
vi.mock("../collections/collections-client", () => ({
  loadWorkspaceTree: vi.fn(),
  saveRequest: vi.fn(),
  getSavedRequest: vi.fn(),
}));
vi.mock("../request/request-client", () => ({
  executeHttpRequest: vi.fn(),
  cancelHttpRequest: vi.fn(),
}));

const entry = (patch: Partial<HistorySummary> = {}): HistorySummary => ({
  id: "history-1",
  requestId: null,
  name: "Untitled request",
  method: "GET",
  url: "https://api.example.com/users",
  status: 200,
  statusText: "OK",
  elapsedMs: 12,
  sizeBytes: 34,
  errorCode: null,
  createdAt: Date.now(),
  ...patch,
});

describe("HistoryPanel", () => {
  beforeEach(() => {
    historyClient.listHistory.mockReset().mockResolvedValue([]);
    historyClient.deleteHistoryEntry.mockReset().mockResolvedValue(null);
    useAppStore.setState({ history: [], historySearch: "", historyLoading: false });
  });

  /**
   * Requests sent before they are saved all record as "Untitled request", so
   * without the URL the rows are indistinguishable.
   */
  it("shows the URL so entries with the same name can be told apart", () => {
    useAppStore.setState({
      history: [
        entry({ id: "history-1", url: "https://api.example.com/users" }),
        entry({ id: "history-2", url: "http://127.0.0.1:8787/orders" }),
      ],
    });

    render(<HistoryPanel />);

    expect(screen.getByText("https://api.example.com/users")).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:8787/orders")).toBeInTheDocument();
    expect(screen.getAllByText("Untitled request")).toHaveLength(2);
  });

  it("reports the outcome of a failed request", () => {
    useAppStore.setState({
      history: [entry({ status: null, statusText: null, elapsedMs: null, errorCode: "NETWORK_ERROR" })],
    });

    render(<HistoryPanel />);

    expect(screen.getByText("ERR")).toBeInTheDocument();
    expect(screen.getByText("NETWORK_ERROR")).toBeInTheDocument();
  });

  it("names each delete control by its request so they stay distinguishable", async () => {
    useAppStore.setState({ history: [entry({ url: "https://api.example.com/users" })] });

    render(<HistoryPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Delete history entry for GET https://api.example.com/users" }));

    await waitFor(() => expect(historyClient.deleteHistoryEntry).toHaveBeenCalledWith("history-1"));
  });

  it("explains an empty search separately from an empty history", () => {
    useAppStore.setState({ history: [], historySearch: "orders" });

    render(<HistoryPanel />);

    expect(screen.getByText("No matching entries")).toBeInTheDocument();
  });
});
