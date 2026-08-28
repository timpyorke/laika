import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/use-app-store";
import { RequestWorkspace } from "./request-workspace";

const requestClient = vi.hoisted(() => ({
  executeHttpRequest: vi.fn(),
  cancelHttpRequest: vi.fn(),
}));

vi.mock("./request-client", () => requestClient);

describe("RequestWorkspace request flow", () => {
  beforeEach(() => {
    requestClient.executeHttpRequest.mockReset().mockResolvedValue({
      status: 200,
      statusText: "OK",
      elapsedMs: 4,
      sizeBytes: 11,
      headers: [{ name: "x-laika-check", value: "passed" }],
      body: '{"ok":true}',
      contentType: "application/json",
      truncated: false,
    });
    requestClient.cancelHttpRequest.mockReset();

    const draft = useAppStore.getState().draft;
    useAppStore.setState({
      draft: {
        ...draft,
        method: "GET",
        url: "",
        body: "",
        bodyMode: "none",
        auth: { type: "none", bearerToken: "", username: "", password: "", hasStoredSecret: false },
      },
      requestTab: "params",
      response: null,
      requestError: null,
      activeRequestId: null,
      isSending: false,
    });
  });

  it("sends POST JSON with bearer authentication from the editor", async () => {
    render(<RequestWorkspace />);

    fireEvent.change(screen.getByRole("combobox", { name: "HTTP method" }), { target: { value: "POST" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Request URL" }), { target: { value: "http://127.0.0.1:4545/auth" } });

    act(() => useAppStore.getState().setRequestTab("body"));
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Request body" }), { target: { value: '{"message":"phase-2-complete"}' } });

    act(() => useAppStore.getState().setRequestTab("auth"));
    fireEvent.change(screen.getByRole("combobox", { name: "Authentication" }), { target: { value: "bearer" } });
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: "phase2-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(requestClient.executeHttpRequest).toHaveBeenCalledOnce());
    expect(requestClient.executeHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      url: "http://127.0.0.1:4545/auth",
      body: { mode: "json", content: '{"message":"phase-2-complete"}' },
      auth: { type: "bearer", token: "phase2-secret" },
    }));
    await waitFor(() => expect(useAppStore.getState().response?.status).toBe(200));
  });
});
