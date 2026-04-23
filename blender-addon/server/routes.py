"""REST routes for the local HTTP API.

  GET  /api/health           — { ok, blenderVersion, blendFile, blendFileName }
  POST /api/gameplay         — body: BlenderExport payload; builds or updates
                                a gameplay variant collection in the scene.

Non-API paths return 404. The UI is the standalone Match Creator desktop
app (Tauri); the addon does not host any static files.
"""

from __future__ import annotations

import json
import os

import bpy

from . import http_server
from ..core import gameplay_builder


ALLOWED_ORIGINS = frozenset(
    {
        # Vite dev server
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Tauri v2 webview on macOS / Linux (+ Windows secure context fallback)
        "tauri://localhost",
        "https://tauri.localhost",
        # Tauri v2 webview on Windows (WebView2 custom protocol)
        "http://tauri.localhost",
    }
)

# Some WebView2 builds send no Origin header for same-host fetches. For the
# health/gameplay API — which only binds to 127.0.0.1 anyway — we accept the
# empty origin and reflect a safe wildcard so the desktop app can still talk
# to us. Actual network exposure is blocked by the HTTPServer bind address.
_ALLOW_MISSING_ORIGIN = True


def _cors_origin(handler) -> str | None:
    origin = handler.headers.get("Origin")
    if origin is None or origin == "":
        return "*" if _ALLOW_MISSING_ORIGIN else None
    if origin in ALLOWED_ORIGINS:
        return origin
    return None


def _apply_cors(handler) -> None:
    origin = _cors_origin(handler)
    if origin is not None:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")


def handle(handler, method: str) -> None:
    path = handler.path.split("?", 1)[0]
    if path.startswith("/api/"):
        _handle_api(handler, method, path)
        return
    _send_json(handler, 404, {"error": f"Not found: {method} {path}"})


def _handle_api(handler, method: str, path: str) -> None:
    try:
        if method == "OPTIONS":
            handler.send_response(204)
            _apply_cors(handler)
            handler.send_header(
                "Access-Control-Allow-Methods", "GET, POST, OPTIONS"
            )
            handler.send_header(
                "Access-Control-Allow-Headers", "Content-Type"
            )
            handler.send_header("Access-Control-Max-Age", "86400")
            handler.end_headers()
            return

        if method == "GET" and path == "/api/health":
            info = http_server.submit_to_main(_collect_health)
            _send_json(handler, 200, info)
            return

        if method == "POST" and path == "/api/gameplay":
            payload = _read_json_body(handler)
            summary = http_server.submit_to_main(
                lambda: gameplay_builder.build_or_update(payload)
            )
            _send_json(handler, 200, summary)
            return

        _send_json(handler, 404, {"error": f"Not found: {method} {path}"})
    except json.JSONDecodeError:
        _send_json(handler, 400, {"error": "Invalid JSON body"})
    except ValueError as e:
        _send_json(handler, 400, {"error": str(e)})
    except Exception as e:  # noqa: BLE001
        _send_json(handler, 500, {"error": f"{type(e).__name__}: {e}"})


def _collect_health() -> dict:
    """Runs on the Blender main thread (bpy must be touched here only)."""
    blend_path = bpy.data.filepath or ""
    return {
        "ok": True,
        "blenderVersion": bpy.app.version_string,
        "blendFile": blend_path,
        "blendFileName": os.path.basename(blend_path) if blend_path else "(unsaved)",
    }


def _read_json_body(handler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def _send_json(handler, status: int, data) -> None:
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    _apply_cors(handler)
    handler.end_headers()
    handler.wfile.write(body)
