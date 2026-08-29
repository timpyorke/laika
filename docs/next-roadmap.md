# Laika Next Roadmap

This roadmap covers the work between the current Phase 7 state and the first
public Windows release. The priority is to close release risks before starting
the deferred CLI, scripting, or additional protocol clients.

## Current Status

Phase 7E privacy-safe diagnostics, 7F's documentation deliverables (quick
start, known limitations/recovery, and the smoke-test script), and 7G's
signing/release workflow were all completed on 2026-08-29. Two things remain
open before Phase 7's definition of done is met: running the smoke-test
script on a clean Windows VM, and validating the signing workflow against a
real SignPath project on an actual tagged release — see
[signing-and-release.md](signing-and-release.md#-unverified-against-a-live-signpath-project).
The recommended next task is 7H once both are done.

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

**Status: Workflow implemented; unverified against a live SignPath project.**
Release artifacts are trusted and traceable once a real signed release has
been produced and checked. Decisions made:

- **Signing:** SignPath.io's free open-source tier.
- **Release host:** GitHub Releases.
- **Channels:** stable only; no prerelease/beta channel yet.
- **Updater:** none in the first releases — ship signed installers only,
  and add an in-app updater once this signed pipeline is proven.

`.github/workflows/release.yml` (triggered on a `v*` tag push) builds via the
shared `build-windows.yml` reusable workflow, submits the artifact to
SignPath from behind a protected `release` GitHub Environment, generates
`SHA256SUMS.txt`, and opens a draft GitHub Release. See
[signing-and-release.md](signing-and-release.md) for the one-time SignPath
and GitHub setup this depends on, the full cutting-a-release procedure, and
rollback guidance. The workflow's SignPath action inputs have not been
exercised against a real approved SignPath project yet — that happens on the
first real tagged release.

**Depends on:** A maintainer completing SignPath's OSS-program approval and
the one-time GitHub Environment/secret setup in
[signing-and-release.md](signing-and-release.md).

### 7H. Release Candidate and Publication

**Outcome:** Phase 7 is complete and the first public Windows build can be
published with confidence.

1. Freeze scope and set the release version.
2. Run all local and CI quality, security, performance, and recovery gates.
3. Complete the SignPath and GitHub one-time setup from
   [signing-and-release.md](signing-and-release.md), then cut the release by
   tagging and pushing — this is also the first live validation of the
   signing workflow itself.
4. Complete NSIS/MSI clean-machine and previous-version upgrade tests
   ([smoke-test.md](smoke-test.md)) against the signed artifacts.
5. Publish the reviewed draft release: signed immutable artifacts, checksums,
   release notes, and known issues.
6. Verify downloads and signatures after publication.
7. Mark Phase 7 complete only when every Definition of Done item passes.

## Priority and Parallelism

| Priority | Workstream | Status |
| --- | --- | --- |
| Done | 7D Performance baselines | Complete |
| Done | 7E Privacy-safe diagnostics | Complete |
| Done | 7F User documentation | Complete; VM run pending |
| Done | 7G Signing/release workflow | Complete; live SignPath run pending |
| P0 | 7H Release candidate | Blocked on the two pending validations above |

The remaining work is entirely validation, not implementation: run
[smoke-test.md](smoke-test.md) on a clean VM, and complete SignPath's OSS
approval so the release workflow can be exercised for real.

## Deferred Until After the First Release

- CLI companion
- Pre-request and post-response scripting
- Multiple workspaces
- Cloud sync and collaboration
- GraphQL, gRPC, and WebSocket clients

Prioritize these from user feedback after a stable, upgradeable Windows release
is available.
