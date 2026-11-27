"""Builds the Pip Portal hall: one room, from the elevator to the tool wall.

    python3 hall.py build   -> hall.blend
    python3 hall.py bake    -> bakes the room's light into one texture and exports public/portal-art/hall.glb

The look follows the Higgsfield concept pictures: pearl furniture, lavender floor, mint trees, cloud banks, halo lights,
glowing path lines. Lighting is baked (Cycles) into one atlas so the browser only paints flat textures. Anything that
moves or glows live (doors, tool tiles, monitors, halos, path lines) stays a separate object with a plain material.
Empties mark where things happen: seat_N (a teammate), mon_N (their screen), cam_* (camera stops), pip_* (Pip's marks).
Units are metres; the hall runs along +Y from the elevator (y=0) to the tool wall (y=29).
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "hall.blend")
OUT = os.path.join(HERE, "..", "..", "public", "portal-art", "hall.glb")
DESK_Y = (7.0, 12.5, 18.0)
DESK_X = 3.7
TW = 27.5

def hexc(h, a=1):
    h = h.lstrip('#'); r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), a)

M = {}
def mat(name, color, rough=0.4, emit=None, es=0.0, coat=0.0, sss=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hexc(color); b.inputs["Roughness"].default_value = rough
    if coat: b.inputs["Coat Weight"].default_value = coat
    if sss: b.inputs["Subsurface Weight"].default_value = sss
    if emit: b.inputs["Emission Color"].default_value = hexc(emit); b.inputs["Emission Strength"].default_value = es
    m["hex"] = color; m["emit"] = emit or ""; m["es"] = es
    M[name] = m; return m

def coll(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c

def put(o, c):
    for cc in list(o.users_collection): cc.objects.unlink(o)
    c.objects.link(o); return o

def finish(o, m, c, smooth=True):
    o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return put(o, c)

def rbox(name, size, loc, m, c, bevel=0.06, segs=4, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        md = o.modifiers.new("b", 'BEVEL'); md.width = min(bevel, min(size) * 0.49); md.segments = segs; md.limit_method = 'NONE'
    return finish(o, m, c)

def sphere(name, r, loc, m, c, sub=2, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, c)

def cyl(name, r, d, loc, m, c, rot=(0, 0, 0), v=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=v)
    o = bpy.context.object; o.name = name
    return finish(o, m, c)

def torus(name, R, r, loc, m, c, rot=(0, 0, 0), seg=64, mseg=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=seg, minor_segments=mseg)
    o = bpy.context.object; o.name = name
    return finish(o, m, c)

def empty(name, loc, rot=(0, 0, 0), c=None):
    o = bpy.data.objects.new(name, None); o.location = loc; o.rotation_euler = rot
    (c or bpy.context.scene.collection).objects.link(o); return o

def tree(name, x, y, c, s=1.0):
    cyl(name + "_pot", 0.27 * s, 0.48 * s, (x, y, 0.24 * s), M['pearl'], c, v=28)
    cyl(name + "_soil", 0.24 * s, 0.02 * s, (x, y, 0.48 * s), M['lav'], c, v=20)
    cyl(name + "_trunk", 0.045 * s, 0.95 * s, (x, y, 0.9 * s), M['trunk'], c, v=8)
    rnd = random.Random(hash(name) & 0xffff)
    for i in range(8):
        a = i * 2.39996; r = 0.2 * s * (0.4 + (i % 3) * 0.3)
        sphere(name + "_leaf%d" % i, (0.25 + 0.05 * (i % 3)) * s, (x + math.cos(a) * r, y + math.sin(a) * r, (1.3 + 0.2 * (i % 4) + rnd.uniform(-0.05, 0.05)) * s), M['mint'], c, sub=3)

def cloud(name, x, y, z, s, c, rnd):
    for k in range(rnd.randint(4, 6)):  # a cluster of soft puffs, like the concept's cloud banks
        ox, oy, oz = rnd.uniform(-1.1, 1.1) * s, rnd.uniform(-0.6, 0.6) * s, rnd.uniform(0, 0.5) * s
        r = rnd.uniform(0.6, 1.05) * s
        sphere("%s_%d" % (name, k), r, (x + ox, y + oy, z + oz + r * 0.35), M['cloud'], c, sub=2, scale=(1, 1, 0.78))

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7)
    S = bpy.context.scene
    room = coll("room"); live = coll("live"); marks = coll("marks")
    mat('floor', '#ece2fa', 0.2, coat=0.6); mat('pearl', '#fbf8ff', 0.3, coat=0.6); mat('lav', '#e6dcfa', 0.45)
    mat('cloud', '#ffffff', 0.9, '#fbf6ff', 0.45, sss=0.3); mat('mint', '#7fdcb8', 0.35, coat=0.4); mat('trunk', '#d1a77c', 0.6)
    mat('cyan', '#9ff6ea', 0.3, '#5eead9', 5.0); mat('halo', '#ffffff', 0.3, '#fff3e4', 9.0)
    mat('warm', '#ffeccc', 0.3, '#ffd59a', 3.0); mat('screen', '#f6f4ff', 0.2, '#efeaff', 0.7); mat('glass', '#f2f8ff', 0.05)
    for k, c in (('tp', '#ffb0cc'), ('tm', '#9fe8c6'), ('tc', '#ffc4a6'), ('tl', '#c6b2ff'), ('tb', '#abc9ff'), ('tg', '#b6ea9f')): mat(k, c, 0.15, k and c, 0.35, coat=1.0)

    # floor, with the two glowing lines that lead down the hall
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 13, 0)); fl = bpy.context.object; fl.name = "floor"; fl.scale = (19, 40, 1)
    bpy.ops.object.transform_apply(scale=True); finish(fl, M['floor'], room)
    for sx in (-1, 1):
        cu = bpy.data.curves.new("line", 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.03; cu.bevel_resolution = 2
        sp = cu.splines.new('POLY'); pts = [(sx * (1.5 + 0.45 * math.sin(i / 4.5)), 0.6 + i * 0.45, 0.004) for i in range(0, 60)]
        sp.points.add(len(pts) - 1)
        for p, q in zip(sp.points, pts): p.co = (*q, 1)
        ob = bpy.data.objects.new("glow_line_%s" % ('l' if sx < 0 else 'r'), cu); ob.data.materials.append(M['cyan']); live.objects.link(ob)

    # the elevator you arrive in
    rbox("ewall_l", (6.4, 0.5, 6.4), (-5.4, -0.25, 3.2), M['pearl'], room, bevel=0.15)
    rbox("ewall_r", (6.4, 0.5, 6.4), (5.4, -0.25, 3.2), M['pearl'], room, bevel=0.15)
    rbox("ewall_top", (4.6, 0.5, 2.0), (0, -0.25, 5.4), M['pearl'], room, bevel=0.15)
    torus("earch", 2.25, 0.17, (0, 0.06, 3.2), M['pearl'], room, rot=(math.radians(90), 0, 0))
    for sx in (-1, 1): rbox("epost%d" % (sx > 0), (0.34, 0.34, 3.25), (sx * 2.25, 0.06, 1.62), M['pearl'], room, bevel=0.12)
    torus("glow_arch", 2.06, 0.028, (0, 0.14, 3.2), M['cyan'], live, rot=(math.radians(90), 0, 0))
    rbox("ecab_floor", (4.2, 2.6, 0.06), (0, -1.6, 0.0), M['lav'], room, bevel=0.02)
    rbox("ecab_back", (4.4, 0.2, 5.0), (0, -2.9, 2.5), M['pearl'], room, bevel=0.08)
    for sx in (-1, 1): rbox("ecab_side%d" % (sx > 0), (0.2, 2.8, 5.0), (sx * 2.2, -1.5, 2.5), M['pearl'], room, bevel=0.08)
    for sx in (-1, 1): rbox("door_%s" % ('l' if sx < 0 else 'r'), (2.1, 0.08, 4.4), (sx * 1.05, -0.06, 2.2), M['pearl'], live, bevel=0.03)

    # desks down both sides of the aisle; each teammate floats behind their monitor, facing the aisle
    n = 0
    for y in DESK_Y:
        for side in (-1, 1):
            x = side * DESK_X; o = side; d = "desk%d" % n
            rbox(d + "_top", (1.1, 2.2, 0.08), (x, y, 0.76), M['pearl'], room, bevel=0.04)
            for e in (-0.9, 0.9): rbox(d + "_leg%d" % (e > 0), (1.0, 0.12, 0.72), (x, y + e, 0.36), M['pearl'], room, bevel=0.03)
            rbox(d + "_glow", (0.03, 1.9, 0.02), (x - o * 0.53, y, 0.715), M['warm'], live, bevel=0, segs=1)
            mx = x - o * 0.22
            rbox(d + "_mon", (0.06, 1.36, 0.86), (mx, y, 1.38), M['pearl'], room, bevel=0.035)
            cyl(d + "_stand", 0.03, 0.2, (mx + o * 0.02, y, 0.9), M['pearl'], room, v=12)
            cyl(d + "_base", 0.17, 0.025, (mx + o * 0.02, y, 0.81), M['pearl'], room, v=28)
            bpy.ops.mesh.primitive_plane_add(size=1, location=(mx + o * 0.036, y, 1.38), rotation=(0, o * math.pi / 2, 0))
            sc = bpy.context.object; sc.name = "screen_%d" % n; sc.scale = (0.76, 1.28, 1); bpy.ops.object.transform_apply(scale=True)
            finish(sc, M['screen'], live)
            rbox(d + "_kb", (0.2, 0.62, 0.02), (x + o * 0.14, y, 0.81), M['pearl'], room, bevel=0.008, segs=2)
            rbox(d + "_tray", (0.32, 0.38, 0.1), (x + o * 0.06, y + 0.82, 0.86), M['pearl'], room, bevel=0.02)
            for k in range(3): rbox(d + "_paper%d" % k, (0.26, 0.32, 0.006), (x + o * 0.06, y + 0.82, 0.83 + k * 0.012), M['lav'], room, bevel=0)
            cyl(d + "_mug", 0.045, 0.1, (x + o * 0.16, y - 0.8, 0.85), M['mint'], room, v=16)
            rbox(d + "_seat", (0.52, 0.56, 0.12), (x + o * 0.92, y, 0.48), M['lav'], room, bevel=0.05)
            rbox(d + "_back", (0.12, 0.62, 0.64), (x + o * 1.2, y, 0.86), M['lav'], room, bevel=0.06)
            cyl(d + "_post", 0.04, 0.42, (x + o * 0.92, y, 0.21), M['pearl'], room, v=12)
            tree(d + "_tree", x + o * 1.05, y + 1.5, room, 0.85)
            # where the teammate floats, and where their screen is (for the live picture)
            empty("seat_%d" % n, (x + o * 0.78, y, 1.22), (0, 0, math.atan2(-o, 0) + math.pi / 2), marks)
            empty("mon_%d" % n, (mx + o * 0.036, y, 1.38), (0, 0, 0), marks)
            # the camera stop for this desk: over the shoulder, looking at the teammate and their screen
            empty("cam_desk_%d" % n, (x - o * 2.6, y - 1.6, 1.75), (0, 0, 0), marks)
            n += 1

    # the tool wall at the far end
    rbox("twall", (11, 0.6, 7.5), (0, TW + 0.65, 3.75), M['pearl'], room, bevel=0.2)
    rbox("talcove", (6.6, 0.3, 4.7), (0, TW + 0.28, 2.65), M['lav'], room, bevel=0.12)
    torus("tarch", 3.35, 0.2, (0, TW + 0.08, 4.25), M['pearl'], room, rot=(math.radians(90), 0, 0))
    torus("glow_tarch", 3.12, 0.035, (0, TW - 0.02, 4.25), M['warm'], live, rot=(math.radians(90), 0, 0))
    for sx in (-1, 1): rbox("tpost%d" % (sx > 0), (0.4, 0.4, 4.25), (sx * 3.35, TW + 0.08, 2.12), M['pearl'], room, bevel=0.15)
    rbox("sign", (2.6, 0.14, 0.62), (0, TW + 0.02, 4.85), M['pearl'], live, bevel=0.28, segs=6)
    t = 0; tones = ['tp', 'tm', 'tc', 'tl', 'tb', 'tg']
    for r, z in enumerate((3.45, 2.45, 1.45)):
        rbox("tshelf%d" % r, (5.8, 0.75, 0.06), (0, TW - 0.02, z - 0.49), M['glass'], room, bevel=0.02)
        for cx in (-2.16, -0.72, 0.72, 2.16):
            rbox("tile_%d" % t, (0.9, 0.36, 0.88), (cx, TW - 0.16, z), M[tones[(t * 5 + r) % 6]], live, bevel=0.17, segs=5); t += 1
    empty("cam_tools", (0, TW - 6.5, 2.2), (0, 0, 0), marks)
    empty("pip_tools", (2.6, TW - 2.4, 1.6), (0, 0, 0), marks)

    # halo lights overhead, in pairs down the hall
    for y in (4.5, 10, 15.5, 21):
        for sx in (-1, 1): torus("halo_%d_%d" % (y, sx > 0), 1.2, 0.05, (sx * 3.2, y, 5.6), M['halo'], live)
    torus("halo_end", 1.6, 0.05, (0, 24.5, 6.0), M['halo'], live)

    # trees and cloud banks hold the floor in the sky
    for (x, y, s) in ((-7.6, 0.9, 1.3), (7.6, 0.9, 1.3), (-7.4, 26.6, 1.2), (7.8, 19.6, 1.2), (-7.0, 15.2, 1.4), (7.0, 9.8, 1.4)):
        tree("tree_%d_%d" % (x, y), x, y, room, s)
    rnd = random.Random(3); k = 0
    for y in range(-1, 32, 3):
        for sx in (-1, 1):
            cloud("cloud%d" % k, sx * rnd.uniform(8.3, 9.4), y + rnd.uniform(-0.8, 0.8), -0.4, rnd.uniform(1.2, 1.7), room, rnd); k += 1
    for x in range(-8, 9, 3):
        cloud("cloud%d" % k, x + rnd.uniform(-0.6, 0.6), TW + 2.4 + rnd.uniform(0, 1.2), 0.2, rnd.uniform(1.4, 2.0), room, rnd); k += 1

    stations(room, live, marks)

    # the camera's stops and Pip's marks along the hall
    empty("cam_arrive", (0, -1.6, 1.75)); empty("cam_floor", (0, -0.2, 2.1)); empty("pip_floor", (0, 8.6, 1.55))
    light_rig(S)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print("built", len(bpy.data.objects), "objects")

def sector(name, r_in, r_out, h, a0, a1, loc, m, c, seg=40):
    """A curved counter: a ring segment, bevelled."""
    import bmesh
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    ring = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        ring.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for (r, z) in ((r_in, 0), (r_out, 0), (r_out, h), (r_in, h))])
    for i in range(seg):
        for k in range(4): bm.faces.new((ring[i][k], ring[i][(k + 1) % 4], ring[i + 1][(k + 1) % 4], ring[i + 1][k]))
    bm.faces.new(ring[0][::-1]); bm.faces.new(ring[-1])
    bm.normal_update(); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.location = loc; bpy.context.scene.collection.objects.link(o)
    md = o.modifiers.new("b", 'BEVEL'); md.width = 0.05; md.segments = 3; md.limit_method = 'ANGLE'
    return finish(o, m, c)

def stations(room, live, marks):
    """Every other place on the floor, as rough shapes for the skin to dress: front desk, meter, comms, exit, founder loft."""
    # front desk, left of the elevator: a curved counter facing the aisle, a map on the wall, a cabinet, the bell
    fx, fy = -5.0, 3.4
    sector("front_counter", 1.25, 1.75, 1.05, math.radians(-75), math.radians(75), (fx - 0.9, fy, 0), M['pearl'], room)
    sector("front_top", 1.15, 1.9, 0.06, math.radians(-78), math.radians(78), (fx - 0.9, fy, 1.05), M['pearl'], room)
    sector("front_glow", 1.76, 1.78, 0.03, math.radians(-75), math.radians(75), (fx - 0.9, fy, 0.12), M['warm'], live)
    rbox("front_wall", (0.3, 5.2, 3.4), (-7.6, fy, 1.7), M['pearl'], room, bevel=0.12)
    rbox("front_map", (0.06, 2.4, 1.5), (-7.42, fy - 0.5, 2.2), M['lav'], room, bevel=0.05)
    rbox("front_cab", (0.6, 0.9, 1.5), (-7.1, fy + 1.8, 0.75), M['pearl'], room, bevel=0.06)
    for k in range(3): rbox("front_cab_d%d" % k, (0.04, 0.7, 0.36), (-6.79, fy + 1.8, 0.35 + k * 0.45), M['lav'], room, bevel=0.03)
    cyl("front_bell", 0.12, 0.08, (fx + 0.55, fy + 0.6, 1.12), M['trunk'], room, v=24); sphere("front_bell_top", 0.1, (fx + 0.55, fy + 0.6, 1.2), M['trunk'], room, sub=2)
    rbox("front_tray", (0.5, 0.7, 0.08), (fx + 0.5, fy - 0.5, 1.12), M['pearl'], room, bevel=0.03)
    empty("cam_front", (fx + 4.2, fy - 1.6, 1.85), (0, 0, 0), marks); empty("look_front", (fx - 0.6, fy, 1.2), (0, 0, 0), marks); empty("pip_front", (fx + 2.2, fy + 1.0, 1.5), (0, 0, 0), marks)
    # usage meter, right of the elevator: a tall glass tube on a pedestal; the liquid inside is live
    mx, my = 5.3, 3.4
    cyl("meter_base", 0.62, 0.36, (mx, my, 0.18), M['pearl'], room, v=40)
    cyl("meter_cap", 0.55, 0.3, (mx, my, 3.75), M['pearl'], room, v=40)
    torus("meter_ring_lo", 0.5, 0.06, (mx, my, 0.42), M['warm'], live)
    torus("meter_ring_hi", 0.5, 0.06, (mx, my, 3.55), M['warm'], live)
    cyl("meter_glass", 0.44, 3.2, (mx, my, 2.0), M['glass'], live, v=40)
    cyl("meter_liquid", 0.38, 1.0, (mx, my, 0.9), M['cyan'], live, v=32)
    rbox("meter_wall", (0.3, 4.4, 4.6), (7.6, my, 2.3), M['pearl'], room, bevel=0.12)
    empty("cam_meter", (mx - 4.2, my - 1.8, 1.9), (0, 0, 0), marks); empty("look_meter", (mx, my, 2.0), (0, 0, 0), marks); empty("pip_meter", (mx - 1.7, my + 1.4, 1.6), (0, 0, 0), marks)
    # comms corner, far left: a low platform with the phone, mailbox, safe and the parcel chute
    cx, cy = -5.2, 22.4
    rbox("comms_deck", (2.4, 5.6, 0.5), (cx - 0.4, cy, 0.25), M['pearl'], room, bevel=0.15)
    rbox("comms_wall", (0.3, 6.2, 3.2), (-7.6, cy, 1.6), M['pearl'], room, bevel=0.12)
    rbox("phone_body", (0.5, 0.6, 0.22), (cx + 0.2, cy - 2.0, 0.62), M['pearl'], room, bevel=0.08)
    torus("phone_handset", 0.22, 0.06, (cx + 0.2, cy - 2.0, 0.8), M['pearl'], room, rot=(0, math.radians(90), 0), seg=24)
    rbox("mail_post", (0.1, 0.1, 0.7), (cx + 0.2, cy - 0.7, 0.85), M['pearl'], room, bevel=0.03)
    rbox("mail_box", (0.42, 0.62, 0.38), (cx + 0.2, cy - 0.7, 1.3), M['pearl'], room, bevel=0.15)
    rbox("mail_flag", (0.03, 0.06, 0.32), (cx + 0.44, cy - 0.5, 1.45), M['tl'], room, bevel=0.01)
    rbox("safe", (0.7, 0.7, 0.75), (cx - 0.1, cy + 0.6, 0.88), M['pearl'], room, bevel=0.08)
    torus("safe_dial", 0.13, 0.03, (cx + 0.26, cy + 0.6, 0.92), M['trunk'], room, rot=(0, math.radians(90), 0), seg=24)
    rbox("chute", (1.2, 1.2, 1.5), (cx - 0.6, cy + 2.0, 1.25), M['pearl'], room, bevel=0.3)
    for k in range(2): rbox("parcel%d" % k, (0.45, 0.45, 0.36), (cx + 0.1, cy + 1.8 + k * 0.45, 0.68 + k * 0.05), M['trunk'], room, bevel=0.03)
    empty("cam_comms", (cx + 4.5, cy - 2.2, 1.9), (0, 0, 0), marks); empty("look_comms", (cx, cy, 0.9), (0, 0, 0), marks); empty("pip_comms", (cx + 2.4, cy + 0.2, 1.5), (0, 0, 0), marks)
    # exit and the breaker, far right: a door in the wall, the panel with its red bar beside it
    ex, ey = 6.9, 21.6
    rbox("exit_wall", (0.4, 5.6, 4.2), (ex + 0.6, ey, 2.1), M['pearl'], room, bevel=0.15)
    rbox("exit_door", (0.12, 1.3, 2.4), (ex + 0.34, ey + 1.2, 1.2), M['lav'], room, bevel=0.06)
    torus("exit_arch", 0.72, 0.08, (ex + 0.32, ey + 1.2, 2.4), M['pearl'], room, rot=(0, math.radians(90), 0), seg=32)
    rbox("breaker", (0.2, 1.4, 1.3), (ex + 0.3, ey - 1.0, 1.55), M['pearl'], room, bevel=0.1)
    rbox("breaker_slot", (0.04, 1.0, 0.2), (ex + 0.18, ey - 1.0, 1.75), M['pearl'], room, bevel=0.05)
    rbox("breaker_bar", (0.06, 1.0, 0.22), (ex + 0.17, ey - 1.0, 1.25), M['tp'], live, bevel=0.08)
    empty("cam_exit", (ex - 4.6, ey - 2.4, 1.9), (0, 0, 0), marks); empty("look_exit", (ex, ey - 0.2, 1.5), (0, 0, 0), marks); empty("pip_exit", (ex - 2.4, ey + 0.4, 1.5), (0, 0, 0), marks)
    # the founder's glass loft, up a curved stair at the far right
    lx, ly, lz = 4.8, 25.2, 3.4
    rbox("loft_floor", (3.6, 3.0, 0.25), (lx, ly, lz), M['pearl'], room, bevel=0.1)
    for (dx, dy) in ((-1.5, -1.2), (1.5, -1.2), (-1.5, 1.2), (1.5, 1.2)): cyl("loft_leg", 0.12, lz, (lx + dx, ly + dy, lz / 2), M['pearl'], room, v=16)
    rbox("loft_desk", (1.4, 0.7, 0.08), (lx + 0.3, ly + 0.6, lz + 0.85), M['pearl'], room, bevel=0.03)
    rbox("loft_desk_leg", (1.2, 0.08, 0.72), (lx + 0.3, ly + 0.6, lz + 0.48), M['pearl'], room, bevel=0.02)
    rbox("loft_chair", (0.5, 0.5, 0.5), (lx + 0.3, ly + 1.15, lz + 0.4), M['lav'], room, bevel=0.12)
    for k in range(9): rbox("loft_step%d" % k, (1.0, 0.42, 0.12), (lx - 2.6 + k * 0.0, ly - 4.4 + k * 0.4, 0.32 + k * 0.36), M['pearl'], room, bevel=0.04)
    for (dx, dy, w, d) in ((0, -1.48, 3.6, 0.04), (1.78, 0, 0.04, 3.0), (0, 1.48, 3.6, 0.04)): rbox("loft_glass", (w, d, 1.3), (lx + dx, ly + dy, lz + 0.78), M['glass'], live, bevel=0)
    torus("loft_halo", 1.0, 0.04, (lx, ly, lz + 2.6), M['halo'], live)
    empty("cam_founder", (lx - 4.2, ly - 3.6, lz + 1.4), (0, 0, 0), marks); empty("look_founder", (lx, ly, lz + 0.8), (0, 0, 0), marks); empty("pip_founder", (lx - 1.0, ly - 1.0, lz + 1.3), (0, 0, 0), marks)

def light_rig(S):
    w = bpy.data.worlds.new("sky"); S.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); ramp = nt.nodes.new("ShaderNodeValToRGB")
    bg = nt.nodes.new("ShaderNodeBackground"); out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], ramp.inputs[0])
    e = ramp.color_ramp.elements; e[0].position = 0.48; e[0].color = hexc('#fbeefc'); e[1].position = 0.8; e[1].color = hexc('#b3a9f0')
    nt.links.new(ramp.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.0; nt.links.new(bg.outputs[0], out.inputs[0])
    def light(name, kind, loc, energy, color, size=4, rot=(0, 0, 0)):
        d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = hexc(color)[:3]
        if kind == 'AREA': d.size = size
        if kind == 'SUN': d.angle = math.radians(14)
        o = bpy.data.objects.new(name, d); o.location = loc; o.rotation_euler = rot; S.collection.objects.link(o)
    light("sun", 'SUN', (0, 0, 20), 1.6, '#ffe7cf', rot=(math.radians(40), math.radians(-20), math.radians(150)))
    for y in (4, 13, 22): light("fill%d" % y, 'AREA', (0, y, 8.5), 140, '#e9e0ff', size=10)
    light("warmwall", 'AREA', (0, TW - 5, 3.5), 120, '#ffd9b0', size=4, rot=(math.radians(80), 0, 0))
    S.render.engine = 'CYCLES'; S.cycles.samples = 32; S.cycles.use_denoising = True
    S.view_settings.view_transform = 'AgX'; S.view_settings.exposure = 0.2

def aim(cam, eye, target):
    from mathutils import Vector
    cam.location = Vector(eye); d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def preview(at="cam_floor", res=640, out="/tmp/hall_preview.png", eye=None, target=None, lens=22):
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    S = bpy.context.scene; c = bpy.data.cameras.new("c"); c.lens = lens
    cam = bpy.data.objects.new("cam", c); S.collection.objects.link(cam); S.camera = cam
    if eye: aim(cam, eye, target)
    else: cam.location = bpy.data.objects[at].location; cam.rotation_euler = (math.radians(84), 0, 0)
    S.render.resolution_x = res; S.render.resolution_y = res * 9 // 16; S.render.filepath = out
    bpy.ops.render.render(write_still=True); print("wrote", out)

def densify(o, step):
    """Split long edges so baked light (stored per vertex) has somewhere to live on big flat faces."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(8):
        long = [e for e in bm.edges if e.calc_length() > step]
        if not long: break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(o.data); bm.free()

def bake(samples=48):
    """Bakes the room's light into a colour per vertex (no textures to download): smooth, tiny, and lit by the real scene."""
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    S = bpy.context.scene; S.cycles.samples = samples; S.cycles.use_denoising = False
    room = bpy.data.collections["room"]
    bpy.ops.object.select_all(action='DESELECT')
    objs = [o for o in room.objects if o.type == 'MESH']
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')  # applies the bevels
    for o in objs: densify(o, 0.32 if o.name == "floor" else 0.45)
    bpy.ops.object.join(); R = bpy.context.object; R.name = "room"
    print("room tris", sum(len(p.vertices) - 2 for p in R.data.polygons), "verts", len(R.data.vertices))
    ca = R.data.color_attributes.new("light", 'FLOAT_COLOR', 'POINT'); R.data.color_attributes.active_color = ca
    S.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='COMBINED', pass_filter={'EMIT', 'DIRECT', 'INDIRECT', 'DIFFUSE', 'TRANSMISSION'}, target='VERTEX_COLORS')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "hall_baked.blend"))
    print("baked")

def export(scale=0.5):
    """The baked room (colour per vertex, halved so it fits glTF's 0..1; the page doubles it back), plus everything live
    and the marks, as one .glb."""
    bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, "hall_baked.blend"))
    import numpy as np
    R = bpy.data.objects["room"]; ca = R.data.color_attributes["light"]; me = R.data
    col = np.zeros(len(ca.data) * 4, np.float32); ca.data.foreach_get("color", col); col = col.reshape(-1, 4)[:, :3]
    # a few rounds of averaging with neighbours along edges: the bake's grain goes, the soft light stays
    ev = np.zeros(len(me.edges) * 2, np.int32); me.edges.foreach_get("vertices", ev); ev = ev.reshape(-1, 2)
    for _ in range(3):
        acc = col.copy(); cnt = np.ones(len(col), np.float32)
        np.add.at(acc, ev[:, 0], col[ev[:, 1]]); np.add.at(acc, ev[:, 1], col[ev[:, 0]])
        np.add.at(cnt, ev[:, 0], 1); np.add.at(cnt, ev[:, 1], 1)
        col = acc / cnt[:, None]
    print("brightest", round(float(col.max()), 2))
    out = np.concatenate([np.clip(col * scale, 0, 1), np.ones((len(col), 1), np.float32)], 1).ravel()
    ca.data.foreach_set("color", out)
    m = bpy.data.materials.new("room_baked"); m.use_nodes = True; nt = m.node_tree
    a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "light"; nt.links.new(a.outputs[0], nt.nodes["Principled BSDF"].inputs["Base Color"])
    R.data.materials.clear(); R.data.materials.append(m)
    for u in list(R.data.uv_layers): R.data.uv_layers.remove(u)
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT': bpy.data.objects.remove(o, do_unlink=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=True, export_vertex_color='ACTIVE',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7, export_cameras=False, export_lights=False)
    print("exported", OUT, os.path.getsize(OUT))

if __name__ == "__main__":
    {"build": build, "preview": preview, "view": lambda: preview(eye=eval(sys.argv[2]), target=eval(sys.argv[3]), out=sys.argv[4], res=int(sys.argv[5]) if len(sys.argv) > 5 else 640), "export": export, "bake": lambda: bake(int(sys.argv[2]) if len(sys.argv) > 2 else 48)}[sys.argv[1]]()
