export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export const BODY_MODES = ["none", "json", "text", "form"] as const;
export const AUTH_TYPES = ["none", "bearer", "basic"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type BodyMode = (typeof BODY_MODES)[number];
export type AuthType = (typeof AUTH_TYPES)[number];
export type RequestEditorTab = "params" | "headers" | "body" | "auth";
export type ResponseViewerTab = "body" | "headers";
export type ResponseBodyView = "pretty" | "raw";

export interface KeyValueEntry { id: string; enabled: boolean; key: string; value: string; }

export interface RequestAuthDraft {
  type: AuthType;
  bearerToken: string;
  username: string;
  password: string;
}

export interface RequestDraft {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueEntry[];
  headers: KeyValueEntry[];
  body: string;
  bodyMode: BodyMode;
  form: KeyValueEntry[];
  auth: RequestAuthDraft;
  timeoutMs: number;
}

export interface KeyValuePayload { enabled: boolean; key: string; value: string; }

export type RequestBodyPayload =
  | { mode: "none" }
  | { mode: "json"; content: string }
  | { mode: "text"; content: string }
  | { mode: "form"; entries: KeyValuePayload[] };

export type RequestAuthPayload =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };

export interface ExecuteHttpRequestInput {
  requestId: string;
  method: HttpMethod;
  url: string;
  params: KeyValuePayload[];
  headers: KeyValuePayload[];
  body: RequestBodyPayload;
  auth: RequestAuthPayload;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface ResponseHeader { name: string; value: string; }

export interface HttpResponse {
  status: number;
  statusText: string;
  elapsedMs: number;
  sizeBytes: number;
  headers: ResponseHeader[];
  body: string;
  contentType: string | null;
  truncated: boolean;
}

export type ApplicationErrorCode =
  | "INVALID_REQUEST" | "INVALID_URL" | "INVALID_HEADER" | "INVALID_BODY" | "INVALID_AUTH"
  | "NETWORK_ERROR" | "TIMEOUT" | "TLS_ERROR" | "CANCELLED" | "UNEXPECTED_ERROR";

export interface ApplicationError {
  code: ApplicationErrorCode;
  title: string;
  message: string;
  recoverable: boolean;
}
