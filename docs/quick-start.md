# Quick Start

This is the first-run walkthrough for a new Laika user: install, send a
request, save your work, and understand what stays on your machine.

## Install

Laika ships as a Windows NSIS installer (`.exe`) and an MSI installer.
Signed, versioned releases are not published yet (see
[release-checklist.md](release-checklist.md)); until then, download an
artifact from a CI run for the commit or tag you want, matching the SHA in
the artifact name. Run either installer and follow its prompts. WebView2 is
required and is installed automatically by most current Windows systems.

## Send your first request

1. Open Laika. A new, empty request tab is ready by default.
2. Choose a method from the dropdown (`GET` by default) and type a URL.
3. Select **Send**.
4. The response panel on the right shows status, elapsed time, size,
   headers, and body as soon as the request completes.

Use the **Params**, **Headers**, **Body**, and **Auth** tabs below the URL
bar to add query parameters, headers, a JSON/text/form body, or Basic/Bearer
authentication before sending.

## Save a request and reopen it

1. Select **Save** (or `Ctrl+S`). The first save asks for a collection and a
   name; **Save as** (`Ctrl+Shift+S`) always asks.
2. Saved requests appear under the **Saved** tab in the left sidebar,
   organized into collections and folders.
3. Select a saved request to reopen it in a new tab. Every request you send
   — saved or not — is also recorded in the **History** tab, where you can
   search and reopen past runs.

## Environments and variables

1. Select **Manage environments** in the title bar to create an environment
   and add variables to it, or to add variables directly to the workspace
   (no environment required).
2. Reference a variable anywhere in a request — URL, params, headers, body,
   or auth — with `{{variableName}}`.
3. Pick the active environment from the selector next to **Manage
   environments**. Switching it re-resolves `{{variable}}` references on your
   next send.
4. If a request references a variable that isn't defined in the active
   environment or the workspace, Laika stops before sending and tells you
   which names are missing — it never sends a request with an unresolved
   placeholder.

## Secrets

1. In the **Manage environments** dialog, mark a variable **Secret** to store
   its value in the encrypted vault instead of the plain workspace database.
   The first secret value you save creates the vault and asks you to set a
   master password.
2. On future launches, unlock the vault from the same dialog with that
   master password before secret variables resolve or saved Bearer/Basic
   credentials are sent.
3. Secret values are masked in the UI. Revealing or copying one is an
   explicit action, and a copied secret clears from the clipboard after 30
   seconds if you haven't copied something else. See
   [security-and-privacy.md](security-and-privacy.md) for the full data
   classification and redaction guarantees.

## Collection runs

1. Open a saved request's **Tests** tab and add assertions for status,
   headers, a JSON path, or response time.
2. Switch the sidebar to the **Runs** tab, pick a collection and (optionally)
   an environment, and select **Run**. Requests execute sequentially against
   that environment snapshot.
3. Results show pass/fail per request with expected vs. actual values.
   Recent runs are listed for reopening, and any run can be exported as
   versioned JSON for CI consumption.

## Backup and restore

Open **Settings** in the title bar to create a `.laika-backup` archive or
restore one — see [backup-and-recovery.md](backup-and-recovery.md) for the
full workflow, what's included, and how recovery behaves if a restore fails.

## Diagnostics (optional)

Diagnostics are off by default. Turn them on in **Settings** if you want
Laika to keep a local, allowlisted event log (app version, OS, operation
category, outcome, error code, coarse timing) for requests, collection runs,
and backup/restore — never a URL, header, body, or secret. Nothing leaves
your device unless you use **Export diagnostics…**.

## Uninstall and data retention

Uninstalling Laika (via NSIS or "Add or Remove Programs") removes the
installed application files. It does not delete your workspace: the SQLite
database, the encrypted secret vault, and the `.laika-backup` files you've
saved all live under

```text
%APPDATA%\com.codenour.laika\
```

which the uninstaller leaves in place. Delete that folder yourself if you
want a clean reset, or keep it if you plan to reinstall later. This behavior
is exercised as part of the [clean-machine smoke test](smoke-test.md) before
every release.

## If something goes wrong

- A request error (invalid URL, timeout, network failure, TLS failure) shows
  a specific, non-sensitive message in the response panel — it never
  includes secret values.
- If local storage fails to open, collections and history are disabled for
  that session rather than crashing the app; restart Laika after resolving
  the underlying issue (for example, disk space).
- For workspace corruption or a bad upgrade, see the recovery behavior in
  [backup-and-recovery.md](backup-and-recovery.md) — Laika keeps automatic
  pre-migration and pre-restore snapshots in addition to any backups you
  create yourself.
