# Backup and Recovery

Laika can save and restore the complete local workspace from **Settings →
Workspace backup**. A backup includes collections, saved requests, request
history, environments, test runs, and—when initialized—the encrypted secret
vault.

## Create a backup

1. Open **Settings** from the title bar.
2. Select **Create backup**.
3. Choose a safe destination for the `.laika-backup` file.

The archive is created from a transactionally consistent SQLite snapshot. The
Stronghold snapshot and its key-derivation salt are flushed and copied as one
pair. Secret values remain encrypted; the backup does not contain the master
password and cannot reset it.

Keep backups somewhere separate from the computer that holds the active Laika
workspace. Anyone who obtains both a backup and its master password can access
the encrypted secrets in it.

## Restore a backup

1. Open **Settings** and select **Restore…**.
2. Confirm the replacement and choose a `.laika-backup` file.
3. Quit and reopen Laika after the validation succeeds.

Laika checks the archive format, allowed contents, file sizes, SHA-256 checksums,
SQLite integrity, and schema compatibility before staging a restore. It does not
replace open database or vault files. The staged files are applied before local
storage opens on the next launch.

The workspace that was active immediately before the restore is retained in the
app data directory as `restore-recovery`. If the restored database cannot open,
Laika automatically puts that recovery copy back. Restoring a different backup
later replaces the retained recovery set.

If the backup contains a secret vault, unlock it with the same master password
used when that vault was created. Restoring a backup without a vault removes the
active vault together with the workspace that referenced it; the previous vault
remains in the recovery set.

## Database upgrade recovery

Before applying a pending SQLite schema migration to an existing database,
Laika verifies database integrity and writes a consistent snapshot under the
app data directory's `recovery` folder. Its filename records the source and
target schema versions. A database already at the current schema does not create
another pre-migration snapshot.

These internal recovery files are not a substitute for user-created backups.
Create a `.laika-backup` before upgrading or moving the workspace to another
computer.

## Backup format compatibility

The versioned ZIP container is intentionally restricted to these root entries:

- `manifest.json`
- `laika.db`
- `laika.stronghold` and `laika.stronghold.salt`, either both present or both absent

The manifest records the format version, Laika version, SQLite schema version,
creation time, file sizes, and SHA-256 checksums. Laika rejects unknown entries,
duplicate entries, incomplete vault pairs, oversized data, corrupt databases,
and backups whose schema is newer than the running app supports.
