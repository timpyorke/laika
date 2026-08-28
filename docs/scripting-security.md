# Request Scripting Security Evaluation

Phase 6 deliberately does not embed a pre-request or post-response scripting
runtime. Assertions and collection runs use typed, deterministic Rust contracts
instead. A later scripting feature must satisfy this boundary before it can be
enabled.

## Trust Model

- Imported collections and scripts are untrusted, including files created by a
  known teammate or external tool.
- Scripts are disabled by default and require an explicit per-workspace opt-in.
- Opening, importing, or previewing a collection must never execute code.
- The desktop process, filesystem, environment variables, Stronghold references,
  clipboard, shell, and Tauri command surface are outside the script sandbox.

## Required Runtime Boundary

- Use an isolated runtime with no Node.js, DOM, Tauri, filesystem, process,
  dynamic import, WebAssembly, or arbitrary network APIs.
- Expose only versioned value objects: a redacted request draft, a bounded response
  snapshot, selected non-secret variables, and assertion/result helpers.
- Network access must go through Laika's Rust HTTP engine so URL validation,
  timeout, cancellation, response limits, TLS handling, and redaction remain
  mandatory.
- Secret variables may be substituted into an outgoing request inside Rust, but
  their resolved values must never enter the script context, logs, thrown errors,
  persisted results, or exported reports.
- Enforce per-script CPU time, wall-clock time, memory, output, and recursion
  limits. A timeout terminates the isolate rather than reusing it.
- Create a fresh isolate per execution and do not share global state between
  requests or collection runs.

## Product Requirements Before Implementation

- Show the exact capabilities and execution points before enabling a script.
- Provide a one-click way to disable all scripts in a workspace.
- Mark collections containing scripts before import and require confirmation
  before enabling them; importing alone stays safe.
- Add adversarial tests for infinite loops, memory exhaustion, prototype/global
  mutation, data exfiltration, secret reflection, malformed exports, and runtime
  escape attempts.
- Version the script API and reject unsupported versions rather than silently
  changing behavior.

## Decision

Keep scripting deferred. The typed assertion evaluator in
`src-tauri/src/testing.rs` is the shared desktop/CLI core for Phase 6 and does
not require executable user code. Revisit the runtime only after the release
security review in Phase 7.
