bl_info = {
    "name": "Match-3 Animator",
    "author": "cEMİL",
    "version": (0, 2, 0),
    "blender": (4, 2, 0),
    "location": "3D View Header + N-Panel > Match-3",
    "description": "Receives match-3 gameplay variants from the Match Creator desktop app and animates them.",
    "category": "Animation",
}

import bpy

from . import preferences
from .ui import panel
from .operators import server_ops

_classes = (
    preferences.Match3Preferences,
    server_ops.MATCH3_OT_start_server,
    server_ops.MATCH3_OT_stop_server,
    server_ops.MATCH3_OT_launch_creator,
    panel.MATCH3_PT_main_panel,
)


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    # prepend so the button lands on the LEFT side of the viewport header,
    # well clear of the selectability / gizmo cluster on the right.
    bpy.types.VIEW3D_HT_header.prepend(panel.draw_view3d_header)


def unregister():
    from .server import http_server
    if http_server.is_running():
        http_server.stop_server()

    # Headers are shared globals; guard against double-remove.
    try:
        bpy.types.VIEW3D_HT_header.remove(panel.draw_view3d_header)
    except (ValueError, AttributeError):
        pass

    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
