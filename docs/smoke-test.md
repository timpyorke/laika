# Clean-Machine Smoke Test

A manual script for validating a release candidate on a clean Windows
virtual machine, before it is signed and published. Run the whole script
once per installer (NSIS, then MSI), each from a fresh VM snapshot with no
prior Laika install, no `%APPDATA%\com.codenour.laika\` directory, and no
WebView2 pre-installed if you want to also validate the WebView2 bootstrap.

Record the outcome of each step in the release checklist's
[Clean-machine validation](release-checklist.md#clean-machine-validation)
section for the release candidate under test — pass/fail plus the Windows
build, installer type, and Laika version.

## 1. Install

1. Copy the installer artifact to the VM and confirm its file name matches
   the intended commit SHA or `v<version>` tag.
2. Run the installer. Confirm WebView2 is installed automatically if it
   wasn't already present.
3. Confirm the Start Menu entry, product name (**Laika**), and version
   shown in the installer match the release candidate.

**Expected:** install completes without errors; Laika launches from the
Start Menu entry.

## 2. First launch — empty workspace

1. Launch Laika. Confirm the main window opens with a single empty request
   tab, no saved collections, no history, and the vault shows as
   uninitialized in **Manage environments**.
2. Confirm `%APPDATA%\com.codenour.laika\laika.db` now exists and
   `laika.stronghold` does not.

**Expected:** first-run state matches [quick-start.md](quick-start.md); no
leftover data from a previous install on this VM.

## 3. Send a request and confirm restart persistence

1. Send a `GET` request to any reachable HTTPS endpoint. Confirm the
   response panel populates.
2. Save the request into a new collection (`Ctrl+S`). Confirm it appears
   under the **Saved** sidebar tab and the send you just did appears under
   **History**.
3. Quit Laika completely and relaunch it.
4. Confirm the saved request, its collection, and the history entry are all
   still present.

**Expected:** no data loss across a restart.

## 4. Initialize the vault and create a secret

1. Open **Manage environments**, create an environment, and add one
   variable to it marked **Secret**. Set a master password when prompted.
2. Confirm `%APPDATA%\com.codenour.laika\laika.stronghold` and
   `laika.stronghold.salt` now exist.
3. Quit and relaunch Laika. Confirm the vault shows as locked, and unlocks
   with the master password you set.

**Expected:** vault initializes on first secret, persists, and requires the
same master password after restart.

## 5. Backup and restore

1. Open **Settings** → **Create backup** and save a `.laika-backup` file
   outside the app data directory.
2. Add one more saved request (a change the backup does *not* contain).
3. Open **Settings** → **Restore…**, select the backup from step 1, confirm,
   then quit and relaunch Laika.
4. Confirm the request from step 3 is gone (the restore replaced the
   workspace) and everything from steps 3–4's *earlier* state (the saved
   request, the secret environment variable, unlocking with the same master
   password) is back.

**Expected:** matches [backup-and-recovery.md](backup-and-recovery.md);
restore is staged and applied cleanly on the next launch.

## 6. Upgrade

1. Without uninstalling, run the installer for a **newer** Laika build (same
   installer type as this pass).
2. Launch it. Confirm the workspace, collections, history, and vault from
   the previous version are all intact and the version number has changed.
3. If the newer build includes a schema migration, confirm
   `%APPDATA%\com.codenour.laika\recovery\` now contains a pre-migration
   snapshot.

**Expected:** in-place upgrade preserves the entire workspace; no manual
restore needed.

## 7. Uninstall

1. Uninstall Laika via the Start Menu shortcut or "Add or Remove Programs".
2. Confirm the installed program files are removed and the Start Menu entry
   is gone.
3. Confirm `%APPDATA%\com.codenour.laika\` — the database, vault, and any
   `.laika-backup` files you created — is **still present**, matching
   [quick-start.md's uninstall section](quick-start.md#uninstall-and-data-retention).
4. Reinstall the same build and confirm the retained workspace reopens
   without re-entering the master password setup (it should prompt to
   unlock with the existing password, not create a new vault).

**Expected:** uninstall removes the application only; reinstalling resumes
the same workspace.

## Recording results

For each pass (NSIS, MSI), note in the release checklist:

- Windows build and Laika version under test.
- Pass/fail for each numbered section above, with a one-line note on any
  deviation.
- Whether both an empty workspace (sections 1–2) and a vault-initialized
  workspace (sections 4 onward) were exercised, per the release checklist's
  diagnostics/data gates.

A release candidate is not ready to publish until both installer passes are
recorded as fully passing for the exact commit being released.
