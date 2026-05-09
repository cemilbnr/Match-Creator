# Match Creator

[![Latest release](https://img.shields.io/github/v/release/cemilbnr/Match-Creator?include_prereleases&display_name=tag&label=release&color=10b981)](https://github.com/cemilbnr/Match-Creator/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/cemilbnr/Match-Creator/total?color=3b82f6&label=downloads)](https://github.com/cemilbnr/Match-Creator/releases)
[![License](https://img.shields.io/github/license/cemilbnr/Match-Creator?color=eab308&cacheSeconds=300)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0ea5e9?logo=windows&logoColor=white)](https://github.com/cemilbnr/Match-Creator/releases/latest)
[![Blender](https://img.shields.io/badge/Blender-4.2%2B-f97316?logo=blender&logoColor=white)](https://www.blender.org/download/)
[![Last commit](https://img.shields.io/github/last-commit/cemilbnr/Match-Creator?color=8b5cf6)](https://github.com/cemilbnr/Match-Creator/commits/main)

Hybrid Blender add-on + desktop app for designing match-3 boards and
scripting gameplay animations for marketing videos. Paint a board, record
a sequence of swaps and matches, then ship the whole variant into Blender
as an animated collection.

## Features

**Desktop app** (Tauri + React, Windows)

- **Board Generator** — paint boards by hand with a 4-color palette plus
  gap cells. Keyboard brushes, fill-empty, wipe-by-color, replace-color,
  shift-lock to protect filled cells. **4-sided `+/-` edge buttons** on
  the canvas grow or shrink the grid from any side (`Ctrl` flips `+` to
  `-`). **Marquee selection tool** (`V`) with floating drag-to-move,
  in-place rotate gizmo, copy / cut / paste / delete, and an Aseprite-
  style float-and-stamp commit flow. Layout state persists across panel
  switches and app restarts.
- **Board Analyzer** — drop a screenshot, crop the board area, let the
  analyzer infer the grid size and piece colors from the image. Retouch
  any misdetected cells, then save. Overlapping crops merge into one
  region; disjoint crops compose into a single board with gaps where
  nothing was selected.
- **Board Library** — thumbnail grid of every saved board. Search,
  duplicate, delete, or open straight in the Generator or Sequencer.
- **Gameplay Sequencer** — drag pieces on a selected board to record
  swap/match sequences. Per-match cards let you continue from any point,
  change the required match length, or toggle board previews. Fail swaps
  record red, successful matches record green. **Stop button** aborts
  an in-flight replay in a single frame. **Edit board mode** opens the
  full Generator toolset on the active variant — save changes back to
  the variant, overwrite the underlying board, or fork a brand new
  board. **Variant notes** sit behind a chevron on each variant card so
  shared collections stay self-documenting.
- **Blender bridge** — footer dot turns green when the Blender add-on is
  running. Send a variant with one click; the add-on builds or updates
  the `GP_MC` collection. **Sync matches with markers** (default ON)
  pins each match to scene timeline markers named `"1"`, `"2"`, `"3"`…
  Variant `layoutOverride`s travel with the export, so per-variant
  colour/gap edits reach Blender as the new skeleton.
- **Auto-updater** — the app checks GitHub Releases on launch and from
  Settings → Updates. Signed MSI installs run automatically.

**Blender add-on** (Python, Blender 4.2+)

- HTTP server on `localhost:17654`, CORS-locked to the desktop app.
- `View3D` header button launches the desktop app with a session handoff
  describing the active `.blend`.
- `/api/gameplay` builds or updates a variant inside a `GP_MC` parent
  collection with per-piece animation (location, scale, Y-dip) and
  tileback pulses.
- `/api/markers` returns the active scene's timeline markers
  (`{ name, frame }[]`) sorted by frame. The desktop app uses this
  endpoint to align match swaps with markers named `"1"`, `"2"`,
  `"3"`… so beat-locked sequences stay perfectly synced to the scene.
- Optional custom `MC_Assets.blend` — point the add-on at your own
  `MC_Tile` / `MC_Tileback` meshes and `MC_Material_<Color>` materials
  to override the procedural defaults. See [docs/ASSET_SPEC.md](docs/ASSET_SPEC.md).

## Installing

### End users (Windows)

1. Grab the latest signed MSI from
   [Releases](https://github.com/cemilbnr/Match-Creator/releases/latest).
2. Run the MSI. No command line setup, no extra dependencies.
3. Launch *Match Creator* from the Start menu. Subsequent updates arrive
   automatically — you'll see a banner at the top of the app when one is
   ready.

### Blender add-on

1. Grab `match-creator-addon-<version>-beta.zip` from the latest
   [Release](https://github.com/cemilbnr/Match-Creator/releases/latest)
   (or zip the `match_creator_addon/` folder yourself).
2. In Blender: **Preferences → Add-ons → Install** → pick the zip →
   enable *Match Creator Bridge*.
3. Open the 3D viewport's N-panel → **Match-3** tab → **Start Server**.
4. Back in the desktop app the sidebar footer turns green and shows the
   active `.blend` filename.

## Quick reference

### Board Generator

| Shortcut | Action |
|---|---|
| `B` / `V` | Brush tool / Select (marquee) tool |
| `Q` `W` `E` `R` | Red / Blue / Green / Yellow brush |
| `G` | Gap brush (structural hole) |
| `Ctrl+F` | Fill every empty cell with the active brush |
| `Shift` + drag | Paint empties only — locks cells that already have a piece |
| Right-click | Erase a cell |
| `Ctrl` + right-click | Wipe every cell of the clicked color |
| `Alt` + right-click | Repaint every cell of that color with the active brush |
| Hover canvas edge | `+` button adds a row/col on that side. `Ctrl` flips it to `-` |
| `Ctrl+C` / `X` / `V` | Copy / cut / paste the marquee selection |
| `R` | Rotate the float (or selection in place) 90° CW |
| Drag inside selection | Lift the cells into a floating layer; release to stamp |
| `Enter` / `Esc` | Drop or cancel a floating selection |
| `Del` | Clear cells under selection (drops a float without stamping) |

### Board Analyzer

| Shortcut | Action |
|---|---|
| `Ctrl+V` | Paste a screenshot from the clipboard |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo selection edits |
| `Ctrl+S` | Save (in-place if already saved, else opens the Save-as modal) |
| `Esc` | Cancel the in-progress crop draft |

Workflow: paste or drag a screenshot → toggle **Crop mode** → draw one
or more rectangles around the board → exit crop mode → review the
inferred grid on the image → retouch misdetected cells with the brush
on the right → save.

### Gameplay Sequencer

Drag a piece over one of its four neighbors to record a swap. Matches
apply automatically; the app walks the cascade one match at a time and
adds a card to the bottom strip for each step. Use the right rail to
pick between recorded variants. Send the active variant to Blender from
the footer.

| Shortcut | Action |
|---|---|
| `Space` | Play / Stop the active variant's replay |
| `Esc` | Stop a running replay (or close edit mode if the marquee is empty) |
| `Ctrl+Enter` | (Edit board mode) Save changes to the active variant |

**Sync matches with markers** lives behind the gear icon. Default ON;
toggle off if you want every variant to play back-to-back without
respecting the timeline markers in Blender. When sending, the app
matches each numeric marker (`"1"`, `"2"`, `"3"`…) to the corresponding
match. If the variant has more matches than markers, you'll get a
confirm dialog before the export proceeds.

**Edit board** opens the active variant in an inline editor with the
full Board Generator toolset. Three commit options:

- `Save to variant` — only the current variant gets the layout change
  (`Ctrl+Enter`).
- `Save` — overwrites the underlying board in the library; other
  variants of the same board pick up the change automatically unless
  they have their own `layoutOverride`.
- `Save as new board…` — creates a fresh board in the library; the
  current variant stays linked to the original board until you switch.

`Cancel` (or `Esc` with an empty marquee) discards all changes.

## Development

Requirements: Node 20+, Rust (stable via rustup), Visual Studio Build
Tools with the C++ workload (Tauri's Windows linker), Blender 4.2+ for
the add-on side.

```powershell
# Run the desktop app with hot reload (Vite + Tauri)
cd web-app
npm install      # first time only
npm run tauri:dev

# Build a signed MSI installer
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\match-creator\match-creator"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "match-creator-beta"
npm run tauri:build
```

Output lives under `web-app/src-tauri/target/release/bundle/msi/`.

## Project layout

```
MATCH_CREATOR/
├── web-app/            Tauri desktop app (React + Vite + TypeScript)
│   ├── src/            UI + stores + features
│   └── src-tauri/      Rust shell, Tauri config, updater keys
├── match_creator_addon/  Python add-on loaded by Blender (folder name is the
│                         Python module — keep the underscore for the addon
│                         loader to find it)
├── assets/             Tile PNGs served to the web app
├── docs/               Architecture, asset spec, release flow
├── releases/           Per-version build artifacts (ignored by Git)
├── CHANGELOG.md        Release history
└── LICENSE             MIT
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, data
  flow, schema versioning.
- [docs/ASSET_SPEC.md](docs/ASSET_SPEC.md) — custom `MC_Assets.blend`
  convention for bringing your own tile art and materials.

## Reporting issues

Bug reports and feature requests go to
[GitHub Issues](https://github.com/cemilbnr/Match-Creator/issues).
Please include the app version (visible in Settings → Updates) and,
for Analyzer issues, the source screenshot when possible.

## License

[MIT](LICENSE) © Cemil BENER.
