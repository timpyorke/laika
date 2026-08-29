# Security and Privacy

This document records the Phase 7 security review completed on 2026-08-29.
It defines Laika's current trust boundaries, controls, and known residual risks.

## Security model

Laika is a local-first desktop REST client. The frontend is bundled with the
application and calls a Rust backend through typed Tauri commands. The backend
is the only component that sends HTTP requests, writes SQLite data, accesses
the Stronghold vault, or creates and restores workspace backups.

Laika protects against accidental credential persistence or disclosure,
untrusted content gaining unnecessary desktop capabilities, malformed backup
archives, and vulnerable direct or transitive dependencies. A malicious local
administrator, malware running as the user, a compromised operating system, or
physical access to an unlocked machine is outside the application boundary.

## Data classification and flows

- Secret data includes bearer tokens, basic-auth passwords, secret environment
  variables, cookies, API keys, client secrets, and vault master passwords.
- Workspace data includes request URLs, non-secret parameters and headers,
  bodies, collections, environments, history, and test results.
- Secret environment values and saved authentication credentials are stored in
  the encrypted Stronghold snapshot. SQLite stores only opaque secret
  references.
- The master password is accepted by one Tauri command, used to unlock the
  vault, and zeroized before the command returns.
- Secrets are resolved immediately before request execution. Credential-shaped
  header, query, and form fields are redacted before saved requests, history,
  test results, cURL snippets, or collection exports are persisted or copied.
- A whole-workspace backup includes the encrypted Stronghold snapshot and salt
  when the vault exists. It never decrypts the vault for export.
- Laika has no telemetry, analytics, remote logging, or automatic diagnostics.
  Network traffic is limited to endpoints explicitly requested by the user.

## Implemented controls

### Tauri and webview boundary

- Production builds use a restrictive Content Security Policy. Scripts,
  application assets, IPC, fonts, and Monaco workers are limited to the bundled
  application and Tauri's local protocols; object embedding, forms, framing,
  and remote network connections from the webview are denied.
- Development CSP is explicitly disabled for Vite hot reload. Development
  builds are not release artifacts.
- JavaScript prototype freezing is enabled in production configuration.
- The main window has one custom permission containing the exact registered
  command allowlist. Tauri's broad core default and opener permissions are not
  granted, and the unused opener plugin is not included.
- `pnpm security:check` compares the registered Rust commands, build manifest,
  permission file, frontend invocations, CSP, and forbidden plugin state so
  permission drift fails locally and in CI.

### Secrets and disclosure prevention

- Secret-bearing command inputs and HTTP request models do not implement Rust
  `Debug`, reducing accidental diagnostic disclosure.
- Incoming authentication and environment secret values use zeroizing wrappers
  across fallible vault and database operations. Temporary history-redaction
  values are zeroized when execution completes.
- The React error boundary logs only a generic event and never the error object,
  message, or component stack.
- Revealed secrets require an explicit user action. A copied secret is cleared
  after 30 seconds when the clipboard still contains the same value; clipboard
  permission failures make this best effort.
- Redaction recognizes common credential names and normalized suffixes such as
  `*_token`, `*_secret`, `*_password`, and `*_api_key`. Tests verify these values
  do not enter SQLite or generated cURL snippets.

### Dependencies and maintenance

- The frontend lockfile overrides DOMPurify to a patched version. CI rejects
  moderate-or-higher pnpm audit findings.
- CI runs the RustSec database against the Rust lockfile. Dependabot checks npm,
  Cargo, and GitHub Actions dependencies weekly.
- `RUSTSEC-2023-0071` is ignored only because its `rsa` package is absent from
  the supported `x86_64-pc-windows-msvc` release graph and no fixed version is
  available. The exception is documented in `.cargo/audit.toml` and
  must be removed before another operating-system target is released.

## Residual risks

- While the vault is unlocked, a compromised frontend or process running with
  the user's privileges could request revealed values. CSP and least-privilege
  command permissions reduce exposure but cannot defend a compromised OS.
- Arbitrary credentials embedded in URLs or body text cannot be identified
  reliably. Users should keep credentials in secret variables or supported auth
  fields. Request bodies and non-credential URL values are workspace data and
  may appear in SQLite, history, exports, and backups.
- Clipboard clearing depends on WebView and operating-system clipboard read
  permission. Clipboard managers may retain their own history.
- Stronghold currently brings transitive crates with RustSec maintenance
  warnings (`bincode` and `paste`) on Windows. There is no known actionable
  vulnerability in the supported graph; upgrades should follow upstream
  Stronghold releases.
- The cross-platform lockfile also contains GTK maintenance and soundness
  warnings for Linux-only Tauri dependencies. They are absent from the Windows
  release graph and must be reassessed before Linux becomes a release target.
- Production CSP is validated statically and by the release build. A packaged
  clean-machine smoke test remains required before publication.

## Verification

Run the following before a release candidate:

```bash
pnpm security:check
pnpm audit --audit-level moderate
cargo audit --file src-tauri/Cargo.lock
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Review this document whenever a Tauri command, plugin, data export, diagnostics
pipeline, supported platform, or secret-bearing feature is added.
