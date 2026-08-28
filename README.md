# Laika

Laika is a desktop REST client for composing, sending, inspecting, and organizing HTTP API requests from a local-first desktop app.

The product direction is similar to a lightweight API workspace: start with a reliable request/response workflow, then add collections, history, environments, and secure local secrets.

## Current Status

This repository is currently at the initial Tauri scaffold stage.

Implemented:

- Tauri 2 desktop app shell
- React + TypeScript + Vite frontend
- pnpm package management
- Rust backend entrypoint with a sample Tauri command
- Windows release build and installer generation verified

Not implemented yet:

- REST request builder UI
- Rust HTTP engine with `reqwest`
- Collections and request history
- Environment variables
- Secret storage with Stronghold
- SQLite persistence

## Tech Stack

Current:

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust

Planned:

- Rust `reqwest` for HTTP execution
- SQLite for local collections, history, and workspace data
- Stronghold for secrets and auth values
- Zustand for frontend state
- Tailwind CSS and shadcn/ui for the application UI
- Monaco Editor for JSON, raw body, and response editing

## Project Structure

```text
.
├── public/                  Static assets served by Vite
├── src/                     React frontend source
│   ├── App.tsx              Current scaffold UI
│   ├── App.css              Current scaffold styles
│   ├── main.tsx             React entrypoint
│   └── vite-env.d.ts        Vite type declarations
├── src-tauri/               Tauri/Rust desktop backend
│   ├── capabilities/        Tauri permission capabilities
│   ├── icons/               App and installer icons
│   ├── src/
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

- Collections
- Request history
- Environment variables
- SQLite persistence
- Secure secret storage

### Later

- API testing assertions
- Import/export workflows
- Multiple workspaces
- CLI companion
- Request scripting and pre-request hooks
