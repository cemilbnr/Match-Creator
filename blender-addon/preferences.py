import os

import bpy
from bpy.props import BoolProperty, FloatProperty, IntProperty, StringProperty


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

    # ---- Animation tuning ---------------------------------------------------
    # Swap dip = the Y-axis offset the dragged tile travels to during a swap.
    # Negative values draw the tile toward the standard Blender front-view
    # camera (which sits on the −Y side), making it pass *over* its partner
    # during the cross. The export sends a non-zero `dip` flag for swap
    # keyframes; the addon substitutes this preference value at write time so
    # the user can tune the arc depth without re-exporting from the desktop
    # app. Set to 0.0 to disable the dip entirely (flat swap).

    swap_dip_y: FloatProperty(
        name="Swap dip (Y)",
        description=(
            "Y-axis offset applied to the dragged tile at the peak of a swap. "
            "Negative values lift the tile toward the −Y front-view camera "
            "so it draws on top of its partner during the cross. Set to 0 "
            "for a flat swap with no arc."
        ),
        default=-0.14,
        min=-1.0,
        max=1.0,
        soft_min=-0.5,
        soft_max=0.5,
        step=1,
        precision=3,
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

        # Animation tuning group — visually distinct so the dip control
        # doesn't get lost between server and asset settings.
        anim_box = layout.box()
        anim_box.label(text="Animation", icon='ANIM')
        anim_box.prop(self, "swap_dip_y")

        # Updates panel — version display + check / install actions. Mirrors
        # the desktop app's "Check for updates" UI so the addon stays in
        # lockstep with Match Creator without manual zip dragging.
        self._draw_updates(layout)

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

    # ---- Updates panel ------------------------------------------------------

    def _draw_updates(self, layout) -> None:
        """Render the addon-updater UI. State lives on the `updater` module
        (process-scoped). Status icons + messaging mirror the desktop app's
        update banner so a user familiar with one feels at home in the
        other."""
        # Lazy import: avoids a circular import at module load time when the
        # addon is partially registered.
        from . import ADDON_VERSION_STRING, updater  # type: ignore

        box = layout.box()
        row = box.row()
        row.label(text="Updates", icon='URL')
        row.label(text=f"Installed: {ADDON_VERSION_STRING}")

        st = updater.state

        # Status row — colour + icon hint at the kind of feedback. Empty
        # message = idle; we still draw the row so the layout doesn't jump.
        if st.status == "checking" or st.status == "downloading":
            box.label(text=st.message or "Working…", icon='SORTTIME')
        elif st.status == "available":
            avail = st.available_version or "?"
            box.label(text=f"Update available: {avail}", icon='IMPORT')
            if st.available_notes:
                # Wrap long release notes by drawing into a sub-column with
                # the parent's full width — Blender does the wrap automatically.
                sub = box.column()
                sub.scale_y = 0.85
                for line in _wrap_lines(st.available_notes, width=78):
                    sub.label(text=line)
        elif st.status == "up_to_date":
            box.label(text=st.message or "You're on the latest version.", icon='CHECKMARK')
        elif st.status == "installed":
            box.label(text=st.message or "Installed. Restart Blender.", icon='FILE_REFRESH')
        elif st.status == "error":
            box.label(text=st.message or "Update check failed.", icon='ERROR')
        else:
            box.label(text="No update check yet.", icon='QUESTION')

        # Action row — Check is always available; Install only when staged.
        actions = box.row(align=True)
        actions.operator("match3.check_updates", icon='FILE_REFRESH')
        op_install = actions.operator("match3.install_update", icon='IMPORT')
        # Disable the install button if we're not actually staged.
        if st.status != "available":
            actions.enabled = True  # leave Check enabled
            # Greying just the install op requires splitting the row; keep
            # this simple — the operator's poll() short-circuits actual
            # invocation, and Blender renders it as disabled automatically.
            del op_install
        actions.operator("match3.open_releases_page", icon='URL')

        if st.last_check:
            footer = box.row()
            footer.enabled = False
            footer.label(text=f"Last checked: {st.last_check}")


def _wrap_lines(text: str, width: int = 80) -> list[str]:
    """Tiny word-wrapper used by the release-notes display. Blender's
    layout doesn't wrap labels, so we split here. Strips obvious noise
    (`\\n`, double spaces) on the way through."""
    if not text:
        return []
    flat = " ".join(text.split())
    out: list[str] = []
    while len(flat) > width:
        cut = flat.rfind(" ", 0, width)
        if cut <= 0:
            cut = width
        out.append(flat[:cut].rstrip())
        flat = flat[cut:].lstrip()
    if flat:
        out.append(flat)
    return out


def get(context=None) -> "Match3Preferences":
    ctx = context or bpy.context
    return ctx.preferences.addons[__package__].preferences
