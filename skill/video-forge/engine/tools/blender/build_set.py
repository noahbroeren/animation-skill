"""
Build a set in Blender, bake its light with Cycles and export it for the engine (video-forge 1.11).

  blender -b --factory-startup -P engine/tools/blender/build_set.py -- --set home --out engine/public/sets/home
          [--assets engine/public/assets/polyhaven] [--samples 1024] [--texel 110] [--preview] [--fast]
          [--lookdev] [--views "px,py,pz,lx,ly,lz,fov;..."]   (look-dev: the Cycles stills only, no bake)

Writes OUT/set.glb (geometry + PBR textures, UV0 = textures, UV1 = lightmap), OUT/lm/<object>.png (baked irradiance,
sRGB-encoded, scaled by lmScale) and OUT/set.json (marks, wide camera, camera box, sun, lightmaps, floors, realtime
objects). The engine loads it with `bakedSet()` (lib/three/baked.ts): every baked mesh is drawn as albedo x lightmap
(Cycles direct + indirect light, soft shadows and AO), so the world looks path-traced while the camera, the cards and
the props stay in the engine. Objects named RT_* are not baked (they move, or are many small instances like grass) and
are lit in real time; FLOOR_* objects also get a shadow catcher so the characters' shadows land on them.
Interiors (1.11.3) are lit by their practicals (lamp_light: listed in set.json "practicals"); metals flagged spec_bake
are baked COMBINED and divided by their base colour, so their reflections survive the albedo x lightmap draw.

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
A = {"set": "home", "out": "out_set", "samples": "1024", "texel": "110", "assets": ""}
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
# (1.11.3) interiors lit by small practicals: clamp indirect spikes and drop caustics so the bakes come out clean (bakes
# get no denoiser; the lightmaps are also median + binomial filtered in save_lightmaps)
SC.cycles.sample_clamp_indirect = 4.0; SC.cycles.blur_glossy = 1.0
SC.cycles.caustics_reflective = False; SC.cycles.caustics_refractive = False
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
def paint_image(tex, paint, k=0.45, disp=False):
    """a texture repainted: paint colour x (1 - k + k * luma / mean luma). glTF only exports plain image textures.
    disp=True takes the paint as the displayed colour (the older sets pass it through srgb() twice: darker, richer)"""
    import numpy as np
    key = (tex, paint, k, disp)
    if key in _paint_cache: return _paint_cache[key]
    d = os.path.join(ASSETS, "textures", tex)
    src = bpy.data.images.load(os.path.join(d, next(x for x in os.listdir(d) if "_diff_" in x)), check_existing=False)
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32); src.pixels.foreach_get(px); px = px.reshape(-1, 4)
    l = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
    f = (1 - k + k * l / max(1e-4, float(l.mean())))[:, None]
    c = np.array(hx(paint) if disp else srgb(paint), dtype=np.float32)[None, :]
    out = np.ones_like(px); out[:, :3] = np.clip(c * f, 0, 1)
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    tag = f"paint_{tex}_{paint[1:]}" + (f"_d{int(k * 100)}" if disp else "")
    im = bpy.data.images.new(tag, w, h, alpha=False); im.colorspace_settings.name = "sRGB"
    im.pixels.foreach_set(out.ravel())
    path = os.path.join(OUT, "tex", f"{tag}.jpg"); im.filepath_raw = path; im.file_format = "JPEG"; im.save()
    bpy.data.images.remove(src); bpy.data.images.remove(im)
    _paint_cache[key] = path
    return path


def tex_mat(name, tex, size=2.0, tint=None, rough_k=1.0, normal=1.0, paint=None, pk=0.45, disp=False):
    """PBR material from a Poly Haven texture (tex = id). UVs are world-projected in metres / size (see world_uv)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    d = os.path.join(ASSETS, "textures", tex)
    f = lambda k: next((os.path.join(d, x) for x in os.listdir(d) if f"_{k}_" in x), None)
    td = N.new("ShaderNodeTexImage"); td.image = img(paint_image(tex, paint, pk, disp) if paint else f("diff"))
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
    if metal >= 0.5 and not emit:
        m["spec_bake"] = 1; m["bc"] = [float(c) for c in rgb]
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


def import_model(asset, name, at, height=None, rot_y=0.0, rt=False, drop=()):
    """Poly Haven glTF model, scaled to `height` metres, base at engine point `at`. rt=True: not baked (realtime).
    drop: remove the faces whose material name contains one of these words (e.g. "glass" over a clock face)"""
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
    if drop:
        me = ob.data; idx = {i for i, m in enumerate(me.materials) if m and any(t in m.name.lower() for t in drop)}
        if idx:
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context="FACES")
            bm.to_mesh(me); bm.free()
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
def house(prefix, x, door_col, wall_tint, flip=False, z_face=-6.0, detail=True, door_w=1.0, wall_tex="weathered_plank_siding", curtain="#d98a7a", paint=None, lantern=False):
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
    prism_roof(f"{prefix}_canopyroof", 3.0, 1.6, 0.22, (dx, 3.0, zf + s * 0.82), roof, overhang=0.08)  # 1.11.2: a slight gable; flat, it was coplanar with the canopy beam and z-fought (flicker)
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
        if lantern: porch_lantern(f"{prefix}_lantern", (dx + s * 0.95, 1.98, zf))
        else: import_model("industrial_wall_sconce", f"{prefix}_sconce", (dx + s * 0.95, 1.85, zf + s * 0.02), height=0.32, rot_y=ry)
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
    d0 = house("h0", 0.0, "#3d6b8a", None, curtain="#e2a35a", paint="#efe2c4", lantern=True)
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
    # 1.11.3: street life that keeps the road (vanStop) and the path to the door clear: a bicycle against the fence,
    # wheelie bins and a clipped hedge in the garden, a planter of flowers on the pavement
    bicycle("bike").place((1.4, 0.14, -0.2), 0.0, pre=Matrix.Rotation(-0.13, 4, "X"))
    wheelie_bin("binA", "#4a5446").place((2.78, 0, -1.25))
    wheelie_bin("binB", "#5c4a3a", "#b08a3a").place((3.46, 0, -1.25), -0.08)
    hedge_m = bpy.data.materials["hedge"]
    for k in range(6):
        blob(f"hedgeF{k}", 0.4 + 0.04 * math.sin(k * 2.1), (0.35 + k * 0.33, 0.42, -1.05 + 0.04 * math.cos(k * 1.3)), hedge_m, k=1.2, seed=40 + k, sub=3)
    with Grp() as gp:
        model("planter_box_02", "planterP", (0, 0, 0), height=0.45)
        rr = __import__("random").Random(5)
        for k in range(7):
            px = -0.5 + k * 0.165
            blob(f"plantP{k}", rr.uniform(0.12, 0.16), (px, 0.4, rr.uniform(-0.06, 0.06)), _flower_mats["leaf"], k=0.85, seed=60 + k)
            for j in range(3):
                c = rr.choice(["#e86a8a", "#f2c84a", "#f4f0ea", "#b07ad8"])
                blob(f"flP{k}_{j}", 0.04, (px + rr.uniform(-0.09, 0.09), rr.uniform(0.5, 0.58), rr.uniform(-0.08, 0.08)), _flower_mats[c], seed=j, sub=1)
    gp.place((-0.15, 0.14, -0.3))
    drop_model_sources()
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
    mark("lawn", (2.0, 0, -2.6)); mark("center", (0, 0.14, 0.75)); mark("lantern", (d0 + 0.95, 1.98, -5.8))
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
        if kind == "warmcity":
            return warm_city_fn(u, v, np)
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
        c = r.choice(["#f2e08a", "#f4f0ea", "#f0b878", "#e8d0a0"])
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


# ------------------------------------------------------------------------------------------------ dressing kit (1.11.3)
# Interiors are lit by their practicals (pendants, sconces, desk and floor lamps: warm, small radius, the pool peak
# ~2.3x the ambient around it, the brightest area where the characters stand), dressed in layers (wall, mid, floor,
# a foreground element near the wide camera) with >= 12 prop types per shot, in one warm hue family. Materials carry
# texture amplitude (painted images, sigma L* 2-4.5 on wood / plaster / card) and every visible edge is bevelled.
import itertools
import random as _random
_nid = itertools.count()
_kit = {}


def nm(p):
    return f"{p}{next(_nid)}"


def hx(h):
    """hex -> display (sRGB-encoded) floats, for painted images"""
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def tnoise(np, u, v, seed, fx=(1, 8), fy=(1, 8), n=24, decay=1.0):
    """tileable noise on the unit square: a sum of sinusoids with integer frequencies (unit std)"""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(u)
    for _ in range(n):
        a = int(rng.integers(fx[0], fx[1] + 1)); b = int(rng.integers(fy[0], fy[1] + 1))
        if a == 0 and b == 0: b = 1
        if rng.random() < 0.5: a = -a
        out = out + np.sin(2 * np.pi * (a * u + b * v) + rng.uniform(0, 2 * np.pi)) / (math.hypot(a, b) ** decay)
    return out / (out.std() + 1e-6)


def img_mat(name, w, h, fn, rough=0.7, metal=0.0, size=1.0, fit=0, emit=0.0, spec=False):
    """a material from a painted image: world-projected UVs (metres / size) or, with fit, stretched over the object
    (fit 1: across x / height, fit 2: across x / depth, for rugs)"""
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = gen_image(name, w, h, fn)
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if emit > 0:
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = emit
    if fit: m["fit_uv"] = fit
    else: m["tex_size"] = size
    if spec:
        import numpy as np
        px = np.empty(len(t.image.pixels), dtype=np.float32); t.image.pixels.foreach_get(px)
        mean = px.reshape(-1, 4)[:, :3].mean(0)
        m["spec_bake"] = 1; m["bc"] = [float(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in mean]
    return m


def wood_mat(name, base, dark=None, size=1.2, rough=0.55, seed=0, boards=0, amp=1.0):
    """wood: warped growth rings, fine streaks along u, soft blotches; boards > 0 adds plank gaps, staggered butt
    joints and a tone per board"""
    def fn(u, v, np):
        cb = np.array(hx(base)); cd = np.array(hx(dark)) if dark else cb * 0.68
        warp = tnoise(np, u, v, seed, (0, 2), (1, 3), 12)
        ring = np.sin(2 * np.pi * (v * 22 + warp * 0.8 + 0.15 * tnoise(np, u, v, seed + 3, (2, 6), (1, 4), 10)))
        fine = tnoise(np, u, v, seed + 1, (0, 4), (30, 90), 40, 0.3)
        blot = tnoise(np, u, v, seed + 2, (1, 4), (1, 4), 12)
        t = 0.62 + amp * (0.15 * ring + 0.10 * fine + 0.09 * blot)
        if boards:
            k = np.floor(v * boards); fv = v * boards - k
            off = np.sin(k * 12.9898 + seed * 7.1) * 43758.5453; off = off - np.floor(off)
            t = t + amp * 0.16 * (off - 0.5)
            fu = (u * 2 + off * 1.7) % 1.0
            t = np.where((fv < 0.03) | (fv > 0.985) | (fu < 0.004), t * 0.42, t)
        t = np.clip(t, 0, 1.25)
        return cd[None, None, :] + (cb - cd)[None, None, :] * t[..., None]
    return img_mat(name, 512, 512, fn, rough, 0.0, size)


def card_mat(name, base, seed=0):
    def fn(u, v, np):
        c = np.array(hx(base))
        fib = tnoise(np, u, v, seed, (6, 40), (6, 40), 40, 0.5)
        blot = tnoise(np, u, v, seed + 1, (1, 3), (1, 3), 10)
        t = 1 + 0.04 * fib + 0.07 * blot + 0.014 * np.sin(2 * np.pi * u * 48)
        return c[None, None, :] * t[..., None]
    return img_mat(name, 256, 256, fn, 0.85, 0.0, 0.7)


def leather_mat(name, base, seed=0, size=0.7, rough=0.45):
    def fn(u, v, np):
        c = np.array(hx(base))
        mott = tnoise(np, u, v, seed, (1, 5), (1, 5), 16)
        grain = tnoise(np, u, v, seed + 1, (20, 70), (20, 70), 50, 0.3)
        crease = np.exp(-np.abs(tnoise(np, u, v, seed + 2, (3, 9), (3, 9), 14)) * 9)
        t = 1 + 0.08 * mott + 0.04 * grain - 0.12 * crease
        return c[None, None, :] * t[..., None]
    return img_mat(name, 512, 512, fn, rough, 0.0, size)


def fabric_mat(name, base, seed=0, size=0.5, rough=0.92):
    def fn(u, v, np):
        c = np.array(hx(base))
        weave = np.sin(2 * np.pi * u * 160) * np.sin(2 * np.pi * v * 160)
        mott = tnoise(np, u, v, seed, (1, 6), (1, 6), 16)
        return c[None, None, :] * (1 + 0.035 * weave + 0.06 * mott)[..., None]
    return img_mat(name, 256, 256, fn, rough, 0.0, size)


def brushed_mat(name, base, metal=0.65, rough=0.3, size=0.6, seed=0):
    def fn(u, v, np):
        c = np.array(hx(base))
        streak = tnoise(np, u, v, seed, (0, 2), (40, 140), 50, 0.2)
        blot = tnoise(np, u, v, seed + 1, (1, 4), (1, 4), 10)
        return c[None, None, :] * (1 + 0.05 * streak + 0.05 * blot)[..., None]
    return img_mat(name, 256, 256, fn, rough, metal, size, spec=True)


def glow_mat(name, col, k, sample=True):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = col_mat(name, srgb(col), 0.5, emit=srgb(col), emit_k=k)
    if not sample:
        try: m.cycles.emission_sampling = "NONE"  # the lights do the lighting; a bulb only shows
        except Exception: pass
    return m


def brass_mat():
    return get_mat("brass_m", lambda: col_mat("brass_m", srgb("#c8963e"), 0.32, 0.65))


def soft(ob, w, seg=4):
    """rounder bevel on an object made by box()"""
    for md in ob.modifiers:
        if md.type == "BEVEL": md.width = w; md.segments = seg
    return ob


def tube(name, r, h, at, mat, seg=24, r2=None, thick=0.004):
    """an open cylinder / cone shell (lamp shades: the light leaves through the ends)"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, h / 2)))
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = E(*at); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    md = ob.modifiers.new("sol", "SOLIDIFY"); md.thickness = thick; md.offset = 0
    return ob


def ghost(ob):
    """a glowing part that shows but neither blocks its own light nor scatters it (no fireflies in the bake)"""
    ob.visible_shadow = False; ob.visible_diffuse = False; ob.visible_glossy = False; ob.visible_transmission = False
    return ob


def lamp_light(name, at, power, col="#ffd2a0", radius=0.03, spot=0.0, blend=0.6):
    """a practical's light (point, or a spot pointing straight down); listed in set.json as a practical"""
    la = bpy.data.lights.new(name, "SPOT" if spot else "POINT")
    la.energy = power * LIGHT_K[0]; la.color = srgb(col); la.shadow_soft_size = radius
    if spot: la.spot_size = math.radians(spot); la.spot_blend = blend
    ob = link(bpy.data.objects.new(name, la)); ob.location = E(*at)
    ob["practical"] = 1
    return ob


LIGHT_K = [1.0]  # global multiplier for the practicals of the set being built


class Grp:
    """collect the objects created inside a with-block, then move / turn them as one piece (local axes = engine axes,
    rot = turn about +y: the piece's +z front then faces (sin rot, cos rot))"""
    def __enter__(self):
        self.before = set(bpy.data.objects); return self

    def __exit__(self, *a):
        self.objs = [o for o in bpy.data.objects if o not in self.before]

    def place(self, at, rot=0.0, pre=None):
        M = Matrix.Translation(E(*at)) @ Matrix.Rotation(rot, 4, "Z") @ (pre if pre is not None else Matrix.Identity(4))
        for o in self.objs:
            if o.parent is None: o.matrix_basis = M @ o.matrix_basis  # (matrix_world is stale until the depsgraph updates)
        return self


_models = {}


def model(asset, name, at, height=None, rot=0.0, drop=()):
    """an instance of a Poly Haven model: imported once (native size, base centre at the origin), then linked copies"""
    key = (asset, tuple(drop))
    if key not in _models:
        src = import_model(asset, f"SRC_{asset}", (0, -80, 0), height=None, drop=drop)
        bb = [Vector(c) for c in src.bound_box]
        src["h"] = max(v.z for v in bb) - min(v.z for v in bb)
        _models[key] = src
    src = _models[key]
    ob = src.copy(); link(ob); ob.name = name
    k = (height / max(1e-6, src["h"])) if height else 1.0
    ob.scale = (k, k, k); ob.location = E(*at); ob.rotation_euler = (0, 0, rot)
    return ob


def drop_model_sources():
    for src in _models.values():
        if src.name in bpy.data.objects: bpy.data.objects.remove(src)
    _models.clear()


# ---- fixtures (practicals)
def pendant_lamp(name, at, top, power, shade="#3a2c22", r=0.21, h=0.24, spot=80, col="#ffd2a0", glow_k=1.6, blend=0.55):
    """a cone shade on a cord from the ceiling (top = ceiling y), a brass rim and cap, a glowing underside and bulb,
    a warm spot pointing down; at = the rim centre"""
    x, y, z = at
    en = get_mat(f"enamel{shade[1:]}", lambda: col_mat(f"enamel{shade[1:]}", srgb(shade), 0.3))
    cord = get_mat("cord_m", lambda: col_mat("cord_m", srgb("#1e1a17"), 0.6))
    cyl(f"{name}_cord", 0.006, max(0.05, top - (y + h)), (x, y + h, z), cord, seg=6)
    cyl(f"{name}_cap", r * 0.16, 0.07, (x, y + h - 0.02, z), brass_mat(), seg=16)
    cyl(f"{name}_shade", r, h, (x, y, z), en, seg=36, r2=r * 0.24)
    cyl(f"{name}_rim", r + 0.004, 0.014, (x, y - 0.004, z), brass_mat(), seg=36)
    ghost(cyl(f"{name}_in", r - 0.012, 0.004, (x, y - 0.007, z), glow_mat("shade_in", "#fff1dc", glow_k), seg=36))
    ghost(cyl(f"{name}_bulb", 0.032, 0.05, (x, y - 0.045, z), glow_mat("bulb_m", "#fff6e6", 9.0, False), seg=16, r2=0.022))
    return lamp_light(f"{name}_L", (x, y - 0.035, z), power, col, 0.05, spot=spot, blend=blend)


def wall_sconce(name, at, rot, power, col="#ffd2a0", shade="#efd6a8"):
    """brass plate and arm, an open fabric shade glowing warm (light leaves up and down: two scallops on the wall);
    at = the wall point at the shade's height"""
    with Grp() as g:
        box(f"{name}_plate", 0.09, 0.17, 0.02, (0, -0.1, 0.01), brass_mat(), bevel=0.006)
        box(f"{name}_arm", 0.02, 0.02, 0.15, (0, -0.06, 0.09), brass_mat(), bevel=0.004)
        tube(f"{name}_shade", 0.085, 0.17, (0, -0.06, 0.17), glow_mat("sconce_shade", shade, 1.5), seg=28, r2=0.066)
        ghost(cyl(f"{name}_bulb", 0.022, 0.05, (0, -0.02, 0.17), glow_mat("bulb_m", "#fff6e6", 9.0, False), seg=12))
        lamp_light(f"{name}_L", (0, 0.03, 0.17), power, col, 0.02)
    return g.place(at, rot)


def floor_lamp(name, at, power, col="#ffd2a0"):
    with Grp() as g:
        br = get_mat("bronze_m", lambda: col_mat("bronze_m", srgb("#5c4630"), 0.35, 0.6))
        cyl(f"{name}_base", 0.16, 0.03, (0, 0, 0), br, seg=32)
        cyl(f"{name}_pole", 0.014, 1.42, (0, 0.03, 0), br, seg=10)
        tube(f"{name}_shade", 0.23, 0.32, (0, 1.3, 0), glow_mat("floor_shade", "#ecc994", 1.3), seg=36, r2=0.19)
        ghost(cyl(f"{name}_bulb", 0.03, 0.08, (0, 1.4, 0), glow_mat("bulb_m", "#fff6e6", 9.0, False), seg=12))
        lamp_light(f"{name}_L", (0, 1.46, 0), power, col, 0.04)
    return g.place(at)


def banker_lamp(name, at, rot, power, col="#ffc890"):
    with Grp() as g:
        b = brass_mat()
        cyl(f"{name}_base", 0.085, 0.025, (0, 0, -0.04), b, seg=28)
        cyl(f"{name}_stem", 0.011, 0.29, (0, 0.025, -0.04), b, seg=10)
        box(f"{name}_arm", 0.02, 0.02, 0.07, (0, 0.29, -0.03), b, bevel=0.004)
        sh = box(f"{name}_shade", 0.34, 0.07, 0.15, (0, 0.28, 0.02), glow_mat("banker_shade", "#d8923a", 2.0), bevel=0.03); soft(sh, 0.032, 4)
        cyl(f"{name}_chain", 0.003, 0.09, (0.12, 0.2, 0.08), b, seg=6)
        lamp_light(f"{name}_L", (0, 0.27, 0.02), power, col, 0.02, spot=150, blend=0.8)
    return g.place(at, rot)


def cage_lamp(name, at, rot, power, col="#ffc890"):
    """a bulkhead on a wall: dark plate, a glowing glass and a wire cage"""
    with Grp() as g:
        dk = get_mat("cage_m", lambda: col_mat("cage_m", srgb("#2c2824"), 0.4, 0.55))
        box(f"{name}_plate", 0.16, 0.16, 0.03, (0, -0.08, 0.0), dk, bevel=0.01)
        ghost(disc(f"{name}_glass", (0, 0, 0.09), 0.062, 0.12, glow_mat("cage_glass", "#ffe2b0", 3.5), axis="z", seg=20))
        for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            box(f"{name}_bar{sx}{sy}", 0.012, 0.012, 0.13, (sx * 0.074, sy * 0.074 - 0.006, 0.03), dk, bevel=0.0)
        box(f"{name}_ring", 0.16, 0.012, 0.012, (0, -0.006, 0.155), dk, bevel=0.0)
        lamp_light(f"{name}_L", (0, 0, 0.17), power, col, 0.03)
    return g.place(at, rot)


# ---- painted images
def art_fn(seed):
    def fn(u, v, np):
        r = _random.Random(seed)
        top, hor = np.array(hx(r.choice(["#e9c48a", "#e8b47a", "#d9b98e"]))), np.array(hx("#f3dcb0"))
        out = hor[None, None] * (1 - v[..., None]) + top[None, None] * v[..., None]
        sx, sy = r.uniform(0.25, 0.75), r.uniform(0.62, 0.8)
        out[(u - sx) ** 2 + ((v - sy) * 0.8) ** 2 < 0.006] = hx("#f8e6bc")
        for k, c in enumerate(["#c08848", "#9a6236", "#6e4428"]):
            ph = r.uniform(0, 6.28); base = 0.52 - k * 0.14
            hill = base + 0.06 * np.sin(u * r.uniform(5, 9) + ph) + 0.03 * np.sin(u * 17 + ph * 2)
            out[v < hill] = hx(c)
        n = tnoise(np, u, v, seed, (2, 30), (2, 30), 30)
        return out * (1 + 0.03 * n[..., None])
    return fn


def rug_fn(u, v, np):
    W_, D_ = 2.7, 2.1
    d = np.minimum(np.minimum(u, 1 - u) * W_, np.minimum(v, 1 - v) * D_)
    out = np.ones(u.shape + (3,)) * np.array(hx("#8c5038"))
    lat = (np.abs(((u * W_ * 3.2) % 1) - 0.5) + np.abs(((v * D_ * 3.2) % 1) - 0.5)) < 0.18
    out[lat] = hx("#9e5e40")
    cx, cy = (u - 0.5) * W_, (v - 0.5) * D_
    dia = np.abs(cx) / 0.95 + np.abs(cy) / 0.62
    out[dia < 1.0] = hx("#5a3424"); out[dia < 0.82] = hx("#cdb488"); out[dia < 0.62] = hx("#985a3e"); out[dia < 0.3] = hx("#dccaa2")
    out[d < 0.26] = hx("#b48e5a")
    out[(d > 0.06) & (d < 0.085)] = hx("#ead7a8")
    out[(d > 0.2) & (d < 0.23)] = hx("#5a2e1c")
    bd = (d < 0.2) & (d > 0.09) & (np.sin((u * W_ + v * D_) * 22) > 0.55)
    out[bd] = hx("#7a4630")
    n = tnoise(np, u, v, 5, (10, 80), (10, 80), 40, 0.4)
    return out * (1 + 0.05 * n[..., None])


def label_fn(u, v, np):
    out = np.ones(u.shape + (3,)) * np.array(hx("#f3f0e8"))
    out[(v < 0.42) & (v > 0.1) & (u > 0.08) & (u < 0.66) & (np.sin(u * 260 + np.sin(u * 37) * 3) > 0.2)] = hx("#2a2624")
    for y, w in ((0.82, 0.8), (0.7, 0.55), (0.58, 0.68)):
        out[(np.abs(v - y) < 0.032) & (u > 0.08) & (u < 0.08 + w * 0.84)] = hx("#6a645c")
    out[(u > 0.74) & (u < 0.92) & (v > 0.12) & (v < 0.4)] = hx("#d9823a")
    return out


def screen_fn(u, v, np):
    """an online shop's back office on the monitor: warm header, product tiles, an order list"""
    out = np.ones(u.shape + (3,)) * np.array(hx("#f6f0e4"))
    out[v > 0.86] = hx("#e07b39")
    out[(v > 0.89) & (v < 0.94) & (u > 0.04) & (u < 0.2)] = hx("#fbe7cf")
    out[(u < 0.16) & (v <= 0.86)] = hx("#3a302a")
    for k in range(5): out[(u > 0.03) & (u < 0.13) & (np.abs(v - (0.78 - k * 0.1)) < 0.018)] = hx("#8a7a6a")
    for i in range(3):
        for j in range(2):
            x0, y0 = 0.2 + i * 0.17, 0.48 + j * 0.19
            m = (u > x0) & (u < x0 + 0.14) & (v > y0) & (v < y0 + 0.16); out[m] = hx("#ecdcc0")
            out[(u > x0 + 0.02) & (u < x0 + 0.12) & (v > y0 + 0.05) & (v < y0 + 0.14)] = hx(["#c9965a", "#9a6a46", "#d8b070"][(i + j) % 3])
            out[(u > x0 + 0.02) & (u < x0 + 0.09) & (np.abs(v - (y0 + 0.025)) < 0.008)] = hx("#7a6a5a")
    for k in range(4):
        y = 0.38 - k * 0.085
        out[(u > 0.2) & (u < 0.94) & (np.abs(v - y) < 0.032)] = hx("#efe4d2" if k % 2 else "#e8dac4")
        out[(u > 0.22) & (u < 0.5) & (np.abs(v - y) < 0.008)] = hx("#6a5a4a")
        out[(u > 0.84) & (u < 0.92) & (np.abs(v - y) < 0.016)] = hx("#5f9a4e" if k != 1 else "#e08a3a")
    out[(u > 0.73) & (u < 0.94) & (v > 0.86)] = hx("#f6c08a")
    return out


def calendar_fn(u, v, np):
    out = np.ones(u.shape + (3,)) * np.array(hx("#f2ead8"))
    out[v > 0.8] = hx("#a8482a")
    out[(v > 0.86) & (v < 0.92) & (u > 0.25) & (u < 0.75)] = hx("#f2dcc0")
    g = (v < 0.74) & (v > 0.06) & (u > 0.06) & (u < 0.94)
    out[g & ((np.abs(((u - 0.06) / 0.88 * 7) % 1) < 0.04) | (np.abs(((v - 0.06) / 0.68 * 5) % 1) < 0.05))] = hx("#b8ab98")
    out[np.abs(np.hypot((u - 0.5) * 1.2, v - 0.42) - 0.06) < 0.012] = hx("#c8302a")
    return out


def warm_city_fn(u, v, np):
    """late-afternoon city behind the office window: a warm horizon, desaturated sky, warm-grey blocks, lit windows"""
    sky = np.array(hx("#aab8c2"))[None, None] * np.clip(v[..., None] * 1.6 - 0.55, 0, 1) + \
        np.array(hx("#f2cf9c"))[None, None] * (1 - np.clip(v[..., None] * 1.6 - 0.55, 0, 1))
    out = sky.copy()
    r = _random.Random(9)
    for k in range(18):
        x0 = r.uniform(-0.05, 0.98); bw = r.uniform(0.05, 0.13); bh = r.uniform(0.3, 0.62)
        m = (u > x0) & (u < x0 + bw) & (v < bh)
        c = np.array(hx(r.choice(["#b39a84", "#a08876", "#c4ab92", "#94806e"])))
        out[m] = c[None, :] * (0.92 + 0.08 * ((u[m] - x0) / bw))[:, None]
        for wy in np.arange(0.06, bh - 0.03, 0.045):
            mm = m & (np.abs(v - wy) < 0.011) & ((np.floor((u - x0) * 140) % 2) == 0)
            lit = (np.sin(np.floor((u - x0) * 70) * 3.1 + wy * 50 + k) > 0.55)
            out[mm & lit] = hx("#f8d898"); out[mm & ~lit] = c * 0.8
    out[v < 0.07] = hx("#7a6a5a")
    return out


def office_glow_fn(u, v, np):
    """a lit back office seen through the dispatch window: warm wall, a shelf of files, a lamp, a desk edge"""
    out = np.ones(u.shape + (3,)) * np.array(hx("#e8c48e"))
    out *= (0.8 + 0.25 * np.exp(-((u - 0.25) ** 2 + (v - 0.75) ** 2) * 8))[..., None]
    sh = (v > 0.55) & (v < 0.58); out[sh] = hx("#6a4a30")
    for k in range(14):
        x0 = 0.45 + k * 0.035; c = hx(["#a8582e", "#c89a4a", "#5a3a28", "#e0cfa8"][k % 4])
        out[(u > x0) & (u < x0 + 0.03) & (v > 0.58) & (v < 0.58 + 0.12 + 0.03 * (k % 3))] = c
    out[v < 0.22] = hx("#6e4a30"); out[(v > 0.2) & (v < 0.23)] = hx("#8a6440")
    out[(np.hypot((u - 0.25) / 0.06, (v - 0.72) / 0.05) < 1)] = hx("#fff0c8")
    return out


# ---- furniture and props
BOOK_COLS = ["#7a2e22", "#9a4a28", "#b8742e", "#c99a48", "#5c3a26", "#e2d2ac", "#8a6a3a", "#a83a2a", "#6e4a2e", "#d8b878", "#3e4a36", "#a86a3a"]
BINDER_COLS = ["#c08a3a", "#8a3a2a", "#5a4030", "#d8c8a0", "#9a5a2e", "#3a4a3a"]


def flat(c, rough=0.6):
    return get_mat(f"c{c[1:]}_{int(rough * 100)}", lambda: col_mat(f"c{c[1:]}_{int(rough * 100)}", srgb(c), rough))


def shelf_fill(p, x0, x1, y, zf, depth, clear, r, kinds=("books", "books", "binders", "ency", "box", "deco")):
    """fill one shelf between x0 and x1 (local), base at y, the shelf's front edge at zf"""
    x = x0 + 0.02
    while x < x1 - 0.08:
        kind = r.choice(kinds); room = x1 - x
        if kind == "books" or (kind == "ency" and (room < 0.6 or clear < 0.27)):
            n = r.randint(5, 13)
            for _ in range(n):
                t = r.uniform(0.022, 0.05); hb = min(clear - 0.03, r.uniform(0.17, 0.29)); db = min(depth - 0.04, r.uniform(0.14, 0.22))
                if x + t > x1 - 0.02: break
                box(nm(p + "bk"), t, hb, db, (x + t / 2, y, zf - db / 2 - 0.02), flat(r.choice(BOOK_COLS), 0.65), bevel=0.004)
                x += t + r.uniform(0.0, 0.004)
            if r.random() < 0.45 and x < x1 - 0.25:
                t = 0.035; hb = min(clear - 0.06, 0.24)
                b = box(nm(p + "bl"), t, hb, 0.18, (x + 0.07, y, zf - 0.11), flat(r.choice(BOOK_COLS), 0.65), bevel=0.004)
                b.rotation_euler = (0, -0.32, 0); x += 0.13
            x += r.uniform(0.03, 0.1)
        elif kind == "binders":
            col = r.choice(BINDER_COLS)
            for _ in range(r.randint(3, 7)):
                t = 0.065; hb = min(clear - 0.03, 0.31); db = min(depth - 0.03, 0.27)
                if x + t > x1 - 0.02: break
                box(nm(p + "bd"), t, hb, db, (x + t / 2, y, zf - db / 2 - 0.015), flat(col if r.random() < 0.7 else r.choice(BINDER_COLS), 0.5), bevel=0.006)
                box(nm(p + "bdl"), 0.04, 0.085, 0.003, (x + t / 2, y + hb * 0.55, zf - 0.0135), flat("#efe8d6", 0.7), bevel=0.0)
                disc(nm(p + "bdh"), (x + t / 2, y + hb * 0.22, zf - 0.0135), 0.012, 0.004, flat("#2a221c", 0.7), axis="z", seg=12)
                x += t + 0.003
            x += r.uniform(0.03, 0.08)
        elif kind == "ency":
            model("book_encyclopedia_set_01", nm(p + "en"), (x + 0.28, y, zf - 0.1), height=0.237); x += 0.6
        elif kind == "box" and clear > 0.2:
            hb = min(clear - 0.04, r.uniform(0.16, 0.26)); bw = r.uniform(0.22, 0.34)
            if x + bw > x1 - 0.02: break
            box(nm(p + "fb"), bw, hb, depth - 0.06, (x + bw / 2, y, zf - depth / 2), r.choice(parcel_kit()["cards"]), bevel=0.008)
            if r.random() < 0.6: box(nm(p + "fbl"), bw * 0.5, hb * 0.35, 0.002, (x + bw / 2, y + hb * 0.4, zf - 0.03 + 0.001), parcel_kit()["label"], bevel=0.0)
            x += bw + r.uniform(0.03, 0.08)
        else:
            c = r.random()
            if c < 0.35 and clear > 0.32: model("potted_plant_02", nm(p + "pl"), (x + 0.13, y, zf - depth / 2), height=min(clear - 0.03, 0.34)); x += 0.3
            elif c < 0.6 and clear > 0.3: model("ceramic_vase_01", nm(p + "va"), (x + 0.08, y, zf - depth / 2), height=min(clear - 0.04, 0.28)); x += 0.2
            elif c < 0.8:
                b = brass_mat()
                cyl(nm(p + "tr"), 0.05, 0.03, (x + 0.07, y, zf - depth / 2), b, seg=16); cyl(nm(p + "tr"), 0.012, 0.08, (x + 0.07, y + 0.03, zf - depth / 2), b, seg=8)
                cyl(nm(p + "tr"), 0.03, 0.08, (x + 0.07, y + 0.11, zf - depth / 2), b, seg=20, r2=0.055); x += 0.18
            else:
                model("standing_picture_frame_01", nm(p + "ph"), (x + 0.08, y, zf - depth / 2 + 0.03), height=min(0.22, clear - 0.04), drop=("glass",)); x += 0.18
            x += 0.04


def bookcase(p, w=1.6, h=2.25, d=0.36, n=5, seed=0, wood=None, fill=True):
    """a wooden bookcase (local: base centre at the origin, back at -d/2, front +z) full of books, binders,
    boxes and ornaments"""
    r = _random.Random(seed)
    wood = wood or wood_mat("case_wood", "#8a5634", "#5e3820", 1.0, seed=4)
    back = get_mat("case_back", lambda: col_mat("case_back", srgb("#4a2c1a"), 0.7))
    t = 0.03
    with Grp() as g:
        for sx in (-1, 1): box(nm(p + "s"), t, h, d, (sx * (w / 2 - t / 2), 0, 0), wood, bevel=0.006)
        box(nm(p + "top"), w, t, d, (0, h - t, 0), wood, bevel=0.006)
        box(nm(p + "crown"), w + 0.06, 0.05, d + 0.05, (0, h, 0.0), wood, bevel=0.012)
        box(nm(p + "plinth"), w - 2 * t, 0.08, d - 0.03, (0, 0, -0.01), wood, bevel=0.006)
        box(nm(p + "back"), w - 2 * t, h - 0.1, 0.012, (0, 0.06, -d / 2 + 0.006), back, bevel=0.0)
        step = (h - 0.08 - t) / n
        for k in range(n):
            y = 0.08 + k * step
            if k: box(nm(p + "sh"), w - 2 * t, 0.022, d - 0.02, (0, y, 0.0), wood, bevel=0.004)
            if fill: shelf_fill(p, -w / 2 + t, w / 2 - t, y + (0.022 if k else 0.0), d / 2 - 0.01, d - 0.03, step - 0.022, r)
    return g


def exec_desk(p, wood, dark, leather):
    """an executive desk, top surface at y 0.76 (local: centred, the drawer fronts toward +z)"""
    W_, D_ = 1.8, 0.85
    with Grp() as g:
        box(p + "_top", W_, 0.045, D_, (0, 0.715, 0), wood, bevel=0.012)
        box(p + "_lip", W_ - 0.04, 0.03, D_ - 0.04, (0, 0.69, 0), dark, bevel=0.006)
        box(p + "_pad", 1.0, 0.004, 0.5, (0.0, 0.76, -0.08), leather, bevel=0.002)
        for sx in (-1, 1):
            px = sx * (W_ / 2 - 0.27)
            box(nm(p + "_ped"), 0.5, 0.63, D_ - 0.08, (px, 0.06, 0), wood, bevel=0.01)
            box(nm(p + "_kick"), 0.44, 0.06, D_ - 0.14, (px, 0, -0.01), dark, bevel=0.006)
            for k in range(3):
                y0 = 0.1 + k * 0.195
                box(nm(p + "_dr"), 0.44, 0.17, 0.02, (px, y0, (D_ - 0.08) / 2 + 0.01), wood, bevel=0.008)
                box(nm(p + "_pull"), 0.12, 0.018, 0.022, (px, y0 + 0.11, (D_ - 0.08) / 2 + 0.03), brass_mat(), bevel=0.005)
        box(p + "_modesty", W_ - 1.04, 0.52, 0.03, (0, 0.17, -D_ / 2 + 0.12), dark, bevel=0.008)
        box(p + "_centre", W_ - 1.04, 0.1, 0.02, (0, 0.58, D_ / 2 - 0.03), wood, bevel=0.006)
    return g


def exec_chair(p, leather):
    met = get_mat("chrome_m", lambda: col_mat("chrome_m", srgb("#bdb6aa"), 0.22, 0.85))
    with Grp() as g:
        soft(box(p + "_seat", 0.54, 0.11, 0.52, (0, 0.44, 0.02), leather, bevel=0.04), 0.045)
        soft(box(p + "_back", 0.52, 0.74, 0.11, (0, 0.55, -0.24), leather, bevel=0.05), 0.05)
        for sx in (-1, 1):
            soft(box(nm(p + "_arm"), 0.06, 0.05, 0.4, (sx * 0.3, 0.66, 0.02), leather, bevel=0.02), 0.02)
            box(nm(p + "_armp"), 0.035, 0.18, 0.035, (sx * 0.3, 0.49, 0.05), met, bevel=0.008)
        cyl(p + "_lift", 0.03, 0.35, (0, 0.1, 0), met, seg=12)
        for k in range(5):
            a = k * 2 * math.pi / 5
            box(nm(p + "_leg"), 0.05, 0.04, 0.3, (math.sin(a) * 0.14, 0.06, math.cos(a) * 0.14), met, bevel=0.012, rot_y=a)
            cyl(nm(p + "_wh"), 0.03, 0.05, (math.sin(a) * 0.28, 0.0, math.cos(a) * 0.28), flat("#26221e", 0.5), seg=10)
    return g


def monitor_set(p):
    """a slim monitor (screen 0.6 x 0.36, the shop's back office on it), keyboard and mouse; local front +z"""
    dk = flat("#2a2624", 0.45)
    with Grp() as g:
        box(p + "_foot", 0.24, 0.015, 0.16, (0, 0, -0.06), dk, bevel=0.006)
        box(p + "_neck", 0.05, 0.2, 0.03, (0, 0.015, -0.1), dk, bevel=0.008)
        box(p + "_bezel", 0.64, 0.4, 0.03, (0, 0.17, -0.07), dk, bevel=0.01)
        box(p + "_screen", 0.6, 0.36, 0.004, (0, 0.19, -0.054), img_mat("off_screen", 384, 224, screen_fn, 0.35, fit=1, emit=0.9), bevel=0.0)
        box(p + "_kb", 0.44, 0.02, 0.15, (0, 0, 0.22), flat("#d9d0c0", 0.6), bevel=0.008)
        for i in range(4): box(nm(p + "_keys"), 0.4, 0.004, 0.022, (0, 0.02, 0.17 + i * 0.03), flat("#bcb2a2", 0.6), bevel=0.0)
        soft(box(p + "_mouse", 0.06, 0.03, 0.1, (0.32, 0, 0.22), flat("#d9d0c0", 0.5), bevel=0.02), 0.02)
    return g


def sofa(p, leather, wood):
    """a three-seat leather sofa (local: back at -z, facing +z, length 1.95 along x)"""
    L, Dp = 1.95, 0.88
    with Grp() as g:
        soft(box(p + "_base", L - 0.1, 0.24, Dp - 0.08, (0, 0.1, 0.0), leather, bevel=0.04), 0.04)
        for k in (-1, 1):
            soft(box(nm(p + "_seat"), (L - 0.42) / 2, 0.15, Dp - 0.3, (k * (L - 0.42) / 4, 0.33, 0.08), leather, bevel=0.06), 0.06)
            soft(box(nm(p + "_backc"), (L - 0.42) / 2, 0.44, 0.2, (k * (L - 0.42) / 4, 0.4, -Dp / 2 + 0.17), leather, bevel=0.07), 0.07)
        soft(box(p + "_back", L - 0.1, 0.62, 0.16, (0, 0.24, -Dp / 2 + 0.08), leather, bevel=0.05), 0.05)
        for sx in (-1, 1):
            soft(box(nm(p + "_arm"), 0.2, 0.42, Dp, (sx * (L / 2 - 0.1), 0.2, 0), leather, bevel=0.08), 0.08)
            for sz in (-1, 1): cyl(nm(p + "_foot"), 0.028, 0.1, (sx * (L / 2 - 0.12), 0, sz * (Dp / 2 - 0.1)), wood, seg=12, r2=0.02)
        soft(box(p + "_cush", 0.42, 0.36, 0.13, (-L / 2 + 0.42, 0.45, -Dp / 2 + 0.33), fabric_mat("cushion_fab", "#c8914a", 3), bevel=0.06), 0.06).rotation_euler = (0.25, 0, 0.12)
    return g


def coffee_table(p, wood, r):
    with Grp() as g:
        box(p + "_top", 1.0, 0.04, 0.56, (0, 0.38, 0), wood, bevel=0.01)
        box(p + "_shelf", 0.9, 0.02, 0.46, (0, 0.1, 0), wood, bevel=0.006)
        for sx in (-1, 1):
            for sz in (-1, 1): box(nm(p + "_leg"), 0.045, 0.38, 0.045, (sx * 0.45, 0, sz * 0.23), wood, bevel=0.008)
        for k in range(3):
            ob = box(nm(p + "_mag"), 0.21, 0.006, 0.28, (-0.25 + k * 0.03, 0.42 + k * 0.006, 0.02 + k * 0.02), flat(["#d8a050", "#a84a2a", "#efe4cc"][k], 0.5), bevel=0.0)
            ob.rotation_euler = (0, 0, 0.3 - k * 0.25)
        cyl(p + "_mug", 0.04, 0.09, (0.12, 0.42, 0.1), flat("#efe6d6", 0.3), seg=20)
        model("ceramic_vase_01", nm(p + "_vase"), (0.3, 0.42, -0.08), height=0.3)
        for k in range(4): box(nm(p + "_bk"), 0.24, 0.03, 0.17, (0.0, 0.12 + k * 0.03, 0.0), flat(r.choice(BOOK_COLS), 0.6), bevel=0.004)
    return g


def framed(p, w, h, mat, frame, depth=0.03, fw=0.05):
    """a picture in a frame on a wall (local: wall at z = 0, facing +z, centre at the origin)"""
    with Grp() as g:
        box(p + "_mount", w + 0.02, h + 0.02, 0.012, (0, -h / 2 - 0.01, 0.006), flat("#efe4cc", 0.8), bevel=0.0)
        box(p + "_art", w - 0.08, h - 0.08, 0.004, (0, -h / 2 + 0.04, 0.013), mat, bevel=0.0)
        for sy in (-1, 1): box(nm(p + "_fh"), w + 2 * fw, fw, depth, (0, sy * (h / 2 + fw / 2) - fw / 2, depth / 2), frame, bevel=0.008)
        for sx in (-1, 1): box(nm(p + "_fv"), fw, h, depth, (sx * (w / 2 + fw / 2), -h / 2, depth / 2), frame, bevel=0.008)
    return g


def coat_rack(p, wood, coat_col="#a8783e"):
    with Grp() as g:
        cyl(p + "_pole", 0.022, 1.78, (0, 0.04, 0), wood, seg=12)
        sphere = blob(p + "_knob", 0.04, (0, 1.84, 0), wood, k=1.0, seed=1, sub=2)
        for k in range(3):
            a = k * 2 * math.pi / 3
            box(nm(p + "_foot"), 0.05, 0.05, 0.42, (math.sin(a) * 0.18, 0, math.cos(a) * 0.18), wood, bevel=0.012, rot_y=a)
        for k in range(4):
            a = k * math.pi / 2 + 0.4
            hk = box(nm(p + "_hook"), 0.025, 0.025, 0.16, (math.sin(a) * 0.08, 1.62, math.cos(a) * 0.08), brass_mat(), bevel=0.006, rot_y=a)
            hk.rotation_euler = (0.5, 0, a)
        coat = blob(p + "_coat", 0.26, (0.0, 0.85, 0.18), fabric_mat("coat_fab", coat_col, 6), k=2.4, seed=3, sub=3)
        coat.scale = (0.9, 0.55, 1.0)
        blob(p + "_scarf", 0.09, (0.12, 1.52, 0.1), fabric_mat("scarf_fab", "#a8402a", 7), k=2.6, seed=5, sub=2)
        hat = get_mat("hat_m", lambda: col_mat("hat_m", srgb("#4a3424"), 0.7))
        cyl(p + "_brim", 0.17, 0.015, (-0.02, 1.82, -0.02), hat, seg=28); cyl(p + "_crown", 0.1, 0.11, (-0.02, 1.835, -0.02), hat, seg=24, r2=0.09)
        cyl(p + "_band", 0.102, 0.025, (-0.02, 1.84, -0.02), flat("#8a3a24", 0.5), seg=24)
    return g


def filing_pair(p, n=2):
    met = get_mat("cab_warm", lambda: col_mat("cab_warm", srgb("#b4a688"), 0.42, 0.35))
    dark = brass_mat()
    with Grp() as g:
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.5; h = 1.32
            box(nm(p + "_body"), 0.48, h, 0.6, (x, 0, 0), met, bevel=0.012)
            for k in range(4):
                yy = 0.05 + k * (h - 0.08) / 4
                box(nm(p + "_dr"), 0.44, (h - 0.12) / 4 - 0.03, 0.02, (x, yy, 0.305), met, bevel=0.006)
                box(nm(p + "_hd"), 0.14, 0.025, 0.03, (x, yy + (h - 0.12) / 4 * 0.6, 0.32), dark, bevel=0.006)
                box(nm(p + "_tag"), 0.08, 0.04, 0.004, (x, yy + (h - 0.12) / 4 * 0.3, 0.317), flat("#efe6d2", 0.7), bevel=0.0)
        model("potted_plant_02", nm(p + "_plant"), (-0.25 * (n - 1), 1.32, 0.0), height=0.38)
        for k in range(3): box(nm(p + "_bx"), 0.3, 0.05, 0.38, (0.25 * (n - 1) - 0.05, 1.32 + k * 0.05, 0.0), flat(r_choice(BINDER_COLS, k), 0.6), bevel=0.006)
    return g


def r_choice(seq, k):
    return seq[k % len(seq)]


def wall_shelf(p, w, wood):
    """a wall shelf on two brackets (local: wall at z = 0, board top at y = 0)"""
    with Grp() as g:
        box(p + "_board", w, 0.03, 0.26, (0, -0.03, 0.13), wood, bevel=0.006)
        for sx in (-1, 1):
            box(nm(p + "_brk"), 0.03, 0.2, 0.02, (sx * (w / 2 - 0.15), -0.22, 0.01), get_mat("cage_m", lambda: col_mat("cage_m", srgb("#2c2824"), 0.4, 0.55)), bevel=0.004)
            box(nm(p + "_brk2"), 0.03, 0.03, 0.22, (sx * (w / 2 - 0.15), -0.06, 0.12), get_mat("cage_m", lambda: col_mat("cage_m", srgb("#2c2824"), 0.4, 0.55)), bevel=0.004)
    return g


# ---- parcels, racking, cages, pallets (the depot)
def parcel_kit():
    if "pk" not in _kit:
        _kit["pk"] = {"cards": [card_mat(f"card{i}", c, 10 + i) for i, c in enumerate(("#c39a62", "#b5885a", "#d1ad78", "#a97d50"))],
                      "tape": get_mat("ptape", lambda: col_mat("ptape", srgb("#d9be8a"), 0.35)),
                      "label": img_mat("plabel", 160, 112, label_fn, 0.6, fit=1),
                      "white": get_mat("pmailer", lambda: col_mat("pmailer", srgb("#e6dfd0"), 0.45)),
                      "red": get_mat("pfragile", lambda: col_mat("pfragile", srgb("#c4472e"), 0.5))}
    return _kit["pk"]


def parcel(at, size, rot=0.0, r=None, label=0.55, tape=True):
    """a cardboard parcel: taped top, often a shipping label on its front; now and then a soft white mailer"""
    k = parcel_kit(); w, h, d = size; x, y, z = at
    n = nm("pc"); r = r or _random.Random(0)
    if r.random() < 0.07:
        soft(box(n, w, min(h, 0.11), d, at, k["white"], bevel=0.03, rot_y=rot), 0.035, 3); return min(h, 0.11)
    box(n, w, h, d, at, r.choice(k["cards"]), bevel=0.008, rot_y=rot)
    s, c = math.sin(rot), math.cos(rot)
    if tape: box(n + "t", w + 0.004, 0.003, min(0.07, d * 0.3), (x, y + h, z), k["tape"], bevel=0.0, rot_y=rot)
    if r.random() < label and h > 0.12:
        off = r.uniform(-0.22, 0.22) * w; lw, lh = min(0.14, w * 0.5), min(0.1, h * 0.45)
        box(n + "l", lw, lh, 0.002, (x + s * (d / 2 + 0.001) + c * off, y + h * 0.3, z + c * (d / 2 + 0.001) - s * off), k["label"], bevel=0.0, rot_y=rot)
    if r.random() < 0.05:
        box(n + "f", w + 0.004, 0.05, 0.002, (x + s * (d / 2 + 0.0015), y + h * 0.72, z + c * (d / 2 + 0.0015)), k["red"], bevel=0.0, rot_y=rot)
    return h


def parcel_stack(x0, x1, y, z, depth, clear, r, fill=0.85, zj=0.06):
    """a row of parcels between x0 and x1 (local), some stacked two high"""
    x = x0 + 0.03
    while x < x1 - 0.2:
        w = min(x1 - x - 0.02, r.uniform(0.28, 0.62))
        if w < 0.2: break
        if r.random() < fill:
            h = min(clear - 0.04, r.uniform(0.2, 0.5)); d = min(depth - 0.06, r.uniform(0.3, 0.6))
            zz = z + r.uniform(-zj, zj)
            h = parcel((x + w / 2, y, zz), (w, h, d), r.uniform(-0.06, 0.06), r)
            if clear - h > 0.26 and r.random() < 0.55:
                w2 = w * r.uniform(0.6, 0.95); h2 = min(clear - h - 0.04, r.uniform(0.16, 0.36))
                parcel((x + w / 2 + r.uniform(-0.04, 0.04), y + h, zz), (w2, h2, d * r.uniform(0.7, 1.0)), r.uniform(-0.15, 0.15), r)
        x += w + r.uniform(0.02, 0.07)


def pallet(p, w=1.2, d=1.0):
    pw = wood_mat("pallet_wood", "#c9a878", "#94744c", 0.9, seed=11, amp=1.2)
    with Grp() as g:
        for i in range(7): box(nm(p + "_t"), 0.1, 0.022, d, (-w / 2 + 0.05 + i * (w - 0.1) / 6, 0.122, 0), pw, bevel=0.005)
        for i in range(3):
            for j in range(3): box(nm(p + "_blk"), 0.12, 0.078, 0.12, (-w / 2 + 0.06 + i * (w - 0.12) / 2, 0.022, -d / 2 + 0.06 + j * (d - 0.12) / 2), pw, bevel=0.006)
            box(nm(p + "_bt"), w, 0.022, 0.1, (0, 0, -d / 2 + 0.05 + i * (d - 0.1) / 2), pw, bevel=0.005)
    return g


def rack_row(p, bays, bw, h, d, levels, seed, fill=0.85, pallets=True):
    """pallet racking (local: centred on x, back at -d/2, facing +z): dark uprights, orange beams, plywood decks,
    parcels of every size on every level"""
    r = _random.Random(seed)
    up = get_mat("rack_up", lambda: col_mat("rack_up", srgb("#3d3833"), 0.5, 0.3))
    beam = get_mat("rack_beam", lambda: col_mat("rack_beam", srgb("#d0702a"), 0.45, 0.2))
    deck = wood_mat("rack_deck", "#b88a58", "#8a6440", 1.0, seed=7)
    w = bays * bw
    with Grp() as g:
        for i in range(bays + 1):
            xx = -w / 2 + i * bw
            for sz in (-1, 1):
                box(nm(p + "u"), 0.08, h, 0.07, (xx, 0, sz * (d / 2 - 0.035)), up, bevel=0.008)
                box(nm(p + "fp"), 0.14, 0.012, 0.12, (xx, 0, sz * (d / 2 - 0.035)), up, bevel=0.003)
            k = 0
            while 0.35 + k * 0.85 < h - 0.2:
                box(nm(p + "br"), 0.03, 0.03, d - 0.1, (xx, 0.35 + k * 0.85, 0), up, bevel=0.0); k += 1
        for li, y in enumerate(levels):
            top = levels[li + 1] if li + 1 < len(levels) else h + 0.4
            if y > 0.05:
                for sz in (-1, 1): box(nm(p + "b"), w, 0.1, 0.05, (0, y, sz * (d / 2 - 0.025)), beam, bevel=0.008)
                box(nm(p + "d"), w - 0.02, 0.022, d - 0.06, (0, y + 0.078, 0), deck, bevel=0.004)
                base = y + 0.1
            else:
                base = 0.0
            for b in range(bays):
                bx0 = -w / 2 + b * bw + 0.05; bx1 = bx0 + bw - 0.1
                yb = base
                if base == 0.0 and pallets and r.random() < 0.7:
                    with Grp() as pg: pallet(nm(p + "pal"), min(1.2, bw - 0.15), d - 0.15)
                    pg.place(((bx0 + bx1) / 2, 0, 0)); yb = 0.144
                parcel_stack(bx0, bx1, yb, 0.03, d, top - yb - 0.06, r, fill)
    return g


def roll_cage(p, seed=0, fill=0.6):
    r = _random.Random(seed)
    galv = brushed_mat("galv", "#a8a59c", 0.6, 0.35, 0.5, 2)
    rub = flat("#26221e", 0.6)
    w, d, h = 0.72, 0.8, 1.72
    with Grp() as g:
        box(nm(p + "_base"), w, 0.05, d, (0, 0.12, 0), galv, bevel=0.008)
        for sx in (-1, 1):
            for sz in (-1, 1):
                cyl(nm(p + "_cw"), 0.05, 0.035, (sx * 0.29, 0.0, sz * 0.32), rub, seg=14)
                box(nm(p + "_cf"), 0.05, 0.07, 0.05, (sx * 0.29, 0.05, sz * 0.32), galv, bevel=0.004)
                box(nm(p + "_post"), 0.022, h - 0.17, 0.022, (sx * (w / 2 - 0.011), 0.17, sz * (d / 2 - 0.011)), galv, bevel=0.003)
        for i in range(1, 8): box(nm(p + "_vb"), 0.009, h - 0.17, 0.009, (-w / 2 + i * w / 8, 0.17, -d / 2 + 0.01), galv, bevel=0.0)
        for sx in (-1, 1):
            for i in range(1, 9): box(nm(p + "_vs"), 0.009, h - 0.17, 0.009, (sx * (w / 2 - 0.01), 0.17, -d / 2 + i * d / 9), galv, bevel=0.0)
        for k in range(7):
            y = 0.3 + k * (h - 0.32) / 6
            box(nm(p + "_hb"), w, 0.012, 0.012, (0, y, -d / 2 + 0.01), galv, bevel=0.0)
            for sx in (-1, 1): box(nm(p + "_hs"), 0.012, 0.012, d, (sx * (w / 2 - 0.01), y, 0), galv, bevel=0.0)
        for yy in (0.75, 1.3): box(nm(p + "_strap"), w, 0.045, 0.006, (0, yy, d / 2 - 0.01), flat("#c8662a", 0.6), bevel=0.0)
        parcel_stack(-w / 2 + 0.02, w / 2 - 0.02, 0.17, 0.0, d - 0.04, 0.8, r, fill, 0.03)
        if r.random() < 0.7: parcel_stack(-w / 2 + 0.02, w / 2 - 0.02, 0.62, 0.0, d - 0.06, 0.55, r, fill * 0.7, 0.03)
    return g


def work_table(p, w, d, h, top, frame, shelf=True):
    with Grp() as g:
        box(p + "_top", w, 0.04, d, (0, h - 0.04, 0), top, bevel=0.008)
        for sx in (-1, 1):
            for sz in (-1, 1): box(nm(p + "_leg"), 0.05, h - 0.04, 0.05, (sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)), frame, bevel=0.006)
        for sz in (-1, 1): box(nm(p + "_rail"), w - 0.1, 0.06, 0.03, (0, h - 0.11, sz * (d / 2 - 0.05)), frame, bevel=0.005)
        if shelf: box(p + "_shelf", w - 0.08, 0.025, d - 0.08, (0, 0.16, 0), top, bevel=0.005)
    return g


def sign_board(p, text, w, h, bg="#3a2a1e", fg="#ecd6a6", size=None):
    """a painted board with raised lettering (local: centre at the origin, back on z = 0, facing +z)"""
    with Grp() as g:
        box(p + "_b", w, h, 0.03, (0, -h / 2, 0), flat(bg, 0.6), bevel=0.008)
        t = text_mesh(p + "_t", text, size or h * 0.55, (0, 0, 0.036), flat(fg, 0.5), depth=0.004)
        t.rotation_euler = (math.pi / 2, 0, 0)
    return g


def extinguisher(p):
    red = get_mat("ext_red", lambda: col_mat("ext_red", srgb("#b8321f"), 0.3, 0.1))
    dk = flat("#24201c", 0.5)
    with Grp() as g:
        box(p + "_brk", 0.12, 0.08, 0.03, (0, 0.62, 0.0), dk, bevel=0.006)
        cyl(p + "_body", 0.075, 0.48, (0, 0.2, 0.09), red, seg=24)
        cyl(p + "_dome", 0.075, 0.05, (0, 0.68, 0.09), red, seg=24, r2=0.03)
        cyl(p + "_valve", 0.022, 0.07, (0, 0.73, 0.09), dk, seg=12)
        box(p + "_handle", 0.03, 0.02, 0.12, (0, 0.79, 0.12), dk, bevel=0.005)
        cyl(p + "_hose", 0.012, 0.36, (0.07, 0.36, 0.12), dk, seg=8)
        box(p + "_lbl", 0.08, 0.12, 0.004, (0, 0.38, 0.165), flat("#efe6d0", 0.6), bevel=0.0)
    return g


# ---- street pieces (home)
def porch_lantern(name, at, power=22, col="#ffc488"):
    """a black wall lantern with glowing panes and a warm light inside (local: wall at z = 0, facing +z; at = the wall
    point at the lantern's middle)"""
    blk = get_mat("lantern_black", lambda: col_mat("lantern_black", srgb("#26231f"), 0.4, 0.55))
    with Grp() as g:
        box(f"{name}_plate", 0.11, 0.26, 0.025, (0, -0.13, 0.0), blk, bevel=0.008)
        box(f"{name}_arm", 0.03, 0.03, 0.12, (0, 0.05, 0.06), blk, bevel=0.006)
        ghost(box(f"{name}_glass", 0.14, 0.22, 0.14, (0, -0.13, 0.19), glow_mat("lantern_glass", "#ffd9a0", 7.0), bevel=0.0))
        for sx in (-1, 1):
            for sz in (-1, 1): box(nm(name + "_post"), 0.018, 0.27, 0.018, (sx * 0.075, -0.15, 0.19 + sz * 0.075), blk, bevel=0.003)
        box(f"{name}_bot", 0.18, 0.03, 0.18, (0, -0.17, 0.19), blk, bevel=0.006)
        box(f"{name}_top", 0.2, 0.03, 0.2, (0, 0.09, 0.19), blk, bevel=0.006)
        cyl(f"{name}_cap", 0.13, 0.08, (0, 0.12, 0.19), blk, seg=4, r2=0.015).rotation_euler = (0, 0, math.pi / 4)
        lamp_light(f"{name}_L", (0, -0.02, 0.19), power, col, 0.04)
    return g.place(at)


def bicycle(name, frame_col="#9a3f2a"):
    """a town bike with a front basket (local: along x, wheels on the ground at y = 0)"""
    fr = get_mat("bike_frame", lambda: col_mat("bike_frame", srgb(frame_col), 0.35, 0.3))
    tyre = get_mat("bike_tyre", lambda: col_mat("bike_tyre", srgb("#24211e"), 0.8))
    chrome = get_mat("chrome_m", lambda: col_mat("chrome_m", srgb("#bdb6aa"), 0.22, 0.85))
    R = 0.34

    def rod(n, p, q, r, m):
        dx, dy = q[0] - p[0], q[1] - p[1]
        ob = slab(n, ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0.0), (math.hypot(dx, dy), r, r), m, bevel=0.0)
        ob.rotation_euler = (0, -math.atan2(dy, dx), 0)
        return ob
    with Grp() as g:
        for k, cx in enumerate((-0.52, 0.52)):
            frames = [(E(cx + R * math.cos(t), R + R * math.sin(t), 0), edir(math.cos(t), math.sin(t), 0), edir(0, 0, 1))
                      for t in [2 * math.pi * i / 40 for i in range(40)]]
            sweep(f"{name}_tyre{k}", [(0.019 * math.cos(a), 0.019 * math.sin(a)) for a in [2 * math.pi * j / 8 for j in range(8)]], frames, tyre, closed=True)
            disc(f"{name}_hub{k}", (cx, R, 0), 0.03, 0.08, chrome, axis="z", seg=12)
            for j in range(6):
                sp = slab(f"{name}_sp{k}{j}", (cx, R, 0), (2 * R - 0.04, 0.004, 0.004), chrome, bevel=0.0); sp.rotation_euler = (0, -j * math.pi / 6, 0)
        P = {"rh": (-0.52, R), "fh": (0.52, R), "bb": (-0.05, 0.3), "seat": (-0.2, 0.85), "ht": (0.36, 0.9), "hb": (0.4, 0.74)}
        for a, b in (("rh", "bb"), ("rh", "seat"), ("bb", "seat"), ("seat", "ht"), ("bb", "hb"), ("hb", "fh"), ("ht", "hb")):
            rod(nm(name + "_t"), P[a], P[b], 0.028, fr)
        rod(nm(name + "_post"), (-0.2, 0.85), (-0.24, 0.97), 0.02, chrome)
        soft(box(f"{name}_saddle", 0.24, 0.05, 0.12, (-0.25, 0.96, 0), flat("#4a3222", 0.6), bevel=0.02), 0.02)
        rod(nm(name + "_stem"), (0.36, 0.9), (0.33, 1.02), 0.022, chrome)
        slab(f"{name}_bar", (0.33, 1.02, 0), (0.025, 0.025, 0.52), chrome, bevel=0.0)
        for sz in (-1, 1): slab(nm(name + "_grip"), (0.31, 1.02, sz * 0.24), (0.035, 0.035, 0.1), flat("#4a3222", 0.6), bevel=0.008)
        disc(f"{name}_ring", (-0.05, 0.3, 0.05), 0.09, 0.008, chrome, axis="z", seg=24)
        slab(f"{name}_crank", (-0.05, 0.22, 0.07), (0.03, 0.17, 0.015), chrome, bevel=0.0)
        slab(f"{name}_pedal", (-0.05, 0.14, 0.12), (0.1, 0.02, 0.07), flat("#24211e", 0.6), bevel=0.004)
        box(f"{name}_basket", 0.3, 0.2, 0.34, (0.52, 0.86, 0), wood_mat("basket_m", "#b88a4a", "#7a5a30", 0.3, seed=19), bevel=0.015)
    return g


def wheelie_bin(name, body="#4a5446", lid=None):
    bm_ = flat(body, 0.5); lm_ = flat(lid or body, 0.45)
    with Grp() as g:
        box(f"{name}_body", 0.56, 0.92, 0.68, (0, 0.06, 0.0), bm_, bevel=0.03)
        box(f"{name}_rib", 0.58, 0.04, 0.7, (0, 0.62, 0.0), bm_, bevel=0.015)
        box(f"{name}_lid", 0.62, 0.05, 0.76, (0, 0.98, 0.03), lm_, bevel=0.02)
        box(f"{name}_handle", 0.5, 0.04, 0.05, (0, 0.95, -0.38), lm_, bevel=0.01)
        for sx in (-1, 1): disc(nm(name + "_wh"), (sx * 0.25, 0.1, -0.33), 0.1, 0.06, flat("#24211e", 0.7), axis="x", seg=18)
        disc(f"{name}_axle", (0, 0.1, -0.33), 0.015, 0.5, flat("#24211e", 0.7), axis="x", seg=8)
    return g


# ------------------------------------------------------------------------------------------------ OFFICE: the online shop
def build_office():
    W, D, H = 6.4, 5.2, 3.3
    LIGHT_K[0] = 1.7
    wall = tex_mat("off_wall", "clay_plaster", 1.6, paint="#d8c6a6", pk=0.85, disp=True)
    floor = tex_mat("off_floor", "wood_floor", 2.2, paint="#ad8462", pk=1.35, disp=True)
    wain = tex_mat("off_wain", "brown_planks_05", 1.4, paint="#8a6446", pk=0.8, disp=True)
    room_shell("off", W, D, H, wall, floor, ceil_col="#d9c9aa", window=(0.8, 2.4, 1.0, 2.5), wainscot=wain, trim_col="#e6d4b2")
    zb = -D / 2
    view = backdrop("off_view", 7.0, 4.5, (1.6, -0.4, zb - 3.2), "warmcity")
    view.visible_shadow = False
    bpy.data.materials["off_view"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.45
    blinds("off_blind", 0.8, 2.4, 2.48, 2.0, zb + 0.2)
    oak = wood_mat("off_oak", "#986c46", "#5e4029", 1.1, seed=1)
    dark = wood_mat("off_darkwood", "#5e4130", "#3a281c", 1.0, seed=2)
    beam = wood_mat("off_beam", "#6e5442", "#463224", 1.4, seed=3, amp=1.3)
    leather = leather_mat("off_leather", "#6a3a22", 1)
    # ceiling beams (they also frame the top of the wide shot)
    for z in (-1.7, 0.3, 2.3): box(f"off_beam{z:.0f}", W, 0.22, 0.2, (0, H - 0.22, z), beam, bevel=0.015)

    # ---- back wall: bookcase (left), a picture between two sconces under the clock, the window, a tall plant
    bookcase("bcA", 1.6, 2.25, 0.36, 5, seed=11, wood=oak).place((-1.55, 0, zb + 0.18))
    framed("off_art", 0.62, 0.46, img_mat("off_art_img", 320, 240, art_fn(3), 0.8, fit=1), get_mat("frame_gold", lambda: col_mat("frame_gold", srgb("#b8862e"), 0.35, 0.55))).place((0.05, 1.78, zb))
    model("wall_clock", "off_clock", (0.05, 2.36, zb + 0.004), height=0.34, drop=("glass",))
    for k, x in enumerate((-0.45, 0.55)): wall_sconce(f"off_sc{k}", (x, 1.92, zb), 0.0, 14)
    model("potted_plant_01", "off_plantR", (2.85, 0, -2.2), height=1.45)
    model("hanging_picture_frame_03", "off_oval", (2.82, 1.7, zb + 0.004), height=0.46)
    # ---- the boss's desk
    exec_desk("off_desk", oak, dark, leather_mat("off_pad", "#4a2e1c", 2, 0.5, 0.6)).place((0.7, 0, -1.55))
    exec_chair("off_chair", leather).place((0.25, 0, -2.25), 0.25)
    monitor_set("off_mon").place((0.2, 0.76, -1.7), -0.55)
    banker_lamp("off_lamp", (1.36, 0.76, -1.78), -0.25, 9)
    phone("off_phone", (-0.08, 0.76, -1.3))
    papers("off_papers", (0.6, 0.765, -1.42), n=7, seed=2)
    papers("off_papers2", (1.05, 0.765, -1.32), n=3, seed=5)
    tray = flat("#3a2a1e", 0.5)
    box("off_tray", 0.3, 0.012, 0.36, (1.3, 0.76, -1.4), tray, bevel=0.004)
    for sx in (-1, 1): box(f"off_trayw{sx}", 0.012, 0.05, 0.36, (1.3 + sx * 0.145, 0.76, -1.4), tray, bevel=0.003)
    papers("off_papers3", (1.3, 0.775, -1.4), n=4, seed=7)
    cyl("off_mug", 0.04, 0.095, (0.48, 0.76, -1.62), flat("#e9dcc4", 0.3), seg=20)
    cyl("off_pens", 0.035, 0.1, (0.98, 0.76, -1.82), flat("#5a3a24", 0.5), seg=16)
    for k in range(3): cyl(f"off_pen{k}", 0.005, 0.15, (0.98 + 0.012 * (k - 1), 0.8, -1.82 + 0.01 * k), flat(["#c8962e", "#2a2420", "#a8402a"][k], 0.4), seg=6)
    model("binder_notebook", "off_notebook", (0.85, 0.76, -1.62), height=0.025, rot=0.12)
    box("off_nameblk", 0.3, 0.06, 0.06, (0.7, 0.76, -1.2), dark, bevel=0.008)
    box("off_nameplt", 0.24, 0.04, 0.004, (0.7, 0.77, -1.168), brass_mat(), bevel=0.0)
    # ---- the rug the marks stand on
    box("FLOOR_off_rug", 2.7, 0.012, 2.1, (0.35, 0, -0.4), img_mat("off_rug", 768, 576, rug_fn, 0.95, fit=2), bevel=0.006)
    cyl("off_bin", 0.13, 0.32, (-0.45, 0, -1.75), get_mat("bin_m", lambda: col_mat("bin_m", srgb("#5a3c26"), 0.45, 0.2)), seg=20, r2=0.15)
    # ---- left wall: a second bookcase at the "shelf" mark, the sofa corner, coat rack, floor lamp, pictures
    bookcase("bcB", 1.3, 2.1, 0.34, 5, seed=23, wood=oak).place((-3.02, 0, -1.2), math.pi / 2)
    coat_rack("off_coat", dark).place((-2.8, 0, -2.25))
    sofa("off_sofa", leather, dark).place((-2.72, 0, 1.3), math.pi / 2)
    coffee_table("off_ctab", oak, _random.Random(4)).place((-1.72, 0, 1.3), math.pi / 2)
    floor_lamp("off_floorlamp", (-2.85, 0, 2.55), 40)
    framed("off_artL1", 0.7, 0.5, img_mat("off_artL1_img", 320, 240, art_fn(7), 0.8, fit=1), dark).place((-3.2, 1.95, 0.85), math.pi / 2)
    framed("off_artL2", 0.42, 0.56, img_mat("off_artL2_img", 240, 320, art_fn(12), 0.8, fit=1), get_mat("frame_gold", lambda: None)).place((-3.2, 2.0, 1.8), math.pi / 2)
    # ---- right wall: the packing counter (it is a shop), filing, cooler, a shelf of stock
    with Grp() as gc:
        box("off_cnt", 1.8, 0.88, 0.6, (0, 0, 0), oak, bevel=0.01)
        box("off_cnttop", 1.86, 0.04, 0.66, (0, 0.88, 0.0), wood_mat("off_butcher", "#c8955c", "#8a5a34", 0.9, seed=5, boards=6), bevel=0.008)
        for k in range(3):
            box(f"off_cntdr{k}", 0.56, 0.7, 0.02, (-0.6 + k * 0.6, 0.08, 0.31), oak, bevel=0.008)
            box(f"off_cnthd{k}", 0.14, 0.02, 0.025, (-0.6 + k * 0.6, 0.66, 0.33), brass_mat(), bevel=0.005)
        r = _random.Random(31)
        hp = parcel((-0.55, 0.92, 0.0), (0.42, 0.28, 0.34), 0.2, r)
        parcel((-0.5, 0.92 + hp, 0.02), (0.3, 0.2, 0.26), -0.1, r)
        parcel((0.05, 0.92, 0.05), (0.36, 0.14, 0.3), 0.05, r, label=1.0)
        cyl("off_bubble", 0.12, 0.42, (0.62, 0.92, -0.12), get_mat("bubble_m", lambda: col_mat("bubble_m", srgb("#e8e4dc"), 0.25)), seg=24)
        box("off_tapegun", 0.16, 0.12, 0.06, (0.36, 0.92, 0.12), flat("#c0602a", 0.5), bevel=0.012)
        cyl("off_taperoll", 0.05, 0.05, (0.36, 0.98, 0.12), get_mat("ptape", lambda: None), seg=20)
        model("classic_laptop", "off_laptop", (0.3, 0.92, -0.08), height=0.27, rot=-0.3)
        wall_shelf("off_wshelf", 1.6, oak).place((0, 1.72, -0.3))
        for k in range(5):
            parcel((-0.62 + k * 0.3, 1.72, -0.15), (0.24, 0.22 + 0.04 * (k % 2), 0.2), 0.04 * (k - 2), r, label=0.3)
        pinboard("off_pin", (0.0, 2.08, -0.3), w=0.9, h=0.5, seed=3)
    gc.place((2.9, 0, -1.1), -math.pi / 2)
    wall_sconce("off_scR", (3.2, 2.05, 0.35), -math.pi / 2, 16)
    filing_pair("off_files").place((2.88, 0, 0.35), -math.pi / 2)
    water_cooler("off_cooler", (2.95, 0, 1.4))
    with Grp() as gs:
        model("Shelf_01", "off_stock", (0, 0, 0), height=2.0)
        r = _random.Random(8)
        for i in range(6):
            for j in range(2):
                if r.random() < 0.8: parcel((-0.22 + j * 0.44, (0.347 + i * 0.277) * 2.0 / 2.08 + 0.012, 0.0), (0.36, 0.2, 0.22), r.uniform(-0.1, 0.1), r, label=0.4)
    gs.place((2.98, 0, 2.3), -math.pi / 2)
    calendar = img_mat("off_cal", 240, 320, calendar_fn, 0.8, fit=1)
    box("off_calendar", 0.36, 0.5, 0.006, (-0.45, 1.12, zb + 0.004), calendar, bevel=0.0)  # (beside the bookcase, above the wainscot)
    # ---- practicals: two pendants over the desk and the marks, one near the wide camera (foreground), the desk lamp
    pendant_lamp("off_pendD", (0.85, 2.38, -1.7), H - 0.22, 95)
    pendant_lamp("off_pendC", (0.3, 2.42, 0.3), H - 0.22, 230, spot=62)
    pendant_lamp("off_pendF", (0.8, 2.38, 2.3), H - 0.22, 12)
    drop_model_sources()
    mark("desk", (-0.35, 0, -1.0)); mark("deskTop", (0.75, 0.76, -1.6)); mark("window", (0.9, 0, -2.1)); mark("center", (0.0, 0, 0.3))
    mark("guest", (1.3, 0, 0.4)); mark("shelf", (-2.3, 0, -1.0))
    mark("monitor", (0.2, 0.95, -1.77)); mark("phone", (-0.08, 0.8, -1.3)); mark("sofa", (-1.9, 0, 2.3)); mark("counter", (2.1, 0, -1.3))
    NOTES["wide"] = {"pos": [0.35, 1.7, 5.3], "look": [0.25, 1.32, -1.6], "fov": 48}
    NOTES["camBox"] = {"min": [-W / 2 + 0.4, 0.3, -D / 2 + 0.6], "max": [W / 2 - 0.4, H - 0.3, 6.5]}
    NOTES["interior"] = True; NOTES["radius"] = 12
    NOTES["light"] = "interior"
    NOTES["lightcfg"] = {"world": 0.08, "worldCol": "#b8a68e", "sun": 2.2, "sunCol": "#ffd9a8", "sunDir": (0.3, 0.55, -0.78),
                         "fill": [((0.3, 3.05, 4.2), 3.0, 34.0, "#ffe2c0")]}


# ------------------------------------------------------------------------------------------------ DEPOT: racks of parcels, the dispatch wall
def build_depot():
    W, D, H = 10.0, 9.0, 5.6
    LIGHT_K[0] = 1.3
    wall = tex_mat("dep_wall", "corrugated_iron", 1.4, paint="#c8b08a", pk=0.75, disp=True)
    dado = tex_mat("dep_dado", "brushed_concrete", 1.6, paint="#a8783c", pk=0.7, disp=True)
    floor = tex_mat("dep_floor", "brushed_concrete", 2.4, paint="#b3a28a", pk=1.7, disp=True)
    room_shell("dep", W, D, H, wall, floor, ceil_col="#6e604e", door=(-2.0, 1.6, 0.0, 3.8), trim_col="#8a7a62")
    zb = -D / 2
    # painted block band along the walls (the lower 1.2 m)
    box("dep_dadoL", 3.0, 1.2, 0.04, (-3.5, 0, zb + 0.02), dado, bevel=0.0)
    box("dep_dadoR", 3.4, 1.2, 0.04, (3.3, 0, zb + 0.02), dado, bevel=0.0)
    for sx in (-1, 1): box(f"dep_dado{sx}", 0.04, 1.2, D + 6, (sx * (W / 2 - 0.02), 0, zb + (D + 6) / 2), dado, bevel=0.0)
    for sx in (-1, 1): box(f"dep_dadocap{sx}", 0.06, 0.05, D + 6, (sx * (W / 2 - 0.03), 1.2, zb + (D + 6) / 2), flat("#7a5a34", 0.6))
    box("dep_dadocapB", W, 0.05, 0.06, (0, 1.2, zb + 0.03), flat("#7a5a34", 0.6))
    # the yard behind the roll-up door
    yardz = zb - 0.3
    plane("dep_yard", 40, 24, (0, 0.0, yardz - 12), tex_mat("dep_yard_m", "asphalt_02", 4.0, tint=srgb("#b0aaa2")))
    sky_plane("dep_sky", 60, 22, (0, -2, yardz - 24)).visible_shadow = False
    bpy.data.materials["dep_sky"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.1
    for k, x in enumerate((-7, -2, 3, 8)): tree(f"dep_tree{k}", (x, 0, yardz - 16 - (k % 2) * 2), h=6.0, seed=20 + k)
    fence_m = col_mat("dep_fence", srgb("#5a5650"), 0.5, 0.3)
    for k in range(-10, 11): box(f"dep_fpost{k}", 0.06, 2.0, 0.06, (k * 2.0, 0, yardz - 11), fence_m, bevel=0.0)
    for yy in (0.2, 1.0, 1.95): box(f"dep_frail{yy}", 42, 0.04, 0.04, (0, yy, yardz - 11), fence_m, bevel=0.0)
    van_glb = os.path.join(OUT, "..", "van", "van.glb")
    if not os.path.exists(van_glb): van_glb = os.path.join(HERE, "..", "..", "public", "sets", "van", "van.glb")
    if os.path.exists(van_glb):
        for k, (x, z, ry) in enumerate([(-0.6, yardz - 5.2, 0.12)]):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=van_glb)
            M = Matrix.Translation(E(x, 0, z)) @ Matrix.Rotation(ry, 4, "Z")
            for o in [o for o in bpy.data.objects if o not in before]:
                if o.parent is None: o.matrix_basis = M @ o.matrix_basis
                # RT_: the parked van keeps its own PBR materials and is lit live by the engine (its many-island
                # glTF mesh does not lightmap cleanly); it still shadows the yard in the bake
                o.name = f"RT_dep_van{k}_" + o.name
    # roof structure: trusses along z, purlins along x
    steel = get_mat("dep_steel", lambda: col_mat("dep_steel", srgb("#4a4038"), 0.5, 0.3))
    for x in (-3.0, 0.0, 3.0): box(f"dep_truss{x:.0f}", 0.18, 0.32, D + 6, (x, H - 0.55, zb + (D + 6) / 2), steel, bevel=0.01)
    for z in (-3.0, 0.0, 3.0, 6.0): box(f"dep_purlin{z:.0f}", W, 0.16, 0.12, (0, H - 0.4, z), steel, bevel=0.008)
    # roll-up door, half down
    box("dep_doorframe", 3.9, 0.26, 0.3, (-0.2, 3.8, zb + 0.05), col_mat("dep_yellow", srgb("#d9a22e"), 0.5), bevel=0.02)
    for sx in (-1, 1): box(f"dep_doorpost{sx}", 0.18, 3.8, 0.3, (-0.2 + sx * 1.9, 0, zb + 0.05), col_mat("dep_yellow2", srgb("#d9a22e"), 0.5), bevel=0.02)
    box("dep_shutter", 3.6, 1.35, 0.08, (-0.2, 2.45, zb + 0.12), tex_mat("dep_shut", "corrugated_iron", 0.8, paint="#a89a84", pk=0.6, disp=True), bevel=0.01)
    box("dep_shutbar", 3.62, 0.08, 0.1, (-0.2, 2.4, zb + 0.12), steel, bevel=0.01)
    box("dep_drum", 3.8, 0.4, 0.4, (-0.2, 4.06, zb + 0.22), steel, bevel=0.03)
    yellow = col_mat("dep_line", srgb("#e0b23a"), 0.6)
    for x in (-1.45, 1.15): box(f"FLOOR_dep_line{x:.0f}", 0.1, 0.006, 7.0, (x, 0, zb + 3.5), yellow, bevel=0.0)
    for k in range(6): box(f"FLOOR_dep_hatch{k}", 0.12, 0.006, 0.9, (-1.25 + k * 0.5, 0, zb + 0.75), yellow, bevel=0.0, rot_y=0.6)
    sign_board("dep_bay", "LOADING BAY", 1.7, 0.34).place((-0.2, 4.62, zb + 0.06))

    # ---- left: racking full of parcels, the sorting table, roll cages, pallets
    rack_row("rkL1", 2, 1.35, 4.3, 0.9, [0.0, 1.25, 2.45, 3.65], seed=1).place((-3.55, 0, zb + 0.5))
    rack_row("rkL2", 4, 1.35, 3.5, 0.9, [0.0, 1.2, 2.35], seed=2).place((-4.5, 0, -0.35), math.pi / 2)
    rack_row("rkR1", 2, 1.5, 4.3, 0.9, [0.0, 1.25, 2.45, 3.65], seed=3).place((3.35, 0, zb + 0.5))
    sign_board("dep_aisleA", "AISLE A", 0.7, 0.2).place((-3.55, 4.55, zb + 0.96))
    sign_board("dep_aisleB", "AISLE B", 0.7, 0.2).place((-4.03, 3.75, 2.35), math.pi / 2)
    ply = wood_mat("dep_ply", "#c9a06a", "#9a7448", 1.0, seed=9, amp=0.9)
    with Grp() as gt:
        work_table("dep_sort", 2.0, 0.9, 0.9, ply, steel)
        r = _random.Random(5)
        for k in range(6): parcel((-0.75 + k * 0.3 + r.uniform(-0.05, 0.05), 0.9, r.uniform(-0.25, 0.25)), (r.uniform(0.2, 0.36), r.uniform(0.12, 0.3), r.uniform(0.2, 0.32)), r.uniform(-0.5, 0.5), r)
        parcel_stack(-0.9, 0.9, 0.185, 0.0, 0.8, 0.62, r, 0.8, 0.05)
        box("dep_tapegun", 0.16, 0.12, 0.06, (0.75, 0.9, 0.32), flat("#c0602a", 0.5), bevel=0.012)
        box("dep_clip", 0.23, 0.01, 0.32, (-0.85, 0.9, 0.25), ply, bevel=0.003); box("dep_clipp", 0.21, 0.004, 0.28, (-0.85, 0.91, 0.25), flat("#f2ece0", 0.7), bevel=0.0)
        box("dep_printer", 0.22, 0.14, 0.2, (0.45, 0.9, -0.3), flat("#d8d0c0", 0.5), bevel=0.015)
    gt.place((-2.45, 0, -1.4), math.pi / 2)
    model("hand_truck", "dep_truck", (-1.8, 0, -2.75), height=1.3, rot=0.6)
    roll_cage("dep_cage0", 3, 0.75).place((-1.75, 0, 0.75), 0.35)
    roll_cage("dep_cage1", 4, 0.5).place((-2.75, 0, 1.75), -0.2)
    roll_cage("dep_cage2", 5, 0.8).place((-1.55, 0, -3.35), 0.15)
    with Grp() as gp:
        pallet("dep_palA")
        r = _random.Random(12)
        for j in range(3):
            parcel_stack(-0.58, 0.58, 0.144 + j * 0.34, -0.22, 0.48, 0.36, r, 0.95, 0.02)
            parcel_stack(-0.58, 0.58, 0.144 + j * 0.34, 0.25, 0.48, 0.36, r, 0.95, 0.02)
    gp.place((-3.25, 0, -2.95), 0.1)
    for k in range(3): model("plastic_crate_02", f"dep_crate{k}", (-1.95, k * 0.25, -0.15), height=0.25, rot=0.1 * k)
    model("wooden_crate_01", "dep_wcrate", (-3.35, 0, 0.35), height=0.35, rot=1.4)
    model("trashbag", "dep_trash", (-3.0, 0, 2.7), height=0.55)
    model("metal_tool_chest", "dep_tools", (-3.95, 0, 2.95), height=0.62, rot=math.pi / 2)

    # ---- right: the dispatch partition (the record board's wall), the scanner bench, the back office
    x0p, x1p, zp, hp = 0.75, W / 2, -1.3, 2.9
    pw = wood_mat("dep_part", "#b98a56", "#8a6038", 1.2, seed=13, boards=0)
    trim = wood_mat("dep_parttrim", "#6e4a2c", "#4a2e1a", 0.8, seed=14)
    box("dep_partA", 2.65 - x0p, hp, 0.12, ((x0p + 2.65) / 2, 0, zp), pw, bevel=0.01)
    box("dep_partWlo", 1.3, 1.15, 0.12, (3.3, 0, zp), pw, bevel=0.01)
    box("dep_partWhi", 1.3, hp - 2.15, 0.12, (3.3, 2.15, zp), pw, bevel=0.01)
    box("dep_partB", x1p - 3.95, hp, 0.12, ((3.95 + x1p) / 2, 0, zp), pw, bevel=0.01)
    box("dep_partcap", x1p - x0p + 0.1, 0.06, 0.18, ((x0p + x1p) / 2, hp, zp), trim, bevel=0.01)
    box("dep_partpost", 0.14, hp + 0.06, 0.18, (x0p, 0, zp), trim, bevel=0.012)
    box("dep_partskirt", x1p - x0p, 0.14, 0.15, ((x0p + x1p) / 2, 0, zp), trim, bevel=0.008)
    # the record-board area: a pale painted panel, kept clear (the engine stands its board on the "board" mark)
    box("dep_boardpanel", 1.6, 1.55, 0.012, (1.6, 0.75, zp + 0.066), flat("#cbb894", 0.75), bevel=0.004)
    box("dep_boardrail", 1.6, 0.03, 0.05, (1.6, 0.73, zp + 0.085), trim, bevel=0.006)
    model("wall_clock", "dep_clock", (1.6, 2.42, zp + 0.065), height=0.34, drop=("glass",))
    cage_lamp("dep_cageP", (2.45, 2.45, zp + 0.06), 0.0, 10)
    extinguisher("dep_ext").place((4.75, 0.0, zp + 0.06))
    # dispatch window: frame, mullion and the lit back office behind it
    for xx in (2.65, 3.95): box(f"dep_wf{xx:.0f}", 0.06, 1.0, 0.16, (xx, 1.15, zp), trim, bevel=0.006)
    box("dep_wft", 1.36, 0.06, 0.16, (3.3, 2.12, zp), trim, bevel=0.006)
    box("dep_wsill", 1.42, 0.05, 0.24, (3.3, 1.12, zp + 0.04), trim, bevel=0.006)
    box("dep_wmul", 0.04, 1.0, 0.06, (3.3, 1.15, zp), trim, bevel=0.004)
    box("dep_glow", 1.6, 1.4, 0.02, (3.3, 0.95, zp - 0.7), img_mat("dep_glow", 320, 280, office_glow_fn, 0.6, fit=1, emit=1.6), bevel=0.0)
    sign_board("dep_dispatch", "DISPATCH", 1.1, 0.24).place((3.3, 2.5, zp + 0.06))
    # the scanner bench (the engine's charging rack sits on it: top surface y 0.96)
    with Grp() as gb:
        work_table("dep_bench", 2.1, 0.62, 0.96, wood_mat("dep_benchtop", "#b07a46", "#7a5030", 0.8, seed=15, boards=5), steel)
        box("dep_bench_strip", 1.9, 0.05, 0.06, (0, 0.96, -0.27), flat("#2a2622", 0.5), bevel=0.008)
        r = _random.Random(17)
        parcel_stack(-0.95, 0.95, 0.185, 0.0, 0.52, 0.66, r, 0.7, 0.04)
    gb.place((3.4, 0, zp + 0.06 + 0.31))
    box("dep_cabledrop", 0.03, 1.5, 0.03, (4.35, 0.96, zp + 0.08), flat("#2a2622", 0.5), bevel=0.0)
    model("power_box_01", "dep_power", (4.6, 1.35, zp + 0.065), height=0.5)
    model("WetFloorSign_01", "dep_wet", (1.05, 0, -2.95), height=0.62, rot=-0.4)
    model("wooden_broom", "dep_broom", (-2.12, 0.0, -3.32), height=1.4, rot=0.0).rotation_euler = (-0.12, 0, 0)
    model("industrial_storage_cart", "dep_cart", (4.35, 0, 0.9), height=1.0, rot=-math.pi / 2)
    with Grp() as gs:
        for k in range(5):
            with Grp() as gq: pallet(f"dep_pst{k}")
            gq.place((0, k * 0.145, 0), 0.03 * (k % 2))
    gs.place((4.1, 0, 2.6), 0.1)
    # ---- foreground (near the wide camera): a low pallet with parcels, a hanging sign
    with Grp() as gf:
        pallet("dep_palF")
        r = _random.Random(21)
        parcel_stack(-0.55, 0.55, 0.144, 0.0, 0.9, 0.5, r, 0.9, 0.1)
    gf.place((-0.45, 0, 3.2), 0.12)
    sign_board("dep_hang", "OUTBOUND", 0.86, 0.21).place((0.5, 3.58, 3.4))
    chain = get_mat("cord_m", lambda: col_mat("cord_m", srgb("#1e1a17"), 0.6))
    for sx in (-1, 1): cyl(f"dep_chain{sx}", 0.008, H - 3.68, (0.5 + sx * 0.36, 3.68, 3.4), chain, seg=6)
    # ---- practicals: enamel domes over the marks, the board, the bench, the sorting table, the door; wall cages
    for nm_, at, pw_, cone in (("dep_domeC", (0.25, 3.2, 0.85), 640, 60), ("dep_domeB", (1.7, 3.35, -0.55), 190, 80), ("dep_domeS", (3.4, 3.35, -0.6), 190, 90),
                               ("dep_domeT", (-2.4, 3.3, -1.4), 210, 90), ("dep_domeD", (1.2, 3.7, -3.1), 130, 90)):
        pendant_lamp(nm_, at, H, pw_, shade="#3b342e", r=0.33, h=0.3, spot=cone, col="#ffcc98", glow_k=1.8)
    for k, (at, rot) in enumerate((((-3.55, 4.75, zb), 0.0), ((-W / 2, 4.2, 0.2), math.pi / 2), ((W / 2, 4.2, 0.6), -math.pi / 2))):
        cage_lamp(f"dep_cageHi{k}", at, rot, 30)
    cage_lamp("dep_cageL", (-W / 2, 2.6, 3.2), math.pi / 2, 20)
    cage_lamp("dep_cageBk", (3.35, 4.75, zb), 0.0, 25)
    drop_model_sources()
    mark("rack", (-0.4, 0, 0.3)); mark("board", (1.6, 0, -0.4)); mark("dex", (0.6, 0, 1.2)); mark("door", (-0.2, 0, -3.8)); mark("center", (0, 0, 1.0))
    mark("boardWall", (1.6, 0, zp + 0.06)); mark("bench", (3.4, 0, zp + 0.37)); mark("benchTop", (3.4, 0.96, zp + 0.37)); mark("benchFront", (3.4, 0, -0.15))
    mark("sorting", (-1.6, 0, -1.4)); mark("cages", (-1.0, 0, 1.15))
    NOTES["wide"] = {"pos": [0.6, 2.2, 7.5], "look": [0.0, 1.6, -2.0], "fov": 48}
    NOTES["camBox"] = {"min": [-W / 2 + 0.5, 0.3, -D / 2 + 0.8], "max": [W / 2 - 0.5, H - 0.6, 7.5]}
    NOTES["interior"] = True; NOTES["radius"] = 16
    NOTES["light"] = "interior"
    NOTES["lightcfg"] = {"world": 0.1, "worldCol": "#b8a488", "sun": 2.0, "sunCol": "#ffe2bc", "sunDir": (0.3, 0.6, -0.74),
                         "fill": [((0.6, H - 0.9, 5.0), 4.0, 90.0, "#ffe0bc")]}


def light_interior():
    cfg = NOTES.pop("lightcfg", {})
    w = bpy.data.worlds.new("world"); SC.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb(cfg.get("worldCol", "#c9d8ea")), 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = cfg.get("world", 0.35)
    se, sc = cfg.get("sun", 4.0), cfg.get("sunCol", "#ffe6c4")
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = se; sun.angle = math.radians(1.5); sun.color = srgb(sc)
    so = link(bpy.data.objects.new("sun", sun))
    d = Vector(cfg.get("sunDir", (0.35, 0.62, -0.7))).normalized()  # from behind the back wall: light falls in through the window / door
    bd = Vector((d.x, -d.z, d.y)); so.rotation_euler = bd.to_track_quat("Z", "Y").to_euler()
    NOTES["sun"] = {"dir": [round(v, 3) for v in d], "color": sc, "energy": se}
    for k, (at, size, energy, col) in enumerate(cfg.get("fill", [])):
        area_light(f"fill{k}", at, size, energy, col)




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
    paint = col_mat("van_paint", srgb("#ffffff"), 0.32)
    nt = paint.node_tree; ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    pb = nt.nodes["Principled BSDF"]; pb.inputs["Coat Weight"].default_value = 1.0; pb.inputs["Coat Roughness"].default_value = 0.06  # clearcoat: a crisp reflection over a soft base
    trim = col_mat("van_trim", srgb("#2b2e34"), 0.7)
    cab = col_mat("van_cab", srgb("#3a3e46"), 0.85)
    rubber = col_mat("van_rubber", srgb("#1f2126"), 0.8)
    seam = col_mat("van_seam", srgb("#8f8b84"), 0.6)  # a mid-grey groove on white (L* ~58), never near-black
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
    badge = col_mat("van_badge", srgb("#c3c8d0"), 0.35, 0.4)
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
    disc("van_badge_f", (fascia_x(0.86) + 0.05, 0.86, 0), 0.06, 0.016, chrome, axis="x", seg=24)
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
            fr = [(E(x, y0 + (y1 - y0) * k / 40, sz * (van_side_z(x, y0 + (y1 - y0) * k / 40) + 0.0012)), edir(0, 0, sz), edir(1, 0, 0)) for k in range(41)]
            sweep(nm, [(-0.003, -0.004), (0.0015, -0.004), (0.0015, 0.004), (-0.003, 0.004)], fr, seam)
        def hseam(y, x0, x1, nm):
            fr = [(E(x0 + (x1 - x0) * k / 40, y, sz * (van_side_z(x0 + (x1 - x0) * k / 40, y) + 0.0012)), edir(0, 0, sz), edir(0, 1, 0)) for k in range(41)]
            sweep(nm, [(-0.003, -0.004), (0.0015, -0.004), (0.0015, 0.004), (-0.003, 0.004)], fr, seam)
        vseam(0.89, 0.44, 2.38, f"van_seamA{sz}"); vseam(0.80, 0.44, 2.38, f"van_seamB{sz}"); vseam(-0.80, 0.44, 2.38, f"van_seamC{sz}")
        vseam(1.99, 0.44, 1.40, f"van_seamD{sz}"); hseam(2.38, -0.80, 0.80, f"van_seamE{sz}")
        fr = [(E(x, 1.98, sz * (van_side_z(x, 1.98) - 0.002)), edir(0, 0, sz), edir(0, 1, 0)) for x in (-2.48, -0.82)]
        sweep(f"van_rail{sz}", [(-0.01, -0.025), (0.016, -0.025), (0.02, 0.0), (0.016, 0.025), (-0.01, 0.025)], fr, trim)

    # (1.11.2: no livery: a plain white van with a soft top-to-bottom gradient, see van_gradient)

    # ---- rear: doors, windows, lights, handles, plate, step
    xr = -2.662
    slab("van_rearseam", (xr - 0.001, 1.49, 0), (0.004, 1.92, 0.01), seam, bevel=0.0)
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


def van_gradient(top="#fefff9", bottom="#ebe7de", y0=0.42, y1=2.62):
    """the paint's colour comes from a per-vertex gradient over the height (Blender z = engine y): a clean white roof that
    cools to a soft grey at the sills, so the body reads round without a texture or a livery"""
    import numpy as np
    t_, b_ = np.array(srgb(top)), np.array(srgb(bottom))
    for ob in SC.objects:
        if ob.type != "MESH" or not any(m and m.name.startswith("van_paint") for m in ob.data.materials): continue
        me = ob.data
        col = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        mw = ob.matrix_world
        for v in me.vertices:
            z = (mw @ v.co).z; k = min(1.0, max(0.0, (z - y0) / (y1 - y0))) ** 0.75
            c = b_ + (t_ - b_) * k; col.data[v.index].color = (c[0], c[1], c[2], 1.0)


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
    for ob in SC.objects:  # linked copies (model instances) get their own mesh: modifiers, joins and splits need it
        if ob.type == "MESH" and ob.data.users > 1: ob.data = ob.data.copy()
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
            ax2 = 1 if m0.get("fit_uv") == 2 else 2  # 2: across x and depth (a rug seen from above)
            xs = [v.co.x for v in bm.verts]; zs = [v.co[ax2] for v in bm.verts]
            x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
            for f in bm.faces:
                for lp in f.loops: lp[uv].uv = ((lp.vert.co.x - x0) / max(1e-6, x1 - x0), (lp.vert.co[ax2] - z0) / max(1e-6, z1 - z0))
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


def clamp_metals():
    """the diffuse bake divides by the diffuse colour, which a fully metallic surface does not have (it would come out
    black): keep metallic <= 0.75 on everything baked as diffuse (metals flagged spec_bake get a combined bake)"""
    for m in bpy.data.materials:
        if not m.use_nodes or m.get("spec_bake"): continue
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b is None: continue
        sock = b.inputs["Metallic"]
        if sock.is_linked:
            src = sock.links[0].from_socket
            mn = m.node_tree.nodes.new("ShaderNodeMath"); mn.operation = "MINIMUM"; mn.inputs[1].default_value = 0.75
            m.node_tree.links.new(src, mn.inputs[0]); m.node_tree.links.new(mn.outputs[0], sock)
        elif sock.default_value > 0.75: sock.default_value = 0.75


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
    SPEC.clear(); EMISSIVE.clear()
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
        spec = kind != "AO" and any(m.get("spec_bake") for m in mats)
        for m in mats:
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m.use_nodes else None
            if b and b.inputs["Emission Strength"].default_value > 0 and (b.inputs["Emission Color"].is_linked or sum(b.inputs["Emission Color"].default_value[:3]) > 0.01):
                EMISSIVE.add(ob.name)
        for k, m in enumerate(mats):
            if m.users > 1:
                m = m.copy(); me.materials[k] = m
            nd = m.node_tree.nodes.new("ShaderNodeTexImage"); nd.image = im; nd.name = "LMBAKE"
            m.node_tree.nodes.active = nd
        if kind == "AO": bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
        elif spec:  # light x (diffuse + glossy) / base colour: the engine's albedo x lightmap then shows the reflections
            bpy.ops.object.bake(type="COMBINED", pass_filter={"DIRECT", "INDIRECT", "DIFFUSE", "GLOSSY", "TRANSMISSION"}, margin=6, use_clear=True)
            SPEC[ob.name] = list(next(m for m in mats if m.get("spec_bake"))["bc"])
        else: bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=6, use_clear=True)
        baked[ob.name] = im
        for m in me.materials:
            if m and "LMBAKE" in m.node_tree.nodes: m.node_tree.nodes.remove(m.node_tree.nodes["LMBAKE"])
        me.uv_layers.active = me.uv_layers[uv0n]
        print(f"[bake] {n + 1}/{len(obs)} {ob.name} {side}px", flush=True)
    return baked


SPEC, EMISSIVE = {}, set()


def lm_pixels(name, im):
    import numpy as np
    px = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(px)
    rgb = px.reshape(-1, 4)[:, :3]
    if name in SPEC: rgb = rgb / np.maximum(np.array(SPEC[name], dtype=np.float32)[None, :], 0.03)
    return rgb


def smooth_lm(rgb, w, h):
    """bake noise off a lightmap: a 3x3 median (fireflies) then a 3x3 binomial blur (grain), both over the baked texels
    only (the empty atlas around small islands never bleeds in); contact shadows survive"""
    import numpy as np
    a = rgb.reshape(h, w, 3).astype(np.float32)
    cov = a.sum(-1) > 1e-7
    an = np.where(cov[..., None], a, np.nan)
    p = np.pad(an, ((1, 1), (1, 1), (0, 0)), mode="edge")
    stack = np.stack([p[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)], 0)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med = np.nanmedian(stack, axis=0)
    del stack
    med = np.where(cov[..., None], med, 0.0)
    m = cov.astype(np.float32)[..., None]
    pv = np.pad(med * m, ((1, 1), (1, 1), (0, 0)), mode="edge"); pm = np.pad(m, ((1, 1), (1, 1), (0, 0)), mode="edge")
    k = (1, 2, 1)
    num = sum(k[dy] * k[dx] * pv[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3))
    den = sum(k[dy] * k[dx] * pm[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3))
    out = np.where(cov[..., None], num / np.maximum(den, 1e-6), a)
    return out.reshape(-1, 3)


def save_lightmaps(baked):
    import numpy as np
    vals = []
    for name, im in baked.items():
        if name in EMISSIVE: continue  # (a bulb's own irradiance is huge and its lightmap unused)
        vals.append(lm_pixels(name, im).max(axis=1))
    # raw irradiance (the engine applies the same AgX view transform Blender used, per baked material): store x / S
    allv = np.concatenate(vals); allv = allv[allv > 1e-4]
    S = float(max(1.0, np.percentile(allv, 99.9)))
    out = {}
    for name, im in baked.items():
        w, h = im.size
        rgb = np.clip(smooth_lm(lm_pixels(name, im), w, h) / S, 0, 1)
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
    prac = [{"name": o.name, "pos": [round(o.location.x, 3), round(o.location.z, 3), round(-o.location.y, 3)], "kind": o.data.type.lower(),
             "color": "#%02x%02x%02x" % tuple(int(round(255 * (1.055 * min(1.0, c) ** (1 / 2.4) - 0.055 if c > 0.0031308 else 12.92 * c))) for c in o.data.color),
             "power": round(o.data.energy, 1)} for o in SC.objects if o.type == "LIGHT" and o.get("practical")]
    if prac: man["practicals"] = prac
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
    for k, v in enumerate(str(A.get("views", "")).split(";") if A.get("views") else []):  # extra look-dev stills: "px,py,pz,lx,ly,lz,fov;..."
        p = [float(t) for t in v.split(",")]
        co.location = E(*p[:3]); co.rotation_euler = (E(*p[3:6]) - co.location).to_track_quat("-Z", "Y").to_euler(); cam.angle_y = math.radians(p[6])
        SC.render.filepath = os.path.join(OUT, f"view{k}.png"); bpy.ops.render.render(write_still=True)


if A["set"] in ASSET:
    BUILD[A["set"]]()
    if A["set"] == "van": van_gradient()  # before the preview too (the stills rendered black without it)
    if A.get("preview"): PREVIEW[A["set"]]()
    prepare()
    for ob in list(SC.objects):
        if ob.get("cutter"): bpy.data.objects.remove(ob)
    join_by_material()
    if A["set"] == "van": van_gradient()
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
clamp_metals()
join_by_material()
if A.get("preview"): preview()
if A.get("lookdev"): sys.exit(0)  # (--preview --lookdev: the Cycles still only, no bake or export, while iterating on a set)
baked = bake_all()
S, lms = save_lightmaps(baked)
export(S, lms)
