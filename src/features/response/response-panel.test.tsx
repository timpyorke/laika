import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { applicationError } from "../../lib/application-error";
import { useAppStore } from "../../store/use-app-store";
import { ResponsePanel } from "./response-panel";

describe("ResponsePanel states", () => {
  beforeEach(() => {
    useAppStore.setState({ response: null, requestError: null, isSending: false, activeRequestId: null });
  });

  it("shows a clear timeout state", () => {
    useAppStore.setState({ requestError: applicationError("TIMEOUT") });
    render(<ResponsePanel />);
    expect(screen.getByText("Request timed out")).toBeInTheDocument();
    expect(screen.getByText(/Increase the timeout/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("shows progress while a request is running", () => {
    useAppStore.setState({ isSending: true, activeRequestId: "request-1" });
    render(<ResponsePanel />);
    expect(screen.getByText("Waiting for response")).toBeInTheDocument();
  });

  it.each([
    ["INVALID_URL", "Invalid request URL"],
    ["NETWORK_ERROR", "Could not reach the server"],
    ["TLS_ERROR", "Secure connection failed"],
  ] as const)("shows the %s error state", (code, title) => {
    useAppStore.setState({ requestError: applicationError(code) });
    render(<ResponsePanel />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
