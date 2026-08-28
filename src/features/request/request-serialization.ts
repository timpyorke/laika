import type { ExecuteHttpRequestInput, KeyValueEntry, KeyValuePayload, RequestAuthPayload, RequestBodyPayload, RequestDraft } from "../../types/http";

export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const serializeRows = (rows: KeyValueEntry[]): KeyValuePayload[] =>
  rows.map(({ enabled, key, value }) => ({ enabled, key, value }));

function serializeBody(draft: RequestDraft): RequestBodyPayload {
  switch (draft.bodyMode) {
    case "json": return { mode: "json", content: draft.body };
    case "text": return { mode: "text", content: draft.body };
    case "form": return { mode: "form", entries: serializeRows(draft.form) };
    case "none": return { mode: "none" };
  }
}

function serializeAuth(draft: RequestDraft): RequestAuthPayload {
  switch (draft.auth.type) {
    case "bearer": return { type: "bearer", token: draft.auth.bearerToken };
    case "basic": return { type: "basic", username: draft.auth.username, password: draft.auth.password };
    case "none": return { type: "none" };
  }
}

export function serializeRequest(draft: RequestDraft, requestId: string): ExecuteHttpRequestInput {
  return {
    requestId,
    method: draft.method,
    url: draft.url.trim(),
    params: serializeRows(draft.params),
    headers: serializeRows(draft.headers),
    body: serializeBody(draft),
    auth: serializeAuth(draft),
    timeoutMs: draft.timeoutMs,
    maxResponseBytes: MAX_RESPONSE_BYTES,
  };
}
