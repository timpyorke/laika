# Signing and Release Process

How Laika's Windows installers get code-signed and published, and the
one-time setup a maintainer needs to complete before the first signed
release. This is maintainer-facing; end users don't need it.

## Decisions (Phase 7G)

- **Signing provider:** [SignPath.io](https://signpath.io)'s free tier for
  open-source projects.
- **Release host:** GitHub Releases on this repository.
- **Updater:** none yet. The first releases ship signed installers only; an
  in-app updater is deferred until this signed pipeline has been validated
  end to end. Until then, "upgrading" means installing a newer signed build
  over an older one — see [known-limitations.md](known-limitations.md).
- **Channels:** stable only. No prerelease/beta channel yet.

## ⚠️ Unverified against a live SignPath project

This workflow (`.github/workflows/release.yml`) was written against
SignPath's documented GitHub Actions integration but has not yet been run
against a real SignPath organization — that requires an approved SignPath
account, which only a maintainer can obtain. Before trusting the first real
run, re-check against SignPath's current documentation:

- The exact input names for `signpath/github-action-submit-signing-request`
  (`api-token`, `organization-id`, `project-slug`, `signing-policy-slug`,
  `artifact-configuration-slug`, `github-artifact-id`,
  `output-artifact-directory`) — SignPath may have renamed or added inputs
  since this was written.
- Whether one Artifact Configuration signing every `.exe`/`.msi` inside the
  uploaded build artifact (the current design) matches how your SignPath
  project is set up, or whether you need one configuration per file.
- The action version pin (`@v1`) is still current.

Treat the first tagged push as the point this gets debugged for real, the
same way [smoke-test.md](smoke-test.md) is written but not yet run on a
clean VM.

## One-time SignPath setup

1. Apply for [SignPath's open-source program](https://signpath.io/oss) with
   this repository. Approval is required before you can sign anything.
2. Once approved, create (or use the org SignPath provisions for you):
   - An **Organization**.
   - A **Project** for Laika.
   - A **Signing Policy** for release builds (SignPath's own docs call this
     `release-signing` by convention — name it however your project uses).
   - An **Artifact Configuration** that matches the files produced by
     `pnpm tauri build --bundles nsis,msi` — `laika.exe`, the NSIS installer
     `.exe`, and the MSI installer — so SignPath knows which files inside
     the uploaded artifact to Authenticode-sign.
3. Generate a SignPath CI user API token scoped to that project.

## One-time GitHub setup

1. In this repository's **Settings → Environments**, create an environment
   named `release`.
2. Add **required reviewers** protection to it (at minimum, yourself) so a
   signing request can never run without an explicit approval click, even
   though the workflow already only triggers on a `v*` tag push.
3. On the `release` environment, add:
   - Secret `SIGNPATH_API_TOKEN` — the CI user token from SignPath.
   - Variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
     `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` —
     the identifiers from the SignPath project you created above.

None of the above can be done for you by an assistant — it needs your own
SignPath account and this repository's admin settings.

## Cutting a release

1. Confirm `main` is at the commit you want to release and all quality
   gates pass — see the [release checklist](release-checklist.md).
2. Bump the version and commit it:
   ```bash
   pnpm version:set 0.2.0
   cargo check --manifest-path src-tauri/Cargo.toml
   pnpm version:check
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "chore: release v0.2.0"
   git push
   ```
3. Tag and push the tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. Pushing the tag triggers `.github/workflows/release.yml`:
   - `check-tag` confirms the tag matches `package.json`'s version.
   - `build` runs the same quality gates and unsigned build as CI (via the
     shared `build-windows.yml` reusable workflow).
   - `sign-and-publish` (gated by the `release` environment's required
     reviewer) submits the unsigned artifact to SignPath, waits for the
     signed result, computes `SHA256SUMS.txt`, and creates a **draft**
     GitHub Release with the signed installers attached.
5. Approve the `release` environment deployment when GitHub prompts for it.
6. Once the workflow finishes, open the draft release on GitHub:
   - Download the signed installers and verify their checksums locally
     against `SHA256SUMS.txt` (`certutil -hashfile <file> SHA256` on
     Windows, or `sha256sum -c SHA256SUMS.txt`).
   - Verify the Authenticode signature is present (right-click the `.exe` →
     Properties → Digital Signatures, or `signtool verify /pa <file>`).
   - Run the relevant sections of [smoke-test.md](smoke-test.md) against
     these signed artifacts.
   - Edit the auto-generated release notes if needed.
7. Publish the draft. It is now the canonical download for that version.

## Rollback

There is no updater to roll back. If a published release turns out to be
broken:

1. Do not delete the tag or release — other people may already be relying
   on it. Instead, publish a new patch release with the fix.
2. If the release is actively harmful (e.g. corrupts workspaces), edit the
   GitHub Release to mark it clearly and link to the fixed version, and
   consider unpublishing (converting back to draft) if it hasn't been
   downloaded much yet.
3. Users who already installed the broken version follow
   [known-limitations.md](known-limitations.md#if-an-upgrade-breaks-your-workspace):
   restore their own `.laika-backup`, or reinstall the previous version's
   artifact.
