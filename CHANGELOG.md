# Changelog

All notable changes to Match Creator are documented here.

Format is loosely based on [Keep a Changelog](https://keepachangelog.com/) and
the project follows semantic versioning once it hits 1.0. Pre-1.0 releases are
beta and may ship breaking changes between minor bumps.

## [0.3.5-beta] — 2026-05-09

New **Gameplay Generator** sidebar panel (marked WIP) for designing
match-3 sequences from drawn paths instead of recording every swap by
hand in the Sequencer. Algorithm and UI are still iterating; banner at
the top of the panel makes the WIP status explicit.

### Added
- **Gameplay Generator panel.** Draw freehand paths over an empty
  board, configure shape weights (3-line, 4-line, 2x2, 3x2, 4x2),
  thickness, color count, and seeds, then generate a deterministic
  match sequence + filled board ready to send to the Sequencer.
  Preview replays match-by-match with ←/→ keys; Send-to-Sequencer
  saves the result as a new Board + GameplayVariant in the library.
- **Secondary-match planning.** Each primary placement can attach a
  secondary near-match around its swap-source cell, so a single swap
  fires two simultaneous matches. Slider in the right rail; planned
  secondary cells render with `N-S` badges live during drawing.
- **Path-thickness, shape-mix, and per-channel seed controls** in the
  generator's right rail. Path seed drives placement geometry;
  generate seed drives board fill colors independently.
- **`match.ts` palette parameter.** `applyGravityAndSpawn`,
  `simulateCascade`, `initializeGrid`, and `randomPiece` now accept
  an optional `colors` palette so the generator can run cascades with
  a reduced color count (2/3/4) without affecting Sequencer behaviour
  (default remains the full 4-color palette).

### Algorithm
- **Cursor-walk placement is prefix-stable.** Path is processed cell
  by cell in draw order with a deterministic RNG stream, so extending
  a path while drawing only appends new placements — already-drawn
  matches don't shift around as the user keeps moving the pointer.
- **Board fill validates per-swap.** Each candidate fill colour is
  rejected if the test cell would join an unintended match in any of
  the planned swaps, on top of the existing static no-match check.
  Stops free-fill cells from secretly extending a planned 3-line into
  a 4-line or co-firing with an adjacent placement.

### Known limitations
- Generator is WIP; dense boards or high secondary-match probability
  can still produce a few warnings or skipped placements (palette /
  edge constraints). Surface lives behind a yellow banner at the top
  of the panel until the algorithm stabilises.

## [0.3.4-beta] — 2026-05-09

UI / window-narrow polish, zoom + pan fixes for Generator and Analyzer,
sequencer first-match grid clobber fix, and the addon folder rename
made canonical.

### Added
- README badges (release / downloads / license / platform / Blender /
  last-commit) via shields.io.

### Fixed
- **Sequencer: first match clobbered the dissolved tiles.** Auto-creating
  a variant on the user's first swap was triggering GameplaySequencer's
  board-reload effect, which immediately reset the just-animated post-
  match grid back to the original board layout — matched tiles flashed
  gone and came back. The store now bumps a `silentVariantStamp` when the
  auto-create flow sets `activeVariantId`, and the panel's effect
  recognises that and skips the reload. Manual variant switches still
  trigger the reload as expected.
- **Board Generator: zoom + pan.** Canvas viewport switched from
  `flex-center + overflow-auto` (which clipped the left/top side of an
  overflowing canvas) to a `min-w-full min-h-full` centring pattern.
  Both axes pan cleanly when the canvas is bigger than the viewport.
  Max zoom bumped 64 → 128 px per cell; step 6 → 8 so each click moves a
  noticeable amount at the larger end of the range.
- **Board Analyzer: zoom + pan.** CSS `zoom` replaces `transform:
  scale` so the scaled image participates in layout — the workspace's
  overflow finally tracks the zoomed dimensions and pan/scroll work at
  any zoom level. (Tauri's WebView2 supports CSS `zoom`; Firefox does
  not, but the desktop app doesn't ship to Firefox.)
- **PageHeader narrow-window subtitle wrap.** Previously a busy actions
  row would squeeze the subtitle into a single-word vertical column.
  Subtitle now truncates with an ellipsis (tooltip carries the full
  text). Actions row gets `flex-wrap` so it can break onto multiple
  lines instead of starving the title column.

### Changed
- **Board Analyzer zoom widget** moved from a floating overlay on the
  workspace canvas into the page header, matching the BoardGenerator
  affordance. Same `IconButton + percentage readout + IconButton` layout;
  clicking the readout still resets to 100%.
- **Addon folder rename: `blender-addon` → `match_creator_addon`** is now
  the canonical layout (the v0.3.3 hotfix shipped this in-place; v0.3.4
  formalises it). `bl_info` is a pure literal dict and
  `ADDON_VERSION_TUPLE` reads from `bl_info["version"]` — keeps the
  scanner happy AND the runtime single-source.

## [0.3.3-beta] — 2026-05-09

Blender side animation correctness pass plus a brand-new addon
auto-updater so the addon now versions and ships in lockstep with the
desktop app. Same recorded variants now play back as: dragged piece
visibly arcs above the partner along the −Y front-camera axis, both
pieces start AND finish travel on exactly the same frame, and the
addon can pull its own updates without manual zip dragging.

### Added
- **Blender addon auto-updater.** New `Updates` section in addon
  preferences with `Check for updates` / `Install update` /
  `Open releases page` actions. Mirrors the desktop app's Tauri
  updater flow — the addon polls
  `https://github.com/cemilbnr/Match-Creator/releases/latest/download/addon-latest.json`,
  compares `version_tuple` to the installed `ADDON_VERSION_TUPLE`, and
  on confirmation downloads the bundled zip and extracts it over the
  current install (Blender restart still required because Python
  doesn't reliably reload registered classes / properties).
- **Single source of truth for versioning.** `ADDON_VERSION_TUPLE` and
  `ADDON_VERSION_STRING` constants in `match_creator_addon/__init__.py` track
  the desktop app's version one-to-one. v0.3.3-beta is the first joint
  release; future releases bump both together.
- **Addon preference: `Swap dip (Y)`.** New FloatProperty in the
  Animation group (default `-0.14`, range −1.0 … +1.0) controls the
  Y-axis offset applied to the dragged tile at the peak of a swap. The
  export sends a non-zero `dip` flag for swap keyframes; the addon
  substitutes the user's preference value at write time so the arc
  depth (and direction) is tunable from Blender preferences without
  touching the desktop app. Set to `0` for a flat swap.
- **Bundled `MC_Assets.blend`** ships inside the addon at
  `match_creator_addon/assets/MC_Assets.blend` (carried over from 0.3.2's
  trailing updates). Fresh installs use it automatically; the
  preferences panel exposes a `Use custom asset set` toggle that gates
  the existing `Custom asset .blend` path field. `effective_asset_blend()`
  resolves the priority chain (custom-when-toggled-and-valid →
  bundled → empty for procedural fallback).

### Fixed
- **Swap timing was asymmetric.** The export wrote 4 keyframes for the
  FROM piece (frames 0, 1, 4, 5) and 2 for the TO piece (0, 5),
  freezing FROM at its origin and destination for one frame each. With
  bezier interpolation that meant FROM only moved during frames 1–4
  while TO moved across all 5 — TO appeared to start moving FIRST,
  reading as "the wrong tile got picked up". Both pieces now travel in
  lock-step over the full FRAMES_SWAP window. Intermediate FROM
  keyframes that carry the dip use lerped (row, col) positions so X/Z
  motion stays uniform.
- **Dragged piece rendered behind partner.** Y-dip is `-0.14` in the
  export (negative Y), which in Blender's standard front-view setup
  (camera on the −Y side looking toward +Y) sits CLOSER to the camera.
  The dragged tile now visibly arcs above its partner during the
  cross. The addon forwards the value straight through so the schema
  doubles as the literal Y offset.
- Invalid-swap bounce-back now uses the same symmetric 4-key lerp
  pattern on the way home, so a fail swap mirrors a successful one
  exactly except for the final position.
- **Addon load on Blender 5.0** (`AttributeError: 'Action' object has
  no attribute 'fcurves'`). The fcurves graph traversal helper was
  replaced with a `_LinearKeyframeContext` context manager that flips
  `bpy.context.preferences.edit.keyframe_new_interpolation_type` to
  `LINEAR` for the duration of the build and restores it afterward.
  Works on legacy actions (≤ 4.3) and slotted actions (4.4+ / 5.0)
  without touching the action graph.

### Changed
- **Addon: LINEAR keyframe interpolation across the board.** Tile
  location/scale and tileback scale fcurves are now LINEAR for every
  build (via the new context manager). Match-3 swaps and falls are
  intentionally on rails — the default Bezier interpolation distorted
  the lock-step timing the export carefully sets up. This is also a
  prerequisite for the new intermediate-position keyframes to land on
  the correct linear track.

## [0.3.2-beta] — 2026-05-07

Sequencer / Generator quality-of-life pass plus a Blender-side timeline
integration. No breaking changes to saved data; existing variants keep
working unchanged.

### Added
- **Sequencer · Stop button.** The Play control flips to a red Stop while
  a replay is running. Press it (or `Esc` / `Space`) to abort mid-sequence
  — the board snaps back to the variant's starting layout instead of
  having to wait the full duration.
- **Sequencer · Sync matches with markers.** New toggle in the gear menu
  (default ON). On Send / Update, the desktop app pulls the active
  scene's timeline markers from Blender via the new `GET /api/markers`
  endpoint, pairs markers named `"1"`, `"2"`, `"3"`… with each match in
  order, and pads the export so swap N starts on marker N. When the
  variant has more matches than numeric markers, a confirm dialog flags
  it before sending. Markers earlier than the natural cumulative frame
  are ignored — we never travel backwards in time.
- **Sequencer · Edit board mode.** New `Edit board` button in the
  sequencer header opens an in-place editor for the active variant. The
  full BoardGenerator toolset (paint, edge `+/-`, marquee, clipboard,
  rotate gizmo) is available; commit options are `✗ Cancel`,
  `Save ▼` (`Save` overwrites the underlying board, `Save as new…`
  forks a fresh board), and `✓ Save to variant`. `Ctrl+Enter` saves to
  variant, `Esc` cancels. `GameplayVariant.layoutOverride` stores the
  per-variant layout; the sequencer prefers it over `board.layout` when
  loading.
- **Sequencer · Variant comments dropdown.** Each variant card now has a
  chevron handle that expands a textarea for free-form notes (status,
  intent, palette rationale). A subtle blue dot tags variants that have
  notes. Stored on `GameplayVariant.comment` (persisted to localStorage).
- **Board Generator · 4-sided edge buttons.** Hovering the canvas
  reveals `+` bands on every side. Click adds a row/col on that edge;
  hold `Ctrl` to flip the icons to `−` and remove from that edge. Press-
  and-hold accelerates for fast resizing.
- **Board Generator · Marquee selection tool.** New `Select` tool
  (`V` hotkey, `B` switches back to brush). Drag to define a region.
  Floating toolbar above the marquee exposes Copy / Cut / Paste / Drop
  / Delete. Click+drag *inside* an existing selection lifts the cells
  into a floating layer that follows the cursor (Aseprite/Photoshop
  semantics) — release to stamp, `Esc` to cancel and restore. Arrow keys
  nudge the float by one cell. A circular **rotate gizmo** anchors above
  the selection's top-right corner; click rotates the float (or the
  selection in place when nothing's floating) 90° clockwise. `R` does
  the same from the keyboard. `Ctrl+C/X/V` for clipboard ops, `Del` to
  clear, `Enter` to drop a float.
- **Board Generator · State persistence.** The in-progress board
  (layout, name, dimensions, zoom) now lives in a Zustand store with
  the `persist` middleware. Switching panels or restarting the app no
  longer wipes an unsaved draft.
- **Sequencer · Variant board override propagation.** The Blender export
  now sends the variant's `layoutOverride` (when set) instead of the
  underlying `board.layout`, so colour/gap edits saved on a variant
  travel to Blender as the new structural skeleton.
- **Blender add-on · `GET /api/markers`.** Returns
  `{ ok, markers: [{ name, frame }], fps, frameStart, frameEnd }` for
  the active scene's timeline markers, sorted by frame. Used by the
  desktop app's marker-sync flow; safe to call from any consumer.

### Changed
- **Generator brush panel · Tool & Shortcuts.** Brush / Select tools
  surface as a top-row segmented control. Shortcuts list is condensed
  and each entry now sits in its own subtle pill so the section scans
  as a stack of cards rather than a wall of text. Removed the
  rotate-clipboard toolbar button — rotation is now the marquee's
  on-canvas gizmo.
- **`SaveSplitButton`** extracted to a shared component
  (`src/components/SaveSplitButton.tsx`); both BoardGenerator and the
  new VariantEditor consume it. Added `tone="secondary"` for the
  variant editor's quieter "Save to library" button.
- Sequencer's effective layout (board view + match thumbnails) now uses
  the variant's `layoutOverride` dimensions when present so an edit
  that changes the grid size renders correctly without restart.

### Fixed
- Replay cleanup on abort: `replayAborted` flag short-circuits the
  RAF-driven `waitFrames` so animations stop within a frame instead of
  riding out the remaining segments before exiting.
- Marquee paste: `null` cells in the clipboard are treated as
  transparent, so pasting an irregular shape doesn't punch holes
  through the destination.

## [0.3.1-beta] — 2026-04-24

Analyzer correctness, Library upgrade, and a full UI polish pass. No
breaking changes to saved data.

### Added
- **Board Analyzer — mandatory calibration step.** Crop mode now opens
  into a `Calibrate` sub-mode where the user draws a single reference
  cell (amber, dashed). The edge length locks the grid pitch and every
  region analysis from that point on divides the bounding box
  arithmetically. Autocorrelation and its harmonic-detection heuristic
  are gone — no more "3×3 reads as 6×6" surprises.
- **Multi-region compose save.** Save now merges every selection into
  one board: the envelope bbox of all rects becomes the canvas; cells
  inside any region inherit that region's classified color; cells
  outside every region become structural `'gap'` cells automatically.
- **Zoom overlay** on the Analyzer workspace — top-right floating
  control for −25 / 100% / +25 stepping between 0.25× and 4×. Workspace
  scrolls when the image overflows.
- **Board Library reference thumbnails** — boards saved from the
  Analyzer now carry a small screenshot reference. Cards show it in
  the bottom-right corner alongside the reconstructed layout; a
  `from screenshot` pill tags the source in the header. Stored as a
  JPEG data URL on `Board.sourceImage`, generated once when the image
  loads.
- `Ctrl+S` keyboard shortcut — in-place update when a session board
  exists, otherwise opens the Save-as modal.
- Shared `Kbd` primitive with a tactile inset shadow, used across
  Generator, Analyzer, and anywhere keycaps appear.

### Changed
- **Generator brush panel** reorganized into `Brushes` / `Quick
  actions` / `Shortcuts` frames. `Clear canvas` moves off the right-
  side Board Preferences panel and joins `Fill empty` under Quick
  actions.
- **Analyzer left panel** restructured into `Source` / `Onboarding` /
  `Shortcuts` frames. `Choose image…` and `Remove` leave the bottom
  toolbar and live in Source. Onboarding steps lose their descriptive
  sub-text (just titles). Shortcuts match the Generator's framed
  pattern and lay out vertically so multi-key combos stay readable.
- **Analyzer PageHeader** slims to just Save / Save as. `Analyzing` /
  `Saved` pills and the linked saved-board name move to a new thin
  status strip between the header and the body. Legend chips
  (`● calibration`, `● region`) appear there while crop mode is on.
- **Bottom toolbar** rebuilt: named crop group with a 2-step stepper
  (`① Calibrate | ② Regions`, disabled step 2 until calibrated),
  explicit primary buttons (`Continue` / `Finish`) instead of ambiguous
  ✓/× icons, secondary `Exit` label. Sub-mode stepper uses iPadOS-style
  segmented-control visuals with a raised active state.
- **Design language pass** — all sidebar `Section`s now use a new
  `framed` variant (hairline border, subtle tint, 10px radius) for
  clean visual grouping. Active brush rows get a 2px emerald accent
  bar on the left edge instead of a filled pill. Library cards lift
  one pixel on hover. Font sizes and palette deliberately unchanged —
  the polish is structural, not typographic.
- Board Library cards have a fixed 320px height so small (3×3) and
  large (12×12) boards don't produce uneven rows.
- Analyzer retouch brush normalized to the Generator's row
  convention (swatch + label + optional hotkey).

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
- Versioning rule during beta: patch bumps per release, minor bumps only
  for major feature milestones (`0.2.9` → `0.3.0`, never skipping
  patches).

## [0.2.0-beta] — 2026-04-23

### Added
- `tauri-plugin-updater` integrated. The app polls
  `https://github.com/cemilbnr/Match-Creator/releases/latest/download/latest.json`
  on startup; users can also trigger a check from Settings → Updates.
- Top-of-app update banner with progress bar for the download phase,
  install spinner, and a dismissible error row.
- Settings → Updates section showing the installed version and a manual
  "Check for updates" button.
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
