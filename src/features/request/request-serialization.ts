import type { ExecuteHttpRequestInput, KeyValueEntry, KeyValuePayload, RequestAuthPayload, RequestBodyPayload, RequestDraft } from "../../types/http";
import type { AuthRecord, HistoryEntry, KeyValueRecord, SaveRequestInput, SavedRequest } from "../../types/workspace";

export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const serializeRows = (rows: KeyValueEntry[]): KeyValuePayload[] =>
  rows.map(({ enabled, key, value }) => ({ enabled, key, value }));

/** Editor rows need a stable id for React keys; stored records do not carry one. */
const withRowIds = (records: KeyValueRecord[]): KeyValueEntry[] =>
  records.map((record) => ({ id: crypto.randomUUID(), ...record }));

/** Key/value editors always show one blank row so there is something to type into. */
const emptyRow = (): KeyValueEntry => ({ id: crypto.randomUUID(), enabled: true, key: "", value: "" });
const rowsOrBlank = (records: KeyValueRecord[]): KeyValueEntry[] =>
  records.length > 0 ? withRowIds(records) : [emptyRow()];

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

/** Drops the token and password: secrets are never persisted (see Phase 4). */
function serializeAuthRecord(draft: RequestDraft): AuthRecord {
  switch (draft.auth.type) {
    case "bearer": return { type: "bearer" };
    case "basic": return { type: "basic", username: draft.auth.username };
    case "none": return { type: "none" };
  }
}

export function serializeRequest(draft: RequestDraft, requestId: string): ExecuteHttpRequestInput {
  return {
    requestId,
    savedRequestId: draft.savedRequestId,
    name: draft.name,
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

export function serializeSaveRequest(
  draft: RequestDraft,
  collectionId: string,
  folderId: string | null,
): SaveRequestInput {
  return {
    id: draft.savedRequestId,
    collectionId,
    folderId,
    name: draft.name,
    method: draft.method,
    url: draft.url.trim(),
    params: serializeRows(draft.params),
    headers: serializeRows(draft.headers),
    bodyMode: draft.bodyMode,
    body: draft.body,
    form: serializeRows(draft.form),
    auth: serializeAuthRecord(draft),
    authSecret: draft.auth.type === "bearer"
      ? (draft.auth.hasStoredSecret && draft.auth.bearerToken === "" ? null : draft.auth.bearerToken)
      : draft.auth.type === "basic"
        ? (draft.auth.hasStoredSecret && draft.auth.password === "" ? null : draft.auth.password)
        : null,
    timeoutMs: draft.timeoutMs,
    assertions: draft.assertions,
    extractions: draft.extractions,
  };
}

export function draftFromSavedRequest(saved: SavedRequest): RequestDraft {
  return {
    id: crypto.randomUUID(),
    name: saved.name,
    savedRequestId: saved.id,
    collectionId: saved.collectionId,
    folderId: saved.folderId,
    method: saved.method,
    url: saved.url,
    params: rowsOrBlank(saved.params),
    headers: rowsOrBlank(saved.headers),
    body: saved.body,
    bodyMode: saved.bodyMode,
    form: rowsOrBlank(saved.form),
    auth: {
      type: saved.auth.type,
      bearerToken: "",
      username: saved.auth.type === "basic" ? saved.auth.username : "",
      password: "",
      hasStoredSecret: saved.hasAuthSecret,
    },
    timeoutMs: saved.timeoutMs,
    assertions: saved.assertions,
    extractions: saved.extractions,
  };
}

/**
 * Reopens a history entry as a new unsaved draft. It is not linked back to the
 * saved request: the stored request may have changed since, and the snapshot is
 * what actually ran.
 */
export function draftFromHistoryEntry(entry: HistoryEntry): RequestDraft {
  const { request } = entry;
  const authType = request.authType === "bearer" || request.authType === "basic" ? request.authType : "none";
  return {
    id: crypto.randomUUID(),
    name: entry.name,
    savedRequestId: null,
    collectionId: null,
    folderId: null,
    method: request.method,
    url: request.url,
    params: rowsOrBlank(request.params),
    headers: rowsOrBlank(request.headers),
    body: request.body,
    bodyMode: request.bodyMode,
    form: rowsOrBlank(request.form),
    auth: { type: authType, bearerToken: "", username: request.authUsername, password: "", hasStoredSecret: false },
    timeoutMs: request.timeoutMs,
    assertions: [],
    extractions: [],
  };
}
