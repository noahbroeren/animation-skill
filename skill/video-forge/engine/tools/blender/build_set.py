"""
Build a set in Blender, bake its light with Cycles and export it for the engine (video-forge 1.11).

  blender -b --factory-startup -P engine/tools/blender/build_set.py -- --set home --out engine/public/sets/home
          [--assets engine/public/assets/polyhaven] [--samples 384] [--texel 110] [--preview] [--fast]

Writes OUT/set.glb (geometry + PBR textures, UV0 = textures, UV1 = lightmap), OUT/lm/<object>.png (baked irradiance,
sRGB-encoded, scaled by lmScale) and OUT/set.json (marks, wide camera, camera box, sun, lightmaps, floors, realtime
objects). The engine loads it with `bakedSet()` (lib/three/baked.ts): every baked mesh is drawn as albedo x lightmap
(Cycles direct + indirect light, soft shadows and AO), so the world looks path-traced while the camera, the cards and
the props stay in the engine. Objects named RT_* are not baked (they move, or are many small instances like grass) and
are lit in real time; FLOOR_* objects also get a shadow catcher so the characters' shadows land on them.

Coordinates in this file are ENGINE coordinates (metres, +Y up, +Z toward the default camera): E(x, y, z).
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector, Matrix

# ------------------------------------------------------------------------------------------------ args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
A = {"set": "home", "out": "out_set", "samples": "384", "texel": "110", "assets": ""}
i = 0
while i < len(argv):
    k = argv[i].lstrip("-")
    if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
        A[k] = argv[i + 1]; i += 2
    else:
        A[k] = True; i += 1
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = A["assets"] or os.path.normpath(os.path.join(HERE, "..", "..", "public", "assets", "polyhaven"))
OUT = os.path.abspath(A["out"])
FAST = bool(A.get("fast"))
os.makedirs(os.path.join(OUT, "lm"), exist_ok=True)


def E(x, y, z):
    """engine (x right, y up, z toward camera) -> Blender (x, -z, y)"""
    return Vector((x, -z, y))


# ------------------------------------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
SC.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev; prefs.get_devices()
        for d in prefs.devices: d.use = d.type != "CPU"
        SC.cycles.device = "GPU"; break
    except Exception:
        pass
SC.cycles.samples = 64 if FAST else int(A["samples"])
SC.cycles.use_denoising = True
SC.view_settings.view_transform = "AgX" if "AgX" in [i.name for i in SC.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
MARKS, FLOORS, NOTES = {}, [], {}


# ------------------------------------------------------------------------------------------------ materials
_img_cache = {}


def img(path, noncolor=False):
    key = (path, noncolor)
    if key not in _img_cache:
        im = bpy.data.images.load(path, check_existing=True)
        if noncolor: im.colorspace_settings.name = "Non-Color"
        _img_cache[key] = im
    return _img_cache[key]


_paint_cache = {}
def paint_image(tex, paint, k=0.45):
    """a texture repainted: paint colour x (1 - k + k * luma / mean luma). glTF only exports plain image textures."""
    import numpy as np
    key = (tex, paint, k)
    if key in _paint_cache: return _paint_cache[key]
    d = os.path.join(ASSETS, "textures", tex)
    src = bpy.data.images.load(os.path.join(d, next(x for x in os.listdir(d) if "_diff_" in x)), check_existing=False)
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32); src.pixels.foreach_get(px); px = px.reshape(-1, 4)
    l = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
    f = (1 - k + k * l / max(1e-4, float(l.mean())))[:, None]
    c = np.array(srgb(paint), dtype=np.float32)[None, :]
    out = np.ones_like(px); out[:, :3] = np.clip(c * f, 0, 1)
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    im = bpy.data.images.new(f"paint_{tex}_{paint[1:]}", w, h, alpha=False); im.colorspace_settings.name = "sRGB"
    im.pixels.foreach_set(out.ravel())
    path = os.path.join(OUT, "tex", f"paint_{tex}_{paint[1:]}.jpg"); im.filepath_raw = path; im.file_format = "JPEG"; im.save()
    bpy.data.images.remove(src); bpy.data.images.remove(im)
    _paint_cache[key] = path
    return path


def tex_mat(name, tex, size=2.0, tint=None, rough_k=1.0, normal=1.0, paint=None):
    """PBR material from a Poly Haven texture (tex = id). UVs are world-projected in metres / size (see world_uv)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    d = os.path.join(ASSETS, "textures", tex)
    f = lambda k: next((os.path.join(d, x) for x in os.listdir(d) if f"_{k}_" in x), None)
    td = N.new("ShaderNodeTexImage"); td.image = img(paint_image(tex, paint) if paint else f("diff"))
    col = td.outputs["Color"]
    if tint:
        mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
        L.new(col, mx.inputs[6]); mx.inputs[7].default_value = (*tint, 1); col = mx.outputs[2]
    L.new(col, b.inputs["Base Color"])
    if f("rough"):
        tr = N.new("ShaderNodeTexImage"); tr.image = img(f("rough"), True)
        if rough_k != 1.0:
            mt = N.new("ShaderNodeMath"); mt.operation = "MULTIPLY"; mt.inputs[1].default_value = rough_k
            L.new(tr.outputs["Color"], mt.inputs[0]); L.new(mt.outputs[0], b.inputs["Roughness"])
        else:
            L.new(tr.outputs["Color"], b.inputs["Roughness"])
    if f("nor_gl") and normal > 0:
        tn = N.new("ShaderNodeTexImage"); tn.image = img(f("nor_gl"), True)
        nm = N.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = normal
        L.new(tn.outputs["Color"], nm.inputs["Color"]); L.new(nm.outputs["Normal"], b.inputs["Normal"])
    m["tex_size"] = size
    return m


def col_mat(name, rgb, rough=0.6, metal=0.0, emit=None, emit_k=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = emit_k
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    return m


def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def gen_image(name, w, h, fn):
    """an image painted with numpy (fn(u, v) -> rgb arrays), saved to OUT/tex so the glTF exporter can embed it"""
    import numpy as np
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    v, u = np.mgrid[0:h, 0:w].astype(np.float32); u /= (w - 1); v /= (h - 1)
    rgb = np.clip(fn(u, v, np), 0, 1)
    im = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32); px[..., :3] = rgb
    im.pixels.foreach_set(px.ravel())
    path = os.path.join(OUT, "tex", name + ".png"); im.filepath_raw = path; im.file_format = "PNG"; im.save()
    return bpy.data.images.load(path, check_existing=True)


def window_mat(name, curtain):
    """glass with a dim room behind it, two curtains and a soft sky reflection (UV 0..1 across the pane)"""
    c = srgb(curtain)
    def fn(u, v, np):
        room = np.stack([0.10 + 0.06 * v, 0.12 + 0.07 * v, 0.16 + 0.08 * v], -1)
        cur = ((u < 0.2) | (u > 0.8)).astype(np.float32)[..., None]
        fold = 0.85 + 0.15 * np.sin(u * 60)[..., None]
        out = room * (1 - cur) + np.array(c)[None, None, :] * fold * cur * 0.75
        refl = np.clip(1 - np.abs((u * 0.9 + v * 0.7) - 0.75) * 7, 0, 1) * 0.35 + np.clip(1 - np.abs((u * 0.9 + v * 0.7) - 1.05) * 12, 0, 1) * 0.2
        return out + refl[..., None] * np.array([0.75, 0.85, 0.95])[None, None, :] + v[..., None] * 0.05
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes["Principled BSDF"]; t = nt.nodes.new("ShaderNodeTexImage"); t.image = gen_image(name, 256, 256, fn)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.15
    m["fit_uv"] = 1
    return m


# ------------------------------------------------------------------------------------------------ geometry helpers
def link(ob):
    SC.collection.objects.link(ob); return ob


def box(name, w, h, d, at, mat, bevel=0.012, rot_y=0.0):
    """w x h x d box (engine axes) with its BASE centre at engine point `at`, bevelled edges that catch the light."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h + h / 2))  # Blender (x, y = -engine z, z = engine y)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = E(*at); ob.rotation_euler = (0, 0, rot_y)
    me.materials.append(mat)
    if bevel > 0:
        md = ob.modifiers.new("bev", "BEVEL"); md.width = bevel; md.segments = 2; md.limit_method = "ANGLE"
    return ob


def cyl(name, r, h, at, mat, seg=20, r2=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, h / 2)))
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = E(*at); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob


def plane(name, w, d, at, mat):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=max(1, int(w)), y_segments=max(1, int(d)), size=0.5)
    for v in bm.verts: v.co = Vector((v.co.x * w, v.co.y * d, 0))
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = E(*at); me.materials.append(mat)
    return ob


def prism_roof(name, w, depth, rise, at, mat, overhang=0.35):
    """gable roof: ridge along x, eaves at engine y = at[1], front eave at z = at[2] + depth / 2"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    hw, hd = w / 2 + overhang, depth / 2 + overhang
    t = 0.12
    pts = [(-hw, -hd, 0), (hw, -hd, 0), (hw, 0, rise), (-hw, 0, rise), (-hw, hd, 0), (hw, hd, 0)]
    vs = [bm.verts.new(Vector((x, -z, y))) for (x, z, y) in [(p[0], p[1], p[2]) for p in pts]]
    # two slopes as thick slabs
    bm.free(); bm = bmesh.new()
    for sgn in (-1, 1):
        a = [(-hw, sgn * hd, 0), (hw, sgn * hd, 0), (hw, 0, rise), (-hw, 0, rise)]
        top = [bm.verts.new(Vector((x, -z, y))) for (x, z, y) in a]
        bot = [bm.verts.new(Vector((x, -z, y - t))) for (x, z, y) in a]
        bm.faces.new(top if sgn > 0 else top[::-1]); bm.faces.new(bot[::-1] if sgn > 0 else bot)
        for k in range(4):
            q = [top[k], top[(k + 1) % 4], bot[(k + 1) % 4], bot[k]]
            bm.faces.new(q if sgn > 0 else q[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = E(*at); me.materials.append(mat)
    return ob


def gable(name, w, rise, at, mat):
    """triangle wall above the eaves (facing +z)"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(Vector((x, 0, y))) for (x, y) in [(-w / 2, 0), (w / 2, 0), (0, rise)]]
    vb = [bm.verts.new(Vector((x, 0.3, y))) for (x, y) in [(-w / 2, 0), (w / 2, 0), (0, rise)]]
    bm.faces.new(vs); bm.faces.new(vb[::-1])
    for k in range(3): bm.faces.new([vs[k], vb[k], vb[(k + 1) % 3], vs[(k + 1) % 3]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = E(*at); me.materials.append(mat)
    return ob


def text_mesh(name, s, size, at, mat, depth=0.004, rot_x=-math.pi / 2):
    cu = bpy.data.curves.new(name, "FONT"); cu.body = s; cu.size = size; cu.extrude = depth; cu.align_x = "CENTER"; cu.align_y = "CENTER"
    ob = link(bpy.data.objects.new(name, cu)); ob.location = E(*at); ob.rotation_euler = (rot_x + math.pi / 2, 0, 0) if rot_x != -math.pi / 2 else (0, 0, 0)
    cu.materials.append(mat)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.convert(target="MESH"); ob.select_set(False)
    return ob


def import_model(asset, name, at, height=None, rot_y=0.0, rt=False):
    """Poly Haven glTF model, scaled to `height` metres, base at engine point `at`. rt=True: not baked (realtime)."""
    d = os.path.join(ASSETS, "models", asset)
    f = next(os.path.join(d, x) for x in os.listdir(d) if x.endswith(".gltf"))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    others = [o.name for o in new if o.type != "MESH"]
    # flatten: apply parents and join the meshes into one object
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for nm in others:
        if nm in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[nm])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    zmin, zmax = min(v.z for v in bb), max(v.z for v in bb)
    cx, cy = sum(v.x for v in bb) / 8, sum(v.y for v in bb) / 8
    k = (height / max(1e-6, zmax - zmin)) if height else 1.0
    ob.data.transform(Matrix.Translation((-cx, -cy, -zmin)))
    ob.data.transform(Matrix.Scale(k, 4))
    ob.location = E(*at); ob.rotation_euler = (0, 0, rot_y)
    ob.name = ("RT_" if rt else "") + name
    for m in ob.data.materials:
        if m: m["tex_size"] = 0  # keep the model's own UVs
    ob.select_set(False)
    return ob


def mark(name, at):
    MARKS[name] = [round(float(v), 3) for v in at]


# ------------------------------------------------------------------------------------------------ the HOME set: a quiet street of front gardens
def house(prefix, x, door_col, wall_tint, flip=False, z_face=-6.0, detail=True, door_w=1.0, wall_tex="weathered_plank_siding", curtain="#d98a7a", paint=None):
    """A two-storey house front facing +z (or -z with flip) centred on x. Returns the door's engine x."""
    s = -1 if flip else 1
    zf = z_face
    W, H1 = 8.0, 6.2
    wall = tex_mat(f"{prefix}_wall", wall_tex, 2.2 if wall_tex.startswith("exterior") else 1.8, tint=None if paint else wall_tint, paint=paint)
    trim = col_mat(f"{prefix}_trim", srgb("#f1ece2"), 0.55)
    conc = tex_mat(f"{prefix}_found", "brushed_concrete", 2.0, tint=srgb("#b9b3a8"))
    roof = tex_mat(f"{prefix}_roof", "clay_roof_tiles_02", 1.6, tint=srgb("#b58a7a"))
    ry = math.pi if flip else 0.0
    # walls
    box(f"{prefix}_facade", W, H1, 0.3, (x, 0, zf - s * 0.15), wall, bevel=0.0, rot_y=ry)
    box(f"{prefix}_found", W + 0.1, 0.42, 0.36, (x, 0, zf - s * 0.12), conc, rot_y=ry)
    for sx in (-1, 1): box(f"{prefix}_corner{sx}", 0.18, H1, 0.36, (x + sx * (W / 2 - 0.05), 0, zf - s * 0.13), trim, rot_y=ry)
    box(f"{prefix}_belt", W + 0.1, 0.16, 0.36, (x, 3.05, zf - s * 0.13), trim, rot_y=ry)
    gable(f"{prefix}_gable", W, 2.6, (x, H1, zf), wall)
    if flip: bpy.data.objects[f"{prefix}_gable"].rotation_euler = (0, 0, math.pi)
    prism_roof(f"{prefix}_roof", W, 7.0, 2.7, (x, H1, zf - s * 3.5), roof)
    # door, frame, porch
    dx = x - s * 1.6
    dc = col_mat(f"{prefix}_door", srgb(door_col), 0.42)
    box(f"{prefix}_doorslab", door_w, 2.15, 0.07, (dx, 0.42, zf + s * 0.04), dc, bevel=0.008, rot_y=ry)
    for k, (py, ph) in enumerate([(0.62, 0.62), (1.42, 0.92)]):
        for sx in (-1, 1):
            box(f"{prefix}_panel{k}{sx}", door_w * 0.34, ph, 0.03, (dx + sx * door_w * 0.21, 0.42 + py - 0.42 + 0.12, zf + s * 0.085), dc, bevel=0.01, rot_y=ry)
    brass = col_mat(f"{prefix}_brass", srgb("#d6a64a"), 0.3, 1.0)
    knob = cyl(f"{prefix}_knob", 0.035, 0.07, (dx + s * door_w * 0.38, 1.38, zf + s * 0.09), brass, seg=16)
    knob.rotation_euler = (math.pi / 2, 0, 0)
    for sx in (-1, 1): box(f"{prefix}_jamb{sx}", 0.13, 2.32, 0.14, (dx + sx * (door_w / 2 + 0.065), 0.42, zf + s * 0.04), trim, rot_y=ry)
    box(f"{prefix}_head", door_w + 0.4, 0.16, 0.18, (dx, 2.62, zf + s * 0.06), trim, rot_y=ry)
    deck = tex_mat(f"{prefix}_deck", "wood_floor_deck", 1.6, tint=srgb("#c9a27a"))
    box(f"FLOOR_{prefix}_porch", 3.0, 0.42, 1.6, (dx, 0, zf + s * 0.8), deck, bevel=0.02, rot_y=ry)
    for k in range(2):
        box(f"FLOOR_{prefix}_step{k}", 1.5, 0.28 - k * 0.14, 0.34, (dx, 0, zf + s * (1.6 + 0.17 + (1 - k) * 0.0 + k * 0.34)), conc, rot_y=ry)
    # porch canopy on two posts
    for sx in (-1, 1): box(f"{prefix}_post{sx}", 0.12, 2.45, 0.12, (dx + sx * 1.35, 0.42, zf + s * 1.5), trim, rot_y=ry)
    box(f"{prefix}_canopy", 3.1, 0.12, 1.75, (dx, 2.87, zf + s * 0.82), trim, rot_y=ry)
    prism_roof(f"{prefix}_canopyroof", 3.0, 1.6, 0.0, (dx, 2.99, zf + s * 0.82), roof, overhang=0.08)
    # windows: ground floor right of the door, two upstairs
    glass = window_mat(f"{prefix}_glass", curtain)
    for (wx, wy, ww, wh) in [(x + s * 1.6, 1.0, 1.7, 1.45), (x - s * 1.9, 3.75, 1.3, 1.35), (x + s * 1.9, 3.75, 1.3, 1.35)]:
        box(f"{prefix}_glass{wx:.0f}{wy:.0f}", ww, wh, 0.04, (wx, wy, zf + s * 0.02), glass, bevel=0.0, rot_y=ry)["fit"] = 1
        for sx in (-1, 1): box(f"{prefix}_wjamb{wx:.0f}{wy:.0f}{sx}", 0.1, wh + 0.1, 0.12, (wx + sx * (ww / 2 + 0.05), wy - 0.05, zf + s * 0.05), trim, rot_y=ry)
        box(f"{prefix}_whead{wx:.0f}{wy:.0f}", ww + 0.3, 0.12, 0.16, (wx, wy + wh, zf + s * 0.06), trim, rot_y=ry)
        box(f"{prefix}_wsill{wx:.0f}{wy:.0f}", ww + 0.3, 0.08, 0.22, (wx, wy - 0.12, zf + s * 0.1), trim, rot_y=ry)
        box(f"{prefix}_mull{wx:.0f}{wy:.0f}", 0.05, wh, 0.06, (wx, wy, zf + s * 0.05), trim, rot_y=ry)
        box(f"{prefix}_mullh{wx:.0f}{wy:.0f}", ww, 0.05, 0.06, (wx, wy + wh * 0.55, zf + s * 0.05), trim, rot_y=ry)
    if detail:
        flowerbed(prefix, x + s * 1.6, zf + s * 0.45, 2.6, s)
        import_model("planter_box_01", f"{prefix}_planter", (x + s * 1.6, 0.42 + 0.0, zf + s * 0.32), height=0.42, rot_y=ry)
        import_model("industrial_wall_sconce", f"{prefix}_sconce", (dx + s * 0.95, 1.85, zf + s * 0.02), height=0.32, rot_y=ry)
        import_model("potted_plant_02", f"{prefix}_plantL", (dx - s * 1.15, 0.42, zf + s * 0.45), height=0.95, rot_y=ry)
    return dx


def blob(name, r, at, mat, k=1.0, seed=0, sub=2):
    import random
    rr = random.Random(seed)
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts: v.co *= 1 + rr.uniform(-0.12, 0.12); v.co.z *= k
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = E(*at); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob


_flower_mats = {}
def flowerbed(prefix, x, z, w, s=1):
    """a strip of soil along the house with leafy clumps and dots of flowers"""
    import random
    r = random.Random(hash(prefix) % 1000)
    soil = tex_mat(f"{prefix}_soil", "forrest_ground_01", 1.5, tint=srgb("#8a7a6a"))
    box(f"FLOOR_{prefix}_bed", w, 0.08, 0.6, (x, 0, z), soil, bevel=0.03)
    if "leaf" not in _flower_mats:
        _flower_mats["leaf"] = tex_mat("leafbed", "leafy_grass", 0.9, tint=srgb("#7fa860"))
        for c in ("#e86a8a", "#f2c84a", "#f4f0ea", "#b07ad8"): _flower_mats[c] = col_mat(f"fl{c[1:]}", srgb(c), 0.6)
    for k in range(int(w * 3)):
        px = x - w / 2 + 0.2 + k * (w - 0.4) / max(1, int(w * 3) - 1) + r.uniform(-0.08, 0.08)
        pz = z + r.uniform(-0.18, 0.18)
        blob(f"{prefix}_leaf{k}", r.uniform(0.16, 0.24), (px, 0.02, pz), _flower_mats["leaf"], k=0.75, seed=k)
        for j in range(3):
            col = r.choice(["#e86a8a", "#f2c84a", "#f4f0ea", "#b07ad8"])
            blob(f"{prefix}_fl{k}_{j}", 0.045, (px + r.uniform(-0.13, 0.13), r.uniform(0.18, 0.3), pz + r.uniform(-0.1, 0.12)), _flower_mats[col], seed=j, sub=1)


def picket_fence(prefix, x0, x1, z, gap=None):
    white = col_mat(f"{prefix}_picket", srgb("#f3f0e8"), 0.6)
    xx = x0
    while xx <= x1:
        if gap is None or abs(xx - gap) > 0.7:
            box(f"{prefix}_pk{xx:.2f}", 0.09, 0.82, 0.04, (xx, 0.14, z), white, bevel=0.012)
        xx += 0.19
    for yy in (0.36, 0.72):
        for a, b in ([(x0, gap - 0.7), (gap + 0.7, x1)] if gap is not None else [(x0, x1)]):
            box(f"{prefix}_rail{yy}{a:.1f}", b - a, 0.07, 0.03, ((a + b) / 2, 0.14 + yy - 0.035, z - 0.035), white, bevel=0.008)


def mailbox(at):
    post = col_mat("mb_post", srgb("#5a4632"), 0.8)
    red = col_mat("mb_box", srgb("#2f5f8a"), 0.45, 0.2)
    box("mb_post", 0.1, 1.0, 0.1, at, post)
    box("mb_body", 0.24, 0.24, 0.48, (at[0], at[1] + 1.0, at[2]), red, bevel=0.06)
    box("mb_flag", 0.02, 0.2, 0.05, (at[0] + 0.13, at[1] + 1.12, at[2] + 0.1), col_mat("mb_flag_m", srgb("#d8344e"), 0.5))


def street_lamp(name, at):
    dark = col_mat(f"{name}_metal", srgb("#2e3238"), 0.5, 0.6)
    cyl(f"{name}_pole", 0.07, 4.2, at, dark, seg=12)
    box(f"{name}_arm", 0.06, 0.06, 0.9, (at[0], at[1] + 4.1, at[2] - 0.4), dark, bevel=0.01)
    box(f"{name}_head", 0.36, 0.14, 0.5, (at[0], at[1] + 3.98, at[2] - 0.8), dark, bevel=0.03)
    box(f"{name}_lens", 0.3, 0.02, 0.42, (at[0], at[1] + 3.97, at[2] - 0.8), col_mat(f"{name}_glow", srgb("#fff3d0"), 0.3, emit=srgb("#fff3d0"), emit_k=0.6), bevel=0.0)


def yard(prefix, x, z_face=-6.0, w=8.0):
    """front garden between the house and the pavement: lawn, a path of slabs to the porch, grass clumps (realtime)"""
    lawn = tex_mat(f"{prefix}_lawn", "leafy_grass", 2.4, tint=srgb("#a8c48a"))
    plane(f"FLOOR_{prefix}_lawn", w, -0.5 - z_face, (x, 0.0, (z_face - 0.5) / 2), lawn)
    slab = tex_mat(f"{prefix}_slab", "brushed_concrete", 1.5, tint=srgb("#d8d2c6"))
    dx = x - 1.6
    z = z_face + 2.25
    while z < -0.6:
        box(f"FLOOR_{prefix}_slab{z:.1f}", 1.1, 0.04, 0.55, (dx, 0, z), slab, bevel=0.01); z += 0.68


def street(nx=3):
    """pavement, kerb and road along x in front of the gardens"""
    pav = tex_mat("pavement", "brushed_concrete", 2.0, tint=srgb("#cfc9bd"))
    kerb = tex_mat("kerb", "brushed_concrete", 1.0, tint=srgb("#b8b2a6"))
    road = tex_mat("road", "asphalt_02", 4.0, tint=srgb("#8f8f96"))
    L = 9.0 * nx * 2
    for k in range(int(L / 2)):
        box(f"FLOOR_pav{k}", 1.98, 0.14, 2.4, (-L / 2 + 1 + k * 2, 0, 0.75), pav, bevel=0.006)
    box("kerb", L, 0.16, 0.22, (0, 0, 2.06), kerb, bevel=0.02)
    plane("FLOOR_road", L, 9.0, (0, -0.0, 6.6), road)
    plane("ground", L + 20, 60, (0, -0.03, 0), col_mat("ground_m", srgb("#5a5048"), 0.95))  # under everything: no sky through the joints
    # far pavement and kerb across the road (reverse shots)
    box("kerbB", L, 0.16, 0.22, (0, 0, 11.14), kerb, bevel=0.02)
    plane("FLOOR_pavB", L, 2.6, (0, 0.14, 12.55), pav)


def tree(name, at, h=5.5, seed=0):
    import random
    r = random.Random(seed)
    bark = col_mat(f"{name}_bark", srgb("#6b4f3a"), 0.85)
    leaf = tex_mat(f"{name}_leaf", "leafy_grass", 1.1, tint=srgb(r.choice(["#b4dc8a", "#c2e494", "#a8d47e"])))
    cyl(f"{name}_trunk", 0.16, h * 0.6, at, bark, seg=12, r2=0.1)
    for k in range(16):
        a = r.random() * 6.28; rr = r.uniform(0.2, 1.5)
        me = bpy.data.meshes.new(f"{name}_c{k}"); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r.uniform(0.6, 1.1)); bm.to_mesh(me); bm.free()
        ob = link(bpy.data.objects.new(f"{name}_c{k}", me))
        ob.location = E(at[0] + math.cos(a) * rr, at[1] + h * r.uniform(0.62, 0.95), at[2] + math.sin(a) * rr)
        me.materials.append(leaf)
        md = ob.modifiers.new("d", "DISPLACE"); tx = bpy.data.textures.new(f"{name}_n{k}", "CLOUDS"); tx.noise_scale = 0.45; md.texture = tx; md.strength = 0.35
        for p in me.polygons: p.use_smooth = True


def build_home():
    # the customer's house (blue door) in the middle, neighbours left and right
    d0 = house("h0", 0.0, "#3d6b8a", None, curtain="#e2a35a", paint="#efe2c4")
    d1 = house("h1", -9.0, "#b23a3a", srgb("#e4d6cc"), wall_tex="exterior_wall_cladding_02", curtain="#7fa0c8")
    d2 = house("h2", 9.0, "#3f6a8f", None, curtain="#e88a8a", paint="#bcd6c4")
    for p, x in (("y0", 0.0), ("y1", -9.0), ("y2", 9.0)):
        yard(p, x)
    # low hedges between the gardens
    hedge = tex_mat("hedge", "leafy_grass", 0.8, tint=srgb("#9cc47a"))
    for x in (-4.5, 4.5):
        for k in range(14):
            z = -5.6 + k * 0.38
            blob(f"hedge{x:.0f}_{k}", 0.42 + 0.06 * math.sin(k * 1.7), (x + 0.05 * math.sin(k * 2.3), 0.35 + 0.05 * math.cos(k), z), hedge, k=1.15, seed=k + (7 if x > 0 else 0), sub=3)
    street()
    # across the road: three house fronts facing the camera's back (reverse shots)
    for k, x in enumerate((-9.0, 0.0, 9.0)):
        house(f"hb{k}", x, ["#7a4f8a", "#c9822e", "#2f6f8a"][k], srgb("#e4d6cc"), flip=True, z_face=19.5, detail=False,
              wall_tex="exterior_wall_cladding_02" if k == 1 else "weathered_plank_siding", curtain=["#c8a0e0", "#e2a35a", "#8ac0a0"][k], paint=[ "#f0cfc6", None, "#c8d8ea"][k])
    lawnB = tex_mat("lawnB", "leafy_grass", 2.4, tint=srgb("#a8c48a"))
    plane("FLOOR_lawnB", 54, 5.5, (0, 0.0, 16.6), lawnB)
    # trees for depth: behind the houses and along the far pavement
    for k, (x, z) in enumerate([(-13.5, -9.5), (-4.4, -10.5), (4.6, -10.2), (13.4, -9.8), (-12, 13.4), (-3.5, 13.6), (5.5, 13.5), (13, 13.4)]):
        tree(f"tree{k}", (x, 0, z), h=6.5 if z < 0 else 5.2, seed=k)
    # porch dressing on the customer's house: doormat with WELCOME, the gnome, a plant
    mat = col_mat("mat", srgb("#5e3a20"), 0.95)
    box("FLOOR_doormat", 0.95, 0.025, 0.58, (d0, 0.42, -5.5), mat, bevel=0.01)
    text_mesh("mattext", "WELCOME", 0.17, (d0, 0.447, -5.5), col_mat("mattext_m", srgb("#d9b98a"), 0.9), depth=0.002)
    import_model("garden_gnome", "gnome", (d0 + 1.05, 0.42, -5.3), height=0.52, rot_y=-0.5)
    import_model("metal_trash_can", "bin", (3.7, 0.0, -5.4), height=1.0, rot_y=0.3)
    for k, x in enumerate((-9.0, 0.0, 9.0)):
        picket_fence(f"fence{k}", x - 3.9, x + 3.9, -0.62, gap=x - 1.6)
    mailbox((d0 - 0.95, 0.0, -0.95))
    for k, x in enumerate((-13.5, -4.5, 4.5, 13.5)): street_lamp(f"lamp{k}", (x, 0.14, 1.75))
    # realtime grass clumps along the garden edges and around the porch
    import random
    r = random.Random(7)
    base = import_model("grass_medium_01", "RT_grass", (0, -50, 0), height=0.35)
    gx = []
    for k in range(150 if not FAST else 30):
        x = r.uniform(-13, 13); z = r.uniform(-5.6, -0.7)
        if abs(x - d0) < 0.8 and z > -4.6: continue
        if abs(x - (-10.6)) < 0.8 and z > -4.6: continue
        if abs(x - 7.4) < 0.8 and z > -4.6: continue
        ob = base.copy(); ob.location = E(x, 0, z); ob.rotation_euler = (0, 0, r.uniform(0, 6.28)); ob.scale = (r.uniform(0.7, 1.3),) * 3; ob.name = f"RT_grass{k}"
        link(ob); gx.append(ob)
    bpy.data.objects.remove(base)
    # marks (engine coordinates)
    mark("door", (d0, 0.42, -5.75)); mark("mat", (d0, 0.42, -5.5)); mark("porch", (d0, 0.42, -5.05)); mark("porchL", (d0 - 0.9, 0.42, -5.2))
    mark("gnome", (d0 + 1.05, 0.42, -5.3)); mark("steps", (d0, 0, -3.95)); mark("path", (d0, 0, -2.4)); mark("gate", (d0, 0.14, -0.4))
    mark("pavement", (0.0, 0.14, 0.75)); mark("kerb", (0.0, 0.14, 1.85)); mark("vanStop", (-2.4, 0, 4.2)); mark("road", (0, 0, 6.6))
    mark("across", (0.0, 0.14, 12.5)); mark("door1", (d1, 0.42, -5.75)); mark("porch1", (d1, 0.42, -5.05)); mark("door2", (d2, 0.42, -5.75)); mark("porch2", (d2, 0.42, -5.05))
    mark("lawn", (2.0, 0, -2.6)); mark("center", (0, 0.14, 0.75))
    NOTES["wide"] = {"pos": [1.2, 2.6, 9.5], "look": [-0.6, 1.9, -5.0], "fov": 42}
    NOTES["camBox"] = {"min": [-26, 0.3, -5.0], "max": [26, 30, 18.5]}
    NOTES["interior"] = False
    NOTES["radius"] = 30



# ------------------------------------------------------------------------------------------------ interiors
def room_shell(prefix, W, D, H, wall, floor, ceil_col="#efe9df", window=None, door=None, wainscot=None, trim_col="#f1ece2"):
    """three walls (back at z = -D/2, sides at x = +-W/2), a floor and a ceiling; open toward +z. The side walls and the
    floor run 6 m past the front so wide shots never see the edge. window = (x0, x1, y0, y1) cut in the back wall."""
    trim = col_mat(f"{prefix}_trim", srgb(trim_col), 0.5)
    zb, ext = -D / 2, 6.0
    plane(f"FLOOR_{prefix}_floor", W, D + ext, (0, 0, zb + (D + ext) / 2), floor)
    box(f"{prefix}_ceil", W + 0.4, 0.2, D + ext, (0, H, zb + (D + ext) / 2), col_mat(f"{prefix}_ceil_m", srgb(ceil_col), 0.8), bevel=0.0)
    for sx in (-1, 1): box(f"{prefix}_side{sx}", 0.25, H, D + ext, (sx * (W / 2 + 0.125), 0, zb + (D + ext) / 2), wall, bevel=0.0)
    def back(x0, x1, y0, y1):
        if x1 - x0 > 0.01 and y1 - y0 > 0.01: box(f"{prefix}_back{x0:.1f}_{y0:.1f}", x1 - x0, y1 - y0, 0.25, ((x0 + x1) / 2, y0, zb - 0.125), wall, bevel=0.0)
    holes = [h for h in (window, door) if h]
    if not holes: back(-W / 2, W / 2, 0, H)
    else:
        xs = sorted({-W / 2, W / 2, *[v for h in holes for v in h[:2]]})
        for a, b in zip(xs, xs[1:]):
            h = next((h for h in holes if h[0] <= a + 1e-6 and h[1] >= b - 1e-6), None)
            if h is None: back(a, b, 0, H)
            else: back(a, b, 0, h[2]); back(a, b, h[3], H)
    if wainscot:
        box(f"{prefix}_wainB", W, 1.0, 0.03, (0, 0, zb + 0.015), wainscot, bevel=0.0)
        for sx in (-1, 1): box(f"{prefix}_wain{sx}", 0.03, 1.0, D + ext, (sx * (W / 2 - 0.015), 0, zb + (D + ext) / 2), wainscot, bevel=0.0)
        box(f"{prefix}_rail", W, 0.07, 0.06, (0, 1.0, zb + 0.03), trim)
        for sx in (-1, 1): box(f"{prefix}_rail{sx}", 0.06, 0.07, D + ext, (sx * (W / 2 - 0.03), 1.0, zb + (D + ext) / 2), trim)
    for sx in (-1, 1): box(f"{prefix}_skirt{sx}", 0.04, 0.12, D + ext, (sx * (W / 2 - 0.02), 0, zb + (D + ext) / 2), trim)
    box(f"{prefix}_skirtB", W, 0.12, 0.04, (0, 0, zb + 0.02), trim)
    if window:
        x0, x1, y0, y1 = window
        for xx in (x0, x1): box(f"{prefix}_wf{xx:.1f}", 0.1, y1 - y0, 0.3, (xx, y0, zb), trim)
        box(f"{prefix}_wfT", x1 - x0 + 0.1, 0.1, 0.3, ((x0 + x1) / 2, y1 - 0.05, zb), trim)
        box(f"{prefix}_wsill", x1 - x0 + 0.3, 0.06, 0.34, ((x0 + x1) / 2, y0 - 0.06, zb + 0.06), trim)
        n = max(1, round((x1 - x0) / 0.9))
        for k in range(1, n): box(f"{prefix}_wm{k}", 0.05, y1 - y0, 0.05, (x0 + k * (x1 - x0) / n, y0, zb), trim, bevel=0.0)
        box(f"{prefix}_wmh", x1 - x0, 0.05, 0.05, ((x0 + x1) / 2, (y0 + y1) / 2 + 0.25, zb), trim, bevel=0.0)


def backdrop(name, w, h, at, kind="city"):
    """the view outside a window or a door: painted, emissive (it is the light source the room sees)"""
    def fn(u, v, np):
        sky = np.stack([0.55 + 0.35 * v, 0.72 + 0.22 * v, 0.95 + 0.04 * v], -1)
        out = sky.copy()
        if kind == "city":
            import random
            r = random.Random(4)
            for k in range(14):
                x0 = r.uniform(-0.05, 0.95); bw = r.uniform(0.06, 0.16); bh = r.uniform(0.25, 0.7)
                m = (u > x0) & (u < x0 + bw) & (v < bh)
                c = np.array(r.choice([[0.62, 0.68, 0.78], [0.72, 0.7, 0.75], [0.55, 0.62, 0.74], [0.8, 0.76, 0.72]]))
                out[m] = c
                for wy in np.arange(0.05, bh, 0.06):
                    mm = m & (np.abs(v - wy) < 0.012) & ((np.floor((u - x0) * 120) % 2) == 0)
                    out[mm] = c * 1.15
            ground = v < 0.08; out[ground] = [0.45, 0.55, 0.4]
        else:  # yard: a car park and trees
            out[v < 0.3] = [0.62, 0.62, 0.6]
            trees = (v < 0.62) & (v > 0.25) & (np.sin(u * 40) * 0.06 + 0.5 > v)
            out[trees] = [0.35, 0.55, 0.3]
        return out
    im = gen_image(name, 1024, int(1024 * h / w), fn)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = im
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 2.2
    m["fit_uv"] = 1
    ob = box(name, w, h, 0.02, at, m, bevel=0.0)
    return ob


def sign_image(name, text, sub, bg, fg):
    """a printed poster / sign as an image (the text is drawn by Blender's own font through a temporary render)"""
    import numpy as np
    def fn(u, v, np):
        c = np.array(srgb(bg)); return np.ones(u.shape + (3,)) * c
    return gen_image(name, 512, 256, fn)



def get_mat(name, fn):
    return bpy.data.materials[name] if name in bpy.data.materials else fn()


def office_chair(name, at, rot=0.0):
    fab = get_mat("chair_fabric", lambda: col_mat("chair_fabric", srgb("#33465e"), 0.85))
    met = get_mat("chair_metal", lambda: col_mat("chair_metal", srgb("#2b2e33"), 0.4, 0.6))
    x, y, z = at
    box(f"{name}_seat", 0.52, 0.09, 0.5, (x, 0.46, z), fab, bevel=0.035)
    box(f"{name}_back", 0.48, 0.58, 0.08, (x, 0.6, z - 0.24), fab, bevel=0.035)
    cyl(f"{name}_lift", 0.03, 0.4, (x, 0.07, z), met, seg=10)
    for k in range(5):
        a = k * 2 * math.pi / 5
        box(f"{name}_leg{k}", 0.05, 0.04, 0.3, (x + math.sin(a) * 0.14, 0.05, z + math.cos(a) * 0.14), met, bevel=0.01, rot_y=a)
        cyl(f"{name}_wheel{k}", 0.03, 0.04, (x + math.sin(a) * 0.29, 0.0, z + math.cos(a) * 0.29), met, seg=8)


def filing_cabinet(name, at, h=1.32):
    met = get_mat("cab_metal", lambda: col_mat("cab_metal", srgb("#8f98a3"), 0.45, 0.5))
    dark = get_mat("cab_handle", lambda: col_mat("cab_handle", srgb("#2b2e33"), 0.4, 0.6))
    x, y, z = at
    box(f"{name}_body", 0.48, h, 0.6, (x, 0, z), met, bevel=0.012)
    n = 4
    for k in range(n):
        yy = 0.05 + k * (h - 0.08) / n
        box(f"{name}_dr{k}", 0.44, (h - 0.12) / n - 0.03, 0.02, (x, yy, z + 0.305), met, bevel=0.006)
        box(f"{name}_hd{k}", 0.14, 0.025, 0.03, (x, yy + (h - 0.12) / n * 0.6, z + 0.32), dark, bevel=0.006)


def blinds(prefix, x0, x1, ytop, ybot, z):
    slat = get_mat("slat", lambda: col_mat("slat", srgb("#ece8df"), 0.5))
    box(f"{prefix}_rail", x1 - x0 + 0.06, 0.06, 0.08, ((x0 + x1) / 2, ytop, z), slat, bevel=0.01)
    y = ytop - 0.05
    k = 0
    while y > ybot:
        ob = box(f"{prefix}_slat{k}", x1 - x0, 0.008, 0.055, ((x0 + x1) / 2, y, z), slat, bevel=0.0)
        ob.rotation_euler = (math.radians(35), 0, 0)
        y -= 0.055; k += 1


def desk_lamp(name, at):
    met = get_mat("lamp_metal", lambda: col_mat("lamp_metal", srgb("#2f6f6a"), 0.35, 0.5))
    x, y, z = at
    cyl(f"{name}_base", 0.09, 0.03, (x, y, z), met, seg=20)
    a = box(f"{name}_arm1", 0.025, 0.36, 0.025, (x, y + 0.02, z), met, bevel=0.005); a.rotation_euler = (0, math.radians(18), 0)
    box(f"{name}_arm2", 0.32, 0.025, 0.025, (x + 0.14, y + 0.36, z), met, bevel=0.005)
    cyl(f"{name}_shade", 0.1, 0.13, (x + 0.29, y + 0.24, z), met, seg=20, r2=0.04)
    cyl(f"{name}_bulb", 0.04, 0.03, (x + 0.29, y + 0.23, z), col_mat(f"{name}_glow", srgb("#fff0d0"), 0.3, emit=srgb("#ffe0b0"), emit_k=12.0), seg=12)


def phone(name, at):
    dark = get_mat("phone_m", lambda: col_mat("phone_m", srgb("#26282d"), 0.45))
    x, y, z = at
    box(f"{name}_base", 0.22, 0.07, 0.18, (x, y, z), dark, bevel=0.02)
    box(f"{name}_hand", 0.22, 0.04, 0.05, (x, y + 0.075, z - 0.04), dark, bevel=0.015)
    box(f"{name}_keys", 0.1, 0.005, 0.08, (x + 0.03, y + 0.07, z + 0.04), col_mat(f"{name}_k", srgb("#c9ced8"), 0.5), bevel=0.0)


def papers(name, at, n=6, seed=0):
    import random
    r = random.Random(seed)
    pap = get_mat("paper_m", lambda: col_mat("paper_m", srgb("#f6f3ec"), 0.8))
    x, y, z = at
    for k in range(n):
        ob = box(f"{name}{k}", 0.21, 0.004, 0.297, (x + r.uniform(-0.03, 0.03), y + k * 0.004, z + r.uniform(-0.03, 0.03)), pap, bevel=0.0)
        ob.rotation_euler = (0, 0, r.uniform(-0.25, 0.25))


def water_cooler(name, at):
    x, y, z = at
    box(f"{name}_body", 0.32, 0.95, 0.32, (x, 0, z), get_mat("cooler_m", lambda: col_mat("cooler_m", srgb("#e9ecef"), 0.4)), bevel=0.03)
    cyl(f"{name}_bottle", 0.13, 0.45, (x, 0.97, z), col_mat(f"{name}_water", srgb("#7fb8e0"), 0.08, alpha=0.6), seg=20)


def pinboard(name, at, w=1.1, h=0.75, seed=1):
    import random
    r = random.Random(seed)
    x, y, z = at
    box(f"{name}_frame", w + 0.06, h + 0.06, 0.03, (x, y - 0.03, z), get_mat("pin_frame", lambda: col_mat("pin_frame", srgb("#8a6a4a"), 0.6)), bevel=0.01)
    box(f"{name}_cork", w, h, 0.035, (x, y, z + 0.005), get_mat("cork_m", lambda: col_mat("cork_m", srgb("#b88a5a"), 0.9)), bevel=0.0)
    for k in range(9):
        c = r.choice(["#f2e86a", "#f4f0ea", "#8ad0f0", "#f0a0b8"])
        box(f"{name}_note{k}", r.uniform(0.12, 0.2), r.uniform(0.12, 0.18), 0.005, (x + r.uniform(-w / 2 + 0.12, w / 2 - 0.12), y + r.uniform(0.04, h - 0.22), z + 0.025),
            get_mat(f"note{c[1:]}", lambda c=c: col_mat(f"note{c[1:]}", srgb(c), 0.8)), bevel=0.0).rotation_euler = (0, r.uniform(-0.15, 0.15), 0)


def sky_plane(name, w, h, at):
    def fn(u, v, np):
        top = np.array([0.42, 0.62, 0.92]); hor = np.array([0.86, 0.92, 0.98])
        return hor[None, None, :] * (1 - v[..., None] ** 0.7) + top[None, None, :] * (v[..., None] ** 0.7)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = gen_image(name, 256, 256, fn)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); nt.links.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 1.6
    m["fit_uv"] = 1
    return box(name, w, h, 0.05, at, m, bevel=0.0)


def area_light(name, at, size, energy, col="#ffe9cc"):
    la = bpy.data.lights.new(name, "AREA"); la.size = size; la.energy = energy; la.color = srgb(col)
    ob = link(bpy.data.objects.new(name, la)); ob.location = E(*at); ob.rotation_euler = (0, 0, 0)  # area lights point down (-Z)
    return ob


def pendant(name, at, glow_k=6.0):
    dark = col_mat(f"{name}_shade", srgb("#2f3540"), 0.4, 0.4)
    cyl(f"{name}_cord", 0.008, 0.7, (at[0], at[1] + 0.15, at[2]), dark, seg=6)
    cyl(f"{name}_cone", 0.24, 0.22, (at[0], at[1] - 0.07, at[2]), dark, seg=24, r2=0.06)
    cyl(f"{name}_bulb", 0.07, 0.06, (at[0], at[1] - 0.1, at[2]), col_mat(f"{name}_glow", srgb("#fff0d0"), 0.3, emit=srgb("#ffe7c0"), emit_k=glow_k), seg=16)


def strip_light(name, at, length=2.4):
    box(f"{name}_housing", length, 0.08, 0.22, (at[0], at[1], at[2]), col_mat(f"{name}_h", srgb("#d9dde4"), 0.5), bevel=0.01)
    box(f"{name}_tube", length - 0.1, 0.03, 0.16, (at[0], at[1] - 0.03, at[2]), col_mat(f"{name}_t", srgb("#f6fbff"), 0.3, emit=srgb("#eef6ff"), emit_k=8.0), bevel=0.0)


def build_office():
    W, D, H = 6.4, 5.2, 3.3
    wall = tex_mat("off_wall", "clay_plaster", 2.0, paint="#9fc0c4")
    floor = tex_mat("off_floor", "wood_floor", 2.4, tint=srgb("#d8b890"))
    wain = tex_mat("off_wain", "brown_planks_05", 1.6, tint=srgb("#b88a64"))
    room_shell("off", W, D, H, wall, floor, window=(-0.6, 2.4, 1.0, 2.6), wainscot=wain)
    backdrop("off_view", 7.0, 4.5, (0.9, -0.4, -D / 2 - 3.2), "city")
    bpy.data.materials["off_view"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.3
    import_model("metal_office_desk", "desk", (0.7, 0, -1.55), height=0.76)
    import_model("Shelf_01", "shelfL", (-2.75, 0, -1.2), height=2.0, rot_y=math.pi / 2)
    box_src = import_model("cardboard_box_01", "obox0", (-2.8, 0.0, -0.9), height=0.32)
    r = __import__("random").Random(3)
    for k, (yy, zz) in enumerate([(0.42, -1.55), (0.42, -0.85), (1.02, -1.4), (1.02, -0.95), (1.62, -1.2), (0.0, 0.2), (0.0, 0.62), (0.34, 0.4)]):
        c = box_src.copy(); c.location = E(-2.78 if yy > 0 else -2.6, yy, zz); c.rotation_euler = (0, 0, r.uniform(-0.3, 0.3)); link(c)
    import_model("potted_plant_01", "plant", (2.75, 0, -2.1), height=1.3)
    office_chair("off_chair", (0.95, 0, -2.05))
    filing_cabinet("off_cab", (-2.05, 0, -2.25))
    filing_cabinet("off_cab2", (-1.55, 0, -2.25))
    desk_lamp("off_lamp", (1.45, 0.76, -1.75))
    phone("off_phone", (-0.05, 0.76, -1.5))
    papers("off_papers", (0.25, 0.765, -1.4), n=7, seed=2)
    papers("off_papers2", (1.15, 0.765, -1.35), n=3, seed=5)
    water_cooler("off_cooler", (2.7, 0, -0.6))
    pinboard("off_pin", (2.2, 1.35, -D / 2 + 0.03))
    blinds("off_blind", -0.6, 2.4, 2.58, 1.95, -D / 2 + 0.2)
    pst = bpy.data.materials.new("off_poster"); pst.use_nodes = True
    tx = pst.node_tree.nodes.new("ShaderNodeTexImage")
    def poster(u, v, np):
        out = np.ones(u.shape + (3,)) * np.array(srgb("#f6efe2"))
        out[(v > 0.72)] = srgb("#f08a24")
        cx, cy = 0.5, 0.42; rr = np.sqrt((u - cx) ** 2 * 1.0 + (v - cy) ** 2 * 2.2)
        out[(rr < 0.2) & (rr > 0.16)] = srgb("#2f5f8a")
        out[(np.abs(u - 0.43) < 0.02) & (np.abs(v - 0.47) < 0.04)] = srgb("#2f5f8a")
        out[(np.abs(u - 0.57) < 0.02) & (np.abs(v - 0.47) < 0.04)] = srgb("#2f5f8a")
        smile = (np.abs(np.sqrt((u - cx) ** 2 + (v - 0.44) ** 2 * 2.2) - 0.1) < 0.012) & (v < 0.4)
        out[smile] = srgb("#2f5f8a")
        return out
    tx.image = gen_image("off_poster_img", 384, 512, poster)
    pst.node_tree.links.new(tx.outputs["Color"], pst.node_tree.nodes["Principled BSDF"].inputs["Base Color"]); pst["fit_uv"] = 1
    box("off_poster", 0.75, 1.0, 0.01, (-1.6, 1.15, -D / 2 + 0.01), pst, bevel=0.0)["fit"] = 1
    for x in (-1.2, 1.6): pendant(f"off_pend{x:.0f}", (x, H - 0.75, -0.9))
    mark("desk", (-0.35, 0, -1.0)); mark("deskTop", (0.75, 0.76, -1.6)); mark("window", (0.9, 0, -2.1)); mark("center", (0.0, 0, 0.3))
    mark("guest", (1.3, 0, 0.4)); mark("shelf", (-2.3, 0, -1.0))
    NOTES["wide"] = {"pos": [0.4, 1.7, 4.8], "look": [0.2, 1.4, -1.6], "fov": 46}
    NOTES["camBox"] = {"min": [-W / 2 + 0.4, 0.3, -D / 2 + 0.6], "max": [W / 2 - 0.4, H - 0.3, 6.5]}
    NOTES["interior"] = True; NOTES["radius"] = 12
    NOTES["light"] = "interior"


def rack(prefix, x, z, w=2.6, h=3.0, d=0.8, levels=3, box_src=None, seed=0, rot=0.0):
    """steel pallet racking with cardboard boxes on its beams"""
    import random
    r = random.Random(seed)
    blue = col_mat("rack_blue", srgb("#2f5f9a"), 0.45, 0.3) if "rack_blue" not in bpy.data.materials else bpy.data.materials["rack_blue"]
    orange = col_mat("rack_or", srgb("#e8862e"), 0.45, 0.3) if "rack_or" not in bpy.data.materials else bpy.data.materials["rack_or"]
    deck = col_mat("rack_deck", srgb("#9aa2ae"), 0.6, 0.4) if "rack_deck" not in bpy.data.materials else bpy.data.materials["rack_deck"]
    for sx in (-1, 1):
        for sz in (-1, 1): box(f"{prefix}_up{sx}{sz}", 0.08, h, 0.08, (x + sx * w / 2, 0, z + sz * d / 2), blue, bevel=0.01)
    for k in range(levels):
        y = 0.15 + k * (h - 0.3) / max(1, levels - 1) if levels > 1 else 0.15
        for sz in (-1, 1): box(f"{prefix}_beam{k}{sz}", w, 0.1, 0.05, (x, y, z + sz * d / 2), orange, bevel=0.008)
        box(f"{prefix}_deck{k}", w, 0.03, d, (x, y + 0.1, z), deck, bevel=0.0)
        if box_src:
            xx = x - w / 2 + 0.3
            while xx < x + w / 2 - 0.3:
                if r.random() < 0.85:
                    c = box_src.copy(); sc = r.uniform(0.75, 1.3); c.scale = (sc, sc, sc)
                    c.location = E(xx, y + 0.13, z + r.uniform(-0.15, 0.15)); c.rotation_euler = (0, 0, r.uniform(-0.25, 0.25)); link(c)
                    if r.random() < 0.4 and k < levels - 1:
                        c2 = box_src.copy(); c2.scale = (sc * 0.8,) * 3; c2.location = E(xx + 0.05, y + 0.13 + 0.32 * sc, z); link(c2)
                xx += r.uniform(0.45, 0.6)


def build_depot():
    W, D, H = 10.0, 9.0, 5.6
    wall = tex_mat("dep_wall", "corrugated_iron", 1.4, paint="#c9d2d8")
    floor = tex_mat("dep_floor", "brushed_concrete", 3.0, tint=srgb("#b8b4ac"))
    room_shell("dep", W, D, H, wall, floor, ceil_col="#c8ccd2", door=(-2.0, 1.6, 0.0, 3.8), window=(2.8, 4.6, 2.6, 3.8))
    yardz = -D / 2 - 0.3
    plane("dep_yard", 40, 24, (0, 0.0, yardz - 12), tex_mat("dep_yard_m", "asphalt_02", 4.0, tint=srgb("#a8a8ae")))
    sky_plane("dep_sky", 60, 22, (0, -2, yardz - 24))
    for k, x in enumerate((-7, -2, 3, 8)): tree(f"dep_tree{k}", (x, 0, yardz - 16 - (k % 2) * 2), h=6.0, seed=20 + k)
    fence_m = col_mat("dep_fence", srgb("#5a6270"), 0.5, 0.5)
    for k in range(-10, 11): box(f"dep_fpost{k}", 0.06, 2.0, 0.06, (k * 2.0, 0, yardz - 11), fence_m, bevel=0.0)
    for yy in (0.2, 1.0, 1.95): box(f"dep_frail{yy}", 42, 0.04, 0.04, (0, yy, yardz - 11), fence_m, bevel=0.0)
    van_glb = os.path.join(OUT, "..", "van", "van.glb")
    if os.path.exists(van_glb):
        for k, (x, z, ry) in enumerate([(-1.2, yardz - 4.6, 0.15), (3.8, yardz - 6.2, -0.2)]):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=van_glb)
            for o in [o for o in bpy.data.objects if o not in before and o.parent is None]:
                o.location = E(x, 0, z); o.rotation_euler = (0, 0, math.pi / 2 + ry)
            for o in [o for o in bpy.data.objects if o not in before]:
                o.name = f"dep_van{k}_" + o.name
    steel = col_mat("dep_steel", srgb("#4a5260"), 0.5, 0.5)
    for x in (-3.0, 0.0, 3.0): box(f"dep_truss{x:.0f}", 0.18, 0.3, D + 6, (x, H - 0.5, 1.0), steel, bevel=0.0)
    box("dep_doorframe", 3.8, 0.25, 0.3, (-0.2, 3.8, -D / 2 + 0.05), col_mat("dep_yellow", srgb("#e8b62e"), 0.5), bevel=0.02)
    box("dep_shutter", 3.6, 0.6, 0.12, (-0.2, 3.85 - 0.3, -D / 2 + 0.12), col_mat("dep_shut", srgb("#9aa2ae"), 0.5, 0.3), bevel=0.01)
    yellow = col_mat("dep_line", srgb("#f0c23a"), 0.6)
    for x in (-2.4, 2.0): box(f"FLOOR_dep_line{x:.0f}", 0.1, 0.006, D + 4, (x, 0, 0.5), yellow, bevel=0.0)
    src = import_model("cardboard_box_01", "dbox0", (0, -20, 0), height=0.36)
    for k, (x, z) in enumerate([(-4.2, -2.6), (-4.2, 0.2), (4.2, -1.0), (4.2, 1.8)]):
        rack(f"dep_rack{k}", x, z, w=2.6, h=3.4, d=0.9, levels=3, box_src=src, seed=k)
        bpy.data.objects[f"dep_rack{k}_up-1-1"]  # (exists)
    for k, (x, z) in enumerate([(-1.5, 2.2), (2.6, -3.2)]):  # pallets of parcels
        box(f"dep_pallet{k}", 1.2, 0.14, 1.0, (x, 0, z), col_mat(f"dep_pal{k}", srgb("#b88a5a"), 0.8), bevel=0.01)
        for j in range(5):
            c = src.copy(); c.location = E(x + (j % 3 - 1) * 0.38, 0.14 + (j // 3) * 0.36, z + (j % 2) * 0.2 - 0.1); c.scale = (1.1,) * 3; link(c)
    bpy.data.objects.remove(src)
    import_model("hand_truck", "truck", (1.4, 0, -2.6), height=1.25, rot_y=0.5)
    import_model("plastic_crate_01", "crate1", (-1.2, 0, -3.4), height=0.32)
    for x in (-3.0, 0.0, 3.0):
        for z in (-2.5, 1.0): strip_light(f"dep_strip{x:.0f}{z:.0f}", (x, H - 0.7, z))
    mark("rack", (-0.4, 0, 0.3)); mark("board", (1.6, 0, -0.4)); mark("dex", (0.6, 0, 1.2)); mark("door", (-0.2, 0, -3.8)); mark("center", (0, 0, 1.0))
    NOTES["wide"] = {"pos": [0.6, 2.2, 7.5], "look": [0.0, 1.8, -2.0], "fov": 48}
    NOTES["camBox"] = {"min": [-W / 2 + 0.5, 0.3, -D / 2 + 0.8], "max": [W / 2 - 0.5, H - 0.6, 7.5]}
    NOTES["interior"] = True; NOTES["radius"] = 16
    NOTES["light"] = "interior"


def light_interior():
    w = bpy.data.worlds.new("world"); SC.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("#c9d8ea"), 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 4.0; sun.angle = math.radians(1.5); sun.color = srgb("#ffe6c4")
    so = link(bpy.data.objects.new("sun", sun))
    d = Vector((0.35, 0.62, -0.7)).normalized()  # from behind the back wall: light falls in through the window / door
    bd = Vector((d.x, -d.z, d.y)); so.rotation_euler = bd.to_track_quat("Z", "Y").to_euler()
    NOTES["sun"] = {"dir": [round(v, 3) for v in d], "color": "#ffe6c4", "energy": 4.0}
    bb = NOTES["camBox"]
    W = (bb["max"][0] - bb["min"][0]) + 0.8
    H = bb["max"][1] + 0.3
    for k, x in enumerate((-W / 4, W / 4)):
        for z in (-1.5, 1.5):
            area_light(f"fill{k}{z:.0f}", (x, H - 0.25, z), 2.0, 260.0)

# ------------------------------------------------------------------------------------------------ VAN (an asset: exported without a bake, lit live)
def profile_solid(name, pts, w, mat, bevel=0.05):
    """a side profile (engine x, y) extruded across the width (engine z from -w/2 to w/2)"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    a = [bm.verts.new(Vector((x, w / 2, y))) for (x, y) in pts]   # Blender y = -engine z
    b = [bm.verts.new(Vector((x, -w / 2, y))) for (x, y) in pts]
    bm.faces.new(a); bm.faces.new(b[::-1])
    n = len(pts)
    for k in range(n): bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    if bevel: md = ob.modifiers.new("bev", "BEVEL"); md.width = bevel; md.segments = 3; md.limit_method = "ANGLE"
    return ob


def wheel(name, at, r=0.38, wdt=0.27):
    tyre = col_mat("tyre", srgb("#1d1e22"), 0.92) if "tyre" not in bpy.data.materials else bpy.data.materials["tyre"]
    rim = col_mat("rim", srgb("#c9ced8"), 0.35, 0.7) if "rim" not in bpy.data.materials else bpy.data.materials["rim"]
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=r, radius2=r, depth=wdt)
    t2 = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r * 0.58, radius2=r * 0.58, depth=wdt + 0.02)
    for v in bm.verts: v.co = Vector((v.co.x, v.co.z, v.co.y))  # axle along Blender y (= engine z)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(tyre); me.materials.append(rim)
    for p in me.polygons:
        c = p.center; p.use_smooth = True
        if abs(c.y) > wdt / 2 + 0.005: p.material_index = 1  # the rim caps stand 1 cm proud of the tyre walls
    ob.location = E(*at)
    return ob


# A delivery van modelled for close-ups: a lofted body (rounded roof, raked fascia, plan-view rounded corners), real
# window openings with rubber seals and a hollow cab, wheel arches with flares, lathe-turned tyres and hubcaps,
# wrap-around bumpers, headlights, grille, mirrors, wipers, seams, handles and the Swift Parcel livery.
# Engine axes: x forward, y up, z to the van's right (toward the default camera). Coordinates in metres.

def rrect_ring(y0, y1, hw, rt, rb, tb, yb, counts=(3, 5, 5, 6, 6, 4)):
    """a cross-section (engine z, y), counter-clockwise from the bottom centre: rounded bottom corners (rb), a vertical
    side up to the belt line yb, a side leaning in by tb above it, rounded roof corners (rt)"""
    nb, nc, ns1, ns2, nr, nt = counts
    yb = max(y0 + rb + 0.01, min(yb, y1 - rt - 0.01))
    right = []
    def seg(p, q, n):
        for k in range(n):
            t = k / n; right.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    def arc(c, r, a0, a1, n):
        for k in range(n):
            a = a0 + (a1 - a0) * k / n; right.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    seg((0.0, y0), (hw - rb, y0), nb)
    arc((hw - rb, y0 + rb), rb, -math.pi / 2, 0.0, nc)
    seg((hw, y0 + rb), (hw, yb), ns1)
    seg((hw, yb), (hw - tb, y1 - rt), ns2)
    arc((hw - tb - rt, y1 - rt), rt, 0.0, math.pi / 2, nr)
    seg((hw - tb - rt, y1), (0.0, y1), nt)
    return right + [(0.0, y1)] + [(-z, y) for (z, y) in reversed(right[1:])]


def mesh_obj(name, bm, mats, smooth=True, sharp=35):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
        try: me.set_sharp_from_angle(angle=math.radians(sharp))
        except Exception: pass
    return ob


def loft(name, stations, mat, counts=(3, 5, 5, 6, 6, 4)):
    """a closed body through cross-sections: stations = [(x, y0, y1, hw, rt, rb, tb, yb)] (see rrect_ring)"""
    bm = bmesh.new(); rings = []
    for (x, y0, y1, hw, rt, rb, tb, yb) in stations:
        rings.append([bm.verts.new(E(x, y, z)) for (z, y) in rrect_ring(y0, y1, hw, rt, rb, tb, yb, counts)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n; bm.faces.new([a[i], a[j], b[j], b[i]])
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, [mat])


def sweep(name, prof, frames, mat, closed=False, cap=True, smooth=True):
    """a profile [(a, b)] swept along frames [(P, A, B)] (Blender vectors): vertex = P + a*A + b*B"""
    bm = bmesh.new()
    rings = [[bm.verts.new(P + A * a + B * b) for (a, b) in prof] for (P, A, B) in frames]
    m = len(prof)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for r0, r1 in pairs:
        for i in range(m):
            j = (i + 1) % m; bm.faces.new([r0[i], r0[j], r1[j], r1[i]])
    if cap and not closed:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, [mat], smooth=smooth)


def edir(x, y, z):
    """an engine-space direction as a Blender vector"""
    return Vector((x, -z, y))


def slab(name, c, size, mat, bevel=0.01, tilt=0.0, yaw=0.0):
    """a box of engine size (sx, sy, sz) centred at engine point c, tilted about the lateral axis (top back by `tilt`
    radians) and turned about the vertical by `yaw`"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((size[0], size[2], size[1])), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    ob.location = E(*c); ob.rotation_euler = (0.0, -tilt, -yaw)
    if bevel:
        md = ob.modifiers.new("bev", "BEVEL"); md.width = bevel; md.segments = 3; md.limit_method = "ANGLE"
    return ob


def disc(name, c, r, depth, mat, axis="x", seg=24, r2=None):
    """a short cylinder centred at engine point c with its axis along engine x / y / z"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    ob.location = E(*c)
    ob.rotation_euler = {"x": (0, math.pi / 2, 0), "y": (0, 0, 0), "z": (math.pi / 2, 0, 0)}[axis]
    for p in me.polygons: p.use_smooth = True
    try: me.set_sharp_from_angle(angle=math.radians(40))
    except Exception: pass
    return ob


VAN_ST = [  # (x, y0, y1, hw, rt, rb, tb, yb)
    (-2.66, 0.52, 2.48, 0.90, 0.10, 0.06, 0.03, 1.35),
    (-2.64, 0.46, 2.56, 0.96, 0.13, 0.06, 0.03, 1.35),
    (-2.60, 0.43, 2.60, 0.99, 0.15, 0.06, 0.03, 1.35),
    (-2.50, 0.42, 2.62, 1.00, 0.16, 0.06, 0.03, 1.35),
    (0.80, 0.42, 2.62, 1.00, 0.16, 0.06, 0.03, 1.35),
    (1.00, 0.42, 2.60, 1.00, 0.17, 0.06, 0.04, 1.35),
    (1.15, 0.42, 2.54, 1.00, 0.18, 0.06, 0.05, 1.35),
    (1.30, 0.42, 2.40, 1.00, 0.20, 0.06, 0.07, 1.35),
    (1.60, 0.42, 1.98, 1.00, 0.20, 0.06, 0.08, 1.35),
    (1.90, 0.42, 1.56, 1.00, 0.20, 0.06, 0.08, 1.35),
    (2.05, 0.42, 1.47, 0.995, 0.19, 0.06, 0.07, 1.30),
    (2.40, 0.42, 1.38, 0.985, 0.18, 0.06, 0.06, 1.20),
    (2.56, 0.43, 1.33, 0.97, 0.17, 0.07, 0.05, 1.10),
    (2.64, 0.45, 1.27, 0.95, 0.16, 0.08, 0.04, 1.00),
    (2.69, 0.47, 1.18, 0.93, 0.15, 0.09, 0.03, 0.95),
    (2.72, 0.49, 1.02, 0.91, 0.14, 0.09, 0.02, 0.85),
    (2.745, 0.50, 0.82, 0.89, 0.12, 0.08, 0.01, 0.70),
    (2.76, 0.52, 0.64, 0.87, 0.06, 0.05, 0.0, 0.60),
]


def van_station(x):
    st = VAN_ST
    if x <= st[0][0]: return st[0]
    for a, b in zip(st, st[1:]):
        if a[0] <= x <= b[0]:
            t = (x - a[0]) / max(1e-9, b[0] - a[0]); return tuple(a[k] + (b[k] - a[k]) * t for k in range(8))
    return st[-1]


def van_side_z(x, y):
    """the body side's z (> 0) at engine (x, y), for points on the side below the roof corner"""
    _, y0, y1, hw, rt, rb, tb, yb = van_station(x)
    yb = max(y0 + rb + 0.01, min(yb, y1 - rt - 0.01))
    if y <= yb: return hw
    return hw - tb * min(1.0, (y - yb) / max(1e-6, (y1 - rt) - yb))


def van_top_y(x, z):
    """the body top's y at engine (x, z) for |z| inside the roof (incl. the rounded corner)"""
    _, y0, y1, hw, rt, rb, tb, yb = van_station(x)
    flat = hw - tb - rt; az = abs(z)
    if az <= flat: return y1
    d = min(rt, az - flat)
    return y1 - rt + math.sqrt(max(0.0, rt * rt - d * d))


def van_wheel(name, at, side, mats):
    """a lathe-turned tyre on a steel rim with a dished hubcap (outer face toward engine z * side); origin at the hub,
    axle along engine z"""
    tyre, steel, cap, slot, badge = mats
    R = 0.382
    tyre_p = [(0.262, -0.105), (0.30, -0.118), (0.345, -0.12), (0.368, -0.11), (0.38, -0.088), (0.382, -0.062), (0.375, -0.056),
              (0.375, -0.042), (0.382, -0.036), (0.382, -0.012), (0.375, -0.007), (0.375, 0.007), (0.382, 0.012), (0.382, 0.036),
              (0.375, 0.042), (0.375, 0.056), (0.382, 0.062), (0.38, 0.088), (0.368, 0.11), (0.345, 0.12), (0.30, 0.118), (0.262, 0.105)]
    cap_p = [(0.262, 0.105), (0.255, 0.096), (0.232, 0.086), (0.205, 0.074), (0.12, 0.08), (0.075, 0.088), (0.058, 0.098), (0.0, 0.101)]
    back_p = [(0.262, -0.105), (0.24, -0.07), (0.0, -0.07)]
    N = 56
    bm = bmesh.new()
    def lathe(prof, mi):
        rings = []
        for k in range(N):
            f = 2 * math.pi * k / N
            # Blender: axle along y (engine z); outer face toward engine z * side -> Blender y = -side * a
            rings.append([bm.verts.new(Vector((r * math.cos(f), -side * a, r * math.sin(f)))) if r > 1e-6 else None for (r, a) in prof])
        for k in range(N):
            r0, r1 = rings[k], rings[(k + 1) % N]
            for i in range(len(prof) - 1):
                q = [v for v in (r0[i], r1[i], r1[i + 1], r0[i + 1]) if v is not None]
                if len(q) >= 3:
                    try: bm.faces.new(q).material_index = mi
                    except ValueError: pass
    # the hub centre is a single vertex shared by the cap's last ring
    lathe(tyre_p, 0)
    centre_o = bm.verts.new(Vector((0, -side * 0.101, 0))); centre_i = bm.verts.new(Vector((0, side * 0.07, 0)))
    def lathe_to(prof, mi, centre):
        rings = []
        for k in range(N):
            f = 2 * math.pi * k / N
            rings.append([bm.verts.new(Vector((r * math.cos(f), -side * a, r * math.sin(f)))) for (r, a) in prof[:-1]])
        for k in range(N):
            r0, r1 = rings[k], rings[(k + 1) % N]
            for i in range(len(prof) - 2):
                bm.faces.new([r0[i], r1[i], r1[i + 1], r0[i + 1]]).material_index = mi
            bm.faces.new([r0[-1], r1[-1], centre]).material_index = mi
    lathe_to(cap_p, 1, centre_o)
    lathe_to(back_p, 1, centre_i)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, [tyre, cap], sharp=50)
    parts = [ob]
    # ventilation slots, wheel nuts and the badge on the hubcap
    for k in range(8):
        f = 2 * math.pi * (k + 0.5) / 8; r = 0.16
        s = slab(f"{name}_slot{k}", (0, 0, 0), (0.07, 0.03, 0.01), slot, bevel=0.0)
        s.location = Vector((r * math.cos(f), -side * 0.082, r * math.sin(f))); s.rotation_euler = (0, -f, 0)
        parts.append(s)
    for k in range(5):
        f = 2 * math.pi * k / 5; r = 0.088
        n = disc(f"{name}_nut{k}", (0, 0, 0), 0.014, 0.02, steel, axis="z", seg=6)
        n.location = Vector((r * math.cos(f), -side * 0.094, r * math.sin(f))); parts.append(n)
    b = disc(f"{name}_badge", (0, 0, 0), 0.04, 0.012, badge, axis="z", seg=20)
    b.location = Vector((0, -side * 0.104, 0)); parts.append(b)
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for p in parts[1:]:
        for md in list(p.modifiers):
            bpy.context.view_layer.objects.active = p
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception: p.modifiers.remove(md)
    bpy.context.view_layer.objects.active = ob
    for p in parts: p.select_set(True)
    bpy.ops.object.join()
    ob.name = name; ob.location = E(*at)
    return ob


def build_van():
    paint = col_mat("van_paint", srgb("#f3efe6"), 0.3)
    trim = col_mat("van_trim", srgb("#2b2e34"), 0.7)
    cab = col_mat("van_cab", srgb("#3a3e46"), 0.85)
    rubber = col_mat("van_rubber", srgb("#1f2126"), 0.8)
    orange = col_mat("van_stripe", srgb("#ec8a2c"), 0.45)
    orange2 = col_mat("van_stripe2", srgb("#f6b25a"), 0.45)
    orange3 = col_mat("van_stripe3", srgb("#c8661c"), 0.45)
    navy = col_mat("van_logo", srgb("#1f3a5f"), 0.45)
    glass = col_mat("van_glass", srgb("#2a3b4c"), 0.05, alpha=0.38)
    dglass = col_mat("van_glass_dark", srgb("#24313f"), 0.08)
    chrome = col_mat("van_chrome", srgb("#c9ced6"), 0.25, 0.6)
    head = col_mat("lens_head", srgb("#f4f1e8"), 0.15)
    tail = col_mat("lens_tail", srgb("#d22a2a"), 0.25)
    amber = col_mat("van_amber", srgb("#f39a1e"), 0.25)
    white = col_mat("van_plate", srgb("#f7f6f2"), 0.5)
    fabric = col_mat("van_seat", srgb("#3c414b"), 0.9)
    tyre = col_mat("tyre", srgb("#232529"), 0.92)
    cap = col_mat("van_hubcap", srgb("#c3c8d0"), 0.35, 0.4)
    slotm = col_mat("van_slot", srgb("#2a2d33"), 0.6)
    badge = col_mat("van_badge", srgb("#ec8a2c"), 0.4)
    W = 2.0

    # ---- body: loft, arches, the cab cavity, window openings
    body = loft("van_body", VAN_ST, paint)
    def cut(c):
        md = body.modifiers.new(c.name, "BOOLEAN"); md.operation = "DIFFERENCE"; md.object = c; md.solver = "EXACT"
        c.hide_render = True; c.display_type = "WIRE"; c["cutter"] = 1
    for x in (-1.75, 1.7):
        c = disc(f"arch{x}", (x, 0.40, 0), 0.475, W + 0.6, trim, axis="z", seg=48); cut(c)
    cav_st = []
    for x in (0.32, 0.6, 0.8, 1.0, 1.15, 1.3, 1.6, 1.9, 2.05, 2.25):
        _, y0, y1, hw, rt, rb, tb, yb = van_station(x)
        cav_st.append((x, 0.92, y1 - 0.07, hw - 0.07, max(0.05, rt - 0.05), 0.04, tb, yb))
    cav = loft("cab_cavity", cav_st, cab); cut(cav)
    # windscreen opening: a band over the sloped top between the roof curve and the cowl
    ws_x0, ws_x1, ws_z = 1.335, 1.875, 0.80
    ws_st = [(x, van_top_y(x, 0) - 0.32, van_top_y(x, 0) + 0.3, ws_z, 0.0, 0.0, 0.0, 0.0) for x in (ws_x0, (ws_x0 + ws_x1) / 2, ws_x1)]
    bm = bmesh.new(); rings = []
    for (x, y0, y1, hw, *_r) in ws_st:
        rings.append([bm.verts.new(E(x, y, z)) for (z, y) in ((-hw, y0), (hw, y0), (hw, y1), (-hw, y1))])
    for a, b2 in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4; bm.faces.new([a[i], a[j], b2[j], b2[i]])
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cut(mesh_obj("ws_cut", bm, [cab], smooth=False))
    # side windows (front doors): the rear edge is the B-pillar, the front edge runs parallel to the A-pillar
    win = [(0.94, 1.42), (1.88, 1.42), (1.25, 2.30), (0.94, 2.30)]
    for sz in (-1, 1):
        bm = bmesh.new()
        a = [bm.verts.new(E(x, y, sz * 0.80)) for (x, y) in win]; b2 = [bm.verts.new(E(x, y, sz * 1.25)) for (x, y) in win]
        bm.faces.new(a); bm.faces.new(b2[::-1])
        for i in range(4):
            j = (i + 1) % 4; bm.faces.new([a[i], a[j], b2[j], b2[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        cut(mesh_obj(f"win_cut{sz}", bm, [cab], smooth=False))

    # ---- glass: the windscreen follows the roof's curve, the side windows lean with the side
    bm = bmesh.new(); NX, NZ = 8, 18; grid = []
    for i in range(NX + 1):
        x = ws_x0 - 0.01 + (ws_x1 - ws_x0 + 0.02) * i / NX; row = []
        for k in range(NZ + 1):
            z = -(ws_z + 0.01) + 2 * (ws_z + 0.01) * k / NZ
            row.append(bm.verts.new(E(x, van_top_y(x, z) - 0.02, z)))
        grid.append(row)
    for i in range(NX):
        for k in range(NZ): bm.faces.new([grid[i][k], grid[i + 1][k], grid[i + 1][k + 1], grid[i][k + 1]])
    mesh_obj("van_screen", bm, [glass])
    for sz in (-1, 1):
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(E(x, y, sz * (van_side_z(x, y) - 0.025))) for (x, y) in (win if sz > 0 else win[::-1])])
        mesh_obj(f"van_sidewin{sz}", bm, [glass], smooth=False)
        # rubber seal round the opening (mitred corners)
        n = len(win); fr = []
        for i in range(n + 1):
            p = win[i % n]; pa = win[(i - 1) % n]; pb = win[(i + 1) % n]
            def nrm(u, v):
                dx, dy = v[0] - u[0], v[1] - u[1]; L = math.hypot(dx, dy); return (dy / L, -dx / L)
            n1, n2 = nrm(pa, p), nrm(p, pb); m = (n1[0] + n2[0], n1[1] + n2[1]); L = math.hypot(*m); m = (m[0] / L, m[1] / L)
            k = 1.0 / max(0.3, m[0] * n1[0] + m[1] * n1[1])
            fr.append((E(p[0], p[1], sz * (van_side_z(p[0], p[1]) - 0.004)), edir(0, 0, sz), edir(m[0] * k, m[1] * k, 0)))
        sweep(f"van_seal{sz}", [(-0.012, -0.012), (0.01, -0.012), (0.012, 0.004), (0.006, 0.032), (-0.012, 0.032)], fr, rubber, cap=False)
    # windscreen seal: four strips on the surface
    def surf(x, z): return E(x, van_top_y(x, z), z)
    def snorm(x, z):
        dx = surf(x + 0.01, z) - surf(x - 0.01, z); dz = surf(x, z + 0.01) - surf(x, z - 0.01); n = dx.cross(dz).normalized()
        return n if n.z > 0 else -n
    for nm, pts, outdir in (("t", [(ws_x0, -ws_z + k * 2 * ws_z / 16) for k in range(17)], "x-"), ("b", [(ws_x1, -ws_z + k * 2 * ws_z / 16) for k in range(17)], "x+"),
                            ("l", [(ws_x0 + k * (ws_x1 - ws_x0) / 8, -ws_z) for k in range(9)], "z-"), ("r", [(ws_x0 + k * (ws_x1 - ws_x0) / 8, ws_z) for k in range(9)], "z+")):
        fr = []
        for (x, z) in pts:
            N_ = snorm(x, z)
            if outdir[0] == "x": t = (surf(x + 0.01, z) - surf(x - 0.01, z)).normalized() * (1 if outdir[1] == "+" else -1)
            else: t = (surf(x, z + 0.01) - surf(x, z - 0.01)).normalized() * (1 if outdir[1] == "+" else -1)
            fr.append((surf(x, z) - N_ * 0.004, N_, t))
        sweep(f"van_wseal{nm}", [(-0.012, -0.014), (0.012, -0.014), (0.012, 0.03), (-0.012, 0.03)], fr, rubber)

    # ---- arches: flared plastic lips
    for x in (-1.75, 1.7):
        for sz in (-1, 1):
            fr = []
            for k in range(29):
                th = math.radians(-6 + 192 * k / 28)
                P = E(x + 0.49 * math.cos(th), 0.40 + 0.49 * math.sin(th), sz * 0.995)
                fr.append((P, edir(math.cos(th), math.sin(th), 0), edir(0, 0, sz)))
            sweep(f"van_flare{x}{sz}", [(-0.02, -0.01), (0.07, -0.01), (0.09, 0.015), (0.075, 0.042), (-0.02, 0.046)], fr, trim)

    # ---- bumpers (wrap round the corners), rub strips
    def plan_path(xf, zc, rr, xs, sgn):
        """a plan-view path round a bumper: sides from x = xs to the corner, a corner arc of radius rr, the face at xf"""
        pts = []
        xc = xf - sgn * rr
        for z in (-zc - rr,):
            pts += [((xs + (xc - xs) * t), -zc - rr, (0, -1)) for t in (0.0, 0.5)]
        for k in range(9):
            a = -math.pi / 2 + (math.pi / 2) * k / 8 if sgn > 0 else -math.pi / 2 - (math.pi / 2) * k / 8
            pts.append((xc + rr * math.cos(a), -zc + rr * math.sin(a), (math.cos(a), math.sin(a))))
        for k in range(1, 6):
            z = -zc + 2 * zc * k / 6; pts.append((xf, z, (sgn, 0)))
        for k in range(9):
            a = (0.0 if sgn > 0 else math.pi) + (math.pi / 2 if sgn > 0 else -math.pi / 2) * k / 8
            pts.append((xc + rr * math.cos(a), zc + rr * math.sin(a), (math.cos(a), math.sin(a))))
        pts += [((xc + (xs - xc) * t), zc + rr, (0, 1)) for t in (0.5, 1.0)]
        return pts
    for nm, xf, zc, rr, xs, sgn, yc, prof in (
            ("F", 2.79, 0.74, 0.24, 2.22, 1, 0.47, [(-0.08, -0.19), (0.02, -0.19), (0.055, -0.16), (0.065, -0.06), (0.065, 0.1), (0.045, 0.17), (0.0, 0.19), (-0.08, 0.19)]),
            ("R", -2.69, 0.74, 0.24, -2.24, -1, 0.46, [(-0.08, -0.16), (0.02, -0.16), (0.05, -0.13), (0.06, 0.06), (0.11, 0.13), (0.11, 0.16), (-0.08, 0.16)])):
        fr = [(E(x, yc, z), edir(nx, 0, nz), edir(0, 1, 0)) for (x, z, (nx, nz)) in plan_path(xf, zc, rr, xs, sgn)]
        sweep(f"van_bumper{nm}", prof, fr, trim)
    for sz in (-1, 1):
        for x0, x1 in ((-1.20, 1.14), (-2.55, -2.28), (2.21, 2.30)):
            fr = [(E(x, 0.70, sz * 0.998), edir(0, 0, sz), edir(0, 1, 0)) for x in (x0, x1)]
            sweep(f"van_rub{x0}{sz}", [(-0.01, -0.055), (0.018, -0.055), (0.028, -0.03), (0.028, 0.03), (0.018, 0.055), (-0.01, 0.055)], fr, trim)
        # mud flaps
        for x in (1.17, -2.28):
            slab(f"van_flap{x}{sz}", (x, 0.27, sz * 0.93), (0.02, 0.26, 0.22), rubber, bevel=0.004)

    # ---- front: headlights, grille, badge, lower grille, fog lights, plate, wipers
    tilt = math.atan(0.153)
    def fascia_x(y): return 2.69 + (1.18 - y) * 0.153
    for sz in (-1, 1):
        y = 1.06; x = fascia_x(y)
        slab(f"van_hlhouse{sz}", (x + 0.005, y, sz * 0.62), (0.05, 0.22, 0.38), trim, bevel=0.02, tilt=tilt, yaw=sz * 0.12)
        slab(f"van_hl{sz}", (x + 0.025, y, sz * 0.62), (0.02, 0.18, 0.34), head, bevel=0.012, tilt=tilt, yaw=sz * 0.12)
        for k, dz in enumerate((-0.08, 0.06)):
            disc(f"van_hlp{sz}{k}", (x + 0.04, y + 0.01, sz * (0.62 + dz)), 0.045, 0.02, chrome, axis="x", seg=20)
        slab(f"van_drl{sz}", (x + 0.042, y - 0.07, sz * 0.62), (0.008, 0.018, 0.30), white, bevel=0.0, tilt=tilt, yaw=sz * 0.12)
        disc(f"van_fog{sz}", (2.86, 0.40, sz * 0.66), 0.05, 0.03, head, axis="x", seg=20)
        disc(f"van_fogr{sz}", (2.85, 0.40, sz * 0.66), 0.065, 0.02, chrome, axis="x", seg=20)
    y = 0.82; x = fascia_x(y)
    slab("van_grille", (x + 0.01, y, 0), (0.04, 0.32, 0.84), trim, bevel=0.02, tilt=tilt)
    for k in range(4):
        yy = 0.70 + k * 0.075
        slab(f"van_slat{k}", (fascia_x(yy) + 0.035, yy, 0), (0.02, 0.022, 0.76), cab, bevel=0.006, tilt=tilt)
    disc("van_badge_f", (fascia_x(0.86) + 0.05, 0.86, 0), 0.06, 0.016, badge, axis="x", seg=24)
    slab("van_lowgrille", (2.85, 0.37, 0), (0.02, 0.1, 0.9), cab, bevel=0.01)
    slab("van_plateF", (2.86, 0.52, 0), (0.012, 0.12, 0.5), white, bevel=0.006)
    t = text_mesh("van_plateFt", "SP 214", 0.085, (2.868, 0.52, 0), col_mat("van_platetext", srgb("#1c1e22"), 0.5), depth=0.002)
    t.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    for k, z0 in enumerate((-0.72, 0.02)):
        fr = []
        for i in range(2):
            zz = z0 + 0.62 * i; xx = ws_x1 - 0.06
            fr.append((E(xx, van_top_y(xx, zz) + 0.012, zz), edir(0, 1, 0), edir(1, 0, 0)))
        sweep(f"van_wiper{k}", [(-0.006, -0.012), (0.01, -0.012), (0.01, 0.012), (-0.006, 0.012)], fr, rubber)

    # ---- mirrors, handles, seams, markers, rail
    for sz in (-1, 1):
        slab(f"van_mirarm{sz}", (1.86, 1.50, sz * 1.06), (0.05, 0.04, 0.2), trim, bevel=0.01)
        slab(f"van_mirror{sz}", (1.83, 1.62, sz * 1.18), (0.1, 0.34, 0.2), trim, bevel=0.035)
        slab(f"van_mirglass{sz}", (1.775, 1.62, sz * 1.18), (0.01, 0.28, 0.16), dglass, bevel=0.0)
        slab(f"van_mirind{sz}", (1.86, 1.50, sz * 1.24), (0.05, 0.03, 0.06), amber, bevel=0.008)
        for x in (1.02, 0.66):
            slab(f"van_handle{x}{sz}", (x, 1.27, sz * 1.008), (0.2, 0.045, 0.03), trim, bevel=0.012)
        slab(f"van_marker{sz}", (2.30, 0.80, sz * 0.99), (0.09, 0.04, 0.02), amber, bevel=0.008)
        # seams: grooves drawn as thin dark strips that follow the side
        def vseam(x, y0, y1, nm):
            fr = [(E(x, y0 + (y1 - y0) * k / 6, sz * (van_side_z(x, y0 + (y1 - y0) * k / 6) + 0.001)), edir(0, 0, sz), edir(1, 0, 0)) for k in range(7)]
            sweep(nm, [(-0.002, -0.005), (0.003, -0.005), (0.003, 0.005), (-0.002, 0.005)], fr, rubber)
        def hseam(y, x0, x1, nm):
            fr = [(E(x0 + (x1 - x0) * k / 8, y, sz * (van_side_z(x0 + (x1 - x0) * k / 8, y) + 0.001)), edir(0, 0, sz), edir(0, 1, 0)) for k in range(9)]
            sweep(nm, [(-0.002, -0.005), (0.003, -0.005), (0.003, 0.005), (-0.002, 0.005)], fr, rubber)
        vseam(0.89, 0.44, 2.38, f"van_seamA{sz}"); vseam(0.80, 0.44, 2.38, f"van_seamB{sz}"); vseam(-0.80, 0.44, 2.38, f"van_seamC{sz}")
        vseam(1.99, 0.44, 1.40, f"van_seamD{sz}"); hseam(2.38, -0.80, 0.80, f"van_seamE{sz}")
        fr = [(E(x, 1.98, sz * (van_side_z(x, 1.98) - 0.002)), edir(0, 0, sz), edir(0, 1, 0)) for x in (-2.48, -0.82)]
        sweep(f"van_rail{sz}", [(-0.01, -0.025), (0.016, -0.025), (0.02, 0.0), (0.016, 0.025), (-0.01, 0.025)], fr, trim)

    # ---- livery: the stripe, the name, a parcel mark on the sliding door
    for sz in (-1, 1):
        rot = (math.pi / 2, 0, 0 if sz > 0 else math.pi)
        slab(f"van_stripe{sz}", (-0.27, 1.15, sz * 1.002), (4.56, 0.18, 0.004), orange, bevel=0.0)
        slab(f"van_stripeL{sz}", (-0.27, 1.265, sz * 1.002), (4.56, 0.03, 0.004), navy, bevel=0.0)
        t = text_mesh(f"van_logo{sz}", "SWIFT PARCEL", 0.25, (-1.62, 1.74, sz * (van_side_z(-1.62, 1.74) + 0.006)), navy, depth=0.004)
        t.rotation_euler = rot
        t = text_mesh(f"van_tag{sz}", "same-day delivery", 0.11, (-1.62, 1.53, sz * (van_side_z(-1.62, 1.53) + 0.006)), orange3, depth=0.003)
        t.rotation_euler = rot
        # isometric parcel: three rhombi
        cx, cy, s = 0.0, 1.78, 0.2
        zz = sz * (van_side_z(cx, cy) + 0.004)
        for nm, pts, m in (("top", [(0, s * 0.5), (s * 0.87, s * 0.0), (0, -s * 0.5), (-s * 0.87, 0)], orange2),
                           ("left", [(-s * 0.87, 0), (0, -s * 0.5), (0, -s * 1.5), (-s * 0.87, -s)], orange),
                           ("right", [(0, -s * 0.5), (s * 0.87, 0), (s * 0.87, -s), (0, -s * 1.5)], orange3)):
            bm = bmesh.new()
            vs = [bm.verts.new(E(cx + u * (1 if sz > 0 else -1), cy + v, zz)) for (u, v) in pts]
            bm.faces.new(vs if sz > 0 else vs[::-1]); mesh_obj(f"van_mark{nm}{sz}", bm, [m], smooth=False)

    # ---- rear: doors, windows, lights, handles, plate, step
    xr = -2.662
    slab("van_rearseam", (xr - 0.001, 1.49, 0), (0.004, 1.92, 0.01), rubber, bevel=0.0)
    for sz in (-1, 1):
        slab(f"van_rwinf{sz}", (xr - 0.002, 1.95, sz * 0.40), (0.006, 0.56, 0.6), rubber, bevel=0.0)
        slab(f"van_rwin{sz}", (xr - 0.005, 1.95, sz * 0.40), (0.006, 0.5, 0.54), dglass, bevel=0.0)
        slab(f"van_tlh{sz}", (xr - 0.004, 1.02, sz * 0.78), (0.03, 0.74, 0.16), trim, bevel=0.01)
        slab(f"van_tl{sz}", (xr - 0.018, 1.16, sz * 0.78), (0.015, 0.40, 0.13), tail, bevel=0.006)
        slab(f"van_tla{sz}", (xr - 0.018, 0.86, sz * 0.78), (0.015, 0.14, 0.13), amber, bevel=0.006)
        slab(f"van_tlw{sz}", (xr - 0.018, 0.73, sz * 0.78), (0.015, 0.09, 0.13), white, bevel=0.006)
        slab(f"van_rhandle{sz}", (xr - 0.01, 1.22, sz * 0.09), (0.03, 0.045, 0.16), trim, bevel=0.01)
    slab("van_brake3", (xr + 0.004, 2.44, 0), (0.03, 0.04, 0.3), tail, bevel=0.008)
    slab("van_plateR", (xr - 0.012, 0.70, 0), (0.012, 0.12, 0.5), white, bevel=0.006)
    t = text_mesh("van_plateRt", "SP 214", 0.085, (xr - 0.02, 0.70, 0), bpy.data.materials["van_platetext"], depth=0.002)
    t.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    t = text_mesh("van_rearlogo", "SWIFT PARCEL", 0.12, (xr - 0.006, 1.55, -0.40), navy, depth=0.003)
    t.rotation_euler = (math.pi / 2, 0, -math.pi / 2)

    # ---- cab interior
    for sz in (-1, 1):
        slab(f"van_seat{sz}", (0.92, 0.98, sz * 0.45), (0.5, 0.14, 0.5), fabric, bevel=0.05)
        slab(f"van_seatb{sz}", (0.66, 1.36, sz * 0.45), (0.14, 0.72, 0.48), fabric, bevel=0.05, tilt=-0.18)
        slab(f"van_head{sz}", (0.60, 1.82, sz * 0.45), (0.12, 0.2, 0.3), fabric, bevel=0.04, tilt=-0.18)
    slab("van_dash", (1.98, 1.16, 0), (0.46, 0.3, 1.82), cab, bevel=0.06, tilt=0.25)
    fr = []
    for k in range(32):
        a = 2 * math.pi * k / 32
        fr.append((Vector((0, 0.19 * math.cos(a), 0.19 * math.sin(a))), Vector((0, math.cos(a), math.sin(a))), Vector((1, 0, 0))))
    sw = sweep("van_steer", [(0.022 * math.cos(2 * math.pi * k / 10), 0.022 * math.sin(2 * math.pi * k / 10)) for k in range(10)], fr, rubber, closed=True)
    sw.location = E(1.52, 1.42, -0.45); sw.rotation_euler = (0, math.radians(50), 0)
    disc("van_column", (1.65, 1.27, -0.45), 0.035, 0.36, rubber, axis="x", seg=12).rotation_euler = (0, math.radians(140), 0)

    # ---- wheels
    for name, x, z in (("WHEEL_FL", 1.7, 0.865), ("WHEEL_FR", 1.7, -0.865), ("WHEEL_RL", -1.75, 0.865), ("WHEEL_RR", -1.75, -0.865)):
        van_wheel(name, (x, 0.382, z), 1 if z > 0 else -1, (tyre, chrome, cap, slotm, badge))
    NOTES["vehicle"] = {"length": 5.55, "width": 2.0, "height": 2.62, "wheelR": 0.382, "wheelBase": 3.45,
                        "seats": {"driver": {"pos": [0.95, 0.42, -0.45], "pose": "sit"}, "passenger": {"pos": [0.95, 0.42, 0.45], "pose": "sit"}}}


def van_preview(out):
    """three Cycles stills of the van (three-quarter front, side, rear) for look-dev"""
    w = bpy.data.worlds.new("pv"); SC.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.85, 0.9, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    sun = bpy.data.lights.new("pvsun", "SUN"); sun.energy = 3.0; so = link(bpy.data.objects.new("pvsun", sun)); so.rotation_euler = (math.radians(40), 0, math.radians(30))
    fl = plane("pv_floor", 30, 30, (0, 0, 0), col_mat("pv_floor_m", srgb("#9a9a96"), 0.8))
    cam = bpy.data.cameras.new("pvcam"); cam.lens = 40; co = link(bpy.data.objects.new("pvcam", cam)); SC.camera = co
    SC.render.engine = "CYCLES"; SC.cycles.samples = 64; SC.render.resolution_x = 960; SC.render.resolution_y = 640
    for nm, pos in (("front", (7.0, 2.4, 5.0)), ("side", (0.2, 1.6, 8.0)), ("rear", (-6.5, 2.6, -4.5))):
        co.location = E(*pos); d = (E(0.3, 1.1, 0) - co.location); co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        SC.render.filepath = os.path.join(out, f"van_{nm}.png"); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(fl); bpy.data.objects.remove(co); bpy.data.objects.remove(so)


# ------------------------------------------------------------------------------------------------ hero props (1.11.1)
# Small hero objects for a board, exported one GLB each (no lightmap: the engine cel-shades and inks them like its own
# world, so they carry detail without standing out). Origin at the base centre unless noted. Engine axes.

def mat_once(name, fn):
    return bpy.data.materials[name] if name in bpy.data.materials else fn()


def coir_image(name):
    def fn(u, v, np):
        h = np.sin(u * 900.0) * 0.5 + 0.5
        n = np.sin(u * 2300.0 + v * 37.0) * 0.5 + 0.5
        base = np.array([0.62, 0.42, 0.22]) * (0.82 + 0.18 * h[..., None] * n[..., None])
        edge = (u < 0.06) | (u > 0.94) | (v < 0.1) | (v > 0.9)
        base[edge] *= 0.55
        return base
    return gen_image(name, 512, 256, fn)


def build_porch():
    """a front door unit for a house wall (back at z = 0, out toward +z): panelled blue door with a fanlight, white
    frame and cornice, a tiled canopy on brackets, a lantern, a doorbell, brass number, letterbox and knocker, a stone
    step, two planters with clipped shrubs and a coir WELCOME mat"""
    blue = col_mat("door_blue", srgb("#3d6b8a"), 0.45)
    blue2 = col_mat("door_blue2", srgb("#355f7c"), 0.5)
    white = col_mat("door_trim", srgb("#f4efe6"), 0.5)
    brass = col_mat("door_brass", srgb("#d6a94a"), 0.3, 0.5)
    glass = col_mat("door_glass", srgb("#2c3e52"), 0.08)
    stone = col_mat("door_step", srgb("#b9b3a8"), 0.8)
    roof = col_mat("door_roof", srgb("#a8553c"), 0.7)
    black = col_mat("door_black", srgb("#24262b"), 0.5)
    warm = col_mat("lamp_glow", srgb("#ffe2a0"), 0.3, emit=srgb("#ffd890"), emit_k=2.0)
    pot = col_mat("door_pot", srgb("#4a5260"), 0.6)
    leaf = col_mat("door_leaf", srgb("#4f8a3a"), 0.85)
    DW, DH = 1.0, 2.1
    # frame: jambs, head, cornice
    for sx in (-1, 1):
        slab(f"pj{sx}", (sx * (DW / 2 + 0.07), (DH + 0.5) / 2, 0.06), (0.14, DH + 0.5, 0.12), white, bevel=0.01)
    slab("phead", (0, DH + 0.5 + 0.06, 0.08), (DW + 0.4, 0.12, 0.16), white, bevel=0.015)
    slab("pcornice", (0, DH + 0.5 + 0.15, 0.11), (DW + 0.52, 0.06, 0.22), white, bevel=0.012)
    # fanlight (transom) with glazing bars
    slab("pfan", (0, DH + 0.25, 0.02), (DW, 0.44, 0.02), glass, bevel=0.0)
    for k in range(1, 4):
        slab(f"pfanbar{k}", (-DW / 2 + k * DW / 4, DH + 0.25, 0.035), (0.03, 0.44, 0.03), white, bevel=0.004)
    slab("pfansill", (0, DH + 0.02, 0.05), (DW + 0.02, 0.05, 0.08), white, bevel=0.008)
    # the door: slab, raised panels, a small window, hardware
    slab("pdoor", (0, DH / 2, 0.03), (DW, DH, 0.05), blue, bevel=0.008)
    for (px, py, pw, ph) in ((-0.22, 0.45, 0.34, 0.6), (0.22, 0.45, 0.34, 0.6), (-0.22, 1.22, 0.34, 0.62), (0.22, 1.22, 0.34, 0.62)):
        slab(f"ppanel{px}{py}", (px, py, 0.06), (pw, ph, 0.02), blue2, bevel=0.012)
    slab("pwinframe", (0, 1.78, 0.058), (0.72, 0.36, 0.016), blue2, bevel=0.006)
    slab("pwin", (0, 1.78, 0.066), (0.64, 0.28, 0.006), glass, bevel=0.0)
    slab("pwinbar", (0, 1.78, 0.07), (0.025, 0.28, 0.01), blue, bevel=0.0)
    slab("pletter", (0, 0.92, 0.062), (0.3, 0.08, 0.012), brass, bevel=0.004)
    slab("pletslot", (0, 0.92, 0.069), (0.24, 0.02, 0.004), black, bevel=0.0)
    disc("pknob", (0.4, 1.02, 0.08), 0.035, 0.03, brass, axis="z", seg=20)
    slab("pplate", (0.4, 1.02, 0.058), (0.06, 0.22, 0.012), brass, bevel=0.004)
    disc("pknock", (0, 1.52, 0.075), 0.06, 0.016, brass, axis="z", seg=24)
    t = text_mesh("pnum", "14", 0.16, (0, 1.36, 0.064), brass, depth=0.006); t.rotation_euler = (math.pi / 2, 0, 0)
    # doorbell with a camera ring, lantern
    slab("pbell", (DW / 2 + 0.22, 1.25, 0.03), (0.06, 0.14, 0.03), black, bevel=0.008)
    disc("pbellbtn", (DW / 2 + 0.22, 1.21, 0.05), 0.016, 0.01, brass, axis="z", seg=16)
    slab("plantern_b", (-(DW / 2 + 0.38), 1.95, 0.05), (0.08, 0.16, 0.1), black, bevel=0.008)
    slab("plantern_a", (-(DW / 2 + 0.38), 1.95, 0.13), (0.03, 0.03, 0.12), black, bevel=0.004)
    slab("plantern_g", (-(DW / 2 + 0.38), 1.86, 0.2), (0.14, 0.24, 0.14), warm, bevel=0.01)
    for sx in (-1, 1):
        for sz2 in (-1, 1):
            slab(f"plantern_f{sx}{sz2}", (-(DW / 2 + 0.38) + sx * 0.072, 1.86, 0.2 + sz2 * 0.072), (0.015, 0.26, 0.015), black, bevel=0.0)
    slab("plantern_t", (-(DW / 2 + 0.38), 2.0, 0.2), (0.18, 0.03, 0.18), black, bevel=0.006)
    disc("plantern_cap", (-(DW / 2 + 0.38), 2.04, 0.2), 0.09, 0.06, black, axis="y", seg=4, r2=0.01)
    # canopy: two brackets, a pitched tiled roof with a white fascia
    for sx in (-1, 1):
        slab(f"pbracket{sx}", (sx * 0.78, 2.72, 0.32), (0.08, 0.08, 0.62), white, bevel=0.01)
        b = slab(f"pbrace{sx}", (sx * 0.78, 2.55, 0.2), (0.06, 0.06, 0.45), white, bevel=0.008); b.rotation_euler = (math.radians(-40), 0, 0)
    for sx in (-1, 1):
        r = slab(f"proof{sx}", (sx * 0.47, 3.0, 0.42), (0.98, 0.05, 0.86), roof, bevel=0.01)
        r.rotation_euler = (0, -sx * math.radians(-24), 0)
        for k in range(5):  # tile courses
            xa = 0.1 + k * 0.17
            tr = slab(f"ptile{sx}{k}", (sx * xa, 3.2 + 0.035 - math.tan(math.radians(24)) * xa, 0.42), (0.03, 0.025, 0.86), roof, bevel=0.006)
            tr.rotation_euler = (0, -sx * math.radians(-24), 0)
    slab("pfascia", (0, 2.78, 0.86), (1.86, 0.1, 0.03), white, bevel=0.006)
    slab("pridge", (0, 3.2, 0.42), (0.06, 0.06, 0.88), roof, bevel=0.01)
    # step and planters
    slab("pstep", (0, 0.07, 0.24), (DW + 0.5, 0.14, 0.46), stone, bevel=0.015)
    slab("pstep2", (0, 0.145, 0.24), (DW + 0.54, 0.015, 0.48), stone, bevel=0.005)
    import random
    rr = random.Random(4)
    for sx in (-1, 1):
        slab(f"ppot{sx}", (sx * 0.98, 0.22, 0.3), (0.42, 0.44, 0.42), pot, bevel=0.02)
        slab(f"ppotrim{sx}", (sx * 0.98, 0.45, 0.3), (0.46, 0.04, 0.46), pot, bevel=0.01)
        me = bpy.data.meshes.new(f"pshrub{sx}"); bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.3)
        for v in bm.verts:
            n = v.co.normalized(); v.co = v.co * (1.0 + 0.06 * math.sin(v.co.x * 41 + v.co.y * 23) + 0.05 * rr.uniform(-1, 1))
        bm.to_mesh(me); bm.free()
        sh = link(bpy.data.objects.new(f"pshrub{sx}", me)); me.materials.append(leaf); sh.location = E(sx * 0.98, 0.76, 0.3)
        for p in me.polygons: p.use_smooth = True
    # doormat: coir with a dark border and WELCOME
    coir = bpy.data.materials.new("mat_coir"); coir.use_nodes = True
    nt = coir.node_tree; b = nt.nodes["Principled BSDF"]; tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = coir_image("coir")
    nt.links.new(tx.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.95
    me = bpy.data.meshes.new("pmat"); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    bm.to_mesh(me); bm.free(); mo = link(bpy.data.objects.new("pmat", me)); me.materials.append(coir)
    mo.scale = (1.0, 0.62, 1.0); mo.location = E(0, 0.026, 0.95)
    slab("pmatbase", (0, 0.012, 0.95), (1.0, 0.024, 0.62), col_mat("mat_back", srgb("#6b4426"), 0.9), bevel=0.006)
    t = text_mesh("pmattext", "WELCOME", 0.13, (0, 0.03, 0.97), col_mat("mat_text", srgb("#3a2414"), 0.9), depth=0.003)
    t.rotation_euler = (0, 0, 0)
    NOTES["prop"] = {"door": [0, 0, 0.3], "mat": [0, 0.03, 0.95], "lamp": [-(DW / 2 + 0.38), 1.86, 0.2], "bell": [DW / 2 + 0.22, 1.25, 0.05], "width": 2.4, "height": 3.25}


def build_parcel():
    """a 0.42 x 0.28 x 0.32 m cardboard parcel: tape over the top and down the ends, a shipping label with a barcode,
    a Swift Parcel sticker, flap seams"""
    card = col_mat("parcel_card", srgb("#c8935a"), 0.85)
    card2 = col_mat("parcel_card2", srgb("#b98250"), 0.85)
    tape = col_mat("parcel_tape", srgb("#e9cf96"), 0.35)
    paper = col_mat("parcel_label", srgb("#f7f5ef"), 0.6)
    ink = col_mat("parcel_ink", srgb("#1c1e22"), 0.6)
    orange = col_mat("parcel_orange", srgb("#ec8a2c"), 0.5)
    navy = col_mat("parcel_navy", srgb("#1f3a5f"), 0.5)
    W, H, D = 0.42, 0.28, 0.32
    slab("pbox", (0, H / 2, 0), (W, H, D), card, bevel=0.01)
    slab("pseam", (0, H + 0.001, 0), (W - 0.02, 0.002, 0.004), card2, bevel=0.0)
    slab("ptape", (0, H + 0.002, 0), (W + 0.004, 0.003, 0.06), tape, bevel=0.0)
    for sx in (-1, 1):
        slab(f"ptapeE{sx}", (sx * (W / 2 + 0.0015), H - 0.06, 0), (0.003, 0.12, 0.06), tape, bevel=0.0)
    # label on top (beside the tape) and on the front
    for nm, c, size, rot in (("top", (0.11, H + 0.003, 0.0), (0.12, 0.002, 0.16), "top"), ("front", (-0.08, 0.14, D / 2 + 0.002), (0.16, 0.12, 0.002), "front")):
        slab(f"plabel{nm}", c, size, paper, bevel=0.0)
        if rot == "top":
            for k in range(9):
                slab(f"pbar{nm}{k}", (c[0] - 0.045 + k * 0.011, c[1] + 0.0016, c[2] + 0.04), (0.004 + (k % 3) * 0.002, 0.001, 0.05), ink, bevel=0.0)
            slab(f"plogo{nm}", (c[0], c[1] + 0.0016, c[2] - 0.045), (0.09, 0.001, 0.025), orange, bevel=0.0)
            for k in range(3):
                slab(f"pline{nm}{k}", (c[0], c[1] + 0.0016, c[2] - 0.005 + k * 0.012), (0.08, 0.001, 0.004), navy, bevel=0.0)
        else:
            for k in range(9):
                slab(f"pbar{nm}{k}", (c[0] - 0.05 + k * 0.012, c[1] - 0.025, c[2] + 0.0012), (0.004 + (k % 3) * 0.002, 0.04, 0.001), ink, bevel=0.0)
            slab(f"plogo{nm}", (c[0], c[1] + 0.035, c[2] + 0.0012), (0.12, 0.022, 0.001), orange, bevel=0.0)
            for k in range(2):
                slab(f"pline{nm}{k}", (c[0] - 0.01, c[1] + 0.008 - k * 0.012, c[2] + 0.0012), (0.1, 0.004, 0.001), navy, bevel=0.0)
    # "this way up" arrows on the right end
    for k, dz in enumerate((-0.04, 0.04)):
        slab(f"parrow{k}", (W / 2 + 0.002, 0.2, dz), (0.001, 0.05, 0.012), ink, bevel=0.0)
    NOTES["prop"] = {"size": [W, H, D]}


def build_scanner():
    """the handheld delivery scanner at insert scale (body 0.62 x 0.95 x 0.08 m, centred at the origin): rugged body
    with orange rubber corners, a black screen well (the engine draws the screen on it at z 0.041), three keys, a pistol
    grip with a trigger, and a camera module named RT_camera (hidden by the board until the scanners get a camera)"""
    body = col_mat("scan_body", srgb("#2b2f3a"), 0.55)
    body2 = col_mat("scan_body2", srgb("#3a3f4c"), 0.6)
    rubber = col_mat("scan_rubber", srgb("#ec8a2c"), 0.75)
    screen = col_mat("scan_screen", srgb("#11141a"), 0.1)
    keyg = col_mat("scan_keyg", srgb("#3fae5a"), 0.4)
    keyr = col_mat("scan_keyr", srgb("#d8463a"), 0.4)
    keyo = col_mat("scan_keyo", srgb("#f6b25a"), 0.4)
    lensm = col_mat("scan_lens", srgb("#0d0f14"), 0.05)
    chrome = col_mat("scan_chrome", srgb("#c9ced6"), 0.25, 0.5)
    flash = col_mat("scan_flash", srgb("#fff6dc"), 0.2)
    W, H, D = 0.62, 0.95, 0.08
    slab("sbody", (0, 0, 0), (W, H, D), body, bevel=0.03)
    slab("sback", (0, 0, -D / 2 - 0.01), (W - 0.08, H - 0.12, 0.03), body2, bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = slab(f"scorner{sx}{sy}", (sx * (W / 2 - 0.04), sy * (H / 2 - 0.04), 0), (0.13, 0.13, D + 0.024), rubber, bevel=0.035)
    for sx in (-1, 1):
        slab(f"sside{sx}", (sx * (W / 2 + 0.004), 0, 0), (0.02, H - 0.3, D - 0.02), rubber, bevel=0.008)
    slab("sbezel", (0, 0.11, D / 2 - 0.007), (0.58, 0.58, 0.012), screen, bevel=0.006)
    # keys under the screen
    for k, (x, m) in enumerate(((-0.17, keyr), (0.0, keyo), (0.17, keyg))):
        slab(f"skey{k}", (x, -0.3, D / 2 + 0.006), (0.12, 0.07, 0.02), m, bevel=0.012)
    for r in range(2):
        for k in range(4):
            slab(f"spad{r}{k}", (-0.18 + k * 0.12, -0.39 + r * 0.0, D / 2 + 0.003), (0.08, 0.035, 0.012), body2, bevel=0.008)
    # top: scan window
    slab("swindow", (0, H / 2 + 0.005, 0.0), (0.3, 0.02, 0.05), keyr, bevel=0.006)
    # grip and trigger
    g = slab("sgrip", (0, -H / 2 - 0.18, -0.03), (0.22, 0.42, 0.11), body, bevel=0.04); g.rotation_euler = (math.radians(-12), 0, 0)
    slab("sgripr", (0, -H / 2 - 0.2, -0.03), (0.236, 0.3, 0.06), rubber, bevel=0.02).rotation_euler = (math.radians(-12), 0, 0)
    t = slab("strigger", (0, -H / 2 - 0.06, 0.06), (0.08, 0.12, 0.04), body2, bevel=0.015); t.rotation_euler = (math.radians(20), 0, 0)
    # camera module on the front, top right: housing, lens, ring, flash (one object family named RT_camera*)
    parts = [slab("RT_camera", (0.17, 0.43, D / 2 + 0.012), (0.18, 0.09, 0.03), body2, bevel=0.012),
             disc("RT_camera_ring", (0.13, 0.43, D / 2 + 0.03), 0.034, 0.012, chrome, axis="z", seg=24),
             disc("RT_camera_lens", (0.13, 0.43, D / 2 + 0.036), 0.024, 0.008, lensm, axis="z", seg=24),
             slab("RT_camera_flash", (0.215, 0.43, D / 2 + 0.03), (0.05, 0.035, 0.008), flash, bevel=0.004)]
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        bpy.context.view_layer.objects.active = p
        for md in list(p.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception: p.modifiers.remove(md)
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); parts[0].name = "RT_camera"
    NOTES["prop"] = {"screen": [0, 0.11, 0.041], "screenSize": [0.54, 0.54], "camera": [0.13, 0.43, 0.08]}


def asset_preview(out, name, target, dist):
    """Cycles stills of an asset from three sides (look-dev)"""
    w = bpy.data.worlds.new("pv"); SC.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.85, 0.9, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    sun = bpy.data.lights.new("pvsun", "SUN"); sun.energy = 3.0; so = link(bpy.data.objects.new("pvsun", sun)); so.rotation_euler = (math.radians(40), 0, math.radians(30))
    fl = plane("pv_floor", 30, 30, (0, -0.001, 0), col_mat("pv_floor_m", srgb("#9a9a96"), 0.8))
    cam = bpy.data.cameras.new("pvcam"); cam.lens = 40; co = link(bpy.data.objects.new("pvcam", cam)); SC.camera = co
    SC.render.engine = "CYCLES"; SC.cycles.samples = 64; SC.render.resolution_x = 800; SC.render.resolution_y = 800
    for nm, d in (("a", (0.7, 0.35, 1.0)), ("b", (-0.8, 0.5, 0.7)), ("c", (0.0, 0.25, 1.0))):
        dv = Vector(d).normalized() * dist
        co.location = E(target[0] + dv.x, target[1] + dv.y, target[2] + dv.z); dd = E(*target) - co.location
        co.rotation_euler = dd.to_track_quat("-Z", "Y").to_euler()
        SC.render.filepath = os.path.join(out, f"{name}_{nm}.png"); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(fl); bpy.data.objects.remove(co); bpy.data.objects.remove(so)


ASSET = {"van", "porch", "parcel", "scanner"}
BUILD = {"home": build_home, "van": build_van, "office": build_office, "depot": build_depot, "porch": build_porch, "parcel": build_parcel, "scanner": build_scanner}
PREVIEW = {"van": lambda: van_preview(OUT), "porch": lambda: asset_preview(OUT, "porch", (0, 1.4, 0.4), 5.5),
           "parcel": lambda: asset_preview(OUT, "parcel", (0, 0.14, 0), 1.2), "scanner": lambda: asset_preview(OUT, "scanner", (0, -0.1, 0), 2.4)}


# ------------------------------------------------------------------------------------------------ light
def light_day():
    w = bpy.data.worlds.new("world"); SC.world = w; w.use_nodes = True
    N, L = w.node_tree.nodes, w.node_tree.links
    hd = os.path.join(ASSETS, "hdris", "sunny_vondelpark")
    env = N.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(os.path.join(hd, next(x for x in os.listdir(hd) if x.endswith(".hdr"))))
    bg = N["Background"]; bg.inputs["Strength"].default_value = 0.7
    L.new(env.outputs["Color"], bg.inputs["Color"])
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.4; sun.angle = math.radians(2.0); sun.color = srgb("#ffe4bf")
    so = link(bpy.data.objects.new("sun", sun))
    # sun from front-left, high: shadows fall back and to the right (engine dir = where the light comes FROM)
    d = Vector((0.7, 0.55, 0.46)).normalized()  # engine axes: warm low sun from the right and a little in front
    bd = Vector((d.x, -d.z, d.y))
    so.rotation_euler = bd.to_track_quat("Z", "Y").to_euler()
    NOTES["sun"] = {"dir": [round(v, 3) for v in d], "color": "#ffe4bf", "energy": 3.4}


# ------------------------------------------------------------------------------------------------ prepare: apply modifiers, world UVs, lightmap UVs
def prepare():
    bpy.ops.object.select_all(action="DESELECT")
    for ob in list(SC.objects):
        if ob.type != "MESH": continue
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        for md in list(ob.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception: ob.modifiers.remove(md)
        ob.select_set(False)
    # world-projected texture UVs (metres / tex_size) for our own geometry
    for ob in SC.objects:
        if ob.type != "MESH" or not ob.data.materials: continue
        m0 = ob.data.materials[0]
        size = m0.get("tex_size", None) if m0 else None
        if m0 and m0.get("fit_uv"):
            me = ob.data
            if not me.uv_layers: me.uv_layers.new(name="UVMap")
            bm = bmesh.new(); bm.from_mesh(me); uv = bm.loops.layers.uv.active
            xs = [v.co.x for v in bm.verts]; zs = [v.co.z for v in bm.verts]
            x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
            for f in bm.faces:
                for lp in f.loops: lp[uv].uv = ((lp.vert.co.x - x0) / max(1e-6, x1 - x0), (lp.vert.co.z - z0) / max(1e-6, z1 - z0))
            bm.to_mesh(me); bm.free(); continue
        if not size: continue
        me = ob.data
        if not me.uv_layers: me.uv_layers.new(name="UVMap")
        bm = bmesh.new(); bm.from_mesh(me); uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
        mw = ob.matrix_world; nmat = mw.to_3x3()
        for f in bm.faces:
            n = (nmat @ f.normal).normalized(); ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                p = mw @ lp.vert.co
                u, v = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
                lp[uv].uv = (u / size, v / size)
        bm.to_mesh(me); bm.free()


def join_by_material():
    """bake-friendly: every static object with the same (single) material becomes one object"""
    groups = {}
    for ob in list(SC.objects):
        if ob.type != "MESH" or ob.name.startswith("RT_") or ob.name.startswith("WHEEL_") or len(ob.data.materials) != 1: continue
        floor = ob.name.startswith("FLOOR_")
        key = (ob.data.materials[0].name, floor)
        groups.setdefault(key, []).append(ob)
    for (mname, floor), obs in groups.items():
        if len(obs) < 2:
            obs[0].name = ("FLOOR_" if floor else "") + "S_" + mname.replace(".", "_")
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = ("FLOOR_" if floor else "") + "S_" + mname.replace(".", "_")
    # models with several materials: split so each object has one material (one lightmap, one glTF primitive)
    for ob in list(SC.objects):
        if ob.type == "MESH" and not ob.name.startswith("RT_") and not ob.name.startswith("WHEEL_") and len(ob.data.materials) > 1:
            bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
            bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.separate(type="MATERIAL"); bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for k, ob in enumerate(SC.objects):
        if ob.type == "MESH":
            ob.name = "".join(c if c.isalnum() or c == "_" else "_" for c in ob.name)


def area(ob):
    mw = ob.matrix_world
    return sum((mw.to_3x3() @ (p.normal * p.area)).length for p in ob.data.polygons) if ob.data.polygons else 0.0


def bake_all(kind="DIFFUSE", texel=None):
    texel = texel or (int(A["texel"]) if not FAST else 40)
    SC.render.bake.use_pass_direct = True; SC.render.bake.use_pass_indirect = True; SC.render.bake.use_pass_color = False
    SC.render.bake.margin = 6
    SC.cycles.bake_type = "DIFFUSE"
    baked = {}
    obs = [o for o in SC.objects if o.type == "MESH" and not o.name.startswith("RT_") and o.data.polygons]
    for n, ob in enumerate(obs):
        me = ob.data
        if not me.uv_layers: me.uv_layers.new(name="UVMap")
        uv0n = me.uv_layers[0].name
        me.uv_layers.new(name="LM")  # (adding a layer invalidates python references to the others: look them up by name)
        me.uv_layers[uv0n].active_render = True; me.uv_layers.active = me.uv_layers["LM"]
        bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        side = int(min(2048, max(64, 2 ** round(math.log2(max(1.0, math.sqrt(area(ob)) * texel))))))
        im = bpy.data.images.new(f"LM_{ob.name}", side, side, float_buffer=True)
        mats = [m for m in me.materials if m]
        for k, m in enumerate(mats):
            if m.users > 1:
                m = m.copy(); me.materials[k] = m
            nd = m.node_tree.nodes.new("ShaderNodeTexImage"); nd.image = im; nd.name = "LMBAKE"
            m.node_tree.nodes.active = nd
        if kind == "AO": bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
        else: bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=6, use_clear=True)
        baked[ob.name] = im
        for m in me.materials:
            if m and "LMBAKE" in m.node_tree.nodes: m.node_tree.nodes.remove(m.node_tree.nodes["LMBAKE"])
        me.uv_layers.active = me.uv_layers[uv0n]
        print(f"[bake] {n + 1}/{len(obs)} {ob.name} {side}px", flush=True)
    return baked


def save_lightmaps(baked):
    import numpy as np
    vals = []
    for im in baked.values():
        px = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(px)
        vals.append(px.reshape(-1, 4)[:, :3].max(axis=1))
    # raw irradiance (the engine applies the same AgX view transform Blender used, per baked material): store x / S
    allv = np.concatenate(vals); allv = allv[allv > 1e-4]
    S = float(max(1.0, np.percentile(allv, 99.9)))
    out = {}
    for name, im in baked.items():
        w, h = im.size
        px = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(px)
        rgb = np.clip(px.reshape(-1, 4)[:, :3] / S, 0, 1)
        enc = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
        o = bpy.data.images.new(f"OUT_{name}", w, h, alpha=False); o.colorspace_settings.name = "Non-Color"
        full = np.ones((w * h, 4), dtype=np.float32); full[:, :3] = enc
        o.pixels.foreach_set(full.ravel())
        path = os.path.join(OUT, "lm", f"{name}.png"); o.filepath_raw = path; o.file_format = "PNG"; o.save()
        out[name] = f"lm/{name}.png"
    return S, out


def export(S, lms):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "set.glb"), export_format="GLB", use_selection=False, export_apply=True,
                              export_texcoords=True, export_normals=True, export_lights=False, export_cameras=False, export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=88)
    man = {"set": A["set"], "glb": "set.glb", "lmScale": round(S, 4), "tonemap": "agx", "lightmaps": lms, "marks": MARKS,
           "floors": sorted(o.name for o in SC.objects if o.type == "MESH" and o.name.startswith("FLOOR_")),
           "realtime": sorted(o.name for o in SC.objects if o.type == "MESH" and o.name.startswith("RT_")), **NOTES}
    json.dump(man, open(os.path.join(OUT, "set.json"), "w"), indent=1)
    print(f"[set] {A['set']}: {len(lms)} lightmaps, lmScale {S:.3f} -> {OUT}", flush=True)


def preview():
    """a straight Cycles render of the wide view: the target the engine's version is compared with"""
    w = NOTES["wide"]
    cam = bpy.data.cameras.new("cam"); co = link(bpy.data.objects.new("cam", cam))
    co.location = E(*w["pos"]); look = E(*w["look"])
    co.rotation_euler = (look - co.location).to_track_quat("-Z", "Y").to_euler()
    cam.sensor_fit = "VERTICAL"; cam.angle_y = math.radians(w["fov"])
    SC.camera = co; SC.render.resolution_x, SC.render.resolution_y = 720, 1280
    SC.render.filepath = os.path.join(OUT, "preview.png"); bpy.ops.render.render(write_still=True)


if A["set"] in ASSET:
    BUILD[A["set"]]()
    if A.get("preview"): PREVIEW[A["set"]]()
    prepare()
    for ob in list(SC.objects):
        if ob.get("cutter"): bpy.data.objects.remove(ob)
    join_by_material()
    SC.cycles.samples = 64 if FAST else 256
    aos = bake_all("AO", texel=160) if A["set"] == "van" else {}  # props are cel-shaded in the engine: no AO
    import numpy as np
    aomaps = {}
    for name, im in aos.items():
        w, h = im.size; px = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(px)
        o = bpy.data.images.new(f"AOOUT_{name}", w, h, alpha=False); o.colorspace_settings.name = "Non-Color"
        full = np.ones((w * h, 4), dtype=np.float32); full[:, :3] = np.clip(px.reshape(-1, 4)[:, :3], 0, 1); o.pixels.foreach_set(full.ravel())
        path = os.path.join(OUT, "lm", f"{name}.png"); o.filepath_raw = path; o.file_format = "PNG"; o.save(); aomaps[name] = f"lm/{name}.png"
    if aomaps: NOTES.setdefault("vehicle", {})["ao"] = aomaps
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, A["set"] + ".glb"), export_format="GLB", export_apply=True, export_yup=True, export_lights=False, export_cameras=False)
    json.dump(NOTES.get("vehicle") or NOTES.get("prop") or {}, open(os.path.join(OUT, A["set"] + ".json"), "w"), indent=1)
    print(f"[asset] {A['set']} -> {OUT}", flush=True)
    sys.exit(0)
BUILD[A["set"]]()
light_interior() if NOTES.get("light") == "interior" else light_day()
prepare()
join_by_material()
if A.get("preview"): preview()
baked = bake_all()
S, lms = save_lightmaps(baked)
export(S, lms)
