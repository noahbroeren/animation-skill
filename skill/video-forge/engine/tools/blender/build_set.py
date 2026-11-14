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
    W, H1 = 8.85, 6.2  # 1.11.3: 9 m apart, the fronts nearly touch (a terrace): no sky between the houses
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
    # 1.11.3: no gable triangle on the front (it stuck up above the roof); the roof's ends are closed by side gables,
    # and side walls close the house so the narrow gap to the neighbour reads as a dark alley, not sky
    prism_roof(f"{prefix}_roof", W, 7.0, 2.7, (x, H1, zf - s * 3.5), roof)
    for sx in (-1, 1):
        g = gable(f"{prefix}_sgable{sx}", 7.0, 2.7, (x + sx * (W / 2 - 0.15), H1, zf - s * 3.5), wall); g.rotation_euler = (0, 0, math.pi / 2)
        box(f"{prefix}_side{sx}", 0.3, H1, 7.0, (x + sx * (W / 2 - 0.15), 0, zf - s * 3.5), wall, bevel=0.0)
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
    # 1.11.3: the terrace continues past the frame (no open ends)
    for k, x in enumerate((-18.0, 18.0, -27.0, 27.0)):
        house(f"hx{k}", x, ["#6a8f5a", "#8a5a7a", "#c9822e", "#3f6a8f"][k], srgb("#e4d6cc"), detail=False, wall_tex="exterior_wall_cladding_02" if k % 2 else "weathered_plank_siding",
              curtain=["#e2a35a", "#7fa0c8", "#e88a8a", "#8ac0a0"][k], paint=["#e8d8c0", None, "#d8c4b4", None][k])
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
    # 1.11.3: a "delivered" card over the order list: white panel, green rim and a big green tick
    ax, ay = 0.6, 0.36  # screen aspect (m): distances in metres so the strokes stay round
    pm = (u > 0.34) & (u < 0.9) & (v > 0.12) & (v < 0.8); out[pm] = hx("#ffffff")
    rim = pm & ~((u > 0.35) & (u < 0.89) & (v > 0.135) & (v < 0.785)); out[rim] = hx("#2f9a5a")
    def seg(x0, y0, x1, y1):
        px, py = (u - x0) * ax, (v - y0) * ay; dx, dy = (x1 - x0) * ax, (y1 - y0) * ay
        t = np.clip((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1)
        return np.hypot(px - t * dx, py - t * dy)
    tick = np.minimum(seg(0.45, 0.47, 0.56, 0.3), seg(0.56, 0.3, 0.79, 0.66)) < 0.022
    out[tick] = hx("#2f9a5a")
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


# ------------------------------------------------------------------------------------------------ VALLEY (1.12): the balloon short's world
# A Cappadocia-like valley, one builder for two lights (--time dawn | noon: the same geometry and marks, two bakes).
# Engine axes: the launch field is centred on the origin (y 0) on a plateau; the valley opens toward -z (the default
# camera looks down it): a bluff drops to the river (water y -33.7) that meanders 165-290 m out (its bend toward the
# field is the "river" mark), the village and its castle rock climb the far slope under the far rim cliffs, a tuff
# escarpment with cave windows runs along the left (it faces the low dawn sun, which comes from the right), vineyards
# around a hairpin road on the right, orchards and poplars on the floodplain, fairy chimneys in groups, mesas, ridges
# and a snowy volcano on the rim (650-1400 m from the field; the engine camera's far plane is 1500 m).
# Lightmaps: one map per terrain class (the field: four 64 m quadrants at 2048 = 32 texels/m; near terrain ~3/m,
# far < 1/m via per-material lm_max); the dawn mist is RT_ (transparent planes: unbaked, they cast no shadow).
VTIME = str(A.get("time", "dawn"))
VL = {
    "dawn": {"sun": (0.93, 0.16, 0.17), "sunCol": "#ffad62", "sunE": 7.5, "skyK": 0.42, "top": "#5876b4", "horizon": "#ebc4ba", "bottom": "#cdb0b4",
             "glow": 1.0, "fog": "#c9bccb", "fogNF": [100, 3200], "mist": True, "winK": 7.0},
    "noon": {"sun": (0.34, 0.9, 0.27), "sunCol": "#fff4e6", "sunE": 5.2, "skyK": 0.7, "top": "#6a9bd6", "horizon": "#dbe5ec", "bottom": "#cdd6dc",
             "glow": 0.35, "fog": "#d8e0e6", "fogNF": [80, 2600], "mist": False, "winK": 0.0},
}[VTIME]
_VG = {}
PREVIEW_FOG = {}
PREVIEW_VIEWS = []


def _hash2(np, ix, iz, seed):
    M = np.uint64(0xffffffff)
    h = (ix.astype(np.int64).astype(np.uint64) * np.uint64(0x9E3779B1)) ^ (iz.astype(np.int64).astype(np.uint64) * np.uint64(0x85EBCA77)) ^ np.uint64((seed * 0xC2B2AE3D) & 0xffffffff)
    h = h & M
    h = h ^ (h >> np.uint64(15)); h = (h * np.uint64(0x2C1B3C6D)) & M
    h = h ^ (h >> np.uint64(12)); h = (h * np.uint64(0x297A2D39)) & M
    h = h ^ (h >> np.uint64(15))
    return (h & np.uint64(0xffffff)).astype(np.float64) / 16777215.0


def vnoise(np, x, z, seed=0):
    """value noise in [-1, 1] (vectorised; integer lattice)"""
    x = np.asarray(x, dtype=np.float64); z = np.asarray(z, dtype=np.float64)
    x0 = np.floor(x); z0 = np.floor(z); fx = x - x0; fz = z - z0
    ix = x0.astype(np.int64); iz = z0.astype(np.int64)
    u = fx * fx * (3 - 2 * fx); w = fz * fz * (3 - 2 * fz)
    a = _hash2(np, ix, iz, seed); b = _hash2(np, ix + 1, iz, seed); c = _hash2(np, ix, iz + 1, seed); d = _hash2(np, ix + 1, iz + 1, seed)
    return (a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w) * 2.0 - 1.0


def fbm(np, x, z, seed=0, octaves=4):
    s, amp, f, nrm = 0.0, 1.0, 1.0, 0.0
    for k in range(octaves):
        s = s + amp * vnoise(np, x * f, z * f, seed + 31 * k); nrm += amp; amp *= 0.5; f *= 2.03
    return s / nrm


def sstep(np, a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0); return t * t * (3 - 2 * t)


def river_z(np, x):
    """the river's centre line (engine z) along x: a bend toward the field at x ~ 35, an S further left"""
    return -228 + 48 * np.exp(-((x - 35) / 62.0) ** 2) - 30 * np.exp(-((x + 120) / 70.0) ** 2) + 12 * np.sin(x / 97.0 + 1.3) + 20 * np.sin(x / 260.0)


def bluff_edge(np, x):
    return 100 + 24 * fbm(np, x / 95.0, np.zeros_like(x) + 7.3, 7, 3)


def rim_d(np, x):
    return 236 + 34 * fbm(np, x / 95.0, np.zeros_like(x) + 3.1, 11, 4) + 9 * np.sin(x / 23.0) * np.sin(x / 61.0 + 1.0)


def esc_x(np, z):
    return -185 + 14 * np.sin(z / 60.0) + 6 * np.sin(z / 21.0 + 1.0)


def valley_base(np, x, z):
    """the terrain height before the field and the road are levelled into it"""
    x = np.asarray(x, dtype=np.float64); z = np.asarray(z, dtype=np.float64)
    zr = river_z(np, x); d = z - zr
    n1 = fbm(np, x / 160.0, z / 160.0, 3, 4); n2 = fbm(np, x / 38.0, z / 38.0, 5, 4); n3 = fbm(np, x / 9.0, z / 9.0, 8, 3)
    tn = sstep(np, 16, bluff_edge(np, x), d) ** 0.85
    tf = sstep(np, 14, 175, -d) ** 1.15
    rim = rim_d(np, x)
    near = d >= 0
    rh = (30 + 22 * fbm(np, x / 55.0, np.zeros_like(x) + 5.5, 12, 3)) * (1 - 0.75 * np.exp(-((x + 60) / 14.0) ** 2) - 0.6 * np.exp(-((x - 140) / 18.0) ** 2)
                                                                       - 0.7 * np.exp(-((x - 330) / 12.0) ** 2) - 0.6 * np.exp(-((x + 280) / 16.0) ** 2))
    y = np.where(near, -32.8 + 32.8 * tn, -32.8 + 46 * tf + rh * sstep(np, rim - 3, rim + 4, -d) + 7 * n1 * sstep(np, rim, rim + 80, -d))
    t = np.where(near, tn, tf)
    slope = 4 * t * (1 - t)
    rid = 1 - np.abs(vnoise(np, x / 15.0 + 2.2 * n2, z / 46.0, 13))
    y = y - 6.5 * slope * rid ** 2 + 2.2 * n2 * slope + 0.5 * n3 * slope
    y = y + (0.45 * n2 + 0.1 * n3) * (1 - slope) * np.where(near & (t > 0.98), 2.5, 1.0)
    y = y + 26 * sstep(np, 160, 700, z) * (0.65 + 0.35 * n1)                                   # hills behind the field
    y = y + 34 * sstep(np, 170, 430, x) * (0.6 + 0.4 * n1) * (0.75 + 0.25 * rid)              # pink ridges on the right
    xc = esc_x(np, z)
    cf = sstep(np, zr + 45, zr + 125, z)
    top = 28 + 2.5 * n1 + 0.6 * n2
    esc = sstep(np, xc + 0.5, xc - 4.5, x) * cf                                                 # the left escarpment
    y = y + (np.maximum(y, top) - y) * esc
    r = np.hypot(x, z + 200)
    y = y + sstep(np, 0.08, 0.2, fbm(np, x / 430.0, z / 430.0, 21, 3)) * (70 + 40 * n1) * sstep(np, 560, 800, r)   # mesas
    y = y + 45 * sstep(np, 620, 1400, r) * (0.7 + 0.3 * n1)
    dv = np.hypot(x + 650, z + 1150)
    y = y + 135 * np.clip(1 - dv / 680.0, 0, 1) ** 1.3 - 9 * np.exp(-(dv / 40.0) ** 2)           # the volcano
    ad = np.abs(d)
    y = np.where(ad < 14, np.minimum(y, -35.6 + 2.7 * (ad / 8.0) ** 2), y)                      # the river channel
    return y


ROAD_CP = [(44, 560), (38, 320), (30, 150), (25, 62), (24, 10), (26, -38), (40, -62), (70, -80), (98, -96), (100, -112), (80, -124), (56, -136),
           (46, -152), (42, -170), (38, -188), (26, -208), (0, -236), (-34, -266), (-66, -296), (-92, -322), (-110, -348), (-122, -378)]


def road_prep(np):
    """the road's centre line resampled every ~2 m and its smoothed height (levelled onto the bridge over the river)"""
    cp = np.array(ROAD_CP, dtype=np.float64); pts = []
    for i in range(len(cp) - 1):
        p0, p1, p2, p3 = cp[max(0, i - 1)], cp[i], cp[i + 1], cp[min(len(cp) - 1, i + 2)]
        n = max(2, int(np.hypot(*(p2 - p1)) / 2.0))
        for k in range(n):
            t = k / n
            pts.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    pts.append(cp[-1]); P = np.array(pts)
    yb = valley_base(np, P[:, 0], P[:, 1])
    k = 9; ys = np.convolve(np.pad(yb, k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), mode="valid")
    d = P[:, 1] - river_z(np, P[:, 0]); br = np.abs(d) < 15
    if br.any():
        i0, i1 = np.where(br)[0][[0, -1]]
        ys[i0:i1 + 1] = np.maximum(-31.4, np.linspace(ys[max(0, i0 - 1)], ys[min(len(ys) - 1, i1 + 1)], i1 - i0 + 1))
    near = np.hypot(P[:, 0], P[:, 1]) < 70
    ys[near] = np.minimum(ys[near], 0.0)
    _VG["road"] = (P, ys, br)
    return P, ys, br


def road_near(np, x, z):
    """distance to the road's centre line and the road height there (vectorised)"""
    P, ys, _ = _VG["road"]
    bd = np.full(x.shape, 1e9); bh = np.zeros(x.shape)
    for i in range(0, len(P) - 2, 2):
        a, b = P[i], P[i + 2]; ab = b - a; L2 = float(ab @ ab) + 1e-9
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / L2, 0, 1)
        dd = np.hypot(x - a[0] - t * ab[0], z - a[1] - t * ab[1])
        m = dd < bd
        bd = np.where(m, dd, bd); bh = np.where(m, ys[i] + t * (ys[i + 2] - ys[i]), bh)
    return bd, bh


def valley_h(np, x, z):
    y = valley_base(np, x, z)
    dr = np.hypot(np.maximum(np.abs(x) - 44, 0), np.maximum(np.abs(z) - 44, 0))
    wf = 1 - sstep(np, 6, 50, dr)
    y = y * (1 - wf) + (0.06 * fbm(np, x / 11.0, z / 11.0, 17, 3) + 0.03 * fbm(np, x / 2.5, z / 2.5, 19, 2)) * wf
    rd, rh = road_near(np, x, z)
    w = 1 - sstep(np, 3.0, 10.0, rd)
    return y * (1 - w) + (rh - 0.13) * w


def vgh(x, z):
    """terrain height (engine y) at engine (x, z): bilinear on the built grid (arrays or scalars)"""
    import numpy as np
    xs, zs, Y = _VG["xs"], _VG["zs"], _VG["Y"]
    x = np.asarray(x, dtype=np.float64); z = np.asarray(z, dtype=np.float64)
    i = np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2); j = np.clip(np.searchsorted(zs, z) - 1, 0, len(zs) - 2)
    fx = np.clip((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1); fz = np.clip((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1)
    y = Y[i, j] * (1 - fx) * (1 - fz) + Y[i + 1, j] * fx * (1 - fz) + Y[i, j + 1] * (1 - fx) * fz + Y[i + 1, j + 1] * fx * fz
    return float(y) if np.ndim(y) == 0 else y


def axis_pts(lo, hi, step):
    out, v = [0.0], 0.0
    while v < hi - 1e-6: v = min(hi, v + step(v)); out.append(v)
    v, neg = 0.0, []
    while v > lo + 1e-6: v = max(lo, v - step(v)); neg.append(v)
    return sorted(neg) + out


def mat_lm(m, cap=None, k=None):
    """lightmap budget on a material: cap = the largest lightmap side, k = a texel-density factor (see bake_all)"""
    if cap: m["lm_max"] = cap
    if k: m["texel_k"] = k
    return m


def mesh_np(name, V, F, mat, smooth=True, normals=None):
    """a mesh from engine-space vertices V (n, 3) and faces F (tuples); normals: per-vertex custom normals"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(E(*v)) for v in V], [], F)
    me.update(); me.materials.append(mat)
    if smooth: me.shade_smooth()
    if normals is not None:
        try: me.normals_split_custom_set_from_vertices([tuple(edir(*n)) for n in normals])
        except Exception as e: print("[valley] custom normals:", e)
    return link(bpy.data.objects.new(name, me))


def tuff_mat(name, cols, seed, size=14.0, nb=9, rough=0.9, cap=None):
    """volcanic tuff: soft horizontal strata in a warm palette (warped band edges), weathering streaks, speckle"""
    def fn(u, v, np):
        vv = v + 0.006 * tnoise(np, u, v, seed, (1, 3), (1, 2), 12) + 0.003 * tnoise(np, u, v, seed + 1, (3, 9), (1, 3), 20)
        bi = np.floor(vv * nb); fb = vv * nb - bi
        pal = np.array([hx(c) for c in cols])
        idx = (np.abs(np.sin(bi * 12.9898 + seed * 1.7) * 43758.5453) % 1.0 * len(cols)).astype(np.int64) % len(cols)
        nxt = (np.abs(np.sin((bi + 1) * 12.9898 + seed * 1.7) * 43758.5453) % 1.0 * len(cols)).astype(np.int64) % len(cols)
        k = np.clip((fb - 0.5) / 0.5, 0, 1)[..., None] ** 1.5
        col = pal[idx] * (1 - k) + pal[nxt] * k
        speck = tnoise(np, u, v, seed + 2, (40, 140), (40, 140), 40, 0.3)
        streak = tnoise(np, u, v, seed + 3, (24, 70), (0, 2), 30, 0.4)
        blot = tnoise(np, u, v, seed + 4, (2, 8), (2, 8), 16)
        t = 1 + 0.04 * speck + 0.025 * streak + 0.07 * blot
        t = np.where(fb < 0.025, t * 0.93, t)
        return col * t[..., None]
    m = img_mat(name, 1024, 1024, fn, rough, 0.0, size)
    return mat_lm(m, cap)


def leaf_mat(name, base, seed, size=1.6):
    def fn(u, v, np):
        c = np.array(hx(base))
        n1 = tnoise(np, u, v, seed, (8, 30), (8, 30), 40, 0.5); n2 = tnoise(np, u, v, seed + 1, (1, 4), (1, 4), 10)
        g = tnoise(np, u, v, seed + 2, (24, 70), (24, 70), 50, 0.2)
        t = 0.8 + 0.16 * n1 + 0.1 * n2 + 0.08 * g
        t = np.where(g < -0.9, t * 0.5, t)
        return c[None, None, :] * t[..., None]
    return img_mat(name, 512, 512, fn, 0.85, 0.0, size)


def rgba_image(name, w, h, fn):
    import numpy as np
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    v, u = np.mgrid[0:h, 0:w].astype(np.float32); u /= (w - 1); v /= (h - 1)
    px = np.clip(fn(u, v, np), 0, 1).astype(np.float32)
    im = bpy.data.images.new(name, w, h, alpha=True); im.pixels.foreach_set(px.ravel())
    path = os.path.join(OUT, "tex", name + ".png"); im.filepath_raw = path; im.file_format = "PNG"; im.save()
    return bpy.data.images.load(path, check_existing=True)


# ---- terrain
TCLS = ["field0", "field1", "field2", "field3", "grass_n", "rock_n", "flood", "vine", "grass_m", "rock_m", "far", "rock_f", "snow", "farm_a", "farm_b", "farm_c", "grass_n2", "grass_m2"]
VINE_BOX = (58, 168, -150, -60)


def terrain_mats():
    M = {}
    for k in range(4):
        M[f"field{k}"] = tex_mat(f"field{k}", "aerial_grass_rock", 14.0, paint="#b4a574", pk=0.75, disp=True)
    M["grass_n"] = mat_lm(tex_mat("t_grass_n", "aerial_grass_rock", 14.0, paint="#b4a574", pk=0.75, disp=True), 2048)
    M["grass_n2"] = mat_lm(tex_mat("t_grass_n2", "aerial_grass_rock", 19.0, paint="#a3a068", pk=0.7, disp=True), 2048)
    M["grass_m2"] = mat_lm(tex_mat("t_grass_m2", "aerial_grass_rock", 33.0, paint="#a6a06c", pk=0.6, disp=True), 2048)
    M["rock_n"] = mat_lm(tex_mat("t_rock_n", "worn_rock_natural_01", 7.0, paint="#d7b49a", pk=0.65, disp=True), 2048)
    M["flood"] = mat_lm(tex_mat("t_flood", "forrest_ground_01", 7.0, paint="#8f9152", pk=0.6, disp=True), 2048)
    M["vine"] = mat_lm(tex_mat("t_vine", "dry_ground_01", 4.0, paint="#a7835f", pk=0.55, disp=True), 2048)
    M["grass_m"] = mat_lm(tex_mat("t_grass_m", "aerial_grass_rock", 26.0, paint="#b4a376", pk=0.65, disp=True), 2048)
    M["rock_m"] = mat_lm(tex_mat("t_rock_m", "worn_rock_natural_01", 14.0, paint="#d4ac94", pk=0.6, disp=True), 2048)
    M["far"] = mat_lm(tex_mat("t_far", "aerial_grass_rock", 70.0, paint="#9f9078", pk=0.45, disp=True), 1024)
    M["rock_f"] = mat_lm(tex_mat("t_rock_f", "aerial_rocks_02", 60.0, paint="#ab9184", pk=0.5, disp=True), 1024)
    M["snow"] = mat_lm(col_mat("t_snow", srgb("#eef0f4"), 0.55), 512)
    M["farm_a"] = mat_lm(tex_mat("t_farm_a", "dry_ground_01", 6.0, paint="#b48c62", pk=0.5, disp=True), 1024)
    M["farm_b"] = mat_lm(tex_mat("t_farm_b", "sparse_grass", 5.0, paint="#8c9150", pk=0.55, disp=True), 1024)
    M["farm_c"] = mat_lm(tex_mat("t_farm_c", "leafy_grass", 5.0, paint="#c6ad79", pk=0.5, disp=True), 1024)
    return M


def build_terrain():
    import numpy as np
    sx = lambda v: 1.0 if abs(v) < 64 - 1e-6 else (2.5 if abs(v) < 320 else 2.5 + (abs(v) - 320) * 0.04)
    sz = lambda v: 1.0 if -64 + 1e-6 < v < 64 - 1e-6 else (2.5 if -540 < v < 230 else 2.5 + max(-540 - v, v - 230, 0) * 0.04)
    xs = np.array(axis_pts(-1450, 1450, sx)); zs = np.array(axis_pts(-1500, 1100, sz))
    road_prep(np)
    X, Z = np.meshgrid(xs, zs, indexing="ij")
    Y = valley_h(np, X, Z)
    _VG.update(xs=xs, zs=zs, Y=Y)
    gx = np.gradient(Y, xs, axis=0); gz = np.gradient(Y, zs, axis=1)
    Nrm = np.stack([-gx, np.ones_like(Y), -gz], -1); Nrm /= np.linalg.norm(Nrm, axis=-1, keepdims=True)
    nx, nz = len(xs), len(zs)
    print(f"[valley] terrain grid {nx} x {nz}", flush=True)
    xc = (X[:-1, :-1] + X[1:, 1:]) / 2; zc = (Z[:-1, :-1] + Z[1:, 1:]) / 2
    yc = (Y[:-1, :-1] + Y[1:, :-1] + Y[:-1, 1:] + Y[1:, 1:]) / 4
    ny = (Nrm[:-1, :-1, 1] + Nrm[1:, :-1, 1] + Nrm[:-1, 1:, 1] + Nrm[1:, 1:, 1]) / 4
    r = np.hypot(xc, zc); d = zc - river_z(np, xc)
    C = np.full(xc.shape, TCLS.index("far"))
    farm = (zc > 95) & (r < 950) & (ny > 0.9)
    u_ = (xc * 0.94 + zc * 0.34) / 52.0; v_ = (-xc * 0.34 + zc * 0.94) / 34.0
    pid = np.floor(_hash2(np, np.floor(u_).astype(np.int64), np.floor(v_).astype(np.int64), 77) * 4.0)
    C = np.where(farm & (pid == 0), TCLS.index("farm_a"), C); C = np.where(farm & (pid == 1), TCLS.index("farm_b"), C)
    C = np.where(farm & (pid == 2), TCLS.index("farm_c"), C)
    C = np.where(~farm & (r < 800), TCLS.index("grass_m"), C)
    jf = fbm(np, xc / 18.0, zc / 18.0, 95, 3)
    C = np.where(~farm & (r < 800) & (np.abs(d) < 70) & (yc < -26 + 2.5 * jf), TCLS.index("flood"), C)
    C = np.where((r < 380) & ~farm, TCLS.index("grass_n"), C)
    C = np.where((r < 380) & (np.abs(d) < 70) & (yc < -27 + 2.5 * jf), TCLS.index("flood"), C)
    pg = fbm(np, xc / 55.0, zc / 55.0, 97, 3) + 0.3 * fbm(np, xc / 12.0, zc / 12.0, 98, 2)
    C = np.where((C == TCLS.index("grass_n")) & (pg > 0.06), TCLS.index("grass_n2"), C)
    C = np.where((C == TCLS.index("grass_m")) & (pg > 0.06), TCLS.index("grass_m2"), C)
    for vb in VINE_BOXES:
        C = np.where((xc > vb[0]) & (xc < vb[1]) & (zc > vb[2]) & (zc < vb[3]) & (ny > 0.88), TCLS.index("vine"), C)
    jit = fbm(np, xc / 14.0, zc / 14.0, 91, 3)
    steep = ny < 0.7 + 0.09 * jit
    C = np.where(steep & (r >= 380), np.where(r < 800, TCLS.index("rock_m"), TCLS.index("rock_f")), C)
    C = np.where((yc > 142 + 12 * jit + 6 * fbm(np, xc / 40.0, zc / 40.0, 93, 2)) & (np.hypot(xc + 650, zc + 1150) < 300), TCLS.index("snow"), C)
    fld = (np.abs(xc) < 64) & (np.abs(zc) < 64) & (np.hypot(xc, zc) < 55 + 8 * fbm(np, xc / 18.0, zc / 18.0, 99, 3))
    C = np.where(fld, (xc > 0).astype(np.int64) + 2 * (zc > 0).astype(np.int64), C)
    M = terrain_mats()
    Vall = np.stack([X, Y, Z], -1).reshape(-1, 3); Nall = Nrm.reshape(-1, 3)
    I, J = np.meshgrid(np.arange(nx - 1), np.arange(nz - 1), indexing="ij")
    for ci, cname in enumerate(TCLS):
        sel = C == ci
        if not sel.any(): continue
        i, j = I[sel], J[sel]
        quads = np.stack([i * nz + j, i * nz + j + 1, (i + 1) * nz + j + 1, (i + 1) * nz + j], -1)
        used, inv = np.unique(quads.ravel(), return_inverse=True)
        F = [tuple(q) for q in inv.reshape(-1, 4).tolist()]
        nm_ = ("FLOOR_" if cname.startswith("field") else "") + "terrain_" + cname
        mesh_np(nm_, Vall[used], F, M[cname], normals=Nall[used])
    return M


# ---- road, bridge, river
def build_road():
    import numpy as np
    P, ys, br = _VG["road"]
    road = tex_mat("road_dirt", "dirt", 4.0, paint="#c8ae8a", pk=0.7, disp=True)
    stone = tex_mat("bridge_stone", "worn_rock_natural_01", 2.5, paint="#cdb39a", pk=0.6, disp=True)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True); Nn = np.stack([-T[:, 1], T[:, 0]], 1)
    prof = [(-2.7, -0.16), (-2.05, 0.03), (0.0, 0.06), (2.05, 0.03), (2.7, -0.16)]
    st = {"piece": 0, "V": [], "F": [], "seg": 0}
    np_ = len(prof)
    def flush():
        if st["F"]: mesh_np(f"FLOOR_road{st['piece']}", np.array(st["V"]), st["F"], road); st["piece"] += 1
        st["V"], st["F"], st["seg"] = [], [], 0
    def add_row(i):
        base = len(st["V"])
        for (o, dy) in prof:
            x, z = P[i] + Nn[i] * o; st["V"].append((x, ys[i] + dy, z))
        if st["seg"] > 0:
            for k in range(np_ - 1): st["F"].append((base - np_ + k, base - np_ + k + 1, base + k + 1, base + k))
        st["seg"] += 1
    for i in range(len(P)):
        if br[i]: flush(); continue
        add_row(i)
        if st["seg"] >= 7:  # pieces of ~12 m: each its own lightmap island (one long strip would waste the atlas)
            flush(); add_row(i)
    flush()
    idx = np.where(br)[0]
    if len(idx):  # the bridge: deck, parapets with copings, three stone piers
        a, b = P[max(0, idx[0] - 2)], P[min(len(P) - 1, idx[-1] + 2)]
        c = (a + b) / 2; L = float(np.hypot(*(b - a))) + 2; yaw = math.atan2(-(b - a)[1], (b - a)[0])
        yd = float(max(ys[max(0, idx[0] - 2)], ys[min(len(P) - 1, idx[-1] + 2)])) + 0.06
        with Grp() as g:
            slab("bridge_deck", (0, -0.35, 0), (L, 0.7, 4.8), stone, bevel=0.06)
            for sz in (-1, 1):
                slab(f"bridge_par{sz}", (0, 0.4, sz * 2.25), (L, 0.8, 0.35), stone, bevel=0.05)
                for k in range(-3, 4): slab(f"bridge_cap{sz}{k}", (k * L / 7.5, 0.84, sz * 2.25), (0.5, 0.12, 0.45), stone, bevel=0.03)
            for k in (-1, 0, 1):
                slab(f"bridge_pier{k}", (k * L / 3.6, -3.6, 0), (1.6, 6.2, 5.0), stone, bevel=0.08)
        g.place((float(c[0]), yd, float(c[1])), yaw)
        mark("bridge", (float(c[0]), yd, float(c[1])))


def build_river():
    """the water: a ribbon along the river line just under the banks, emissive (a painted sky reflection that reads the
    same in the engine's albedo-only draw), ripples along the flow"""
    import numpy as np
    xs = np.arange(-1440, 1440, 4.0); zr = river_z(np, xs)
    T = np.stack([np.gradient(xs), np.gradient(zr)], 1); T /= np.linalg.norm(T, axis=1, keepdims=True)
    wl = -33.7
    top_c, mid_c = ("#efc9a6", "#9a93b4") if VTIME == "dawn" else ("#d3e2ec", "#7f9fb8")
    def fn(u, v, np):
        across = np.abs(v - 0.5) * 2
        rip = tnoise(np, u, v, 81, (1, 5), (14, 40), 40, 0.4)  # streaks along the flow
        sheen = np.clip(tnoise(np, u, v, 82, (1, 3), (2, 6), 12) * 0.5 + 0.5, 0, 1)
        base = np.array(hx(mid_c))[None, None, :] * (1 - sstep(np, 0.82, 1.0, across)[..., None] * 0.35) + np.array(hx(top_c))[None, None, :] * (sheen * 0.22)[..., None]
        return base * (1 + 0.03 * rip)[..., None]
    m = img_mat("river_water", 1024, 128, fn, rough=0.9, emit=0.3)
    m["tex_size"] = 0
    V, F = [], []
    for i, x in enumerate(xs):
        nx_, nz_ = -T[i, 1], T[i, 0]
        for o in (-8.5, 0.0, 8.5): V.append((x + nx_ * o, wl, zr[i] + nz_ * o))
        if i:
            for k in range(2): F.append((3 * (i - 1) + k, 3 * (i - 1) + k + 1, 3 * i + k + 1, 3 * i + k))
    ob = mesh_np("RIVER_water", np.array(V), F, m, smooth=False)
    me = ob.data; uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            i, k = divmod(me.loops[li].vertex_index, 3); uvl.data[li].uv = (xs[i] / 60.0, k / 2.0)
    return ob


# ---- rock forms: fairy chimneys, the castle rock, cliff walls with cave windows
def arch_win(bm, c, n, w, h, mi=0, rim=True):
    """a carved opening: an arched dark face (rectangle + half disc) just proud of a surface with outward normal n
    (engine), framed by a slightly larger face of darker stone (material 2) so it reads as cut into the rock"""
    n = Vector(n).normalized(); t = Vector((0, 1, 0)).cross(n).normalized(); up = n.cross(t).normalized()
    def shape(w_, h_, off):
        pts = [Vector(c) - t * w_ / 2 - up * h_ / 2, Vector(c) + t * w_ / 2 - up * h_ / 2]
        hr = h_ - w_ / 2
        for k in range(9):
            a = math.pi * k / 8
            pts.append(Vector(c) - up * h_ / 2 + up * hr + t * (w_ / 2) * math.cos(a) + up * (w_ / 2) * math.sin(a))
        return [bm.verts.new(E(*(p + n * off))) for p in pts]
    if rim: bm.faces.new(shape(w + 0.28, h + 0.17, 0.035)).material_index = 2
    f = bm.faces.new(shape(w, h, 0.05)); f.material_index = mi
    return f


def bm_v(bm, x, y, z):
    return bm.verts.new(E(x, y, z))


def spire(bm, bmc, bmw, at, h, r0, seed, lean=0.0, cap=True, wins=0, glow=0.0, shape="cone", amp=1.0, lod=1.0):
    """a fairy chimney into bmesh bm (body), bmc (basalt cap), bmw (windows: 0 dark, 1 lit, 2 carved rim): a tapering
    cone on a soft apron that flows into the ground, sculpted by noise, cut by vertical erosion grooves and stepped by
    horizontal strata ledges, a neck under a darker basalt hat; base 3 m underground"""
    rr = _random.Random(seed)
    NA, NV = max(14, int(40 * lod)), max(16, int(60 * lod))
    ph = [rr.uniform(0, 6.283) for _ in range(8)]
    la = rr.uniform(0, 6.283)
    nfl = rr.randint(8, 14); fdep = rr.uniform(0.05, 0.09); band = rr.uniform(1.4, 2.6); belly = rr.uniform(0.0, 0.14)
    def prof_r(tt):
        q = max(0.0, tt)
        if shape == "column": r = r0 * (1 - 0.35 * q ** 2.5) * (1 + 0.3 * math.exp(-q * 5))
        else: r = r0 * (1 - 0.76 * q ** 1.3) * (1 + belly * math.sin(math.pi * min(1.0, q * 1.3)))
        r *= 1 + (0.1 if shape == "column" else 0.5) * math.exp(-q * 10.0)   # a soft apron flowing into the valley floor
        if tt < 0 and shape != "column": r *= 1 + 0.2 * min(1.0, -tt * h / 3.0)
        return r * (1 - 0.34 * (tt - 0.86) / 0.14) if tt > 0.86 else r
    def surf(a, tt, y):
        nn = 0.055 * math.sin(3 * a + ph[0] + tt * 2.1) + 0.04 * math.sin(5 * a + ph[1] + tt * 4) + 0.03 * math.sin(9 * a + ph[2] + tt * 7) + 0.02 * math.sin(13 * a + ph[5] + tt * 11)
        if amp > 1: nn += 0.06 * math.sin(2 * a + ph[4] + tt * 9) + 0.04 * math.sin(4 * a + ph[5] + tt * 13) * math.sin(tt * 7 + ph[0])
        mid = math.sin(math.pi * min(1.0, max(0.0, tt) * 1.05))
        g = 1 - abs(math.sin(nfl * a / 2 + ph[3] + 0.7 * math.sin(tt * 4 + ph[6])))
        groove = fdep * (0.3 + 0.7 * mid) * g ** 5                 # vertical erosion grooves
        s_ = (y / band + 0.12 * math.sin(2 * a + ph[7])) % 1.0
        ledge = 0.045 * s_ ** 3                                   # horizontal strata ledges
        return prof_r(tt) * (1 + amp * nn - groove + ledge)
    def axis(tt):
        q = max(0.0, tt); return at[0] + lean * h * q * q * math.cos(la), at[2] + lean * h * q * q * math.sin(la)
    rows = []
    for j in range(NV + 1):
        t = j / NV; y = at[1] - 3 + (h + 3) * t; tt = (y - at[1]) / h
        cx, cz = axis(tt)
        rows.append(([bm.verts.new(E(cx + surf(a, tt, y) * math.cos(a), y, cz + surf(a, tt, y) * math.sin(a))) for a in [2 * math.pi * k / NA for k in range(NA)]], cx, y, cz))
    for (a_, *_r), (b_, *_s) in zip(rows, rows[1:]):
        for k in range(NA): bm.faces.new([a_[k], b_[k], b_[(k + 1) % NA], a_[(k + 1) % NA]])
    ring, cx, ytop, cz = rows[-1]
    tv = bm.verts.new(E(cx, ytop + 0.2, cz))
    for k in range(NA): bm.faces.new([ring[k], tv, ring[(k + 1) % NA]])
    rt = prof_r(1.0)
    if cap:  # a darker basalt hat, much wider than the neck, undercut, slightly tilted
        R = rt * rr.uniform(2.0, 2.7) + 0.45; Hc = max(1.0, h * rr.uniform(0.1, 0.15)); tilt = rr.uniform(-0.14, 0.14)
        prof = [(0.0, -0.12), (0.55, -0.08), (0.92, 0.02), (1.0, 0.16), (0.98, 0.38), (0.84, 0.66), (0.58, 0.88), (0.28, 0.99), (0.0, 1.03)]
        NC = 24; crs = []
        for (pr, py) in prof:
            if pr == 0: crs.append(bm_v(bmc, cx, ytop - 0.5 + py * Hc, cz)); continue
            rg = []
            for k in range(NC):
                a = 2 * math.pi * k / NC; rad = R * pr * (1 + 0.09 * math.sin(3 * a + ph[4]) + 0.06 * math.sin(7 * a + ph[5]) + 0.03 * math.sin(13 * a + ph[6]))
                px, pz = rad * math.cos(a), rad * math.sin(a)
                rg.append(bm_v(bmc, cx + px, ytop - 0.5 + py * Hc + tilt * px, cz + pz))
            crs.append(rg)
        for a_, b_ in zip(crs, crs[1:]):
            if isinstance(a_, list) and isinstance(b_, list):
                for k in range(NC): bmc.faces.new([a_[k], b_[k], b_[(k + 1) % NC], a_[(k + 1) % NC]])
            elif isinstance(a_, list):
                for k in range(NC): bmc.faces.new([a_[k], b_, a_[(k + 1) % NC]])
            else:
                for k in range(NC): bmc.faces.new([a_, b_[k], b_[(k + 1) % NC]])
    for w_ in range(wins):  # a door at the foot, carved windows above, on the sides the camera sees most (+z, +x)
        a = rr.uniform(-0.3, 1.9); tt = rr.uniform(0.1, 0.55) if w_ else 0.0
        hh = 2.0 if not w_ else rr.uniform(0.9, 1.4); ww = 1.1 if not w_ else rr.uniform(0.6, 0.95)
        tt_c = tt + (hh / 2 + 0.05) / h if not w_ else tt
        y_c = at[1] + tt_c * h; cx_, cz_ = axis(tt_c); rad = surf(a, tt_c, y_c)
        arch_win(bmw, (cx_ + rad * math.cos(a), y_c, cz_ + rad * math.sin(a)), (math.cos(a), 0, math.sin(a)), ww, hh, 1 if rr.random() < glow else 0)
    return (cx, ytop, cz)


def cliff_wall(name, mat, bmw, along, us, foot, top, outward, seed, wins=0, glow=0.0, dove=0):
    """a tuff cliff along a line: along(u) -> (x, z), outward(u) -> the face normal (x, z); rows from the foot (2 m
    underground) to the top: strata ledges and flutes push the face in and out, the top lip rolls back over the plateau"""
    import numpy as np
    rr = _random.Random(seed)
    rows = []
    bm = bmesh.new()
    NV = 34
    for u in us:
        x0, z0 = along(u); ox, oz = outward(u)
        y0, y1 = foot(u) - 2.0, top(u)
        col = []
        for j in range(NV + 3):
            if j <= NV:
                t = j / NV; y = y0 + (y1 - y0) * t
                saw = ((y / 4.6 + 0.25 * math.sin(u / 23.0)) % 1.0)
                ind = 1.6 + 1.2 * float(vnoise(np, u / 13.0, y / 6.0, seed)) + 1.1 * (saw ** 3) + 0.6 * abs(math.sin(u / 3.3 + 1.7 * float(vnoise(np, u / 30.0, y / 20.0, seed + 1)))) ** 3
                ind = max(0.25, ind) * (0.4 + 0.6 * min(1.0, (y - y0) / 4.0))
            else:
                k = j - NV; y = y1 + 0.25 * k; ind = -2.5 * k  # the lip rolls back over the top
            col.append(bm.verts.new(E(x0 + ox * ind, y, z0 + oz * ind)))
        rows.append(col)
    for a_, b_ in zip(rows, rows[1:]):
        for j in range(len(a_) - 1): bm.faces.new([a_[j], b_[j], b_[j + 1], a_[j + 1]])
    (ax0, az0), (ax1, az1) = along(us[0]), along(us[1]); ox, oz = outward(us[0])
    if -(az1 - az0) * ox + (ax1 - ax0) * oz < 0:  # (along x up) . outward < 0: the faces look into the rock
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.shade_smooth(); me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    for w_ in range(wins):  # cave windows and doors
        u = rr.uniform(us[0] + 5, us[-1] - 5); x0, z0 = along(u); ox, oz = outward(u)
        y0, y1 = foot(u), top(u)
        if y1 - y0 < 7: continue
        y = rr.uniform(y0 + 2.5, y1 - 3.0)
        arch_win(bmw, (x0 + ox * 0.3, y, z0 + oz * 0.3), (ox, 0, oz), rr.uniform(0.7, 1.2), rr.uniform(1.0, 2.0), 1 if rr.random() < glow else 0)
    for dv in range(dove):  # dovecote rows: small square holes in a line
        u = rr.uniform(us[0] + 8, us[-1] - 8); x0, z0 = along(u); ox, oz = outward(u)
        y0, y1 = foot(u), top(u)
        if y1 - y0 < 9: continue
        y = rr.uniform(y0 + 5, y1 - 3); tx, tz = -oz, ox
        for k in range(rr.randint(4, 8)):
            arch_win(bmw, (x0 + ox * 0.3 + tx * (k - 3) * 0.75, y, z0 + oz * 0.3 + tz * (k - 3) * 0.75), (ox, 0, oz), 0.32, 0.42, 0)
    return ob


def build_rocks():
    import numpy as np
    tn_ = tuff_mat("tuff_n", ["#f2dcc2", "#e9b7a0", "#dfac74", "#d59a85", "#f5e7d3", "#e6a88c", "#eccaa8"], 3, 16.0, nb=8)
    tm_ = tuff_mat("tuff_m", ["#efd8bd", "#e4b49c", "#dcad7a", "#d39b88", "#f2e2cc"], 5, 20.0, nb=8, cap=2048)
    tc_ = tuff_mat("tuff_cliff", ["#f0d8bc", "#e6b39a", "#ddb07a", "#d49c86", "#f3e3cc", "#e2b292"], 7, 24.0, nb=10)
    tk_ = tuff_mat("tuff_castle", ["#e8c9aa", "#dcae92", "#e9cfb2", "#d2a083", "#e0b48c"], 9, 18.0, nb=7)
    capm = mat_lm(img_mat("basalt_cap", 512, 512, lambda u, v, np: np.array(hx("#5c4a40"))[None, None, :] * (1 + 0.09 * tnoise(np, u, v, 21, (20, 80), (20, 80), 40, 0.3) + 0.1 * tnoise(np, u, v, 22, (2, 6), (2, 6), 12))[..., None], 0.85, 0.0, 6.0), 2048)
    dark = col_mat("cave_dark", srgb("#24180f"), 0.95)
    rimm = col_mat("cave_rim", srgb("#b3856a"), 0.9)
    glowm = col_mat("win_glow", srgb("#3a2618"), 0.6, emit=srgb("#ffb066") if VL["winK"] > 0 else None, emit_k=VL["winK"])
    bms = {k: bmesh.new() for k in ("n", "m", "c_n", "c_m", "w")}
    rr = _random.Random(11)
    P = _VG["road"][0]
    def clear(x, z, r):
        zr = float(river_z(np, np.array(x)))
        if abs(z - zr) < 12 + r: return False
        if float(np.min(np.hypot(P[:, 0] - x, P[:, 1] - z))) < 7 + r: return False
        if -205 < x < -25 and zr - 175 < z < zr - 20: return False  # the village
        if abs(x - float(esc_x(np, np.array(z)))) < 10 + r: return False
        if abs(z - (zr - float(rim_d(np, np.array(x))))) < 12 + r: return False
        return not (abs(x) < 80 and z > -75)
    def group(cx, cz, n, hmin, hmax, rad, seed, key, wins=0, glow=0.0):
        rg = _random.Random(seed)
        for k in range(n):
            a = rg.uniform(0, 6.283); dd = rad * math.sqrt(rg.random())
            x, z = cx + dd * math.cos(a), cz + dd * math.sin(a)
            h = rg.uniform(hmin, hmax) * (1.25 if rg.random() < 0.2 else 1.0); r0 = h * rg.uniform(0.16, 0.25)
            if not clear(x, z, 0): continue
            y = float(np.min(vgh(np.array([x - r0, x + r0, x, x]), np.array([z, z, z - r0, z + r0]))))
            lod = 1.0 if key == "n" else 0.6
            spire(bms[key], bms["c_" + key], bms["w"], (x, y, z), h, r0, seed * 100 + k, lean=rg.uniform(0, 0.08), cap=rg.random() < 0.85, wins=wins, glow=glow, lod=lod)
            if rg.random() < 0.35:  # a twin grown from the same base
                aa = rg.uniform(0, 6.283); h2 = h * rg.uniform(0.45, 0.75)
                spire(bms[key], bms["c_" + key], bms["w"], (x + 0.55 * r0 * math.cos(aa), y, z + 0.55 * r0 * math.sin(aa)), h2, h2 * rg.uniform(0.18, 0.26), seed * 100 + k + 50, lean=rg.uniform(0.02, 0.1), cap=rg.random() < 0.8, lod=lod)
    group(-92, -168, 11, 12, 34, 28, 1, "n", wins=2)             # the hero group ("spires") on the bluff slope
    group(128, -170, 7, 10, 26, 20, 2, "n", wins=1)              # by the vineyards and the river bend
    group(-150, -95, 6, 12, 22, 22, 3, "n")                      # eroded pillars at the escarpment's foot
    group(10, -300, 7, 10, 22, 30, 4, "n", wins=3, glow=0.25 if VL["winK"] > 0 else 0.0)  # cave houses on the far slope
    group(-235, -235, 5, 14, 26, 18, 5, "m", wins=2)             # a multi-headed cluster by the river
    group(205, -300, 6, 12, 28, 30, 6, "m")
    group(-300, -120, 5, 12, 25, 25, 7, "m")
    for k, xg in enumerate((-250.0, -20.0, 165.0, 300.0)):                # on the far rim's plateau: silhouettes on the skyline
        zg = float(river_z(np, np.array(xg)) - rim_d(np, np.array(xg))) - 34
        group(xg, zg, 5, 10, 22, 22, 60 + k, "m")
    for k in range(48):                                           # singles over the valley
        x, z = rr.uniform(-560, 560), rr.uniform(-600, -90)
        h = rr.uniform(8, 24)
        if not clear(x, z, h * 0.3): continue
        key = "m" if math.hypot(x, z) > 260 else "n"
        spire(bms[key], bms["c_" + key], bms["w"], (x, vgh(x, z), z), h, h * rr.uniform(0.2, 0.3), 900 + k, lean=rr.uniform(0, 0.1), cap=rr.random() < 0.7, lod=1.0 if key == "n" else 0.6)
    # the castle rock above the village: merged towers riddled with windows (some lit at dawn)
    ck = bmesh.new()
    for k, (dx, dz, h, r0) in enumerate(((0, 0, 68, 22), (-20, 9, 46, 17), (18, 7, 52, 15), (-7, 21, 34, 17), (26, -9, 38, 13), (-28, -8, 40, 14), (7, -17, 57, 15), (-40, 14, 24, 13), (40, 4, 26, 12))):
        x, z = -122 + dx, -446 + dz; y = vgh(x, z)
        spire(ck, bms["c_n"], bms["w"], (x, y, z), h, r0, 500 + k, lean=0.05, cap=False, wins=12, glow=0.3 if VL["winK"] > 0 else 0.0, shape="column", amp=2.2)
    mark("castle", (-122, vgh(-122, -446) + 68, -446))
    to_ = tuff_mat("tuff_o", ["#dcc2a4", "#d2b496", "#e2caae", "#cdb08e"], 13, 9.0, nb=5)
    bo = bmesh.new(); ro = _random.Random(31)
    cand = [(ro.uniform(-330, 330), ro.uniform(-420, -40)) for _ in range(9000)]
    ex_ = np.array([c[0] for c in cand]); ez_ = np.array([c[1] for c in cand])
    gx_ = (vgh(ex_ + 1.5, ez_) - vgh(ex_ - 1.5, ez_)) / 3.0; gz_ = (vgh(ex_, ez_ + 1.5) - vgh(ex_, ez_ - 1.5)) / 3.0
    nyv = 1 / np.sqrt(1 + gx_ ** 2 + gz_ ** 2)
    edge_z = river_z(np, ex_) + bluff_edge(np, ex_)
    n_out = 0
    for k in range(len(cand)):
        x, z = float(ex_[k]), float(ez_[k])
        lip = abs(z - (float(edge_z[k]) - 5.0)) < 3.0 and ro.random() < 0.35
        lip = lip and ro.random() < 0.5
        if not (nyv[k] < 0.82 and ro.random() < 0.11) and not lip: continue
        if not clear(x, z, 2) or math.hypot(x, z) < 70: continue
        n = Vector((-float(gx_[k]), 1.0, -float(gz_[k]))).normalized(); t1 = n.cross(Vector((0, 0, 1))).normalized(); t2 = t1.cross(n).normalized()
        a, b, c = ro.uniform(2.2, 5.0), ro.uniform(1.2, 2.6), ro.uniform(2.0, 4.0)
        M = Matrix((tuple(edir(*(t1 * a))) + (0,), tuple(edir(*(n * b))) + (0,), tuple(edir(*(t2 * c))) + (0,), (0, 0, 0, 1))).transposed()
        M.translation = E(x, vgh(x, z) - 0.25 * b, z)
        res = bmesh.ops.create_icosphere(bo, subdivisions=2, radius=1.0, matrix=M)
        for v in res["verts"]: v.co = M.translation + (v.co - M.translation) * (1 + ro.uniform(-0.2, 0.16))
        n_out += 1
    bmesh.ops.recalc_face_normals(bo, faces=bo.faces)
    me = bpy.data.meshes.new("outcrops"); bo.to_mesh(me); bo.free(); me.materials.append(to_); me.shade_smooth(); link(bpy.data.objects.new("outcrops", me))
    print(f"[valley] outcrops: {n_out}", flush=True)
    for key, mat in (("n", tn_), ("m", tm_), ("c_n", capm), ("c_m", capm)):
        bm = bms[key]; bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(f"spires_{key}"); bm.to_mesh(me); bm.free(); me.materials.append(mat); me.shade_smooth()
        link(bpy.data.objects.new(f"spires_{key}", me))
    bmesh.ops.recalc_face_normals(ck, faces=ck.faces)
    me = bpy.data.meshes.new("castle"); ck.to_mesh(me); ck.free(); me.materials.append(tk_); me.shade_smooth(); link(bpy.data.objects.new("castle", me))
    # the left escarpment (faces +x: lit by the low sun from the right) and the far rim cliffs (face +z)
    zs_ = list(np.arange(float(river_z(np, np.array(-185.0))) + 52, 262, 1.6))
    ex = lambda u: float(esc_x(np, np.array(u)))
    cliff_wall("cliff_left", tc_, bms["w"], lambda u: (ex(u) + 0.8, u), zs_, lambda u: vgh(ex(u) + 7, u), lambda u: vgh(ex(u) - 9, u),
               lambda u: (1.0, 0.0), 41, wins=90, dove=10)
    def rim_line(u):
        return (u, float(river_z(np, np.array(u)) - rim_d(np, np.array(u))) + 3.6)
    cliff_wall("cliff_rim", tc_, bms["w"], rim_line, list(np.arange(-470, 470, 2.0)), lambda u: vgh(u, rim_line(u)[1] + 7), lambda u: vgh(u, rim_line(u)[1] - 9),
               lambda u: (0.0, 1.0), 43, wins=110, glow=0.06 if VL["winK"] > 0 else 0.0, dove=14)
    mark("cliffs", (-170.0, vgh(-170.0, -40.0), -40.0))
    bm = bms["w"]; me = bpy.data.meshes.new("cave_windows"); bm.to_mesh(me); bm.free(); me.materials.append(dark); me.materials.append(glowm); me.materials.append(rimm)
    link(bpy.data.objects.new("cave_windows", me))


# ---- the village: flat-roofed houses in plaster tones on the far slope, a mosque and its minaret
def kilim_mat(name, cols, seed, fit=1):
    """a woven rug: banded field with diamonds, a border (stretched over the object: fit 1 hangs, fit 2 lies flat)"""
    def fn(u, v, np):
        C = [np.array(hx(c)) for c in cols]
        out = np.zeros(u.shape + (3,)) + C[0]
        band = np.floor(v * 9); fv = v * 9 - band
        out = np.where(((band % 3) == 1)[..., None], C[1], out)
        dd = np.abs(((u * 3) % 1.0) - 0.5) + np.abs(fv - 0.5)
        out = np.where(((dd < 0.32) & ((band % 3) == 0))[..., None], C[2], out)
        out = np.where(((dd < 0.14) & ((band % 3) == 0))[..., None], C[3], out)
        brd = (u < 0.07) | (u > 0.93) | (v < 0.03) | (v > 0.97)
        out = np.where(brd[..., None], C[1], out)
        return out * (1 + 0.05 * tnoise(np, u, v, seed, (20, 60), (20, 60), 20, 0.4))[..., None]
    return img_mat(name, 128, 256, fn, 0.95, 0.0, fit=fit)


def blob_obj(name, c, r, mat, sub=2, sy=1.0, seed=0, lump=0.2):
    bm = bmesh.new(); lumpy_into(bm, c, r, seed, sub=sub, lump=lump, sy=sy)
    return mesh_obj(name, bm, [mat], sharp=80)


def vhouse(p, x, z, w, d, h, yaw, rr, wall, M):
    """a flat-roofed village house (front toward +z): plastered or painted walls, a roof with parapets, windows with
    sills (some lit at dawn, some with painted frames), a coloured door, and life: water tank, chimney, laundry on the
    roof, potted plants on the parapet, a rug hung over it"""
    import numpy as np
    gy = vgh(np.array([x - w / 2, x + w / 2, x - w / 2, x + w / 2, x]), np.array([z - d / 2, z - d / 2, z + d / 2, z + d / 2, z]))
    y = float(gy.min()); drop = float(gy.max() - gy.min()) + 0.6
    frame = rr.choice(M["frames"]) if rr.random() < 0.35 else None
    with Grp() as g:
        box(f"{p}_w", w, h + drop, d, (0, -drop, 0), wall, bevel=0.05)
        box(f"{p}_roof", w + 0.2, 0.22, d + 0.2, (0, h, 0), M["roof"], bevel=0.04)
        for (px, pz, pw, pd) in ((0, d / 2 + 0.05, w + 0.2, 0.22), (0, -d / 2 - 0.05, w + 0.2, 0.22), (w / 2 + 0.05, 0, 0.22, d + 0.2), (-w / 2 - 0.05, 0, 0.22, d + 0.2)):
            box(f"{p}_par{px:.1f}{pz:.1f}", pw, 0.45, pd, (px, h + 0.2, pz), wall, bevel=0.04)
        floors = 2 if h > 5 else 1
        for fl in range(floors):
            nwin = max(1, int(w / 2.6))
            for k in range(nwin):
                wx = -w / 2 + (k + 0.5) * w / nwin
                if fl == 0 and k == nwin // 2: continue
                m = M["glow"] if rr.random() < 0.3 and VL["winK"] > 0 else M["dark"]
                box(f"{p}_win{fl}{k}", 0.85, 1.05, 0.08, (wx, 0.9 + fl * 3.0, d / 2 + 0.02), m, bevel=0.0)
                if frame: box(f"{p}_frm{fl}{k}", 1.05, 1.25, 0.05, (wx, 0.8 + fl * 3.0, d / 2 + 0.005), frame, bevel=0.0)
                box(f"{p}_sill{fl}{k}", 1.05, 0.08, 0.16, (wx, 0.82 + fl * 3.0, d / 2 + 0.06), M["trim"], bevel=0.0)
            if rr.random() < 0.5:
                box(f"{p}_swin{fl}", 0.8, 1.0, 0.08, (w / 2 + 0.02, 0.95 + fl * 3.0, rr.uniform(-d / 4, d / 4)), M["dark"], bevel=0.0, rot_y=math.pi / 2)
        box(f"{p}_door", 1.0, 2.05, 0.08, (0.0, 0.0, d / 2 + 0.03), rr.choice(M["doors"]), bevel=0.01)
        box(f"{p}_lintel", 1.4, 0.18, 0.2, (0.0, 2.12, d / 2 + 0.06), M["trim"], bevel=0.0)
        if rr.random() < 0.6: cyl(f"{p}_tank", 0.45, 1.0, (rr.uniform(-w / 4, w / 4), h + 0.22, rr.uniform(-d / 4, d / 4)), M["tank"], seg=14)
        if rr.random() < 0.5: box(f"{p}_chim", 0.45, 0.9, 0.45, (w / 2 - 0.6, h + 0.2, -d / 2 + 0.6), wall, bevel=0.03)
        if rr.random() < 0.38:  # laundry on the roof
            lz = rr.uniform(-d / 4, d / 5); lx = w * 0.32
            for sx in (-1, 1): tube_path(f"{p}_lpole{sx}", [(sx * lx, h + 0.2, lz), (sx * lx, h + 1.75, lz)], 0.03, M["trim"], seg=5)
            tube_path(f"{p}_lcord", [(-lx, h + 1.7, lz), (0, h + 1.6, lz), (lx, h + 1.7, lz)], 0.01, M["cord"], seg=4)
            n = rr.randint(3, 6)
            for k in range(n):
                cw, ch = rr.uniform(0.4, 0.75), rr.uniform(0.45, 0.85)
                cx_ = -lx + (k + 0.5) * 2 * lx / n
                slab(f"{p}_cloth{k}", (cx_, h + 1.62 - ch / 2, lz), (cw, ch, 0.012), rr.choice(M["cloth"]), bevel=0.0, yaw=rr.uniform(-0.15, 0.15))
        if rr.random() < 0.55:  # potted plants on the front parapet
            for k in range(rr.randint(1, 3)):
                px = rr.uniform(-w / 2 + 0.4, w / 2 - 0.4)
                cyl(f"{p}_pot{k}", 0.16, 0.28, (px, h + 0.65, d / 2 + 0.05), M["pot"], seg=10, r2=0.2)
                blob_obj(f"{p}_plant{k}", (px, h + 1.05, d / 2 + 0.05), 0.24, M["leaf"], sub=2, seed=hash(p) % 997 + k)
                if rr.random() < 0.5: blob_obj(f"{p}_bloom{k}", (px + 0.08, h + 1.22, d / 2 + 0.12), 0.09, rr.choice(M["bloom"]), sub=1, seed=k)
        if rr.random() < 0.16:  # a rug hung over the parapet
            box(f"{p}_rug", 1.15, 1.6, 0.03, (rr.uniform(-w / 4, w / 4), h - 1.0, d / 2 + 0.12), rr.choice(M["kilims"]), bevel=0.0)
    g.place((x, y, z), yaw)


def build_village():
    import numpy as np
    pl = [tex_mat(f"plaster_{k}", "clay_plaster", 2.6, paint=c, pk=0.55, disp=True) for k, c in enumerate(("#ead8bf", "#dcc09f", "#d1ae8d", "#e4cdb0"))]
    painted = [tex_mat(f"painted_{k}", "clay_plaster", 2.6, paint=c, pk=0.4, disp=True) for k, c in enumerate(("#86abc8", "#e3a7a0", "#e5b55e", "#a3cbaa", "#f3ece1", "#d98f6a"))]
    wglow = bpy.data.materials.get("win_glow") or col_mat("win_glow", srgb("#3a2618"), 0.6, emit=srgb("#ffb066") if VL["winK"] > 0 else None, emit_k=VL["winK"])
    M = {"roof": tex_mat("roof_earth", "dirt", 3.0, paint="#b39a80", pk=0.5, disp=True), "dark": col_mat("win_dark", srgb("#2a211c"), 0.35), "glow": wglow,
         "trim": col_mat("trim_stone", srgb("#c8b296"), 0.8), "tank": col_mat("roof_tank", srgb("#d8d6d0"), 0.4), "cord": col_mat("cord_dark", srgb("#3a3430"), 0.7),
         "doors": [wood_mat("door_wood", "#7a5536", "#4f3622", size=1.0, seed=31, boards=5), col_mat("door_teal", srgb("#3d7a80"), 0.5), col_mat("door_blue", srgb("#3e6aa8"), 0.5),
                   col_mat("door_red", srgb("#b4442f"), 0.5), col_mat("door_green", srgb("#4f8a4c"), 0.5)],
         "frames": [col_mat("frame_blue", srgb("#4d7fb3"), 0.5), col_mat("frame_teal", srgb("#3f8a88"), 0.5), col_mat("frame_white", srgb("#f1ece2"), 0.5)],
         "cloth": [col_mat(f"cloth_{n}", srgb(c), 0.85) for n, c in (("red", "#cc3e2e"), ("blue", "#3f74b0"), ("yellow", "#f1c34a"), ("white", "#f3efe6"), ("pink", "#e79aa8"), ("green", "#5f9e5c"))],
         "pot": col_mat("pot_terracotta", srgb("#b8623b"), 0.8), "leaf": leaf_mat("pot_leaf", "#5f8f3c", 41, size=0.6),
         "bloom": [col_mat("bloom_red", srgb("#d93a3a"), 0.6), col_mat("bloom_pink", srgb("#e77fa8"), 0.6), col_mat("bloom_white", srgb("#f6f1e8"), 0.6)],
         "kilims": [kilim_mat("kilim_a", ("#b8322a", "#1f3a66", "#e8a23a", "#f0e2c4"), 51), kilim_mat("kilim_b", ("#2f5d8a", "#c8402e", "#f2c14e", "#efe4cf"), 52),
                    kilim_mat("kilim_c", ("#7a2e4a", "#e0a43a", "#2f6f6a", "#f3e6d0"), 53)]}
    lead = col_mat("lead_grey", srgb("#8d8f93"), 0.5)
    rr = _random.Random(23)
    placed = []
    P = _VG["road"][0]
    n = 0
    for row in range(11):
        dd = 32 + row * 12.5
        x = -195 + rr.uniform(0, 8)
        while x < -38:
            w, dp, h = rr.uniform(5.5, 9.0), rr.uniform(5.0, 7.5), rr.choice((3.4, 3.6, 6.4, 6.8))
            x_ = x + w / 2
            z = float(river_z(np, np.array(x_))) - dd + rr.uniform(-2.5, 2.5)
            ok = all(math.hypot(x_ - px, z - pz) > (w + pw) / 2 + 1.2 for (px, pz, pw) in placed)
            if math.hypot(x_ + 122, z + 446) < 42 or float(np.min(np.hypot(P[:, 0] - x_, P[:, 1] - z))) < w / 2 + 3.5: ok = False
            if math.hypot(x_ + 96, z - float(river_z(np, np.array(-96.0))) + 76) < 16: ok = False
            if ok and rr.random() < 0.82:
                wall = painted[rr.randrange(len(painted))] if rr.random() < 0.4 else pl[n % 4]
                vhouse(f"vh{n}", x_, z, w, dp, h, rr.uniform(-0.35, 0.35) + (math.pi / 4 if rr.random() < 0.3 else 0), rr, wall, M)
                placed.append((x_, z, w)); n += 1
            x += w + rr.uniform(2.0, 9.0)
    mx = -96.0; mz = float(river_z(np, np.array(mx))) - 76
    my = float(np.min(vgh(np.array([mx - 7, mx + 7, mx, mx]), np.array([mz, mz, mz - 7, mz + 7]))))
    with Grp() as g:
        box("mosque_body", 13, 10.5, 13, (0, -3, 0), pl[0], bevel=0.06)
        me = bpy.data.meshes.new("mosque_dome"); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=5.2)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS"); bm.to_mesh(me); bm.free()
        d_ = link(bpy.data.objects.new("mosque_dome", me)); me.materials.append(lead); d_.location = E(0, 7.5, 0); me.shade_smooth()
        cyl("minaret", 1.25, 24, (7.5, -2, 6), pl[0], seg=24, r2=1.1)
        cyl("minaret_bal", 1.8, 0.5, (7.5, 17.5, 6), M["trim"], seg=24)
        cyl("minaret_top", 1.15, 6.5, (7.5, 22, 6), lead, seg=24, r2=0.05)
        for k in range(4): box(f"mosque_win{k}", 1.2, 2.2, 0.1, (-4.5 + k * 3, 2.5, 6.52), wglow if k == 1 and VL["winK"] > 0 else M["dark"], bevel=0.0)
    g.place((mx, my, mz), 0.2)
    # the square by the mosque: a cart with crates and melons, rugs laid out for sale
    cwood = wood_mat("cart_wood", "#8a6440", "#5a4028", size=0.8, seed=57, boards=4)
    melon = col_mat("melon", srgb("#e0902e"), 0.5); melon2 = col_mat("melon_green", srgb("#6f8f3c"), 0.5)
    cx_, cz_ = mx + 13.0, mz + 9.0
    with Grp() as cg:
        slab("cart_bed", (0, 0.8, 0), (2.4, 0.1, 1.3), cwood, bevel=0.02)
        for sz in (-1, 1):
            slab(f"cart_side{sz}", (0, 1.05, sz * 0.62), (2.4, 0.4, 0.06), cwood, bevel=0.015)
            disc(f"cart_wheel{sz}", (0.1, 0.62, sz * 0.78), 0.62, 0.09, cwood, axis="z", seg=24)
            disc(f"cart_hub{sz}", (0.1, 0.62, sz * 0.84), 0.12, 0.08, M["cord"], axis="z", seg=12)
            slab(f"cart_shaft{sz}", (1.9, 0.7, sz * 0.42), (1.8, 0.07, 0.07), cwood, bevel=0.01, tilt=-0.12)
        for k in range(2): slab(f"cart_crate{k}", (-0.6 + k * 0.62, 1.1, 0.2), (0.55, 0.45, 0.5), cwood, bevel=0.015)
        rm = _random.Random(9)
        for k in range(9):
            blob_obj(f"cart_melon{k}", (0.45 + rm.uniform(-0.4, 0.4), 1.05 + rm.uniform(0, 0.15), rm.uniform(-0.45, 0.45)), rm.uniform(0.14, 0.2), melon if k % 3 else melon2, sub=2, seed=k, lump=0.06)
    cg.place((cx_, vgh(cx_, cz_), cz_), 0.6)
    for k in range(3):
        rx, rz = cx_ - 4 + k * 2.4, cz_ + 3.5
        box(f"rug_flat{k}", 1.6, 0.025, 2.3, (rx, vgh(rx, rz) + 0.03, rz), kilim_mat(f"kilim_flat{k}", [("#b8322a", "#1f3a66", "#e8a23a", "#f0e2c4"), ("#2f5d8a", "#c8402e", "#f2c14e", "#efe4cf"), ("#7a2e4a", "#e0a43a", "#2f6f6a", "#f3e6d0")][k], 60 + k, fit=2), bevel=0.0, rot_y=0.6)
    vz = float(river_z(np, np.array(-112.0))) - 80
    mark("village", (-112.0, vgh(-112.0, vz), vz)); mark("minaret", (mx, my + 28, mz)); mark("cart", (cx_, vgh(cx_, cz_), cz_))
    print(f"[valley] village: {n} houses", flush=True)


# ---- vegetation: poplars, orchards, vineyards, shrubs (bmesh blobs, one object per material)
def blob_into(bm, c, r, sy=1.0, sub=1, seed=0, jit=0.13):
    rr = _random.Random(seed); C = E(*c)
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r, matrix=Matrix.Translation(C))
    for v in res["verts"]:
        d = v.co - C; d.z *= sy; v.co = C + d * (1 + rr.uniform(-jit, jit))
    return res


def lumpy_into(bm, c, r, seed, sub=2, lump=0.22, sy=1.0):
    """a leafy cluster: an icosphere puffed into lobes (a stylised, cauliflower-like crown part)"""
    rr = _random.Random(seed); C = E(*c)
    p = [rr.uniform(0, 6.283) for _ in range(6)]; f = rr.uniform(3.6, 5.4)
    res = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r, matrix=Matrix.Translation(C))
    for v in res["verts"]:
        d = v.co - C; n = d.normalized()
        k = 1 + lump * (0.55 * math.sin(f * n.x + p[0]) * math.sin(f * n.y + p[1]) * math.sin(f * n.z + p[2])
                        + 0.3 * math.sin(2.1 * f * n.x + p[3]) * math.sin(2.1 * f * n.z + p[4]) + 0.15 * math.sin(4.3 * f * n.y + p[5]))
        d = d * k; d.z *= sy; v.co = C + d
    return res


def tube_into(bm, pts, r0, r1, seg=6):
    """a tapering tube through engine points (trunks, branches)"""
    rings = []
    for i, p in enumerate(pts):
        a, b = Vector(pts[max(0, i - 1)]), Vector(pts[min(len(pts) - 1, i + 1)])
        t = (b - a).normalized(); up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        A = t.cross(up).normalized(); Bv = A.cross(t).normalized()
        r = r0 + (r1 - r0) * i / max(1, len(pts) - 1)
        rings.append([bm.verts.new(E(*(Vector(p) + (A * math.cos(2 * math.pi * k / seg) + Bv * math.sin(2 * math.pi * k / seg)) * r))) for k in range(seg)])
    for r0_, r1_ in zip(rings, rings[1:]):
        for k in range(seg): bm.faces.new([r0_[k], r0_[(k + 1) % seg], r1_[(k + 1) % seg], r1_[k]])


def trunk_into(bm, at, r, h):
    tube_into(bm, [(at[0], at[1] - 0.3, at[2]), (at[0], at[1] + h, at[2])], r, r * 0.6, seg=7)


def poplar_into(B, at, h, rr, key, sub):
    """a Lombardy poplar: a straight trunk and upswept limbs inside a tall narrow column of leafy lobes"""
    x, y, z = at
    tube_into(B["bark"], [(x, y - 0.3, z), (x + rr.uniform(-0.1, 0.1), y + h * 0.3, z), (x, y + h * 0.7, z)], 0.3, 0.12, seg=6)
    for k in range(3):
        a = rr.uniform(0, 6.283); y0 = y + h * rr.uniform(0.18, 0.3)
        tube_into(B["bark"], [(x, y0, z), (x + 0.5 * math.cos(a), y0 + h * 0.25, z + 0.5 * math.sin(a))], 0.09, 0.04, seg=5)
    n = 8
    for j in range(n):
        t = 0.2 + 0.78 * j / (n - 1)
        wdt = (0.6 + 0.4 * math.sin(math.pi * min(1.0, t * 1.2))) * (1 - 0.65 * max(0.0, t - 0.72) / 0.28)
        lumpy_into(B[key], (x + rr.uniform(-0.3, 0.3), y + h * t, z + rr.uniform(-0.3, 0.3)), h * 0.085 * wdt + 0.35, rr.randrange(10 ** 6), sub=sub, lump=0.26, sy=1.45)


def fruit_into(B, at, h, rr, key, sub):
    """an apricot / fruit tree: a short trunk forking into four or five limbs, a rounded crown of leafy clusters"""
    x, y, z = at
    top = (x + rr.uniform(-0.2, 0.2), y + h * 0.36, z + rr.uniform(-0.2, 0.2))
    tube_into(B["bark"], [(x, y - 0.3, z), ((x + top[0]) / 2, y + h * 0.18, (z + top[2]) / 2), top], 0.045 * h, 0.03 * h, seg=6)
    tips = []
    nb = rr.randint(4, 5)
    for k in range(nb):
        a = 2 * math.pi * k / nb + rr.uniform(-0.35, 0.35); out = rr.uniform(0.26, 0.4) * h; up = rr.uniform(0.28, 0.46) * h
        mid = (top[0] + math.cos(a) * out * 0.5, top[1] + up * 0.6, top[2] + math.sin(a) * out * 0.5)
        tip = (top[0] + math.cos(a) * out, top[1] + up, top[2] + math.sin(a) * out)
        tube_into(B["bark"], [top, mid, tip], 0.022 * h, 0.009 * h, seg=5)
        tips.append(tip)
    for k, tip in enumerate(tips):
        lumpy_into(B[key], tip, rr.uniform(0.27, 0.34) * h, rr.randrange(10 ** 6), sub=sub, lump=0.24, sy=0.82)
    lumpy_into(B[key], (top[0], top[1] + h * 0.52, top[2]), 0.3 * h, rr.randrange(10 ** 6), sub=sub, lump=0.24, sy=0.8)


VINE_BOXES = [VINE_BOX, (-300, -228, -240, -208)]


def build_vegetation():
    import numpy as np
    leaf = {"pop_g1": "#6f9a3c", "pop_g2": "#8aaa45", "pop_gold": "#ddb33e", "fr_g1": "#6a8d35", "fr_g2": "#8aa443", "fr_y": "#e3b53a", "fr_o": "#de7b2e",
            "shrub": "#8b8a4f", "shrub_n": "#8e8c52", "vine": "#86a03f"}
    mats = {k: leaf_mat(f"leaf_{k}", c, 3 + i) for i, (k, c) in enumerate(leaf.items())}
    bark = col_mat("bark", srgb("#6b5545"), 0.85)
    B = {k: bmesh.new() for k in list(mats) + ["bark"]}
    rr = _random.Random(5)
    P = _VG["road"][0]
    def road_d(x, z): return float(np.min(np.hypot(P[:, 0] - x, P[:, 1] - z)))
    def ok_spot(x, z, clear=4.0):
        if abs(x) < 70 and abs(z) < 70: return False
        zr = float(river_z(np, np.array(x)))
        if -205 < x < -25 and zr - 175 < z < zr - 25: return False
        return road_d(x, z) >= clear
    n_pop = 0
    for side in (1, -1):  # poplars in rows along both banks, a second row on some stretches, gaps here and there
        for row, dd in ((0, 13.5), (1, 19.5)):
            x = -330.0 + rr.uniform(0, 4)
            while x < 340:
                gap = float(vnoise(np, x / 55.0, side * 3.0 + row * 7.0, 71))
                if (row == 0 and gap > -0.35) or (row == 1 and gap > 0.25):
                    z = float(river_z(np, np.array(x))) + side * (dd + rr.uniform(-0.8, 0.8))
                    if ok_spot(x, z, 5):
                        key = "pop_gold" if rr.random() < 0.3 else rr.choice(("pop_g1", "pop_g2"))
                        poplar_into(B, (x, vgh(x, z), z), rr.uniform(15, 22), rr, key, 3 if abs(x - 35) < 150 else 2); n_pop += 1
                x += rr.uniform(4.8, 6.2)
    for xw in (-140.0, 80.0, 232.0):  # windbreaks across the floodplain
        for k in range(7):
            zr = float(river_z(np, np.array(xw))); z = zr + 22 + k * 6.0; x = xw + rr.uniform(-0.6, 0.6)
            if ok_spot(x, z, 5) and z < zr + 70:
                poplar_into(B, (x, vgh(x, z), z), rr.uniform(14, 20), rr, rr.choice(("pop_g1", "pop_g2", "pop_gold")), 2); n_pop += 1
    n_fr = 0
    for (ox, odd, nxr, nzr) in ((-30, 22, 9, 4), (120, 30, 7, 4), (-205, 30, 8, 3), (250, -40, 8, 4), (-330, -35, 7, 3), (175, 24, 6, 3)):  # orchards on the floodplain
        for i in range(nxr):
            for j in range(nzr):
                x = ox + i * 7.0 + rr.uniform(-0.6, 0.6); z = float(river_z(np, np.array(x))) + odd + (j * 7.0 if odd > 0 else -j * 7.0) + rr.uniform(-0.6, 0.6)
                if not ok_spot(x, z, 4.5) or rr.random() < 0.08: continue
                q = rr.random(); key = "fr_o" if q < 0.12 else "fr_y" if q < 0.32 else rr.choice(("fr_g1", "fr_g2"))
                fruit_into(B, (x, vgh(x, z), z), rr.uniform(4.0, 5.6), rr, key, 3 if math.hypot(x, z) < 330 else 2); n_fr += 1
    prof = [(0.42 * math.cos(2 * math.pi * k / 8), 0.42 * math.sin(2 * math.pi * k / 8) * 1.25 + 0.42) for k in range(8)]
    for vb in VINE_BOXES:  # vineyard rows along the contour (lumpy hedges of bush vines), broken where the road passes
        for j, z0 in enumerate(np.arange(vb[2] + 2, vb[3] - 2, 2.7)):
            pts = []
            def flush_row():
                if len(pts) > 3:
                    rings = []
                    for i, p in enumerate(pts):
                        a, b = Vector(pts[max(0, i - 1)]), Vector(pts[min(len(pts) - 1, i + 1)])
                        t = (b - a).normalized(); A_ = edir(*t.cross(Vector((0, 1, 0))).normalized()); Bb = edir(0, 1, 0)
                        s_ = 0.8 + 0.25 * math.sin(i * 1.9 + j) + 0.12 * rr.uniform(-1, 1)
                        rings.append([B["vine"].verts.new(E(*p) + A_ * a_ * s_ + Bb * b_ * s_) for (a_, b_) in prof])
                    for r0, r1 in zip(rings, rings[1:]):
                        for k in range(8): B["vine"].faces.new([r0[k], r0[(k + 1) % 8], r1[(k + 1) % 8], r1[k]])
                    for r_ in (rings[0], rings[-1]): B["vine"].faces.new(r_)
                pts.clear()
            for x in np.arange(vb[0] + 2, vb[1] - 2, 1.2):
                z = z0 + 1.2 * math.sin(x / 17.0 + j)
                if road_d(x, z) < 4.5 or abs(z - float(river_z(np, np.array(x)))) < 12: flush_row(); continue
                pts.append((float(x), vgh(x, z) - 0.05, float(z)))
            flush_row()
    mark("vineyard", (110, vgh(110, -105), -105))
    for k in range(70):  # a dense near ring of shrubs around the field (foreground layer)
        a = rr.uniform(0, 6.283); dd = rr.uniform(56, 92); x, z = dd * math.cos(a), dd * math.sin(a)
        if road_d(x, z) < 4 or (z < -60 and abs(x) < 50): continue
        y = vgh(x, z); r = rr.uniform(0.5, 1.15)
        for b_ in range(3):
            lumpy_into(B["shrub_n"], (x + rr.uniform(-0.5, 0.5), y + r * 0.45, z + rr.uniform(-0.5, 0.5)), r * rr.uniform(0.7, 1.0), 4000 + k * 3 + b_, sub=3, lump=0.2, sy=0.72)
    sx_ = np.array([rr.uniform(-520, 520) for _ in range(1900)]); sz_ = np.array([rr.uniform(-560, 260) for _ in range(1900)])
    sy_ = vgh(sx_, sz_)
    for k in range(len(sx_)):  # sparse shrubs over the slopes
        x, z, y = float(sx_[k]), float(sz_[k]), float(sy_[k])
        if not ok_spot(x, z, 3.5) or abs(z - float(river_z(np, np.array(x)))) < 9 or rr.random() < 0.35: continue
        r = rr.uniform(0.6, 1.5)
        for b_ in range(rr.randint(1, 3)):
            lumpy_into(B["shrub"], (x + rr.uniform(-0.8, 0.8), y + r * 0.35, z + rr.uniform(-0.8, 0.8)), r * rr.uniform(0.6, 1.0), 7000 + k * 3 + b_, sub=2, lump=0.2, sy=0.75)
    for key, bm in B.items():
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(f"veg_{key}"); bm.to_mesh(me); bm.free()
        me.materials.append(bark if key == "bark" else mats[key]); me.shade_smooth()
        link(bpy.data.objects.new(f"veg_{key}", me))
    print(f"[valley] trees: {n_pop} poplars, {n_fr} fruit trees", flush=True)


# ---- colour and life: wildflower drifts, footpaths, half-inflated balloons on the fields (dawn)
def build_flowers():
    import numpy as np
    cols = (("red", "#d8352b", 0.34), ("yellow", "#f1c232", 0.24), ("purple", "#9b5bc6", 0.14), ("white", "#f3efe7", 0.16), ("orange", "#ee8a2c", 0.06), ("pink", "#e57fa0", 0.06))
    mats = {n: mat_lm(col_mat(f"flower_{n}", srgb(c), 0.55), 512) for n, c, _ in cols}
    mats["stem"] = mat_lm(col_mat("flower_stem", srgb("#6d8c3a"), 0.7), 512)
    B = {n: bmesh.new() for n in mats}
    rr = _random.Random(77)
    def pick():
        q = rr.random()
        for n, c, w in cols:
            q -= w
            if q < 0: return n
        return "white"
    drifts = []
    for k in range(60):  # around the launch field (kept off the launch spot, the truck corner, the road)
        a = rr.uniform(0, 6.283); dd = rr.uniform(12, 85); x, z = dd * math.cos(a), dd * math.sin(a)
        if 16 < x < 28 or math.hypot(x - 12, z - 19) < 7 or math.hypot(x + 15, z + 9) < 7: continue
        drifts.append((x, z, rr.uniform(1.5, 3.5), rr.randint(30, 60), 0.09))
    P = _VG["road"][0]
    for k in range(0, len(P), 9):  # verges of the road
        x, z = P[k]
        if abs(z) > 160 or rr.random() < 0.4: continue
        side = rr.choice((-1, 1)); drifts.append((x + side * 3.8, z, 1.2, 25, 0.09))
    for k in range(26):  # meadows on the floodplain (seen from the balloon: bigger heads, bigger drifts)
        x = rr.uniform(-200, 260); zr = float(river_z(np, np.array(x))); z = zr + rr.choice((1, -1)) * rr.uniform(22, 60)
        if -205 < x < -25 and z < zr - 20: continue
        drifts.append((x, z, rr.uniform(4, 8), rr.randint(90, 150), 0.2))
    for (x0, z0, R, n, hs) in drifts:
        main = pick()
        for k in range(n):
            x, z = x0 + rr.gauss(0, R * 0.45), z0 + rr.gauss(0, R * 0.45)
            c = main if rr.random() < 0.8 else pick()
            r = hs * rr.uniform(0.55, 1.0); gy = vgh(x, z); hh = rr.uniform(0.18, 0.42) * (1.4 if hs > 0.15 else 1.0)
            la = rr.uniform(0, 6.283); lx, lz = 0.08 * hh * math.cos(la), 0.08 * hh * math.sin(la)
            tx_, tz_ = -math.sin(la) * 0.012, math.cos(la) * 0.012
            B["stem"].faces.new([B["stem"].verts.new(E(x - tx_, gy - 0.02, z - tz_)), B["stem"].verts.new(E(x + tx_, gy - 0.02, z + tz_)), B["stem"].verts.new(E(x + lx, gy + hh, z + lz))])
            C_ = E(x + lx, gy + hh + r * 0.3, z + lz)
            res = bmesh.ops.create_icosphere(B[c], subdivisions=2, radius=r, matrix=Matrix.Translation(C_))
            for v in res["verts"]: v.co.z = C_.z + (v.co.z - C_.z) * 0.42
    for n_, bm in B.items():
        me = bpy.data.meshes.new(f"flowers_{n_}"); bm.to_mesh(me); bm.free(); me.materials.append(mats[n_]); link(bpy.data.objects.new(f"flowers_{n_}", me))


PATHS = [[(6, -40), (10, -58), (4, -76), (-8, -88)], [(60, -64), (110, -62), (165, -66)]]


def build_paths():
    """footpaths: narrow dirt ribbons draped on the terrain (pieces of ~10 m: lightmap islands)"""
    import numpy as np
    mat = tex_mat("path_dirt", "dirt", 2.5, paint="#d8c09b", pk=0.55, disp=True)
    xs = np.arange(-250, 230, 6.0)
    paths = PATHS + [[(float(x), float(river_z(np, np.array(x)) + 33 + 4 * math.sin(x / 37.0))) for x in xs]]
    xs2 = np.arange(-170, 10, 6.0)
    paths.append([(float(x), float(river_z(np, np.array(x)) - 14 - 3 * math.sin(x / 29.0))) for x in xs2])
    P = _VG["road"][0]
    for pi, cps in enumerate(paths):
        cp = [Vector((a, b)) for a, b in cps]; pts = []
        for i in range(len(cp) - 1):
            p0, p1, p2, p3 = cp[max(0, i - 1)], cp[i], cp[i + 1], cp[min(len(cp) - 1, i + 2)]
            n = max(2, int((p2 - p1).length / 1.5))
            for k in range(n):
                t = k / n; pts.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        pts.append(cp[-1])
        V, F, piece = [], [], 0
        def flush():
            nonlocal V, F, piece
            if F: mesh_np(f"FLOOR_path{pi}_{piece}", np.array(V), F, mat); piece += 1
            V, F = [], []
        for i, p in enumerate(pts):
            if float(np.min(np.hypot(P[:, 0] - p.x, P[:, 1] - p.y))) < 3.2: flush(); continue
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            t = (b - a).normalized(); nrm = Vector((-t.y, t.x))
            for o in (-0.8, 0.8):
                q = p + nrm * o; V.append((q.x, vgh(q.x, q.y) + 0.07, q.y))
            if len(V) >= 4: F.append((len(V) - 4, len(V) - 3, len(V) - 1, len(V) - 2))
            if len(V) >= 16:
                last = V[-2:]; flush(); V = list(last)
        flush()


def build_lying_balloons():
    """dawn: crews cold-inflating balloons on the neighbouring fields: half-filled envelopes lying on their sides (gores
    in two bright colours), the basket on its side at the mouth, an inflator fan behind it"""
    import numpy as np
    pairs = [("#d63c2c", "#f4c24a"), ("#2f6db0", "#f1ece2"), ("#3e9a5a", "#f08a2c"), ("#8a4bb0", "#f29ab4"), ("#1f8a8a", "#f2d04a")]
    spots = [(-112.0, 38.0, 0.6), (128.0, 70.0, -0.4), (-58.0, 168.0, 1.9), (96.0, 205.0, 2.6), (182.0, -18.0, -1.2)]
    cm = {}
    def cmat(c):
        if c not in cm: cm[c] = col_mat(f"lyb_{c[1:]}", srgb(c), 0.5)
        return cm[c]
    wick = bpy.data.materials.get("basket_wicker") or wicker_img("basket_wicker")
    pad = bpy.data.materials.get("basket_pad") or leather_mat("basket_pad", "#5e3c24", seed=3, size=0.5, rough=0.62)
    fanr = bpy.data.materials.get("fan_frame") or col_mat("fan_frame", srgb("#c4472c"), 0.45)
    fanb = bpy.data.materials.get("fan_black") or col_mat("fan_black", srgb("#1e1f22"), 0.5)
    G, S, NT, L = 24, 4, 34, 19.0
    for k, ((x, z, yaw), (ca, cb)) in enumerate(zip(spots, pairs)):
        with Grp() as g:
            bm = bmesh.new(); rings = []
            NA = G * S
            for i in range(NT + 1):
                t = i / NT; xl = t * L
                r = env_r(t) * 0.52 * (0.45 + 0.55 * min(1.0, t * 4.0))
                ring = []
                for kk in range(NA):
                    th = 2 * math.pi * kk / NA
                    sg = (th * G / (2 * math.pi)) % 1.0
                    rb = r * (1 + 0.05 * math.sin(math.pi * sg)) * (1 + 0.045 * math.sin(xl * 1.1 + th * 3 + k))
                    yy = max(0.05 + 0.03 * math.sin(th * 7 + xl), rb * (0.5 + 0.72 * math.sin(th)))
                    ring.append(bm.verts.new(E(xl, yy, rb * math.cos(th) * 1.18)))
                rings.append(ring)
            for i in range(NT):
                for kk in range(NA):
                    f = bm.faces.new([rings[i][kk], rings[i][(kk + 1) % NA], rings[i + 1][(kk + 1) % NA], rings[i + 1][kk]]); f.material_index = (kk // S) % 2
            tip = bm.verts.new(E(L + 0.2, 0.6, 0))
            for kk in range(NA): bm.faces.new([rings[-1][kk], tip, rings[-1][(kk + 1) % NA]])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            mesh_obj(f"lyenv{k}", bm, [cmat(ca), cmat(cb)], sharp=70)
            slab(f"lybask{k}", (-1.5, 0.6, 0), (1.15, 1.15, 1.15), wick, bevel=0.08)
            slab(f"lybrim{k}", (-0.9, 0.6, 0), (0.1, 1.22, 1.22), pad, bevel=0.04)
            for sy_ in (-1, 1):
                for sz in (-1, 1): tube_path(f"lyup{k}{sy_}{sz}", [(-0.95, 0.6 + sy_ * 0.45, sz * 0.45), (0.1, 0.6 + sy_ * 0.38, sz * 0.38)], 0.03, pad, seg=6)
            fr = [(E(-4.2, 0.95 + 0.8 * math.sin(a), 0.8 * math.cos(a)), edir(0, math.sin(a), math.cos(a)), edir(1, 0, 0)) for a in [2 * math.pi * q / 32 for q in range(32)]]
            sweep(f"lyfan{k}", [(0.05 * math.cos(2 * math.pi * q / 8), 0.05 * math.sin(2 * math.pi * q / 8)) for q in range(8)], fr, fanr, closed=True)
            slab(f"lyfanm{k}", (-4.7, 0.62, 0), (0.55, 0.45, 0.48), fanb, bevel=0.03)
        g.place((x, vgh(x, z), z), yaw)
    NOTES["fieldBalloons"] = [[x, round(vgh(x, z), 2), z] for (x, z, _y) in spots]


def build_sky_dome(disp):
    """the painted sky as geometry the engine shows: RT_sky, a sphere (radius 1100, inward, equirect UVs) with the sky
    image as base colour and emission; hidden in the Cycles stills (the world shows the same image there)"""
    import numpy as np
    H, W, _ = disp.shape
    im = bpy.data.images.new(f"sky_{VTIME}", W, H, alpha=False)
    px = np.ones((H, W, 4), dtype=np.float32); px[..., :3] = disp; im.pixels.foreach_set(px.ravel())
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    path = os.path.join(OUT, "tex", f"sky_{VTIME}.png"); im.filepath_raw = path; im.file_format = "PNG"; im.save()
    m = bpy.data.materials.new("sky_dome"); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = im
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); nt.links.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 1.0
    b.inputs["Roughness"].default_value = 1.0
    m["tex_size"] = 0; m["mist"] = 1  # (keep its UVs; no preview haze)
    NU, NV, R = 96, 48, 1100.0
    verts, uvs = [], []
    for j in range(NV + 1):
        v = j / NV; el = (v - 0.5) * math.pi
        for i in range(NU + 1):
            u = i / NU; az = (u - 0.5) * 2 * math.pi
            verts.append((R * math.cos(el) * math.cos(az), R * math.cos(el) * math.sin(az), R * math.sin(el))); uvs.append((u, v))
    faces = [((j + 1) * (NU + 1) + i, (j + 1) * (NU + 1) + i + 1, j * (NU + 1) + i + 1, j * (NU + 1) + i) for j in range(NV) for i in range(NU)]
    me = bpy.data.meshes.new("RT_sky"); me.from_pydata(verts, [], faces); me.update(); me.materials.append(m)
    uvl = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices: uvl.data[li].uv = uvs[me.loops[li].vertex_index]
    ob = link(bpy.data.objects.new("RT_sky", me)); ob.hide_render = True; ghost(ob)
    NOTES["sky"].update({"mesh": "RT_sky", "radius": R, "image": f"tex/sky_{VTIME}.png (embedded in set.glb)",
                         "draw": "unlit (its emissive map), fog off, depthWrite off, drawn first, centred on the camera; hide the engine's own sky dome"})


# ---- the launch field: pickup and trailer, inflator fan, spare cylinders, a packed second balloon, windsock, fence,
# the power line, tyre tracks, worn patches, rocks and boulders
def pickup(p, paint, trim, glass, tyre, rim, lamp):
    """a pickup (forward = +x, base at y 0): bed, cab with glass, hood, grille, lamps, bumpers, wheels, roof rack"""
    with Grp() as g:
        slab(f"{p}_bedfloor", (-1.55, 0.78, 0), (2.1, 0.08, 1.62), trim, bevel=0.02)
        for sz in (-1, 1): slab(f"{p}_bedside{sz}", (-1.55, 1.0, sz * 0.86), (2.1, 0.5, 0.08), paint, bevel=0.03)
        slab(f"{p}_tailgate", (-2.62, 1.0, 0), (0.08, 0.5, 1.8), paint, bevel=0.03)
        slab(f"{p}_bedfront", (-0.48, 1.0, 0), (0.08, 0.5, 1.8), paint, bevel=0.03)
        slab(f"{p}_lower", (0.5, 0.82, 0), (2.0, 0.62, 1.84), paint, bevel=0.08)
        slab(f"{p}_cab", (0.12, 1.5, 0), (1.25, 0.72, 1.72), paint, bevel=0.1)
        slab(f"{p}_ws", (0.82, 1.48, 0), (0.06, 0.6, 1.56), glass, bevel=0.02, tilt=0.55)
        for sz in (-1, 1):
            slab(f"{p}_sidewin{sz}", (0.15, 1.52, sz * 0.865), (1.05, 0.48, 0.02), glass, bevel=0.01)
            slab(f"{p}_mirror{sz}", (0.72, 1.4, sz * 1.0), (0.08, 0.16, 0.12), trim, bevel=0.02)
            slab(f"{p}_handle{sz}", (0.2, 1.12, sz * 0.925), (0.16, 0.03, 0.02), trim, bevel=0.008)
        slab(f"{p}_rearwin", (-0.5, 1.55, 0), (0.02, 0.38, 1.3), glass, bevel=0.01)
        slab(f"{p}_hood", (1.85, 1.0, 0), (1.3, 0.34, 1.8), paint, bevel=0.1, tilt=-0.05)
        slab(f"{p}_grille", (2.51, 0.86, 0), (0.06, 0.32, 1.3), trim, bevel=0.02)
        for sz in (-1, 1): slab(f"{p}_lamp{sz}", (2.5, 0.98, sz * 0.7), (0.06, 0.14, 0.26), lamp, bevel=0.02)
        slab(f"{p}_bumperF", (2.58, 0.55, 0), (0.16, 0.18, 1.86), trim, bevel=0.04)
        slab(f"{p}_bumperR", (-2.68, 0.58, 0), (0.12, 0.14, 1.8), trim, bevel=0.03)
        for (x, sz) in ((1.55, 1), (1.55, -1), (-1.65, 1), (-1.65, -1)):
            disc(f"{p}_tyre{x}{sz}", (x, 0.39, sz * 0.82), 0.39, 0.27, tyre, axis="z", seg=28)
            disc(f"{p}_rim{x}{sz}", (x, 0.39, sz * 0.96), 0.22, 0.02, rim, axis="z", seg=20)
            slab(f"{p}_arch{x}{sz}", (x, 0.82, sz * 0.9), (1.0, 0.08, 0.1), trim, bevel=0.03)
        slab(f"{p}_rack", (0.12, 1.9, 0), (1.0, 0.06, 1.5), trim, bevel=0.02)
    return g


def gas_cyl(p, mat, cover, brass):
    with Grp() as g:
        lathe(f"{p}_body", [(0.0, 0.0), (0.15, 0.0), (0.16, 0.03), (0.16, 0.74), (0.14, 0.8), (0.09, 0.83), (0.0, 0.84)], (0, 0, 0), mat, seg=24)
        lathe(f"{p}_cover", [(0.0, 0.06), (0.168, 0.06), (0.168, 0.6), (0.0, 0.6)], (0, 0, 0), cover, seg=24)
        lathe(f"{p}_collar", [(0.0, 0.8), (0.1, 0.8), (0.1, 0.92), (0.085, 0.92), (0.085, 0.84), (0.0, 0.84)], (0, 0, 0), mat, seg=20)
        disc(f"{p}_valve", (0, 0.88, 0), 0.026, 0.06, brass, axis="y", seg=12)
    return g


def build_field():
    import numpy as np
    rr = _random.Random(17)
    paint = col_mat("truck_paint", srgb("#ebe5d8"), 0.38)
    trim = col_mat("truck_trim", srgb("#2c2d30"), 0.6)
    glass = col_mat("truck_glass", srgb("#1f2a33"), 0.1)
    tyre = col_mat("tyre_v", srgb("#222326"), 0.92)
    rim = col_mat("rim_v", srgb("#b9bec6"), 0.35, 0.6)
    lamp = col_mat("lens_lamp_v", srgb("#f2eee2"), 0.2)
    steel = brushed_mat("cyl_steel", "#d4d7db", metal=0.7, rough=0.3, seed=12)
    cover = leather_mat("cyl_cover", "#7a3a2a", seed=13, size=0.4, rough=0.7)
    brass = col_mat("cyl_brass", srgb("#c8963e"), 0.32, 0.7)
    wood = wood_mat("fence_wood", "#8a7458", "#5e4c3a", size=1.0, seed=14, amp=1.3)
    pole_w = wood_mat("pole_wood", "#6e5640", "#4a3828", size=1.4, seed=15, amp=1.2)
    wire = col_mat("wire", srgb("#26282b"), 0.5)
    insul = col_mat("insulator", srgb("#cfd6d2"), 0.25)
    fanr = col_mat("fan_frame", srgb("#c4472c"), 0.45)
    fanb = col_mat("fan_black", srgb("#1e1f22"), 0.5)
    sock_o = col_mat("sock_orange", srgb("#e8682a"), 0.6); sock_w = col_mat("sock_white", srgb("#efe9df"), 0.6)
    wick = bpy.data.materials.get("basket_wicker") or wicker_img("basket_wicker")
    pad = bpy.data.materials.get("basket_pad") or leather_mat("basket_pad", "#5e3c24", seed=3, size=0.5, rough=0.62)
    folds = [col_mat("fold_a", srgb("#2f6d8f"), 0.5), col_mat("fold_b", srgb("#efe6d2"), 0.5), col_mat("fold_c", srgb("#cf4a33"), 0.5)]
    strap = col_mat("fold_strap", srgb("#2a2b2e"), 0.7)
    track = tex_mat("tyre_track", "dirt", 1.6, paint="#a8916f", pk=0.6, disp=True)
    patch = tex_mat("worn_patch", "dirt", 2.5, paint="#bda783", pk=0.5, disp=True)
    # pickup + trailer by the field entrance, nose toward the valley
    tx, tz, trot = 15.5, 15.0, math.pi / 2 + 0.12
    pickup("truck", paint, trim, glass, tyre, rim, lamp).place((tx, vgh(tx, tz), tz), trot)
    fx, fz = math.cos(trot), -math.sin(trot)
    with Grp() as tg:
        slab("trl_bed", (0, 0.62, 0), (3.2, 0.1, 1.7), trim, bevel=0.02)
        for sz in (-1, 1): slab(f"trl_side{sz}", (0, 0.86, sz * 0.84), (3.2, 0.4, 0.05), wood, bevel=0.015)
        slab("trl_front", (1.58, 0.86, 0), (0.05, 0.4, 1.7), wood, bevel=0.015)
        slab("trl_bar", (2.4, 0.45, 0), (1.7, 0.08, 0.08), trim, bevel=0.015)
        for sz in (-1, 1):
            disc(f"trl_tyre{sz}", (0, 0.33, sz * 0.98), 0.33, 0.2, tyre, axis="z", seg=24)
            disc(f"trl_rim{sz}", (0, 0.33, sz * 1.09), 0.18, 0.02, rim, axis="z", seg=18)
            slab(f"trl_guard{sz}", (0, 0.72, sz * 0.98), (0.8, 0.04, 0.28), trim, bevel=0.01)
        for k in range(2):
            gas_cyl(f"trl_cyl{k}", steel, cover, brass).place((-0.5 + k * 0.38, 0.85, -0.2), 0.0, pre=Matrix.Rotation(math.pi / 2, 4, "Y"))
        slab("trl_crate", (0.9, 0.95, 0.35), (0.7, 0.55, 0.6), wood, bevel=0.02)
    tlx, tlz = tx - fx * 6.2, tz - fz * 6.2
    tg.place((tlx, vgh(tlx, tlz), tlz), trot)
    mark("truck", (tx, vgh(tx, tz), tz))
    for k, (x, z) in enumerate(((11.6, 18.9), (12.0, 19.3), (11.3, 19.4), (12.4, 18.8))):  # spare cylinders, one on its side
        gas_cyl(f"gcyl{k}", steel, cover, brass).place((x, vgh(x, z), z), rr.uniform(0, 6.28))
    gas_cyl("gcyl_lie", steel, cover, brass).place((10.6, vgh(10.6, 18.2) + 0.168, 18.2), 0.4, pre=Matrix.Rotation(math.pi / 2, 4, "X"))
    mark("cylinders", (11.8, 0, 19.1))
    with Grp() as fg:  # inflator fan, idle, aimed at the basket spot
        fr = [(E(0, 0.95 + 0.82 * math.sin(a), 0.82 * math.cos(a)), edir(0, math.sin(a), math.cos(a)), edir(1, 0, 0)) for a in [2 * math.pi * k / 48 for k in range(48)]]
        sweep("fan_ring", [(0.05 * math.cos(2 * math.pi * k / 10), 0.05 * math.sin(2 * math.pi * k / 10)) for k in range(10)], fr, fanr, closed=True)
        for k in range(8):
            a = 2 * math.pi * k / 8
            tube_path(f"fan_guard{k}", [(0.18, 0.95, 0), (0.18, 0.95 + 0.8 * math.sin(a), 0.8 * math.cos(a))], 0.008, fanb, seg=5)
        for k in range(5):
            th = 2 * math.pi * k / 5
            slab(f"fan_blade{k}", (0.05, 0.95 + 0.34 * math.sin(th), 0.34 * math.cos(th)), (0.02, 0.5, 0.2), fanb, bevel=0.01).rotation_euler = (math.pi / 2 - th, 0, 0)
        disc("fan_hub", (0.06, 0.95, 0), 0.1, 0.16, fanb, axis="x", seg=16)
        slab("fan_motor", (-0.42, 0.62, 0), (0.55, 0.45, 0.48), fanr, bevel=0.04)
        slab("fan_tank", (-0.42, 0.92, 0), (0.42, 0.16, 0.34), fanb, bevel=0.04)
        for sz in (-1, 1):
            tube_path(f"fan_leg{sz}", [(0.0, 0.14, sz * 0.6), (0.0, 0.95, sz * 0.84)], 0.025, fanr, seg=8)
            disc(f"fan_wheel{sz}", (-0.55, 0.14, sz * 0.4), 0.14, 0.07, tyre, axis="z", seg=16)
        slab("fan_frame", (-0.25, 0.14, 0), (1.0, 0.05, 1.2), fanr, bevel=0.02)
    fg.place((-7.2, vgh(-7.2, 2.6), 2.6), -0.25)
    mark("fan", (-7.2, 0, 2.6))
    # the second balloon, packed: a long roll of envelope (stripes along it), straps every ~2 m, its basket on its side
    path = [(-9.5 - 1.05 * k, 0.0, -7.5 - 0.42 * k + 0.35 * math.sin(k * 0.6)) for k in range(14)]
    prof = 18
    bm = bmesh.new(); rings = []
    for i, p in enumerate(path):
        a, b = Vector(path[max(0, i - 1)]), Vector(path[min(len(path) - 1, i + 1)])
        t = (b - a).normalized(); A_ = t.cross(Vector((0, 1, 0))).normalized()
        taper = 1.0 if i < len(path) - 3 else 0.6 + 0.4 * (len(path) - 1 - i) / 3
        w_, h_ = 0.78 * taper * (1 + 0.08 * math.sin(i * 2.3)), 0.36 * taper * (1 + 0.1 * math.cos(i * 1.7))
        gy = vgh(p[0], p[2])
        ring = []
        for k in range(prof):
            ang = 2 * math.pi * k / prof
            q = Vector(p) + A_ * (w_ * math.cos(ang) * (1 + 0.04 * math.sin(5 * ang + i))) + Vector((0, gy + h_ * (1 + math.sin(ang)) * (1 + 0.05 * math.sin(3 * ang + i)) + 0.02, 0))
            ring.append(bm.verts.new(E(*q)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(prof): bm.faces.new([r0[k], r0[(k + 1) % prof], r1[(k + 1) % prof], r1[k]]).material_index = (k // 3) % 3
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj("fold_env", bm, folds, sharp=70)
    for i in range(1, len(path) - 1, 2):
        p = path[i]
        slab(f"fold_strap{i}", (p[0], vgh(p[0], p[2]) + 0.4, p[2]), (0.07, 0.84, 1.7), strap, bevel=0.02, yaw=math.atan2(-(path[i + 1][2] - path[i - 1][2]), path[i + 1][0] - path[i - 1][0]))
    with Grp() as bg:
        slab("fbasket", (0, 0.575, 0), (1.15, 1.15, 1.15), wick, bevel=0.1)
        slab("fbasket_rim", (0, 1.16, 0), (1.22, 0.1, 1.22), pad, bevel=0.05)
        for sx in (-1, 1):
            for sz in (-1, 1): tube_path(f"fbasket_up{sx}{sz}", [(sx * 0.48, 1.0, sz * 0.48), (sx * 0.4, 2.0, sz * 0.4)], 0.032, pad, seg=8)
        ring_tube("fbasket_frame", rrect(0.42, 0.42, 0.05, 3), 2.0, 0.02, steel)
    bg.place((-6.6, vgh(-6.6, -6.9) + 0.6, -6.9), 0.4, pre=Matrix.Rotation(-math.pi / 2, 4, "Y"))
    mark("envelope2", (-15.0, 0, -10.0))
    # windsock on a pole
    tube_path("sock_pole", [(9.0, vgh(9.0, -22.0) - 0.2, -22.0), (9.0, vgh(9.0, -22.0) + 6.45, -22.0)], 0.045, steel, seg=10)
    with Grp() as sg:
        for k in range(4):
            lathe(f"sock{k}", [(0.0, k * 0.5), (0.3 - 0.04 * k, k * 0.5), (0.3 - 0.04 * (k + 1), (k + 1) * 0.5), (0.0, (k + 1) * 0.5)], (0, 0, 0), sock_o if k % 2 == 0 else sock_w, seg=16)
        ring_tube("sock_ring", [(0.31 * math.cos(a), 0.31 * math.sin(a)) for a in [2 * math.pi * i / 16 for i in range(16)]], 0.0, 0.015, steel)
    sg.place((9.0, vgh(9.0, -22.0) + 6.3, -22.0), 0.5, pre=Matrix.Rotation(math.radians(112), 4, "Y"))
    mark("windsock", (9.0, 0, -22.0))
    # fence along the road (between the road and the field), a gap at the entrance
    zz = 62.0
    fx_ = lambda z: 20.6 + 0.0004 * z * z
    while zz > -46:
        if not (4.0 < zz < 17.0):
            x = fx_(zz); y = vgh(x, zz)
            box(f"fpost{zz:.1f}", 0.13, 1.25, 0.13, (x, y - 0.1, zz), wood, bevel=0.02, rot_y=rr.uniform(-0.1, 0.1))
            z2 = zz - 2.4
            if not (4.0 < z2 < 17.0) and z2 > -46:
                for ry in (0.45, 0.92):
                    tube_path(f"frail{zz:.1f}{ry}", [(x + 0.07, y + ry, zz), (fx_(z2) + 0.07, vgh(fx_(z2), z2) + ry, z2)], 0.045, wood, seg=6)
        zz -= 2.4
    # the power line: wooden poles along the road on the field's right, three sagging conductors
    poles = [(31.0, 66.0), (32.0, 18.0), (34.0, -30.0), (56.0, -70.0), (92.0, -94.0), (112.0, -132.0)]
    tops = []
    for k, (x, z) in enumerate(poles):
        a = Vector(poles[max(0, k - 1)]); b = Vector(poles[min(len(poles) - 1, k + 1)])
        dv = (b - a).normalized(); yaw = math.atan2(-dv.y, dv.x)  # the arm (local z) across the line
        y = vgh(x, z)
        with Grp() as pg:
            cyl(f"pole{k}", 0.15, 10.2, (0, -1.0, 0), pole_w, seg=14, r2=0.11)
            box(f"pole_arm{k}", 0.11, 0.12, 2.3, (0, 8.45, 0), pole_w, bevel=0.015)
            for sz in (-1, 1): tube_path(f"pole_brace{k}{sz}", [(0, 7.6, 0.0), (0, 8.42, sz * 0.75)], 0.03, pole_w, seg=6)
            for sz in (-1.0, 0.0, 1.0):
                lathe(f"pole_ins{k}{sz}", [(0.0, 0.0), (0.04, 0.0), (0.07, 0.04), (0.04, 0.07), (0.07, 0.11), (0.04, 0.14), (0.06, 0.17), (0.03, 0.2), (0.0, 0.2)], (0, 8.57 if sz else 9.17, sz * 0.95), insul, seg=12)
            if k == 1:
                xm = col_mat("xfmr", srgb("#8a8f94"), 0.45, 0.4)
                cyl("pole_xfmr", 0.3, 0.85, (0.34, 6.3, 0), xm, seg=18); cyl("pole_xfmr_lid", 0.32, 0.06, (0.34, 7.15, 0), xm, seg=18)
        pg.place((x, y, z), yaw)
        s_, c_ = math.sin(yaw), math.cos(yaw)  # local +z -> engine (sin yaw, cos yaw)
        tops.append([Vector((x + s_ * o, y + hy, z + c_ * o)) for (o, hy) in ((-0.95, 8.77), (0.0, 9.37), (0.95, 8.77))])
    for k in range(len(poles) - 1):
        for c in range(3):
            a, b = tops[k][c], tops[k + 1][c]; sag = 0.022 * (b - a).length
            tube_path(f"cable{k}{c}", [tuple(a.lerp(b, t) - Vector((0, sag * 4 * t * (1 - t), 0))) for t in [i / 28 for i in range(29)]], 0.013, wire, seg=6)
    mid = (tops[1][1] + tops[2][1]) / 2
    mark("powerline", (float(mid.x), vgh(float(mid.x), float(mid.z)), float(mid.z)))
    NOTES["powerline"] = {"poles": [[p[0], round(vgh(*p), 2), p[1]] for p in poles], "wireY": [8.77, 9.37], "sag": 0.022}
    # tyre tracks and worn patches: thin decals on the field
    def strip(name, pts, w, mat, lift=0.018):
        V, F = [], []
        for i, (x, z) in enumerate(pts):
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            ttx, ttz = b[0] - a[0], b[1] - a[1]; L = math.hypot(ttx, ttz) + 1e-9; nx_, nz_ = -ttz / L, ttx / L
            for o in (-w / 2, w / 2):
                px, pz = x + nx_ * o, z + nz_ * o; V.append((px, vgh(px, pz) + lift, pz))
            if i: F.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
        return mesh_np(name, np.array(V), F, mat)
    def bez(p0, p1, p2, p3, n):
        return [tuple((1 - t) ** 3 * Vector(p0) + 3 * (1 - t) ** 2 * t * Vector(p1) + 3 * (1 - t) * t * t * Vector(p2) + t ** 3 * Vector(p3)) for t in [i / n for i in range(n + 1)]]
    curves = [((23, 11), (12, 11), (4, 18), (-14, 30)), ((23, 9), (14, 6), (13, 4), (15.5, 12.0)), ((22, -20), (4, -14), (-12, 6), (-30, 4)), ((-40, 40), (-14, 18), (10, 30), (40, 44))]
    for k, cps in enumerate(curves):
        c = bez(*cps, 70)
        for o in (-0.8, 0.8):
            pts = []
            for i, (x, z) in enumerate(c):
                a, b = c[max(0, i - 1)], c[min(len(c) - 1, i + 1)]
                ttx, ttz = b[0] - a[0], b[1] - a[1]; L = math.hypot(ttx, ttz) + 1e-9
                pts.append((x - ttz / L * o, z + ttx / L * o))
            strip(f"FLOOR_track{k}_{int(o > 0)}", pts, 0.34, track, lift=0.006)
    for k, (cx, cz, R) in enumerate(()):  # (1.12: no worn-patch decals: their edges read as cut-outs at eye level)
        V = [(cx, vgh(cx, cz) + 0.012, cz)]; F = []
        n = 40
        for i in range(n):
            a = 2 * math.pi * i / n; rad = R * (1 + 0.22 * math.sin(3 * a + k) + 0.12 * math.sin(7 * a + 2 * k) + 0.06 * math.sin(13 * a))
            x, z = cx + rad * math.cos(a), cz + rad * math.sin(a); V.append((x, vgh(x, z) + 0.012, z))
        for i in range(n): F.append((0, 1 + (i + 1) % n, 1 + i))
        mesh_np(f"FLOOR_patch{k}", np.array(V), F, patch)
    # the crew's corner by the truck: a folding table with a coffee urn and cups, stacked crates, a rope coil, a ground tarp
    tablew = wood_mat("table_top", "#b58e62", "#7d5d3e", size=0.8, seed=16, boards=4)
    alu = col_mat("table_alu", srgb("#b8bcc2"), 0.35, 0.55)
    urn = col_mat("urn_red", srgb("#b8402e"), 0.4)
    cupm = col_mat("cup_white", srgb("#f1ece2"), 0.4)
    crate = wood_mat("crate_wood", "#a8865c", "#6f5536", size=0.6, seed=18, boards=3, amp=1.2)
    ropem = fabric_mat("rope_coil", "#cdb487", seed=19, size=0.15)
    tarp = fabric_mat("tarp_grey", "#5d6c78", seed=20, size=0.6)
    with Grp() as cg:
        slab("tbl_top", (0, 0.74, 0), (1.8, 0.04, 0.74), tablew, bevel=0.012)
        for sx in (-1, 1):
            for sz in (-1, 1): tube_path(f"tbl_leg{sx}{sz}", [(sx * 0.8, 0.0, sz * 0.3), (sx * 0.8, 0.72, sz * 0.3)], 0.016, alu, seg=6)
        lathe("tbl_urn", [(0.0, 0.0), (0.12, 0.0), (0.13, 0.04), (0.13, 0.36), (0.1, 0.4), (0.03, 0.42), (0.0, 0.43)], (-0.5, 0.76, 0.05), urn, seg=20)
        for k in range(6):
            lathe(f"tbl_cup{k}", [(0.0, 0.0), (0.03, 0.0), (0.04, 0.09), (0.036, 0.09), (0.026, 0.008), (0.0, 0.008)], (0.05 + (k % 3) * 0.12, 0.76, -0.12 + (k // 3) * 0.14), cupm, seg=12)
        slab("tbl_box", (0.6, 0.86, 0.1), (0.36, 0.22, 0.28), crate, bevel=0.01)
    cg.place((7.6, vgh(7.6, 21.0), 21.0), 0.3)
    for k, (x, y, z, r) in enumerate(((9.6, 0, 23.0, 0.1), (10.25, 0, 23.1, -0.05), (9.9, 0.5, 23.05, 0.2))):
        slab(f"crate{k}", (x, vgh(x, z) + y + 0.25, z), (0.6, 0.5, 0.45), crate, bevel=0.015, yaw=r)
    for k in range(5):
        ring_tube(f"rope{k}", [(4.6 + (0.34 - 0.03 * k) * math.cos(a), 19.2 + (0.34 - 0.03 * k) * math.sin(a)) for a in [2 * math.pi * i / 24 for i in range(24)]], vgh(4.6, 19.2) + 0.02 + 0.025 * k, 0.018, ropem, seg=6)
    with Grp() as tpg:
        slab("tarp", (0, 0.012, 0), (4.6, 0.024, 3.0), tarp, bevel=0.01)
        for k in range(3): slab(f"tarp_fold{k}", (1.6 - k * 0.12, 0.045 + k * 0.02, 0), (1.1, 0.03, 3.0), tarp, bevel=0.012)
    tpg.place((-13.5, vgh(-13.5, -4.0), -4.0), 0.4)
    # grass tufts: blades in clumps over the field (not on the launch spot, the truck corner, the packed balloon, the fan)
    blade = leaf_mat("grass_blade", "#c6b276", 7, size=0.4)
    bmg = bmesh.new()
    for k in range(2600):
        a = rr.uniform(0, 6.283); dd = 5.0 + 72 * math.sqrt(rr.random()); x, z = dd * math.cos(a), dd * math.sin(a)
        if 17 < x < 27 or math.hypot(x - 15.5, z - 17.5) < 6.5 or math.hypot(x + 15, z + 9) < 6 or math.hypot(x + 7.2, z - 2.6) < 1.6 or math.hypot(x - 8.5, z - 21.5) < 2.5: continue
        y = vgh(x, z); n = rr.randint(6, 12); hgt = rr.uniform(0.18, 0.5)
        for b_ in range(n):
            ba = rr.uniform(0, 6.283); lean = rr.uniform(0.15, 0.6); hh = hgt * rr.uniform(0.6, 1.1)
            bx, bz = x + 0.05 * math.cos(ba), z + 0.05 * math.sin(ba); tx_, tz_ = -math.sin(ba) * 0.018, math.cos(ba) * 0.018
            tip = (bx + math.cos(ba) * lean * hh, y + hh, bz + math.sin(ba) * lean * hh)
            bmg.faces.new([bmg.verts.new(E(bx - tx_, y - 0.02, bz - tz_)), bmg.verts.new(E(bx + tx_, y - 0.02, bz + tz_)), bmg.verts.new(E(*tip))])
    me = bpy.data.meshes.new("grass_tufts"); bmg.to_mesh(me); bmg.free(); me.materials.append(blade); link(bpy.data.objects.new("grass_tufts", me))
    # rocks and boulders around the field edges
    rk = tex_mat("field_rock", "worn_rock_natural_01", 1.6, paint="#cbb09a", pk=0.6, disp=True)
    bmr = bmesh.new()
    for k in range(70):
        a = rr.uniform(0, 6.283); dd = rr.uniform(14, 80); x, z = dd * math.cos(a), dd * math.sin(a)
        if (abs(x) < 9 and abs(z) < 9) or (17 < x < 27 and -50 < z < 70): continue
        r = rr.uniform(0.12, 0.45) if rr.random() < 0.8 else rr.uniform(0.6, 1.1)
        blob_into(bmr, (x, vgh(x, z) + r * 0.15, z), r, sy=0.6, sub=2, seed=100 + k, jit=0.22)
    bmesh.ops.recalc_face_normals(bmr, faces=bmr.faces)
    me = bpy.data.meshes.new("field_rocks"); bmr.to_mesh(me); bmr.free(); me.materials.append(rk); me.shade_smooth(); link(bpy.data.objects.new("field_rocks", me))
    bmb = bmesh.new()
    for k in range(16):
        a = rr.uniform(0, 6.283); dd = rr.uniform(44, 88); x, z = dd * math.cos(a), dd * math.sin(a)
        if 15 < x < 30: continue
        r = rr.uniform(0.6, 1.4)
        blob_into(bmb, (x, vgh(x, z) + r * 0.2, z), r, sy=0.7, sub=2, seed=300 + k, jit=0.26)
        if rr.random() < 0.6: blob_into(bmb, (x + r * 1.1, vgh(x + r * 1.1, z) + r * 0.1, z + r * 0.4), r * 0.45, sy=0.7, sub=1, seed=400 + k, jit=0.3)
    bmesh.ops.recalc_face_normals(bmb, faces=bmb.faces)
    me = bpy.data.meshes.new("boulders"); bmb.to_mesh(me); bmb.free(); me.materials.append(rk); link(bpy.data.objects.new("boulders", me))


def build_mist():
    """dawn ground mist: stacked transparent emissive planes over the valley (RT_: unbaked, no shadows), their alpha from
    the terrain (thick where the ground is well below the plane, gone where it rises through it, so intersections stay
    soft), stronger near the river, broken into cloud banks; one high layer pools in the far valleys between the mesas"""
    import numpy as np
    for k, (yp, amax, (x0, x1, z0, z1)) in enumerate(((-30.5, 0.52, (-520, 520, -560, -90)), (-26.0, 0.42, (-560, 560, -600, -80)), (-20.0, 0.3, (-600, 600, -650, -70)),
                                                    (-12.0, 0.22, (-700, 700, -720, -60)), (14.0, 0.34, (-1400, 1400, -1500, -560)))):
        W_, H_ = 1024, max(256, int(1024 * (z1 - z0) / (x1 - x0)))
        def fn(u, v, np, yp=yp, amax=amax, x0=x0, x1=x1, z0=z0, z1=z1, k=k):
            x = x0 + u * (x1 - x0); z = z1 - v * (z1 - z0)
            a = sstep(np, 0.0, 6.0 if k < 4 else 25.0, yp - vgh(x, z))
            a = a * (0.45 + 0.55 * np.exp(-((z - river_z(np, x)) / 140.0) ** 2))
            cl = sstep(np, -0.3, 0.45, fbm(np, x / 75.0, z / 55.0, 60 + k, 4) + 0.35 * fbm(np, x / 20.0, z / 16.0, 70 + k, 3))
            ed = sstep(np, 0, 0.08, u) * sstep(np, 1, 0.92, u) * sstep(np, 0, 0.08, v) * sstep(np, 1, 0.92, v)
            warm = sstep(np, -200, 500, x)[..., None]
            out = np.ones(u.shape + (4,))
            out[..., :3] = np.array(hx("#d9c6dc"))[None, None, :] * (1 - warm) + np.array(hx("#f6d9c4"))[None, None, :] * warm
            out[..., 3] = amax * a * cl * ed
            return out
        im = rgba_image(f"mist{k}", W_, H_, fn)
        m = bpy.data.materials.new(f"mist{k}"); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = im
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"]); nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 0.55
        b.inputs["Roughness"].default_value = 1.0
        try: b.inputs["Specular IOR Level"].default_value = 0.0
        except Exception: pass
        m["fit_uv"] = 2; m["mist"] = 1
        me = bpy.data.meshes.new(f"RT_mist{k}"); bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
        for v in bm.verts: v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), -((z0 + z1) / 2) + v.co.y * (z1 - z0), yp))
        bm.to_mesh(me); bm.free(); me.materials.append(m)
        ghost(link(bpy.data.objects.new(f"RT_mist{k}", me)))


def strip_unlit_maps():
    """before the export: the engine draws baked meshes as albedo x lightmap (MeshBasicMaterial), so normal and roughness
    maps (already in the bake) would only add megabytes to the GLB"""
    for m in bpy.data.materials:
        if not m.node_tree or m.get("mist"): continue
        for n in m.node_tree.nodes:
            if n.type != "BSDF_PRINCIPLED": continue
            for sock in ("Normal", "Roughness", "Metallic"):
                for l in list(n.inputs[sock].links): m.node_tree.links.remove(l)


def build_valley():
    import numpy as np
    PRE_EXPORT.append(strip_unlit_maps)
    NOTES["set"] = f"valley_{VTIME}"; NOTES["time"] = VTIME
    build_terrain(); print("[valley] terrain", flush=True)
    build_road(); build_river(); build_rocks(); print("[valley] rocks", flush=True)
    build_village()
    build_vegetation(); print("[valley] vegetation", flush=True)
    build_field(); print("[valley] field", flush=True)
    build_flowers(); build_paths()
    if VL["mist"]: build_mist(); build_lying_balloons()
    zr35 = float(river_z(np, np.array(35.0)))
    mark("field", (0, 0, 0)); mark("center", (0, 0, 0))
    mark("pilot", (-1.9, vgh(-1.9, 0.9), 0.9)); mark("tourist", (1.9, vgh(1.9, 0.9), 0.9))
    mark("river", (35.0, -33.7, zr35))
    mark("spires", (-92.0, vgh(-92.0, -168.0), -168.0))
    mark("road", (24.0, vgh(24.0, 10.0), 10.0)); mark("bluff", (10.0, vgh(10.0, -75.0), -75.0))
    NOTES["wide"] = {"pos": [14.0, 24.0, 52.0], "look": [-22.0, -14.0, -240.0], "fov": 50}
    NOTES["camBox"] = {"min": [-330, -30, -520], "max": [330, 200, 260]}
    NOTES["interior"] = False; NOTES["radius"] = 90
    NOTES["light"] = "valley"
    NOTES["water"] = {"y": -33.7, "mesh": "RIVER_water (emissive painted reflection)"}
    PREVIEW_VIEWS[:] = ["3.5,1.7,9.0,0,1.2,0,42", "10,125,70,-15,-25,-300,50", "12,2.2,10.0,32,6.0,14,55", "30,70,-70,35,-33,-168,50", "-70,30,-235,0,2,0,48", "60,6,-12,-120,10,-330,40"]


def _agx(c):
    """the engine's AgX fit (lib/three/baked.ts): scene-linear rgb -> display-linear rgb"""
    import numpy as np
    ins = np.array([[0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859]]).T
    outs = np.array([[1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294], [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]]).T
    c = ins @ c; c = np.log2(np.maximum(c, 1e-10)); c = np.clip((c + 12.47393) / (4.026069 + 12.47393), 0, 1)
    x2 = c * c; x4 = x2 * x2
    c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232
    c = outs @ c; return np.clip(np.maximum(c, 0) ** 2.2, 0, 1)


def sky_paint(bd, W=2048, H=1024):
    """the valley's sky as a display-referred equirect image (u = atan2(y, x) / 2pi + 0.5, v = asin(z) / pi + 0.5, Blender
    axes): dawn: deep blue zenith through lilac and pink to a peach / orange glow on the horizon around the sun disc and
    its halo, a pink Belt of Venus opposite, scattered clouds lit pink-gold from below; noon: a clean blue sky with white
    cumulus"""
    import numpy as np
    j, i = np.mgrid[0:H, 0:W].astype(np.float64); u = (i + 0.5) / W; v = (j + 0.5) / H
    az = (u - 0.5) * 2 * math.pi; el = (v - 0.5) * math.pi; eld = np.degrees(el)
    dx, dy, dz = np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)
    sd = np.clip(dx * bd.x + dy * bd.y + dz * bd.z, -1, 1); ang = np.degrees(np.arccos(sd))
    L_ = lambda h: np.array(srgb(h))
    def ramp(stops):
        out = np.zeros(eld.shape + (3,))
        for (e0, c0), (e1, c1) in zip(stops, stops[1:]):
            m = (eld >= e0) & (eld <= e1)
            t = np.clip((eld - e0) / (e1 - e0), 0, 1)[..., None]
            c0 = c0 if np.ndim(c0) == 3 else np.asarray(c0)[None, None, :]; c1 = c1 if np.ndim(c1) == 3 else np.asarray(c1)[None, None, :]
            out = np.where(m[..., None], c0 * (1 - t) + c1 * t, out)
        return out
    def mixw(a, b, w): return L_(a)[None, None, :] * (1 - w[..., None]) + L_(b)[None, None, :] * w[..., None]
    if VTIME == "dawn":
        warm = sstep(np, -0.35, 1.0, sd) ** 1.6
        sky = ramp([(-90, L_("#6e6478")), (-4, L_("#b9949f")), (0, mixw("#e6b9ae", "#f8ad6e", warm)), (3, mixw("#ddb4b6", "#f7bd8c", warm)), (9, mixw("#cdacc2", "#efb5a0", warm)),
                    (18, mixw("#a9a6ca", "#c9a9be", warm * 0.6)), (32, L_("#8090c6")), (55, L_("#5572b0")), (90, L_("#33508f"))])
        belt = np.exp(-((eld - 6) / 5.0) ** 2) * sstep(np, 0.2, -0.7, sd)  # the Belt of Venus opposite the sun
        sky = sky + belt[..., None] * (L_("#e8b2c0") - sky) * 0.35
        glow = 0.9 * np.exp(-ang / 0.9) + 0.5 * np.exp(-ang / 4.5) + 0.3 * np.exp(-ang / 15.0) + 0.22 * np.exp(-ang / 45.0) * np.exp(-np.abs(eld) / 10.0) + 0.3 * np.exp(-ang / 75.0) * np.exp(-np.abs(eld) / 7.0)
        sky = sky + glow[..., None] * L_("#ffc98e")[None, None, :]
        sky = np.where((ang < 0.55)[..., None], L_("#fff6e2")[None, None, :] * 1.0, sky)
        n1 = tnoise(np, u, v, 501, (4, 16), (14, 40), 40, 0.6); n2 = tnoise(np, u, v, 502, (18, 60), (40, 120), 40, 0.5)
        dv = 1.4 / 180.0
        n1u = tnoise(np, u, v + dv, 501, (4, 16), (14, 40), 40, 0.6); n2u = tnoise(np, u, v + dv, 502, (18, 60), (40, 120), 40, 0.5)
        band = sstep(np, 1.5, 5.0, eld) * sstep(np, 36.0, 16.0, eld)
        den = sstep(np, 0.6, 1.7, n1 + 0.45 * n2) * band; den_up = sstep(np, 0.6, 1.7, n1u + 0.45 * n2u) * band
        lit = np.clip(0.15 + np.clip(0.5 + (den_up - den) * 3.5, 0, 1) * (0.7 + 0.3 * warm), 0, 1)
        litc = mixw("#f4bcc2", "#ffc286", warm) * (1 + 0.3 * warm[..., None])
        shad = mixw("#aaa3c5", "#b89aaf", warm)
        cc = shad * (1 - lit[..., None]) + litc * lit[..., None]
        sky = sky * (1 - 0.92 * den[..., None]) + cc * 0.92 * den[..., None]
    else:
        sky = ramp([(-90, L_("#8c96a0")), (-4, L_("#c7d0d6")), (0, L_("#e1eaef")), (6, L_("#cbdcea")), (18, L_("#a6c5e4")), (40, L_("#72a1d7")), (90, L_("#3d71c0"))])
        glow = 0.9 * np.exp(-ang / 0.5) + 0.35 * np.exp(-ang / 3.0) + 0.12 * np.exp(-ang / 14.0)
        sky = sky + glow[..., None] * L_("#fff8ec")[None, None, :]
        # fair-weather cumulus: discrete clouds of Gaussian puffs with flat, grey-blue bases and white sunlit tops
        den = np.zeros(eld.shape); top = np.zeros(eld.shape)
        rc = _random.Random(611); azd = np.degrees(az)
        for c in range(80):
            az0 = rc.uniform(-180, 180); el0 = 2.5 + 26 * rc.random() ** 1.7; sz = (2.2 + 4.5 * rc.random()) * (1.15 - el0 / 60.0)
            puffs = [(max(-1.3 * sz, min(1.3 * sz, rc.gauss(0, sz * 0.7))), min(0.45 * sz, abs(rc.gauss(0, sz * 0.25))), sz * rc.uniform(0.34, 0.62)) for _ in range(rc.randint(6, 12))]
            ext = sz * 2.4 + 2
            j0 = max(0, int((el0 - 2 + 90) / 180 * H)); j1 = min(H, int((el0 + ext + 90) / 180 * H) + 1)
            for (ox, oy, r) in puffs:
                cw = max(0.2, math.cos(math.radians(el0)))
                i0 = int(((az0 + ox - r * 3 / cw + 180) / 360) * W); i1 = int(((az0 + ox + r * 3 / cw + 180) / 360) * W) + 1
                cols = np.arange(i0, i1) % W
                sub_e = eld[j0:j1][:, cols]; sub_a = azd[j0:j1][:, cols]
                daz = ((sub_a - (az0 + ox) + 180) % 360) - 180
                dd = ((daz * cw) ** 2 + (sub_e - (el0 + oy)) ** 2) / (r * r)
                puff = sstep(np, 1.0, 0.6, dd) * sstep(np, el0 - 0.2, el0 + 0.5, sub_e)
                cur = den[j0:j1][:, cols]
                lit_here = 0.55 * sstep(np, el0, el0 + sz * 0.7, sub_e) + 0.45 * sstep(np, el0 + oy - r * 0.7, el0 + oy + r * 0.5, sub_e)
                upd = puff > cur
                top[j0:j1, cols] = np.where(upd, lit_here, top[j0:j1][:, cols])
                den[j0:j1, cols] = np.maximum(cur, puff)
        den = np.clip(den, 0, 1)
        lit = 0.4 + 0.6 * top
        cc = L_("#aab6c9")[None, None, :] * (1 - lit[..., None]) + L_("#fdfdfc")[None, None, :] * lit[..., None]
        sky = sky * (1 - 0.95 * den[..., None]) + cc * 0.95 * den[..., None]
    sky = np.clip(sky, 0, 1)
    return np.where(sky <= 0.0031308, sky * 12.92, 1.055 * np.power(sky, 1 / 2.4) - 0.055).astype(np.float32)  # display sRGB


def sky_cam_image(disp):
    """the painted sky run back through AgX per pixel: what the Cycles world shows to camera rays"""
    import numpy as np
    H, W, _ = disp.shape
    tgt = np.clip(disp.reshape(-1, 3).astype(np.float64), 1e-4, 0.995) ** 2.2; sc = tgt * 0.8
    ins = np.array([[0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859]])
    outs = np.array([[1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294], [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]])
    def agx(cc):
        cc = cc @ ins; cc = np.log2(np.maximum(cc, 1e-10)); cc = np.clip((cc + 12.47393) / (4.026069 + 12.47393), 0, 1)
        x2 = cc * cc; x4 = x2 * x2
        cc = 15.5 * x4 * x2 - 40.14 * x4 * cc + 31.96 * x4 - 6.868 * x2 * cc + 0.4298 * x2 + 0.1191 * cc - 0.00232
        return np.clip(np.maximum(cc @ outs, 0) ** 2.2, 0, 1)
    for _ in range(45): sc = np.minimum(sc * (tgt / np.maximum(agx(sc), 1e-5)) ** 0.6, 60.0)
    im = bpy.data.images.new("sky_cam", W, H, float_buffer=True, alpha=False)
    px = np.ones((H * W, 4), dtype=np.float32); px[:, :3] = sc; im.pixels.foreach_set(px.ravel())
    return im


def agx_gain(hexcol):
    """the factor k that makes AgX(k * linear(hexcol)) as bright as hexcol"""
    import numpy as np
    w = np.array([0.2126, 0.7152, 0.0722]); tgt = float(w @ (np.array(hx(hexcol)) ** 2.2)); c = np.array(srgb(hexcol)); k = 1.0
    for _ in range(60): k *= (tgt / max(1e-5, float(w @ _agx(c * k)))) ** 0.7
    return k


def inv_agx(hexcol):
    """the scene-linear colour that Blender's AgX view (approximated by the engine's fit) displays as hexcol"""
    import numpy as np
    agx = _agx
    tgt = np.array(hx(hexcol)) ** 2.2
    s = np.array(srgb(hexcol)) * 0.6 + 1e-4
    for _ in range(80):
        s = s * (np.maximum(tgt, 1e-4) / np.maximum(agx(s), 1e-4)) ** 0.6
    return tuple(float(v) for v in s)


def light_valley():
    """a sky built on the engine's sky dome formula (camera rays: compensated for AgX so the preview shows the hex colours
    handed to the engine in set.json "sky"), a lighting sky (the same gradient, scene-linear) and the sun"""
    L = VL
    w = bpy.data.worlds.new("world"); SC.world = w; w.use_nodes = True
    nt = w.node_tree; N_, K_ = nt.nodes, nt.links
    out = N_["World Output"]; bgL = N_["Background"]
    d = Vector(L["sun"]).normalized(); bd = Vector((d.x, -d.z, d.y))
    tc = N_.new("ShaderNodeTexCoord"); nrm = N_.new("ShaderNodeVectorMath"); nrm.operation = "NORMALIZE"; K_.new(tc.outputs["Generated"], nrm.inputs[0])
    sep = N_.new("ShaderNodeSeparateXYZ"); K_.new(nrm.outputs["Vector"], sep.inputs[0]); h = sep.outputs["Z"]
    def mr(v, a, b):
        m = N_.new("ShaderNodeMapRange"); m.interpolation_type = "SMOOTHSTEP"; K_.new(v, m.inputs["Value"])
        m.inputs["From Min"].default_value = a; m.inputs["From Max"].default_value = b; return m.outputs["Result"]
    def mth(op, a, b=None):
        m = N_.new("ShaderNodeMath"); m.operation = op
        for i_, x in enumerate((a, b)):
            if x is None: continue
            if isinstance(x, (int, float)): m.inputs[i_].default_value = x
            else: K_.new(x, m.inputs[i_])
        return m.outputs[0]
    def mix(fac, a, b):
        m = N_.new("ShaderNodeMix"); m.data_type = "RGBA"; K_.new(fac, m.inputs[0])
        for i_, x in ((6, a), (7, b)):
            if isinstance(x, tuple): m.inputs[i_].default_value = (*x, 1)
            else: K_.new(x, m.inputs[i_])
        return m.outputs[2]
    t_up = mth("POWER", mr(h, 0.0, 0.85), 0.7); t_dn = mr(h, 0.0, -0.2)
    hor_f = mr(mth("SUBTRACT", 1.0, mth("ABSOLUTE", h)), -0.1, 0.25)
    dot = N_.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"; K_.new(nrm.outputs["Vector"], dot.inputs[0]); dot.inputs[1].default_value = tuple(bd)
    sd = mth("MAXIMUM", dot.outputs["Value"], 0.0)
    halo = mth("ADD", mth("MULTIPLY", mth("POWER", sd, 24.0), 0.3), mth("MULTIPLY", mth("MULTIPLY", mth("POWER", sd, 4.0), hor_f), 0.12))
    disc_ = mth("MULTIPLY", mth("POWER", sd, 220.0), 0.55)
    up_ = mth("GREATER_THAN", h, 0.0)
    def sky(top, hor, bot, sunc, glow, with_disc):
        c = mix(up_, mix(t_dn, hor, bot), mix(t_up, hor, top))
        g = mth("MULTIPLY", mth("ADD", halo, disc_) if with_disc else halo, glow)
        add = N_.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"; K_.new(g, add.inputs[0]); K_.new(c, add.inputs[6]); add.inputs[7].default_value = (*sunc, 1)
        return add.outputs[2]
    k = L["skyK"]
    lin = lambda hexc, s=1.0: tuple(v * s for v in srgb(hexc))
    c_light = sky(lin(L["top"], k), lin(L["horizon"], k), lin(L["bottom"], k * 0.6), lin(L["sunCol"], k), L["glow"] * 0.6, False)
    # camera rays: the engine's sky (display-linear mix of the hex colours + the sun glow) painted into an equirect image
    # with AgX inverted per pixel, so the preview shows the sky the engine will draw
    sep2 = N_.new("ShaderNodeSeparateXYZ"); K_.new(nrm.outputs["Vector"], sep2.inputs[0])
    uu = mth("ADD", mth("DIVIDE", mth("ARCTAN2", sep2.outputs["Y"], sep2.outputs["X"]), 2 * math.pi), 0.5)
    vv = mth("ADD", mth("DIVIDE", mth("ARCSINE", sep2.outputs["Z"]), math.pi), 0.5)
    cxyz = N_.new("ShaderNodeCombineXYZ"); K_.new(uu, cxyz.inputs[0]); K_.new(vv, cxyz.inputs[1])
    disp = sky_paint(bd)
    ti = N_.new("ShaderNodeTexImage"); ti.image = sky_cam_image(disp); ti.extension = "EXTEND"; K_.new(cxyz.outputs[0], ti.inputs["Vector"])
    bgC = N_.new("ShaderNodeBackground"); K_.new(ti.outputs["Color"], bgC.inputs["Color"]); bgC.inputs["Strength"].default_value = 1.0
    K_.new(c_light, bgL.inputs["Color"]); bgL.inputs["Strength"].default_value = 1.0
    lp = N_.new("ShaderNodeLightPath"); ms = N_.new("ShaderNodeMixShader")
    K_.new(lp.outputs["Is Camera Ray"], ms.inputs[0]); K_.new(bgL.outputs[0], ms.inputs[1]); K_.new(bgC.outputs[0], ms.inputs[2]); K_.new(ms.outputs[0], out.inputs["Surface"])
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = L["sunE"]; sun.angle = math.radians(1.2); sun.color = srgb(L["sunCol"])
    so = link(bpy.data.objects.new("sun", sun)); so.rotation_euler = bd.to_track_quat("Z", "Y").to_euler()
    NOTES["sun"] = {"dir": [round(v, 3) for v in d], "color": L["sunCol"], "energy": L["sunE"]}
    NOTES["sky"] = {"top": L["top"], "horizon": L["horizon"], "bottom": L["bottom"], "sunGlow": L["glow"], "formula": "lib/three/world.ts sky()"}
    NOTES["fog"] = {"color": L["fog"], "near": L["fogNF"][0], "far": L["fogNF"][1], "kind": "THREE.Fog (smoothstep near..far)"}
    PREVIEW_FOG.update(color=L["fog"], near=L["fogNF"][0], far=L["fogNF"][1])
    build_sky_dome(disp)


def haze_inject(cfg):
    """preview only: the engine's THREE.Fog (smoothstep over view depth) mixed into every material, so the Cycles still
    predicts the engine's aerial perspective; returns a function that removes it again (before the bake)"""
    col = inv_agx(cfg["color"]); undo = []
    for m in bpy.data.materials:
        if not m.use_nodes or m.get("mist"): continue
        nt = m.node_tree
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
        if out is None or not out.inputs["Surface"].is_linked: continue
        src = out.inputs["Surface"].links[0].from_socket
        cd = nt.nodes.new("ShaderNodeCameraData"); mr = nt.nodes.new("ShaderNodeMapRange"); mr.interpolation_type = "SMOOTHSTEP"
        nt.links.new(cd.outputs["View Z Depth"], mr.inputs["Value"]); mr.inputs["From Min"].default_value = cfg["near"]; mr.inputs["From Max"].default_value = cfg["far"]
        em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (*col, 1); em.inputs["Strength"].default_value = 1.0
        mx = nt.nodes.new("ShaderNodeMixShader"); nt.links.new(mr.outputs["Result"], mx.inputs[0]); nt.links.new(src, mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs["Surface"])
        undo.append((nt, out, src, [cd, mr, em, mx]))
    def restore():
        for nt, out, src, nodes in undo:
            nt.links.new(src, out.inputs["Surface"])
            for n in nodes: nt.nodes.remove(n)
    return restore


# ------------------------------------------------------------------------------------------------ BALLOON (1.12: an asset, like the van)
# A hot air balloon at real scale: a natural-shape envelope of 24 gores (alternating env_a / env_b, so the engine can
# recolour every balloon), load tapes (env_tape), a crown, a Nomex mouth band and skirt, flying wires to a stainless
# burner frame with two coil burners and their pilot flames (lens_flame), and a 1.4 m wicker basket with a padded rim,
# rope handles, step holes, skids and four fuel cylinders inside. Origin at the basket floor centre, engine axes.
BAL = {"mouth": 5.2, "H": 22.0, "gores": 24, "sub": 10, "frame": 2.36, "bw": 1.4, "bh": 1.15}
ENV_PTS = [(0.0, 2.30), (0.04, 2.78), (0.10, 3.72), (0.20, 5.28), (0.32, 6.86), (0.45, 8.06), (0.58, 8.80), (0.68, 9.00),
           (0.77, 8.86), (0.85, 8.26), (0.91, 7.18), (0.955, 5.45), (0.985, 3.15), (1.0, 1.32)]


def env_r(t):
    """the envelope's radius (at the load tapes) at height fraction t (Catmull-Rom through ENV_PTS)"""
    P = ENV_PTS
    if t <= 0: return P[0][1]
    if t >= 1: return P[-1][1]
    k = max(i for i in range(len(P) - 1) if P[i][0] <= t)
    p0, p1, p2, p3 = P[max(0, k - 1)], P[k], P[k + 1], P[min(len(P) - 1, k + 2)]
    s = (t - p1[0]) / (p2[0] - p1[0])
    m1 = (p2[1] - p0[1]) / max(1e-6, p2[0] - p0[0]) * (p2[0] - p1[0])
    m2 = (p3[1] - p1[1]) / max(1e-6, p3[0] - p1[0]) * (p2[0] - p1[0])
    h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
    return h00 * p1[1] + h10 * m1 + h01 * p2[1] + h11 * m2


def env_pt(t, th, off=0.0):
    """a point on the envelope (engine coords) at height fraction t and angle th, the fabric bulging between the vertical
    load tapes (which sit at th = k * 2pi / gores); off pushes it out along the radius"""
    G = BAL["gores"]
    s = (th * G / (2 * math.pi)) % 1.0
    bul = 1.0 + 0.032 * math.sin(math.pi * s) * math.sin(math.pi * min(1.0, max(0.0, t))) ** 0.6
    r = env_r(t) * 0.985 * bul + off
    return E(r * math.cos(th), BAL["mouth"] + BAL["H"] * t, r * math.sin(th))


def wicker_img(name):
    """basket weave: horizontal weavers over / under vertical stakes, a tone per strand, dark gaps (+ a height for bump)"""
    def height(u, v, np):
        rows, cols = 36, 9
        ri = np.floor(v * rows); fv = v * rows - ri
        ci = np.floor(u * cols + (ri % 2) * 0.5); fu = u * cols + (ri % 2) * 0.5 - ci
        over = ((ri + ci) % 2) == 0
        weaver = np.sin(np.pi * fv) ** 0.7 * (0.82 + 0.18 * np.sin(np.pi * fu))
        stake = np.clip(1 - np.abs(fu - 0.5) * 7, 0, 1) ** 0.6
        return np.where(over, weaver, np.maximum(weaver * 0.55, stake)), ri, ci
    def fn(u, v, np):
        h, ri, ci = height(u, v, np)
        tone = 0.9 + 0.2 * np.modf(np.sin(ri * 12.9898 + ci * 3.1) * 43758.5453)[0]
        grain = 1 + 0.06 * tnoise(np, u, v, 9, (40, 120), (1, 4), 30, 0.4)
        c = np.array(hx("#c79a5e"))[None, None, :] * (tone * grain)[..., None]
        dark = np.array(hx("#3b2614"))[None, None, :]
        k = np.clip(h, 0, 1)[..., None] ** 0.8
        return dark * (1 - k) + c * k
    m = img_mat(name, 1024, 1024, fn, rough=0.78, size=0.32)
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    def nfn(u, v, np):  # a tangent-space normal map from the weave height (exported to glTF, unlike a bump node)
        h = height(u, v, np)[0]
        du = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 3.0; dv = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 3.0
        n = np.stack([-du, -dv, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
        return n * 0.5 + 0.5
    nim = gen_image(name + "_n", 1024, 1024, nfn); nim.colorspace_settings.name = "Non-Color"
    ti = nt.nodes.new("ShaderNodeTexImage"); ti.image = nim
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.inputs["Strength"].default_value = 1.0
    nt.links.new(ti.outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], b.inputs["Normal"])
    return m


def rrect(hw, hd, r, n=6):
    """a rounded rectangle (engine x, z), counter-clockwise seen from above"""
    pts = []
    for (cx, cz, a0) in ((hw - r, hd - r, 0.0), (-(hw - r), hd - r, 0.5 * math.pi), (-(hw - r), -(hd - r), math.pi), (hw - r, -(hd - r), 1.5 * math.pi)):
        for k in range(n + 1):
            a = a0 + 0.5 * math.pi * k / n; pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def ring_tube(name, path, y, rad, mat, seg=10, closed=True):
    """a tube of radius rad along a closed path [(x, z)] at height y"""
    fr = []
    n = len(path)
    for i, (x, z) in enumerate(path):
        a, b = path[i - 1], path[(i + 1) % n]
        t = Vector((b[0] - a[0], 0, b[1] - a[1])).normalized(); out = Vector((t.z, 0, -t.x))
        fr.append((E(x, y, z), edir(out.x, 0, out.z), edir(0, 1, 0)))
    prof = [(rad * math.cos(2 * math.pi * k / seg), rad * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    return sweep(name, prof, fr, mat, closed=closed)


def tube_path(name, pts, rad, mat, seg=8):
    """a tube of radius rad through engine points (cables, hoses, coils)"""
    fr = []
    for i, p in enumerate(pts):
        a, b = Vector(pts[max(0, i - 1)]), Vector(pts[min(len(pts) - 1, i + 1)])
        t = (b - a).normalized(); up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        A = t.cross(up).normalized(); B = A.cross(t).normalized()
        fr.append((E(*p), edir(*A), edir(*B)))
    prof = [(rad * math.cos(2 * math.pi * k / seg), rad * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    return sweep(name, prof, fr, mat)


def lathe(name, prof, at, mat, seg=32, sharp=40):
    """a solid of revolution about engine y: prof = [(r, y)] from bottom to top (r 0 at the ends closes them)"""
    bm = bmesh.new(); rings = []
    for (r, y) in prof:
        if r <= 1e-6: rings.append(bm.verts.new(E(at[0], at[1] + y, at[2]))); continue
        rings.append([bm.verts.new(E(at[0] + r * math.cos(2 * math.pi * k / seg), at[1] + y, at[2] + r * math.sin(2 * math.pi * k / seg))) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        if isinstance(a, list) and isinstance(b, list):
            for k in range(seg): bm.faces.new([a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]])
        elif isinstance(a, list): [bm.faces.new([a[k], a[(k + 1) % seg], b]) for k in range(seg)]
        else: [bm.faces.new([a, b[(k + 1) % seg], b[k]]) for k in range(seg)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, [mat], sharp=sharp)


def build_balloon():
    M = BAL; G, S = M["gores"], M["sub"]; Y0, H = M["mouth"], M["H"]
    env_a = col_mat("env_a", srgb("#d63c2c"), 0.48)
    env_b = col_mat("env_b", srgb("#f4c24a"), 0.48)
    tape = col_mat("env_tape", srgb("#e9dfca"), 0.6)
    nomex = col_mat("env_nomex", srgb("#b59b74"), 0.8)
    skirt = col_mat("env_skirt", srgb("#3f3936"), 0.85)
    for m in (env_a, env_b):
        b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Sheen Weight"].default_value = 0.25  # ripstop nylon: a soft sheen at grazing angles
    flame = col_mat("lens_flame", srgb("#ffae4a"), 0.5, emit=srgb("#ff9a3a"), emit_k=9.0)
    steel = brushed_mat("burner_steel", "#c9ccd0", metal=0.85, rough=0.28)
    dsteel = col_mat("burner_dark", srgb("#3a3c40"), 0.45, 0.6)
    brass = col_mat("burner_brass", srgb("#c8963e"), 0.32, 0.7)
    hose = col_mat("hose", srgb("#1d1d20"), 0.7)
    wicker = wicker_img("basket_wicker")
    pad = leather_mat("basket_pad", "#5e3c24", seed=3, size=0.5, rough=0.62)
    rope = fabric_mat("basket_rope", "#bfa178", seed=4, size=0.2, rough=0.9)
    floor = col_mat("basket_floor", srgb("#2a2624"), 0.9)
    skid = wood_mat("basket_skid", "#8a6440", "#5a3e26", size=0.6, seed=5)
    cyl_m = brushed_mat("fuel_cyl", "#d9dce0", metal=0.7, rough=0.3, seed=6)
    red = col_mat("fuel_wheel", srgb("#b22a22"), 0.45)
    gauge = col_mat("fuel_gauge", srgb("#f2efe6"), 0.3)
    # ---- envelope: rings from the mouth to the crown, faces alternating env_a / env_b by gore (a band near the
    # equator swaps them: a checker band), the first panel row in Nomex
    ts = [k / 110 for k in range(111)]
    NA = G * S
    bm = bmesh.new(); rings = []
    for t in ts:
        rings.append([bm.verts.new(env_pt(t, 2 * math.pi * k / NA)) for k in range(NA)])
    for i in range(len(ts) - 1):
        tm = (ts[i] + ts[i + 1]) / 2
        for k in range(NA):
            f = bm.faces.new([rings[i][k], rings[i][(k + 1) % NA], rings[i + 1][(k + 1) % NA], rings[i + 1][k]])
            g = k // S; flip = 1 if 0.47 < tm < 0.6 else 0
            f.material_index = 2 if tm < 0.035 else (g + flip) % 2
    top = bm.verts.new(E(0, Y0 + H + 0.32, 0))
    for k in range(NA): bm.faces.new([rings[-1][k], rings[-1][(k + 1) % NA], top]).material_index = 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    envo = mesh_obj("env", bm, [env_a, env_b, nomex], sharp=60)
    # vertical load tapes (on the gore seams) and horizontal tapes
    w = 0.042
    for g in range(G):
        th = 2 * math.pi * g / G
        bm = bmesh.new(); L, R = [], []
        for t in ts:
            r = env_r(t) * 0.985; dth = w / 2 / max(0.5, r)
            L.append(bm.verts.new(env_pt(t, th - dth, 0.012))); R.append(bm.verts.new(env_pt(t, th + dth, 0.012)))
        for i in range(len(ts) - 1): bm.faces.new([L[i], R[i], R[i + 1], L[i + 1]])
        mesh_obj(f"env_vt{g}", bm, [tape], sharp=60)
    for tt in (0.035, 0.16, 0.33, 0.5, 0.66, 0.8, 0.92):
        bm = bmesh.new(); dt = 0.026 / H
        A_ = [bm.verts.new(env_pt(tt - dt, 2 * math.pi * k / NA, 0.013)) for k in range(NA)]
        B_ = [bm.verts.new(env_pt(tt + dt, 2 * math.pi * k / NA, 0.013)) for k in range(NA)]
        for k in range(NA): bm.faces.new([A_[k], A_[(k + 1) % NA], B_[(k + 1) % NA], B_[k]])
        mesh_obj(f"env_ht{tt}", bm, [tape], sharp=60)
    # crown ring + parachute vent edge, two turning vents (dark slits edged with tape)
    ring_tube("env_crown", [(env_r(0.995) * 0.985 * math.cos(a), env_r(0.995) * 0.985 * math.sin(a)) for a in [2 * math.pi * k / 64 for k in range(64)]], Y0 + H * 0.995 + 0.05, 0.05, tape)
    for sgn in (-1, 1):
        th0 = math.pi / 2 * sgn
        bm = bmesh.new(); L, R = [], []
        for t in [0.5 + 0.12 * k / 12 for k in range(13)]:
            r = env_r(t); d = 0.09 / r
            L.append(bm.verts.new(env_pt(t, th0 + 0.5 * math.pi / G - d, 0.008))); R.append(bm.verts.new(env_pt(t, th0 + 0.5 * math.pi / G + d, 0.008)))
        for i in range(12): bm.faces.new([L[i], R[i], R[i + 1], L[i + 1]])
        mesh_obj(f"env_vent{sgn}", bm, [skirt], sharp=60)
    # mouth: a cable ring, the skirt (scoop) flaring below it
    r0 = env_r(0.0) * 0.985
    ring_tube("env_mouthring", [(r0 * math.cos(a), r0 * math.sin(a)) for a in [2 * math.pi * k / 72 for k in range(72)]], Y0, 0.03, dsteel)
    bm = bmesh.new(); sk = []
    for j, (yy, rr) in enumerate(((Y0 + 0.02, r0 + 0.01), (Y0 - 0.45, r0 + 0.07), (Y0 - 0.95, r0 + 0.15), (Y0 - 1.45, r0 + 0.26), (Y0 - 1.75, r0 + 0.34))):
        sk.append([bm.verts.new(E((rr + 0.02 * math.sin(7 * a + j)) * math.cos(a), yy, (rr + 0.02 * math.sin(7 * a + j)) * math.sin(a))) for a in [2 * math.pi * k / 96 for k in range(96)]])
    for a_, b_ in zip(sk, sk[1:]):
        for k in range(96): bm.faces.new([a_[k], a_[(k + 1) % 96], b_[(k + 1) % 96], b_[k]])
    mesh_obj("env_skirt", bm, [skirt], sharp=60)
    # ---- burner frame (stainless square at y frame), two coil burners, valves, pilot flames
    FY, fh = M["frame"], 0.47
    fr_pts = rrect(fh, fh, 0.06, 4)
    ring_tube("burner_frame", fr_pts, FY, 0.022, steel)
    ring_tube("burner_frame2", rrect(fh, fh, 0.06, 4), FY + 0.26, 0.018, steel)
    for sx in (-1, 1):
        for sz in (-1, 1):
            tube_path(f"burner_post{sx}{sz}", [(sx * (fh - 0.02), FY - 0.02, sz * (fh - 0.02)), (sx * (fh - 0.02), FY + 0.28, sz * (fh - 0.02))], 0.016, steel)
    tube_path("burner_bar", [(0, FY + 0.12, -fh), (0, FY + 0.12, fh)], 0.016, steel)
    for k, bx in enumerate((-0.21, 0.21)):
        # the coil: a helix of tube around a jet block
        pts = [(bx + 0.13 * math.cos(a), FY + 0.04 + 0.27 * a / (12 * math.pi), 0.13 * math.sin(a)) for a in [i * 12 * math.pi / 180 for i in range(181)]]
        tube_path(f"burner_coil{k}", pts, 0.017, steel, seg=8)
        lathe(f"burner_jet{k}", [(0.0, 0.0), (0.07, 0.0), (0.07, 0.05), (0.055, 0.07), (0.045, 0.24), (0.0, 0.24)], (bx, FY - 0.03, 0), dsteel, seg=24)
        lathe(f"burner_can{k}", [(0.0, 0.0), (0.09, 0.0), (0.1, 0.03), (0.1, 0.1), (0.0, 0.1)], (bx, FY - 0.13, 0), steel, seg=24)
        slab(f"burner_valve{k}", (bx, FY - 0.16, 0.13), (0.09, 0.07, 0.07), brass, bevel=0.01)
        b = slab(f"burner_handle{k}", (bx + 0.04, FY - 0.2, 0.2), (0.03, 0.03, 0.17), hose, bevel=0.008)
        disc(f"burner_gauge{k}", (bx - 0.05, FY - 0.15, 0.17), 0.028, 0.02, gauge, axis="z", seg=16)
        lathe(f"pilot_flame{k}", [(0.0, 0.0), (0.008, 0.006), (0.014, 0.022), (0.017, 0.04), (0.013, 0.065), (0.006, 0.09), (0.0, 0.11)], (bx, FY + 0.21, 0), flame, seg=16)  # sunk into the coil: the tip glows above it
    # flying wires: from the 24 tape ends at the mouth to the frame corners (6 per corner)
    for g in range(G):
        th = 2 * math.pi * (g + 0.5) / G
        a = (r0 * math.cos(2 * math.pi * g / G), Y0, r0 * math.sin(2 * math.pi * g / G))
        corner = (math.copysign(fh * 0.98, math.cos(th)), FY + 0.27, math.copysign(fh * 0.98, math.sin(th)))
        tube_path(f"wire{g}", [a, corner], 0.006, dsteel, seg=5)
    # ---- the basket: rounded wicker walls, padded rim, leather base trim, skids, rope handles, step holes
    BW, BH = M["bw"], M["bh"]; hw = BW / 2
    bm = bmesh.new()
    outer_b, outer_t = rrect(hw - 0.02, hw - 0.02, 0.12, 6), rrect(hw, hw, 0.13, 6)
    inner_t, inner_b = rrect(hw - 0.045, hw - 0.045, 0.09, 6), rrect(hw - 0.065, hw - 0.065, 0.08, 6)
    rs = [[bm.verts.new(E(x, y, z)) for (x, z) in pts] for (pts, y) in ((outer_b, 0.0), (outer_t, BH), (inner_t, BH), (inner_b, 0.035))]
    n = len(outer_b)
    for a_, b_ in zip(rs, rs[1:]):
        for k in range(n): bm.faces.new([a_[k], a_[(k + 1) % n], b_[(k + 1) % n], b_[k]])
    bm.faces.new(rs[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj("basket_walls", bm, [wicker], sharp=50)
    ring_tube("basket_rim", rrect(hw - 0.02, hw - 0.02, 0.12, 8), BH + 0.035, 0.062, pad, seg=14)
    ring_tube("basket_base", rrect(hw - 0.012, hw - 0.012, 0.12, 8), 0.05, 0.035, pad, seg=10)
    for sx in (-1, 1):
        for sz in (-1, 1):  # leather corner guards
            slab(f"basket_guard{sx}{sz}", (sx * (hw - 0.05), BH / 2, sz * (hw - 0.05)), (0.13, BH - 0.06, 0.13), pad, bevel=0.05, yaw=math.pi / 4)
    slab("basket_floor", (0, 0.045, 0), (BW - 0.14, 0.02, BW - 0.14), floor, bevel=0.01)
    for sz in (-0.45, 0.45):
        slab(f"basket_skid{sz}", (0, -0.035, sz), (BW - 0.06, 0.07, 0.09), skid, bevel=0.015)
    for side in range(4):  # rope handles (two per side) and a step hole
        ang = side * math.pi / 2
        ca, sa = math.cos(ang), math.sin(ang)
        for off in (-0.38, 0.38):
            pts = []
            for k in range(13):
                a = math.pi * k / 12
                u_, d_ = off + 0.1 * math.cos(a), hw + 0.012 + 0.07 * math.sin(a)
                pts.append((ca * d_ - sa * u_, 0.97 - 0.09 * math.sin(a), sa * d_ + ca * u_))
            tube_path(f"basket_rope{side}{off}", pts, 0.016, rope, seg=8)
        if side in (1, 3):
            u_, d_ = 0.0, hw + 0.002
            slab(f"basket_stepr{side}", (ca * d_ - sa * u_, 0.36, sa * d_ + ca * u_), (0.27, 0.16, 0.03), pad, bevel=0.07, yaw=-ang + math.pi / 2)
            slab(f"basket_step{side}", (ca * (d_ + 0.004) - sa * u_, 0.36, sa * (d_ + 0.004) + ca * u_), (0.2, 0.09, 0.03), floor, bevel=0.04, yaw=-ang + math.pi / 2)
    # uprights: suede-sleeved rods from the basket corners to the burner frame
    for sx in (-1, 1):
        for sz in (-1, 1):
            a = (sx * (hw - 0.08), BH - 0.25, sz * (hw - 0.08)); b = (sx * (fh - 0.01), FY - 0.01, sz * (fh - 0.01))
            tube_path(f"upright{sx}{sz}", [a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), b], 0.036, pad, seg=10)
    # fuel cylinders in the four corners, padded covers, valves; two hoses up to the burners
    for k, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        cx, cz = sx * 0.43, sz * 0.43
        lathe(f"fuel{k}", [(0.0, 0.05), (0.13, 0.05), (0.15, 0.08), (0.15, 0.7), (0.135, 0.77), (0.09, 0.81), (0.0, 0.82)], (cx, 0, cz), cyl_m, seg=28)
        lathe(f"fuel_cover{k}", [(0.0, 0.07), (0.158, 0.07), (0.16, 0.1), (0.16, 0.6), (0.152, 0.63), (0.0, 0.63)], (cx, 0, cz), pad, seg=28)
        lathe(f"fuel_collar{k}", [(0.0, 0.8), (0.1, 0.8), (0.1, 0.9), (0.085, 0.9), (0.085, 0.82), (0.0, 0.82)], (cx, 0, cz), cyl_m, seg=24)
        disc(f"fuel_valve{k}", (cx, 0.86, cz), 0.025, 0.05, brass, axis="y", seg=12)
        disc(f"fuel_wheel{k}", (cx, 0.9, cz), 0.04, 0.012, red, axis="y", seg=16)
        disc(f"fuel_gauge{k}", (cx + 0.035 * sx, 0.84, cz), 0.022, 0.012, gauge, axis="y", seg=14)
        if k < 2:
            a = (cx, 0.9, cz); b = (-0.2 if sx < 0 else 0.2, FY - 0.16, 0.12)
            pts = [a, (cx * 0.9, 1.3, cz * 0.9), (sx * (hw - 0.12), 1.75, sz * (hw - 0.14)), (sx * 0.4, 2.1, 0.0), b]
            tube_path(f"hose{k}", pts, 0.013, hose, seg=8)
    # the parachute-vent line: a red cord from the crown down through the envelope to the burner frame
    tube_path("vent_line", [(0.06, Y0 + H - 0.3, 0.05), (0.08, Y0 + H * 0.5, 0.06), (0.1, Y0, 0.08), (0.12, FY + 0.3, 0.1)], 0.008, col_mat("vent_line_red", srgb("#c8302a"), 0.6), seg=6)
    # an instrument pack strapped inside the front wall
    slab("basket_instr", (0.0, 0.92, hw - 0.08), (0.2, 0.13, 0.05), hose, bevel=0.012)
    slab("basket_instr_s", (0.0, 0.93, hw - 0.107), (0.15, 0.08, 0.004), col_mat("instr_screen", srgb("#9fb79a"), 0.2), bevel=0.0)
    top_y = Y0 + H + 0.32
    NOTES["vehicle"] = {"length": BW, "width": BW, "height": round(top_y, 2), "wheelR": 0.01, "wheelBase": 1,
                        "seats": {"pilot": {"pos": [-0.31, 0.055, 0.06], "pose": "idle"}, "passenger": {"pos": [0.31, 0.055, 0.06], "pose": "idle"}},
                        "burner": [0.0, round(FY + 0.3, 3), 0.0], "mouth": [0.0, Y0, 0.0], "envelope": {"width": round(2 * env_r(0.68) * 0.985 * 1.032, 2), "bottom": Y0, "top": round(top_y, 2)},
                        "recolor": ["env_a", "env_b"], "flame": "lens_flame"}


def balloon_preview(out):
    """look-dev stills of the balloon: the whole balloon (two sides), the basket and burner close, into the basket"""
    w = bpy.data.worlds.new("pv"); SC.world = w; w.use_nodes = True
    N_, L_ = w.node_tree.nodes, w.node_tree.links
    tc = N_.new("ShaderNodeTexCoord"); sep = N_.new("ShaderNodeSeparateXYZ"); L_.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = N_.new("ShaderNodeValToRGB"); L_.new(sep.outputs["Z"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (*srgb("#b9a58c"), 1)
    ramp.color_ramp.elements[1].position = 0.6; ramp.color_ramp.elements[1].color = (*srgb("#3f6db0"), 1)
    e = ramp.color_ramp.elements.new(0.5); e.color = (*srgb("#e8eef3"), 1)
    L_.new(ramp.outputs["Color"], N_["Background"].inputs["Color"]); N_["Background"].inputs["Strength"].default_value = 1.0
    sun = bpy.data.lights.new("pvsun", "SUN"); sun.energy = 4.0; sun.angle = math.radians(1.5); sun.color = srgb("#fff1dc")
    so = link(bpy.data.objects.new("pvsun", sun)); d = Vector((0.6, 0.62, 0.5)).normalized(); so.rotation_euler = Vector((d.x, -d.z, d.y)).to_track_quat("Z", "Y").to_euler()
    fl = plane("pv_floor", 120, 120, (0, -0.075, 0), col_mat("pv_floor_m", srgb("#a89a84"), 0.9))
    cam = bpy.data.cameras.new("pvcam"); co = link(bpy.data.objects.new("pvcam", cam)); SC.camera = co
    SC.render.engine = "CYCLES"; SC.cycles.samples = 96
    for nm_, pos, look, lens, res in (("full", (34, 6, 42), (0, 14.5, 0), 30, (800, 1000)), ("full_b", (-40, 22, 26), (0, 14, 0), 30, (800, 1000)),
                                      ("basket", (3.4, 2.6, 4.2), (0, 1.25, 0), 35, (1000, 800)), ("inside", (1.3, 4.3, 1.9), (0, 0.4, 0), 30, (1000, 800)),
                                      ("burner", (1.4, 2.6, 1.7), (0, 2.45, 0), 45, (1000, 800)), ("up", (0.6, 1.6, 0.4), (0, 20, 0), 14, (800, 1000))):
        cam.lens = lens; SC.render.resolution_x, SC.render.resolution_y = res
        co.location = E(*pos); co.rotation_euler = (E(*look) - co.location).to_track_quat("-Z", "Y").to_euler()
        SC.render.filepath = os.path.join(out, f"balloon_{nm_}.png"); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(fl); bpy.data.objects.remove(co); bpy.data.objects.remove(so)


ASSET = {"van", "porch", "parcel", "scanner", "balloon"}
PRE_EXPORT = []  # (1.12) callables run after the bake, before the export
BUILD = {"home": build_home, "van": build_van, "office": build_office, "depot": build_depot, "porch": build_porch, "parcel": build_parcel, "scanner": build_scanner,
         "balloon": build_balloon, "valley": build_valley}
PREVIEW = {"van": lambda: van_preview(OUT), "porch": lambda: asset_preview(OUT, "porch", (0, 1.4, 0.4), 5.5),
           "parcel": lambda: asset_preview(OUT, "parcel", (0, 0.14, 0), 1.2), "scanner": lambda: asset_preview(OUT, "scanner", (0, -0.1, 0), 2.4),
           "balloon": lambda: balloon_preview(OUT)}


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
        mats = [m for m in me.materials if m]
        tk = max([float(m.get("texel_k", 1.0)) for m in mats] or [1.0]); cap = int(min([m.get("lm_max", 2048) for m in mats] or [2048]))  # (1.12: per-material budget)
        side = int(min(cap, max(64, 2 ** round(math.log2(max(1.0, math.sqrt(area(ob)) * texel * tk))))))
        im = bpy.data.images.new(f"LM_{ob.name}", side, side, float_buffer=True)
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
    cam.clip_end = 3000.0
    undo = haze_inject(PREVIEW_FOG) if PREVIEW_FOG else None  # (1.12: the engine's fog, so the still predicts its aerial perspective)
    SC.render.filepath = os.path.join(OUT, "preview.png"); bpy.ops.render.render(write_still=True)
    for k, v in enumerate(str(A.get("views", "")).split(";") if A.get("views") else PREVIEW_VIEWS):  # extra look-dev stills: "px,py,pz,lx,ly,lz,fov;..."
        p = [float(t) for t in v.split(",")]
        co.location = E(*p[:3]); co.rotation_euler = (E(*p[3:6]) - co.location).to_track_quat("-Z", "Y").to_euler(); cam.angle_y = math.radians(p[6])
        SC.render.filepath = os.path.join(OUT, f"view{k}.png"); bpy.ops.render.render(write_still=True)
    if undo: undo()


if A["set"] in ASSET:
    BUILD[A["set"]]()
    if A["set"] == "van": van_gradient()  # before the preview too (the stills rendered black without it)
    if A["set"] == "balloon": prepare()  # (the wicker and leather need their world UVs in the look-dev stills)
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
light_interior() if NOTES.get("light") == "interior" else light_valley() if NOTES.get("light") == "valley" else light_day()
prepare()
clamp_metals()
join_by_material()
if A.get("preview"): preview()
if A.get("lookdev"): sys.exit(0)  # (--preview --lookdev: the Cycles still only, no bake or export, while iterating on a set)
baked = bake_all()
S, lms = save_lightmaps(baked)
for f in PRE_EXPORT: f()
export(S, lms)
