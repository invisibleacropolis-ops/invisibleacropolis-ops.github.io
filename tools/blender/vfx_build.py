"""Kakuriyo VFX flipbooks, rendered from procedural volumes in Cycles.

Run inside Blender (5.x):  exec(open(r"<repo>/tools/blender/vfx_build.py").read()); main()

Blender's node graphs cannot run in a browser, so Blender is the effects
*studio*: animated procedural volumes (noise-driven density, lit by a sun,
self-shadowed) are rendered frame by frame and packed into 8x8 atlases of
DATA, not colour, which the runtime shader turns into cel-shaded effects
and recolours per use:

    R = coverage (volume opacity)   G = light (lit fraction, or flame heat)
    B = (flame) inner core          A = 1 (avoids premultiplied-alpha loss)

  puff.png   a smoke puff's life: billows out, curls up, dissolves
  flame.png  a seamlessly looping teardrop flame (foxfire, soul flames)

Renders go to a separate "VFXBake" scene, so the open file is untouched.
"""
import bpy, os, math
import numpy as np

REPO = r"C:\GITLOCAL\invisibleacropolis-ops.github.io"
OUT_DIR = os.path.join(REPO, "public", "kami", "vfx")
TMP = os.path.join(REPO, "tools", "blender", ".cache", "vfx_frames")
SIZE, COLS = 128, 8
FRAMES = COLS * COLS


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def scene():
    sc = bpy.data.scenes.get("VFXBake") or bpy.data.scenes.new("VFXBake")
    for ob in list(sc.collection.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    sc.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    sc.cycles.device = "GPU"
                    break
            except TypeError:
                continue
    except Exception:
        sc.cycles.device = "CPU"
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.cycles.volume_step_rate = 0.5
    sc.cycles.volume_bounces = 2
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    world = bpy.data.worlds.get("VFXWorld") or bpy.data.worlds.new("VFXWorld")
    world.color = (0, 0, 0)
    sc.world = world
    cam_data = bpy.data.cameras.get("VFXCam") or bpy.data.cameras.new("VFXCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.3
    cam = bpy.data.objects.new("VFXCam", cam_data)
    cam.location = (0, -6, 0)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sun_data = bpy.data.lights.get("VFXSun") or bpy.data.lights.new("VFXSun", "SUN")
    sun_data.energy = 4.0
    sun = bpy.data.objects.new("VFXSun", sun_data)
    # Light travels right, down and slightly away from the camera: the puff
    # is lit on its upper left with a shadowed lower right to band in toon.
    from mathutils import Vector
    sun.rotation_euler = Vector((0.62, 0.35, -0.7)).normalized().to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)
    return sc


def node(tree, kind, idx=None, **inputs):
    n = tree.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    for k, v in (idx or {}).items():
        n.inputs[k].default_value = v
    return n


def domain(sc, name):
    bpy.ops.mesh.primitive_cube_add(size=2.2)
    ob = bpy.context.active_object
    for c in ob.users_collection:
        c.objects.unlink(ob)
    sc.collection.objects.link(ob)
    ob.name = name
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    ob.data.materials.append(mat)
    tree = mat.node_tree
    tree.nodes.clear()
    return ob, tree


def puff_material(tree):
    """Billowing density: a growing sphere of 4D noise that rises and is
    eaten away from the inside out as its threshold climbs."""
    L = tree.links.new
    tc = tree.nodes.new("ShaderNodeTexCoord")
    lift = node(tree, "ShaderNodeMapping")
    L(tc.outputs["Object"], lift.inputs["Vector"])
    noise = node(tree, "ShaderNodeTexNoise", Scale=2.3, Detail=6.0, Roughness=0.58, Distortion=0.35)
    noise.noise_dimensions = "4D"
    L(lift.outputs["Vector"], noise.inputs["Vector"])
    dist = node(tree, "ShaderNodeVectorMath"); dist.operation = "LENGTH"
    L(lift.outputs["Vector"], dist.inputs[0])
    # Linear falloff from the centre (1) to the radius (0); the noise is
    # ADDED to it, so it pushes the surface in and out into billows instead
    # of only thinning the inside. A rising threshold then eats it away.
    fall = node(tree, "ShaderNodeMapRange", **{"From Min": 0.0, "To Min": 1.0, "To Max": 0.0})
    fall.clamp = False
    L(dist.outputs["Value"], fall.inputs["Value"])
    bumps = node(tree, "ShaderNodeMapRange", **{"From Min": 0.0, "From Max": 1.0, "To Min": -0.55, "To Max": 0.55})
    L(noise.outputs["Fac"], bumps.inputs["Value"])
    field = node(tree, "ShaderNodeMath"); field.operation = "ADD"
    L(fall.outputs["Result"], field.inputs[0]); L(bumps.outputs["Result"], field.inputs[1])
    cut = node(tree, "ShaderNodeMath"); cut.operation = "SUBTRACT"
    L(field.outputs["Value"], cut.inputs[0])
    gain = node(tree, "ShaderNodeMath", idx={1: 5.0}); gain.operation = "MULTIPLY"; gain.use_clamp = True
    L(cut.outputs["Value"], gain.inputs[0])
    scale = node(tree, "ShaderNodeMath", idx={1: 14.0}); scale.operation = "MULTIPLY"
    L(gain.outputs["Value"], scale.inputs[0])
    vol = node(tree, "ShaderNodeVolumePrincipled", Color=(1, 1, 1, 1), Anisotropy=0.25)
    L(scale.outputs["Value"], vol.inputs["Density"])
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    L(vol.outputs["Volume"], out.inputs["Volume"])

    def at(t):
        radius = 0.32 + 0.66 * (1 - (1 - t) ** 2.2)
        lift.inputs["Location"].default_value = (0, 0, -0.32 * t)
        noise.inputs["W"].default_value = 1.7 * t
        fall.inputs["From Max"].default_value = radius
        cut.inputs[1].default_value = 0.08 + 1.2 * t ** 1.8
    return at


def flame_material(tree):
    """A teardrop of emissive density with noise rising through it."""
    L = tree.links.new
    tc = tree.nodes.new("ShaderNodeTexCoord")
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    L(tc.outputs["Object"], sep.inputs["Vector"])
    comb = tree.nodes.new("ShaderNodeCombineXYZ")
    L(sep.outputs["X"], comb.inputs["X"]); L(sep.outputs["Y"], comb.inputs["Y"])
    radial = node(tree, "ShaderNodeVectorMath"); radial.operation = "LENGTH"
    L(comb.outputs["Vector"], radial.inputs[0])
    # taper(z): wide at the bottom, a point at the top
    up = node(tree, "ShaderNodeMapRange", **{"From Min": -0.85, "From Max": 1.05, "To Min": 1.0, "To Max": 0.0})
    L(sep.outputs["Z"], up.inputs["Value"])
    taper = node(tree, "ShaderNodeMath", idx={1: 0.75}); taper.operation = "POWER"
    L(up.outputs["Result"], taper.inputs[0])
    width = node(tree, "ShaderNodeMath", idx={1: 0.58}); width.operation = "MULTIPLY"
    L(taper.outputs["Value"], width.inputs[0])
    # Rounded bottom: the width closes over the last stretch of the base.
    bottom = node(tree, "ShaderNodeMapRange", **{"From Min": -0.98, "From Max": -0.5})
    bottom.interpolation_type = "SMOOTHSTEP"
    L(sep.outputs["Z"], bottom.inputs["Value"])
    round_ = node(tree, "ShaderNodeMath", idx={1: 0.5}); round_.operation = "POWER"
    L(bottom.outputs["Result"], round_.inputs[0])
    w2 = node(tree, "ShaderNodeMath"); w2.operation = "MULTIPLY"
    L(width.outputs["Value"], w2.inputs[0]); L(round_.outputs["Value"], w2.inputs[1])
    w3 = node(tree, "ShaderNodeMath", idx={1: 0.005}); w3.operation = "ADD"
    L(w2.outputs["Value"], w3.inputs[0])
    # Inside field: 1 on the axis, 0 at the teardrop's surface.
    ratio = node(tree, "ShaderNodeMath"); ratio.operation = "DIVIDE"
    L(radial.outputs["Value"], ratio.inputs[0]); L(w3.outputs["Value"], ratio.inputs[1])
    inside = node(tree, "ShaderNodeMath", idx={0: 1.0}); inside.operation = "SUBTRACT"
    L(ratio.outputs["Value"], inside.inputs[1])
    # Noise stretched tall and scrolling up; it is ADDED to the field, more
    # strongly toward the tip, so tongues break away and lick upward.
    rise = node(tree, "ShaderNodeMapping")
    L(tc.outputs["Object"], rise.inputs["Vector"])
    rise.inputs["Scale"].default_value = (2.6, 2.6, 1.15)
    noise = node(tree, "ShaderNodeTexNoise", Scale=1.6, Detail=5.0, Roughness=0.62, Distortion=0.9)
    noise.noise_dimensions = "4D"
    L(rise.outputs["Vector"], noise.inputs["Vector"])
    lick = node(tree, "ShaderNodeMapRange", **{"To Min": -1.15, "To Max": 1.15})
    L(noise.outputs["Fac"], lick.inputs["Value"])
    tipward = node(tree, "ShaderNodeMapRange", **{"From Min": -0.9, "From Max": 0.9, "To Min": 0.35, "To Max": 1.25})
    L(sep.outputs["Z"], tipward.inputs["Value"])
    lick2 = node(tree, "ShaderNodeMath"); lick2.operation = "MULTIPLY"
    L(lick.outputs["Result"], lick2.inputs[0]); L(tipward.outputs["Result"], lick2.inputs[1])
    field = node(tree, "ShaderNodeMath"); field.operation = "ADD"
    L(inside.outputs["Value"], field.inputs[0]); L(lick2.outputs["Value"], field.inputs[1])
    cut = node(tree, "ShaderNodeMath", idx={1: 0.12}); cut.operation = "SUBTRACT"
    L(field.outputs["Value"], cut.inputs[0])
    d2 = node(tree, "ShaderNodeMath", idx={1: 3.0}); d2.operation = "MULTIPLY"; d2.use_clamp = True
    L(cut.outputs["Value"], d2.inputs[0])
    dens = node(tree, "ShaderNodeMath", idx={1: 9.0}); dens.operation = "MULTIPLY"
    L(d2.outputs["Value"], dens.inputs[0])
    vol = node(tree, "ShaderNodeVolumePrincipled", Color=(0, 0, 0, 1), **{"Emission Color": (1, 1, 1, 1)})
    L(dens.outputs["Value"], vol.inputs["Density"])
    glow = node(tree, "ShaderNodeMath", idx={1: 1.6}); glow.operation = "MULTIPLY"
    L(d2.outputs["Value"], glow.inputs[0])
    L(glow.outputs["Value"], vol.inputs["Emission Strength"])
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    L(vol.outputs["Volume"], out.inputs["Volume"])

    def at(t, total):
        # Noise scrolls upward through the flame; W keeps it boiling.
        rise.inputs["Location"].default_value = (0, 0, -2.4 * t * total / FRAMES)
        noise.inputs["W"].default_value = 1.3 * t * total / FRAMES
    return at


def render_frames(sc, name, count, set_frame):
    os.makedirs(TMP, exist_ok=True)
    frames = []
    for i in range(count):
        set_frame(i)
        sc.render.filepath = os.path.join(TMP, f"{name}_{i:03d}.png")
        bpy.ops.render.render(write_still=True, scene=sc.name)
        img = bpy.data.images.load(sc.render.filepath, check_existing=False)
        img.colorspace_settings.name = "Non-Color"
        px = np.empty(SIZE * SIZE * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        frames.append(px.reshape(SIZE, SIZE, 4))      # rows bottom-up
    return frames


def save_atlas(name, frames):
    atlas = np.zeros((SIZE * COLS, SIZE * COLS, 4), dtype=np.float32)
    for f, px in enumerate(frames):
        row, col = divmod(f, COLS)
        y0 = (COLS - 1 - row) * SIZE                  # row 0 at the top of the image
        atlas[y0:y0 + SIZE, col * SIZE:(col + 1) * SIZE] = px
    img = bpy.data.images.new(f"vfx_{name}", SIZE * COLS, SIZE * COLS, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(atlas.ravel())
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def encode_puff(raw):
    out = []
    for px in raw:
        a = px[..., 3]
        lum = px[..., :3].mean(-1)
        # Normalise by coverage, but not below 0.2, so wispy edges don't flare.
        light = np.clip(lum / np.maximum(a, 0.2) / 0.9, 0, 1) * (a > 0.003)
        out.append(np.stack([a, light, np.zeros_like(a), np.ones_like(a)], -1))
    return out


def encode_flame(raw, loop_blend=16):
    lum = [px[..., :3].mean(-1) for px in raw]
    peak = max(float(l.max()) for l in lum) or 1.0
    enc = [np.stack([px[..., 3], np.clip(l / peak * 1.6, 0, 1), np.clip((l / peak - 0.45) * 2.5, 0, 1),
                     np.ones_like(l)], -1) for px, l in zip(raw, lum)]
    # Seamless loop: cross-fade the extra tail frames into the first ones.
    out = enc[:FRAMES]
    for i in range(loop_blend):
        w = i / loop_blend
        out[i] = enc[FRAMES + i] * (1 - w) + enc[i] * w
    return out


def main(which=("puff", "flame")):
    sc = scene()
    log = {"device": sc.cycles.device}
    if "puff" in which:
        ob, tree = domain(sc, "VFXPuff")
        at = puff_material(tree)
        raw = render_frames(sc, "puff", FRAMES, lambda i: at(i / (FRAMES - 1)))
        log["puff"] = save_atlas("puff", encode_puff(raw))
        bpy.data.objects.remove(ob, do_unlink=True)
    if "flame" in which:
        ob, tree = domain(sc, "VFXFlame")
        at = flame_material(tree)
        total = FRAMES + 16
        raw = render_frames(sc, "flame", total, lambda i: at(i / (FRAMES - 1), FRAMES))
        log["flame"] = save_atlas("flame", encode_flame(raw))
        # Flames are only ever drawn small: ship them at half resolution.
        img = bpy.data.images.load(log["flame"], check_existing=False)
        img.colorspace_settings.name = "Non-Color"
        img.scale(512, 512)
        img.save()
        bpy.data.images.remove(img)
        bpy.data.objects.remove(ob, do_unlink=True)
    return log
