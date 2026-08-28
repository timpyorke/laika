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
| 2 | REST Request MVP | Users can compose and send requests, then inspect responses | Planned |
| 3 | Local Workspace | Collections and history are stored in SQLite | Planned |
| 4 | Environments and Secrets | Variables and authentication secrets are handled securely | Planned |
| 5 | Workflow Polish | Everyday workflows are fast and data management is more complete | Planned |
| 6 | API Testing | Users can create assertions and run test cases | Planned |
| 7 | Release Readiness | The app can be distributed, used, and upgraded with confidence | Planned |

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

- [ ] Method selector: GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- [ ] URL input and Send/Cancel controls.
- [ ] Key/value query parameter editor with per-row enable/disable controls.
- [ ] Key/value header editor with per-row enable/disable controls.
- [ ] Body modes: none, JSON, text, and form URL encoded.
- [ ] Basic Auth and Bearer Token input.
- [ ] Response view: status, elapsed time, size, headers, and body.
- [ ] JSON formatting, raw text view, and response copying.
- [ ] Loading, timeout, invalid URL, TLS, and network error states.

### Rust HTTP Engine Checklist

- [ ] Add `reqwest` and create a Tauri command for request execution.
- [ ] Validate and normalize request input.
- [ ] Support the methods, query parameters, headers, body, and authentication exposed by the UI.
- [ ] Measure elapsed time and response size.
- [ ] Return status, headers, and body through a serializable contract.
- [ ] Limit response size to prevent memory exhaustion.
- [ ] Add a configurable timeout and cancellation mechanism.
- [ ] Prevent sensitive headers from appearing in debug logs.

### Test Checklist

- [ ] Add Rust unit tests for request validation and response mapping.
- [ ] Add integration tests using a local mock HTTP server.
- [ ] Add frontend tests for request serialization and UI error states.
- [ ] Manually smoke test: GET JSON, POST JSON, authentication, timeout, and non-2xx responses.

### Definition of Done

- [ ] Requests can be sent to HTTP/HTTPS endpoints without relying on browser CORS.
- [ ] Every request field shown in the UI is sent to Rust correctly.
- [ ] The response displays status, time, size, headers, and body.
- [ ] Cancellation and timeout stop a request without freezing the UI.
- [ ] User-actionable errors are clear and do not expose secrets.

## Phase 3: Local Workspace

Goal: Allow users to save requests and resume work after restarting the app.

### Checklist

- [ ] Add SQLite and select a Tauri-compatible database integration.
- [ ] Create a migration system and schema versioning.
- [ ] Design entities for workspace, collection, folder, request, and history entry.
- [ ] Create a Rust repository layer that is separate from Tauri commands.
- [ ] Implement CRUD for collections, folders, and saved requests.
- [ ] Record appropriate history entries after both successful and failed requests.
- [ ] Reopen requests from collections or history in the editor.
- [ ] Add search, rename, duplicate, move, and delete operations.
- [ ] Define a retention policy and clear-history workflow.
- [ ] Never store authentication secrets in SQLite.

### Data Checklist

- [ ] Store request metadata and non-secret values as structured data.
- [ ] Store large bodies only within defined limits.
- [ ] Use foreign keys and transactions for move/delete operations.
- [ ] Support migrations from the previous schema version.

### Definition of Done

- [ ] Saved requests and collections remain available after restart.
- [ ] History is created when a request finishes and can be reopened.
- [ ] Migrations work for both a new database and a database from the previous version.
- [ ] Database failures produce recoverable errors without closing the app.

## Phase 4: Environments and Secrets

Goal: Allow users to switch configuration between environments and store credentials securely.

### Checklist

- [ ] Create an environment and variable manager.
- [ ] Support an active environment and global/workspace variables.
- [ ] Use variable syntax such as `{{baseUrl}}`.
- [ ] Resolve variables in URLs, parameters, headers, bodies, and authentication before sending.
- [ ] Show unresolved variables before request execution.
- [ ] Separate regular values from secret values.
- [ ] Add Stronghold for tokens, passwords, and API keys.
- [ ] Store opaque secret references in SQLite.
- [ ] Mask secrets in the UI, with explicit reveal/copy actions.
- [ ] Redact secrets from logs, history, errors, and exported data by default.

### Definition of Done

- [ ] Switching the environment immediately applies the new values to requests.
- [ ] Undefined variables are never sent silently.
- [ ] Secrets are never stored as plaintext in SQLite.
- [ ] Secret references remain usable after restarting the app.
- [ ] Normal exports contain no secrets unless the user explicitly selects and confirms their inclusion.

## Phase 5: Workflow Polish

Goal: Make Laika fast and predictable enough for everyday use.

### Checklist

- [ ] Add Monaco Editor for JSON and raw request/response bodies.
- [ ] Add syntax highlighting, formatting, validation, and line wrapping.
- [ ] Add request tabs with dirty state and confirmation before closing.
- [ ] Add keyboard shortcuts for send, save, new request, and tab navigation.
- [ ] Make the sidebar and response panel resizable and collapsible.
- [ ] Add response search and header filtering.
- [ ] Generate code snippets such as cURL.
- [ ] Import cURL and export/import Laika collections.
- [ ] Add duplicate-request and save-as workflows.
- [ ] Complete empty, loading, and error states.
- [ ] Review accessibility: focus order, labels, contrast, and reduced motion.

### Definition of Done

- [ ] The compose, send, inspect, and save workflow can be completed with the keyboard.
- [ ] Unsaved changes cannot be lost without a warning.
- [ ] Import/export round trips preserve all non-secret data.
- [ ] Typical JSON payloads can be opened and searched while the UI remains responsive.

## Phase 6: API Testing

Goal: Extend the REST client to support repeatable API checks.

### Checklist

- [ ] Create an assertion model for status, headers, JSON paths, and response time.
- [ ] Create a test result view with pass/fail status and failure details.
- [ ] Add a collection runner with sequential execution.
- [ ] Support environment selection for test runs.
- [ ] Add run summaries and persisted test results.
- [ ] Export machine-readable results for CI.
- [ ] Design a shared core contract for a CLI companion.
- [ ] Evaluate pre-request and post-response scripting with a defined security boundary.

### Definition of Done

- [ ] Assertions can be attached to a request and every assertion result is visible.
- [ ] Collection runs produce reproducible summaries.
- [ ] Failures identify the expected value, actual value, and related request.
- [ ] Test result exports can be used in automation.

## Phase 7: Release Readiness

Goal: Prepare the app for distribution and long-term maintenance.

### Checklist

- [ ] Configure production app metadata, icons, versioning, and bundle identifiers.
- [ ] Add code signing for the Windows installer.
- [ ] Add an updater strategy and release channels.
- [ ] Create CI for frontend checks, Rust tests, and Tauri builds.
- [ ] Add backup/restore and database recovery workflows.
- [ ] Review security: secret handling, command permissions, CSP, and dependency auditing.
- [ ] Add performance tests for history/database operations and large responses.
- [ ] Add opt-in crash/error diagnostics with no sensitive data.
- [ ] Write user documentation and a release checklist.

### Definition of Done

- [ ] A clean machine can install, open, use, and uninstall the app.
- [ ] Version upgrades do not cause workspace data loss.
- [ ] Release artifacts are produced by CI and are traceable.
- [ ] The security and privacy checklist passes before publication.

## Cross-Phase Quality Gates

Use this checklist to close the active phase, then reset it when the next phase begins:

- [ ] Frontend: type checking and the production build pass.
- [ ] Rust: formatting, linting, and tests pass.
- [ ] Contract: frontend/backend payloads have validation and any required backward compatibility.
- [ ] UX: loading, empty, success, and error states are complete.
- [ ] Security: secrets do not enter logs, history, or error payloads.
- [ ] Data: schema changes include migration and recovery considerations.
- [ ] Documentation: the README and this plan are updated when scope or status changes.

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

Begin Phases 1 and 2 in the following order:

1. Install UI/state dependencies and create the application shell.
2. Define the shared request/response contract.
3. Create request editor state and UI controls.
4. Add a Rust `reqwest` command with local mock tests.
5. Connect React to the Tauri command.
6. Add the response viewer, cancellation, and error handling.
7. Run smoke tests and complete the REST Request MVP criteria.

## Scope Control

Do not begin the following work until the REST Request MVP is complete:

- Cloud synchronization and user accounts
- Team collaboration
- Plugin marketplace
- GraphQL/gRPC/WebSocket clients
- Full scripting runtime
- CLI implementation

Reassess these items using usage feedback after the local REST workflow is stable.
