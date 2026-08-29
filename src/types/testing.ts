import type { ApplicationErrorCode } from "./http";

export type AssertionKind = "status" | "header" | "jsonPath" | "responseTime";
export type AssertionOperator = "equals" | "notEquals" | "contains" | "exists" | "notExists" | "lessThan" | "lessThanOrEqual" | "greaterThan";

export interface RequestAssertion {
  id: string;
  kind: AssertionKind;
  operator: AssertionOperator;
  target: string;
  expected: string;
}

export interface AssertionResult extends RequestAssertion {
  assertionId: string;
  actual: string | null;
  passed: boolean;
  message: string;
}

export interface TestCaseResult {
  id: string;
  requestId: string | null;
  requestName: string;
  method: string;
  url: string;
  status: "passed" | "failed" | "error";
  responseStatus: number | null;
  elapsedMs: number | null;
  errorCode: ApplicationErrorCode | null;
  assertionResults: AssertionResult[];
  position: number;
}

export interface TestRunSummary {
  id: string;
  collectionId: string | null;
  collectionName: string;
  environmentId: string | null;
  environmentName: string | null;
  status: "passed" | "failed";
  totalRequests: number;
  passedRequests: number;
  failedRequests: number;
  durationMs: number;
  createdAt: number;
}

export interface TestRun extends TestRunSummary { results: TestCaseResult[]; }

export interface RunCollectionInput {
  collectionId: string;
  environmentId: string | null;
}
