import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, toon } from "./palette.ts";
import { POND_CENTER, WATER_LEVEL, heightAt } from "./terrain.ts";

/**
 * The spirit pond and its waterfall. A rocky bluff rises at the pond's
 * north-west rim; a sheet of animated water pours down its face into a
 * still, milky-jade pool, with slow ripple rings and drifting mist.
 */

export type WaterFeature = {
  group: THREE.Group;
  update: (t: number) => void;
};

const FALLS_HEIGHT = 260;
const FALLS_WIDTH = 150;

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

  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p) * 2.0;
    vec3 color = mix(waterColor, deepColor, smoothstep(0.15, 0.75, 1.0 - d));

    // Slow ripple rings breathing outward
    float rings = sin(d * 26.0 - time * 0.8) * 0.5 + 0.5;
    color += foamColor * rings * 0.05 * (1.0 - d);

    // Shore foam
    float shore = smoothstep(0.86, 0.99, d);
    color = mix(color, foamColor, shore * 0.65);

    gl_FragColor = vec4(color, 0.92);
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

  void main() {
    // Streaks racing downward, in painterly vertical ribbons
    float lane = floor(vUv.x * 9.0);
    float laneSeed = hash(vec2(lane, 3.7));
    float flow = fract(vUv.y * 2.0 + time * (0.55 + laneSeed * 0.35) + laneSeed);
    float streak = smoothstep(0.25, 0.0, abs(flow - 0.5) - 0.18);

    vec3 color = mix(waterColor, foamColor, streak * 0.85);
    // Whiter churn at top lip and bottom impact
    color = mix(color, foamColor, smoothstep(0.82, 1.0, vUv.y) * 0.7);
    color = mix(color, foamColor, smoothstep(0.16, 0.0, vUv.y) * 0.8);

    float alpha = 0.82 + streak * 0.15;
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

  /* ── The bluff: a stack of craggy toon slabs ── */
  const rockMat = toon(KAKURIYO.cliff, { flatShading: true });
  const mossMat = toon(KAKURIYO.forestFloor, { flatShading: true });
  for (let i = 0; i < 7; i += 1) {
    const w = 340 - i * 26 + rng() * 60;
    const h = 60 + rng() * 40;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 220 + rng() * 80), i % 3 === 2 ? mossMat : rockMat);
    slab.position.set(
      bluffBase.x + (rng() - 0.5) * 40,
      i * (FALLS_HEIGHT / 7) + h * 0.35,
      bluffBase.y + (rng() - 0.5) * 40
    );
    slab.rotation.y = bluffAngle + Math.PI / 2 + (rng() - 0.5) * 0.25;
    group.add(slab);
  }

  /* ── The falls ── */
  const fallsUniforms = {
    waterColor: { value: new THREE.Color(KAKURIYO.water) },
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
  const falls = new THREE.Mesh(new THREE.PlaneGeometry(FALLS_WIDTH, FALLS_HEIGHT, 1, 8), fallsMat);
  // Hang the sheet on the pond-facing face of the bluff
  const facePos = new THREE.Vector2(
    bluffBase.x - bluffDir.x * 150,
    bluffBase.y - bluffDir.y * 150
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
  const mistMat = new THREE.MeshBasicMaterial({
    color: KAKURIYO.foam,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const mistPuffs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(34 + rng() * 26, 8, 6), mistMat);
    puff.position.set(
      facePos.x + (rng() - 0.5) * 160,
      WATER_LEVEL + 16 + rng() * 30,
      facePos.y + (rng() - 0.5) * 160
    );
    puff.userData.phase = rng() * Math.PI * 2;
    mistPuffs.push(puff);
    group.add(puff);
  }

  /* ── Standing stones around the shore ── */
  for (let i = 0; i < 9; i += 1) {
    const angle = rng() * Math.PI * 2;
    const r = 440 + rng() * 60;
    const x = POND_CENTER.x + Math.cos(angle) * r;
    const z = POND_CENTER.y + Math.sin(angle) * r;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(14 + rng() * 22, 0),
      rockMat
    );
    stone.position.set(x, heightAt(x, z) + 8, z);
    stone.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.6);
    group.add(stone);
  }

  return {
    group,
    update: (t) => {
      fallsUniforms.time.value = t;
      pondUniforms.time.value = t;
      for (const puff of mistPuffs) {
        const phase = Number(puff.userData.phase);
        const s = 1 + Math.sin(t * 0.9 + phase) * 0.18;
        puff.scale.setScalar(s);
        puff.position.y += Math.sin(t * 0.6 + phase) * 0.05;
      }
    },
  };
};
