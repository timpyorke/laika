-- Phase 6: request assertions and persisted collection-run results.

ALTER TABLE saved_request ADD COLUMN assertions_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE test_run (
    id             TEXT    PRIMARY KEY,
    workspace_id   TEXT    NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    collection_id  TEXT    REFERENCES collection (id) ON DELETE SET NULL,
    collection_name TEXT   NOT NULL,
    environment_id TEXT    REFERENCES environment (id) ON DELETE SET NULL,
    environment_name TEXT,
    status         TEXT    NOT NULL,
    total_requests INTEGER NOT NULL,
    passed_requests INTEGER NOT NULL,
    failed_requests INTEGER NOT NULL,
    duration_ms    INTEGER NOT NULL,
    created_at     INTEGER NOT NULL
);

CREATE INDEX test_run_recent_idx ON test_run (workspace_id, created_at DESC);

CREATE TABLE test_case_result (
    id                     TEXT    PRIMARY KEY,
    run_id                 TEXT    NOT NULL REFERENCES test_run (id) ON DELETE CASCADE,
    request_id             TEXT    REFERENCES saved_request (id) ON DELETE SET NULL,
    request_name           TEXT    NOT NULL,
    method                 TEXT    NOT NULL,
    url                    TEXT    NOT NULL,
    status                 TEXT    NOT NULL,
    response_status        INTEGER,
    elapsed_ms             INTEGER,
    error_code             TEXT,
    assertion_results_json TEXT    NOT NULL DEFAULT '[]',
    position               INTEGER NOT NULL
);

CREATE INDEX test_case_result_run_idx ON test_case_result (run_id, position);
