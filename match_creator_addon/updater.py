"""Lightweight GitHub-Releases-backed auto-updater for the addon.

Mirrors the desktop app's Tauri updater pattern: a small JSON manifest
sits next to every signed release at
    https://github.com/cemilbnr/Match-Creator/releases/latest/download/addon-latest.json
and the addon polls it on demand from a Preferences UI button. When the
manifest's version is newer than the installed `ADDON_VERSION_TUPLE`,
the user gets an "Install update" action that downloads the matching
zip, replaces the addon files in-place, and prompts for a Blender
restart (Python class cache makes a hot reload of new properties
unreliable).

Manifest schema (`addon-latest.json`):
    {
        "version":       "0.3.3-beta",       — display string
        "version_tuple": [0, 3, 3],          — comparison key
        "url":           "...zip",            — download URL (full)
        "notes":         "…",                 — short release note
        "pub_date":      "2026-05-09T…Z"      — ISO 8601 UTC
    }

The zip layout is expected to be a single top-level folder
`match_creator_addon/` containing the addon source. The folder name
must be a valid Python identifier (no hyphens) so Blender's
Install-from-Disk path can register it. Anything else gets extracted
as-is — keep the zip clean.

Network access uses `urllib.request` from the stdlib; no third-party
dependencies. Runs in foreground for now (the operations are short).
A background thread + modal-progress flow is straightforward to add
later if needed.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import urllib.error
import urllib.request
import zipfile
from typing import Optional

import bpy

# `Match-Creator` slug is hard-coded to the canonical repository. If we ever
# fork or rename, this is the only line to flip.
MANIFEST_URL = (
    "https://github.com/cemilbnr/Match-Creator/releases/latest/download/"
    "addon-latest.json"
)
RELEASES_PAGE_URL = "https://github.com/cemilbnr/Match-Creator/releases"

# Top-level folder name we expect inside the release zip. Must match the
# installed addon module name so `bpy.ops.preferences.addon_disable(module=…)`
# keeps working across the swap. Underscored — hyphens make Blender's
# Install-from-Disk silently swallow the package.
EXPECTED_ROOT_NAME = "match_creator_addon"

# Network deadline. Manifest is ~1 KB; zip is ~150 KB today. Both finish
# well under this on any reasonable connection.
HTTP_TIMEOUT_SEC = 15


# ---------- Module-level state (single addon instance, single user) ----------
# A simple dict keeps the Operator → Panel handoff straightforward without
# pulling another scene PointerProperty into the codebase. Reset on each
# `check_for_updates` call.
class _State:
    """Session-scoped updater state. Re-created on each Blender launch."""

    def __init__(self) -> None:
        self.last_check: Optional[str] = None  # ISO timestamp of last check
        self.status: str = "idle"  # idle | checking | up_to_date | available | downloading | installed | error
        self.message: str = ""  # human-readable detail for the UI
        self.available_version: Optional[str] = None
        self.available_url: Optional[str] = None
        self.available_notes: Optional[str] = None


state = _State()


# ---------- Version helpers --------------------------------------------------

def _parse_tuple(v) -> tuple[int, ...]:
    """Best-effort coercion of arbitrary JSON values to an int-tuple."""
    if isinstance(v, (list, tuple)):
        out: list[int] = []
        for x in v:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                out.append(0)
        return tuple(out)
    return (0,)


def _is_newer(remote: tuple[int, ...], local: tuple[int, ...]) -> bool:
    """Lexicographic compare with shorter tuple right-padded with zeros."""
    longest = max(len(remote), len(local))
    r = remote + (0,) * (longest - len(remote))
    l = local + (0,) * (longest - len(local))
    return r > l


def _current_version_tuple() -> tuple[int, ...]:
    """Pulls the live `ADDON_VERSION_TUPLE` from the package, falling back to
    the last known `bl_info["version"]` if anything import-related goes
    sideways."""
    try:
        # Lazy import: avoids circular import at addon-load time.
        from . import ADDON_VERSION_TUPLE  # type: ignore
        return tuple(int(x) for x in ADDON_VERSION_TUPLE)
    except Exception:  # noqa: BLE001
        try:
            from . import bl_info  # type: ignore
            return tuple(int(x) for x in bl_info.get("version", (0, 0, 0)))
        except Exception:  # noqa: BLE001
            return (0, 0, 0)


def _current_version_string() -> str:
    try:
        from . import ADDON_VERSION_STRING  # type: ignore
        return str(ADDON_VERSION_STRING)
    except Exception:  # noqa: BLE001
        v = _current_version_tuple()
        return ".".join(str(x) for x in v)


# ---------- Network ---------------------------------------------------------

def _fetch_manifest() -> dict:
    """Pull and parse the addon update manifest. Raises on any failure
    (RuntimeError with a human-readable message)."""
    req = urllib.request.Request(MANIFEST_URL, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GitHub returned HTTP {e.code}.") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Couldn't reach GitHub: {e.reason}.") from e
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Unexpected network error: {e}") from e
    # GitHub serves these without a BOM, but the desktop app's `latest.json`
    # has been hit by trailing UTF-8 BOMs in the past — strip if present
    # before parsing.
    if raw[:3] == b"\xef\xbb\xbf":
        raw = raw[3:]
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Manifest wasn't valid JSON: {e}") from e
    if not isinstance(manifest, dict):
        raise RuntimeError("Manifest must be a JSON object.")
    return manifest


def _download_to_temp(url: str) -> str:
    """Stream the zip into a temp file. Returns the absolute path."""
    fd, path = tempfile.mkstemp(prefix="mc_addon_", suffix=".zip")
    os.close(fd)
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC * 4) as resp, open(path, "wb") as out:
            shutil.copyfileobj(resp, out)
    except Exception:  # noqa: BLE001
        # Clean up the temp file on any failure so we don't litter %TEMP%.
        try:
            os.remove(path)
        except OSError:
            pass
        raise
    return path


# ---------- Install ----------------------------------------------------------

def _addon_install_root() -> str:
    """Absolute path to *this* addon's installed folder (the one being
    replaced). Resolved relative to `__file__` so bare-zip extracts and
    Blender-managed installs both work."""
    return os.path.dirname(os.path.abspath(__file__))


def _extract_zip_into_addons(zip_path: str) -> None:
    """Replace the addon's files with the contents of the downloaded zip.

    Layout assumption: zip contains a single top-level folder named
    `match_creator_addon/`. We extract into the *parent* of the current
    addon install location, which is the addons directory Blender reads
    from. Existing files are overwritten by `extractall` so updates land
    cleanly.
    """
    addon_root = _addon_install_root()
    addons_dir = os.path.dirname(addon_root)
    if not os.path.isdir(addons_dir):
        raise RuntimeError(f"Addons directory not found: {addons_dir}")

    with zipfile.ZipFile(zip_path) as zf:
        # Sanity check: top-level entry must be EXPECTED_ROOT_NAME (a file
        # directly named match_creator_addon/something).
        roots = {n.split("/", 1)[0] for n in zf.namelist() if n.strip()}
        if EXPECTED_ROOT_NAME not in roots:
            raise RuntimeError(
                f"Zip is missing the expected top-level folder "
                f"'{EXPECTED_ROOT_NAME}/'. Found: {sorted(roots)[:3]}"
            )
        zf.extractall(addons_dir)


# ---------- Public API used by operators -------------------------------------

def perform_check() -> tuple[bool, str]:
    """Run a synchronous version check.

    Returns (success, message). On success, populates module-level `state`
    with the result. On failure, sets state.status='error' and returns the
    error in `message`.
    """
    import datetime
    state.status = "checking"
    state.message = ""
    state.last_check = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        manifest = _fetch_manifest()
    except RuntimeError as e:
        state.status = "error"
        state.message = str(e)
        return False, str(e)

    remote_tuple = _parse_tuple(manifest.get("version_tuple", []))
    remote_str = str(manifest.get("version", "?"))
    url = manifest.get("url")
    notes = str(manifest.get("notes", ""))[:280]

    if not url:
        state.status = "error"
        state.message = "Manifest didn't carry a download URL."
        return False, state.message

    local_tuple = _current_version_tuple()
    if _is_newer(remote_tuple, local_tuple):
        state.status = "available"
        state.available_version = remote_str
        state.available_url = url
        state.available_notes = notes
        state.message = f"Update available: {remote_str}."
        return True, state.message

    state.status = "up_to_date"
    state.available_version = None
    state.available_url = None
    state.available_notes = None
    state.message = f"You're on the latest version ({_current_version_string()})."
    return True, state.message


def perform_install() -> tuple[bool, str]:
    """Download the staged update zip and extract over the current install.

    The user must restart Blender afterward — Python doesn't reliably reload
    classes / properties for an addon that's already been registered, so we
    let Blender handle the bootstrap on next launch.
    """
    if not state.available_url:
        state.status = "error"
        state.message = "No staged update — run Check for updates first."
        return False, state.message

    state.status = "downloading"
    state.message = "Downloading…"
    try:
        zip_path = _download_to_temp(state.available_url)
    except Exception as e:  # noqa: BLE001
        state.status = "error"
        state.message = f"Download failed: {e}"
        return False, state.message

    try:
        _extract_zip_into_addons(zip_path)
    except Exception as e:  # noqa: BLE001
        state.status = "error"
        state.message = f"Extract failed: {e}"
        # Best-effort cleanup of the half-applied download.
        try:
            os.remove(zip_path)
        except OSError:
            pass
        return False, state.message

    try:
        os.remove(zip_path)
    except OSError:
        pass

    state.status = "installed"
    state.message = (
        f"Installed {state.available_version}. Restart Blender to finish."
    )
    return True, state.message


# ---------- Operators -------------------------------------------------------

class MATCH3_OT_check_updates(bpy.types.Operator):
    bl_idname = "match3.check_updates"
    bl_label = "Check for updates"
    bl_description = (
        "Check GitHub for a newer Match Creator addon release. Compares the "
        "installed version with the latest published manifest."
    )
    bl_options = {"REGISTER"}

    def execute(self, context):
        ok, msg = perform_check()
        if ok:
            self.report({"INFO"}, msg)
            return {"FINISHED"}
        self.report({"ERROR"}, msg)
        return {"CANCELLED"}


class MATCH3_OT_install_update(bpy.types.Operator):
    bl_idname = "match3.install_update"
    bl_label = "Install update"
    bl_description = (
        "Download the staged Match Creator addon update and replace the "
        "current install. You'll need to restart Blender afterward."
    )
    bl_options = {"REGISTER"}

    @classmethod
    def poll(cls, context):
        return state.status == "available" and bool(state.available_url)

    def execute(self, context):
        ok, msg = perform_install()
        if ok:
            self.report({"INFO"}, msg)
            return {"FINISHED"}
        self.report({"ERROR"}, msg)
        return {"CANCELLED"}


class MATCH3_OT_open_releases_page(bpy.types.Operator):
    bl_idname = "match3.open_releases_page"
    bl_label = "Open releases page"
    bl_description = "Open the GitHub Releases page in your browser."
    bl_options = {"REGISTER"}

    def execute(self, context):
        bpy.ops.wm.url_open(url=RELEASES_PAGE_URL)
        return {"FINISHED"}
