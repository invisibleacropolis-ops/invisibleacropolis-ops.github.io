"""Kakuriyo mountain ranges and the sacred peak, eroded and painted.

Run inside Blender (5.x), after `node tools/blender/sample-terrain.mjs`:
    exec(open(r"<repo>/tools/blender/mountains_build.py").read()); main()

Pipeline (numpy on a 1024^2 grid over [-6500, 6500]):
  1. Relief: ridged ranges whose crests run *around* the valley (noise sampled
     on a circle, so the layers recede like a woodblock print), a broad massif
     swell, and a Fuji-like sacred peak. The relief sits on the game's own
     terrain (sampled from terrain.ts), so foothills rise out of the valley
     and the terrain square's edges disappear inside them.
  2. Hydraulic erosion: hundreds of thousands of raindrops, simulated in
     parallel, carve gullies, spurs and fans; their paths become a flow map.
  3. Paint: snow by altitude, sun aspect and gullies; bare rock on steep
     faces, darkened where water ran; alpine turf; forest on the low slopes;
     cooler with distance. Normals come from a softened height field so the
     toon shader paints broad planes instead of noise.
  4. Tiles: crack-free (borders locked during decimation), each with sampled
     vertex colours and seamless custom normals, exported Draco-compressed.

The hokora ledge (PEAK_LEDGE in mountains.ts) is carved as a flat shelf at
its exact height; the runtime raycasts these tiles for ground, so stories
walk and frame on the real surface.
"""
import bpy, bmesh, math, os, time
import numpy as np

REPO = r"C:\GITLOCAL\invisibleacropolis-ops.github.io"
CACHE = os.path.join(REPO, "tools", "blender", ".cache")
OUT = os.path.join(REPO, "public", "kami", "models", "mountains.glb")
N, EXTENT = 1024, 6500.0
STEP = 2 * EXTENT / (N - 1)

R_IN = 3300.0             # the valley; ranges begin past this radius
R_OUT = 6450.0            # outer cut of the world
SACRED = (-2100.0, -2700.0)
SACRED_R = 2050.0
APEX_Y = 2560.0
LEDGE = (-1494.0, 905.0, -1922.0)
SUN = np.array([-0.55, 0.28, -0.62]); SUN /= np.linalg.norm(SUN)
HIDDEN = -40.0            # relief below the valley floor: tucked under terrain


# ── noise ───────────────────────────────────────────────────────────────────
class Perlin:
    def __init__(self, seed):
        p = np.random.default_rng(seed).permutation(256)
        self.p = np.concatenate([p, p]).astype(np.int64)

    @staticmethod
    def _fade(t):
        return t * t * t * (t * (t * 6 - 15) + 10)

    @staticmethod
    def _grad(h, x, y, z):
        h = h & 15
        u = np.where(h < 8, x, y)
        v = np.where(h < 4, y, np.where((h == 12) | (h == 14), x, z))
        return np.where(h & 1, -u, u) + np.where(h & 2, -v, v)

    def __call__(self, x, y, z):
        xi, yi, zi = (np.floor(a).astype(np.int64) for a in (x, y, z))
        xf, yf, zf = x - xi, y - yi, z - zi
        xi, yi, zi = xi & 255, yi & 255, zi & 255
        u, v, w = self._fade(xf), self._fade(yf), self._fade(zf)
        p = self.p
        a, b = p[xi] + yi, p[xi + 1] + yi
        aa, ab, ba, bb = p[a] + zi, p[a + 1] + zi, p[b] + zi, p[b + 1] + zi
        g = self._grad
        x1 = g(p[aa], xf, yf, zf) + u * (g(p[ba], xf - 1, yf, zf) - g(p[aa], xf, yf, zf))
        x2 = g(p[ab], xf, yf - 1, zf) + u * (g(p[bb], xf - 1, yf - 1, zf) - g(p[ab], xf, yf - 1, zf))
        y1 = x1 + v * (x2 - x1)
        x3 = g(p[aa + 1], xf, yf, zf - 1) + u * (g(p[ba + 1], xf - 1, yf, zf - 1) - g(p[aa + 1], xf, yf, zf - 1))
        x4 = g(p[ab + 1], xf, yf - 1, zf - 1) + u * (g(p[bb + 1], xf - 1, yf - 1, zf - 1) - g(p[ab + 1], xf, yf - 1, zf - 1))
        y2 = x3 + v * (x4 - x3)
        return y1 + w * (y2 - y1)


def fbm(noise, x, y, z, octaves=4, lac=2.0, gain=0.5):
    total, amp, freq, norm = 0.0, 0.5, 1.0, 0.0
    for _ in range(octaves):
        total = total + noise(x * freq, y * freq, z * freq) * amp
        norm += amp; amp *= gain; freq *= lac
    return total / norm


def ridged(noise, x, y, z, octaves=6, lac=2.05, gain=0.5, sharp=2.0):
    """Musgrave ridged multifractal, 0..~1: sharp crests, detail on the crests."""
    total, amp, freq, weight, norm = 0.0, 0.5, 1.0, 1.0, 0.0
    for _ in range(octaves):
        n = (1.0 - np.abs(noise(x * freq, y * freq, z * freq))) ** sharp
        n = n * weight
        weight = np.clip(n * 2.0, 0, 1)
        total = total + n * amp
        norm += amp; amp *= gain; freq *= lac
    return total / norm


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, sigma):
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    out = a
    for axis in (0, 1):
        pad = np.pad(out, [(r, r) if i == axis else (0, 0) for i in range(2)], mode="edge")
        acc = np.zeros_like(out)
        for i, w in enumerate(k):
            sl = [slice(None), slice(None)]; sl[axis] = slice(i, i + out.shape[axis])
            acc += w * pad[tuple(sl)]
        out = acc
    return out


def lin(hexv):
    c = np.array([int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ── 1. relief ───────────────────────────────────────────────────────────────
def grid():
    xs = -EXTENT + np.arange(N) * STEP
    X, Z = np.meshgrid(xs, xs)          # rows: z, cols: x
    return X, Z


def build_relief(T):
    X, Z = grid()
    r = np.hypot(X, Z)
    theta = np.arctan2(Z, X)
    pn, wn, mn = Perlin(11), Perlin(23), Perlin(37)

    # Domain warp keeps the rings from reading as perfect circles.
    warp_t = fbm(wn, np.cos(theta) * 1.3, np.sin(theta) * 1.3, r / 2600, 3) * 0.22
    warp_r = fbm(wn, np.cos(theta) * 2.1 + 9, np.sin(theta) * 2.1, r / 1900, 3) * 520
    th, rr = theta + warp_t, r + warp_r
    # Crests run tangentially: a long wavelength around the circle (circle
    # radius in noise space), a short one across it.
    circ = 1.6
    crest = ridged(pn, np.cos(th) * circ, np.sin(th) * circ, rr / 1150, octaves=6, gain=0.45)
    massif = fbm(mn, np.cos(theta) * 0.9, np.sin(theta) * 0.9, r / 3200, 3) * 0.5 + 0.5
    amplitude = (480 + 1400 * smoothstep(3500, 6100, r)) * (0.55 + 0.8 * massif)
    ramp = smoothstep(R_IN, R_IN + 1150, r)
    rim = 1 - 0.3 * smoothstep(6050, R_OUT, r)
    ridges = amplitude * (0.2 + 0.62 * crest ** 1.35)

    # Summits: a few dominant pyramidal peaks strung along the ranges, the
    # way a real range reads as named mountains joined by ridgelines.
    rng = np.random.default_rng(91)
    summits = np.full_like(r, -1e9)
    lumpy = fbm(wn, X / 520, Z / 520, 2.5, 3)
    for ring_r, count in ((3950, 22), (4800, 24), (5700, 26)):
        for i in range(count):
            a = (i + rng.uniform(-0.35, 0.35)) / count * 2 * np.pi
            rad = ring_r + rng.uniform(-260, 260)
            sx, sz = np.cos(a) * rad, np.sin(a) * rad
            local_amp = np.interp(rad, [3500, 6100], [480, 1880]) * rng.uniform(0.75, 1.3)
            local_amp *= 0.55 + 0.8 * (fbm(mn, np.array(np.cos(a) * 0.9), np.array(np.sin(a) * 0.9), np.array(rad / 3200), 3) * 0.5 + 0.5)
            reach = local_amp * rng.uniform(0.85, 1.15) + 300
            dist = np.hypot(X - sx, Z - sz) * (1 + 0.28 * lumpy)
            # An alpine horn: 3-5 aretes radiate from the summit; between
            # them the faces are dished, so the peak reads as a carved
            # pyramid rather than a cone.
            aretes = rng.integers(3, 6)
            spin = rng.uniform(0, 2 * np.pi)
            ang = np.arctan2(Z - sz, X - sx)
            arete = np.abs(np.cos(aretes * (ang - spin) / 2)) ** 3
            fall = np.clip(1 - dist / reach, 0, 1)
            # Aretes fade in below the summit, which stays a single point.
            below = smoothstep(0.0, 0.3, 1 - fall)
            face = fall ** 1.45 * (1 - 0.34 * (1 - arete) * below)
            summits = np.maximum(summits, local_amp * face)
    detail = ridged(pn, X / 300 + 3.1, Z / 300 - 7.7, rr / 900, octaves=4, sharp=1.8)
    kk = 160.0
    hh = np.clip(0.5 + 0.5 * (summits - ridges) / kk, 0, 1)
    ranges = ridges * (1 - hh) + summits * hh + kk * hh * (1 - hh)
    ranges = ranges * (0.94 + 0.12 * detail)
    ring = ramp * rim * ranges + HIDDEN * (1 - ramp)

    # The sacred peak: a concave stratovolcano with a summit crater.
    d = np.hypot(X - SACRED[0], Z - SACRED[1])
    phi = np.arctan2(Z - SACRED[1], X - SACRED[0])
    t = np.clip(d / SACRED_R, 0, 1)
    t_center = T[np.argmin(np.abs(grid()[1][:, 0] - SACRED[1])), np.argmin(np.abs(grid()[0][0] - SACRED[0]))]
    height_f = APEX_Y - t_center
    profile = (1 - t) ** 1.75
    flutes = 1 + 0.06 * np.sin(phi * 15 + 2.5 * fbm(pn, np.cos(phi) * 2, np.sin(phi) * 2, d / 700, 3)) \
        * smoothstep(0.08, 0.4, t) * (1 - t)
    crater = 85 * np.clip(1 - (d / 150) ** 2, 0, 1) - 25 * smoothstep(150, 260, d) * (1 - smoothstep(260, 420, d))
    # Old lava flows: ridges radiating down the flanks (noise stretched along
    # the radius), strongest mid-slope.
    lava = ridged(pn, np.cos(phi) * 3.2 + 40, np.sin(phi) * 3.2, d / 950, octaves=4, sharp=2.4)
    flows = 1 + 0.09 * (lava - 0.45) * smoothstep(0.12, 0.42, t) * (1 - t) ** 0.6
    fuji = np.where(d < SACRED_R, height_f * profile * flutes * flows - crater, HIDDEN)

    # Polynomial smooth max: the peak's skirt melts into the ranges.
    k = 70.0
    h = np.clip(0.5 + 0.5 * (fuji - ring) / k, 0, 1)
    M = ring * (1 - h) + fuji * h + k * h * (1 - h)
    keep = np.maximum(smoothstep(R_IN, R_IN + 250, r), smoothstep(SACRED_R, SACRED_R * 0.82, d))
    return M, keep, d


# ── 2. erosion ──────────────────────────────────────────────────────────────
def erode(H, region, drops, seed, steps=44, inertia=0.08, capacity=5.0, min_slope=0.015,
          deposit=0.25, erosion=0.3, evaporate=0.022, gravity=6.0, max_change=0.45):
    """Parallel droplet erosion (Lague-style) on heights in cell units."""
    rng = np.random.default_rng(seed)
    h = H / STEP
    flow = np.zeros(N * N)
    cells = np.flatnonzero(region.ravel())
    pick = rng.choice(cells, size=drops, replace=True)
    py = (pick // N) + rng.random(drops)
    px = (pick % N) + rng.random(drops)
    dx = np.zeros(drops); dy = np.zeros(drops)
    speed = np.ones(drops); water = np.ones(drops); sed = np.zeros(drops)
    alive = np.ones(drops, bool)
    brush = [(-1, -1, 1), (0, -1, 2), (1, -1, 1), (-1, 0, 2), (0, 0, 4), (1, 0, 2), (-1, 1, 1), (0, 1, 2), (1, 1, 1)]
    hf = h.ravel()

    def sample(px, py):
        ix = np.clip(px.astype(np.int64), 0, N - 2); iy = np.clip(py.astype(np.int64), 0, N - 2)
        fx, fy = px - ix, py - iy
        i00 = iy * N + ix
        h00, h10, h01, h11 = hf[i00], hf[i00 + 1], hf[i00 + N], hf[i00 + N + 1]
        gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy
        gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx
        hh = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
        return hh, gx, gy, ix, iy, fx, fy

    for _ in range(steps):
        hh, gx, gy, ix, iy, fx, fy = sample(px, py)
        dx = dx * inertia - gx * (1 - inertia)
        dy = dy * inertia - gy * (1 - inertia)
        ln = np.hypot(dx, dy)
        alive &= ln > 1e-9
        ln = np.where(ln > 1e-9, ln, 1)
        dx /= ln; dy /= ln
        nx, ny = px + dx, py + dy
        alive &= (nx > 1) & (nx < N - 2) & (ny > 1) & (ny < N - 2)
        nh = sample(np.clip(nx, 0, N - 1.001), np.clip(ny, 0, N - 1.001))[0]
        dh = nh - hh
        cap = np.maximum(-dh, min_slope) * speed * water * capacity
        depositing = (sed > cap) | (dh > 0)
        dep = np.where(dh > 0, np.minimum(dh, sed), (sed - cap) * deposit)
        dep = np.where(depositing & alive, dep, 0)
        ero = np.where(~depositing & alive, np.minimum((cap - sed) * erosion, -dh), 0)
        i00 = iy * N + ix
        # Drops run in parallel: many can share a channel cell in one step,
        # each seeing the same drop in height. Cap every cell's total change
        # per step and scale each drop's share, or the channel digs itself
        # into a runaway pit.
        for amount in (ero, dep):
            total = np.bincount(i00, amount, N * N)[i00]
            amount *= np.where(total > max_change, max_change / np.maximum(total, 1e-12), 1.0)
        sed = sed + ero - dep
        # Deposit at the four bilinear corners.
        add = np.bincount(i00, dep * (1 - fx) * (1 - fy), N * N)
        add += np.bincount(i00 + 1, dep * fx * (1 - fy), N * N)
        add += np.bincount(i00 + N, dep * (1 - fx) * fy, N * N)
        add += np.bincount(i00 + N + 1, dep * fx * fy, N * N)
        # Erode with a soft 3x3 brush to avoid pits.
        for ox, oy, w in brush:
            add -= np.bincount(np.clip(i00 + oy * N + ox, 0, N * N - 1), ero * (w / 16), N * N)
        hf += add
        flow += np.bincount(i00, water * alive, N * N)
        speed = np.sqrt(np.maximum(0, speed * speed + dh * gravity))
        water *= 1 - evaporate
        px, py = np.where(alive, nx, px), np.where(alive, ny, py)
    return hf.reshape(N, N) * STEP, flow.reshape(N, N)


def thermal(H, iterations=6, talus=1.25, rate=0.35):
    """Let over-steep faces slump into scree (talus in cell units)."""
    h = H / STEP
    for _ in range(iterations):
        delta = np.zeros_like(h)
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            nb = np.roll(h, sh, axis=ax)
            diff = h - nb - talus
            move = np.where(diff > 0, diff * rate * 0.25, 0)
            delta -= move
            delta += np.roll(move, -sh, axis=ax)
        h += delta
    return h * STEP


# ── 3. paint ────────────────────────────────────────────────────────────────
PAL = {k: lin(v) for k, v in {
    "snow": "#f4f1ea", "rock_light": "#8a8d9b", "rock_dark": "#4c5263", "rock_warm": "#94857a",
    "fuji_rock": "#74535a", "alpine": "#788a5a", "forest": "#2e5038", "forest_dark": "#22402e",
    "haze": "#c3ccd6",
}.items()}


def paint(H, T, flow, d, keep):
    X, Z = grid()
    r = np.hypot(X, Z)
    soft = blur(H, 0.75)
    gz, gx = np.gradient(soft, STEP)
    nrm = np.stack([-gx, np.ones_like(gx), -gz], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    slope = np.hypot(gx, gz)
    lit = nrm @ SUN
    shade = np.clip(-lit * 2.5, 0, 1)
    wet = blur(np.log1p(flow), 1.2); wet /= np.percentile(wet[keep > 0.5], 99.5) + 1e-9
    wet = np.clip(wet, 0, 1)
    vn = Perlin(51)
    big = fbm(vn, X / 700, Z / 700, 0.5, 3) * 0.5 + 0.5
    fine = fbm(vn, X / 140 + 4, Z / 140, 1.5, 3) * 0.5 + 0.5
    peak = smoothstep(SACRED_R * 0.95, SACRED_R * 0.6, d)

    rock = PAL["rock_light"] * (1 - fine[..., None]) + PAL["rock_dark"] * fine[..., None]
    rock = rock * (1 - big[..., None] * 0.35) + PAL["rock_warm"] * big[..., None] * 0.35
    rock = rock * (1 - peak[..., None]) + PAL["fuji_rock"] * peak[..., None]
    rock *= (1 - 0.45 * wet)[..., None]                       # water-stained gullies
    # Faint strata on bare rock: alternate harder and softer bands.
    strata = 0.5 + 0.5 * np.sin(H / 46 + 3.0 * fine + 2.0 * big)
    rock *= (1 - 0.13 * strata * smoothstep(0.5, 0.9, slope))[..., None]

    snowline = 1520 + 220 * (big - 0.5) - 260 * shade - 480 * wet + 60 * peak
    snow = smoothstep(snowline - 35, snowline + 35, H)
    snow *= 1 - smoothstep(1.25, 1.9, slope) * (1 - smoothstep(2100, 2350, H))
    treeline = 900 + 190 * (big - 0.5) - 140 * wet
    steep_ok = 0.55 + 0.45 * peak            # forests climb the even volcano flanks
    forest = (1 - smoothstep(treeline - 50, treeline + 50, H)) * (1 - smoothstep(steep_ok, steep_ok + 0.3, slope))
    alpine = (1 - smoothstep(0.45, 0.75, slope)) * (1 - snow) * (1 - forest)
    forest_col = PAL["forest"] * (1 - fine[..., None]) + PAL["forest_dark"] * fine[..., None]

    col = rock
    col = col * (1 - alpine[..., None]) + PAL["alpine"] * alpine[..., None]
    col = col * (1 - forest[..., None]) + forest_col * forest[..., None]
    col = col * (1 - snow[..., None]) + PAL["snow"] * snow[..., None]
    haze = 0.22 * smoothstep(4300, 6400, r)
    col = col * (1 - haze[..., None]) + PAL["haze"] * haze[..., None]
    return np.clip(col, 0, 1), nrm


# ── 4. tiles ────────────────────────────────────────────────────────────────
def bilinear(field, xs, zs):
    fx = (xs + EXTENT) / STEP; fz = (zs + EXTENT) / STEP
    ix = np.clip(fx.astype(np.int64), 0, N - 2); iz = np.clip(fz.astype(np.int64), 0, N - 2)
    tx = np.clip(fx - ix, 0, 1); tz = np.clip(fz - iz, 0, 1)
    if field.ndim == 3:
        tx, tz = tx[:, None], tz[:, None]
    return (field[iz, ix] * (1 - tx) * (1 - tz) + field[iz, ix + 1] * tx * (1 - tz)
            + field[iz + 1, ix] * (1 - tx) * tz + field[iz + 1, ix + 1] * tx * tz)


def build_tiles(H, M, col, nrm, coll, tile=128):
    X, Z = grid()
    r = np.hypot(X, Z)
    visible = (M > HIDDEN + 8) & (r < R_OUT)
    mat = bpy.data.materials.get("mountain") or bpy.data.materials.new("mountain")
    stats = []
    for tz in range(0, N - 1, tile):
        for tx in range(0, N - 1, tile):
            z1, x1 = min(tz + tile, N - 1), min(tx + tile, N - 1)
            cells = visible[tz:z1 + 1, tx:x1 + 1]
            quad = cells[:-1, :-1] | cells[1:, :-1] | cells[:-1, 1:] | cells[1:, 1:]
            if not quad.any():
                continue
            nz, nx = z1 - tz + 1, x1 - tx + 1
            xs = X[tz:z1 + 1, tx:x1 + 1].ravel(); zs = Z[tz:z1 + 1, tx:x1 + 1].ravel()
            hs = H[tz:z1 + 1, tx:x1 + 1].ravel()
            verts = np.stack([xs, -zs, hs], -1)          # three (x, y, z) -> Blender (x, -z, y)
            qi, qj = np.nonzero(quad)
            a = qi * nx + qj
            # Counter-clockwise seen from above, so faces point up.
            faces = np.stack([a, a + nx, a + nx + 1, a + 1], -1)
            me = bpy.data.meshes.new(f"mtn_{tz // tile}_{tx // tile}")
            me.from_pydata(verts.tolist(), [], faces.tolist())
            ob = bpy.data.objects.new(me.name, me)
            coll.objects.link(ob)
            # Lock the tile border so neighbours stay watertight.
            border = np.zeros((nz, nx), bool); border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
            vg = ob.vertex_groups.new(name="free")
            vg.add(np.flatnonzero(~border.ravel()).tolist(), 1.0, "REPLACE")
            vg.add(np.flatnonzero(border.ravel()).tolist(), 0.0, "REPLACE")
            center_r = math.hypot(X[tz, tx] + tile * STEP / 2, Z[tz, tx] + tile * STEP / 2)
            peak_r = math.hypot(X[tz, tx] + tile * STEP / 2 - SACRED[0], Z[tz, tx] + tile * STEP / 2 - SACRED[1])
            ratio = 0.3 if peak_r < SACRED_R else 0.22 if center_r < 4900 else 0.1
            dec = ob.modifiers.new("decimate", "DECIMATE")
            dec.ratio = ratio; dec.vertex_group = "free"; dec.use_collapse_triangulate = True
            dg = bpy.context.evaluated_depsgraph_get()
            new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
            ob.modifiers.clear(); ob.vertex_groups.clear()
            old = ob.data; ob.data = new; new.name = me.name; bpy.data.meshes.remove(old)
            # Remove orphan verts left by masked cells.
            bm = bmesh.new(); bm.from_mesh(new)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            bm.to_mesh(new); bm.free()
            co = np.empty(len(new.vertices) * 3); new.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
            wx, wz = co[:, 0], -co[:, 1]
            n3 = bilinear(nrm, wx, wz)
            n3 /= np.linalg.norm(n3, axis=1, keepdims=True)
            nb = np.stack([n3[:, 0], -n3[:, 2], n3[:, 1]], -1)
            new.shade_smooth()          # flat faces would split every vertex on export
            new.normals_split_custom_set_from_vertices(nb.tolist())
            c3 = bilinear(col, wx, wz)
            attr = new.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
            attr.data.foreach_set("color", np.concatenate([c3, np.ones((len(c3), 1))], 1).ravel())
            new.color_attributes.active_color = attr
            new.materials.append(mat)
            stats.append(len(new.polygons))
    return stats


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
    coll.hide_viewport = coll.hide_render = False
    return coll


def main(stage="all", export=True, drops=420_000):
    t0 = time.time(); log = {}
    os.makedirs(CACHE, exist_ok=True)
    T = np.fromfile(os.path.join(CACHE, "terrain.f32"), dtype=np.float32).reshape(N, N).astype(np.float64)
    cache = os.path.join(CACHE, "mountains_eroded.npz")
    if stage == "all" or not os.path.exists(cache):
        M, keep, d = build_relief(T)
        H = T + M
        region = (M > 40) & (keep > 0.3)
        log["relief_s"] = round(time.time() - t0, 1)
        H, flow1 = erode(H, region, drops, seed=7)
        H, flow2 = erode(H, region, drops, seed=8, steps=40)
        H, flow3 = erode(H, region, drops // 2, seed=9, steps=30)
        H = thermal(H)
        flow = flow1 + flow2 + flow3
        log["erosion_s"] = round(time.time() - t0, 1)
        M = H - T
        M = np.where(keep > 0, HIDDEN * (1 - keep) + M * keep, HIDDEN)
        H = T + M
        # Carve the hokora ledge at its exact height.
        X, Z = grid()
        ld = np.hypot(X - LEDGE[0], Z - LEDGE[2])
        w = smoothstep(110, 50, ld)
        H = H * (1 - w) + LEDGE[1] * w
        M = H - T
        np.savez_compressed(cache, H=H, M=M, flow=flow, d=d, keep=keep)
    else:
        z = np.load(cache); H, M, flow, d, keep = z["H"], z["M"], z["flow"], z["d"], z["keep"]
    col, nrm = paint(H, T, flow, d, keep)
    log["paint_s"] = round(time.time() - t0, 1)
    coll = collection("Mountains")
    tris = build_tiles(H, M, col, nrm, coll)
    log.update(tiles=len(tris), triangles=int(sum(tris)), build_s=round(time.time() - t0, 1),
               apex=float(H.max()), ledge=float(H[np.unravel_index(np.argmin(np.hypot(*(a - b for a, b in zip(grid(), (LEDGE[0], LEDGE[2]))))), H.shape)]))
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
    log["total_s"] = round(time.time() - t0, 1)
    return log
