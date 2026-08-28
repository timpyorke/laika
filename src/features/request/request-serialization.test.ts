import { describe, expect, it } from "vitest";
import type { RequestDraft } from "../../types/http";
import type { HistoryEntry, SavedRequest } from "../../types/workspace";
import {
  MAX_RESPONSE_BYTES,
  draftFromHistoryEntry,
  draftFromSavedRequest,
  serializeRequest,
  serializeSaveRequest,
} from "./request-serialization";

const draft = (): RequestDraft => ({
  id: "draft-1",
  name: "Create user",
  savedRequestId: null,
  collectionId: null,
  folderId: null,
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
      savedRequestId: null,
      name: "Create user",
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

  it("links the execution to a saved request so history can reference it", () => {
    const value = draft();
    value.savedRequestId = "saved-1";
    expect(serializeRequest(value, "request-3").savedRequestId).toBe("saved-1");
  });
});

describe("serializeSaveRequest", () => {
  it("keeps the request shape but strips the bearer token", () => {
    expect(serializeSaveRequest(draft(), "collection-1", null)).toEqual({
      id: null,
      collectionId: "collection-1",
      folderId: null,
      name: "Create user",
      method: "POST",
      url: "https://api.example.com/users",
      params: [{ enabled: false, key: "preview", value: "true" }],
      headers: [{ enabled: true, key: "x-client", value: "laika" }],
      bodyMode: "json",
      body: "{\"name\":\"Laika\"}",
      form: [{ enabled: true, key: "name", value: "Laika" }],
      auth: { type: "bearer" },
      timeoutMs: 12_000,
    });
  });

  it("keeps the basic username but never the password", () => {
    const value = draft();
    value.auth = { type: "basic", bearerToken: "", username: "user", password: "pass" };
    const input = serializeSaveRequest(value, "collection-1", "folder-1");
    expect(input.auth).toEqual({ type: "basic", username: "user" });
    expect(JSON.stringify(input)).not.toContain("pass");
  });

  it("targets an existing row when the draft is already saved", () => {
    const value = draft();
    value.savedRequestId = "saved-1";
    expect(serializeSaveRequest(value, "collection-1", null).id).toBe("saved-1");
  });
});

const savedRequest = (): SavedRequest => ({
  id: "saved-1",
  collectionId: "collection-1",
  folderId: "folder-1",
  name: "List users",
  method: "GET",
  url: "https://api.example.com/users",
  params: [{ enabled: true, key: "page", value: "2" }],
  headers: [],
  bodyMode: "none",
  body: "",
  form: [],
  auth: { type: "basic", username: "user" },
  timeoutMs: 20_000,
});

describe("draftFromSavedRequest", () => {
  it("restores the editor and leaves secret fields blank", () => {
    const restored = draftFromSavedRequest(savedRequest());
    expect(restored.savedRequestId).toBe("saved-1");
    expect(restored.collectionId).toBe("collection-1");
    expect(restored.folderId).toBe("folder-1");
    expect(restored.params[0]).toMatchObject({ enabled: true, key: "page", value: "2" });
    expect(restored.auth).toEqual({ type: "basic", bearerToken: "", username: "user", password: "" });
  });

  it("keeps one blank row so empty editors stay usable", () => {
    const restored = draftFromSavedRequest(savedRequest());
    expect(restored.headers).toHaveLength(1);
    expect(restored.headers[0]).toMatchObject({ key: "", value: "" });
  });
});

describe("draftFromHistoryEntry", () => {
  const entry = (): HistoryEntry => ({
    id: "history-1",
    requestId: "saved-1",
    name: "List users",
    method: "GET",
    url: "https://api.example.com/users",
    status: 200,
    statusText: "OK",
    elapsedMs: 12,
    sizeBytes: 34,
    errorCode: null,
    createdAt: 1_700_000_000_000,
    request: {
      method: "GET",
      url: "https://api.example.com/users",
      params: [],
      headers: [{ enabled: true, key: "Authorization", value: "" }],
      bodyMode: "none",
      body: "",
      form: [],
      authType: "bearer",
      authUsername: "",
      timeoutMs: 20_000,
    },
    responseHeaders: [],
    responseBody: "{}",
    responseTruncated: false,
  });

  it("reopens the snapshot as an unsaved draft", () => {
    const restored = draftFromHistoryEntry(entry());
    expect(restored.savedRequestId).toBeNull();
    expect(restored.collectionId).toBeNull();
    expect(restored.url).toBe("https://api.example.com/users");
    expect(restored.auth.type).toBe("bearer");
    expect(restored.auth.bearerToken).toBe("");
  });
});
