"""Builds and animates a match-3 gameplay variant inside Blender.

See the schema in the HTTP routes (`/api/gameplay`) for the payload shape.

Collection hierarchy:
  GP_MC                            (parent, one per .blend)
    └── GP_<Board>_<Variant>       (root — create mode may append .001, .002…)
        ├── MC_BoardCtrl_<Board>_<Variant>  (Empty — single parent handle)
        ├── <root>_Tiles           (pieces — swap/fall + scale anim)
        └── <root>_Tilebacks       (one per non-gap cell — fixed pos, scale-to-0 on match)

Object naming (stable inside a given root):
  <root>_Tile_<pieceId>
  <root>_TileBack_<row>_<col>

Scene layout: 1 cell = 1 Blender unit, board centered on world origin. Tiles
sit on the X/Z plane (Y free for the dip). Procedural meshes fill the whole
unit cell (1×1) so adjacent cells touch with zero gap.

Board controller: every variant has a single `MC_BoardCtrl_*` Empty parented
above all tiles and tilebacks. Animations are always authored at the empty's
"spawn pose" (translation only, anchored to the midpoint of the row-0 edge),
so the user can move/scale the empty freely to frame the board in their scene
without losing their pose when the variant is updated.

Custom assets: if `preferences.asset_blend` points at a .blend file containing
objects named `MC_Tile` and `MC_Tileback` (and optional materials
`MC_Material_{Red,Green,Blue,Yellow,Tileback}`), those are used as templates
instead of the built-in procedural meshes. Origins on those templates define
where scale pivots, which is why the user gets to author them.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from typing import Optional

import bpy
from mathutils import Matrix


GP_MC_PARENT = "GP_MC"
BOARD_CTRL_PREFIX = "MC_BoardCtrl_"
LAST_LAYOUT_PROP = "mc_last_layout"
LAST_PIECES_PROP = "mc_last_pieces_sig"

# ---------- Custom asset naming convention ----------

ASSET_TILE_OBJ = "MC_Tile"
ASSET_TILEBACK_OBJ = "MC_Tileback"
_COLOR_IDS = ("red", "green", "blue", "yellow")
ASSET_TILE_MATERIAL_PREFIX = "MC_Material_"
ASSET_TILEBACK_MATERIAL = "MC_Material_Tileback"


# ---------- Fallback palette for the procedural material ----------

_COLOR_HEX = {
    "red":    (0.90, 0.22, 0.21),
    "green":  (0.26, 0.63, 0.28),
    "blue":   (0.12, 0.53, 0.90),
    "yellow": (0.99, 0.85, 0.21),
}


# ---------- Asset templates (loaded from asset_blend once per build) ----------

class AssetTemplates:
    """Holds the meshes + per-colour materials we clone from on each tile/tileback.

    When `asset_blend` isn't set or the file is missing/mismatched, the fields
    fall back to procedural equivalents so the builder still works standalone.
    """
    def __init__(self):
        self.tile_mesh: Optional[bpy.types.Mesh] = None
        self.tileback_mesh: Optional[bpy.types.Mesh] = None
        self.tile_materials: dict[str, bpy.types.Material] = {}
        self.tileback_material: Optional[bpy.types.Material] = None


def _load_asset_templates(asset_blend: str) -> AssetTemplates:
    t = AssetTemplates()
    if not asset_blend or not os.path.isfile(asset_blend):
        return t

    want_objects = [n for n in (ASSET_TILE_OBJ, ASSET_TILEBACK_OBJ)
                    if n not in bpy.data.objects]
    want_materials: list[str] = []
    for color in _COLOR_IDS:
        name = f"{ASSET_TILE_MATERIAL_PREFIX}{color.capitalize()}"
        if name not in bpy.data.materials:
            want_materials.append(name)
    if ASSET_TILEBACK_MATERIAL not in bpy.data.materials:
        want_materials.append(ASSET_TILEBACK_MATERIAL)

    # Only hit disk when something is missing.
    if want_objects or want_materials:
        try:
            with bpy.data.libraries.load(asset_blend, link=False) as (src, dst):
                dst.objects = [n for n in want_objects if n in src.objects]
                dst.materials = [n for n in want_materials if n in src.materials]
        except Exception as e:  # noqa: BLE001
            print(f"[match3] asset load failed from {asset_blend!r}: {e}")
            return t

    # The template objects themselves are unlinked — we only need their data.
    tile_obj = bpy.data.objects.get(ASSET_TILE_OBJ)
    tileback_obj = bpy.data.objects.get(ASSET_TILEBACK_OBJ)
    for obj in (tile_obj, tileback_obj):
        if obj is None:
            continue
        for col in list(obj.users_collection):
            col.objects.unlink(obj)

    if tile_obj is not None and tile_obj.data is not None:
        t.tile_mesh = tile_obj.data
    if tileback_obj is not None and tileback_obj.data is not None:
        t.tileback_mesh = tileback_obj.data

    for color in _COLOR_IDS:
        name = f"{ASSET_TILE_MATERIAL_PREFIX}{color.capitalize()}"
        mat = bpy.data.materials.get(name)
        if mat is not None:
            t.tile_materials[color] = mat
    t.tileback_material = bpy.data.materials.get(ASSET_TILEBACK_MATERIAL)

    return t


# ---------- Procedural fallbacks ----------

_SHARED_TILE_MESH_NAME = "MatchTile_PlaneMesh"
_SHARED_TILEBACK_MESH_NAME = "MatchTile_CubeMesh"


def _ensure_tile_mesh_procedural() -> bpy.types.Mesh:
    mesh = bpy.data.meshes.get(_SHARED_TILE_MESH_NAME)
    if mesh is not None:
        return mesh
    # 1×1 plane on X/Z centered at origin — fills the whole unit cell so
    # adjacent tiles touch edge-to-edge.
    verts = [
        (-0.5, 0.0, -0.5),
        ( 0.5, 0.0, -0.5),
        ( 0.5, 0.0,  0.5),
        (-0.5, 0.0,  0.5),
    ]
    faces = [(0, 1, 2, 3)]
    mesh = bpy.data.meshes.new(_SHARED_TILE_MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    # Keep one empty material slot on the shared mesh so every tile object can
    # override it at the OBJECT level without touching siblings.
    if len(mesh.materials) == 0:
        mesh.materials.append(None)
    return mesh


def _ensure_tileback_mesh_procedural() -> bpy.types.Mesh:
    mesh = bpy.data.meshes.get(_SHARED_TILEBACK_MESH_NAME)
    if mesh is not None:
        return mesh
    # 1×1 footprint (X/Z), thin slab along Y.
    verts = [
        (-0.5, -0.20, -0.5), ( 0.5, -0.20, -0.5),
        ( 0.5,  0.20, -0.5), (-0.5,  0.20, -0.5),
        (-0.5, -0.20,  0.5), ( 0.5, -0.20,  0.5),
        ( 0.5,  0.20,  0.5), (-0.5,  0.20,  0.5),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2),
        (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(_SHARED_TILEBACK_MESH_NAME)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if len(mesh.materials) == 0:
        mesh.materials.append(None)
    return mesh


def _ensure_tile_material_procedural(color_id: str) -> bpy.types.Material:
    name = f"MatchTile_{color_id}"
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
    rgb = _COLOR_HEX.get(color_id, (0.5, 0.5, 0.5))
    rgba = (rgb[0], rgb[1], rgb[2], 1.0)
    mat.diffuse_color = rgba
    if mat.use_nodes and mat.node_tree:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = rgba
    return mat


# ---------- Collection + object helpers ----------

def _sanitize(name: str) -> str:
    safe = "".join(c if (c.isalnum() or c in " _-") else "_" for c in name)
    return safe.strip()[:60] or "Untitled"


def _ensure_collection(parent: bpy.types.Collection, name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing is not None:
        if name not in parent.children:
            parent.children.link(existing)
        return existing
    col = bpy.data.collections.new(name)
    parent.children.link(col)
    return col


def _unique_collection_name(base: str) -> str:
    if bpy.data.collections.get(base) is None:
        return base
    for i in range(1, 10000):
        candidate = f"{base}.{i:03d}"
        if bpy.data.collections.get(candidate) is None:
            return candidate
    raise RuntimeError(f"Too many collections starting with {base}")


def _world_pos(row: float, col: float, width: int, height: int) -> tuple[float, float, float]:
    """Cells are 1 Blender unit wide — tiles sized 1×1 thus touch with no gap."""
    x = col - (width - 1) / 2.0
    z = (height - 1) / 2.0 - row
    return (x, 0.0, z)


def _set_object_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    """OBJECT-level override so tiles sharing one mesh can have distinct colors."""
    if len(obj.material_slots) == 0:
        obj.data.materials.append(None)
    obj.material_slots[0].link = 'OBJECT'
    obj.material_slots[0].material = mat


def _resolve_tile_material(color_id: str, templates: AssetTemplates) -> bpy.types.Material:
    mat = templates.tile_materials.get(color_id)
    if mat is not None:
        return mat
    return _ensure_tile_material_procedural(color_id)


def _resolve_tile_mesh(templates: AssetTemplates) -> bpy.types.Mesh:
    return templates.tile_mesh or _ensure_tile_mesh_procedural()


def _resolve_tileback_mesh(templates: AssetTemplates) -> bpy.types.Mesh:
    return templates.tileback_mesh or _ensure_tileback_mesh_procedural()


def _ensure_tile_obj(
    name: str,
    color_id: str,
    tiles_col: bpy.types.Collection,
    templates: AssetTemplates,
) -> bpy.types.Object:
    mesh = _resolve_tile_mesh(templates)
    mat = _resolve_tile_material(color_id, templates)
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, mesh)
    else:
        obj.data = mesh
    for c in list(obj.users_collection):
        if c is not tiles_col:
            c.objects.unlink(obj)
    if obj.name not in tiles_col.objects:
        tiles_col.objects.link(obj)
    _set_object_material(obj, mat)
    obj.animation_data_clear()
    return obj


def _ensure_tileback_obj(
    name: str,
    tilebacks_col: bpy.types.Collection,
    templates: AssetTemplates,
) -> bpy.types.Object:
    mesh = _resolve_tileback_mesh(templates)
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, mesh)
    else:
        obj.data = mesh
    for c in list(obj.users_collection):
        if c is not tilebacks_col:
            c.objects.unlink(obj)
    if obj.name not in tilebacks_col.objects:
        tilebacks_col.objects.link(obj)
    if templates.tileback_material is not None:
        _set_object_material(obj, templates.tileback_material)
    obj.animation_data_clear()
    return obj


# ---------- Board controller (parent empty) ----------

def _spawn_matrix(width: int, height: int) -> Matrix:
    """Pose the controller anchors at — midpoint of the row-0 (top) edge.

    The board sits on the X/Z plane centered at origin; row 0 lives at
    +Z = (height-1)/2 with cell extent ±0.5, so the top edge midpoint is
    (0, 0, height/2). Translation only — identity rotation/scale — so when
    the user later moves or scales the empty their transform is layered
    cleanly on top of the authored animations.
    """
    return Matrix.Translation((0.0, 0.0, height / 2.0))


def _ensure_board_ctrl(
    name: str,
    root: bpy.types.Collection,
    spawn: Matrix,
) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    created = False
    if obj is None:
        obj = bpy.data.objects.new(name, None)
        obj.empty_display_type = 'ARROWS'
        obj.empty_display_size = 1.0
        created = True
    # Make sure the empty lives only in the variant root collection.
    for c in list(obj.users_collection):
        if c is not root:
            c.objects.unlink(obj)
    if obj.name not in root.objects:
        root.objects.link(obj)
    if created:
        obj.matrix_world = spawn
    return obj


def _parent_to_ctrl(child: bpy.types.Object, ctrl: bpy.types.Object) -> None:
    """Parent `child` under `ctrl` and freeze the inverse against the current
    controller world matrix. Caller must ensure the controller is at its
    spawn pose at the moment this runs — otherwise authored local positions
    won't equal world positions during the build."""
    if child.parent is not ctrl:
        child.parent = ctrl
        child.parent_type = 'OBJECT'
    child.matrix_parent_inverse = ctrl.matrix_world.inverted()


# ---------- Keyframe application ----------

def _keyframe_tile(
    tile: bpy.types.Object,
    keyframes: list[dict],
    width: int,
    height: int,
) -> None:
    """Tiles get full animation: location (X/Z swap+fall, Y dip) + scale."""
    for kf in keyframes:
        frame = int(kf["frame"])
        row = float(kf.get("row", 0.0))
        col = float(kf.get("col", 0.0))
        scale_v = float(kf.get("scale", 1.0))
        dip = float(kf.get("dip", 0.0))

        x, _y, z = _world_pos(row, col, width, height)
        tile.location = (x, dip, z)
        tile.keyframe_insert(data_path="location", frame=frame, index=0)
        tile.keyframe_insert(data_path="location", frame=frame, index=1)
        tile.keyframe_insert(data_path="location", frame=frame, index=2)
        tile.scale = (scale_v, scale_v, scale_v)
        tile.keyframe_insert(data_path="scale", frame=frame)


def _keyframe_tileback_pulse(
    tileback: bpy.types.Object,
    start_frame: int,
    dissolves: list[tuple[int, int]],
) -> None:
    """Fixed-position tilebacks. Scale stays at 1 until a match dissolves a
    tile at this cell — at that point the tileback scales 1→0 together with
    the tile and stays at 0. No automatic re-grow: the cell is considered
    "cleared" and stays empty until cascade mode spawns a replacement (which
    is a separate feature not yet wired up)."""
    tileback.scale = (1.0, 1.0, 1.0)
    tileback.keyframe_insert(data_path="scale", frame=start_frame)

    for (ds, de) in dissolves:
        tileback.scale = (1.0, 1.0, 1.0)
        tileback.keyframe_insert(data_path="scale", frame=max(start_frame, ds))
        tileback.scale = (0.0, 0.0, 0.0)
        tileback.keyframe_insert(data_path="scale", frame=de)


def _collect_cell_dissolves(
    pieces: list[dict],
) -> dict[tuple[int, int], list[tuple[int, int]]]:
    per_cell: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for piece in pieces:
        kfs = piece.get("keyframes", []) or []
        if len(kfs) < 2:
            continue
        sorted_kfs = sorted(kfs, key=lambda k: int(k.get("frame", 0)))
        for i in range(1, len(sorted_kfs)):
            prev = sorted_kfs[i - 1]
            cur = sorted_kfs[i]
            if float(prev.get("scale", 1)) >= 1.0 and float(cur.get("scale", 1)) <= 0.0:
                cell = (int(cur.get("row", 0)), int(cur.get("col", 0)))
                per_cell[cell].append((int(prev.get("frame", 0)), int(cur.get("frame", 0))))
    for cell in per_cell:
        per_cell[cell].sort(key=lambda ev: ev[0])
    return dict(per_cell)


# ---------- Layout / pieces diff helpers ----------

def _gap_mask(layout: list[list]) -> list[list[bool]]:
    """True for cells that are gaps (structural holes), False for everything else."""
    return [[cell == "gap" for cell in row] for row in layout]


def _structural_match(prev_layout, curr_layout) -> bool:
    """Same dimensions and identical gap pattern."""
    if not isinstance(prev_layout, list) or not isinstance(curr_layout, list):
        return False
    if len(prev_layout) != len(curr_layout):
        return False
    for prev_row, curr_row in zip(prev_layout, curr_layout):
        if not isinstance(prev_row, list) or not isinstance(curr_row, list):
            return False
        if len(prev_row) != len(curr_row):
            return False
        for a, b in zip(prev_row, curr_row):
            if (a == "gap") != (b == "gap"):
                return False
    return True


def _pieces_signature(pieces: list[dict]) -> list[dict]:
    """Stripped-down view of the piece list used to detect color-only diffs.
    Pieces are sorted by id; colors are intentionally excluded so that a
    pure recolor produces an identical signature to the previous build."""
    out = []
    for p in pieces:
        kfs = []
        for kf in (p.get("keyframes") or []):
            kfs.append({
                "frame": int(kf.get("frame", 0)),
                "row": float(kf.get("row", 0.0)),
                "col": float(kf.get("col", 0.0)),
                "scale": float(kf.get("scale", 1.0)),
                "dip": float(kf.get("dip", 0.0)),
            })
        out.append({"id": str(p.get("id", "")), "keyframes": kfs})
    out.sort(key=lambda x: x["id"])
    return out


def _read_prev_layout(root: bpy.types.Collection):
    raw = root.get(LAST_LAYOUT_PROP)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _read_prev_pieces_sig(root: bpy.types.Collection):
    raw = root.get(LAST_PIECES_PROP)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _persist_state(
    root: bpy.types.Collection,
    layout: list[list],
    pieces_sig: list[dict],
) -> None:
    root[LAST_LAYOUT_PROP] = json.dumps(layout)
    root[LAST_PIECES_PROP] = json.dumps(pieces_sig)


# ---------- Color-only fast path ----------

def _apply_color_only_update(
    pieces: list[dict],
    tile_prefix: str,
    tiles_col: bpy.types.Collection,
    templates: AssetTemplates,
    ctrl: bpy.types.Object,
    width: int,
    height: int,
) -> int:
    """Re-skin the existing tile objects for a color-only diff. Tilebacks and
    object identity are left untouched. Returns the number of tiles touched."""
    # Cache material lookups across the request.
    mat_cache: dict[str, bpy.types.Material] = {}

    def get_mat(color_id: str) -> bpy.types.Material:
        m = mat_cache.get(color_id)
        if m is None:
            m = _resolve_tile_material(color_id, templates)
            mat_cache[color_id] = m
        return m

    touched = 0
    for piece in pieces:
        pid = str(piece.get("id"))
        color_id = str(piece.get("color", "red"))
        keyframes = piece.get("keyframes", []) or []
        if not pid or not keyframes:
            continue
        tile_name = f"{tile_prefix}{pid}"
        tile = bpy.data.objects.get(tile_name)
        if tile is None:
            # A tile we expected to exist is missing — caller's signature check
            # should have prevented this, so bail to the structural path.
            return -1
        # Make sure it's still in the tiles collection (and only there).
        for c in list(tile.users_collection):
            if c is not tiles_col:
                c.objects.unlink(tile)
        if tile.name not in tiles_col.objects:
            tiles_col.objects.link(tile)
        _set_object_material(tile, get_mat(color_id))
        # Re-anchor against the (currently spawn-posed) controller and re-key
        # so animations stay aligned with the controller's reset transform.
        _parent_to_ctrl(tile, ctrl)
        tile.animation_data_clear()
        _keyframe_tile(tile, keyframes, width, height)
        touched += 1
    return touched


# ---------- Top-level builder ----------

def build_or_update(payload: dict) -> dict:
    if int(payload.get("version", 0)) != 1:
        raise ValueError("Unsupported export version.")

    mode = str(payload.get("mode", "update")).lower()
    if mode not in ("create", "update"):
        raise ValueError(f"Unknown mode: {mode!r}")

    board_name = str(payload.get("boardName", "Board"))
    variant_name = str(payload.get("variantName", "Variant"))
    fps = int(payload.get("fps", 30))
    grid = payload.get("grid", {})
    width = int(grid.get("width", 0))
    height = int(grid.get("height", 0))
    start_frame = int(payload.get("startFrame", 1))
    end_frame = int(payload.get("endFrame", start_frame))
    pieces = payload.get("pieces", []) or []
    layout = payload.get("layout")  # may be absent on older clients

    if width <= 0 or height <= 0:
        raise ValueError("Invalid grid dimensions.")

    safe_board = _sanitize(board_name)
    safe_variant = _sanitize(variant_name)
    base_root_name = f"GP_{safe_board}_{safe_variant}"

    scene = bpy.context.scene
    scene.render.fps = max(1, fps)
    if start_frame < scene.frame_start:
        scene.frame_start = start_frame
    if end_frame > scene.frame_end:
        scene.frame_end = end_frame

    # Load custom assets (if the user configured an asset .blend).
    asset_blend = ""
    try:
        from .. import preferences
        prefs = preferences.get(bpy.context)
        asset_blend = getattr(prefs, "asset_blend", "") or ""
    except Exception:  # noqa: BLE001
        pass
    templates = _load_asset_templates(asset_blend)

    gp_mc = _ensure_collection(scene.collection, GP_MC_PARENT)

    if mode == "create":
        root_name = _unique_collection_name(base_root_name)
        root = bpy.data.collections.new(root_name)
        gp_mc.children.link(root)
    else:
        existing = bpy.data.collections.get(base_root_name)
        if existing is not None:
            root_name = base_root_name
            root = existing
            if root_name not in gp_mc.children:
                gp_mc.children.link(root)
        else:
            root_name = base_root_name
            root = bpy.data.collections.new(root_name)
            gp_mc.children.link(root)

    tiles_col = _ensure_collection(root, f"{root_name}_Tiles")
    tilebacks_col = _ensure_collection(root, f"{root_name}_Tilebacks")

    tile_prefix = f"{root_name}_Tile_"
    tileback_prefix = f"{root_name}_TileBack_"

    # ---- Board controller (parent empty) ----
    # Mirror the root collection's actual name so that create-mode numeric
    # suffixes (.001, .002…) carry through to the empty: a fresh GP_X.001
    # collection gets its own MC_BoardCtrl_X.001, never stealing the empty
    # of an earlier variant that already owns MC_BoardCtrl_X.
    ctrl_suffix = root_name[len("GP_"):] if root_name.startswith("GP_") else root_name
    ctrl_name = f"{BOARD_CTRL_PREFIX}{ctrl_suffix}"
    spawn = _spawn_matrix(width, height)

    # If the empty already exists, capture the user's current pose so we can
    # restore it after the rebuild. The capture happens BEFORE we fetch via
    # _ensure_board_ctrl so we read the pose from the live scene state, not
    # whatever transform the helper might assert.
    saved_world: Optional[Matrix] = None
    pre_existing_ctrl = bpy.data.objects.get(ctrl_name)
    if mode == "update" and pre_existing_ctrl is not None:
        saved_world = pre_existing_ctrl.matrix_world.copy()

    ctrl = _ensure_board_ctrl(ctrl_name, root, spawn)
    # Force the controller to its spawn pose for the duration of the build:
    # local positions on children become world positions when the controller
    # is at spawn + matrix_parent_inverse cancels out, which keeps the
    # authored fcurves identical to the un-parented version.
    ctrl.matrix_world = spawn
    bpy.context.view_layer.update()

    # ---- Diff against last build ----
    prev_layout = _read_prev_layout(root)
    prev_pieces_sig = _read_prev_pieces_sig(root)
    curr_pieces_sig = _pieces_signature(pieces)

    color_only_eligible = (
        mode == "update"
        and isinstance(layout, list)
        and prev_layout is not None
        and prev_pieces_sig is not None
        and _structural_match(prev_layout, layout)
        and prev_pieces_sig == curr_pieces_sig
    )

    wanted_tile_names: set[str] = set()
    wanted_tileback_names: set[str] = set()
    fast_path_used = False

    if color_only_eligible:
        touched = _apply_color_only_update(
            pieces, tile_prefix, tiles_col, templates, ctrl, width, height,
        )
        if touched >= 0:
            fast_path_used = True
            wanted_tile_names = {
                f"{tile_prefix}{p.get('id')}"
                for p in pieces if p.get("id") and p.get("keyframes")
            }
            # Tilebacks are intentionally left as-is on the fast path. Discover
            # the existing set so the response stays accurate.
            for obj in tilebacks_col.objects:
                if obj.name.startswith(tileback_prefix):
                    wanted_tileback_names.add(obj.name)

    if not fast_path_used:
        # ---- Tiles (structural / full rebuild) ----
        for piece in pieces:
            pid = str(piece.get("id"))
            color_id = str(piece.get("color", "red"))
            keyframes = piece.get("keyframes", []) or []
            if not pid or not keyframes:
                continue

            tile_name = f"{tile_prefix}{pid}"
            wanted_tile_names.add(tile_name)
            tile = _ensure_tile_obj(tile_name, color_id, tiles_col, templates)
            _parent_to_ctrl(tile, ctrl)
            _keyframe_tile(tile, keyframes, width, height)

        # ---- Tilebacks: one per non-gap cell, fixed at cell position ----
        cell_dissolves = _collect_cell_dissolves(pieces)
        gaps = _gap_mask(layout) if isinstance(layout, list) else None
        for r in range(height):
            for c in range(width):
                if gaps is not None and r < len(gaps) and c < len(gaps[r]) and gaps[r][c]:
                    continue
                tb_name = f"{tileback_prefix}{r}_{c}"
                wanted_tileback_names.add(tb_name)
                tileback = _ensure_tileback_obj(tb_name, tilebacks_col, templates)
                x, _y, z = _world_pos(r, c, width, height)
                tileback.location = (x, 0.0, z)
                _parent_to_ctrl(tileback, ctrl)
                _keyframe_tileback_pulse(
                    tileback,
                    start_frame,
                    cell_dissolves.get((r, c), []),
                )

        if mode == "update":
            for obj in list(tiles_col.objects):
                if obj.name.startswith(tile_prefix) and obj.name not in wanted_tile_names:
                    bpy.data.objects.remove(obj, do_unlink=True)
            for obj in list(tilebacks_col.objects):
                if obj.name.startswith(tileback_prefix) and obj.name not in wanted_tileback_names:
                    bpy.data.objects.remove(obj, do_unlink=True)

    # ---- Restore the user's pose (update only) ----
    if saved_world is not None:
        ctrl.matrix_world = saved_world
        bpy.context.view_layer.update()

    # ---- Persist current state for next-call diffing ----
    if isinstance(layout, list):
        _persist_state(root, layout, curr_pieces_sig)

    return {
        "ok": True,
        "mode": mode,
        "collection": root_name,
        "controller": ctrl.name,
        "tileCount": len(wanted_tile_names),
        "tilebackCount": len(wanted_tileback_names),
        "fastPath": fast_path_used,
        "frameRange": [start_frame, end_frame],
        "fps": fps,
        "customAssets": templates.tile_mesh is not None or templates.tileback_mesh is not None,
    }
