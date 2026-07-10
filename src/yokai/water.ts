import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, toon } from "./palette.ts";
import { POND_CENTER, WATER_LEVEL } from "./terrain.ts";
import { reserve } from "./occupancy.ts";
import { getGlowTexture } from "./textures.ts";

/**
 * The spirit pond and its waterfall. A rocky bluff rises at the pond's
 * north-west rim; a sheet of animated water pours down its face into a
 * still, milky-jade pool, with slow ripple rings and drifting mist.
 */

export type WaterFeature = {
  group: THREE.Group;
  update: (t: number) => void;
};

const FALLS_HEIGHT = 230;
const FALLS_WIDTH = 108;

const pondVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const pondFragment = /* glsl */ `
  uniform vec3 waterColor;
  uniform vec3 deepColor;
  uniform vec3 foamColor;
  uniform float time;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i += 1) {
      v += a * noise(p);
      p = p * 2.1 + vec2(3.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;

    // Two drifting shimmer layers, crossing each other very slowly
    float layerA = fbm(vUv * 9.0 + vec2(time * 0.035, time * 0.02));
    float layerB = fbm(vUv * 14.0 - vec2(time * 0.028, time * 0.04));
    float shimmer = layerA * 0.6 + layerB * 0.4;

    vec3 color = mix(waterColor, deepColor, smoothstep(0.1, 0.75, 1.0 - d));
    // The shimmer tilts the water between sky-mirror and depth
    color = mix(color, waterColor * 1.12, smoothstep(0.45, 0.75, shimmer) * 0.5);
    color = mix(color, deepColor * 0.92, smoothstep(0.55, 0.3, shimmer) * 0.35);

    // Sun glints where both layers crest together
    float glint = smoothstep(0.68, 0.8, layerA * layerB * 2.0);
    color += vec3(1.0, 0.95, 0.8) * glint * 0.5;

    // Slow ripple rings breathing outward
    float rings = sin(d * 24.0 - time * 0.7) * 0.5 + 0.5;
    color += foamColor * rings * 0.04 * (1.0 - d);

    // Shore foam: a noisy, lapping edge rather than a clean band
    float foamEdge = 0.86 + (noise(vUv * 26.0 + time * 0.05) - 0.5) * 0.05;
    float shore = smoothstep(foamEdge, 0.99, d);
    color = mix(color, foamColor, shore * 0.7);

    gl_FragColor = vec4(color, 0.93);
  }
`;

const fallsVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fallsFragment = /* glsl */ `
  uniform vec3 waterColor;
  uniform vec3 foamColor;
  uniform float time;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Streaks racing downward, in painterly vertical ribbons
    float lane = floor(vUv.x * 9.0);
    float laneSeed = hash(vec2(lane, 3.7));
    float flow = fract(vUv.y * 2.0 + time * (0.55 + laneSeed * 0.35) + laneSeed);
    float streak = smoothstep(0.25, 0.0, abs(flow - 0.5) - 0.18);

    // Fine falling texture inside the sheet
    float spray = noise(vec2(vUv.x * 26.0, vUv.y * 9.0 + time * 2.4));
    streak = clamp(streak + (spray - 0.5) * 0.35, 0.0, 1.0);

    vec3 color = mix(waterColor, foamColor, streak * 0.34);
    // Whiter churn at top lip and bottom impact, boiling with noise
    float churnTop = smoothstep(0.9, 1.0, vUv.y) * (0.34 + spray * 0.28);
    float churnBase = smoothstep(0.12, 0.0, vUv.y) * (0.4 + noise(vec2(vUv.x * 18.0, time * 3.0)) * 0.28);
    color = mix(color, foamColor, clamp(churnTop + churnBase, 0.0, 0.72));

    // Soft ragged side edges instead of a hard rectangle
    float edgeNoise = (noise(vec2(vUv.y * 11.0, time * 0.15)) - 0.5) * 0.055;
    float edge = smoothstep(0.035 + edgeNoise, 0.14, vUv.x) *
                 smoothstep(0.965 - edgeNoise, 0.86, vUv.x);
    float alpha = (0.62 + streak * 0.24) * edge;
    gl_FragColor = vec4(color, alpha);
  }
`;

export const createWaterFeature = (): WaterFeature => {
  const group = new THREE.Group();
  const rng = createRng(0xaa77);

  // Direction from pond center toward the bluff
  const bluffAngle = Math.PI * 1.22; // north-west
  const bluffDir = new THREE.Vector2(Math.cos(bluffAngle), Math.sin(bluffAngle));
  const bluffBase = new THREE.Vector2(
    POND_CENTER.x + bluffDir.x * 330,
    POND_CENTER.y + bluffDir.y * 330
  );
  reserve(bluffBase.x, bluffBase.y, 320);

  /* ── The bluff: one tight, angular escarpment framing the water channel ── */
  const rockMat = toon(KAKURIYO.cliff, { flatShading: true });
  const deepRockMat = toon("#566473", { flatShading: true });
  const mossMat = toon(KAKURIYO.forestFloor, { flatShading: true });
  // Each stone already has strong cel facets. Individual inverted-hull lines
  // would overlap into black knots; the escarpment reads as one mass instead.
  rockMat.userData.outlineParameters = { visible: false };
  deepRockMat.userData.outlineParameters = { visible: false };
  mossMat.userData.outlineParameters = { visible: false };
  const boulderGeo = new THREE.IcosahedronGeometry(1, 0);
  const tangent = new THREE.Vector2(-bluffDir.y, bluffDir.x);
  for (let row = 0; row < 5; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const isMossCap = row === 4 && rng() < 0.68;
      const isChannelRock = Math.abs(column) <= 1 && row < 4;
      const boulder = new THREE.Mesh(
        boulderGeo,
        isMossCap ? mossMat : isChannelRock ? deepRockMat : rockMat,
      );
      const lateral = column * 66 + (row % 2) * 22 + (rng() - 0.5) * 20;
      const depth = (rng() - 0.5) * 30 + row * 3;
      boulder.position.set(
        bluffBase.x + tangent.x * lateral + bluffDir.x * depth,
        WATER_LEVEL + 30 + row * 48 + rng() * 8,
        bluffBase.y + tangent.y * lateral + bluffDir.y * depth,
      );
      boulder.scale.set(
        60 + rng() * 18,
        42 + rng() * 13,
        52 + rng() * 17,
      );
      boulder.rotation.set(rng() * 0.28, bluffAngle + rng() * 1.2, rng() * 0.22);
      group.add(boulder);
    }
  }

  // A few fallen stones soften the join between the vertical face and shore.
  for (let i = 0; i < 5; i += 1) {
    const lateral = (rng() - 0.5) * 360;
    const shoreRock = new THREE.Mesh(boulderGeo, rng() < 0.3 ? mossMat : rockMat);
    shoreRock.position.set(
      bluffBase.x + tangent.x * lateral - bluffDir.x * (75 + rng() * 75),
      WATER_LEVEL + 8 + rng() * 12,
      bluffBase.y + tangent.y * lateral - bluffDir.y * (75 + rng() * 75),
    );
    shoreRock.scale.set(18 + rng() * 24, 12 + rng() * 15, 20 + rng() * 25);
    shoreRock.rotation.set(rng(), rng() * Math.PI, rng());
    group.add(shoreRock);
  }

  /* ── The falls ── */
  const fallsUniforms = {
    waterColor: { value: new THREE.Color("#559eb6") },
    foamColor: { value: new THREE.Color(KAKURIYO.foam) },
    time: { value: 0 },
  };
  const fallsMat = new THREE.ShaderMaterial({
    uniforms: fallsUniforms,
    vertexShader: fallsVertex,
    fragmentShader: fallsFragment,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fallsGeometry = new THREE.PlaneGeometry(FALLS_WIDTH, FALLS_HEIGHT, 1, 12);
  const fallsPositions = fallsGeometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < fallsPositions.count; i += 1) {
    const originalX = fallsPositions.getX(i);
    const y01 = fallsPositions.getY(i) / FALLS_HEIGHT + 0.5;
    const width = 0.78 + Math.sin(y01 * Math.PI * 5.0) * 0.09 + Math.sin(y01 * Math.PI * 11.0) * 0.035;
    const meander = Math.sin(y01 * Math.PI * 3.0) * 5.5;
    fallsPositions.setX(i, originalX * width + meander);
  }
  fallsGeometry.computeVertexNormals();
  const falls = new THREE.Mesh(fallsGeometry, fallsMat);
  // Hang the sheet on the pond-facing face of the bluff
  const facePos = new THREE.Vector2(
    bluffBase.x - bluffDir.x * 68,
    bluffBase.y - bluffDir.y * 68
  );
  falls.position.set(facePos.x, WATER_LEVEL + FALLS_HEIGHT * 0.48, facePos.y);
  falls.rotation.y = bluffAngle + Math.PI;
  group.add(falls);

  /* ── The pond ── */
  const pondUniforms = {
    waterColor: { value: new THREE.Color(KAKURIYO.water) },
    deepColor: { value: new THREE.Color(KAKURIYO.waterDeep) },
    foamColor: { value: new THREE.Color(KAKURIYO.foam) },
    time: { value: 0 },
  };
  const pondMat = new THREE.ShaderMaterial({
    uniforms: pondUniforms,
    vertexShader: pondVertex,
    fragmentShader: pondFragment,
    transparent: true,
  });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(430, 40), pondMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(POND_CENTER.x, WATER_LEVEL, POND_CENTER.y);
  group.add(pond);

  /* ── Mist at the plunge pool ── */
  const mistMat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: KAKURIYO.foam,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const mistPuffs: THREE.Sprite[] = [];
  for (let i = 0; i < 5; i += 1) {
    const puff = new THREE.Sprite(mistMat);
    const width = 65 + rng() * 50;
    const height = 30 + rng() * 24;
    puff.position.set(
      facePos.x + (rng() - 0.5) * 125,
      WATER_LEVEL + 12 + rng() * 18,
      facePos.y + (rng() - 0.5) * 90
    );
    puff.userData.phase = rng() * Math.PI * 2;
    puff.userData.width = width;
    puff.userData.height = height;
    puff.userData.baseY = puff.position.y;
    puff.scale.set(width, height, 1);
    mistPuffs.push(puff);
    group.add(puff);
  }

  return {
    group,
    update: (t) => {
      fallsUniforms.time.value = t;
      pondUniforms.time.value = t;
      for (const puff of mistPuffs) {
        const phase = Number(puff.userData.phase);
        const s = 1 + Math.sin(t * 0.9 + phase) * 0.18;
        puff.scale.set(Number(puff.userData.width) * s, Number(puff.userData.height) * s, 1);
        puff.position.y = Number(puff.userData.baseY) + Math.sin(t * 0.6 + phase) * 3;
      }
    },
  };
};
