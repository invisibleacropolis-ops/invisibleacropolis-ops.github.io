"""Kitsune — sculpted rigid-part model for Kakuriyo.

Run inside Blender (5.x):  exec(open(r"<repo>/tools/blender/kitsune_build.py").read()); main()

The kami rig in src/yokai/kamiCharacters.ts is a rigid-piece skeleton: every
mesh hangs off one procedural bone and the code animates the bones (IK legs,
gait, blinking, nine weighted tails). This script builds a replacement mesh
for each bone, in that bone's local space, so the runtime keeps every
behaviour and only the look changes.

Coordinates: all authoring here is in three.js space (Y up, +Z = the fox's
nose) and converted with B(). The glTF exporter's +Y-up conversion turns the
Blender data back into exactly these three.js coordinates.

Materials: the name is the contract with the loader. "_flat" = no ink
outline, "_decal" = drawn with polygon offset on top of the surface.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

REPO = r"C:\GITLOCAL\invisibleacropolis-ops.github.io"
OUT = os.path.join(REPO, "public", "kami", "models", "kitsune.glb")

PALETTE = {
    "coat": "#f0e8db",
    "cream": "#f8f1e3",
    "red": "#b8402f",
    "inner_flat": "#c8604f",
    "mark_flat_decal": "#c4412a",
    "gold": "#d9ad57",
    "iris_flat": "#e3a536",
    "ink_flat": "#28262b",
    "mouth_flat": "#6b2a2c",
    "sclera_flat": "#fbf6ea",
    "shine_flat": "#ffffff",
}


# ── coordinate helpers ──────────────────────────────────────────────────────
def B(v):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def T(v):
    """Blender -> three.js."""
    return Vector((v[0], v[2], -v[1]))


def V3(x=0.0, y=0.0, z=0.0):
    return Vector((x, y, z))


def R3(x=0.0, y=0.0, z=0.0):
    """three.js Euler XYZ as a Blender-space rotation matrix."""
    return Matrix.Rotation(x, 4, "X") @ Matrix.Rotation(y, 4, "Z") @ Matrix.Rotation(-z, 4, "Y")


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def get_mat(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    hexv = PALETTE[name]
    rgb = [lin(int(hexv[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    mat.diffuse_color = (*rgb, 1.0)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    if mat.node_tree:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.85
    return mat


# ── mesh builder (three.js-space API over a Blender bmesh) ──────────────────
class Builder:
    def __init__(self, bm=None, mats=None):
        self.bm = bm or bmesh.new()
        self.mats = list(mats or [])

    def mi(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def tag(self, faces, mat):
        idx = self.mi(mat)
        for f in faces:
            f.material_index = idx

    def ellipsoid(self, c, r, mat="coat", rot=None, seg=20, rings=14):
        m = Matrix.Translation(B(c)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((r[0], r[2], r[1], 1.0))
        return self._sphere(m, mat, seg, rings)

    def ellipsoid_frame(self, c, axes, mat, seg=18, rings=12):
        """axes: three (vector, radius) pairs in three.js space."""
        cols = [B(Vector(a).normalized()) * r for a, r in axes]
        t = B(c)
        m = Matrix(((cols[0].x, cols[1].x, cols[2].x, t.x),
                    (cols[0].y, cols[1].y, cols[2].y, t.y),
                    (cols[0].z, cols[1].z, cols[2].z, t.z),
                    (0, 0, 0, 1)))
        return self._sphere(m, mat, seg, rings)

    def _sphere(self, m, mat, seg, rings):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=m)
        faces = list({f for v in res["verts"] for f in v.link_faces})
        self.tag(faces, mat)
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return faces

    def tube(self, pts, radii, mat="coat", sides=12, flat=1.0, up=(0, 1, 0), cap=True):
        P = [B(p) for p in pts]
        n = len(P)
        tan = [(P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized() for i in range(n)]
        nrm = B(up)
        nrm = nrm - tan[0] * nrm.dot(tan[0])
        if nrm.length < 1e-6:
            nrm = tan[0].orthogonal()
        nrm.normalize()
        rings = []
        for i in range(n):
            if i:
                nrm = nrm - tan[i] * nrm.dot(tan[i])
                if nrm.length < 1e-6:
                    nrm = tan[i].orthogonal()
                nrm.normalize()
            bin_ = tan[i].cross(nrm)
            r = radii[i]
            if r <= 1e-6:
                rings.append([self.bm.verts.new(P[i])])
                continue
            rings.append([self.bm.verts.new(P[i] + bin_ * (math.cos(a) * r) + nrm * (math.sin(a) * r * flat))
                          for a in (2 * math.pi * s / sides for s in range(sides))])
        faces = []
        for i in range(n - 1):
            a, c = rings[i], rings[i + 1]
            if len(a) == 1 and len(c) == 1:
                continue
            for s in range(sides):
                if len(c) == 1:
                    faces.append(self.bm.faces.new((a[s], a[(s + 1) % sides], c[0])))
                elif len(a) == 1:
                    faces.append(self.bm.faces.new((a[0], c[(s + 1) % sides], c[s])))
                else:
                    faces.append(self.bm.faces.new((a[s], a[(s + 1) % sides], c[(s + 1) % sides], c[s])))
        if cap:
            for ring in (rings[0], rings[-1]):
                if len(ring) > 2:
                    faces.append(self.bm.faces.new(ring))
        self.tag(faces, mat)
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return faces

    def tuft(self, base, d, length, width, mat="coat", up=None, bend=(0, -1, 0), bend_amt=0.0,
             flat=0.38, segs=6, sides=8, sink=0.5, swell=0.45):
        """A fur clump: a broad, flattened, curling blade rather than a spike."""
        d = Vector(d).normalized()
        if up is None:
            up = d.orthogonal()
        bendv = Vector(bend)
        b0 = Vector(base) - d * sink
        pts, radii = [], []
        for k in range(segs + 1):
            s = k / segs
            pts.append(b0 + d * (s * (length + sink)) + bendv * (bend_amt * length * s * s))
            radii.append(0.0 if k == segs else width * (1 - s) ** 1.35 * (1 + swell * math.sin(math.pi * s)))
        return self.tube(pts, radii, mat, sides=sides, flat=flat, up=up)

    def ring_tube(self, center, radius, xaxis, zaxis, tube_r, mat, n=48, sides=8):
        xaxis, zaxis = Vector(xaxis).normalized(), Vector(zaxis).normalized()
        pts = [Vector(center) + (xaxis * math.sin(a) + zaxis * math.cos(a)) * radius
               for a in (2 * math.pi * k / n for k in range(n + 1))]
        return self.tube(pts, [tube_r] * len(pts), mat, sides=sides, up=xaxis.cross(zaxis))

    def bisect_assign(self, co, no, mat):
        geom = list(self.bm.verts) + list(self.bm.edges) + list(self.bm.faces)
        bmesh.ops.bisect_plane(self.bm, geom=geom, plane_co=B(co), plane_no=B(no), dist=1e-4)
        idx, c, n = self.mi(mat), B(co), B(Vector(no).normalized())
        for f in self.bm.faces:
            if (f.calc_center_median() - c).dot(n) > 0:
                f.material_index = idx

    def decal(self, bvh, origin, D, center_fn, width_fn, mat="mark_flat_decal", nu=12, nw=2,
              offset=0.05, up=(0, 1, 0)):
        """Project a stroke (centerline + half-width in the plane facing D) onto the surface."""
        Dn = Vector(D).normalized()
        upv = Vector(up)
        Vv = (upv - Dn * upv.dot(Dn)).normalized()
        Uv = Vv.cross(Dn)
        O = Vector(origin)
        rows = []
        for i in range(nu + 1):
            u = i / nu
            a, b = center_fn(u)
            a2, b2 = center_fn(min(1.0, u + 1e-3))
            a1, b1 = center_fn(max(0.0, u - 1e-3))
            ta, tb = a2 - a1, b2 - b1
            ln = math.hypot(ta, tb) or 1.0
            pa, pb = -tb / ln, ta / ln
            w = width_fn(u)
            row = []
            for j in range(-nw, nw + 1):
                s = j / nw
                q = O + Uv * (a + pa * w * s) + Vv * (b + pb * w * s)
                row.append(self.bm.verts.new(project(bvh, q, Dn, offset)))
            rows.append(row)
        faces = []
        for i in range(nu):
            for j in range(2 * nw):
                quad = (rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j])
                faces.append(self.bm.faces.new(quad))
        verts = [v for row in rows for v in row]
        bmesh.ops.remove_doubles(self.bm, verts=verts, dist=1e-4)
        faces = [f for f in faces if f.is_valid]
        bad = [f for f in faces if f.calc_area() < 1e-7]
        if bad:
            bmesh.ops.delete(self.bm, geom=bad, context="FACES")
            faces = [f for f in faces if f.is_valid]
        for f in faces:
            f.normal_update()
        flip = [f for f in faces if f.normal.dot(B(Dn)) < 0]
        if flip:
            bmesh.ops.reverse_faces(self.bm, faces=flip)
        self.tag(faces, mat)
        return faces

    def translate(self, offset, verts=None):
        bmesh.ops.translate(self.bm, verts=list(verts or self.bm.verts), vec=B(offset))

    def rotate(self, rot, pivot=(0, 0, 0), verts=None):
        bmesh.ops.rotate(self.bm, verts=list(verts or self.bm.verts), cent=B(pivot), matrix=rot.to_3x3())


def project(bvh, q, D, offset):
    start = B(q + D * 12)
    loc, nrm, _, _ = bvh.ray_cast(start, -B(D), 60)
    if loc is None:
        return B(q)
    return loc + nrm * offset


def surf(bvh, center, out):
    """Outermost surface point (three.js) seen from direction `out` around `center`."""
    out = Vector(out).normalized()
    start = B(Vector(center) + out * 40)
    loc, nrm, _, _ = bvh.ray_cast(start, -B(out), 80)
    if loc is None:
        return Vector(center), out
    return T(loc), T(nrm).normalized()


# ── object plumbing ─────────────────────────────────────────────────────────
def collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    for ob in list(coll.objects):
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)
    return coll


def bm_to_object(bm, name, mats, coll, location=(0, 0, 0), matrix=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    for m in mats:
        me.materials.append(get_mat(m))
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if matrix is not None:
        ob.matrix_world = matrix
    else:
        ob.location = B(location)
    return ob


def evaluate(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return me


def soften(builder, coll, voxel, iterations, factor, target_tris):
    """Union the blockout with a voxel remesh, relax the joins, reduce to budget."""
    ob = bm_to_object(builder.bm, "_soft", ["coat"], coll)
    builder.bm.free()
    rm = ob.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel
    sm = ob.modifiers.new("smooth", "SMOOTH")
    sm.factor = factor
    sm.iterations = iterations
    me = evaluate(ob)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if target_tris and tris > target_tris:
        dec = ob.modifiers.new("decimate", "DECIMATE")
        dec.ratio = target_tris / tris
        me = evaluate(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        f.material_index = 0
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    return Builder(bm, ["coat"])


def bvh_of(builder):
    builder.bm.verts.ensure_lookup_table()
    return BVHTree.FromBMesh(builder.bm)


# ── rig constants (mirrors the kitsune profile in kamiCharacters.ts) ────────
H = 7.2
BODY_Y = 25
HEAD_Y = 37          # the neck rises: head carried well above the withers
CHEST = V3(0, BODY_Y, 0)
NECK_IN_CHEST = V3(0, HEAD_Y - BODY_Y - H * 0.55, 18)
HEAD_IN_NECK = V3(0, H * 0.55, 2)
JAW_IN_HEAD = V3(0, -H * 0.35, H * 0.45)
EYE_IN_HEAD = lambda s: V3(s * H * 0.43, H * 0.09, H * 0.78)
BROW_IN_HEAD = lambda s: V3(s * H * 0.43, H * 0.37, H * 0.77)
EAR_IN_HEAD = lambda s: V3(s * H * 0.71, H * 0.55, -H * 0.1)
CHARM_IN_NECK = V3(0, -2, H * 0.76)
TAIL_IN_CHEST = V3(0, -0.8, -20 * 0.8)   # set low on the sloping croup
TAIL_SEG, TAIL_LEN = 5, 6.5


# ── parts ───────────────────────────────────────────────────────────────────
def build_chest(coll):
    b = Builder()
    # Fox proportions, checked against a red fox in profile: the topline
    # falls from high withers to a lower croup, the chest is moderate and
    # flows up into the neck rather than jutting forward, and the underline
    # rises steeply from the ribs to a slim loin.
    b.tube([(0, -0.6, -17), (0, 0.7, -8), (0, 1.8, 2), (0, 3.0, 11), (0, 5.4, 16.5)],
           [4.2, 4.5, 4.8, 5.3, 4.8], sides=18, flat=1.1)
    b.ellipsoid((0, 1.0, 7.0), (5.5, 6.3, 9.5))            # ribcage
    b.ellipsoid((0, 2.6, -3.0), (4.2, 4.3, 9.5))           # loins, tucked up
    b.ellipsoid((0, 0.2, -11.5), (5.0, 5.4, 7.5))          # croup and haunches
    for s in (-1, 1):
        b.ellipsoid((s * 3.8, -0.2, 12.8), (2.6, 5.0, 4.0))    # shoulders
        b.ellipsoid((s * 4.2, -1.2, -12.0), (3.0, 5.4, 5.0))   # thighs
    b.ellipsoid((0, 1.8, 14.0), (4.9, 6.0, 4.4))           # modest chest ruff
    b.tube([(0, 2.5, 12.5), (0, 5.8, 16.0), (0, 8.8, 18.6)], [4.9, 4.6, 4.2], sides=16)
    b.ellipsoid((0, -0.6, -17.5), (2.5, 2.5, 2.9))         # tail root, set low
    # Scalloped bib: small soft lobes fused into the front of the chest.
    bib = []
    for i in range(5):
        phi = math.radians(-44 + 22 * i)
        top = V3(math.sin(phi) * 3.2, 0.6, 14.0 + math.cos(phi) * 2.6)
        tip = top + V3(math.sin(phi) * 0.8, -5.2 + abs(i - 2) * 0.8, 0.8)
        b.tube([top, top.lerp(tip, 0.5) + V3(0, 0, 0.5), tip], [1.9, 1.4, 0.0], sides=12)
        bib.append((tip, V3(math.sin(phi) * 0.25, -1, 0.25)))
    b = soften(b, coll, 0.26, 22, 0.65, 3000)
    for f in b.bm.faces:                       # cream bib and belly
        c = T(f.calc_center_median())
        if c.y < -2.6 + max(0.0, c.z - 6) * 0.35 and c.z > -6:
            f.material_index = b.mi("cream")
    bvh = bvh_of(b)
    for tip, d in bib:                         # crisp points on each scallop
        p, n = surf(bvh, tip + V3(0, 3.5, 0), (d.x, -1, d.z))
        b.tuft(p, d, 1.8, 1.05, "cream", up=n, bend=(0, 0, 1), bend_amt=0.3, sink=0.6)
    return b


def build_neck(coll):
    b = Builder()
    b.ellipsoid((0, 0.4, -0.6), (6.0, 6.4, 5.4), "coat", seg=22, rings=16)
    bvh_b = Builder()
    bvh_b.ellipsoid((0, 0.4, -0.6), (6.0, 6.4, 5.4), "coat", seg=22, rings=16)
    bvh = bvh_of(bvh_b)
    # A mane that lies down and sweeps back over the shoulders.
    for row, (r0, r1, step) in enumerate(((-120, 120, 30), (-105, 105, 30))):
        a = r0
        while a <= r1 + 1e-3:
            th = math.radians(a)
            out = V3(math.sin(th), math.cos(th) * 0.95, -0.45 - row * 0.35)
            p, n = surf(bvh, (0, 0.4, -0.6), out)
            d = (out.normalized() * 0.3 + V3(0, -0.25, -1.0)).normalized()
            b.tuft(p, d, 3.6 - row * 0.9, 2.3 - row * 0.4, "cream" if row else "coat", up=n,
                   bend=-n, bend_amt=0.22, sink=1.1)
            a += step
    # Twisted shimenawa cord with its knot resting on the chest.
    tilt = 0.38
    center, radius = V3(0, -0.6, 1.2), 5.7
    xa, za = V3(1, 0, 0), V3(0, -math.sin(tilt), math.cos(tilt))
    ya = V3(0, math.cos(tilt), math.sin(tilt))
    n = 56
    for strand in range(2):
        pts = []
        for k in range(n + 1):
            a = 2 * math.pi * k / n
            radial = xa * math.sin(a) + za * math.cos(a)
            ph = 9 * a + strand * math.pi
            pts.append(center + radial * radius + (radial * math.cos(ph) + ya * math.sin(ph)) * 0.36)
        b.tube(pts, [0.4] * len(pts), "red", sides=6, up=ya)
    return b


def build_charm(coll):
    b = Builder()
    b.tube([(0, 0.4, 0), (0, -0.3, 0.1), (0, -0.8, 0.15)], [0.25, 0.22, 0.2], "red", sides=8)
    b.ring_tube((0, -0.95, 0.15), 0.42, (1, 0, 0), (0, 1, 0), 0.13, "gold", n=16, sides=6)
    b.ellipsoid((0, -2.25, 0.2), (1.35, 1.25, 1.35), "gold", seg=20, rings=14)
    b.ellipsoid((0, -2.5, 1.42), (0.9, 0.17, 0.22), "ink_flat", rot=R3(x=-0.45), seg=12, rings=6)
    b.ellipsoid((0, -2.95, 1.12), (0.18, 0.4, 0.18), "ink_flat", rot=R3(x=-0.7), seg=8, rings=6)
    b.ellipsoid((-0.45, -1.75, 1.17), (0.28, 0.22, 0.08), "shine_flat", rot=R3(y=-0.35, x=-0.2), seg=8, rings=6)
    return b


def build_head(coll):
    b = Builder()
    b.ellipsoid((0, 0.6, -0.4), (5.7, 5.3, 5.9))              # cranium
    b.ellipsoid((0, 1.6, 2.6), (4.4, 3.6, 3.6))               # forehead
    for s in (-1, 1):
        b.ellipsoid((s * 3.4, -1.7, 0.4), (2.7, 2.5, 3.2))    # cheeks
    b.tube([(0, -0.9, 3.0), (0, -1.1, 7.0), (0, -1.35, 10.5), (0, -1.5, 12.7)],
           [3.0, 2.4, 1.6, 1.0], flat=0.82, sides=16)         # muzzle
    b.tube([(0, 1.6, 2.6), (0, 0.4, 7.5), (0, -0.55, 11.8)], [2.1, 1.5, 0.9], sides=12)  # nose bridge
    b = soften(b, coll, 0.15, 9, 0.55, 2600)
    bvh = bvh_of(b)
    # Nose and the dark mouth that shows when the jaw opens.
    b.ellipsoid((0, -1.0, 12.85), (1.2, 0.78, 0.9), "ink_flat", rot=R3(x=0.25), seg=16, rings=10)
    b.ellipsoid((0, -2.6, 7.4), (1.6, 0.55, 4.4), "mouth_flat", seg=14, rings=8)
    # Flared cheek ruffs: the fox's signature silhouette.
    for s in (-1, 1):
        for k, (y, ln, w) in enumerate(((-0.8, 4.4, 2.0), (-2.2, 3.8, 1.8), (-3.5, 2.8, 1.4))):
            p, n = surf(bvh, (s * 2.0, y, 0.2), (s, -0.1 * k, -0.35))
            b.tuft(p, (s * 0.9, -0.3 - k * 0.22, -0.75), ln, w, "cream", up=n, bend=(0, 1, 0),
                   bend_amt=0.22, sink=1.0)
    # A small forelock between the ears.
    for s, k in ((-1, 0), (1, 1), (0, 2)):
        p, n = surf(bvh, (s * 0.9, 3, -1), (s * 0.2, 1, 0.15))
        b.tuft(p, (s * 0.25, 0.45, -1), 3.4 - k * 0.5, 1.15, "coat", up=n, bend=(0, 1, 0), bend_amt=0.2, sink=0.7)

    # Red kitsune-mask markings, projected onto the face.
    b.decal(bvh, (0, 2.6, 4.5), (0, 0.55, 0.84),
            lambda u: (0.22 * math.sin(u * math.pi * 1.6), -0.9 + 3.8 * u),
            lambda u: 0.72 * math.sin(math.pi * u) ** 0.55 * (1 - 0.55 * u), nu=14)
    eyes = {}
    for s in (-1, 1):
        e = eye_frame(bvh, s)
        eyes[s] = e
        outer = e["c"] + e["r"] * 1.45 + e["u"] * 0.15
        D = (e["f"] * 0.6 + V3(s * 0.8, 0.15, -0.1)).normalized()
        b.decal(bvh, outer, D,
                lambda u, s=s: (s * 3.2 * u, 0.25 + 1.5 * u + 0.6 * u * u),
                lambda u: 0.5 * (1 - u) ** 0.8 * min(1.0, u * 5 + 0.35), nu=12)
        low = e["c"] - e["u"] * 1.25 + e["r"] * 0.2
        D2 = (e["f"] * 0.7 + V3(s * 0.6, -0.3, 0.0)).normalized()
        b.decal(bvh, low, D2,
                lambda u, s=s: (s * 2.6 * u, -0.5 * u - 0.3 * u * u),
                lambda u: 0.36 * (1 - u) ** 0.9 * min(1.0, u * 5 + 0.25), nu=10)
    return b, bvh, eyes


def eye_frame(bvh, s):
    E = EYE_IN_HEAD(s)
    F0 = V3(s * 0.62, 0.1, 0.78).normalized()
    hit, nrm = surf(bvh, E - F0 * 2, F0)
    f = (nrm * 0.6 + F0 * 0.4).normalized()
    up = V3(0, 1, 0)
    u = (up - f * up.dot(f)).normalized()
    r = (u.cross(f)) * s                       # +r = outer corner on both sides
    th = 0.3                                    # outer corner tilted upwards
    r2 = r * math.cos(th) + u * math.sin(th)
    u2 = u * math.cos(th) - r * math.sin(th)
    return {"c": hit + f * 0.05, "f": f, "r": r2, "u": u2, "bone": E}


def build_eye(e):
    b = Builder()
    c, f, r, u = e["c"], e["f"], e["r"], e["u"]
    P = lambda x, y, z: c + r * x + u * y + f * z

    def layer(cx, cy, cz, rx, ry, rz, mat, seg=18, rings=10):
        b.ellipsoid_frame(P(cx, cy, cz), ((r, rx), (u, ry), (f, rz)), mat, seg=seg, rings=rings)

    layer(0, 0, 0, 1.5, 0.95, 0.3, "sclera_flat")
    layer(-0.12, -0.04, 0.17, 0.86, 0.88, 0.2, "iris_flat")
    layer(-0.12, -0.04, 0.3, 0.2, 0.68, 0.12, "ink_flat", seg=12, rings=8)
    layer(-0.45, 0.32, 0.42, 0.22, 0.2, 0.06, "shine_flat", seg=10, rings=6)
    layer(0.22, -0.42, 0.4, 0.1, 0.09, 0.05, "shine_flat", seg=8, rings=6)
    liner, radii = [], []
    for k in range(13):
        t = k / 12
        a = math.pi * (1 - t)
        liner.append(P(1.5 * math.cos(a), 0.95 * math.sin(a) + 0.08, 0.2))
        radii.append(0.07 + 0.17 * t)
    liner += [P(1.95, 0.42, 0.12), P(2.35, 0.78, 0.04)]
    radii += [0.14, 0.0]
    b.tube(liner, radii, "ink_flat", sides=8, flat=0.55, up=f)
    b.tube([P(0.3, -0.92, 0.2), P(1.0, -0.72, 0.18), P(1.6, -0.2, 0.14)], [0.07, 0.06, 0.0],
           "mark_flat_decal", sides=6, flat=0.5, up=f)
    b.translate(-e["bone"])
    return b


def build_brow(bvh, s):
    """Flame-shaped brow mark (its own bone, so it can lift with expression)."""
    b = Builder()
    Bp = BROW_IN_HEAD(s)
    D = V3(s * 0.35, 0.55, 0.76).normalized()
    b.decal(bvh, Bp + V3(-s * 0.4, 0.2, 0), D,
            lambda u: (s * (1.4 * u), 0.15 + 0.9 * u + 0.5 * u * u),
            lambda u: 0.55 * math.sin(math.pi * min(1.0, u * 1.05)) ** 0.6 * (1 - 0.6 * u), nu=10, offset=0.09)
    b.translate(-Bp)
    return b


def build_ear(s):
    b = Builder()
    path = lambda t: V3(s * 1.5 * t ** 1.6, -1.6 + 10.4 * t, 0.55 * math.sin(math.pi * t) - 0.3 * t)
    ts = [k / 12 for k in range(13)]
    b.tube([path(t) for t in ts], [0.0 if t == 1 else 3.05 * (1 - t) ** 0.72 for t in ts],
           "coat", sides=14, flat=0.4, up=(0, 0, 1))
    inner = [t for t in ts if 0.12 <= t <= 0.86]
    b.tube([path(t) + V3(0, 0, 0.62) for t in inner],
           [1.9 * (1 - t) ** 0.8 if t < 0.86 else 0.0 for t in inner],
           "inner_flat", sides=12, flat=0.22, up=(0, 0, 1))
    for k in range(3):
        b.tuft(V3(s * (-0.6 + k * 0.6), 0.8 + k * 0.4, 0.95), (s * (0.15 + k * 0.2), 1, 0.35),
               3.4 - k * 0.6, 0.75, "cream", up=(0, 0, 1), sink=0.3)
    b.rotate(R3(y=s * 0.35, z=-s * 0.06))
    return b


def build_jaw():
    b = Builder()
    b.tube([(0, 0.0, -0.8), (0, 0.35, 3.0), (0, 0.6, 6.0), (0, 0.85, 8.7)],
           [2.5, 2.1, 1.45, 0.75], "cream", sides=16, flat=0.55)
    b.tuft((0, -0.4, 1.0), (0, -0.7, -0.8), 2.2, 1.0, "cream", up=(0, -1, 0.3), sink=0.4)
    return b


# Canine leg segments, each in its bone's frame: the bone hangs along -Y and
# +Z stays roughly forward. Lengths match the kitsune `canine` profile.
FRONT = {"upper": 9.0, "lower": 12.0, "cannon": math.hypot(2.4, 0.4),
         "origin": (4.4, 23.5, 15.0), "rise": (2.4, -0.4)}
HIND = {"upper": 9.6, "lower": 9.8, "cannon": math.hypot(6.2, 2.2),
        "origin": (5.2, 21.8, -13.0), "rise": (6.2, -2.2)}


def build_front_upper(coll):
    """Shoulder and upper arm: mostly inside the chest, elbow points back."""
    L = FRONT["upper"]
    b = Builder()
    b.ellipsoid((0, 0.4, 0.2), (2.3, 2.6, 2.5))                    # shoulder
    b.tube([(0, 1.0, 0), (0, -3.5, 0.1), (0, -6.5, 0), (0, -L, 0)], [2.6, 2.4, 2.0, 1.7], sides=16)
    b.ellipsoid((0, -4.8, -1.0), (1.9, 3.4, 2.0))                  # triceps
    b.ellipsoid((0, -L - 0.2, -1.1), (1.15, 1.25, 1.1))            # point of the elbow
    b = soften(b, coll, 0.12, 8, 0.55, 600)
    bvh = bvh_of(b)
    p, n = surf(bvh, (0, -L + 0.5, 0), (0, -0.2, -1))
    b.tuft(p, (0, -0.75, -0.65), 2.0, 1.1, "cream", up=n, bend=(0, -1, 0), bend_amt=0.2, sink=0.5)
    return b


def build_front_lower(coll):
    """Forearm: a straight, slim column with a little feathering behind."""
    L = FRONT["lower"]
    b = Builder()
    b.ellipsoid((0, 0, 0), (1.7, 1.7, 1.7))
    # Tapers straight into the pastern: no knob at the wrist, which read as
    # an extra joint.
    b.tube([(0, 0.4, 0), (0, -3.5, 0.05), (0, -7.5, 0.05), (0, -L - 0.4, 0)], [1.65, 1.35, 1.05, 0.95], sides=14)
    b.ellipsoid((0, -2.6, -0.45), (1.35, 3.1, 1.5))                # flexor muscles
    b = soften(b, coll, 0.1, 6, 0.5, 520)
    b.bisect_assign((0, -5.4, 0), (0, -1, 0.15), "red")
    bvh = bvh_of(b)
    p, n = surf(bvh, (0, -3.2, 0), (0, 0, -1))
    b.tuft(p, (0, -0.85, -0.5), 2.0, 1.0, "cream", up=n, bend=(0, -1, 0), bend_amt=0.2, sink=0.4)
    return b


def build_cannon(coll, length, top_r, bottom_r, knob=1.1):
    """Pastern / metatarsus: a short red stocking down to the paw."""
    b = Builder()
    b.ellipsoid((0, 0, 0), (top_r * knob, top_r * knob, top_r * knob))
    b.tube([(0, 0.3, 0), (0, -length * 0.5, 0.05), (0, -length + 0.2, 0)], [top_r, (top_r + bottom_r) / 2, bottom_r], sides=12)
    b = soften(b, coll, 0.09, 5, 0.5, 300)
    for f in b.bm.faces:
        f.material_index = b.mi("red")
    return b


def build_hind_upper(coll):
    """Hip and thigh: a heavy ham behind the femur, stifle forward."""
    L = HIND["upper"]
    b = Builder()
    b.ellipsoid((0, -3.4, -1.4), (3.3, 5.8, 4.0))                  # ham
    b.tube([(0, 1.0, 0), (0, -3.5, 0.2), (0, -6.5, 0.2), (0, -L, 0.3)], [3.0, 2.7, 2.1, 1.75], sides=16)
    b.ellipsoid((0, -L, 0.4), (1.7, 1.7, 1.8))                     # stifle
    b = soften(b, coll, 0.13, 8, 0.55, 650)
    bvh = bvh_of(b)
    for k, y in enumerate((-4.5, -6.8)):
        p, n = surf(bvh, (0, y, -1), (0, -0.2, -1))
        b.tuft(p, (0, -0.85, -0.5), 3.0 - k * 0.7, 1.9 - k * 0.4, "cream", up=n,
               bend=(0, -1, 0), bend_amt=0.25, sink=0.8)
    return b


def build_hind_lower(coll):
    """Shin: calf at the back, tapering into the Achilles and the hock."""
    L = HIND["lower"]
    b = Builder()
    b.ellipsoid((0, 0, 0), (1.75, 1.75, 1.75))
    b.tube([(0, 0.4, 0), (0, -3.0, 0), (0, -6.5, 0), (0, -L, 0)], [1.75, 1.45, 1.0, 0.9], sides=14)
    b.ellipsoid((0, -2.6, -0.9), (1.45, 3.2, 1.8))                 # calf
    b.ellipsoid((0, -L + 0.1, -0.85), (0.85, 1.15, 1.05))          # point of the hock
    b = soften(b, coll, 0.1, 6, 0.5, 520)
    b.bisect_assign((0, -6.9, 0), (0, -1, 0.1), "red")
    return b


def build_paw(coll):
    b = Builder()
    # A fox's paw is small and oval, toes bunched, sitting under the pastern.
    b.ellipsoid((0, -0.6, 0.75), (1.65, 1.1, 2.2))
    for x in (-1.05, -0.35, 0.35, 1.05):
        b.ellipsoid((x * 0.95, -1.05, 2.4 - abs(x) * 0.35), (0.56, 0.55, 0.72))
    b.ellipsoid((0, -0.55, -0.55), (1.2, 0.95, 1.1))
    b.tube([(0, -0.4, 0), (0, 1.0, -0.1)], [1.05, 0.95], sides=12)
    b = soften(b, coll, 0.1, 5, 0.5, 450)
    for f in b.bm.faces:
        f.material_index = b.mi("red")
    return b


def build_tail(coll):
    b = Builder()
    total = TAIL_SEG * TAIL_LEN
    core_t = [k / 16 for k in range(17)]

    def width(t):
        # Slender root, a full plume through the middle, a long brush tip.
        return 4.3 * (0.3 + math.sin(min(1.0, t * 1.08) ** 0.8 * math.pi) * 0.82) * min(1.0, (1 - t) * 4.5 + 0.03)

    def center(t):
        return V3(0, 3.6 * t ** 3, 0.8 - (total + 0.4) * t)

    b.tube([center(t) for t in core_t], [width(t) if t < 1 else 0.0 for t in core_t], sides=14)
    # Soft lobes spiralling round the plume give a cloud-edged, wind-combed
    # silhouette once the remesh fuses them.
    for k in range(13):
        t0 = 0.14 + k * 0.055
        ang = k * 2.4
        out = V3(math.cos(ang), math.sin(ang), 0)
        base = center(t0) + out * width(t0) * 0.55
        pts, radii = [], []
        for j in range(6):
            s = j / 5
            pts.append(base + out * (width(t0) * 0.5 * s) + V3(0, 0.9 * s * s, -6.5 * s))
            radii.append(0.0 if j == 5 else width(t0) * 0.42 * (1 - s) ** 0.8)
        b.tube(pts, radii, sides=10)
    b = soften(b, coll, 0.2, 9, 0.6, 900)
    b.bisect_assign((0, 0.5, -23.5), (0.0, 0.42, -1.0), "red")
    bvh = bvh_of(b)
    # A few combed flicks at the brush tip.
    for k, ang in enumerate((1.2, 4.0)):
        out = V3(math.cos(ang), math.sin(ang), -0.8)
        p, n = surf(bvh, center(0.84), out)
        b.tuft(p, (math.cos(ang) * 0.3, math.sin(ang) * 0.3 + 0.25, -1), 2.2, 1.5, "red", up=n,
               bend=(0, 1, 0), bend_amt=0.25, sink=0.7, sides=6)
    return b


# ── assembly ────────────────────────────────────────────────────────────────
def main(export=True, preview=True):
    parts_coll = collection("KitsuneParts")
    parts_coll.hide_viewport = parts_coll.hide_render = False
    prev_coll = collection("KitsunePreview")
    work = collection("_KitsuneWork")
    parts = {}
    parts["chest"] = build_chest(work)
    parts["neck"] = build_neck(work)
    parts["charm"] = build_charm(work)
    head, head_bvh, eyes = build_head(work)
    parts["head"] = head
    parts["jaw"] = build_jaw()
    for s, tag in ((-1, "n"), (1, "p")):
        parts[f"eye_{tag}"] = build_eye(eyes[s])
        parts[f"brow_{tag}"] = build_brow(head_bvh, s)
        parts[f"ear_{tag}"] = build_ear(s)
    parts["leg_front_upper"] = build_front_upper(work)
    parts["leg_front_lower"] = build_front_lower(work)
    parts["leg_front_cannon"] = build_cannon(work, FRONT["cannon"], 0.95, 0.92, knob=1.0)
    parts["leg_hind_upper"] = build_hind_upper(work)
    parts["leg_hind_lower"] = build_hind_lower(work)
    parts["leg_hind_cannon"] = build_cannon(work, HIND["cannon"], 0.95, 0.9)
    parts["paw"] = build_paw(work)
    parts["tail"] = build_tail(work)
    bpy.data.collections.remove(work)

    stats = {}
    objects = {}
    for name, b in parts.items():
        bmesh.ops.triangulate(b.bm, faces=list(b.bm.faces))
        stats[name] = len(b.bm.faces)
        objects[name] = bm_to_object(b.bm, name, b.mats, parts_coll)

    if preview:
        head_w = CHEST + NECK_IN_CHEST + HEAD_IN_NECK
        neck_w = CHEST + NECK_IN_CHEST
        place = {
            "chest": CHEST, "neck": neck_w, "head": head_w, "jaw": head_w + JAW_IN_HEAD,
            "charm": neck_w + CHARM_IN_NECK,
        }
        for s, tag in ((-1, "n"), (1, "p")):
            place[f"eye_{tag}"] = head_w + EYE_IN_HEAD(s)
            place[f"brow_{tag}"] = head_w + BROW_IN_HEAD(s)
            place[f"ear_{tag}"] = head_w + EAR_IN_HEAD(s)
        for name, at in place.items():
            ob = objects[name].copy()
            ob.name = f"pv_{name}"
            prev_coll.objects.link(ob)
            ob.location = B(at)
        # Legs at rest, solved with the runtime's own two-bone IK.
        def aim(v):
            return B(V3(0, -1, 0)).rotation_difference(B(v.normalized())).to_matrix().to_4x4()

        for front in (True, False):
            spec = FRONT if front else HIND
            (ox, oy, oz), rise, pole_z = spec["origin"], V3(0, *spec["rise"]), -1 if front else 1
            tag = "front" if front else "hind"
            for s in (-1, 1):
                O = V3(s * ox, oy, oz)
                P = V3(s * 6.1, 1.76, 12 if front else -12)
                W = P + rise
                d = W - O
                dist = min(d.length, spec["upper"] + spec["lower"] - 1e-3)
                d.normalize()
                pole = V3(s * 0.1, 0, pole_z)
                bend = (pole - d * pole.dot(d)).normalized()
                along = (spec["upper"] ** 2 - spec["lower"] ** 2 + dist ** 2) / (2 * dist)
                height = math.sqrt(max(0.0, spec["upper"] ** 2 - along ** 2))
                J = O + d * along + bend * height
                W = O + d * dist
                for name, at, toward in ((f"leg_{tag}_upper", O, J), (f"leg_{tag}_lower", J, W),
                                         (f"leg_{tag}_cannon", W, W - rise)):
                    ob = objects[name].copy()
                    prev_coll.objects.link(ob)
                    ob.matrix_world = Matrix.Translation(B(at)) @ aim(toward - at)
                pw = objects["paw"].copy()
                prev_coll.objects.link(pw)
                pw.location = B(W - rise)
        for i in range(9):
            spread = (i - 4) * 0.25
            pitch = 0.42 + (i % 3) * 0.15
            tl = objects["tail"].copy()
            prev_coll.objects.link(tl)
            tl.matrix_world = Matrix.Translation(B(CHEST + TAIL_IN_CHEST)) @ R3(x=pitch, y=spread)

    if export:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        for ob in bpy.context.view_layer.objects:
            ob.select_set(False)
        for ob in parts_coll.objects:
            ob.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
            export_apply=True, export_texcoords=False, export_normals=True,
            export_materials="EXPORT", export_animations=False, export_skins=False,
            export_morph=False, export_extras=False, export_cameras=False, export_lights=False,
        )
        parts_coll.hide_viewport = True
        parts_coll.hide_render = True
    return {"triangles": stats, "total": sum(stats.values()), "out": OUT if export else None,
            "bytes": os.path.getsize(OUT) if export and os.path.exists(OUT) else None}
