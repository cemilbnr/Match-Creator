"""Threaded HTTP server with a main-thread work queue.

All bpy calls MUST be marshalled through submit_to_main() because Blender's
Python API is not thread-safe. See ARCHITECTURE.md §3.2.
"""

from __future__ import annotations

import queue
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

import bpy

_server: ThreadingHTTPServer | None = None
_thread: threading.Thread | None = None
_port: int | None = None
_work_queue: "queue.Queue" = queue.Queue()


def submit_to_main(fn, timeout: float = 10.0):
    """Post a callable to the main thread and block for its result.

    Safe to call from any HTTP handler thread. Raises whatever fn raises.
    """
    done = threading.Event()
    result: dict = {}

    def wrapper():
        try:
            result["value"] = fn()
        except BaseException as e:  # noqa: BLE001
            result["error"] = e
        finally:
            done.set()

    _work_queue.put(wrapper)
    if not done.wait(timeout=timeout):
        raise RuntimeError("Timed out waiting for Blender main thread.")
    if "error" in result:
        raise result["error"]
    return result.get("value")


def _drain_queue():
    # Executed by bpy.app.timers on the main thread.
    drained = 0
    while True:
        try:
            work = _work_queue.get_nowait()
        except queue.Empty:
            break
        try:
            work()
        except Exception as e:  # noqa: BLE001
            print(f"[match3] main-thread work raised: {e!r}")
        drained += 1
        if drained >= 32:
            # Yield back to Blender if the queue is flooded.
            break
    return 0.05  # re-register in 50ms


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        from . import routes
        routes.handle(self, "GET")

    def do_POST(self):  # noqa: N802
        from . import routes
        routes.handle(self, "POST")

    def do_PUT(self):  # noqa: N802
        from . import routes
        routes.handle(self, "PUT")

    def do_DELETE(self):  # noqa: N802
        from . import routes
        routes.handle(self, "DELETE")

    def do_OPTIONS(self):  # noqa: N802
        from . import routes
        routes.handle(self, "OPTIONS")

    def log_message(self, format, *args):  # noqa: A002
        # Silence the default stderr logging.
        return


def start_server(start_port: int = 8765, tries: int = 6) -> int:
    """Start the server, trying successive ports if the first is busy."""
    global _server, _thread, _port
    if _server is not None:
        return _port  # type: ignore[return-value]

    last_err: OSError | None = None
    for candidate in range(start_port, start_port + tries):
        try:
            _server = ThreadingHTTPServer(("127.0.0.1", candidate), _Handler)
            _port = candidate
            break
        except OSError as e:
            last_err = e
            continue
    if _server is None:
        assert last_err is not None
        raise last_err

    _thread = threading.Thread(target=_server.serve_forever, name="match3-http", daemon=True)
    _thread.start()

    if not bpy.app.timers.is_registered(_drain_queue):
        bpy.app.timers.register(_drain_queue, persistent=True)

    return _port  # type: ignore[return-value]


def stop_server() -> None:
    global _server, _thread, _port
    if _server is None:
        return
    _server.shutdown()
    _server.server_close()
    _server = None
    _thread = None
    _port = None
    if bpy.app.timers.is_registered(_drain_queue):
        try:
            bpy.app.timers.unregister(_drain_queue)
        except ValueError:
            pass


def is_running() -> bool:
    return _server is not None


def get_port() -> int | None:
    return _port
