# Release Checklist

Use this checklist for every Laika release candidate. The release foundation
and recovery workflow are implemented; unchecked signing, updater, diagnostics,
and clean-machine validation remain publication blockers.

## Release candidate

- [ ] Confirm the intended scope and release notes.
- [ ] Set the version with `pnpm version:set <version>`.
- [ ] Run `pnpm version:check` and commit all version files together.
- [ ] Confirm the bundle identifier remains `com.codenour.laika`.
- [ ] Confirm production metadata and icons render correctly in both installers.

## Quality gates

- [ ] `pnpm build` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm security:check` passes.
- [ ] `pnpm audit --audit-level moderate` passes.
- [ ] `cargo audit --file src-tauri/Cargo.lock` passes with only documented exceptions.
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check` passes.
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `pnpm perf:baseline` stays within the documented investigation budgets,
      or any variance is repeated and explained.
- [ ] The CI quality-and-Windows-bundle job passes for the release commit.

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

- [ ] Build NSIS and MSI installers from the exact release commit.
- [ ] Sign the executable and installers with the approved Windows certificate.
- [ ] Record SHA-256 checksums and the source commit SHA.
- [ ] Verify the publisher, product name, version, and icon in file properties.
- [ ] Verify updater metadata and the intended stable or prerelease channel.

## Clean-machine validation

- [ ] Install with NSIS on a supported clean Windows machine.
- [ ] Install with MSI on a supported clean Windows machine.
- [ ] Open Laika, send a request, save it, restart, and confirm persistence.
- [ ] Upgrade from the previous stable version and confirm workspace integrity.
- [ ] Uninstall and confirm the application binaries are removed.
- [ ] Confirm the documented local-data retention behavior after uninstall.

## Documentation and publication

- [ ] Update the README, user documentation, changelog, and known issues.
- [ ] Publish immutable artifacts and checksums for the matching `v<version>` tag.
- [ ] Verify download links and updater metadata after publication.
- [ ] Record rollback instructions and retain the previous stable artifacts.
