import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copySensitiveText, SENSITIVE_CLIPBOARD_TTL_MS } from "./sensitive-clipboard";

describe("copySensitiveText", () => {
  let clipboardValue = "";

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardValue = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn(async () => clipboardValue),
        writeText: vi.fn(async (value: string) => { clipboardValue = value; }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears an unchanged secret after 30 seconds", async () => {
    await copySensitiveText("secret-token");
    expect(clipboardValue).toBe("secret-token");

    await vi.advanceTimersByTimeAsync(SENSITIVE_CLIPBOARD_TTL_MS);

    expect(clipboardValue).toBe("");
  });

  it("does not overwrite a newer clipboard item", async () => {
    await copySensitiveText("secret-token");
    clipboardValue = "new clipboard value";

    await vi.advanceTimersByTimeAsync(SENSITIVE_CLIPBOARD_TTL_MS);

    expect(clipboardValue).toBe("new clipboard value");
  });
});
