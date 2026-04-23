import bpy
from bpy.props import IntProperty, StringProperty, BoolProperty


class Match3Preferences(bpy.types.AddonPreferences):
    bl_idname = __package__

    port: IntProperty(
        name="HTTP Port",
        description="Base port for the local HTTP server. If busy, the next 5 ports are tried.",
        default=17654,
        min=1024,
        max=65535,
    )

    default_fps: IntProperty(
        name="Default FPS",
        description="Default FPS for newly created boards.",
        default=30,
        min=1,
        max=240,
    )

    autostart_server: BoolProperty(
        name="Autostart server on addon load",
        description="If enabled, the HTTP server starts automatically when Blender loads.",
        default=False,
    )

    asset_blend: StringProperty(
        name="Asset .blend",
        description=(
            "Optional .blend file with your own MC_Tile / MC_Tileback objects "
            "and MC_Material_<Color> materials. Leave blank to use the built-in "
            "procedural placeholders."
        ),
        default="",
        subtype='FILE_PATH',
    )

    app_path: StringProperty(
        name="Match Creator Exe",
        description=(
            "Override for the Match Creator executable. Leave blank to auto-detect "
            "(checks %LOCALAPPDATA%\\Programs\\Match Creator and %PROGRAMFILES%\\Match Creator)."
        ),
        default="",
        subtype='FILE_PATH',
    )

    def draw(self, context):
        layout = self.layout
        col = layout.column()
        col.prop(self, "port")
        col.prop(self, "default_fps")
        col.prop(self, "autostart_server")
        col.prop(self, "asset_blend")
        col.prop(self, "app_path")


def get(context=None) -> "Match3Preferences":
    ctx = context or bpy.context
    return ctx.preferences.addons[__package__].preferences
