import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/use-app-store";
import type { TestRun } from "../../types/testing";
import { TestRunnerPanel } from "./test-runner-panel";

const client = vi.hoisted(() => ({ runCollection: vi.fn(), listTestRuns: vi.fn(), getTestRun: vi.fn(), exportTestRun: vi.fn() }));
vi.mock("./testing-client", () => client);

const run: TestRun = {
  id: "run-1", collectionId: "collection-1", collectionName: "Checks", environmentId: "environment-1", environmentName: "Staging",
  status: "failed", totalRequests: 1, passedRequests: 0, failedRequests: 1, durationMs: 18, createdAt: 1,
  results: [{ id: "case-1", requestId: "request-1", requestName: "Health", method: "GET", url: "{{baseUrl}}/health", status: "failed", responseStatus: 503, elapsedMs: 18, errorCode: null, position: 0,
    assertionResults: [{ id: "assertion-1", assertionId: "assertion-1", kind: "status", operator: "equals", target: "", expected: "200", actual: "503", passed: false, message: "status: expected equals 200, actual 503" }] }],
};

describe("TestRunnerPanel", () => {
  beforeEach(() => {
    for (const mock of Object.values(client)) mock.mockReset();
    client.listTestRuns.mockResolvedValue([]);
    client.runCollection.mockResolvedValue(run);
    useAppStore.setState({
      collections: [{ id: "collection-1", name: "Checks", description: "", position: 0, createdAt: 1, updatedAt: 1 }],
      requests: [{ id: "request-1", collectionId: "collection-1", folderId: null, name: "Health", method: "GET", url: "{{baseUrl}}/health", position: 0 }],
      environments: [{ id: "environment-1", name: "Staging", position: 0 }],
      activeEnvironmentId: "environment-1",
    });
  });

  it("runs the selected collection and shows assertion failure details", async () => {
    render(<TestRunnerPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Run 1 request" }));
    await waitFor(() => expect(client.runCollection).toHaveBeenCalledWith({ collectionId: "collection-1", environmentId: "environment-1" }));
    expect(await screen.findByText(/status: expected equals 200, actual 503/)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "0 passed · 1 failed · 18 ms · Staging")).toBeInTheDocument();
  });
});
