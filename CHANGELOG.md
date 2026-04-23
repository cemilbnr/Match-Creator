# Changelog

All notable changes to Match Creator are documented here.

Format is loosely based on [Keep a Changelog](https://keepachangelog.com/) and
the project follows semantic versioning once it hits 1.0. Pre-1.0 releases are
beta and may ship breaking changes between minor bumps.

## [0.2.1-beta] — 2026-04-23

### Fixed
- `Check for updates` no longer surfaces a scary "Update failed" banner when
  GitHub returns 404 (i.e. no release has been published yet). The UI now
  shows "You're on the latest version" for that benign case and only
  escalates to an error banner for actual HTTP / signature / transport
  failures.
- Startup update check now logs suppressed errors to devtools instead of
  swallowing them completely, so debugging connectivity issues is easier.

### Changed
- Versioning rule during beta documented in `docs/RELEASING.md`: patch
  bumps per release, minor bumps only for major feature milestones
  (`0.2.9` → `0.3.0`, never skipping patches).

## [0.2.0-beta] — 2026-04-23

### Added
- `tauri-plugin-updater` integrated. The app polls
  `https://github.com/cemilbnr/Match-Creator/releases/latest/download/latest.json`
  on startup; users can also trigger a check from Settings → Updates.
- Top-of-app update banner with progress bar for the download phase,
  install spinner, and a dismissible error row.
- Settings → Updates section showing the installed version and a manual
  "Check for updates" button.
- `docs/RELEASING.md` documents how to cut a signed release end-to-end
  (key setup, version bump, signed MSI, `latest.json`, GitHub Release).

### Changed
- Version bumped to `0.2.0` across `package.json`, `tauri.conf.json`, and
  `Cargo.toml`. First release built with the updater baked in.
- Vite inlines `package.json` version into the app via `define`, so the
  Settings panel and updater store stay in lockstep with the manifest.

### Security
- `.gitignore` now refuses `*.key`, the match-creator private key name, and
  `.env*` files. Public key is committed inside `tauri.conf.json`.

## [0.1.0-beta] — 2026-04-23

First public beta. End-to-end pipeline for designing match-3 boards, recording
gameplay variants, and shipping them into Blender as animated collections.

### Desktop app (Tauri + React)

- Tauri 2 desktop window with single-instance lock.
- Sidebar navigation: Board Generator, Board Library, Gameplay Sequencer,
  Settings. Collapsible, Blender connection dot in the footer.
- **Board Generator**: paint with 4 colours + eraser, keyboard brushes (QWER),
  zoom, save / save-as split button, Shift-lock (skip filled cells), Ctrl+F
  fill empty, Ctrl+right-click wipe-by-colour, Alt+right-click replace-colour.
- **Board Library**: thumbnail grid, tag-less search, `Open in generator` and
  `Open in sequencer` actions per card, duplicate/delete.
- **Gameplay Sequencer**: drag-to-swap auto-records matches, variants right
  rail, bottom match strip with continue-from-here / change-length / trash
  per card, optional board preview on each card. Fail swaps record as
  red-striped cards; success as green-striped.
- **Settings popup** (in Sequencer): match preview toggle, default match
  length, experimental cascade toggle (WIP).
- Blender connection footer shows the active `.blend` filename when
  connected, greys out when Blender is offline.

### Blender addon

- HTTP server on port 17654 (configurable), thread-safe main-thread marshalling.
- CORS restricted to `tauri.localhost`, `localhost:5173`, and related Tauri
  webview origins.
- `VIEW3D_HT_header` button `Match Creator` launches the desktop app with a
  session.json handoff describing the active `.blend`.
- `/api/health` returns Blender version + active blend filename.
- `/api/gameplay` builds or updates a variant inside a `GP_MC` parent
  collection. Supports `mode=create` (always a fresh `GP_<board>_<variant>`,
  numeric suffix on collision) and `mode=update` (reuse existing objects,
  keyframes and materials refresh in place).
- Tiles: per-piece location + scale + Y-dip animation, object-level material
  override so tiles sharing a mesh keep distinct colours.
- Tilebacks: one per grid cell, fixed position, scale pulses down to 0 on
  match (stays at 0 until cascade mode respawns — WIP).
- Optional custom asset loading: point preferences at an `MC_Assets.blend`
  with `MC_Tile` / `MC_Tileback` objects and `MC_Material_<Color>` materials,
  addon clones your meshes and materials instead of using procedurals. See
  `docs/ASSET_SPEC.md`.

### Tooling

- MSI installer via `npm run tauri:build`.
- `docs/ARCHITECTURE.md` describes the data flow and schema versioning.
- `docs/ASSET_SPEC.md` documents the custom asset file convention.
