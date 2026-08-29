import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./error-boundary";

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not write error details to the console", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boundary = new ErrorBoundary({ children: null });

    boundary.componentDidCatch();

    expect(consoleError).toHaveBeenCalledExactlyOnceWith("Application render error");
  });
});
