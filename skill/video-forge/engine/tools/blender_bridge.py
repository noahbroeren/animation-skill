"""
Blender bridge (tested with Blender 5.3 on Windows (EEVEE + Cycles/OptiX, 2026-11-10)).

Purpose: the "realistic 3D explainer" style (references/styles/realistic3d-explainer.md) needs path-traced or
EEVEE-Next lighting, SSS skin and real materials that three.js + our toon post can't fake. This script renders a
glTF scene in Blender with the SAME camera grammar as engine/src/lib/camera.ts (keys with glide/ease/cut), at native
resolution, to a PNG sequence that tools/render.mjs-style muxing (ffmpeg) or the analyzer can consume.

  blender -b -P engine/tools/blender_bridge.py -- --scene world.glb --cam cam.json --out renders/x/frames \
          --res 1440x2560 --fps 30 [--frames 0-299] [--engine EEVEE|CYCLES] [--samples 64] [--look real|toon] \
          [--hdri public/assets/polyhaven/hdris/<id>/<id>_1k.hdr] [--freestyle] [--ground #8a9a5b] [--step 1]
          [--offsets "x,y,z;x,y,z"]   (one offset per --scene file, engine axes)
          [--catcher] (Cycles: ground = shadow catcher, HDRI background stays) [--fstop 2.8] (DOF on the look point)

cam.json = {"keys": [{"f": 0, "pos": [x,y,z], "look": [x,y,z], "fov": 34, "glide": 44, "cut": false}, ...]}
  - same units/axes as the engine (metres, +Y up; glTF import keeps +Y up -> Blender converts to +Z up for us)
  - fov = VERTICAL field of view in degrees (three.js convention)
  - glide = frames the move takes, ending at f; ease = smootherstep (camera.ts default)
--look toon adds Freestyle ink lines + a constant-shaded ramp; --look real keeps PBR (Filmic/AgX view transform).

Mark anything rendered with this as "Blender path" in the produce report; run vfa qa / compare on the result like
any other render. Ask the user before installing Blender (it is ~400 MB).
"""
import json
import math
import os
import sys


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = {"res": "1440x2560", "fps": "30", "engine": "EEVEE", "samples": "64", "look": "real"}
    i = 0
    while i < len(argv):
        k = argv[i].lstrip("-")
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            a[k] = argv[i + 1]
            i += 2
        else:
            a[k] = True
            i += 1
    return a


def smoother(u):
    u = max(0.0, min(1.0, u))
    return u * u * u * (u * (u * 6 - 15) + 10)


def cam_at(keys, f):
    """Port of camera.ts base(): hold on the last arrived key, glide toward the next one over its `glide` frames."""
    ks = sorted(keys, key=lambda k: k["f"])
    i = 0
    while i < len(ks) - 1 and ks[i + 1]["f"] <= f:
        i += 1
    k0 = ks[i]
    st = (k0["pos"], k0["look"], k0.get("fov", 35))
    if i + 1 < len(ks) and not ks[i + 1].get("cut"):
        k1 = ks[i + 1]
        g = k1.get("glide", 24)
        s = k1["f"] - g
        if f >= s:
            u = smoother((f - s) / g)
            mix = lambda a, b: [a[j] + (b[j] - a[j]) * u for j in range(3)]
            pos = mix(mix(k0["pos"], k1["via"]), mix(k1["via"], k1["pos"])) if k1.get("via") else mix(k0["pos"], k1["pos"])  # Bezier arc (camera.ts `via`)
            st = (pos, mix(k0["look"], k1["look"]), k0.get("fov", 35) + (k1.get("fov", 35) - k0.get("fov", 35)) * u)
    return st


def y_up_to_z_up(v):  # engine (x, y, z) with +Y up -> Blender (x, -z, y)
    return (v[0], -v[2], v[1])


def main():
    import bpy  # noqa: only available inside Blender
    from mathutils import Vector

    a = args()
    W, H = (int(x) for x in a["res"].split("x"))
    fps = int(a["fps"])
    keys = json.load(open(a["cam"], encoding="utf-8"))["keys"]
    f0, f1 = (int(x) for x in a.get("frames", f"0-{max(k['f'] for k in keys)}").split("-"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    for i, path in enumerate(a["scene"].split(",")):  # several glTF/GLB files; --offsets "x,y,z;x,y,z" (engine axes)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
        offs = a.get("offsets", "").split(";")
        if i < len(offs) and offs[i]:
            d = Vector(y_up_to_z_up([float(v) for v in offs[i].split(",")]))
            for o in set(bpy.data.objects) - before:
                if o.parent is None:
                    o.location += d
    if a.get("ground"):  # simple ground plane, colour hex (engine look-dev), receives shadows
        bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
        g = bpy.context.active_object
        m = bpy.data.materials.new("ground")
        m.use_nodes = True
        hx = a["ground"].lstrip("#")
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*[(int(hx[j:j + 2], 16) / 255) ** 2.2 for j in (0, 2, 4)], 1)
        m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
        g.data.materials.append(m)
        if a.get("catcher"):  # Cycles: ground only catches shadows, HDRI shows through (no fake horizon line)
            g.is_shadow_catcher = True
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.fps = fps
    engines = [e.identifier for e in type(sc.render).bl_rna.properties["engine"].enum_items]
    eevee = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"  # 4.2-4.x vs 5.x name
    sc.render.engine = "CYCLES" if a["engine"].upper() == "CYCLES" else eevee
    if sc.render.engine == "CYCLES":
        sc.cycles.samples = int(a["samples"])
        sc.cycles.use_denoising = True
        try:
            bpy.context.preferences.addons["cycles"].preferences.compute_device_type = "OPTIX"
            bpy.context.preferences.addons["cycles"].preferences.get_devices()
            for dv in bpy.context.preferences.addons["cycles"].preferences.devices:
                dv.use = dv.type in ("OPTIX", "CUDA")
            sc.cycles.device = "GPU"
        except Exception:
            pass
    sc.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in type(sc.view_settings).bl_rna.properties["view_transform"].enum_items] else "Filmic"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_depth = "16"

    if a.get("hdri"):
        w = sc.world or bpy.data.worlds.new("World")
        sc.world = w
        w.use_nodes = True
        nt = w.node_tree
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(os.path.abspath(a["hdri"]))
        bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = float(a.get("hdri_strength", 1.0))

    if a["look"] == "toon" or a.get("freestyle"):
        sc.render.use_freestyle = True
        ls = sc.view_layers[0].freestyle_settings.linesets.new("ink")
        ls.select_by_visibility = True
        ls.select_silhouette = ls.select_crease = True
        ls.select_border = False  # open mesh edges (ground plane rim) drew a stray horizon line
        ls.linestyle.color = (0.055, 0.03, 0.06)
        ls.linestyle.thickness = max(1.5, 3.2 * min(W, H) / 1080)

    cam_data = bpy.data.cameras.new("forge_cam")
    cam = bpy.data.objects.new("forge_cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam_data.sensor_fit = "VERTICAL"
    if a.get("fstop"):  # depth of field focused on the look point each frame (engine `focus` = distance to look)
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = float(a["fstop"])
    os.makedirs(a["out"], exist_ok=True)
    frames = list(range(f0, f1 + 1, int(a.get("step", 1))))
    for f in frames:
        pos, look, fov = cam_at(keys, f)
        p, l = Vector(y_up_to_z_up(pos)), Vector(y_up_to_z_up(look))
        cam.location = p
        cam.rotation_euler = (l - p).to_track_quat("-Z", "Y").to_euler()
        cam_data.angle_y = math.radians(fov)
        if a.get("fstop"):
            cam_data.dof.focus_distance = (l - p).length
        sc.frame_set(f)
        sc.render.filepath = os.path.join(a["out"], f"f{f:06d}.png")
        bpy.ops.render.render(write_still=True)
    print(f"[blender_bridge] rendered {len(frames)} frames -> {a['out']}  (mux: ffmpeg -framerate {fps} -i f%06d.png ...)")


if __name__ == "__main__":
    try:
        import bpy  # noqa: F401
        IN_BLENDER = True
    except ImportError:
        IN_BLENDER = False
    if IN_BLENDER:
        main()
    else:  # plain-Python self-check of the camera port (runs without Blender)
        ks = [{"f": 0, "pos": [0, 1, 5], "look": [0, 1, 0]}, {"f": 44, "pos": [2, 1, 5], "look": [0, 1, 0], "glide": 44}]
        assert cam_at(ks, 0)[0] == [0, 1, 5] and abs(cam_at(ks, 22)[0][0] - 1.0) < 1e-9 and cam_at(ks, 44)[0] == [2, 1, 5]
        print("camera port OK (run inside Blender: blender -b -P blender_bridge.py -- ...)")
