# Match Creator

Hybrid Blender add-on + desktop app for designing match-3 boards and scripting
gameplay animations for marketing videos.

- **`web-app/`** — Match Creator, a Tauri desktop app (React + Vite + TypeScript).
  The UI where you design boards and record gameplay variants.
- **`blender-addon/`** — Python add-on that runs an HTTP server inside Blender
  and receives payloads from Match Creator to build scene collections.
- **`assets/`** — tile PNGs served to the web app.
- **`docs/`** — [ARCHITECTURE](docs/ARCHITECTURE.md) design doc + visual reference.

## Requirements

- Node 20+
- Rust (stable, installed via rustup) — for the Tauri build
- Visual Studio Build Tools with C++ workload — Tauri's Windows linker
- Blender 4.2+

## Development

```powershell
# Run the desktop app (Vite + Tauri, hot-reloaded)
cd web-app
npm install           # first time only
npm run tauri:dev     # opens the Match Creator window

# Build a standalone installer
npm run tauri:build   # outputs src-tauri/target/release/bundle/msi/
```

The Blender add-on is loaded by pointing Blender to the `blender-addon/`
folder (zip it first if Blender requires a zip install). After enabling it,
open the N-panel → **Match-3** tab → **Start Server**. Match Creator auto-pings
`http://localhost:17654` and the sidebar footer turns green when connected.

## Project status

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and
schema versioning notes.

Next up: deeper Blender integration (session bridge, shared data store,
scene-side `GP_*` collection discovery).
