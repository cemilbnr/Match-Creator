# Changelog

All notable changes to Match Creator are documented here.

Format is loosely based on [Keep a Changelog](https://keepachangelog.com/) and
the project follows semantic versioning once it hits 1.0. Pre-1.0 releases are
beta and may ship breaking changes between minor bumps.

## [0.3.1-beta] — 2026-04-24

### Added
- **Board Analyzer — mandatory calibration step.** Crop mode now opens into
  a `Calibrate` sub-mode where the user draws a single reference cell
  (amber, dashed). The edge length locks the grid pitch and every region
  analysis from that point on divides the bounding box arithmetically.
  Autocorrelation and its harmonic-detection heuristic are gone — no
  more "3×3 reads as 6×6" surprises.
- Board Analyzer zoom overlay — top-right floating control for −25/100/+25
  stepping between 0.25× and 4×. Workspace scrolls when the image
  overflows.
- Board Analyzer Save now composes multi-region layouts into one board:
  every rect's envelope becomes the canvas and cells outside the
  selections become structural `'gap'` cells automatically.
- Board Library cards show a small reference thumbnail in the bottom-right
  corner for boards saved from the Analyzer. A `from screenshot` pill
  next to the size tag flags the source. Thumbnail is a JPEG data URL
  generated on image load, stored with the Board.

### Changed
- Board Generator brush panel reorganized into `Brushes` /
  `Quick actions` / `Shortcuts` frames. `Clear canvas` moves off the
  right-side preferences panel and joins `Fill empty` under Quick
  actions.
- Board Analyzer left panel restructured into `Source` /
  `Onboarding` / `Shortcuts` frames. `Choose image…` and `Remove` leave
  the bottom toolbar and live in Source. Onboarding steps lose their
  descriptive sub-text (just titles). Shortcuts match the Generator's
  framed pattern.
- Board Analyzer PageHeader actions slimmed to just Save / Save as.
  `Analyzing`/`Saved` pills and the linked saved-board name move to a
  new thin status strip between the header and the body. Legend chips
  (`● calibration`, `● region`) appear there while crop mode is on.
- Bottom toolbar uses a named 2-step stepper (`① Calibrate | ② Regions`)
  and explicit primary buttons (`Continue` / `Finish`) instead of
  ambiguous ✓/× icons. × is now a secondary `Exit` button.
- Right panel brush in Analyzer normalized to the Generator's vertical
  `BrushRow` convention (swatch + label + optional hotkey).
- Board Library cards have a fixed height so small (3×3) and large
  (12×12) boards don't produce uneven rows.

## [0.3.0-beta] — 2026-04-23

### Added
- **Board Analyzer** — new sidebar tab that turns match-3 board screenshots
  into editable boards. Workflow: paste/drop/pick an image → toggle Crop
  mode → draw one or more rectangular selections around the board area
  (square-locked optional; 8 resize handles per selection, center trash
  gizmo, Ctrl+Z/Ctrl+Y) → exit crop mode → the grid dimensions and piece
  colors are inferred automatically → retouch any wrong cell with the
  brush on the right → save to the Library from the top right.
- Overlapping selections merge into a single analyzed region (union-find
  over bounding-box overlap) so split crops can still represent one
  logical board.
- Autocorrelation-based grid detection with harmonic suppression: the
  detector now averages correlation across every multiple of a candidate
  lag and prefers the smallest N whose score is within 85% of the best,
  which keeps boards like 3×3 from getting reported as 6×6 when tile
  highlights produce sub-tile periodicity.
- Hue-histogram piece classifier (red / blue / green / yellow) with
  saturation weighting and specular/shadow filtering. Low-confidence or
  background cells come back as empty.
- Save-as modal replaces the old `window.prompt` — shows the detected
  grid size + classified cell count, ESC cancels, click-outside cancels.
  After save, a clickable link in the page header opens the Library.
- **`'gap'` cell type** — a new structural board value distinct from an
  empty slot. Rendered with diagonal stripes across all panels (Board
  Generator, Library thumbnails, Sequencer, Board Analyzer brush). Gap
  cells never participate in matches, act as immovable barriers under
  gravity (columns split into segments bounded by gaps), and are skipped
  entirely when exporting a variant to Blender. The Generator's
  **G** hotkey paints gap; the Analyzer's brush has a new Gap swatch.

### Changed
- `Cell = PieceColor | 'gap' | null` and `Brush = PieceColor | 'eraser' |
  'gap'`. Saved boards from prior versions remain compatible (no boards
  held `'gap'` before).

### Fixed
- Analyzer Save / Save as buttons no longer require exiting Crop mode
  first. Tooltip messaging also clarified: "Draw a selection first" vs
  "Overlap selections to merge into one region to save".



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
