-- Laika workspace schema, version 1.
--
-- Foreign keys and WAL are enabled through the pool connect options rather than
-- here: sqlx runs each migration inside a transaction, where `PRAGMA
-- foreign_keys` is silently ignored.
--
-- Timestamps are Unix epoch milliseconds. Identifiers are UUID v4 text so that
-- rows stay stable across export/import.

CREATE TABLE workspace (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE collection (
    id           TEXT    PRIMARY KEY,
    workspace_id TEXT    NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    position     INTEGER NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX collection_workspace_idx ON collection (workspace_id, position);

CREATE TABLE folder (
    id            TEXT    PRIMARY KEY,
    collection_id TEXT    NOT NULL REFERENCES collection (id) ON DELETE CASCADE,
    parent_id     TEXT    REFERENCES folder (id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    position      INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX folder_parent_idx ON folder (collection_id, parent_id, position);

-- `auth_secret_ref` stays NULL until Phase 4 introduces Stronghold. Tokens and
-- passwords are never written to this table.
CREATE TABLE saved_request (
    id              TEXT    PRIMARY KEY,
    collection_id   TEXT    NOT NULL REFERENCES collection (id) ON DELETE CASCADE,
    folder_id       TEXT    REFERENCES folder (id) ON DELETE CASCADE,
    name            TEXT    NOT NULL,
    method          TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    params_json     TEXT    NOT NULL DEFAULT '[]',
    headers_json    TEXT    NOT NULL DEFAULT '[]',
    body_mode       TEXT    NOT NULL DEFAULT 'none',
    body            TEXT    NOT NULL DEFAULT '',
    form_json       TEXT    NOT NULL DEFAULT '[]',
    auth_type       TEXT    NOT NULL DEFAULT 'none',
    auth_username   TEXT    NOT NULL DEFAULT '',
    auth_secret_ref TEXT,
    timeout_ms      INTEGER NOT NULL DEFAULT 30000,
    position        INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX saved_request_parent_idx ON saved_request (collection_id, folder_id, position);

-- History survives the request it came from, so `request_id` clears instead of
-- cascading.
CREATE TABLE history_entry (
    id                    TEXT    PRIMARY KEY,
    workspace_id          TEXT    NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    request_id            TEXT    REFERENCES saved_request (id) ON DELETE SET NULL,
    name                  TEXT    NOT NULL,
    method                TEXT    NOT NULL,
    url                   TEXT    NOT NULL,
    request_json          TEXT    NOT NULL,
    status                INTEGER,
    status_text           TEXT,
    elapsed_ms            INTEGER,
    size_bytes            INTEGER,
    response_headers_json TEXT,
    response_body         TEXT,
    response_truncated    INTEGER NOT NULL DEFAULT 0,
    error_code            TEXT,
    created_at            INTEGER NOT NULL
);

CREATE INDEX history_entry_recent_idx ON history_entry (workspace_id, created_at DESC);
CREATE INDEX history_entry_request_idx ON history_entry (request_id);
