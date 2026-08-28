import { invoke } from "@tauri-apps/api/core";
import type { ExecuteHttpRequestInput, HttpResponse } from "../../types/http";

export async function executeHttpRequest(request: ExecuteHttpRequestInput): Promise<HttpResponse> {
  return invoke<HttpResponse>("execute_http_request", { request });
}

export async function cancelHttpRequest(requestId: string): Promise<boolean> {
  return invoke<boolean>("cancel_http_request", { requestId });
}
