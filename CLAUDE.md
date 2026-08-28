# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Laika is a local-first desktop REST client (Postman-like) built with Tauri 2 (Rust backend) and React 19 + TypeScript (Vite frontend). Requests are executed from Rust via `reqwest` so the app is not subject to browser CORS restrictions. See `docs/plan.md` for phase-by-phase status and `docs/architecture.md` for the target architecture (the codebase is still catching up to it — see "Current vs. target architecture" below).

## Commands

Frontend (run from repo root, pnpm):

```bash
pnpm install          # install deps
pnpm dev               # Vite dev server only (no Tauri shell)
pnpm tauri dev          # run the full desktop app in dev mode
pnpm build              # tsc typecheck + vite build
pnpm test               # run vitest (all frontend tests, single run)
pnpm tauri build         # build desktop app + installers
```

Run a single frontend test file or pattern:

```bash
pnpm test -- src/features/request/request-serialization.test.ts
pnpm test -- -t "some test name"
```

Rust backend (run from repo root; Cargo manifest lives in `src-tauri/`):

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Run a single Rust test:

```bash
cargo test --manifest-path src-tauri/Cargo.toml supports_timeout_and_cancellation
```

Minimum quality gate before considering a change done (per `docs/architecture.md` §12):

```bash
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
```

## Architecture

### System shape

```
React UI --invoke()--> Tauri commands (src-tauri/src/http.rs) --> reqwest --> external APIs
```

- The frontend never talks to the network directly; all HTTP execution happens in Rust (`src-tauri/src/http.rs`) via a shared `reqwest::Client` held in Tauri managed state (`HttpEngine`), registered in `src-tauri/src/lib.rs`.
- Two Tauri commands are currently exposed: `execute_http_request` and `cancel_http_request`. Frontend calls go through `src/features/request/request-client.ts`, which wraps `@tauri-apps/api/core` `invoke`.
- Every request carries a `requestId` generated on the frontend (`crypto.randomUUID()`). `HttpEngine` tracks in-flight requests by this ID in a `Mutex<HashMap<String, CancellationToken>>` so `cancel_http_request` can cancel a specific in-flight call. Sending a new request with the same ID cancels the previous one.
- `HttpRequestInput` / `HttpResponseOutput` in `http.rs` are the Rust-side DTOs; their TypeScript mirrors live in `src/types/http.ts` (`ExecuteHttpRequestInput`, `HttpResponse`). Field names are `camelCase` on both sides (`#[serde(rename_all = "camelCase")]`). Keep these two files in sync manually when the contract changes — there is no codegen.
- Errors crossing IPC use a stable `ApplicationErrorCode` enum (`INVALID_REQUEST`, `INVALID_URL`, `NETWORK_ERROR`, `TIMEOUT`, `CANCELLED`, etc.) with a safe, non-leaking `title`/`message`. Never let raw `reqwest`/library errors, stack traces, or secret values cross the IPC boundary — see `classify_reqwest_error` and the `ApplicationError` constructors in `http.rs` for the pattern to follow when adding new error cases. `src/lib/application-error.ts` normalizes unknown thrown values on the frontend into this shape.
- Request validation happens Rust-side in `validate_request` (URL scheme/host checks, header name/value validation, JSON body validation, timeout/response-size bounds, auth completeness). Response bodies are capped at `max_response_bytes` (min 1KiB, max 50MiB, default 10MiB) and marked `truncated` rather than growing unbounded.

### Frontend structure

- `src/store/use-app-store.ts` — single Zustand store holding the request draft, response, UI tab state, and the `sendRequest`/`cancelRequest` async actions. This is the primary state container today; `docs/architecture.md` calls for eventually splitting this into per-feature stores as scope grows (Phase 3+), but do not preemptively split it.
- `src/features/<name>/` — feature-first folders (`request`, `response`, `collections`, `history`, `environments`), each with an `index.ts` public entry point. Only `request` and `response` have real logic today (`collections`/`history`/`environments` are UI-only stubs pending Phase 3/4 in `docs/plan.md`).
- `src/features/request/request-serialization.ts` — pure mapping from `RequestDraft` (editable UI state, has `id`-keyed rows for params/headers/form) to `ExecuteHttpRequestInput` (the validated IPC payload). This is the pattern to follow for any new draft→DTO mapping: keep it a pure, independently testable function rather than inlining the transform into a component or store action.
- `src/components/ui/` — generic shadcn/ui-style primitives (button, dialog, input, tabs, resizable, key-value-table). Managed via `components.json` (shadcn CLI, "new-york" style, Tailwind CSS variables, `lucide` icons). These must not import from `features` or the Tauri API.
- `src/components/layout/app-shell.tsx` — top-level layout composing the sidebar, request workspace, and response panel.
- `src/types/http.ts` — shared TypeScript contract types (must stay aligned with `src-tauri/src/http.rs` DTOs).

### Rust backend structure

- Currently a flat `src-tauri/src/` (`lib.rs`, `main.rs`, `http.rs`) rather than the layered `commands/application/domain/infrastructure` split described in `docs/architecture.md`. That layering is the target for Phase 3+ (SQLite/Stronghold work); don't introduce it speculatively for the current HTTP-only scope.
- `http.rs` contains everything for the HTTP feature today: DTOs, validation, the `HttpEngine` (client + cancellation registry), execution logic, error classification, and `#[tauri::command]` entry points, plus inline `#[cfg(test)]` unit/integration tests using `wiremock` for a local mock HTTP server.
- Tauri capabilities are scoped in `src-tauri/capabilities/default.json` — keep permissions minimal when adding new commands.

### Key architectural rules (from `docs/architecture.md`, still binding even though the code hasn't fully adopted the target folder layout)

- React must never call `invoke` directly from a component — always go through a client module like `request-client.ts`.
- A feature must not reach into another feature's internal files; only import through `features/<name>/index.ts`.
- `components/ui` must stay free of feature/store/Tauri imports.
- Secrets (tokens, passwords) must never be logged, written to history, or echoed back in error messages — validation errors intentionally use static, non-parameterized messages for this reason (see the test `rejects_invalid_json_and_headers_without_echoing_values` in `http.rs`).
- Don't build ahead of the current phase (see `docs/plan.md`): SQLite persistence, Stronghold secrets, environments/variables, and scripting are all planned but not implemented — `collections`/`history`/`environments` features are intentionally UI-only stubs right now.

## Testing notes

- Frontend tests use Vitest + `@testing-library/react` + jsdom (`src/test/setup.ts` sets up jest-dom matchers and mocks `window.matchMedia`). Test files sit next to the code they test (`*.test.ts` / `*.test.tsx`).
- Rust tests live inline in `src-tauri/src/http.rs` under `#[cfg(test)] mod tests`, using `wiremock::MockServer` instead of real network calls — follow this pattern for new HTTP-engine tests rather than hitting live endpoints.
