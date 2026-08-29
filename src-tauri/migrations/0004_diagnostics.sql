-- Phase 7E: privacy-safe diagnostics. Every column is a closed enum, a
-- static app/OS string, an id, or a timestamp; there is no column a request
-- URL, header, parameter, body, environment value, or secret could land in.
-- Diagnostics are opt-in, so the flag defaults off.

ALTER TABLE workspace ADD COLUMN diagnostics_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (diagnostics_enabled IN (0, 1));

CREATE TABLE diagnostic_event (
    id            TEXT    PRIMARY KEY,
    workspace_id  TEXT    NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    created_at    INTEGER NOT NULL,
    app_version   TEXT    NOT NULL,
    os            TEXT    NOT NULL,
    category      TEXT    NOT NULL,
    outcome       TEXT    NOT NULL,
    error_code    TEXT,
    timing_bucket TEXT
);

CREATE INDEX diagnostic_event_recent_idx ON diagnostic_event (workspace_id, created_at DESC);
