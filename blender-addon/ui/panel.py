import bpy

from ..server import http_server


class MATCH3_PT_main_panel(bpy.types.Panel):
    bl_label = "Match-3 Animator"
    bl_idname = "MATCH3_PT_main_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Match-3"

    def draw(self, context):
        layout = self.layout

        box = layout.box()
        box.label(text="Server", icon='WORLD')
        if http_server.is_running():
            box.label(text=f"Running on port {http_server.get_port()}", icon='CHECKMARK')
            box.operator("match3.stop_server", icon='PAUSE')
        else:
            box.label(text="Stopped", icon='X')
            box.operator("match3.start_server", icon='PLAY')

        box = layout.box()
        box.label(text="Match Creator", icon='WINDOW')
        box.operator("match3.launch_creator", icon='WINDOW', text="Launch Match Creator")
        box.label(text="Opens the desktop app bound to this .blend.", icon='INFO')


def draw_view3d_header(self, context):
    """Injected into `VIEW3D_HT_header` so every 3D viewport header carries a
    one-click entry point to Match Creator."""
    layout = self.layout
    layout.separator(factor=0.5)
    layout.operator("match3.launch_creator", text="Match Creator", icon='WINDOW')
