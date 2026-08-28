# Laika

Laika is a desktop REST client for composing, sending, inspecting, and organizing HTTP API requests from a local-first desktop app.

The product direction is similar to a lightweight API workspace: start with a reliable request/response workflow, then add collections, history, environments, and secure local secrets.

## Current Status

Phases 0 through 4 of [docs/plan.md](docs/plan.md) are complete.

Implemented:

- Tauri 2 desktop app shell with a React + TypeScript + Vite frontend
- Request editor: method, URL, query parameters, headers, body modes, and auth
- Rust HTTP engine built on `reqwest`, with timeouts, cancellation, response
  size limits, and CORS-free execution
- Response viewer with status, elapsed time, size, headers, and body
- SQLite workspace: collections, nested folders, saved requests, sidebar move actions, and history
- Request history with search, reopen, per-entry delete, and clear all
- Credential values are never written to SQLite
- Workspace/environment variables with an active-environment selector and
  `{{variable}}` resolution across every request field
- Stronghold-backed secret vault for variables and saved authentication, with
  masked values and explicit reveal/copy actions

Not implemented yet:

- Drag-and-drop reordering in the sidebar
- Monaco editor, cURL import/export, and request tabs
- API testing assertions and a collection runner

## Tech Stack

Current:

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust
- `reqwest` for HTTP execution
- `sqlx` with SQLite for local collections, history, and workspace data
- Stronghold for encrypted local secrets
- Zustand for frontend state
- Tailwind CSS and shadcn/ui for the application UI

Planned:

- Monaco Editor for JSON, raw body, and response editing

## Project Structure

```text
.
├── public/                  Static assets served by Vite
├── src/                     React frontend source
│   ├── components/          App shell, layout, and shared UI primitives
│   ├── features/            Feature modules: request, response, collections,
│   │                        history, environments
│   ├── lib/                 Error contract and display helpers
│   ├── store/               Zustand application store
│   ├── types/               Shared HTTP and workspace contracts
│   ├── App.tsx              Application root
│   ├── main.tsx             React entrypoint
│   └── vite-env.d.ts        Vite type declarations
├── src-tauri/               Tauri/Rust desktop backend
│   ├── capabilities/        Tauri permission capabilities
│   ├── icons/               App and installer icons
│   ├── migrations/          Versioned SQLite schema migrations
│   ├── src/
│   │   ├── error.rs         Shared user-facing error contract
│   │   ├── http.rs          HTTP engine built on reqwest
│   │   ├── secrets.rs       Stronghold-backed encrypted secret vault
│   │   ├── variables.rs     Request variable resolution and validation
│   │   ├── store/           SQLite repository layer and Tauri commands
│   │   ├── lib.rs           Tauri command registration and app builder
│   │   └── main.rs          Native entrypoint
│   ├── build.rs             Tauri build script
│   ├── Cargo.toml           Rust package and dependencies
│   └── tauri.conf.json      App, build, window, and bundle config
├── index.html               Vite HTML entry
├── package.json             Frontend scripts and dependencies
├── pnpm-lock.yaml           Locked frontend dependency graph
├── tsconfig.json            TypeScript config
├── tsconfig.node.json       TypeScript config for Vite
└── vite.config.ts           Vite + Tauri dev server config
```

Generated directories such as `node_modules/`, `dist/`, `.pnpm-store/`, and `src-tauri/target/` should not be committed.

## Development

Install frontend dependencies:

```bash
pnpm install
```

Run the Vite frontend only:

```bash
pnpm dev
```

Run the Tauri desktop app in development:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Run the frontend tests:

```bash
pnpm test
```

Run the Rust checks:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the desktop app and installers:

```bash
pnpm tauri build
```

## Local Requirements

- Node.js
- pnpm
- Rust toolchain via rustup
- Tauri system dependencies for Windows
- WebView2 Runtime
- Visual Studio Build Tools or Visual Studio with MSVC

On Windows, make sure Cargo is available in `PATH`:

```text
%USERPROFILE%\.cargo\bin
```

## Build Outputs

After a successful release build, the main outputs are created under:

```text
src-tauri/target/release/
src-tauri/target/release/bundle/
```

Typical Windows artifacts:

- `src-tauri/target/release/laika.exe`
- `src-tauri/target/release/bundle/msi/laika_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/laika_0.1.0_x64-setup.exe`

## Roadmap

### V0.1: Send A Request

- Method and URL input
- Query params, headers, body, and auth sections
- Tauri command from React to Rust
- Rust HTTP execution with `reqwest`
- Response status, elapsed time, headers, and body viewer
- Basic error handling for network and invalid request cases

### V0.2: Local Workspace

- Collections and nested folders
- Saved requests with rename, duplicate, and delete
- Request history with search and reopen
- SQLite persistence with versioned migrations
- Environment variables
- Secure secret storage

## Local Data

The workspace database is created on first launch at:

```text
%APPDATA%\com.codenour.laika\laika.db
```

It stores collections, folders, saved requests, environments, opaque secret
references, and history. Authentication tokens, passwords, and secret variable
values are stored in `laika.stronghold`, never as plaintext in SQLite.
Credential values are redacted before history is saved. Deleting both local
files resets the workspace and vault.

### Later

- API testing assertions
- Import/export workflows
- Multiple workspaces
- CLI companion
- Request scripting and pre-request hooks
