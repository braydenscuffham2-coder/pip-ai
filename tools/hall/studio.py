"""Builds the Pip Portal office: a bright white studio, from the elevator to the tool wall.

    python3 studio.py build            -> studio.blend
    python3 studio.py view EYE TARGET OUT [res]   -> a quick Cycles look at the room
    python3 studio.py bake [samples]   -> studio_baked.blend (the room, one desk and one tool device, light baked per vertex)
    python3 studio.py export           -> public/portal-art/office.glb

Look: the marketplace's studio. Matte warm-white walls and furniture, light oak, sage plants, soft daylight through a
window wall on the left, light slots in a white ceiling, aqua only as a tiny accent. Stylised, not photoreal.

What's baked and what isn't:
  room    - the shell and everything that never moves (walls, windows, sky, ceiling, reception, plants, sofa, comms nook)
  desk    - ONE desk with its chair, monitor, keyboard, mug and lamp, built at the origin. The page places a copy per
            teammate (two rows, each turned 25 degrees toward the entrance), mirrored on the right-hand row.
  device  - ONE tool device for the tool wall; the page puts one in each slot.
  live    - things that move or change: elevator doors, the desk screen, lamp glow, device light, the meter dial.
  marks   - empties: where things happen (desk_seat, desk_mon, slot_N, cam_arrive, ...)

Units are metres. Blender axes: x across (window wall at x=-8), y from the elevator (y=0) to the tool wall (y=24), z up.
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hall
from hall import rbox, sphere, cyl, empty, put, finish, coll, hexc, densify

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "studio.blend"); BAKED = os.path.join(HERE, "studio_baked.blend")
OUT = os.path.join(HERE, "..", "..", "public", "portal-art", "office.glb")
W, L, H = 8.0, 24.0, 4.2          # half width, length, ceiling
M = hall.M

def mat(name, color, rough=0.5, emit=None, es=0.0, coat=0.0):
    return hall.mat(name, color, rough, emit, es, coat)

def plane(name, size, loc, m, c, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (size[0], size[1], 1); bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, c, smooth=False)

def sky_mat():
    m = bpy.data.materials.new("sky"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); em = nt.nodes.new("ShaderNodeEmission")
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0]); nt.links.new(sep.outputs["Y"], ramp.inputs[0])
    e = ramp.color_ramp.elements; e[0].position = 0.0; e[0].color = hexc('#fbfcfe'); e[1].position = 1.0; e[1].color = hexc('#c9dcf3')
    nt.links.new(ramp.outputs[0], em.inputs[0]); em.inputs[1].default_value = 2.2; nt.links.new(em.outputs[0], out.inputs[0])
    m["hex"] = "#e6eef9"; m["emit"] = "#e6eef9"; m["es"] = 2.2; M["sky"] = m; return m

def materials():
    mat('floor', '#e8e2d9', 0.32); mat('wall', '#f7f5f1', 0.7); mat('peach', '#f2d6c2', 0.8); mat('mint', '#cde6df', 0.8); mat('coffee', '#3a3633', 0.4); mat('ceil', '#fafaf8', 0.8); mat('white', '#f8f8f6', 0.45)
    mat('oak', '#e2c7a2', 0.55); mat('fabric', '#dfe1e4', 0.9); mat('rug', '#e9e7e3', 0.95); mat('metal', '#d6d9de', 0.3)
    mat('sage', '#a8c8a2', 0.7); mat('sage2', '#8db38c', 0.7); mat('pot', '#f1efeb', 0.6); mat('stem', '#9c8a73', 0.7)
    mat('ink', '#2b2f3a', 0.4); mat('soft', '#eceef1', 0.6); mat('city', '#eef3fa', 0.9, '#f1f5fb', 1.9)
    mat('slot', '#ffffff', 0.3, '#ffffff', 3.2); mat('aqua', '#5fd6c8', 0.3, '#5fd6c8', 4.0); mat('lampglow', '#fff1da', 0.3, '#ffe2b0', 5.0)
    mat('screen', '#f7f8fa', 0.2, '#f2f4f8', 1.2); mat('glass', '#eef4f8', 0.05)
    sky_mat()

def plant(name, x, y, c, s=1.0, tall=False):
    rnd = random.Random(hash(name) & 0xffff)
    cyl(name + "_pot", 0.26 * s, 0.5 * s, (x, y, 0.25 * s), M['pot'], c, v=32)
    cyl(name + "_soil", 0.235 * s, 0.02 * s, (x, y, 0.5 * s), M['stem'], c, v=20)
    h = (1.7 if tall else 1.05) * s
    cyl(name + "_stem", 0.025 * s, h * 0.8, (x, y, 0.5 * s + h * 0.4), M['stem'], c, v=8)
    for i in range(11 if tall else 7):
        a = i * 2.39996; r = (0.16 + 0.06 * (i % 3)) * s; z = 0.5 * s + h * (0.55 + 0.45 * (i / (10 if tall else 6)))
        sphere("%s_leaf%d" % (name, i), (0.17 + 0.05 * rnd.random()) * s, (x + math.cos(a) * r, y + math.sin(a) * r, z),
               M['sage' if i % 2 else 'sage2'], c, sub=2, scale=(1, 1, 0.72))

def shell(room, live, marks):
    # floor, ceiling, walls
    # the floor in two pieces: a finely divided strip by the windows, where the sun draws the mullions' shadows
    for name, x0, x1 in (("floor_sun", -W - 0.5, -1.5), ("floor", -1.5, W + 0.5)):
        bpy.ops.mesh.primitive_plane_add(size=1, location=((x0 + x1) / 2, 11, 0)); fl = bpy.context.object; fl.name = name; fl.scale = (x1 - x0, L + 6, 1)
        bpy.ops.object.transform_apply(scale=True); finish(fl, M['floor'], room, smooth=False)
    plane("ceiling", (2 * W, L), (0, L / 2, H), M['ceil'], room, rot=(math.pi, 0, 0))
    for x in (-4.0, 0.0, 4.0):  # light slots in the ceiling
        rbox("slot_%d" % x, (0.1, L - 3, 0.04), (x, L / 2, H - 0.02), M['slot'], room, bevel=0)
    rbox("wall_r", (0.2, L, H), (W + 0.1, L / 2, H / 2), M['wall'], room, bevel=0)
    rbox("base_r", (0.04, L, 0.09), (W - 0.02, L / 2, 0.045), M['white'], room, bevel=0)
    # window wall: floor-to-ceiling glass in bays, thin white mullions, a low sill; bright sky and a faint skyline outside
    for i in range(13):
        y = i * 2.0
        rbox("mull%d" % i, (0.14, 0.18, H), (-W, y, H / 2), M['white'], room, bevel=0.02)
    rbox("sill", (0.3, L, 0.16), (-W, L / 2, 0.08), M['white'], room, bevel=0.03)
    rbox("head", (0.3, L, 0.24), (-W, L / 2, H - 0.12), M['white'], room, bevel=0.02)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-30, 12, 10), rotation=(0, math.pi / 2, 0))
    sk = bpy.context.object; sk.name = "sky"; sk.scale = (90, 420, 1); bpy.ops.object.transform_apply(scale=True); finish(sk, M['sky'], room, smooth=False)
    sk.visible_shadow = False  # the sun shines through the sky backdrop
    rnd = random.Random(3)
    for i in range(14):  # far-off towers, barely there
        y = -20 + i * 4.6 + rnd.uniform(-1, 1); h = rnd.uniform(3, 9); w = rnd.uniform(2.5, 5)
        rbox("tower%d" % i, (w, w, h), (-34 - rnd.uniform(0, 4), y, -5 + h / 2), M['city'], room, bevel=0).visible_shadow = False
    # front wall with the elevator, back wall with the tool niche
    for sx in (-1, 1):
        rbox("fwall%d" % (sx > 0), (W - 1.55, 0.2, H), (sx * (1.55 + (W - 1.55) / 2), -0.1, H / 2), M['wall'], room, bevel=0)
    rbox("fwall_top", (3.1, 0.2, H - 3.0), (0, -0.1, 3.0 + (H - 3.0) / 2), M['wall'], room, bevel=0)
    for sx in (-1, 1): rbox("eframe%d" % (sx > 0), (0.12, 0.26, 3.0), (sx * 1.49, 0.0, 1.5), M['metal'], room, bevel=0.02)
    rbox("eframe_top", (3.1, 0.26, 0.12), (0, 0.0, 3.0), M['metal'], room, bevel=0.02)
    rbox("elight", (0.5, 0.03, 0.05), (0, 0.14, 3.25), M['aqua'], live, bevel=0.01)
    rbox("ecab_floor", (2.8, 2.6, 0.04), (0, -1.4, 0.0), M['soft'], room, bevel=0.01)
    rbox("ecab_back", (3.0, 0.1, 3.2), (0, -2.75, 1.6), M['white'], room, bevel=0)
    for sx in (-1, 1): rbox("ecab_side%d" % (sx > 0), (0.1, 2.8, 3.2), (sx * 1.45, -1.4, 1.6), M['white'], room, bevel=0)
    rbox("ecab_top", (3.0, 2.8, 0.1), (0, -1.4, 3.15), M['white'], room, bevel=0)
    rbox("ecab_light", (1.6, 1.4, 0.02), (0, -1.4, 3.09), M['slot'], room, bevel=0)
    rbox("ecab_rail", (0.04, 2.0, 0.04), (-1.36, -1.4, 0.95), M['metal'], room, bevel=0.01)
    for sx in (-1, 1): rbox("door_%s" % ('l' if sx < 0 else 'r'), (1.42, 0.06, 2.96), (sx * 0.71, -0.02, 1.48), M['metal'], live, bevel=0.01)
    # back wall: a deep niche holding the tool rack, three white shelves, warm light inside
    TY = L
    rbox("bwall_l", (W - 3.6, 0.2, H), (-(3.6 + (W - 3.6) / 2), TY + 0.1, H / 2), M['wall'], room, bevel=0)
    rbox("bwall_r", (W - 3.6, 0.2, H), ((3.6 + (W - 3.6) / 2), TY + 0.1, H / 2), M['wall'], room, bevel=0)
    rbox("bwall_bot", (7.2, 0.2, 0.55), (0, TY + 0.1, 0.275), M['wall'], room, bevel=0)
    rbox("bwall_top", (7.2, 0.2, H - 3.55), (0, TY + 0.1, 3.55 + (H - 3.55) / 2), M['wall'], room, bevel=0)
    rbox("niche_back", (7.2, 0.1, 3.0), (0, TY + 0.75, 2.05), M['soft'], room, bevel=0)
    for sx in (-1, 1): rbox("niche_side%d" % (sx > 0), (0.1, 0.7, 3.0), (sx * 3.55, TY + 0.4, 2.05), M['soft'], room, bevel=0)
    rbox("niche_top", (7.2, 0.7, 0.1), (0, TY + 0.4, 3.5), M['soft'], room, bevel=0)
    rbox("niche_glow", (6.6, 0.04, 0.03), (0, TY + 0.25, 3.43), M['lampglow'], room, bevel=0)
    slot = 0
    for r, z in enumerate((0.62, 1.52, 2.42)):
        rbox("shelf%d" % r, (7.0, 0.62, 0.05), (0, TY + 0.42, z), M['white'], room, bevel=0.015)
        for cidx in range(4):
            x = -2.55 + cidx * 1.7
            empty("slot_%d" % slot, (x, TY + 0.36, z + 0.03), c=marks); slot += 1
    # reception counter (front desk) by the entrance, a long low bench and a sofa nook by the windows
    rx, ry = 4.6, 3.4
    rbox("rec_body", (2.6, 0.75, 1.0), (rx, ry, 0.5), M['white'], room, bevel=0.2, rot=(0, 0, math.radians(-18)))
    rbox("rec_top", (2.75, 0.9, 0.05), (rx, ry, 1.03), M['oak'], room, bevel=0.025, rot=(0, 0, math.radians(-18)))
    cyl("rec_bell", 0.07, 0.06, (rx - 0.6, ry - 0.15, 1.09), M['metal'], room, v=24)
    sphere("rec_bellcap", 0.07, (rx - 0.6, ry - 0.15, 1.11), M['metal'], room, sub=3, scale=(1, 1, 0.7))
    rbox("rec_screen", (0.5, 0.03, 0.32), (rx + 0.45, ry + 0.2, 1.3), M['white'], room, bevel=0.02, rot=(0, 0, math.radians(-18)))
    plant("rec_plant", rx + 1.6, ry + 0.9, room, 0.7)
    empty("front", (rx, ry, 1.1), c=marks)
    sx_, sy_ = -5.6, 3.2   # lounge by the windows
    rbox("sofa_base", (2.2, 0.9, 0.42), (sx_, sy_, 0.21), M['fabric'], room, bevel=0.12, rot=(0, 0, math.radians(90)))
    rbox("sofa_back", (2.2, 0.22, 0.45), (sx_ - 0.38, sy_, 0.6), M['fabric'], room, bevel=0.1, rot=(0, 0, math.radians(90)))
    cyl("coffee", 0.42, 0.04, (sx_ + 1.05, sy_, 0.4), M['oak'], room, v=40); cyl("coffee_leg", 0.05, 0.38, (sx_ + 1.05, sy_, 0.19), M['white'], room, v=12)
    # comms nook on the right wall: mail cubbies, a phone shelf, a parcel bench
    cy = 15.0
    rbox("mail_box", (0.4, 1.6, 1.1), (W - 0.2, cy, 1.55), M['white'], room, bevel=0.03)
    for i in range(4):
        for j in range(3): rbox("cubby%d%d" % (i, j), (0.06, 0.34, 0.28), (W - 0.42, cy - 0.6 + i * 0.4, 1.2 + j * 0.34), M['soft'], room, bevel=0.01)
    rbox("phone_shelf", (0.4, 0.9, 0.04), (W - 0.2, cy + 1.6, 1.1), M['oak'], room, bevel=0.01)
    rbox("phone", (0.18, 0.24, 0.06), (W - 0.25, cy + 1.6, 1.15), M['white'], room, bevel=0.025)
    rbox("bench", (0.5, 1.8, 0.45), (W - 0.45, cy, 0.225), M['oak'], room, bevel=0.04)
    for i, (dy, s) in enumerate(((-0.5, 0.3), (0.1, 0.24), (0.55, 0.2))): rbox("parcel%d" % i, (s, s * 1.2, s * 0.8), (W - 0.45, cy + dy, 0.45 + s * 0.4), M['oak' if i == 1 else 'white'], room, bevel=0.02)
    empty("comms", (W - 0.6, cy, 1.3), c=marks)
    # the usage meter: a big round wall dial on the right wall
    cyl("meter_ring", 0.62, 0.08, (W - 0.04, 8.2, 2.1), M['white'], room, rot=(0, math.pi / 2, 0), v=64)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=0.52, fill_type='NGON', location=(W - 0.09, 8.2, 2.1), rotation=(0, -math.pi / 2, 0))
    d = bpy.context.object; d.name = "meter_dial"; finish(d, M['screen'], live, smooth=False)
    empty("meter", (W - 0.1, 8.2, 2.1), c=marks)
    # columns, plants, two framed prints, a rug under the team
    for y in (8.0, 16.0):
        cyl("col_l%d" % y, 0.22, H, (-W + 0.45, y, H / 2), M['white'], room, v=40)
    for (x, y, s, t) in ((-7.1, 1.0, 1.0, True), (7.0, 1.2, 0.9, False), (-7.1, 22.8, 1.1, True), (7.1, 22.8, 1.0, True), (-7.0, 12.0, 0.8, False),
                         (6.9, 18.2, 0.85, False), (-4.6, 23.4, 1.15, True), (4.6, 23.4, 1.15, True), (-7.2, 6.0, 0.9, False), (-7.2, 17.6, 0.9, True)):
        plant("plant_%d_%d" % (x, y), x, y, room, s, t)
    # wall art: two soft abstract pieces on the right wall, warm pastels
    def art(name, y, w, h, shapes):
        rbox(name, (0.05, w + 0.08, h + 0.08), (W - 0.03, y, 2.05), M['white'], room, bevel=0.01)
        rbox(name + "_bg", (0.02, w, h), (W - 0.065, y, 2.05), M['soft'], room, bevel=0)
        for k, (dy, dz, sw, sh, m) in enumerate(shapes):
            cyl("%s_s%d" % (name, k), sw / 2, 0.012, (W - 0.08 - k * 0.004, y + dy, 2.05 + dz), M[m], room, rot=(0, math.pi / 2, 0), v=48)
    art("art_a", 11.4, 1.7, 1.1, [(-0.35, 0.1, 0.8, 0.8, 'peach'), (0.3, -0.12, 0.7, 0.7, 'mint'), (0.15, 0.3, 0.3, 0.3, 'oak')])
    art("art_b", 19.4, 1.0, 1.4, [(0.0, 0.25, 0.7, 0.7, 'sage'), (-0.1, -0.3, 0.5, 0.5, 'peach')])
    # a coffee bar by the windows at the back: an island, stools, a machine, cups, two pendants
    bx, by = -5.5, 20.4
    rbox("bar_body", (0.75, 2.6, 0.98), (bx, by, 0.49), M['white'], room, bevel=0.06)
    rbox("bar_top", (0.9, 2.75, 0.05), (bx, by, 1.0), M['oak'], room, bevel=0.02)
    rbox("bar_machine", (0.4, 0.32, 0.42), (bx - 0.08, by + 0.75, 1.235), M['white'], room, bevel=0.05)
    rbox("bar_machine_face", (0.02, 0.24, 0.16), (bx + 0.13, by + 0.75, 1.27), M['coffee'], room, bevel=0.01)
    for k, dy in enumerate((-0.6, -0.42, 0.1)): cyl("cup%d" % k, 0.045, 0.09, (bx + 0.12, by + dy, 1.07), M['white' if k != 1 else 'peach'], room, v=20)
    for k, dy in enumerate((-0.8, 0.0, 0.8)):
        cyl("stool%d_seat" % k, 0.2, 0.05, (bx + 0.75, by + dy, 0.72), M['oak'], room, v=28)
        cyl("stool%d_leg" % k, 0.025, 0.7, (bx + 0.75, by + dy, 0.36), M['metal'], room, v=10)
        cyl("stool%d_foot" % k, 0.17, 0.02, (bx + 0.75, by + dy, 0.01), M['metal'], room, v=24)
    for k, dy in enumerate((-0.6, 0.6)):
        cyl("pend%d_cord" % k, 0.006, 1.6, (bx, by + dy, H - 0.8), M['ink'], room, v=6)
        sphere("pend%d_shade" % k, 0.17, (bx, by + dy, H - 1.65), M['white'], room, sub=3, scale=(1, 1, 0.8))
        sphere("pend%d_bulb" % k, 0.08, (bx, by + dy, H - 1.75), M['lampglow'], room, sub=2)
    rbox("bar_rug", (2.2, 3.6, 0.01), (bx + 0.4, by, 0.005), M['rug'], room, bevel=0.005)
    rbox("rug", (9.4, 12.6, 0.012), (0, 13.1, 0.006), M['rug'], room, bevel=0.005)
    # where the camera starts and where the team's rows begin
    empty("cam_arrive", (0, -1.5, 1.62), c=marks)

def desk(dc, live, marks):
    """One desk at the origin. The teammate floats behind it facing -y (towards you); the monitor stands to their left,
    turned towards them, so from the aisle you see their face beside it."""
    rbox("desk_top", (1.6, 0.8, 0.05), (0, 0, 0.74), M['oak'], dc, bevel=0.025)
    for sx in (-1, 1): rbox("desk_leg%d" % (sx > 0), (0.05, 0.68, 0.72), (sx * 0.74, 0, 0.36), M['white'], dc, bevel=0.02)
    rbox("desk_rail", (1.44, 0.04, 0.12), (0, 0.3, 0.62), M['white'], dc, bevel=0.01)
    mx, my, rz = 0.34, 0.12, math.radians(24)  # turned in, towards the seat
    rbox("mon_body", (0.66, 0.035, 0.40), (mx, my, 1.13), M['white'], dc, bevel=0.018, rot=(0, 0, rz))
    cyl("mon_neck", 0.022, 0.30, (mx + 0.02, my - 0.04, 0.9), M['white'], dc, v=12)
    rbox("mon_foot", (0.24, 0.16, 0.012), (mx + 0.02, my - 0.04, 0.772), M['white'], dc, bevel=0.005, rot=(0, 0, rz))
    n = Vector((math.sin(-rz), math.cos(-rz), 0)) * -1  # the screen faces the seat
    n = Vector((-math.sin(rz), math.cos(rz), 0))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(mx + n.x * 0.019, my + n.y * 0.019, 1.13), rotation=(math.pi / 2, 0, rz))
    sc = bpy.context.object; sc.name = "desk_screen"; sc.scale = (0.62, 0.36, 1); bpy.ops.object.transform_apply(scale=True); finish(sc, M['screen'], live, smooth=False)
    rbox("kb", (0.42, 0.13, 0.016), (-0.02, 0.2, 0.772), M['white'], dc, bevel=0.006)
    rbox("pad", (0.07, 0.1, 0.012), (0.3, 0.24, 0.772), M['soft'], dc, bevel=0.005)
    cyl("mug", 0.045, 0.1, (-0.58, 0.12, 0.815), M['white'], dc, v=24)
    rbox("book", (0.22, 0.28, 0.025), (-0.42, -0.12, 0.777), M['sage'], dc, bevel=0.006, rot=(0, 0, math.radians(12)))
    cyl("lamp_base", 0.08, 0.02, (-0.66, -0.22, 0.775), M['white'], dc, v=24)
    cyl("lamp_arm", 0.012, 0.42, (-0.66, -0.22, 0.98), M['white'], dc, v=8)
    cyl("lamp_head", 0.08, 0.06, (-0.6, -0.12, 1.18), M['white'], dc, v=24, rot=(math.radians(-20), 0, 0))
    cyl("lamp_glow", 0.07, 0.005, (-0.6, -0.11, 1.148), M['lampglow'], live, v=24, rot=(math.radians(-20), 0, 0))
    # chair behind the desk
    cy = 0.68
    rbox("chair_seat", (0.5, 0.48, 0.07), (0, cy, 0.47), M['fabric'], dc, bevel=0.03)
    rbox("chair_back", (0.48, 0.06, 0.5), (0, cy + 0.27, 0.82), M['fabric'], dc, bevel=0.03, rot=(math.radians(-8), 0, 0))
    cyl("chair_post", 0.03, 0.34, (0, cy, 0.27), M['metal'], dc, v=12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        rbox("chair_leg%d" % k, (0.3, 0.035, 0.03), (math.cos(a) * 0.15, cy + math.sin(a) * 0.15, 0.06), M['metal'], dc, bevel=0.01, rot=(0, 0, a))
    empty("desk_seat", (-0.04, 0.62, 1.12), c=marks)              # the teammate's head
    empty("desk_mon", (mx + n.x * 0.019, my + n.y * 0.019, 1.13), rot=(math.pi / 2, 0, rz), c=marks)  # the screen's centre
    empty("desk_kb", (-0.02, 0.2, 0.79), c=marks)

def device(dv, live):
    rbox("dev_body", (0.86, 0.46, 0.5), (0, 0, 0.25), M['white'], dv, bevel=0.08, segs=5)
    rbox("dev_face", (0.62, 0.02, 0.26), (0, -0.235, 0.29), M['soft'], dv, bevel=0.01)
    cyl("dev_led", 0.032, 0.02, (0.3, -0.236, 0.09), M['aqua'], live, rot=(math.pi / 2, 0, 0), v=20)

def lights(S):
    w = bpy.data.worlds.new("w"); S.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = hexc('#eef3fa'); bg.inputs[1].default_value = 0.4
    def light(name, kind, loc, energy, color, size=4, rot=(0, 0, 0), angle=6):
        d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = hexc(color)[:3]
        if kind == 'AREA': d.size = size
        if kind == 'SUN': d.angle = math.radians(angle)
        o = bpy.data.objects.new(name, d); o.location = loc; o.rotation_euler = rot; S.collection.objects.link(o)
    # sun pours in through the window wall from the left, low enough to lay soft bright patches across the floor
    light("sun", 'SUN', (0, 0, 20), 7.5, '#fff0d8', rot=(math.radians(56), 0, math.radians(-62)), angle=1.2)
    for y in (4, 12, 20): light("ceil%d" % y, 'AREA', (0, y, H - 0.15), 70, '#ffffff', size=7, rot=(0, 0, 0))
    light("window_fill", 'AREA', (-W + 0.4, L / 2, 2.2), 350, '#eaf1fb', size=10, rot=(0, math.radians(-90), 0))
    S.render.engine = 'CYCLES'; S.cycles.samples = 48; S.cycles.use_denoising = True
    S.view_settings.view_transform = 'AgX'; S.view_settings.exposure = 0.0

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(11); M.clear()
    S = bpy.context.scene
    room = coll("room"); dc = coll("desk"); dv = coll("device"); live = coll("live"); marks = coll("marks")
    materials(); shell(room, live, marks); desk(dc, live, marks); device(dv, live); lights(S)
    # a stand-in team for previews only (removed before baking): two desks per row, turned 25 degrees toward you
    bpy.ops.wm.save_as_mainfile(filepath=BLEND); print("built", BLEND)

ROWS = (10.0, 13.6, 17.2); ROW_X = 2.5; TURN = 25

def place_preview_desks(S):
    """Copies of the desk where the page would put them, for a still preview."""
    src = [o for o in bpy.data.collections["desk"].objects] + [bpy.data.objects[n] for n in ("desk_screen", "lamp_glow")]
    pv = coll("preview")
    for i, y in enumerate(ROWS[:2]):
        for side in (-1, 1):
            th = math.radians(90 - TURN) * (-side)  # left row (side -1) turns +65 degrees
            for o in src:
                c = o.copy(); c.data = o.data; pv.objects.link(c)
                p = o.location.copy(); p.x *= (-1 if side > 0 else 1)
                c.matrix_world = __import__('mathutils').Matrix.Translation((side * ROW_X, y, 0)) @ __import__('mathutils').Matrix.Rotation(th, 4, 'Z') @ __import__('mathutils').Matrix.Diagonal((-1 if side > 0 else 1, 1, 1, 1)) @ o.matrix_world
    return pv

def view():
    eye, target, out = eval(sys.argv[2]), eval(sys.argv[3]), sys.argv[4]; res = int(sys.argv[5]) if len(sys.argv) > 5 else 800
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    S = bpy.context.scene; place_preview_desks(S)
    for n in ("door_l", "door_r"): bpy.data.objects[n].location.x *= 2.0
    for o in bpy.data.collections["device"].objects: o.hide_render = True
    if eye[2] > H:  # looking down from above: lift the lid
        for o in bpy.data.objects:
            if o.name == "ceiling" or o.name.startswith("slot_"): o.hide_render = True
    c = bpy.data.cameras.new("c"); c.lens = float(sys.argv[6]) if len(sys.argv) > 6 else 20
    cam = bpy.data.objects.new("cam", c); S.collection.objects.link(cam); S.camera = cam; hall.aim(cam, eye, target)
    S.cycles.samples = 24; S.render.resolution_x = res; S.render.resolution_y = res * 9 // 16; S.render.filepath = out
    bpy.ops.render.render(write_still=True); print("wrote", out)

def join_bake(objs, name, step, samples):
    S = bpy.context.scene
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    for o in objs: densify(o, step(o))
    bpy.ops.object.join(); R = bpy.context.object; R.name = name
    print(name, "tris", sum(len(p.vertices) - 2 for p in R.data.polygons), flush=True)
    ca = R.data.color_attributes.new("light", 'FLOAT_COLOR', 'POINT'); R.data.color_attributes.active_color = ca
    S.cycles.samples = samples; S.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.select_all(action='DESELECT'); R.select_set(True); bpy.context.view_layer.objects.active = R
    bpy.ops.object.bake(type='COMBINED', pass_filter={'EMIT', 'DIRECT', 'INDIRECT', 'DIFFUSE', 'TRANSMISSION'}, target='VERTEX_COLORS')
    return R

def bake(samples=64):
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    S = bpy.context.scene; S.cycles.use_denoising = False
    for n in ("door_l", "door_r"): bpy.data.objects[n].hide_render = True  # light the room with the doors open
    big = {"floor", "ceiling", "rug", "wall_r", "niche_back"}
    def rstep(o): return 0.11 if o.name == "floor_sun" else 0.28 if o.name == "floor" else 0.3 if o.name in big or o.name.startswith(("fwall", "bwall")) else 0.45 if o.name not in ("sky",) and not o.name.startswith("tower") else 99
    # 1) the desk, lit as if it stood in the room's left row (its copies are close enough wherever they stand)
    dobjs = [o for o in bpy.data.collections["desk"].objects if o.type == 'MESH']
    for o in dobjs: o.matrix_world = __import__('mathutils').Matrix.Translation((-ROW_X, 13.6, 0)) @ __import__('mathutils').Matrix.Rotation(math.radians(65), 4, 'Z') @ o.matrix_world
    D = join_bake(dobjs, "desk", lambda o: 0.06 if o.name in ("desk_top",) else 0.1, samples)
    D.matrix_world = __import__('mathutils').Matrix.Rotation(math.radians(-65), 4, 'Z') @ __import__('mathutils').Matrix.Translation((ROW_X, -13.6, 0)) @ D.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # 2) one tool device, lit in its shelf slot
    vobjs = [o for o in bpy.data.collections["device"].objects if o.type == 'MESH']
    sl = bpy.data.objects["slot_5"].location.copy()
    for o in vobjs: o.location += sl
    V = join_bake(vobjs, "device", lambda o: 0.08, samples)
    bpy.ops.object.select_all(action='DESELECT'); V.select_set(True); bpy.context.view_layer.objects.active = V
    V.location -= sl; bpy.ops.object.transform_apply(location=True)
    # 3) the room, without the desk and device in it (the page adds a soft contact shadow under each copy)
    D.hide_render = True; V.hide_render = True
    robjs = [o for o in bpy.data.collections["room"].objects if o.type == 'MESH']
    join_bake(robjs, "room", rstep, samples)
    D.hide_render = False; V.hide_render = False
    for n in ("door_l", "door_r"): bpy.data.objects[n].hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=BAKED); print("baked")

def smooth_colors(R, rounds=3):
    import numpy as np
    me = R.data; ca = me.color_attributes["light"]
    col = np.zeros(len(ca.data) * 4, np.float32); ca.data.foreach_get("color", col); col = col.reshape(-1, 4)[:, :3]
    ev = np.zeros(len(me.edges) * 2, np.int32); me.edges.foreach_get("vertices", ev); ev = ev.reshape(-1, 2)
    for _ in range(rounds):
        acc = col.copy(); cnt = np.ones(len(col), np.float32)
        np.add.at(acc, ev[:, 0], col[ev[:, 1]]); np.add.at(acc, ev[:, 1], col[ev[:, 0]]); np.add.at(cnt, ev[:, 0], 1); np.add.at(cnt, ev[:, 1], 1)
        col = acc / cnt[:, None]
    return col

def export(scale=0.25):
    """Baked light stored per vertex at a quarter (so values up to 4 survive glTF's 0..1); the page multiplies back."""
    import numpy as np
    bpy.ops.wm.open_mainfile(filepath=BAKED)
    for name, rounds in (("room", 6), ("desk", 2), ("device", 2)):
        R = bpy.data.objects[name]; col = smooth_colors(R, rounds)
        if name == "room":  # the light slots wash the ceiling around them: keep the ceiling an even soft white
            me = R.data; names = [m.name.split(".")[0] for m in me.materials]
            mi = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get("material_index", mi)
            ls = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get("loop_start", ls); lt = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get("loop_total", lt)
            lv = np.zeros(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", lv)
            ceil = np.zeros(len(col), bool)
            for p in np.nonzero(np.array([names[i] in ("ceil", "wall") for i in mi]))[0]: ceil[lv[ls[p]:ls[p] + lt[p]]] = True
            slot = np.zeros(len(col), bool)
            for p in np.nonzero(np.array([names[i] == "slot" for i in mi]))[0]: slot[lv[ls[p]:ls[p] + lt[p]]] = True
            ceil &= ~slot; cap = np.percentile(col[ceil].max(1), 70) * 1.12
            k = np.maximum(1, col[ceil].max(1) / cap); col[ceil] = col[ceil] / k[:, None]
            print("ceiling and walls capped at", round(float(cap), 2))
        print(name, "brightest", round(float(col.max()), 2), "median", round(float(np.median(col)), 2))
        out = np.concatenate([np.clip(col * scale, 0, 1), np.ones((len(col), 1), np.float32)], 1).ravel()
        R.data.color_attributes["light"].data.foreach_set("color", out)
        m = bpy.data.materials.new(name + "_baked"); m.use_nodes = True; nt = m.node_tree
        a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "light"; nt.links.new(a.outputs[0], nt.nodes["Principled BSDF"].inputs["Base Color"])
        R.data.materials.clear(); R.data.materials.append(m)
        for u in list(R.data.uv_layers): R.data.uv_layers.remove(u)
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'): bpy.data.objects.remove(o, do_unlink=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=True, export_vertex_color='ACTIVE',
                              export_cameras=False, export_lights=False)
    print("exported", OUT, os.path.getsize(OUT))

if __name__ == "__main__":
    {"build": build, "view": view, "bake": lambda: bake(int(sys.argv[2]) if len(sys.argv) > 2 else 64), "export": export}[sys.argv[1]]()
