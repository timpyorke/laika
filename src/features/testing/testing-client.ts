import { invoke } from "@tauri-apps/api/core";
import type { ChainPreflightReport, RunCollectionInput, TestRun, TestRunSummary } from "../../types/testing";

export async function runCollection(input: RunCollectionInput): Promise<TestRun> {
  return invoke<TestRun>("run_collection", { input });
}

export async function preflightCollectionRun(input: RunCollectionInput): Promise<ChainPreflightReport> {
  return invoke<ChainPreflightReport>("preflight_collection_run", { input });
}

export async function listTestRuns(limit = 20): Promise<TestRunSummary[]> {
  return invoke<TestRunSummary[]>("list_test_runs", { limit });
}

export async function getTestRun(id: string): Promise<TestRun> {
  return invoke<TestRun>("get_test_run", { id });
}

export function buildTestRunExport(run: TestRun) {
  return { format: "laika-test-run" as const, version: 1 as const, exportedAt: new Date().toISOString(), run };
}

export function exportTestRun(run: TestRun) {
  const payload = buildTestRunExport(run);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `laika-test-run-${run.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
