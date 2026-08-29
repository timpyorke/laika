import type { HttpMethod } from "../types/http";

/** Shared method colouring so the editor, sidebar, tabs, and history agree. */
export const methodColor: Record<HttpMethod, string> = {
  GET: "text-[var(--method-get)]",
  POST: "text-[var(--method-post)]",
  PUT: "text-[var(--method-put)]",
  PATCH: "text-[var(--method-patch)]",
  DELETE: "text-[var(--method-delete)]",
  HEAD: "text-[var(--method-head)]",
  OPTIONS: "text-[var(--method-options)]",
};

/** Sidebar, tab strip, and history all show methods in a fixed-width mono gutter. */
export const methodLabel: Record<HttpMethod, string> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DEL",
  HEAD: "HEAD",
  OPTIONS: "OPTS",
};

/** Response status banding — 2xx, 3xx, 4xx, 5xx each get their own hue. */
export function statusColorVar(status: number): string {
  if (status < 300) return "var(--status-success)";
  if (status < 400) return "var(--status-redirect)";
  if (status < 500) return "var(--status-client)";
  return "var(--status-server)";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}
