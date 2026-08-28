export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type RequestEditorTab = "params" | "headers" | "body" | "auth";
export type ResponseViewerTab = "body" | "headers";

export interface KeyValueEntry {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export interface RequestDraft {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueEntry[];
  headers: KeyValueEntry[];
  body: string;
  bodyType: "none" | "json" | "text" | "form";
}

export interface HttpResponse {
  status: number;
  statusText: string;
  elapsedMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
}

export type ApplicationErrorCode = "INVALID_URL" | "NETWORK_ERROR" | "TIMEOUT" | "TLS_ERROR" | "UNEXPECTED_ERROR";

export interface ApplicationError {
  code: ApplicationErrorCode;
  title: string;
  message: string;
  recoverable: boolean;
}
