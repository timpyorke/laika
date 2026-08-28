import { describe, expect, it } from "vitest";
import { normalizeApplicationError } from "./application-error";

describe("normalizeApplicationError", () => {
  it("maps known backend codes to safe application copy", () => {
    expect(normalizeApplicationError({ code: "TLS_ERROR", message: "certificate details" })).toMatchObject({
      code: "TLS_ERROR",
      title: "Secure connection failed",
    });
  });

  it("does not expose unknown rejection values", () => {
    const error = normalizeApplicationError("Bearer highly-sensitive-token");
    expect(error.code).toBe("UNEXPECTED_ERROR");
    expect(error.message).not.toContain("highly-sensitive-token");
  });
});
