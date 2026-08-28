-- Environment and variable storage. Secret values never enter this schema;
-- only opaque keys into the Stronghold snapshot are persisted.

CREATE TABLE environment (
    id           TEXT    PRIMARY KEY,
    workspace_id TEXT    NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    position     INTEGER NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX environment_workspace_idx ON environment (workspace_id, position);

CREATE TABLE environment_variable (
    id             TEXT    PRIMARY KEY,
    workspace_id   TEXT    NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    environment_id TEXT    REFERENCES environment (id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    value          TEXT    NOT NULL DEFAULT '',
    is_secret      INTEGER NOT NULL DEFAULT 0 CHECK (is_secret IN (0, 1)),
    secret_ref     TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    CHECK (
        (is_secret = 0 AND secret_ref IS NULL)
        OR (is_secret = 1 AND value = '')
    )
);

CREATE UNIQUE INDEX environment_variable_workspace_name_idx
    ON environment_variable (workspace_id, name)
    WHERE environment_id IS NULL;
CREATE UNIQUE INDEX environment_variable_environment_name_idx
    ON environment_variable (environment_id, name)
    WHERE environment_id IS NOT NULL;

ALTER TABLE workspace ADD COLUMN active_environment_id TEXT
    REFERENCES environment (id) ON DELETE SET NULL;
