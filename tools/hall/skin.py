"""The skin: the Blender skeleton, repainted by Higgsfield and wrapped back onto the room.

    python3 skin.py views            -> renders/<view>.png (what Higgsfield repaints) and renders/<view>_pos.exr + views.json
    python3 skin.py atlas            -> hall_skin.blend with an atlas UV, and atlas_pos.exr / atlas_nrm.exr / atlas_base.png
    python3 skin.py project          -> skin.jpg: every painted view projected onto the atlas (paint/<view>.png)
    python3 skin.py export           -> public/portal-art/hall.glb with the room wearing skin.jpg

How the projection works: each atlas texel knows where it is in the room (a baked position map) and which way it faces.
For every painted view, a texel takes the painted colour at the pixel it lands on, but only if that pixel really shows it
(the view's own position render agrees within a few centimetres) and weighted by how squarely and how closely the view
sees it. Texels no view sees keep the baked light. Run hall.py build and hall.py bake first.
"""
import bpy
import numpy as np, math, os, sys, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hall

R = os.path.join(HERE, "renders"); PAINT = os.path.join(HERE, "paint")
W, H = 1536, 864
ATLAS = 4096

# eye -> target, in Blender metres (the hall runs along +y). Close views carry detail; wide ones fill in.
VIEWS = {
    "entrance": ((0, -0.2, 2.1), (0, 14, 1.0), 24),
    "reverse": ((0, 25.5, 2.7), (0, 2, 1.1), 24),
    "left": ((2.6, 12.5, 2.4), (-5, 12.5, 0.9), 22),
    "right": ((-2.6, 12.5, 2.4), (5, 12.5, 0.9), 22),
    "welcome": ((0, 9.5, 2.5), (0, 2.5, 1.3), 22),
    "comms": ((0.6, 16.2, 2.3), (-5.2, 22.4, 0.9), 24),
    "exit": ((0, 16.0, 3.0), (6, 23.5, 2.4), 24),
    "tools": ((0, 20.6, 2.2), (0, 27.5, 2.4), 26),
    "desk_l": ((-4.6, 4.6, 1.75), (-3.4, 7.2, 1.15), 26),
    "desk_r": ((4.6, 4.6, 1.75), (3.4, 7.2, 1.15), 26),
    "front": ((-0.8, 6.8, 2.1), (-5.6, 3.4, 1.0), 24),
    "meter": ((0.9, 6.8, 2.3), (5.3, 3.4, 1.9), 24),
    "loft": ((1.2, 20.6, 4.6), (5.0, 25.4, 3.8), 24),
}

def cam_for(S, name):
    eye, tgt, lens = VIEWS[name]
    c = bpy.data.cameras.new(name); c.lens = lens; c.sensor_width = 36; c.sensor_fit = 'HORIZONTAL'
    o = bpy.data.objects.new(name, c); S.collection.objects.link(o)
    o.location = Vector(eye); o.rotation_euler = (Vector(tgt) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    return o

def views():
    os.makedirs(R, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=hall.BLEND)
    S = bpy.context.scene; S.render.resolution_x = W; S.render.resolution_y = H; S.render.resolution_percentage = 100
    for n in ("door_l", "door_r"):  # open, so the painter sees into the lift
        o = bpy.data.objects.get(n)
        if o: o.location.x += (-1 if n.endswith("l") else 1) * 2.15
    meta = {}
    only = sys.argv[2:] or list(VIEWS)
    for name in only:
        cam = cam_for(S, name); S.camera = cam
        # the picture to repaint
        S.cycles.samples = 16; S.cycles.use_denoising = True; S.render.filter_size = 1.5
        S.view_settings.view_transform = 'AgX'; S.render.image_settings.file_format = 'PNG'
        S.render.filepath = os.path.join(R, name + ".png"); bpy.ops.render.render(write_still=True)
        meta[name] = {"matrix": [list(r) for r in cam.matrix_world], "lens": cam.data.lens, "sensor": cam.data.sensor_width, "w": W, "h": H}
        print("rendered", name, flush=True)
    old = {}
    if os.path.exists(os.path.join(R, "views.json")): old = json.load(open(os.path.join(R, "views.json")))
    old.update(meta); json.dump(old, open(os.path.join(R, "views.json"), "w"), indent=1)
    # where every pixel is in the room: one sample, no smoothing, position as the colour
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nt = m.node_tree; out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        g = nt.nodes.new("ShaderNodeNewGeometry"); e = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(g.outputs["Position"], e.inputs["Color"]); nt.links.new(e.outputs[0], out.inputs["Surface"])
    S.world = None
    S.cycles.samples = 1; S.cycles.use_denoising = False; S.render.filter_size = 0.01
    S.view_settings.view_transform = 'Standard'; S.render.image_settings.file_format = 'OPEN_EXR'; S.render.image_settings.color_depth = '32'
    for name in only:
        S.camera = bpy.data.objects[name]; S.render.filepath = os.path.join(R, name + "_pos.exr"); bpy.ops.render.render(write_still=True)
        print("positions", name, flush=True)

def atlas():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "hall_baked.blend"))
    S = bpy.context.scene; Rm = bpy.data.objects["room"]
    for o in bpy.data.objects: o.select_set(False)
    Rm.select_set(True); bpy.context.view_layer.objects.active = Rm
    for u in [u for u in Rm.data.uv_layers]: Rm.data.uv_layers.remove(u)  # bake goes to the render-active map: leave only ours
    uv = Rm.data.uv_layers.new(name="skin"); Rm.data.uv_layers.active = uv; uv.active_render = True
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0015, area_weight=0.0, scale_to_bounds=False)
    # spend the pixels where people look: clouds and leaves are soft and far, the floor and furniture are close
    weight = {"cloud": 0.3, "mint": 0.7, "trunk": 0.7, "pearl": 1.15, "lav": 1.15}
    names = [s.material.name if s.material else "" for s in Rm.material_slots]
    bpy.ops.object.mode_set(mode='OBJECT')
    me = Rm.data; luv = me.uv_layers["skin"].data  # fetch again: switching mode invalidates the old handle
    co = np.empty(len(luv) * 2, np.float32); luv.foreach_get("uv", co); co = co.reshape(-1, 2)
    mi = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("material_index", mi)
    ls = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("loop_total", lt)
    kpoly = np.array([weight.get(n, 1.0) for n in names] + [1.0], np.float32)[np.minimum(mi, len(names))]
    co *= np.repeat(kpoly, lt)[:, None]
    luv.foreach_set("uv", co.ravel())
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0015, scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    S.cycles.samples = 1; S.render.bake.margin = 4; S.render.bake.target = 'IMAGE_TEXTURES'
    def bake_emit(fn, link):
        img = bpy.data.images.new(fn, ATLAS, ATLAS, alpha=False, float_buffer=True)
        m = bpy.data.materials.new("bake_" + fn); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial"); e = nt.nodes.new("ShaderNodeEmission"); nt.links.new(e.outputs[0], out.inputs["Surface"])
        link(nt, e.inputs["Color"])
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; nt.nodes.active = t
        Rm.data.materials.clear(); Rm.data.materials.append(m)
        bpy.ops.object.bake(type='EMIT', margin=4)
        # raw floats straight from memory: Image.save() would run them through the view transform (AgX) and wreck them
        a = np.empty(ATLAS * ATLAS * 4, np.float32); img.pixels.foreach_get(a)
        np.save(os.path.join(HERE, fn + ".npy"), a.reshape(ATLAS, ATLAS, 4)[::-1, :, :3].copy())  # top row first, like any picture
        print("baked", fn, flush=True)
    def geo(socket):
        def f(nt, inp): g = nt.nodes.new("ShaderNodeNewGeometry"); nt.links.new(g.outputs[socket], inp)
        return f
    def light(nt, inp): a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "light"; nt.links.new(a.outputs[0], inp)
    bake_emit("atlas_pos", geo("Position")); bake_emit("atlas_nrm", geo("Normal")); bake_emit("atlas_light", light)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "hall_skin.blend"))
    print("atlas ready")

def export(jpg=os.path.join(HERE, "skin.jpg")):
    """The room wearing the skin (one mesh, one picture), plus everything live and the marks, as public/portal-art/hall.glb."""
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "hall_skin.blend"))
    Rm = bpy.data.objects["room"]
    img = bpy.data.images.load(jpg)
    m = bpy.data.materials.new("room_skin"); m.use_nodes = True; nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "skin"
    nt.links.new(uvn.outputs[0], t.inputs[0]); nt.links.new(t.outputs[0], nt.nodes["Principled BSDF"].inputs["Base Color"])
    Rm.data.materials.clear(); Rm.data.materials.append(m)
    for u in [u for u in Rm.data.uv_layers if u.name != "skin"]: Rm.data.uv_layers.remove(u)
    for a in list(Rm.data.color_attributes): Rm.data.color_attributes.remove(a)
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.export_scene.gltf(filepath=hall.OUT, export_format='GLB', export_extras=True, export_apply=True, export_image_format='JPEG',
                              export_jpeg_quality=86, export_cameras=False, export_lights=False)
    print("exported", hall.OUT, os.path.getsize(hall.OUT))

if __name__ == "__main__":
    {"views": views, "atlas": atlas, "export": export}[sys.argv[1]]()
