# Laika Development Plan

This document is the primary plan for evolving Laika from a Tauri scaffold into a production-ready, local-first desktop REST client. Work is ordered according to system dependencies and implementation risk.

## Product Goal

Laika is designed for composing, sending, inspecting, and organizing HTTP API requests, guided by the following principles:

- Provide a fast and reliable request/response workflow.
- Use Rust as the HTTP engine to avoid browser CORS restrictions.
- Store collections, history, and workspace data locally.
- Separate secrets from general data and store them securely.
- Establish an architecture that can later support API testing and a CLI.

## Delivery Strategy

- Develop in vertical slices, with every phase ending in a workflow that can be exercised.
- Make the HTTP core correct before adding persistence and advanced features.
- Use explicitly typed request/response contracts between TypeScript and Rust.
- Version database migrations from the moment SQLite is introduced.
- Never expose secrets in logs, history, or error messages.
- Complete the Definition of Done for each phase before starting a dependent phase.

## Phase Overview

| Phase | Milestone | Outcome | Status |
| --- | --- | --- | --- |
| 0 | Project Bootstrap | The project builds and produces a Windows installer | Complete |
| 1 | Application Foundation | The UI shell, state, and frontend structure are ready for feature development | Complete |
| 2 | REST Request MVP | Users can compose and send requests, then inspect responses | Complete |
| 3 | Local Workspace | Collections and history are stored in SQLite | Complete |
| 4 | Environments and Secrets | Variables and authentication secrets are handled securely | Complete |
| 5 | Workflow Polish | Everyday workflows are fast and data management is more complete | Complete |
| 6 | API Testing | Users can create assertions and run test cases | Complete |
| 7 | Release Readiness | The app can be distributed, used, and upgraded with confidence | In Progress |

Checklist convention:

- `[ ]` Not complete
- `[x]` Complete and verified
- Change a phase status to `In Progress` when work begins.
- Change a phase status to `Complete` only after its entire Definition of Done has been met.

## Phase 0: Project Bootstrap

Goal: Establish a reproducible desktop application baseline.

### Checklist

- [x] Scaffold Tauri 2 + React + TypeScript + Vite.
- [x] Use pnpm and create a lockfile.
- [x] Install the Rust toolchain through rustup.
- [x] Verify the frontend production build.
- [x] Verify the Tauri release build on Windows.
- [x] Produce `.exe`, MSI, and NSIS installers.
- [x] Update the README to match the product direction and current structure.

### Definition of Done

- [x] `pnpm build` passes.
- [x] `pnpm tauri build` passes.
- [x] Windows artifacts are created under `src-tauri/target/release/`.

## Phase 1: Application Foundation

Goal: Replace the scaffold UI with an application foundation that supports REST client workflows.

### Checklist

- [x] Add Tailwind CSS and shadcn/ui.
- [x] Add Zustand for application state.
- [x] Create the application shell: sidebar, request workspace, and response panel.
- [x] Create shared UI primitives such as tabs, inputs, table rows, resizable panels, and dialogs.
- [x] Organize the frontend by feature, including `request`, `response`, `collections`, `history`, and `environments`.
- [x] Define TypeScript models for request drafts, HTTP responses, and application errors.
- [x] Add theme tokens for light/dark mode and HTTP status colors.
- [x] Add an error boundary and notification system.

### Deliverables

- [x] The main screen is a REST client workspace rather than the sample Tauri screen.
- [x] The UI supports both small and large desktop windows without overlap.
- [x] Request draft state can update the method, URL, and tabs.

### Definition of Done

- [x] No sample `greet` workflow remains on the main screen.
- [x] UI controls support keyboard use in the primary workflow.
- [x] `pnpm build` passes without TypeScript errors.

## Phase 2: REST Request MVP

Goal: Allow users to compose, send, and inspect HTTP requests end to end.

### Frontend Checklist

- [x] Method selector: GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- [x] URL input and Send/Cancel controls.
- [x] Key/value query parameter editor with per-row enable/disable controls.
- [x] Key/value header editor with per-row enable/disable controls.
- [x] Body modes: none, JSON, text, and form URL encoded.
- [x] Basic Auth and Bearer Token input.
- [x] Response view: status, elapsed time, size, headers, and body.
- [x] JSON formatting, raw text view, and response copying.
- [x] Loading, timeout, invalid URL, TLS, and network error states.

### Rust HTTP Engine Checklist

- [x] Add `reqwest` and create a Tauri command for request execution.
- [x] Validate and normalize request input.
- [x] Support the methods, query parameters, headers, body, and authentication exposed by the UI.
- [x] Measure elapsed time and response size.
- [x] Return status, headers, and body through a serializable contract.
- [x] Limit response size to prevent memory exhaustion.
- [x] Add a configurable timeout and cancellation mechanism.
- [x] Prevent sensitive headers from appearing in debug logs.

### Test Checklist

- [x] Add Rust unit tests for request validation and response mapping.
- [x] Add integration tests using a local mock HTTP server.
- [x] Add frontend tests for request serialization and UI error states.
- [x] Smoke test: GET JSON, POST JSON, authentication, timeout, cancellation, and non-2xx responses.

### Definition of Done

- [x] Requests can be sent to HTTP/HTTPS endpoints without relying on browser CORS.
- [x] Every request field shown in the UI is sent to Rust correctly.
- [x] The response displays status, time, size, headers, and body.
- [x] Cancellation and timeout stop a request without freezing the UI.
- [x] User-actionable errors are clear and do not expose secrets.

## Phase 3: Local Workspace

Goal: Allow users to save requests and resume work after restarting the app.

### Checklist

- [x] Add SQLite and select a Tauri-compatible database integration.
- [x] Create a migration system and schema versioning.
- [x] Design entities for workspace, collection, folder, request, and history entry.
- [x] Create a Rust repository layer that is separate from Tauri commands.
- [x] Implement CRUD for collections, folders, and saved requests.
- [x] Record appropriate history entries after both successful and failed requests.
- [x] Reopen requests from collections or history in the editor.
- [x] Add search, rename, duplicate, and delete operations.
- [x] Add move operations to the repository and command layer.
- [x] Expose moving through the sidebar with a keyboard-accessible destination dialog; drag and drop is deferred to Phase 5.
- [x] Define a retention policy and clear-history workflow.
- [x] Never store authentication secrets in SQLite.

### Data Checklist

- [x] Store request metadata and non-secret values as structured data.
- [x] Store large bodies only within defined limits.
- [x] Use foreign keys and transactions for move/delete operations.
- [x] Keep the initial migration idempotent for both new and already-migrated databases.

### Definition of Done

- [x] Saved requests and collections remain available after restart.
- [x] History is created when a request finishes and can be reopened.
- [x] The initial migration works for both a new database and an already-migrated database.
- [x] Database failures produce recoverable errors without closing the app.

### Implementation Notes

- Persistence uses `sqlx` with the runtime query API, so queries stay in Rust and
  the repository layer can later back a CLI. `tauri-plugin-sql` was rejected
  because it moves SQL into the frontend.
- The database lives at `app_data_dir()/laika.db`. Foreign keys and WAL are set
  through the pool connect options, since `PRAGMA foreign_keys` is ignored inside
  the transaction that wraps each migration.
- Identifiers are UUID v4 text and timestamps are Unix epoch milliseconds.
- Query parameters, headers, and form fields are stored as JSON columns whose
  shape matches the editor's key/value rows.
- Redaction is enforced in the repository layer, not at the call site: values of
  `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, and `x-api-key`
  are dropped before any row is written, and `auth_secret_ref` stays NULL until
  Phase 4 introduces Stronghold.
- Stored request and response bodies are capped at 1 MB; history keeps the newest
  1000 entries per workspace.
- History is recorded for requests that reached the network. Validation failures
  and cancellations are treated as form errors, not history.
- A failed database startup degrades the app instead of stopping it: the window
  opens and workspace commands return `DATABASE_UNAVAILABLE`.

## Phase 4: Environments and Secrets

Goal: Allow users to switch configuration between environments and store credentials securely.

### Checklist

- [x] Create an environment and variable manager.
- [x] Support an active environment and global/workspace variables.
- [x] Use variable syntax such as `{{baseUrl}}`.
- [x] Resolve variables in URLs, parameters, headers, bodies, and authentication before sending.
- [x] Show unresolved variables before request execution.
- [x] Separate regular values from secret values.
- [x] Add Stronghold for tokens, passwords, and API keys.
- [x] Store opaque secret references in SQLite.
- [x] Mask secrets in the UI, with explicit reveal/copy actions.
- [x] Redact secrets from logs, history, errors, and exported data by default.

### Definition of Done

- [x] Switching the environment immediately applies the new values to requests.
- [x] Undefined variables are never sent silently.
- [x] Secrets are never stored as plaintext in SQLite.
- [x] Secret references remain usable after restarting the app.
- [x] Normal exports contain no secrets unless the user explicitly selects and confirms their inclusion.

### Implementation Notes

- Migration `0002` adds environments, scoped variables, and the active
  environment reference, with an automated upgrade test from schema version 1.
- Workspace variables are the fallback; variables in the active environment
  override matching names immediately. Nested references are supported and
  cycles or missing names stop execution with an actionable error.
- Resolution happens in Rust immediately before request validation and sending.
  The unresolved request snapshot is used for history, so resolved values do
  not enter SQLite.
- Stronghold uses a master-password-derived key and stores encrypted data in
  `app_data_dir()/laika.stronghold`. SQLite stores random UUID references only.
- Saved Bearer tokens and Basic Auth passwords are hydrated inside Rust. They
  are not returned to the editor; the UI only reports that a stored value
  exists. Known auth and secret-variable values are removed from persisted
  response history if a server echoes them.
- Public workspace and export-shaped contracts contain masked secret metadata,
  not secret references or values. The import/export workflow itself remains
  scheduled for Phase 5.

## Phase 5: Workflow Polish

Goal: Make Laika fast and predictable enough for everyday use.

### Checklist

- [x] Add Monaco Editor for JSON and raw request/response bodies.
- [x] Add syntax highlighting, formatting, validation, and line wrapping.
- [x] Add request tabs with dirty state and confirmation before closing.
- [x] Add keyboard shortcuts for send, save, new request, and tab navigation.
- [x] Make the sidebar and response panel resizable and collapsible.
- [x] Add drag-and-drop moving and reordering for sidebar folders and requests.
- [x] Add response search and header filtering.
- [x] Generate code snippets such as cURL.
- [x] Import cURL and export/import Laika collections.
- [x] Add duplicate-request and save-as workflows.
- [x] Complete empty, loading, and error states.
- [x] Review accessibility: focus order, labels, contrast, and reduced motion.

### Definition of Done

- [x] The compose, send, inspect, and save workflow can be completed with the keyboard.
- [x] Unsaved changes cannot be lost without a warning.
- [x] Import/export round trips preserve all non-secret data.
- [x] Typical JSON payloads can be opened and searched while the UI remains responsive.

### Implementation Notes

- Monaco is lazy-loaded and uses local editor and JSON workers, so syntax
  highlighting, diagnostics, formatting, and line wrapping work offline without
  increasing the initial application bundle.
- Request drafts are isolated per tab. Dirty tabs show a marker, warn on close
  and window exit, and support save-as plus keyboard creation, sending, saving,
  closing, and cycling.
- Native drag and drop supports moving and ordering requests and folders. The
  existing destination dialog remains available as the keyboard-accessible path.
- cURL generation redacts credentials, while cURL import opens an unsaved draft.
  Collection JSON exports include non-secret request data only and restore folder
  topology and request order during import.
- Response bodies support search, response headers support filtering, and both
  the sidebar and response panes can be resized or collapsed. The layout switches
  to stacked request/response panes for narrower desktop windows.

## Phase 6: API Testing

Goal: Extend the REST client to support repeatable API checks.

### Checklist

- [x] Create an assertion model for status, headers, JSON paths, and response time.
- [x] Create a test result view with pass/fail status and failure details.
- [x] Add a collection runner with sequential execution.
- [x] Support environment selection for test runs.
- [x] Add run summaries and persisted test results.
- [x] Export machine-readable results for CI.
- [x] Design a shared core contract for a CLI companion.
- [x] Evaluate pre-request and post-response scripting with a defined security boundary.

### Definition of Done

- [x] Assertions can be attached to a request and every assertion result is visible.
- [x] Collection runs produce reproducible summaries.
- [x] Failures identify the expected value, actual value, and related request.
- [x] Test result exports can be used in automation.

### Implementation Notes

- Migration `0003` stores request assertions plus bounded run summaries and
  per-request results. The newest 100 runs are retained per workspace.
- Assertions cover status codes, response headers, JSON paths, and response
  time, with variables and secrets resolved only immediately before execution.
- The Rust runner executes collection requests sequentially against an explicit
  environment snapshot. Assertion evaluation and result contracts are kept in a
  Tauri-independent module so a future CLI can reuse them.
- Every failure records its request, expected value, actual value, and message.
  Persisted values are redacted and size-limited before entering SQLite.
- Runs can be exported as a versioned JSON report suitable for CI ingestion.
- A scripting runtime remains deferred. Its proposed capability model, resource
  limits, and secret boundary are documented in the
  [scripting security evaluation](scripting-security.md).

## Phase 7: Release Readiness

Goal: Prepare the app for distribution and long-term maintenance.

### Checklist

- [x] Configure production app metadata, icons, versioning, and bundle identifiers.
- [ ] Add code signing for the Windows installer.
- [ ] Add an updater strategy and release channels.
- [x] Create CI for frontend checks, Rust tests, and Tauri builds.
- [x] Add backup/restore and database recovery workflows.
- [x] Review security: secret handling, command permissions, CSP, and dependency auditing.
- [x] Add performance tests for history/database operations and large responses.
- [x] Add opt-in crash/error diagnostics with no sensitive data.
- [x] Write a release checklist.
- [ ] Write complete user documentation.

### Definition of Done

- [ ] A clean machine can install, open, use, and uninstall the app.
- [ ] Version upgrades do not cause workspace data loss.
- [ ] Release artifacts are produced by CI and are traceable.
- [ ] The security and privacy checklist passes before publication.

### Implementation Notes

- Production identity uses the `Laika` product name, the stable
  `com.codenour.laika` bundle identifier, and an application-specific icon set
  generated from the checked-in high-resolution source image.
- Semantic versions are kept aligned across the frontend, Tauri configuration,
  and Rust package. `pnpm version:set` updates all three manifests and
  `pnpm version:check` prevents inconsistent release artifacts.
- GitHub Actions runs the frontend build and tests plus Rust formatting, linting,
  and tests on Windows, then creates unsigned NSIS and MSI validation artifacts
  tied to the source commit SHA. Signing and release publishing remain deferred
  until the certificate and update-channel strategy are selected.
- The release checklist documents the current publication blockers, including
  security review, signing, updater validation, and clean-machine upgrade
  testing.
- Settings can create a versioned `.laika-backup` containing a consistent
  SQLite snapshot and, when initialized, the encrypted Stronghold snapshot and
  salt as one compatible set. The manifest records sizes and SHA-256 checksums.
- Restore validates archive structure, checksums, database integrity, and schema
  compatibility before staging. Files are swapped before storage opens on the
  next launch, while the current workspace is retained for rollback.
- Existing databases receive a `VACUUM INTO` recovery snapshot before a pending
  migration. Automated tests cover backup/restore with secrets, invalid archive
  rejection, and version-one migration recovery.
- Production CSP restricts the bundled webview to local assets and Tauri IPC.
  The main window receives only a generated allowlist of registered application
  commands; broad core and unused opener permissions were removed.
- Secret-bearing inputs avoid diagnostic formatting, temporary secret buffers
  are zeroized across fallible operations, generic render errors omit details,
  and copied secrets are cleared after 30 seconds when unchanged.
- Credential-key redaction now covers headers, query parameters, form fields,
  cURL snippets, history, and saved/exported requests. CI validates permission
  drift and audits both frontend and Rust dependencies. The full threat model
  and residual risks are in [security-and-privacy.md](security-and-privacy.md).
- A release-only, offline performance harness measures deterministic empty,
  typical, and maximum workspaces plus 10 MiB and 50 MiB response boundaries.
  Scheduled/manual Windows CI stores informational results; provisional budgets
  and the initial baseline are documented in [performance.md](performance.md).
- Diagnostics are opt-in and disabled by default. `DiagnosticEvent`
  (`src-tauri/src/store/diagnostics.rs`) only carries an id, a timestamp, the
  app version, the OS, and closed enums for operation category, outcome,
  error code, and a coarse timing bucket, so it has no field a URL, header,
  body, environment value, or secret could be written into. Events are
  recorded locally in SQLite for HTTP requests, collection runs, and
  backup/restore, retained newest 500 per workspace, and only leave the
  device through an explicit "Export diagnostics…" action in Settings.

## Cross-Phase Quality Gates

Use this checklist to close the active phase, then reset it when the next phase begins:

- [x] Frontend: type checking and the production build pass.
- [x] Rust: formatting, linting, and tests pass.
- [x] Contract: frontend/backend payloads have validation and any required backward compatibility.
- [x] UX: loading, empty, success, and error states are complete.
- [x] Security: secrets do not enter logs, history, or error payloads.
- [x] Data: schema changes include migration and recovery considerations.
- [x] Documentation: the README and this plan are updated when scope or status changes.

## Suggested Commands

```bash
pnpm build
pnpm tauri dev
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

## Immediate Next Milestone

Continue Phase 7 with opt-in diagnostics that cannot collect sensitive request
data. The detailed delivery order, acceptance criteria, and release dependencies
are in [next-roadmap.md](next-roadmap.md).

## Scope Control

Do not begin the following work until the REST Request MVP is complete:

- Cloud synchronization and user accounts
- Team collaboration
- Plugin marketplace
- GraphQL/gRPC/WebSocket clients
- Full scripting runtime
- CLI implementation

Reassess these items using usage feedback after the local REST workflow is stable.
