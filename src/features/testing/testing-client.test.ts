import { describe, expect, it } from "vitest";
import type { TestRun } from "../../types/testing";
import { buildTestRunExport } from "./testing-client";

describe("test run export", () => {
  it("creates a versioned machine-readable report with request results", () => {
    const run: TestRun = {
      id: "run-1", collectionId: "collection-1", collectionName: "Checks", environmentId: null, environmentName: null,
      status: "passed", totalRequests: 1, passedRequests: 1, failedRequests: 0, durationMs: 10, createdAt: 1,
      results: [{ id: "case-1", requestId: "request-1", requestName: "Health", method: "GET", url: "https://example.com/health", status: "passed", responseStatus: 200, elapsedMs: 10, errorCode: null, assertionResults: [], position: 0 }],
    };
    const report = buildTestRunExport(run);
    expect(report).toMatchObject({ format: "laika-test-run", version: 1, run: { id: "run-1", status: "passed" } });
    expect(JSON.parse(JSON.stringify(report)).run.results[0].requestName).toBe("Health");
  });
});
