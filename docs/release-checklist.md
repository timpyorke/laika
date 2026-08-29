# Release Checklist

Use this checklist for every Laika release candidate. The release foundation,
recovery workflow, opt-in diagnostics, and the signing/publish workflow are
implemented (see [signing-and-release.md](signing-and-release.md)); clean-
machine validation on a real signed build remains the publication blocker.
There is no in-app updater by design for the first releases — see the
Phase 7G decisions in [next-roadmap.md](next-roadmap.md).

## Release candidate

- [ ] Confirm the intended scope and release notes.
- [ ] Set the version with `pnpm version:set <version>`.
- [ ] Run `pnpm version:check` and commit all version files together.
- [ ] Confirm the bundle identifier remains `com.codenour.laika`.
- [ ] Confirm production metadata and icons render correctly in both installers.

## Quality gates

- [x] `pnpm build` passes.
- [x] `pnpm test` passes (49/49, 2026-08-29 against `b0d1807`).
- [x] `pnpm security:check` passes.
- [x] `pnpm audit --audit-level moderate` passes.
- [x] `cargo audit --file src-tauri/Cargo.lock` passes with only documented exceptions
      (Linux-only GTK/Stronghold maintenance warnings per
      [security-and-privacy.md](security-and-privacy.md#dependencies-and-maintenance);
      no vulnerabilities).
- [x] `cargo fmt --manifest-path src-tauri/Cargo.toml --check` passes.
- [x] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passes.
- [x] `cargo test --manifest-path src-tauri/Cargo.toml` passes (42/42, 2026-08-29
      against `b0d1807`).
- [x] `pnpm perf:baseline` stays within the documented investigation budgets,
      or any variance is repeated and explained (2026-08-29 run against
      `b0d1807`: all operations within the provisional p95 budgets in
      [performance.md](performance.md); peak working set 112.2 MiB vs. the
      175 MiB budget).
- [x] The CI quality-and-Windows-bundle job passes for the release commit
      (run `33249429752`, `b0d1807`, success).

## Data and security

- [ ] Exercise backup and restore with the database, Stronghold snapshot, and
      Stronghold salt as one compatible set.
- [ ] Confirm a corrupt or incompatible backup is rejected without changing the
      active workspace.
- [ ] Exercise an upgrade from the previous stable version without data loss.
- [x] Complete the security and privacy review, including CSP, permissions,
      dependency audit, logging, clipboard handling, and secret redaction.
- [ ] Validate opt-in diagnostics separately before enabling any collection:
      confirm the toggle defaults off, enable it and exercise a failing
      request, a passing request, a collection run, and a backup/restore,
      then open the exported JSON and confirm every event contains only the
      allowlisted fields (id, timestamp, app version, OS, category, outcome,
      error code, timing bucket) and no URL, header, body, or secret value.
      `cargo test --manifest-path src-tauri/Cargo.toml diagnostic_events_never_contain_request_content_or_secrets`
      covers the adversarial case; this step is the manual export spot-check.
- [ ] Review dependency changes and unresolved security advisories.

## Distribution artifacts

Pushing the release tag runs `.github/workflows/release.yml`, which builds,
signs via SignPath, computes checksums, and opens a draft GitHub Release
automatically — see [signing-and-release.md](signing-and-release.md) for the
full procedure and the one-time setup it depends on.

- [ ] `check-tag` confirmed the pushed tag matches the release version.
- [ ] The `release` environment deployment was reviewed and approved before
      signing ran.
- [ ] Signed NSIS and MSI installers and `SHA256SUMS.txt` are attached to the
      draft release.
- [ ] Checksums were verified locally against the downloaded files.
- [ ] The Authenticode signature is present and valid on each installer and
      on `laika.exe`.
- [ ] Publisher, product name, version, and icon are correct in file
      properties.
- [ ] The release is published as stable (not prerelease) — no beta channel
      exists yet.

## Clean-machine validation

Run [smoke-test.md](smoke-test.md) once per installer, each from a fresh VM
snapshot, covering both an empty workspace and a vault-initialized workspace.
Record evidence for this exact release commit below before checking these off
— Windows build, Laika version, installer type, pass/fail per section, and
any deviation.

- [ ] Install with NSIS on a supported clean Windows machine.
- [ ] Install with MSI on a supported clean Windows machine.
- [ ] Open Laika, send a request, save it, restart, and confirm persistence.
- [ ] Upgrade from the previous stable version and confirm workspace integrity.
- [ ] Uninstall and confirm the application binaries are removed.
- [ ] Confirm the documented local-data retention behavior after uninstall.

**Evidence for this release candidate:**

| Installer | Windows build | Laika version | Result | Notes |
| --- | --- | --- | --- | --- |
| NSIS | | | | |
| MSI | | | | |

## Documentation and publication

- [ ] Update the README, user documentation, and known issues.
- [ ] Review and edit the release's auto-generated notes before publishing.
- [ ] Publish the draft release (immutable once published; do not delete a
      published tag or release — ship a new patch release instead).
- [ ] Verify the GitHub Releases download links work after publication.
- [ ] Rollback instructions are in
      [signing-and-release.md](signing-and-release.md#rollback); confirm the
      previous stable release's artifacts are still available for users who
      need to revert.
