import os

import bpy
from bpy.props import IntProperty, StringProperty, BoolProperty


# Bundled default asset shipped inside the addon. Resolved relative to this
# file so it survives installs to any addons directory. The default
# MC_Assets.blend lives at <addon>/assets/MC_Assets.blend.
_BUNDLED_ASSET_RELPATH = os.path.join("assets", "MC_Assets.blend")


def bundled_asset_path() -> str:
    """Absolute path to the addon's built-in MC_Assets.blend."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, _BUNDLED_ASSET_RELPATH)


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

    # ---- Asset set ----------------------------------------------------------
    # The addon ships with a built-in MC_Assets.blend (under <addon>/assets/).
    # When `use_custom_assets` is False (default), `effective_asset_blend()`
    # returns that bundled file. When True, it returns whatever the user
    # pointed `asset_blend` at — empty string means "fall back to bundled".

    use_custom_assets: BoolProperty(
        name="Use custom asset set",
        description=(
            "When off (default), the addon uses the bundled MC_Assets.blend "
            "shipped inside the addon. Turn on to point at your own .blend "
            "with MC_Tile / MC_Tileback / MC_Material_<Color>."
        ),
        default=False,
    )

    asset_blend: StringProperty(
        name="Custom asset .blend",
        description=(
            "Path to a .blend file with your own MC_Tile / MC_Tileback objects "
            "and MC_Material_<Color> materials. Only used when "
            "'Use custom asset set' is enabled."
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

    # ---- Helpers ------------------------------------------------------------

    def effective_asset_blend(self) -> str:
        """Resolve which .blend to load tiles/materials from.

        Selection rules, in order:
          1. `use_custom_assets` is on AND `asset_blend` points at an existing
             file → return that path.
          2. Bundled asset exists → return it.
          3. Empty string → caller falls back to procedural placeholders.
        """
        if self.use_custom_assets:
            custom = bpy.path.abspath(self.asset_blend) if self.asset_blend else ""
            if custom and os.path.isfile(custom):
                return custom
        bundled = bundled_asset_path()
        if os.path.isfile(bundled):
            return bundled
        return ""

    def draw(self, context):
        layout = self.layout
        col = layout.column()
        col.prop(self, "port")
        col.prop(self, "default_fps")
        col.prop(self, "autostart_server")

        # Asset set group — toggle gates the path field so it's obvious that
        # the bundled asset is the default.
        box = layout.box()
        box.label(text="Asset set", icon='ASSET_MANAGER')
        box.prop(self, "use_custom_assets")
        sub = box.column()
        sub.enabled = self.use_custom_assets
        sub.prop(self, "asset_blend")
        # Show the resolved bundled-asset path as a hint when not overridden.
        if not self.use_custom_assets:
            bundled = bundled_asset_path()
            label = os.path.basename(bundled) if os.path.isfile(bundled) else "MC_Assets.blend (missing!)"
            row = box.row()
            row.enabled = False
            row.label(text=f"Using bundled: {label}", icon='CHECKMARK' if os.path.isfile(bundled) else 'ERROR')

        layout.prop(self, "app_path")


def get(context=None) -> "Match3Preferences":
    ctx = context or bpy.context
    return ctx.preferences.addons[__package__].preferences
