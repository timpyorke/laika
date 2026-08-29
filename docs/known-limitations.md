# Known Limitations and Recovery

What Laika does not do yet, and what to do if an install, upgrade, or
workspace goes wrong. This complements
[backup-and-recovery.md](backup-and-recovery.md), which covers the backup
format and automatic recovery snapshots in detail.

## Known limitations

- **Windows only.** Laika is built and tested for Windows; there is no macOS
  or Linux release.
- **Unsigned installers, no auto-update.** Current NSIS and MSI artifacts are
  CI validation builds, not signed releases. There is no update checker or
  release channel yet — see [versioning.md](versioning.md) and
  [release-checklist.md](release-checklist.md) for what's planned.
- **Single workspace.** Laika manages one local workspace per machine; there
  is no way to switch between multiple named workspaces or sync one across
  machines.
- **No CLI or scripting.** Pre-request/post-response scripting and a CLI
  companion are deferred; see the "Deferred Until After the First Release"
  list in [next-roadmap.md](next-roadmap.md).
- **No cloud sync or team collaboration.** All data — collections, history,
  environments, secrets — is local to the machine. There is no account
  system and nothing is synced automatically.
- **Diagnostics are manual and local-only.** There is no automatic crash
  reporting. Diagnostics must be explicitly enabled and explicitly exported
  by the user; see the quick start's [Diagnostics](quick-start.md#diagnostics-optional)
  section.
- **HTTP(S) only.** GraphQL, gRPC, and WebSocket clients are not implemented.

## If installation fails

- Confirm the WebView2 Runtime is installed (most current Windows systems
  have it already; Microsoft's evergreen bootstrapper installs it if not).
- Confirm you downloaded the installer that matches your intended commit or
  tag — artifact names include the source commit SHA.
- If NSIS fails, try the MSI installer for the same build, or the reverse.

## If an upgrade breaks your workspace

There is no updater yet, so "upgrading" today means installing a newer build
over an older one. Before a pending SQLite schema migration is applied to an
existing database, Laika automatically writes a pre-migration recovery
snapshot under `%APPDATA%\com.codenour.laika\recovery\`. If the new version
cannot open your database, that internal snapshot is a diagnostic starting
point, but it is not a substitute for your own backup.

**Always create a `.laika-backup` from Settings before installing a newer
build over an existing workspace.** To roll back:

1. Uninstall the newer build (your data is retained; see the quick start's
   [uninstall section](quick-start.md#uninstall-and-data-retention)).
2. Install the previous version's artifact.
3. If the workspace still won't open, restore your `.laika-backup` from
   Settings — see [backup-and-recovery.md](backup-and-recovery.md).

## If a restore fails validation

Laika rejects a corrupt or incompatible `.laika-backup` before touching your
active workspace — nothing is changed. Try a different backup file, or
confirm the file wasn't truncated or edited after it was created (checksums
are part of the format and any mismatch fails validation).

## If the vault won't unlock

The master password cannot be recovered — Laika never stores it. If it's
lost, the encrypted secret values in that vault are permanently
inaccessible; you'll need to re-enter secret variables and saved credentials
under a new master password. Non-secret workspace data (collections,
requests, history) is unaffected.
