# Releasing a new Match Creator version

Match Creator ships updates via the Tauri updater plugin. Installed apps ping
`https://github.com/cemilbnr/Match-Creator/releases/latest/download/latest.json`
on startup and whenever the user clicks **Check for updates** in Settings. When
a newer signed build is found the app downloads it and runs the MSI
installer, then restarts.

This doc walks through cutting a new release end-to-end.

---

## 0. One-time setup

You only need to do this once per dev machine.

### 0.1 Private signing key

The first release generated a key pair at
`%USERPROFILE%\.tauri\match-creator\`:

- `match-creator` — private key (**never commit / share / lose**)
- `match-creator.pub` — public key (already embedded in
  `web-app/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`)

The private key is password-protected with `match-creator-beta`. If you
rotate this password, the new build script must know it via
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Losing the private key means you can no longer sign updates. Installed apps
will refuse any release signed by a different key — users would have to
reinstall manually from a fresh MSI.

### 0.2 Environment variables

Every release build must have:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\match-creator\match-creator"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "match-creator-beta"
```

Keep these in your PowerShell profile or a local `.env` (never committed).

---

## 1. Cut the release

### 1.1 Bump the version

Keep the three version strings in sync:

- `web-app/package.json` → `"version"`
- `web-app/src-tauri/tauri.conf.json` → `"version"`
- `web-app/src-tauri/Cargo.toml` → `[package] version`

Follow semver: `MAJOR.MINOR.PATCH`. Add `-beta` suffix while we're pre-1.0.

### 1.2 Update the changelog

Prepend a new section to `CHANGELOG.md`:

```md
## [0.3.0-beta] — 2026-05-15

### Added
- …

### Changed
- …

### Fixed
- …
```

Commit both: `git commit -am "Release v0.3.0-beta"`.

### 1.3 Build the signed MSI

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE\.tauri\match-creator\match-creator"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "match-creator-beta"

cd web-app
npm run tauri:build
```

Output lives under `web-app/src-tauri/target/release/bundle/`:

- `msi\Match Creator_<VERSION>_x64_en-US.msi` — the installer itself
- `msi\Match Creator_<VERSION>_x64_en-US.msi.sig` — detached signature
  (required by the updater)

### 1.4 Build `latest.json`

The updater needs a manifest alongside the MSI. Template:

```json
{
  "version": "0.3.0-beta",
  "notes": "See CHANGELOG.md for the full entry.",
  "pub_date": "2026-05-15T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<CONTENTS OF .msi.sig, trimmed>",
      "url": "https://github.com/cemilbnr/Match-Creator/releases/download/v0.3.0-beta/Match.Creator_0.3.0-beta_x64_en-US.msi"
    }
  }
}
```

Fields:

- `version` — semver string, must exactly match the MSI version.
- `notes` — short human string shown in the in-app update banner.
- `pub_date` — ISO 8601 UTC timestamp.
- `signature` — paste the full content of the `.msi.sig` file (a
  single-line base64 string).
- `url` — the Release asset URL. GitHub builds this as
  `https://github.com/cemilbnr/Match-Creator/releases/download/<TAG>/<ASSET_NAME>`.
  Replace spaces with dots or URL-encode them.

Save as `latest.json` next to the MSI.

### 1.5 Tag + push

```powershell
git tag v0.3.0-beta
git push origin main
git push origin v0.3.0-beta
```

### 1.6 Create the GitHub Release

With the `gh` CLI (optional but cleaner):

```powershell
gh release create v0.3.0-beta `
  "Match Creator_0.3.0-beta_x64_en-US.msi" `
  "Match Creator_0.3.0-beta_x64_en-US.msi.sig" `
  latest.json `
  --title "Match Creator v0.3.0-beta" `
  --notes-file CHANGELOG.md
```

Or through the web UI:

1. https://github.com/cemilbnr/Match-Creator/releases/new
2. Pick the tag `v0.3.0-beta`.
3. Title: `Match Creator v0.3.0-beta`.
4. Attach the three files: MSI, `.msi.sig`, `latest.json`.
5. Paste the release notes.
6. Click **Publish release**.

GitHub's "latest" redirect now points at this release, so existing installed
apps resolve
`https://github.com/cemilbnr/Match-Creator/releases/latest/download/latest.json`
and find the new manifest.

---

## 2. Smoke-test the update

On any machine already running an older version:

1. Open Match Creator.
2. Go to **Settings** → **Updates** → **Check for updates** (or wait for the
   startup check to surface the banner).
3. Click **Install & restart** on the banner.
4. App downloads the signed MSI, runs it, then relaunches.
5. Settings should now show the new version.

If you see a **signature mismatch** error, the `.msi.sig` in the release
doesn't match the MSI it claims to sign. Rebuild with the correct env vars.

---

## 3. Rollback

If a release breaks the world:

1. Delete the release (GitHub → Releases → pick → **Delete**).
2. Delete the tag: `git push --delete origin v0.3.0-beta`.
3. Promote the previous release by editing it on GitHub and clicking
   **Set as the latest release**.

Users who already auto-installed the bad build stay on the bad build until
the next release — which is why you'd cut a `v0.3.1-beta` quickly rather
than trying to un-release.

---

## 4. Future automation

This manual flow is fine for a solo beta. Once the cadence picks up,
`tauri-action` (`tauri-apps/tauri-action` GitHub Action) can build, sign,
and upload on every tag push automatically. Private key goes in repo
Secrets as `TAURI_PRIVATE_KEY` + `TAURI_KEY_PASSWORD`. Not wired up yet —
open a task when you're ready.
