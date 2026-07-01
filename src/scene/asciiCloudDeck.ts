import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   ASCII Cloud Deck — an atmospheric stratum of glyph-clouds

   Where asciiClouds.ts stages rare, structured sigil events, this
   module is the weather itself: thousands of ASCII characters
   clustered into flat-bottomed cumulus puffs and thin cirrus
   sheets, drifting on a shared wind across the whole valley.

   Rendering: every character is a point sprite sampling a glyph
   atlas texture, so an entire cloud is ONE draw call. Vertex
   colors shade the puffs (lit tops, shaded bellies) so they read
   as volume, not confetti.
   ═══════════════════════════════════════════════════════════════ */

export type AsciiCloudDeck = {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  dispose: () => void;
};

export type AsciiCloudDeckOptions = {
  seed?: number;
  /** Width/depth of the world the deck should cover. */
  worldSize?: number;
  /** Altitude of the cumulus layer's flat base. */
  baseAltitude?: number;
  /** Altitude of the thin cirrus sheets above. */
  cirrusAltitude?: number;
  cumulusCount?: number;
  cirrusCount?: number;
  characters?: string;
  /** Global opacity multiplier. */
  opacity?: number;
};

const DECK_GLYPHS = "@#$%&*+=-:;<>[]{}()!?/\\|^~";

const createSeededRandom = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
};

const gauss = (r: () => number) => {
  const u1 = Math.max(1e-10, r());
  const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

/** Render the glyph set into a texture atlas (grid of cells). */
const buildGlyphAtlas = (characters: string) => {
  const chars = Array.from(new Set(characters));
  const cols = Math.ceil(Math.sqrt(chars.length));
  const cell = 128;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = cols * cell;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${cell * 0.72}px "IBM Plex Mono", "Consolas", monospace`;

  chars.forEach((ch, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2;
    ctx.fillText(ch, cx, cy);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return { texture, cols, glyphCount: chars.length };
};

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aGlyph;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSeed;

  uniform float uTime;
  uniform float uScale;

  varying vec3 vColor;
  varying float vGlyph;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    vGlyph = aGlyph;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = length(mv.xyz);

    // Fade out when the camera flies into a cloud, and haze into the distance
    float nearFade = smoothstep(260.0, 900.0, dist);
    float farFade = 1.0 - smoothstep(11000.0, 16000.0, dist);
    float twinkle = 0.82 + 0.18 * sin(uTime * (0.25 + fract(aSeed) * 0.5) + aSeed * 6.2831);
    vAlpha = aAlpha * nearFade * farFade * twinkle;

    gl_PointSize = min(aSize * (uScale / dist), 480.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uCols;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vGlyph;
  varying float vAlpha;

  void main() {
    vec2 cell = vec2(mod(vGlyph, uCols), floor(vGlyph / uCols));
    vec2 uv = (cell + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)) / uCols;
    float a = texture2D(uAtlas, uv).a;
    float alpha = a * vAlpha * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

type Cluster = {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  velocityX: number;
  velocityZ: number;
  bobPhase: number;
  baseY: number;
};

export const createAsciiCloudDeck = ({
  seed = 4242,
  worldSize = 18000,
  baseAltitude = 2500,
  cirrusAltitude = 3600,
  cumulusCount = 34,
  cirrusCount = 8,
  characters = DECK_GLYPHS,
  opacity = 0.66,
}: AsciiCloudDeckOptions = {}): AsciiCloudDeck => {
  const random = createSeededRandom(seed);
  const group = new THREE.Group();
  group.name = "ascii-cloud-deck";

  const { texture, cols, glyphCount } = buildGlyphAtlas(characters);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: texture },
      uCols: { value: cols },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      // Perspective size factor: screenHeight / (2 * tan(fov/2)) for fov 60
      uScale: { value: (typeof window !== "undefined" ? window.innerHeight : 900) * 0.866 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });

  const clusters: Cluster[] = [];
  const half = worldSize * 0.5;
  const wrapLimit = half * 1.15;

  // Shading: lit crowns fade down to shaded indigo bellies
  const bellyColor = new THREE.Color("#6d7fc7");
  const crownColor = new THREE.Color("#f4f8ff");
  const tint = new THREE.Color();

  const buildCluster = (kind: "cumulus" | "cirrus") => {
    const isCirrus = kind === "cirrus";

    // Cumulus: 2–4 overlapping lobes make an irregular puff
    const radiusX = isCirrus ? 1600 + random() * 1400 : 420 + random() * 700;
    const radiusY = isCirrus ? 40 + random() * 40 : radiusX * (0.3 + random() * 0.14);
    const lobeCount = isCirrus ? 1 : 2 + Math.floor(random() * 3);
    const lobes: Array<{ x: number; y: number; z: number; r: number }> = [];
    for (let l = 0; l < lobeCount; l += 1) {
      lobes.push({
        x: (random() - 0.5) * radiusX * 1.1,
        y: random() * radiusY * 0.45,
        z: (random() - 0.5) * radiusX * 0.7,
        r: radiusX * (0.45 + random() * 0.35),
      });
    }

    const glyphs = isCirrus
      ? 70 + Math.floor(random() * 60)
      : Math.floor(110 + (radiusX / 1120) * 150 + random() * 40);

    const positions = new Float32Array(glyphs * 3);
    const sizes = new Float32Array(glyphs);
    const glyphIdx = new Float32Array(glyphs);
    const colors = new Float32Array(glyphs * 3);
    const alphas = new Float32Array(glyphs);
    const seeds = new Float32Array(glyphs);

    // Cirrus sheets stretch along a fixed heading
    const streakAngle = random() * Math.PI * 2;
    const cosA = Math.cos(streakAngle);
    const sinA = Math.sin(streakAngle);

    for (let i = 0; i < glyphs; i += 1) {
      let px: number;
      let py: number;
      let pz: number;

      if (isCirrus) {
        const along = gauss(random) * radiusX * 0.55;
        const across = gauss(random) * radiusX * 0.1;
        px = along * cosA - across * sinA;
        pz = along * sinA + across * cosA;
        py = gauss(random) * radiusY;
      } else {
        const lobe = lobes[Math.floor(random() * lobes.length)]!;
        px = lobe.x + gauss(random) * lobe.r * 0.45;
        pz = lobe.z + gauss(random) * lobe.r * 0.34;
        // Flat base, puffy crown: fold the gaussian upward
        py = lobe.y + Math.abs(gauss(random)) * radiusY * 0.55;
      }

      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;

      const heightNorm = THREE.MathUtils.clamp(py / (radiusY * 1.3), 0, 1);
      tint.copy(bellyColor).lerp(crownColor, isCirrus ? 0.85 : 0.25 + heightNorm * 0.75);
      // Slight hue jitter keeps the deck from looking flat
      tint.offsetHSL((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.05);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;

      sizes[i] = isCirrus ? 44 + random() * 36 : 78 + random() * 96 + heightNorm * 34;
      glyphIdx[i] = Math.floor(random() * glyphCount);
      alphas[i] = isCirrus ? 0.3 + random() * 0.25 : 0.45 + random() * 0.4;
      seeds[i] = random() * 100;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aGlyph", new THREE.BufferAttribute(glyphIdx, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.computeBoundingSphere();

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 2;

    const altitude = isCirrus
      ? cirrusAltitude + gauss(random) * 160
      : baseAltitude + gauss(random) * 260;
    points.position.set(
      (random() - 0.5) * worldSize * 1.1,
      altitude,
      (random() - 0.5) * worldSize * 1.1
    );

    const windAngle = streakAngle; // clouds ride their own heading, roughly shared
    const speed = isCirrus ? 26 + random() * 14 : 12 + random() * 14;

    clusters.push({
      points,
      geometry,
      velocityX: Math.cos(windAngle) * speed,
      velocityZ: Math.sin(windAngle) * speed,
      bobPhase: random() * Math.PI * 2,
      baseY: altitude,
    });
    group.add(points);
  };

  // A shared prevailing wind so the whole deck moves as one weather system
  const prevailing = random() * Math.PI * 2;
  for (let i = 0; i < cumulusCount; i += 1) buildCluster("cumulus");
  for (let i = 0; i < cirrusCount; i += 1) buildCluster("cirrus");
  clusters.forEach((cluster, i) => {
    const speed = Math.hypot(cluster.velocityX, cluster.velocityZ);
    const heading = prevailing + (createSeededRandom(seed + i)() - 0.5) * 0.7;
    cluster.velocityX = Math.cos(heading) * speed;
    cluster.velocityZ = Math.sin(heading) * speed;
  });

  const update = (t: number, dt: number) => {
    material.uniforms.uTime.value = t;

    for (const cluster of clusters) {
      const pos = cluster.points.position;
      pos.x += cluster.velocityX * dt;
      pos.z += cluster.velocityZ * dt;
      pos.y = cluster.baseY + Math.sin(t * 0.08 + cluster.bobPhase) * 40;

      // Recycle clouds that drift past the world edge
      if (pos.x > wrapLimit) pos.x = -wrapLimit;
      if (pos.x < -wrapLimit) pos.x = wrapLimit;
      if (pos.z > wrapLimit) pos.z = -wrapLimit;
      if (pos.z < -wrapLimit) pos.z = wrapLimit;
    }
  };

  const dispose = () => {
    clusters.forEach((cluster) => cluster.geometry.dispose());
    material.dispose();
    texture.dispose();
    group.removeFromParent();
  };

  return { group, update, dispose };
};
