"""Kakuriyo architecture kit: torii, stone lanterns, pagoda, honden, komainu, minka.

Run inside Blender (5.x):  exec(open(r"<repo>/tools/blender/arch_build.py").read()); main()

Each structure is a set of part objects named `<structure>_<part>`, all
sharing the structure's origin (base centre, facing +z, three.js units, y up).
Parts stay separate where the game needs separate bounds: torii posts are
their own meshes, so navigation sees a gateway rather than a wall.

Every vertex carries a colour (palette + baked shading: eave undersides and
ground contact darkened) and a `_surface` id the runtime shader turns into
procedural detail with no UVs or textures:
  0 plain/lacquer  1 roof tiles  2 wood  3 stone  4 thatch  5 plaster  6 glow
Dimensions match the procedural pieces in architecture.ts / village.ts so the
occupancy footprints, torii path and pagoda perch are unchanged.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix

REPO = r"C:\GITLOCAL\invisibleacropolis-ops.github.io"
OUT = os.path.join(REPO, "public", "kami", "models", "architecture.glb")
_kit = {"__name__": "kitsune_build"}
exec(open(os.path.join(REPO, "tools", "blender", "kitsune_build.py")).read(), _kit)
Builder, soften, B, T, V3, R3 = _kit["Builder"], _kit["soften"], _kit["B"], _kit["T"], _kit["V3"], _kit["R3"]

# name -> (sRGB colour, surface id)
PAL = {
    "vermilion": ("#d0442a", 0), "vermilion_dark": ("#a3321f", 0), "lacquer": ("#2b2522", 0),
    "gold": ("#e0b354", 0), "glow": ("#ffe2a0", 6), "paper": ("#f4efe2", 5), "plaster": ("#ede5d2", 5),
    "tile": ("#3f5064", 1), "ridge": ("#2c3644", 1), "wood": ("#7d4230", 2), "wood_dark": ("#4f2c1f", 2),
    "timber": ("#5f4432", 2), "deck": ("#8a5a40", 2), "stone": ("#a8a89e", 3), "stone_dark": ("#7d7d72", 3),
    "thatch": ("#b39463", 4), "thatch_dark": ("#7c6440", 4), "rope": ("#d9c48a", 4), "white": ("#fbfaf5", 0),
}


def lin(hexv):
    c = np.array([int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ── primitive helpers (three.js space) ──────────────────────────────────────
def box(b, c, size, mat, rot=None):
    m = Matrix.Translation(B(c)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((size[0], size[2], size[1], 1))
    res = bmesh.ops.create_cube(b.bm, size=1.0, matrix=m)
    faces = list({f for v in res["verts"] for f in v.link_faces})
    b.tag(faces, mat)
    return faces


def cyl(b, c, r0, r1, h, mat, segs=12, rot=None):
    """Frustum standing on c (base centre), height h along +y."""
    m = Matrix.Translation(B((c[0], c[1] + h / 2, c[2]))) @ (rot or Matrix.Identity(4))
    res = bmesh.ops.create_cone(b.bm, cap_ends=True, cap_tris=False, segments=segs,
                                radius1=r0, radius2=max(r1, 1e-4), depth=h, matrix=m)
    faces = list({f for v in res["verts"] for f in v.link_faces})
    b.tag(faces, mat)
    return faces


def beam(b, x0, x1, y_of, height, depth, mat, n=16, z=0.0):
    """A rectangular beam along x whose centreline follows y_of(x) (a curve)."""
    rings = []
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        y = y_of(x)
        hz, hy = depth / 2, height / 2
        rings.append([b.bm.verts.new(B((x, y + sy * hy, z + sz * hz))) for sy, sz in ((-1, -1), (-1, 1), (1, 1), (1, -1))])
    faces = []
    for k in range(n):
        a, c = rings[k], rings[k + 1]
        for s in range(4):
            faces.append(b.bm.faces.new((a[s], a[(s + 1) % 4], c[(s + 1) % 4], c[s])))
    faces.append(b.bm.faces.new(rings[0][::-1]))
    faces.append(b.bm.faces.new(rings[-1]))
    bmesh.ops.recalc_face_normals(b.bm, faces=faces)
    b.tag(faces, mat)
    return faces


def hip_roof(b, y0, hw, hd, rise, mat, curve=1.7, lift=0.0, thick=3.0, n=22, ridge=None, ridge_r=1.8):
    """Concave hip roof over [-hw,hw]x[-hd,hd] with eaves at y0 and corners
    lifted (the Japanese sori). Optional ridge and hip caps."""
    nx = n
    nz = max(6, int(round(n * hd / hw)))
    m0 = min(hw, hd)

    def height(x, z):
        m = min(hw - abs(x), hd - abs(z))
        s = max(0.0, m / m0)
        corner = ((abs(x) / hw) * (abs(z) / hd)) ** 3
        return y0 + rise * s ** curve + lift * corner * (1 - s) ** 1.5

    grid = []
    for j in range(nz + 1):
        z = -hd + 2 * hd * j / nz
        row = []
        for i in range(nx + 1):
            x = -hw + 2 * hw * i / nx
            row.append(b.bm.verts.new(B((x, height(x, z), z))))
        grid.append(row)
    faces = []
    for j in range(nz):
        for i in range(nx):
            faces.append(b.bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1])))
    bmesh.ops.recalc_face_normals(b.bm, faces=faces)
    for f in faces:
        f.normal_update()
    if sum(f.normal.z for f in faces) < 0:          # Blender z = three y: make the roof face up
        bmesh.ops.reverse_faces(b.bm, faces=faces)
    b.tag(faces, mat)
    res = bmesh.ops.solidify(b.bm, geom=faces, thickness=thick)
    b.tag([g for g in res["geom"] if isinstance(g, bmesh.types.BMFace)], mat)
    if ridge:
        top = y0 + rise
        rx = max(0.0, hw - m0) * 0.98
        rz = max(0.0, hd - m0) * 0.98
        if rx > 1:
            b.tube([(-rx - 2, top + 0.6, 0), (rx + 2, top + 0.6, 0)], [ridge_r, ridge_r], ridge, sides=8)
        elif rz > 1:
            b.tube([(0, top + 0.6, -rz - 2), (0, top + 0.6, rz + 2)], [ridge_r, ridge_r], ridge, sides=8)
        for sx in (-1, 1):
            for sz in (-1, 1):
                pts = []
                for k in range(9):
                    t = k / 8
                    x = sx * (rx + (hw - rx) * t)
                    z = sz * (rz + (hd - rz) * t)
                    pts.append((x * 0.99, height(x * 0.99, z * 0.99) + 1.0, z * 0.99))
                b.tube(pts, [ridge_r * 0.8] * len(pts), ridge, sides=6)
                # A small upturned tile at each corner tip.
                b.ellipsoid((sx * hw * 0.99, height(sx * hw * 0.99, sz * hd * 0.99) + 1.6, sz * hd * 0.99),
                            (ridge_r * 1.3, ridge_r * 1.1, ridge_r * 1.3), ridge, seg=8, rings=6)
    return height


# ── structures ──────────────────────────────────────────────────────────────
def torii():
    posts = [Builder(), Builder()]
    top = Builder()
    for k, side in enumerate((-1, 1)):
        p = posts[k]
        lean = R3(z=side * 0.035)              # torii posts lean in (uchikorobi)
        cyl(p, (side * 50, 0, 0), 6.6, 5.6, 93, "vermilion", segs=14, rot=lean)
        cyl(p, (side * 50, 0, 0), 8.6, 8.2, 6, "lacquer", segs=14)                 # kamebara base
        cyl(p, (side * 48.5, 84, 0), 6.6, 6.6, 5, "lacquer", segs=14)              # daiwa collar
    # Shimaki and the black kasagi above it, both with upswept ends.
    beam(top, -75, 75, lambda x: 94 + 4.5 * (abs(x) / 75) ** 2.4, 6, 10, "vermilion", n=20)
    beam(top, -81, 81, lambda x: 101 + 8.0 * (abs(x) / 81) ** 2.2, 8.5, 13, "lacquer", n=24)
    beam(top, -64, 64, lambda x: 66, 7, 7.5, "vermilion", n=4)                      # nuki
    for side in (-1, 1):
        box(top, (side * 57.5, 66, 0), (3, 8.5, 8.5), "vermilion_dark")              # kusabi wedges
    box(top, (0, 80, 0), (6.5, 22, 6), "vermilion")                                  # gakuzuka strut
    box(top, (0, 80, 3.6), (16, 22, 2), "lacquer")                                   # gaku plaque
    box(top, (0, 80, 4.7), (11, 16, 0.6), "gold")
    return {"post_l": posts[0], "post_r": posts[1], "beams": top}


def lantern():
    stone, glow = Builder(), Builder()
    cyl(stone, (0, 0, 0), 12.5, 11.5, 5, "stone_dark", segs=6)                        # kiso base
    cyl(stone, (0, 5, 0), 10, 6, 4, "stone", segs=6)                                  # lotus step
    cyl(stone, (0, 9, 0), 4.2, 3.6, 22, "stone", segs=10)                             # sao shaft
    cyl(stone, (0, 19, 0), 5, 5, 2.2, "stone", segs=10)                               # knot
    cyl(stone, (0, 31, 0), 5.5, 10, 5, "stone", segs=6)                               # chudai
    for k in range(6):                                                                # hibukuro frame
        a = k / 6 * 2 * math.pi
        box(stone, (math.cos(a) * 7.4, 42, math.sin(a) * 7.4), (2.2, 12, 2.2), "stone", R3(y=-a))
    cyl(stone, (0, 35.5, 0), 9, 9, 1.4, "stone", segs=6)
    cyl(stone, (0, 47.5, 0), 9, 9, 1.4, "stone", segs=6)
    cyl(glow, (0, 37, 0), 6.4, 6.4, 10.5, "glow", segs=6)                             # the flame chamber
    cyl(stone, (0, 48.5, 0), 15.5, 3, 8.5, "stone", segs=6)                           # kasa roof
    for k in range(6):                                                                # warabite curls
        a = k / 6 * 2 * math.pi + math.pi / 6
        stone.ellipsoid((math.cos(a) * 14.6, 50.2, math.sin(a) * 14.6), (2.2, 1.9, 2.2), "stone", seg=8, rings=6)
    cyl(stone, (0, 56.5, 0), 3.6, 4.2, 1.6, "stone", segs=10)                         # ukebana
    stone.ellipsoid((0, 60.5, 0), (3.6, 3.4, 3.6), "stone", seg=10, rings=8)          # hoju jewel
    cyl(stone, (0, 63, 0), 1.6, 0.05, 3.2, "stone", segs=8)
    return {"stone": stone, "glow": glow}


def pagoda():
    parts = {}
    base = Builder()
    box(base, (0, 4, 0), (124, 8, 124), "stone")
    box(base, (0, 2, 66), (40, 4, 14), "stone_dark")                                 # front steps
    parts["base"] = base
    y, w = 8.0, 150.0
    for level in range(5):
        body = Builder()
        bw = w * 0.6
        bh = 50 - level * 4
        hb = bw / 2
        box(body, (0, y + bh / 2, 0), (bw - 4, bh, bw - 4), "plaster" if level else "wood")
        for sx in (-1, 0, 1):                                                         # posts
            for sz in (-1, 0, 1):
                if sx == 0 and sz == 0:
                    continue
                cyl(body, (sx * (hb - 1), y, sz * (hb - 1)), 2.9, 2.9, bh, "vermilion", segs=8)
        for yy in (y + 1.5, y + bh - 3):                                              # nuki bands
            for rot in (0, math.pi / 2):
                for s in (-1, 1):
                    box(body, (s * (hb - 1) if rot else 0, yy, 0 if rot else s * (hb - 1)),
                        (3 if rot else bw, 3, bw if rot else 3), "vermilion")
        for k in range(4):                                                            # doors / lattice
            a = k * math.pi / 2
            fx, fz = math.sin(a), math.cos(a)
            c = (fx * (hb - 1.6), y + bh * 0.48, fz * (hb - 1.6))
            panel = R3(y=a)
            box(body, c, (bw * 0.36, bh * 0.62, 1.2), "vermilion_dark" if level == 0 else "paper", panel)
            if level:
                for g in range(-2, 3):
                    box(body, (c[0] + fx * 0.5 + math.cos(a) * g * bw * 0.07, c[1], c[2] + fz * 0.5 - math.sin(a) * g * bw * 0.07),
                        (0.9, bh * 0.62, 0.9), "wood_dark", panel)
                box(body, (c[0] + fx * 0.5, c[1], c[2] + fz * 0.5), (bw * 0.36, 0.9, 0.9), "wood_dark", panel)
        if level:                                                                     # balcony + railing
            box(body, (0, y + 1, 0), (bw + 16, 2, bw + 16), "wood")
            for s in (-1, 1):
                for rot in (False, True):
                    box(body, (s * (hb + 7) if rot else 0, y + 7, 0 if rot else s * (hb + 7)),
                        (1.6 if rot else bw + 16, 1.6, bw + 16 if rot else 1.6), "vermilion")
                    for k in range(-4, 5):
                        off = k * (bw + 14) / 8
                        box(body, (s * (hb + 7) if rot else off, y + 4, off if rot else s * (hb + 7)), (1.2, 6, 1.2), "vermilion")
        top = y + bh
        for s in (-1, 1):                                                             # eave brackets
            for k in range(-3, 4):
                off = k * bw / 6.5
                for rot in (False, True):
                    c = (s * (hb + 4) if rot else off, top + 2.5, off if rot else s * (hb + 4))
                    box(body, c, (9 if rot else 3, 3.5, 3 if rot else 9), "vermilion")
                    box(body, (c[0], c[1] + 3, c[2]), (11 if rot else 4, 2.5, 4 if rot else 11), "wood_dark")
        parts[f"tier{level}"] = body
        roof = Builder()
        hip_roof(roof, top + 6, w * 0.5, w * 0.5, w * 0.17, "tile", curve=1.8, lift=w * 0.07,
                 thick=3.2, n=20, ridge="ridge", ridge_r=1.9)
        parts[f"roof{level}"] = roof
        y = top + 6 + w * 0.17 - 10
        w *= 0.86
    spire = Builder()
    box(spire, (0, y + 4, 0), (14, 8, 14), "gold")
    cyl(spire, (0, y + 8, 0), 6, 4, 6, "gold", segs=12)
    cyl(spire, (0, y + 8, 0), 1.6, 1.6, 74, "gold", segs=8)
    for k in range(9):                                                                # kurin rings
        ring = spire.ring_tube((0, y + 18 + k * 5.2, 0), 6.5 - k * 0.32, (1, 0, 0), (0, 0, 1), 1.1, "gold", n=16, sides=6)
    spire.ellipsoid((0, y + 72, 0), (5, 3, 5), "gold", seg=10, rings=6)              # suien
    spire.ellipsoid((0, y + 78, 0), (3, 3.6, 3), "gold", seg=10, rings=8)            # hoju
    parts["spire"] = spire
    return parts


def honden():
    hall, roof = Builder(), Builder()
    box(hall, (0, 4, 0), (138, 8, 108), "stone")
    box(hall, (0, 4, 66), (54, 8, 26), "stone_dark")                                 # front steps
    for k in range(4):
        box(hall, (0, 9.5 + k * 3, 58 - k * 5), (44, 3, 6), "wood")
    for sx in range(-3, 4):                                                           # floor posts
        for sz in (-2, -1, 0, 1, 2):
            cyl(hall, (sx * 18, 8, sz * 18), 2.4, 2.4, 12, "wood_dark", segs=8)
    box(hall, (0, 21, 0), (134, 3, 100), "deck")                                     # floor + engawa
    for sx in (-1, 1):                                                                # veranda railing
        for k in range(-6, 7):
            box(hall, (sx * 65, 26, k * 7.5), (1.4, 8, 1.4), "vermilion")
        box(hall, (sx * 65, 30, 0), (2, 2, 98), "vermilion")
    for k in range(-8, 9):
        if abs(k) > 2:
            box(hall, (k * 7.8, 26, -48), (1.4, 8, 1.4), "vermilion")
    box(hall, (0, 30, -48), (132, 2, 2), "vermilion")
    for sx in (-2, -1, 0, 1, 2):                                                      # wall posts
        for sz in (-1, 1):
            cyl(hall, (sx * 27, 22.5, sz * 38), 3, 3, 46, "vermilion", segs=10)
    for sz in (-1, 0, 1):
        for sx in (-1, 1):
            cyl(hall, (sx * 54, 22.5, sz * 38), 3, 3, 46, "vermilion", segs=10)
    box(hall, (0, 45, 0), (106, 44, 74), "plaster")
    for k in range(-1, 2):                                                            # front doors
        box(hall, (k * 27, 40, 37.6), (22, 34, 1.4), "wood" if k else "wood_dark")
        for g in range(1, 4):
            box(hall, (k * 27, 26 + g * 9, 38.4), (22, 0.8, 0.8), "gold")
    for yy in (24, 66):
        box(hall, (0, yy, 0), (110, 3, 78), "vermilion")
    for s in (-1, 1):                                                                 # brackets
        for k in range(-5, 6):
            box(hall, (k * 10, 69, s * 40), (3.5, 4, 8), "vermilion")
    # Shimenawa rope with zig-zag shide papers across the front.
    rope = [(x, 63 - 4 * math.cos(x / 52 * math.pi / 2), 47) for x in np.linspace(-52, 52, 15)]
    hall.tube(rope, [2.6] * len(rope), "rope", sides=8)
    for x in (-36, -12, 12, 36):
        for k in range(4):
            box(hall, (x + (k % 2) * 1.6, 58 - k * 3.4, 47.5), (3.2, 3.2, 0.5), "white")
    h = hip_roof(roof, 70, 86, 64, 36, "tile", curve=1.75, lift=9, thick=3.4, n=24, ridge="ridge", ridge_r=2.2)
    # Irimoya gables at the ridge ends, and chigi / katsuogi on the ridge.
    for s in (-1, 1):
        gx = s * 22
        tri = [roof.bm.verts.new(B(p)) for p in ((gx, 92, -14), (gx, 92, 14), (gx, 106.5, 0))]
        f = roof.bm.faces.new(tri)
        f.normal_update()
        roof.tag([f], "wood")
        box(roof, (gx, 92, 0), (1.5, 2, 30), "vermilion")
        for zz in (-1, 1):
            box(roof, (s * 24, 113, zz * 4), (2, 18, 1.6), "wood_dark", R3(x=zz * 0.55))
    for k in range(-2, 3):
        roof.tube([(k * 9, 108.2, -6), (k * 9, 108.2, 6)], [2.0, 2.0], "wood_dark", sides=8)
        for zz in (-1, 1):
            cyl(roof, (k * 9, 108.2, zz * 6.4), 2.1, 2.1, 0.8, "gold", segs=8, rot=R3(x=math.pi / 2))
    return {"hall": hall, "roof": roof}


def komainu(work):
    b = Builder()
    box(b, (0, 6, 0), (30, 12, 44), "stone_dark")
    box(b, (0, 14, 0), (26, 4, 38), "stone")
    b.ellipsoid((0, 25, -8), (10, 8, 12))                      # haunches (sitting)
    b.ellipsoid((0, 32, 4), (9, 11, 9))                         # chest
    for s in (-1, 1):
        b.tube([(s * 5.5, 30, 8), (s * 5.5, 16, 11)], [3.4, 3.0], sides=10)    # forelegs
        b.ellipsoid((s * 5.5, 17, 13), (3.8, 2.4, 4.6))                          # paws
        b.ellipsoid((s * 8, 22, -9), (4, 6, 7))                                   # hind legs
    b.ellipsoid((0, 46, 8), (10, 9.5, 9))                       # head
    b.ellipsoid((0, 43, 15), (6.5, 5, 6))                       # muzzle
    for k in range(14):                                         # mane curls
        a = k / 14 * 2 * math.pi
        b.ellipsoid((math.cos(a) * 9.5, 44 + math.sin(a) * 8.5, 3), (3.2, 3.2, 3.2))
    for k in range(6):                                          # curling flame tail
        t = k / 5
        b.ellipsoid((math.sin(t * 3) * 4, 30 + t * 18, -16 + t * 4), (4 - t * 1.5, 4 - t * 1.5, 4 - t * 1.5))
    sculpt = soften(b, work, 0.6, 5, 0.45, 2400)
    for f in sculpt.bm.faces:
        f.material_index = sculpt.mi("stone")
    for s in (-1, 1):                                           # bulging eyes and brows
        sculpt.ellipsoid((s * 4.2, 48, 15.5), (2.2, 2.0, 1.6), "stone_dark", seg=10, rings=8)
        sculpt.ellipsoid((s * 4.2, 51.5, 14.2), (3.6, 1.4, 2), "stone", seg=10, rings=6)
    sculpt.ellipsoid((0, 41, 20.6), (3.4, 1.4, 1.2), "stone_dark", seg=10, rings=6)    # open mouth (a-gyo)
    return {"body": sculpt}


def minka(rng, w, d, rise, leanto=False):
    body, roof = Builder(), Builder()
    hw, hd = w / 2, d / 2
    box(body, (0, 2, 0), (w + 6, 4, d + 6), "stone")
    box(body, (0, 17, 0), (w - 2, 26, d - 2), "plaster")
    box(body, (0, 7.5, 0), (w - 1, 8, d - 1), "timber")                              # koshi-ita boards
    for k in range(int(w // 22) + 1):                                                 # posts
        x = -hw + 1.5 + k * (w - 3) / max(1, int(w // 22))
        for s in (-1, 1):
            box(body, (x, 17, s * (hd - 0.5)), (3.4, 30, 3.4), "timber")
    for k in range(int(d // 22) + 1):
        z = -hd + 1.5 + k * (d - 3) / max(1, int(d // 22))
        for s in (-1, 1):
            box(body, (s * (hw - 0.5), 17, z), (3.4, 30, 3.4), "timber")
    box(body, (0, 31.5, 0), (w + 1, 3, d + 1), "timber")
    box(body, (w * 0.1, 15, hd + 0.4), (20, 24, 1.2), "wood_dark")                   # doorway
    for k in (-1, 1):
        box(body, (w * 0.1 + k * 24, 18, hd + 0.4), (18, 16, 1), "paper")            # shoji windows
    box(body, (0, 5, hd + 8), (w * 0.8, 2, 14), "deck")                              # engawa
    for k in range(-3, 4):
        cyl(body, (k * w * 0.12, 0, hd + 14), 1.4, 1.4, 4, "timber", segs=6)
    hip_roof(roof, 30, hw + 15, hd + 15, rise, "thatch", curve=1.12, lift=0, thick=7.5, n=18,
             ridge="thatch_dark", ridge_r=3.4)
    top = 30 + rise
    for s in (-1, 1):                                                                 # smoke gables
        gx = s * max(6.0, (hw - hd) * 0.85)
        tri = [roof.bm.verts.new(B(p)) for p in ((gx, top - 14, -9), (gx, top - 14, 9), (gx, top + 1, 0))]
        f = roof.bm.faces.new(tri)
        roof.tag([f], "wood_dark")
    span = max(4.0, hw - hd)
    for k in range(int(span // 9) + 3):                                               # umanori ridge logs
        x = -span - 4 + k * 9
        box(roof, (x, top + 3, 0), (3, 3, 13), "lacquer")
    if leanto:                                                                        # side shed
        box(body, (hw + 16, 11, 0), (28, 18, d * 0.55), "timber")
        shed = [(hw + 2, 26, -d * 0.32), (hw + 34, 18, -d * 0.32), (hw + 34, 18, d * 0.32), (hw + 2, 26, d * 0.32)]
        vs = [roof.bm.verts.new(B(p)) for p in shed]
        f = roof.bm.faces.new(vs)
        res = bmesh.ops.solidify(roof.bm, geom=[f], thickness=4)
        roof.tag([f] + [g for g in res["geom"] if isinstance(g, bmesh.types.BMFace)], "thatch")
    return {"body": body, "roof": roof}


# ── colour, shading and export ──────────────────────────────────────────────
def emit(b, name, coll):
    bm = b.bm
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_flat()
    nv = len(me.vertices)
    col = np.ones((nv, 4)); surf = np.zeros(nv)
    co = np.empty(nv * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    for poly in me.polygons:
        hexv, sid = PAL[b.mats[poly.material_index]]
        c = lin(hexv)
        ny = poly.normal.z                                # Blender z = three y
        shade = 0.72 if ny < -0.5 else 1.0                # eave undersides
        for vi in poly.vertices:
            y = co[vi, 2]
            ground = 0.82 + 0.18 * min(1.0, max(0.0, y / 10.0))
            col[vi, :3] = c * shade * ground
            surf[vi] = sid
    attr = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", col.ravel())
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = 0
    s = me.attributes.new("_surface", "FLOAT", "POINT")
    s.data.foreach_set("value", surf)
    mat = bpy.data.materials.get("architecture") or bpy.data.materials.new("architecture")
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return len(me.polygons)


def main(export=True):
    coll = _kit["collection"]("Architecture")
    work = _kit["collection"]("_ArchWork")
    rng = np.random.default_rng(77)
    kit = {
        "torii": torii(), "lantern": lantern(), "pagoda": pagoda(), "honden": honden(),
        "komainu": komainu(work),
        "minka0": minka(rng, 110, 72, 58), "minka1": minka(rng, 128, 80, 66), "minka2": minka(rng, 98, 66, 54, leanto=True),
    }
    bpy.data.collections.remove(work)
    tris = {}
    for structure, parts in kit.items():
        for part, b in parts.items():
            # Flat shading keeps hard architectural edges, so vertices must be
            # unique per face for the colours: split before emitting.
            bmesh.ops.split_edges(b.bm, edges=list(b.bm.edges))
            tris[f"{structure}_{part}"] = emit(b, f"{structure}_{part}", coll)
    log = {"parts": len(tris), "triangles": sum(tris.values()), "by_part": tris}
    if export:
        for ob in bpy.context.view_layer.objects:
            ob.select_set(False)
        for ob in coll.objects:
            ob.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=OUT, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
            export_texcoords=False, export_normals=True, export_vertex_color="ACTIVE", export_attributes=True,
            export_materials="EXPORT", export_animations=False, export_skins=False, export_morph=False,
            export_cameras=False, export_lights=False,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
            export_draco_position_quantization=14, export_draco_normal_quantization=8,
            export_draco_color_quantization=8, export_draco_generic_quantization=8,
        )
        log["bytes"] = os.path.getsize(OUT)
    return log
