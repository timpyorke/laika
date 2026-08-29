# Laika Next Roadmap

This roadmap covers the work between the current Phase 7 state and the first
public Windows release. The priority is to close release risks before starting
the deferred CLI, scripting, or additional protocol clients.

## Current Status

Phase 7E privacy-safe diagnostics were completed on 2026-08-29. Phase 7F's
documentation deliverables (quick start, known limitations/recovery, and the
smoke-test script) were completed the same day; running that script on a
clean Windows VM for an actual release candidate is still open. 7G's
distribution decisions can proceed in parallel with that VM validation.

### Completed 7D Scope

- Add deterministic workspace fixtures for an empty workspace, a typical
  workspace, and a maximum-retention workspace with 1,000 history entries.
- Measure collection-tree loading, history listing and search, request/history
  writes, application storage startup, and database migration startup.
- Measure HTTP responses near the default 10 MiB limit and configured 50 MiB
  maximum, including truncation and cancellation behavior.
- Record wall-clock time and peak-memory observations on the supported Windows
  release environment.
- Document the initial results in `docs/performance.md`; use the first run to
  set budgets instead of inventing thresholds before data exists.
- Add deterministic correctness tests to CI immediately. Run timing benchmarks
  as informational CI output first, then promote stable regression checks after
  enough runs establish normal variance.

### 7D Acceptance Criteria

- A developer can regenerate all datasets and rerun the measurements from
  documented commands.
- Measurements cover empty, typical, and worst supported data sizes.
- Large-response tests prove that limits and cancellation still protect memory.
- Baseline results include machine/toolchain context and identify the slowest
  operations.
- Any optimization is delivered separately and is backed by before/after data.

## Delivery Sequence

### 7D. Performance Baselines

**Status: Complete.** Release-critical storage and response paths have
reproducible baselines and explicit provisional budgets. See
[performance.md](performance.md).

1. Build fixture generators and benchmark harnesses.
2. Capture the first Windows baseline.
3. Define budgets from measured variance and product expectations.
4. Fix only release-blocking regressions or memory growth.
5. Add the stable subset to the release checklist and CI.

**Depends on:** Existing Phase 3 storage and Phase 2 HTTP response limits.

### 7E. Privacy-Safe Diagnostics

**Status: Complete.** A user can explicitly create useful diagnostic
information without submitting request content or credentials. See the
diagnostics data-classification entry and adversarial-redaction control in
[security-and-privacy.md](security-and-privacy.md).

1. Define an allowlisted event schema for app version, OS version, error code,
   operation category, and timing bucket.
2. Start with local-only diagnostics and an explicit "Export diagnostics"
   action; do not add background upload in the first release.
3. Exclude URLs, headers, parameters, bodies, environment values, filesystem
   paths, vault state, and database contents.
4. Apply size and retention limits and make diagnostics disabled by default.
5. Add adversarial redaction tests using tokens in every request field and
   error path.
6. Update the privacy and security documentation before enabling the feature.

**Depends on:** Performance event names and timing measurements from 7D.

### 7F. User Documentation and Release Validation

**Status: Documentation complete; VM validation pending.** A new user can
install Laika and complete the core workflow by following the docs below.
Actually exercising [smoke-test.md](smoke-test.md) on a clean Windows VM for
a real release candidate is a manual step that still needs to happen before
Phase 7's definition of done is met.

1. [x] Write a quick start for install, first request, save/reopen,
   environments, secrets, collection runs, backup, restore, and uninstall
   data retention — [quick-start.md](quick-start.md).
2. [x] Document known limitations and recovery/rollback steps —
   [known-limitations.md](known-limitations.md).
3. [x] Create a manual smoke-test script for clean Windows VMs covering NSIS
   and MSI install, restart persistence, backup/restore, upgrade, and
   uninstall — [smoke-test.md](smoke-test.md).
4. [ ] Test both an empty workspace and a workspace containing an initialized
   vault. The script covers both; it has not yet been run on a clean VM.
5. [x] Record evidence for each release candidate in the release checklist —
   see the Clean-machine validation evidence table in
   [release-checklist.md](release-checklist.md).

**Depends on:** Diagnostic UX being stable enough to document.

### 7G. Signing and Update Channel

**Outcome:** Release artifacts are trusted, traceable, and can be upgraded
without workspace loss.

Before implementation, decide:

- code-signing certificate/provider and how CI receives signing access;
- release host and whether GitHub Releases is the canonical artifact source;
- stable versus prerelease channels and rollout/rollback policy;
- whether the first public build ships with automatic checks, manual checks, or
  no updater until a signed upgrade path has been validated.

Then implement signing in the release workflow, generate checksums and updater
metadata from the exact tagged commit, verify signatures after download, and
exercise update and rollback on a clean VM. Secrets must use protected CI
environments and must never be available to pull-request jobs.

**Depends on:** Distribution decisions and access to signing credentials.

### 7H. Release Candidate and Publication

**Outcome:** Phase 7 is complete and the first public Windows build can be
published with confidence.

1. Freeze scope and set the release version.
2. Run all local and CI quality, security, performance, and recovery gates.
3. Complete NSIS/MSI clean-machine and previous-version upgrade tests.
4. Publish signed immutable artifacts, checksums, release notes, known issues,
   updater metadata, and rollback instructions.
5. Verify downloads, signatures, updater behavior, and support documentation.
6. Mark Phase 7 complete only when every Definition of Done item passes.

## Priority and Parallelism

| Priority | Workstream | Can start now | Main blocker |
| --- | --- | --- | --- |
| P0 | 7D Performance baselines | Yes | None |
| P0 | 7E Diagnostics design | After event vocabulary from 7D | Privacy review |
| P0 | 7F User docs and VM test plan | Yes | Final UX details |
| P0 | 7G Signing/updater decisions | Yes | Product decisions and certificate |
| P1 | 7G Signing/updater implementation | No | Decisions and credentials |
| P1 | 7H Release candidate | No | 7D-7G complete |

Performance work is the critical technical path. Documentation and the
distribution decision record can proceed in parallel, but release automation
must not handle real signing credentials until the threat model and protected
CI environment are approved.

## Deferred Until After the First Release

- CLI companion
- Pre-request and post-response scripting
- Multiple workspaces
- Cloud sync and collaboration
- GraphQL, gRPC, and WebSocket clients

Prioritize these from user feedback after a stable, upgradeable Windows release
is available.
