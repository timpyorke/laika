import type { HttpMethod } from "../types/http";

/** Shared method colouring so the editor, sidebar, and history agree. */
export const methodColor: Record<HttpMethod, string> = {
  GET: "text-[#16834b] dark:text-[#4ade80]",
  POST: "text-[#b36a08] dark:text-[#fbbf24]",
  PUT: "text-[#2563b8] dark:text-[#60a5fa]",
  PATCH: "text-[#7c4db2] dark:text-[#c084fc]",
  DELETE: "text-[var(--danger)]",
  HEAD: "text-[#0f766e] dark:text-[#2dd4bf]",
  OPTIONS: "text-[#657080] dark:text-[#aab3bf]",
};

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}
