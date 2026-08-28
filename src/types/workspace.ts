import type { ApplicationErrorCode, BodyMode, HttpMethod } from "./http";

/** Mirrors `store::models::KeyValueRecord`. Unlike the editor's `KeyValueEntry` it has no row id. */
export interface KeyValueRecord { enabled: boolean; key: string; value: string; }

/**
 * The non-secret half of an authentication config. Bearer tokens and basic
 * passwords are deliberately absent: they are never sent to, or returned from,
 * the workspace database.
 */
export type AuthRecord =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "basic"; username: string };

export interface Collection {
  id: string;
  name: string;
  description: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  collectionId: string;
  parentId: string | null;
  name: string;
  position: number;
}

export interface RequestSummary {
  id: string;
  collectionId: string;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  position: number;
}

/** Collections, folders, and requests arrive flat; the sidebar assembles the tree. */
export interface WorkspaceTree {
  workspaceId: string;
  collections: Collection[];
  folders: Folder[];
  requests: RequestSummary[];
}

export interface SavedRequest {
  id: string;
  collectionId: string;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueRecord[];
  headers: KeyValueRecord[];
  bodyMode: BodyMode;
  body: string;
  form: KeyValueRecord[];
  auth: AuthRecord;
  timeoutMs: number;
}

export interface SaveRequestInput {
  /** Omit or null to create; set to update an existing request. */
  id: string | null;
  collectionId: string;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueRecord[];
  headers: KeyValueRecord[];
  bodyMode: BodyMode;
  body: string;
  form: KeyValueRecord[];
  auth: AuthRecord;
  timeoutMs: number;
}

export interface HistorySummary {
  id: string;
  requestId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  statusText: string | null;
  elapsedMs: number | null;
  sizeBytes: number | null;
  errorCode: ApplicationErrorCode | null;
  createdAt: number;
}

/** The request as it was executed, with credential values already stripped. */
export interface RequestSnapshot {
  method: HttpMethod;
  url: string;
  params: KeyValueRecord[];
  headers: KeyValueRecord[];
  bodyMode: BodyMode;
  body: string;
  form: KeyValueRecord[];
  authType: string;
  authUsername: string;
  timeoutMs: number;
}

export interface HistoryEntry extends HistorySummary {
  request: RequestSnapshot;
  responseHeaders: KeyValueRecord[];
  responseBody: string | null;
  responseTruncated: boolean;
}
