# Match-3 Blast Animator — Architecture

> Blender + Web App hybrid tool for designing match-3 boards and scripting gameplay animations for marketing videos.

---

## 0. TL;DR

Two components talk over a local HTTP server:

1. **Blender Add-on** (`blender-addon/`) — Runs a background HTTP server. Exposes a panel with "Open Editor" button. Serves the web app's static files AND the REST API. Rebuilds scene + animation from JSON on every update.
2. **Web App** (`web-app/`) — React + TypeScript + Vite. Two main panels: Board Designer (grid/piece editor) and Timeline Editor (gameplay sequence). Talks to Blender via REST.

**Single source of truth:** a `Project` JSON per board. Blender keyframes are derivative — regenerated from events on every sync. This is what makes the workflow non-destructive.

**Data flow:**
```
User edits in Web App
      │
      ▼
PUT /api/boards/<id>  (updated Project JSON)
      │
      ▼
Blender Add-on receives via HTTP
      │
      ├── Save JSON to collection custom property
      ├── scene_builder.sync_board(project)        → ensure pieces/materials exist
      └── animation_builder.rebuild_animation(...) → wipe fcurves, re-apply events
      │
      ▼
Viewport updates immediately
```

---

## 1. Project Structure

```
match3-animator/
├── README.md
├── ARCHITECTURE.md                         ← this file
│
├── blender-addon/
│   ├── __init__.py                         ← bl_info + register/unregister
│   ├── preferences.py                      ← port, autostart server, asset paths
│   ├── ui/
│   │   ├── __init__.py
│   │   └── panel.py                        ← N-panel: "Match-3 Animator"
│   ├── operators/
│   │   ├── __init__.py
│   │   ├── server_ops.py                   ← start/stop server, open editor
│   │   └── board_ops.py                    ← new board, delete board, reimport
│   ├── server/
│   │   ├── __init__.py
│   │   ├── http_server.py                  ← threaded HTTPServer wrapper
│   │   ├── routes.py                       ← REST endpoints
│   │   └── static_files.py                 ← serves web-app/dist/*
│   ├── core/
│   │   ├── __init__.py
│   │   ├── models.py                       ← dataclasses: Project, Piece, Event
│   │   ├── project_store.py                ← load/save JSON on Blender collections
│   │   ├── scene_builder.py                ← create/update collections, pieces, materials
│   │   ├── animation_builder.py            ← events → keyframes (the OLD script, refactored)
│   │   └── simulator.py                    ← simulates game state forward for editor previews
│   └── vendor/
│       └── webapp/                         ← web-app build output copied here on package
│           ├── index.html
│           └── assets/
│
└── web-app/
    ├── package.json
    ├── vite.config.ts                      ← proxy /api → localhost:8765 in dev
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                         ← router: BoardList | Designer | Timeline
        ├── api/
        │   ├── client.ts                   ← fetch wrappers
        │   └── types.ts                    ← mirrors core/models.py shapes
        ├── store/
        │   ├── projectStore.ts             ← Zustand: current project, dirty flag, autosave
        │   └── uiStore.ts                  ← active panel, selected tool, playhead frame
        ├── features/
        │   ├── simulation/
        │   │   └── simulator.ts            ← MIRROR of core/simulator.py (TS version)
        │   └── sync/
        │       └── autoSync.ts             ← debounced PUT on project changes
        ├── components/
        │   ├── layout/
        │   │   ├── TopBar.tsx              ← board selector, save indicator, FPS
        │   │   └── AppShell.tsx
        │   ├── BoardDesigner/
        │   │   ├── index.tsx
        │   │   ├── GridCanvas.tsx          ← clickable grid, paint pieces
        │   │   ├── PiecePalette.tsx        ← the 4 piece types
        │   │   ├── GridSizeControls.tsx
        │   │   └── ColorEditor.tsx         ← piece colors/meshes
        │   ├── TimelineEditor/
        │   │   ├── index.tsx
        │   │   ├── Playhead.tsx
        │   │   ├── TimelineRuler.tsx       ← frames, FPS
        │   │   ├── EventTrack.tsx          ← visual blocks per event
        │   │   ├── BoardPreview.tsx        ← live simulated grid at playhead
        │   │   ├── SwapControls.tsx        ← pie-menu-equivalent: L/R/U/D
        │   │   └── TransportBar.tsx        ← play/pause, frame input, fps
        │   └── shared/
        │       ├── Button.tsx
        │       └── NumberInput.tsx
        └── styles/
            └── index.css
```

---

## 2. Data Model

One authoritative schema. Python and TypeScript versions must stay in sync.

### 2.1 Project JSON schema

```ts
// web-app/src/api/types.ts  (mirrored in core/models.py)

export interface Project {
  id: string;                    // uuid, stable across renames
  name: string;                  // display name, e.g. "Level_01"
  schemaVersion: 1;              // bump when schema changes
  grid: GridConfig;
  pieceTypes: PieceType[];
  initialLayout: string[][];     // [row][col] → PieceType.id or null
  timeline: Timeline;
}

export interface GridConfig {
  width: number;                 // columns
  height: number;                // rows
  cellSize: number;              // Blender units between pieces
}

export interface PieceType {
  id: string;                    // "red", "green", "blue", "yellow"
  displayName: string;
  color: string;                 // hex, for web editor preview
  meshName?: string;             // Blender mesh datablock to instance (optional; default cube)
  materialName?: string;         // Blender material to apply
}

export interface Timeline {
  fps: number;                   // default 30
  duration: number;              // total frames
  events: GameEvent[];           // ORDERED by frame
}

export type GameEvent = SwapEvent | MatchEvent | FallEvent | SpawnEvent;

export interface BaseEvent {
  id: string;                    // uuid, stable
  frame: number;                 // start frame
  type: string;
}

export interface SwapEvent extends BaseEvent {
  type: "swap";
  from: GridPos;                 // grid position BEFORE the swap
  to: GridPos;                   // grid position to swap with
  direction: "left"|"right"|"up"|"down";  // derived, but stored for clarity
  duration: number;              // frames to animate, default 5
  squashActivePiece: boolean;    // matches the Y-wiggle from old script
}

export interface MatchEvent extends BaseEvent {
  type: "match";
  positions: GridPos[];          // pieces to destroy (scale → 0)
  duration: number;              // default 5
}

export interface FallEvent extends BaseEvent {
  type: "fall";
  moves: { from: GridPos; to: GridPos }[];
  duration: number;
}

export interface SpawnEvent extends BaseEvent {
  type: "spawn";
  spawns: { at: GridPos; pieceTypeId: string }[];
  duration: number;
}

export interface GridPos { col: number; row: number; }
```

### 2.2 Why events, not keyframes

The old script's imperative approach has no undo granularity — to "remove" a swap you manually delete keyframes and hope nothing else was affected. Events are declarative:

- Edit event at frame 20 → `animation_builder` wipes all fcurves on board pieces, replays every event in order
- Delete event → same thing; the event simply isn't replayed
- Reorder events → same thing
- Non-destructive because keyframes are always a pure function of `Project`

The rebuild cost is negligible for board sizes ≤ 20×20 with ≤ 500 events.

---

## 3. Blender Add-on

### 3.1 UI Panel (`ui/panel.py`)

Located in N-panel under a "Match-3" tab. Shows:

- **Server status** (running on port 8765 / stopped) with Start/Stop button
- **"Open Editor"** button — launches system browser at `http://localhost:<port>`
- **Board list** — all `Match3:<id>` collections in the scene
  - Per row: name, "Select Collection", "Delete Board"
- **"New Board"** button (also creatable from web app)
- **"Rebuild Selected Board"** — force reapply JSON → scene (for after .blend reload)

Keep the panel minimal. All real editing happens in the web app.

### 3.2 HTTP Server (`server/http_server.py`)

Uses Python stdlib `http.server.ThreadingHTTPServer` in a daemon thread so Blender's UI stays responsive.

**Critical:** all `bpy` calls must be marshalled to Blender's main thread. Use `bpy.app.timers.register(callback, first_interval=0)` to post work from HTTP request handlers back to the main thread. Queue pattern:

```python
# server/http_server.py  (sketch)
import queue, threading, bpy

_work_queue: "queue.Queue[callable]" = queue.Queue()

def submit_to_main(fn):
    """Call from HTTP thread. Returns a Future-like with .result()."""
    done = threading.Event()
    result = {}
    def wrapper():
        try:
            result["value"] = fn()
        except Exception as e:
            result["error"] = e
        done.set()
    _work_queue.put(wrapper)
    done.wait(timeout=10)
    if "error" in result:
        raise result["error"]
    return result.get("value")

def _drain_queue():
    while not _work_queue.empty():
        _work_queue.get_nowait()()
    return 0.05  # re-register in 50ms

def start_server():
    bpy.app.timers.register(_drain_queue)
    # ... start ThreadingHTTPServer on preferences.port ...
```

Every `bpy` call inside a route handler goes through `submit_to_main(lambda: ...)`.

### 3.3 REST API (`server/routes.py`)

All endpoints return JSON. Errors: `{"error": "message"}` with HTTP 4xx/5xx.

| Method | Path                           | Purpose |
|--------|--------------------------------|---------|
| GET    | `/api/health`                  | `{"ok": true, "blenderVersion": "4.2.0"}` |
| GET    | `/api/boards`                  | List all projects: `[{id, name}]` |
| GET    | `/api/boards/:id`              | Full `Project` JSON |
| POST   | `/api/boards`                  | Create board with starter grid. Body: `{name, width, height}`. Returns created `Project`. |
| PUT    | `/api/boards/:id`              | Replace `Project`. Triggers scene + animation rebuild. |
| DELETE | `/api/boards/:id`              | Remove collection and all pieces |
| POST   | `/api/boards/:id/rebuild`      | Force resync (no body needed) |
| GET    | `/api/scene`                   | `{fps, currentFrame}` — useful for initial sync |
| POST   | `/api/scene/frame`             | Body: `{frame}` — move Blender playhead |
| GET    | `/`                            | Serves `vendor/webapp/index.html` |
| GET    | `/assets/*`                    | Serves `vendor/webapp/assets/*` |

### 3.4 Project Store (`core/project_store.py`)

Projects are persisted **inside the .blend file** so they survive save/reload:

```python
# Store as JSON string on the collection's custom properties
collection["match3_project"] = json.dumps(project_dict)
```

Why custom property on collection and not a text datablock:
- Stays attached to the specific board
- Deleting the collection deletes the data — no orphan JSON
- No filename conflicts

`project_store.list_projects()` → scans all collections for ones with the `match3_project` key.

### 3.5 Scene Builder (`core/scene_builder.py`)

Responsibilities:
- Ensure a collection `Match3:<project.id>` exists
- For each (col, row) in grid:
  - Compute world position: `(col * cellSize, 0, -row * cellSize)`
  - Ensure a piece object exists with stable name `M3:<project.id>:r<row>:c<col>`
  - Assign mesh + material based on `initialLayout[row][col]`
- Remove piece objects that no longer belong (grid shrunk, layout nulled)
- Idempotent: calling twice with the same project is a no-op

**Stable object names matter** — the animation builder and external references depend on them not changing when you edit unrelated cells.

### 3.6 Animation Builder (`core/animation_builder.py`)

This is where your old script's logic lives, refactored.

```python
def rebuild_animation(project: Project) -> None:
    # 1. Wipe animation data from every piece in this board
    for obj in _pieces_in_board(project.id):
        obj.animation_data_clear()
        obj.location = _initial_location_of(obj, project)
        obj.scale = (1, 1, 1)

    # 2. Simulate forward, emitting keyframes per event
    sim = Simulator(project)
    for event in project.timeline.events:
        sim.advance_to(event.frame)
        if event.type == "swap":
            _apply_swap(event, sim, project)
        elif event.type == "match":
            _apply_match(event, sim, project)
        elif event.type == "fall":
            _apply_fall(event, sim, project)
        elif event.type == "spawn":
            _apply_spawn(event, sim, project)

    # 3. Update scene frame range
    bpy.context.scene.render.fps = project.timeline.fps
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end, project.timeline.duration)
```

The swap/match logic ports directly from your `OBJECT_OT_keyframe_move.execute`:

```python
def _apply_swap(evt: SwapEvent, sim: Simulator, project: Project):
    a = sim.piece_at(evt.from_)      # object resolved via sim state
    b = sim.piece_at(evt.to)
    frame = evt.frame

    # Swap X or Z depending on direction
    axis = 0 if evt.direction in ("left", "right") else 2
    a.keyframe_insert("location", frame=frame, index=axis)
    b.keyframe_insert("location", frame=frame, index=axis)
    a.location[axis], b.location[axis] = b.location[axis], a.location[axis]
    a.keyframe_insert("location", frame=frame + evt.duration, index=axis)
    b.keyframe_insert("location", frame=frame + evt.duration, index=axis)

    # Y squash on active piece (your original dip)
    if evt.squashActivePiece:
        orig_y = a.location.y
        a.keyframe_insert("location", frame=frame, index=1)
        a.location.y = orig_y - 0.001
        a.keyframe_insert("location", frame=frame + 1, index=1)
        a.keyframe_insert("location", frame=frame + evt.duration - 1, index=1)
        a.location.y = orig_y
        a.keyframe_insert("location", frame=frame + evt.duration, index=1)

    sim.apply_swap(evt)  # update internal grid state
```

### 3.7 Simulator (`core/simulator.py`)

Tracks "where each piece is at frame N" without touching Blender. Needed so the builder knows which object to keyframe when an event says "swap pieces at (2,3) and (3,3)" — because by that frame, some pieces may have moved due to prior events.

```python
class Simulator:
    def __init__(self, project: Project):
        self.grid: list[list[PieceId|None]] = ...  # from initial layout
        self.piece_positions: dict[PieceId, GridPos] = ...

    def piece_at(self, pos: GridPos) -> bpy.types.Object: ...
    def apply_swap(self, evt: SwapEvent): ...
    def apply_match(self, evt: MatchEvent): ...
    def apply_fall(self, evt: FallEvent): ...
    def apply_spawn(self, evt: SpawnEvent): ...
    def snapshot(self) -> GridState: ...   # for the web editor preview
```

**Duplicate this class in TypeScript** under `web-app/src/features/simulation/simulator.ts` so the Timeline Editor can show the board state at the playhead without a server roundtrip.

---

## 4. Web App

### 4.1 Layout

```
┌──────────────────────────────────────────────────────┐
│ TopBar:  [Board ▾ Level_01]  FPS:30  ● Saved         │
├──────────────────────────────────────────────────────┤
│                                                      │
│                  Active Panel                        │
│                                                      │
│   ┌─ Tabs ─────────────────────────────────────┐    │
│   │  [Board Designer]   [Timeline Editor]      │    │
│   └────────────────────────────────────────────┘    │
│                                                      │
│   (Board Designer OR Timeline Editor renders here)   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 4.2 Board Designer

- **Left:** PiecePalette (4 piece types, click to select "paint" tool)
- **Center:** GridCanvas — click a cell to paint selected piece, right-click to clear
- **Right:** GridSizeControls (width/height steppers), ColorEditor (hex + mesh name per piece)

State lives in `projectStore.currentProject.initialLayout`. Any change triggers `autoSync`.

### 4.3 Timeline Editor

```
┌────────────────────────────────────────────────────┐
│  BoardPreview (simulated grid at current frame)    │
│  ┌────┬────┬────┬────┐                             │
│  │ 🟢 │ 🔴 │ 🔵 │ 🟡 │  ← click two adjacent        │
│  ├────┼────┼────┼────┤    pieces to queue a swap   │
│  │ ...                                             │
│  └────┴────┴────┴────┘                             │
├────────────────────────────────────────────────────┤
│ Transport:  ⏮  ⏯  ⏭   Frame [__24__]  FPS [30]    │
├────────────────────────────────────────────────────┤
│ Ruler: 0    10    20    30    40    50    60       │
│       │  │  │  │  │  │  │  │  │  │  │  │  │  │    │
│ Swaps:        ▓▓                  ▓▓               │
│ Matches:           ▓▓▓                   ▓▓        │
└────────────────────────────────────────────────────┘
```

Interaction model:
1. Playhead sits on some frame (default: end of last event + 5)
2. User clicks piece A, then an adjacent piece B → auto-creates a `SwapEvent` at playhead
3. Swap direction inferred from relative positions
4. After swap, if resulting grid has 3+ in a row/column of same type → prompt "Auto-add match event?" (optional nice-to-have; start without it)
5. User can drag event blocks horizontally to retime, click to edit properties, Delete to remove

The timeline is a controlled React component backed by `projectStore.currentProject.timeline.events`. Every mutation is a small pure function returning a new array. No direct DOM manipulation.

### 4.4 State Management (`store/projectStore.ts`)

Zustand store, one slice per concern:

```ts
interface ProjectState {
  boards: { id: string; name: string }[];     // lightweight list
  currentProject: Project | null;             // full project
  dirty: boolean;
  lastSyncedAt: number | null;

  loadBoards: () => Promise<void>;
  selectBoard: (id: string) => Promise<void>;
  createBoard: (name: string, w: number, h: number) => Promise<void>;
  updateProject: (updater: (p: Project) => Project) => void;   // marks dirty
  // autoSync listens to dirty changes, debounces 300ms, PUTs to server
}
```

### 4.5 Sync Strategy (`features/sync/autoSync.ts`)

- Zustand subscription on `currentProject`
- 300ms debounce after last change
- PUT full project to `/api/boards/:id`
- On success: set `dirty=false`, `lastSyncedAt=now`
- On failure: keep `dirty=true`, show retry toast
- If Blender scene frame changes, the web app can optionally poll `/api/scene` every 500ms to keep playhead in sync (later phase)

### 4.6 Dev Setup (`vite.config.ts`)

```ts
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8765",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

Build output (`web-app/dist/`) gets copied to `blender-addon/vendor/webapp/` as part of the packaging script. During development, you run Vite dev server and Blender in parallel.

---

## 5. Implementation Phases

Do NOT try to build everything at once. Ship in this order:

### Phase 1 — Plumbing (2 days)
- [ ] Blender addon skeleton: `__init__.py`, panel, preferences
- [ ] HTTP server with `/api/health`, `/api/boards` (empty list), static file serving
- [ ] Vite React app, empty Board List page, TopBar
- [ ] End-to-end: click "Open Editor" in Blender → browser shows app → app fetches `/api/health` successfully

### Phase 2 — Board Designer + round trip (3 days)
- [ ] `Project`, `PieceType`, `GridConfig` dataclasses + TS types
- [ ] `project_store.py` with create/list/get/update/delete
- [ ] `scene_builder.py` — creates collection + piece objects from project (cubes with colored materials for now)
- [ ] REST endpoints for boards
- [ ] Web app: BoardDesigner with grid canvas, piece palette, grid size controls
- [ ] Autosync working — edit in web → appears in Blender

### Phase 3 — Timeline + Swaps (3 days)
- [ ] `models.py` Event types
- [ ] `simulator.py` in Python + TS (port simulator.ts from the Python one carefully)
- [ ] `animation_builder.py` swap logic (ported from old script)
- [ ] Web app: TimelineEditor, BoardPreview rendering from TS simulator, click-two-pieces to create swap
- [ ] Transport bar, playhead, FPS

### Phase 4 — Matches + polish (2 days)
- [ ] MatchEvent handling in builder + TS simulator
- [ ] Manual "Mark matched" tool in web app (select pieces → add match event)
- [ ] Event dragging/deletion in timeline
- [ ] Frame sync both directions (Blender playhead ↔ web playhead)

### Phase 5 — Later (not MVP)
- [ ] FallEvent, SpawnEvent (cascading mechanic)
- [ ] Auto-match detection
- [ ] Real pieces (import your apple/potion meshes, apply via `pieceType.meshName`)
- [ ] Export video presets
- [ ] Undo history in web app (event log replay)

---

## 6. Hard Rules / Gotchas

1. **Never call `bpy` from the HTTP thread.** Always marshal through the main-thread timer queue. Blender crashes hard if you violate this.
2. **Stable object names.** Piece object names must be deterministic from `(project.id, row, col)`. Never rely on Blender's auto-numbering.
3. **Animation rebuild must be atomic.** Wipe all fcurves first, then reapply. Never "patch" existing keyframes — that's the non-destructive contract.
4. **Project ID is immutable.** Name can change, id cannot. If user renames, id stays — only the display name and collection suffix update.
5. **Schema version field.** When you change `Project` shape, bump `schemaVersion` and write a migration in `project_store.load()`. Blend files survive for years.
6. **Simulator parity.** Python and TS simulators MUST produce identical state for the same inputs. Add a shared test vector (JSON file of `{project, expectedStateAtFrame}`) that both implementations can run against.
7. **Port configurable.** Don't hardcode 8765 — put it in addon preferences. If port is busy, add-on should retry the next 5 ports and report.
8. **CORS.** Since we serve the web app from the same origin as the API, CORS is not needed in production. In dev (Vite proxy), also no CORS. Don't add permissive CORS headers "just in case."
9. **Thread safety of project_store.** If two rapid PUTs arrive, the second should win, not interleave. Use a single `threading.Lock` around project mutations.
10. **Don't serialize `bpy` objects.** Project JSON is pure data. All "which object does this refer to" resolution happens via the simulator + stable names.

---

## 7. Tech Stack Summary

| Layer            | Choice                                    |
|------------------|-------------------------------------------|
| Blender Python   | 3.11 (Blender 4.2+)                       |
| HTTP server      | stdlib `http.server.ThreadingHTTPServer`  |
| JSON             | stdlib `json`                             |
| Web framework    | React 18 + TypeScript 5                   |
| Bundler          | Vite 5                                    |
| Styling          | Tailwind CSS 3                            |
| State            | Zustand 4                                 |
| Grid rendering   | DOM + CSS grid (Canvas only if perf dies) |
| No extra deps    | No Electron, no Flask, no WebSocket (for MVP) |

Keep external dependencies near zero on the Blender side so installation is drag-and-drop of a single `.zip`.

---

## 8. Packaging

One script: `package.sh` (or `.py`):

1. `cd web-app && npm run build`
2. `rm -rf ../blender-addon/vendor/webapp && cp -r dist ../blender-addon/vendor/webapp`
3. `cd ../blender-addon && zip -r ../match3-animator-v1.0.0.zip .`

User installs via Blender Preferences → Add-ons → Install → pick the zip.

---

## 9. Open Questions (decide before coding)

- [ ] Are piece meshes imported from an asset library, or does the user pick from already-in-scene meshes per project?
- [ ] Should FPS be per-project or global (scene-level)?
- [ ] What's the max expected board size? (affects whether DOM grid is fine or we need Canvas)
- [ ] Do you want multiple "takes" per board (A/B gameplay variants) or is one timeline per board enough for MVP?

Answer these before Phase 2 — they affect the data model.
