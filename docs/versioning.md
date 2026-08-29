# Versioning and Release Identity

Laika uses Semantic Versioning for application releases. The same version must
appear in `package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml`. CI rejects a change when these values differ.

## Stable identity

- Product name: `Laika`
- Bundle identifier: `com.codenour.laika`
- Publisher: `Thongphitak Sowanna`
- Repository: `https://github.com/timpyorke/laika`

The bundle identifier must not change after public distribution. Windows and
Tauri use it to identify the installed application and its local application
data directory.

## Version policy

- Patch (`0.1.1`): compatible bug fixes and security fixes.
- Minor (`0.2.0`): compatible features or meaningful workflow changes.
- Major (`1.0.0`): incompatible data, contract, or product changes.
- Prerelease (`0.2.0-beta.1`): artifacts intended for a non-stable channel.

Release tags use the matching `v<version>` form, for example `v0.2.0`.

## Bumping a version

From the repository root:

```bash
pnpm version:set 0.2.0
cargo check --manifest-path src-tauri/Cargo.toml
pnpm version:check
```

Commit the updated manifests and `src-tauri/Cargo.lock` together. Do not reuse a
published version number for different binaries.

## Build provenance

The CI workflow builds an unsigned Windows executable, NSIS installer, and MSI
installer for every pull request and push to `main`. The artifact name includes
the source commit SHA and is retained for 14 days. These artifacts are for
validation until code signing and release publishing are implemented later in
Phase 7.
