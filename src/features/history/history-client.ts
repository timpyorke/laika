import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry, HistorySummary } from "../../types/workspace";

export const HISTORY_PAGE_SIZE = 100;

export async function listHistory(query: string | null, limit = HISTORY_PAGE_SIZE, offset = 0): Promise<HistorySummary[]> {
  return invoke<HistorySummary[]>("list_history", { query, limit, offset });
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry> {
  return invoke<HistoryEntry>("get_history_entry", { id });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  return invoke<void>("delete_history_entry", { id });
}

export async function clearHistory(): Promise<number> {
  return invoke<number>("clear_history");
}
