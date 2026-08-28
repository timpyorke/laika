import { describe, expect, it } from "vitest";
import type { RequestDraft } from "../../types/http";
import { MAX_RESPONSE_BYTES, serializeRequest } from "./request-serialization";

const draft = (): RequestDraft => ({
  id: "draft-1",
  name: "Create user",
  method: "POST",
  url: "  https://api.example.com/users  ",
  params: [{ id: "p1", enabled: false, key: "preview", value: "true" }],
  headers: [{ id: "h1", enabled: true, key: "x-client", value: "laika" }],
  body: "{\"name\":\"Laika\"}",
  bodyMode: "json",
  form: [{ id: "f1", enabled: true, key: "name", value: "Laika" }],
  auth: { type: "bearer", bearerToken: "token", username: "", password: "" },
  timeoutMs: 12_000,
});

describe("serializeRequest", () => {
  it("maps every request field to the Rust contract", () => {
    expect(serializeRequest(draft(), "request-1")).toEqual({
      requestId: "request-1",
      method: "POST",
      url: "https://api.example.com/users",
      params: [{ enabled: false, key: "preview", value: "true" }],
      headers: [{ enabled: true, key: "x-client", value: "laika" }],
      body: { mode: "json", content: "{\"name\":\"Laika\"}" },
      auth: { type: "bearer", token: "token" },
      timeoutMs: 12_000,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    });
  });

  it("serializes form rows and basic authentication", () => {
    const value = draft();
    value.bodyMode = "form";
    value.auth = { type: "basic", bearerToken: "", username: "user", password: "pass" };
    const request = serializeRequest(value, "request-2");
    expect(request.body).toEqual({ mode: "form", entries: [{ enabled: true, key: "name", value: "Laika" }] });
    expect(request.auth).toEqual({ type: "basic", username: "user", password: "pass" });
  });
});
