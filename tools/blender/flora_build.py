"""Kakuriyo flora: stylised tree and shrub variants for instancing.

Run inside Blender (5.x):  exec(open(r"<repo>/tools/blender/flora_build.py").read()); main()

Every variant is two meshes, `<species>_<n>_trunk` and `<species>_<n>_crown`
(bushes are crown only), with the base at the origin, y up, in three.js
units. Crowns are clusters of blobs fused by a voxel remesh, so they read as
the soft cloud masses of a painted background; trunks and branches are
fused the same way so joints flow. Colour is baked per vertex: light on top,
shaded underneath, darker toward the heart of the crown, with flower
speckles on the bushes. The runtime multiplies a per-instance tint on top.

Species: sakura (3), pine (3, cloud-pruned niwaki), cedar (2, sugi), maple
(2, red and orange), bush (2, azalea), bamboo (2).
"""
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector

REPO = r"C:\GITLOCAL\invisibleacropolis-ops.github.io"
OUT = os.path.join(REPO, "public", "kami", "models", "flora.glb")
_kit = {"__name__": "kitsune_build"}
exec(open(os.path.join(REPO, "tools", "blender", "kitsune_build.py")).read(), _kit)
Builder, soften, B, T, V3 = _kit["Builder"], _kit["soften"], _kit["B"], _kit["T"], _kit["V3"]


def lin(hexv):
    c = np.array([int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ── shape helpers ───────────────────────────────────────────────────────────
def limb(b, start, end, r0, r1, bend=(0, 0, 0), sides=10, segs=6):
    """A tapering, gently curved branch from start to end."""
    s, e, bv = Vector(start), Vector(end), Vector(bend)
    pts = [s.lerp(e, k / segs) + bv * math.sin(math.pi * k / segs) for k in range(segs + 1)]
    b.tube(pts, [r0 + (r1 - r0) * k / segs for k in range(segs + 1)], sides=sides)
    return e


def fuse(b, voxel, iterations, target, coll):
    return soften(b, coll, voxel, iterations, 0.5, target)


# ── colour baking ───────────────────────────────────────────────────────────
def bake(b, top, under, centers=(), heart=0.0, speckle=None, seed=0):
    """Vertex colours (linear) from normal.y, height and crown depth."""
    bm = b.bm
    bm.normal_update()
    rng = np.random.default_rng(seed)
    ys = [T(v.co).y for v in bm.verts]
    lo, hi = min(ys), max(ys)
    layer = bm.loops.layers.float_color.new("Color")
    top, under = lin(top), lin(under)
    vcol = {}
    for v in bm.verts:
        p = T(v.co)
        n = T(v.normal)
        up = 0.5 + 0.5 * n.y
        h = (p.y - lo) / max(1e-6, hi - lo)
        k = np.clip(0.65 * up + 0.35 * h, 0, 1)
        col = under * (1 - k) + top * k
        if centers:
            depth = min((p - Vector(c)).length / r for c, r in centers)
            col = col * (1 - heart * np.clip(1 - depth, 0, 1))
        col = col * (0.94 + 0.12 * rng.random())
        if speckle and rng.random() < speckle[1] * up:
            col = lin(speckle[0]) * (0.9 + 0.2 * rng.random())
        vcol[v.index] = col
    for f in bm.faces:
        for loop in f.loops:
            c = vcol[loop.vert.index]
            loop[layer] = (c[0], c[1], c[2], 1.0)


def emit(b, name, coll):
    bmesh.ops.triangulate(b.bm, faces=list(b.bm.faces))
    me = bpy.data.meshes.new(name)
    b.bm.to_mesh(me)
    b.bm.free()
    me.shade_smooth()
    mat = bpy.data.materials.get("flora") or bpy.data.materials.new("flora")
    me.materials.append(mat)
    # Corner colours export as two COLOR sets (three.js reads only the
    # first, which comes out white): store them per vertex instead.
    corner = me.color_attributes.get("Color")
    if corner is not None and corner.domain == "CORNER":
        cc = np.empty(len(corner.data) * 4); corner.data.foreach_get("color", cc); cc = cc.reshape(-1, 4)
        vidx = np.empty(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", vidx)
        pc = np.zeros((len(me.vertices), 4)); pc[vidx] = cc
        me.color_attributes.remove(corner)
        point = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        point.data.foreach_set("color", pc.ravel())
    if me.color_attributes:
        me.color_attributes.active_color = me.color_attributes[0]
        me.color_attributes.render_color_index = 0
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return len(me.polygons)


# ── species ─────────────────────────────────────────────────────────────────
def sakura(rng, work):
    trunk, crown, centers = Builder(), Builder(), []
    lean = V3(rng.uniform(-6, 6), 0, rng.uniform(-6, 6))
    top = V3(0, 30, 0) + lean
    limb(trunk, (0, -3, 0), top, 5.6, 3.6, bend=(rng.uniform(-3, 3), 0, rng.uniform(-3, 3)))
    trunk.ellipsoid((0, 0.5, 0), (7.5, 3.2, 7.5))                      # root flare
    n = rng.integers(4, 6)
    for i in range(n):
        a = (i + rng.uniform(-0.3, 0.3)) / n * 2 * math.pi
        reach = rng.uniform(22, 34)
        end = top + V3(math.cos(a) * reach, rng.uniform(14, 26), math.sin(a) * reach)
        limb(trunk, top - V3(0, 4, 0), end, 3.0, 1.3, bend=(0, 5, 0))
        for k in range(rng.integers(2, 4)):
            c = end + V3(rng.uniform(-7, 7), rng.uniform(-2, 6), rng.uniform(-7, 7))
            r = rng.uniform(13, 18)
            crown.ellipsoid(tuple(c), (r, r * 0.68, r))
            centers.append((c, r * 1.6))
    c = top + V3(0, 30, 0)
    crown.ellipsoid(tuple(c), (20, 14, 20)); centers.append((c, 30))
    trunk = fuse(trunk, 0.9, 4, 160, work)
    crown = fuse(crown, 1.7, 8, 460, work)
    bake(trunk, "#7a5a48", "#3f2c25", seed=1)
    bake(crown, "#fcd6e1", "#c6719a", centers, heart=0.35, speckle=("#fff2f5", 0.06), seed=2)
    return trunk, crown


def pine(rng, work):
    trunk, crown, centers = Builder(), Builder(), []
    lean = rng.uniform(-1, 1)
    spine = [V3(0, -3, 0), V3(lean * 9, 22, rng.uniform(-3, 3)), V3(lean * 4, 46, rng.uniform(-4, 4)), V3(lean * 12, 70, 0)]
    trunk.tube(spine, [5.0, 4.0, 3.2, 2.2], sides=10)
    trunk.ellipsoid((0, 0.5, 0), (6.5, 3, 6.5))
    for i in range(rng.integers(4, 7)):
        t = 0.3 + i * 0.13
        k = min(int(t * 3), 2)
        base = spine[k].lerp(spine[k + 1], t * 3 - k)
        a = rng.uniform(0, 2 * math.pi)
        reach = rng.uniform(17, 30) * (1.1 - t * 0.5)
        end = base + V3(math.cos(a) * reach, rng.uniform(-2, 6), math.sin(a) * reach)
        limb(trunk, base, end, 2.0, 0.9, bend=(0, -3, 0), sides=8)
        r = rng.uniform(11, 15) * (1.1 - t * 0.4)
        for j in range(2):
            c = end + V3(rng.uniform(-5, 5), 3 + j * 1.5, rng.uniform(-5, 5))
            crown.ellipsoid(tuple(c), (r, r * 0.38, r * 0.9)); centers.append((c, r * 1.4))
    c = spine[-1] + V3(0, 4, 0)
    crown.ellipsoid(tuple(c), (13, 6, 12)); centers.append((c, 18))
    trunk = fuse(trunk, 0.8, 4, 130, work)
    crown = fuse(crown, 1.3, 6, 340, work)
    bake(trunk, "#6b5246", "#33261f", seed=3)
    bake(crown, "#4f845b", "#1f3c2c", centers, heart=0.3, seed=4)
    return trunk, crown


def cedar(rng, work):
    trunk, crown, centers = Builder(), Builder(), []
    height = rng.uniform(140, 175)
    limb(trunk, (0, -3, 0), (rng.uniform(-3, 3), height * 0.9, rng.uniform(-3, 3)), 4.6, 1.2, sides=8, segs=4)
    trunk.ellipsoid((0, 0.5, 0), (6, 3, 6))
    tiers = rng.integers(7, 10)
    for i in range(tiers):
        t = i / (tiers - 1)
        y = 32 + t * (height - 30)
        r = 24 * (1 - t) ** 0.9 + 5
        c = V3(rng.uniform(-2, 2), y, rng.uniform(-2, 2))
        crown.ellipsoid(tuple(c), (r, r * 0.5 + 4, r)); centers.append((c, r * 1.3))
    crown.ellipsoid((0, height + 6, 0), (4, 12, 4))
    trunk = fuse(trunk, 0.9, 3, 70, work)
    crown = fuse(crown, 1.6, 6, 320, work)
    bake(trunk, "#6e5040", "#352720", seed=5)
    bake(crown, "#3f6b5a", "#1b3830", centers, heart=0.25, seed=6)
    return trunk, crown


def maple(rng, work, palette):
    trunk, crown, centers = Builder(), Builder(), []
    fork = V3(rng.uniform(-3, 3), 24, rng.uniform(-3, 3))
    limb(trunk, (0, -3, 0), fork, 4.6, 3.0)
    trunk.ellipsoid((0, 0.5, 0), (6, 3, 6))
    for i in range(3):
        a = i / 3 * 2 * math.pi + rng.uniform(-0.4, 0.4)
        end = fork + V3(math.cos(a) * 15, rng.uniform(16, 24), math.sin(a) * 15)
        limb(trunk, fork, end, 2.4, 1.1, bend=(0, 3, 0))
    for i in range(rng.integers(7, 10)):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(4, 20)
        c = fork + V3(math.cos(a) * rr, rng.uniform(20, 38), math.sin(a) * rr)
        r = rng.uniform(11, 16)
        crown.ellipsoid(tuple(c), (r, r * 0.82, r)); centers.append((c, r * 1.5))
    trunk = fuse(trunk, 0.8, 4, 140, work)
    crown = fuse(crown, 1.5, 8, 420, work)
    bake(trunk, "#6a4a3e", "#33231d", seed=7)
    bake(crown, palette[0], palette[1], centers, heart=0.3, speckle=(palette[2], 0.05), seed=8)
    return trunk, crown


def bush(rng, work, flower):
    crown, centers = Builder(), []
    for i in range(rng.integers(5, 8)):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0, 9)
        r = rng.uniform(6, 10)
        c = V3(math.cos(a) * rr, r * 0.55, math.sin(a) * rr)
        crown.ellipsoid(tuple(c), (r, r * 0.75, r)); centers.append((c, r * 1.4))
    crown = fuse(crown, 0.9, 6, 200, work)
    bake(crown, "#5d8b4f", "#2c4a2b", centers, heart=0.25, speckle=(flower, 0.32), seed=9)
    return None, crown


def bamboo(rng, work):
    trunk, crown = Builder(), Builder()
    height = rng.uniform(112, 138)
    curve = V3(rng.uniform(-6, 6), 0, rng.uniform(-6, 6))
    pts, radii = [], []
    for k in range(15):
        t = k / 14
        pts.append(V3(0, -3 + t * height, 0) + curve * t * t)
        node = (k % 2 == 0)
        radii.append((1.75 - t * 0.7) * (1.18 if node else 1.0))
    trunk.tube(pts, radii, sides=6)
    # Leaf fans: several sprays from the upper nodes, each a hand of blades.
    for spray in range(7):
        t = 0.45 + 0.55 * (spray / 6) ** 0.8
        base = V3(0, -3 + t * height, 0) + curve * t * t
        a0 = rng.uniform(0, 2 * math.pi)
        twig = base + V3(math.cos(a0) * 6, 2, math.sin(a0) * 6)
        crown.tube([base, twig], [0.45, 0.3], sides=4)
        for blade in range(3):
            a = a0 + rng.uniform(-0.7, 0.7)
            d = V3(math.cos(a), rng.uniform(-0.65, -0.15), math.sin(a)).normalized()
            crown.tuft(tuple(twig), tuple(d), rng.uniform(16, 24), 2.6, up=(0, 1, 0), bend=(0, -1, 0),
                       bend_amt=0.4, flat=0.16, segs=3, sides=3, sink=0.2, swell=0.7)
    bake(trunk, "#97c06a", "#5d8243", seed=10)
    bake(crown, "#7eb05c", "#3f6a34", seed=11)
    return trunk, crown


# ── assembly ────────────────────────────────────────────────────────────────
def main(export=True):
    coll = _kit["collection"]("Flora")
    work = _kit["collection"]("_FloraWork")
    rng = np.random.default_rng(2024)
    recipes = (
        [("sakura", lambda: sakura(rng, work))] * 3
        + [("pine", lambda: pine(rng, work))] * 3
        + [("cedar", lambda: cedar(rng, work))] * 2
        + [("maple", lambda: maple(rng, work, ("#e8643f", "#962a22", "#f59a5f"))),
           ("maple", lambda: maple(rng, work, ("#f2a046", "#b4532a", "#ffd07a")))]
        + [("bush", lambda: bush(rng, work, "#d8569b")), ("bush", lambda: bush(rng, work, "#f4eef2"))]
        + [("bamboo", lambda: bamboo(rng, work))] * 2
    )
    counts, tris = {}, {}
    for species, make in recipes:
        n = counts.get(species, 0); counts[species] = n + 1
        trunk, crown = make()
        if trunk is not None:
            tris[f"{species}_{n}_trunk"] = emit(trunk, f"{species}_{n}_trunk", coll)
        tris[f"{species}_{n}_crown"] = emit(crown, f"{species}_{n}_crown", coll)
    bpy.data.collections.remove(work)
    # Lay the variants out in a row so the preview can show them side by side.
    for i, ob in enumerate(sorted(coll.objects, key=lambda o: o.name)):
        ob.location = (0, 0, 0)
    log = {"variants": sum(counts.values()), "triangles": tris}
    if export:
        for ob in bpy.context.view_layer.objects:
            ob.select_set(False)
        for ob in coll.objects:
            ob.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
            export_texcoords=False, export_normals=True, export_vertex_color="ACTIVE",
            export_materials="EXPORT", export_animations=False, export_skins=False, export_morph=False,
            export_cameras=False, export_lights=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
            export_draco_position_quantization=14, export_draco_normal_quantization=8,
            export_draco_color_quantization=8,
        )
        log["bytes"] = os.path.getsize(OUT)
    return log
