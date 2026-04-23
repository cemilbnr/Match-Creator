import json
import os
import subprocess
import tempfile
import time

import bpy

from .. import preferences
from ..server import http_server


class MATCH3_OT_start_server(bpy.types.Operator):
    bl_idname = "match3.start_server"
    bl_label = "Start Server"
    bl_description = "Start the local HTTP server that the Match Creator desktop app connects to."

    def execute(self, context):
        prefs = preferences.get(context)
        try:
            port = http_server.start_server(start_port=prefs.port)
        except OSError as e:
            self.report({'ERROR'}, f"Could not bind any port near {prefs.port}: {e}")
            return {'CANCELLED'}
        self.report({'INFO'}, f"Match-3 server running on http://localhost:{port}")
        return {'FINISHED'}


class MATCH3_OT_stop_server(bpy.types.Operator):
    bl_idname = "match3.stop_server"
    bl_label = "Stop Server"
    bl_description = "Stop the local HTTP server."

    def execute(self, context):
        http_server.stop_server()
        self.report({'INFO'}, "Match-3 server stopped.")
        return {'FINISHED'}


class MATCH3_OT_launch_creator(bpy.types.Operator):
    bl_idname = "match3.launch_creator"
    bl_label = "Match Creator"
    bl_description = (
        "Start the HTTP server if needed, write a session file describing this "
        "Blender project, and launch the Match Creator desktop app."
    )

    def execute(self, context):
        prefs = preferences.get(context)

        # 1) Ensure server is running.
        try:
            port = http_server.start_server(start_port=prefs.port)
        except OSError as e:
            self.report({'ERROR'}, f"Could not bind any port near {prefs.port}: {e}")
            return {'CANCELLED'}

        # 2) Write session.json atomically so Match Creator can find us.
        blend_path = bpy.data.filepath or ""
        blend_name = os.path.basename(blend_path) if blend_path else "(unsaved)"
        session = {
            "blendFile": blend_path,
            "blendFileName": blend_name,
            "blenderPid": os.getpid(),
            "port": port,
            "startedAt": int(time.time()),
        }
        session_path = _session_file_path()
        try:
            _atomic_write_json(session_path, session)
        except OSError as e:
            self.report({'ERROR'}, f"Could not write session file: {e}")
            return {'CANCELLED'}

        # 3) Spawn the exe. In dev (no MSI installed) skip spawn and tell the
        #    user so they can start the dev server manually.
        exe = _resolve_app_path(prefs)
        if not exe:
            self.report(
                {'WARNING'},
                "Match Creator exe not found. Session written — open the app "
                "manually or set Preferences → Match Creator Exe.",
            )
            return {'FINISHED'}

        try:
            subprocess.Popen(
                [exe],
                close_fds=True,
                creationflags=getattr(subprocess, 'DETACHED_PROCESS', 0),
            )
        except OSError as e:
            self.report({'ERROR'}, f"Could not launch Match Creator: {e}")
            return {'CANCELLED'}

        self.report({'INFO'}, f"Launched Match Creator for {blend_name}")
        return {'FINISHED'}


# --------------------------------------------------------------------------
# Session file helpers
# --------------------------------------------------------------------------


def _session_dir() -> str:
    # On Windows %APPDATA% points at Roaming; match what the Tauri side reads.
    appdata = os.environ.get('APPDATA') or tempfile.gettempdir()
    return os.path.join(appdata, 'Match Creator')


def _session_file_path() -> str:
    return os.path.join(_session_dir(), 'session.json')


def _atomic_write_json(path: str, payload: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _resolve_app_path(prefs) -> str:
    candidates = [
        prefs.app_path,
        os.path.join(
            os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Match Creator', 'Match Creator.exe'
        ),
        os.path.join(
            os.environ.get('PROGRAMFILES', ''), 'Match Creator', 'Match Creator.exe'
        ),
        os.path.join(
            os.environ.get('PROGRAMFILES(X86)', ''), 'Match Creator', 'Match Creator.exe'
        ),
    ]
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    return ''
