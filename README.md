# Match Creator

Hybrid Blender add-on + desktop app for designing match-3 boards and
scripting gameplay animations for marketing videos. Paint a board, record
a sequence of swaps and matches, then ship the whole variant into Blender
as an animated collection.

## Features

**Desktop app** (Tauri + React, Windows)

- **Board Generator** — paint boards by hand with a 4-color palette plus
  gap cells. Keyboard brushes, fill-empty, wipe-by-color, replace-color,
  shift-lock to protect filled cells.
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
  record red, successful matches record green.
- **Blender bridge** — footer dot turns green when the Blender add-on is
  running. Send a variant with one click; the add-on builds or updates
  the `GP_MC` collection.
- **Auto-updater** — the app checks GitHub Releases on launch and from
  Settings → Updates. Signed MSI installs run automatically.

**Blender add-on** (Python, Blender 4.2+)

- HTTP server on `localhost:17654`, CORS-locked to the desktop app.
- `View3D` header button launches the desktop app with a session handoff
  describing the active `.blend`.
- `/api/gameplay` builds or updates a variant inside a `GP_MC` parent
  collection with per-piece animation (location, scale, Y-dip) and
  tileback pulses.
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

1. Zip the `blender-addon/` folder (or use `blender-addon.zip` at the
   repo root).
2. In Blender: **Preferences → Add-ons → Install** → pick the zip →
   enable *Match Creator Bridge*.
3. Open the 3D viewport's N-panel → **Match-3** tab → **Start Server**.
4. Back in the desktop app the sidebar footer turns green and shows the
   active `.blend` filename.

## Quick reference

### Board Generator

| Shortcut | Action |
|---|---|
| `Q` `W` `E` `R` | Red / Blue / Green / Yellow brush |
| `G` | Gap brush (structural hole) |
| `Ctrl+F` | Fill every empty cell with the active brush |
| `Shift` + drag | Paint empties only — locks cells that already have a piece |
| Right-click | Erase a cell |
| `Ctrl` + right-click | Wipe every cell of the clicked color |
| `Alt` + right-click | Repaint every cell of that color with the active brush |

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
├── blender-addon/      Python add-on loaded by Blender
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
- [docs/RELEASING.md](docs/RELEASING.md) — how to cut a signed release
  (key setup, version bump, signed MSI, `latest.json`, GitHub Release).

## Reporting issues

Bug reports and feature requests go to
[GitHub Issues](https://github.com/cemilbnr/Match-Creator/issues).
Please include the app version (visible in Settings → Updates) and,
for Analyzer issues, the source screenshot when possible.

## License

[MIT](LICENSE) © Cemil BENER.
