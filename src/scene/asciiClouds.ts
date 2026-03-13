import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

export type AsciiCloudField = {
  group: THREE.Group;
  update: (timeSeconds: number, deltaSeconds: number) => void;
};

type AsciiCloudGlyph = {
  mesh: THREE.Mesh;
  layerIndex: number;
  radius: number;
  angle: number;
  driftSpeed: number;
  baseY: number;
  waveSpeed: number;
  waveAmplitude: number;
  revealDelay: number;
  revealDuration: number;
  lifeStart: number;
  lifeDuration: number;
  nextMutationAt: number;
  mutationCadence: number;
};

type AsciiCloudOptions = {
  seed?: number;
  layerCount?: number;
  glyphsPerLayer?: number;
  baseRadius?: number;
  glyphSize?: number;
  verticalSpacing?: number;
  palette?: number[];
  characters?: string;
};

const DEFAULT_CHARACTERS = "@#$%&*+=-:;<>[]{}()!?/\\|^~";
const FONT_URL = "/helvetiker_regular.typeface.json";

/**
 * Creates an animated cloud field of vector ASCII glyph meshes.
 *
 * Rendering design:
 * - Every glyph is generated from font vector curves (shape geometry).
 * - Glyphs reveal over time in each layer, then mutate one at a time.
 * - Independent opacity and motion curves create cloud-like breathing.
 */
export const createAsciiCloudField = async (options: AsciiCloudOptions = {}): Promise<AsciiCloudField> => {
  const {
    seed = 90210,
    layerCount = 3,
    glyphsPerLayer = 96,
    baseRadius = 1450,
    glyphSize = 24,
    verticalSpacing = 140,
    palette = [0xe4efff, 0xb6ccff, 0x8ab0ff],
    characters = DEFAULT_CHARACTERS,
  } = options;

  const random = createSeededRandom(seed);
  const font = await new FontLoader().loadAsync(FONT_URL);
  const group = new THREE.Group();
  group.name = "ascii-cloud-field";

  const geometryCache = new Map<string, THREE.ShapeGeometry>();
  const glyphs: AsciiCloudGlyph[] = [];

  const getGeometryForGlyph = (glyph: string) => {
    const key = `${glyph}-${glyphSize.toFixed(2)}`;
    const existing = geometryCache.get(key);
    if (existing) {
      return existing;
    }

    const shapes = font.generateShapes(glyph, glyphSize);
    const geometry = new THREE.ShapeGeometry(shapes);
    geometry.computeBoundingBox();

    const box = geometry.boundingBox;
    if (box) {
      const centerOffsetX = -((box.min.x + box.max.x) * 0.5);
      const centerOffsetY = -((box.min.y + box.max.y) * 0.5);
      geometry.translate(centerOffsetX, centerOffsetY, 0);
    }

    geometryCache.set(key, geometry);
    return geometry;
  };

  const chars = Array.from(characters);
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const layer = new THREE.Group();
    layer.name = `ascii-cloud-layer-${layerIndex}`;

    const layerRadius = baseRadius + layerIndex * 220;
    const layerY = 240 + layerIndex * verticalSpacing;
    const tint = palette[layerIndex % palette.length] ?? 0xd5e6ff;

    for (let glyphIndex = 0; glyphIndex < glyphsPerLayer; glyphIndex += 1) {
      const glyphChar = pick(chars, random);
      const material = new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(getGeometryForGlyph(glyphChar), material);
      mesh.renderOrder = 3;

      const glyph: AsciiCloudGlyph = {
        mesh,
        layerIndex,
        radius: layerRadius * (0.55 + random() * 0.55),
        angle: random() * Math.PI * 2,
        driftSpeed: 0.025 + random() * 0.06,
        baseY: layerY + (random() - 0.5) * 110,
        waveSpeed: 0.45 + random() * 1.2,
        waveAmplitude: 6 + random() * 28,
        revealDelay: layerIndex * 0.9 + glyphIndex * 0.018,
        revealDuration: 0.45 + random() * 1.3,
        lifeStart: random() * 8,
        lifeDuration: 6 + random() * 7,
        nextMutationAt: 1.8 + random() * 5.2,
        mutationCadence: 2.4 + random() * 4.8,
      };

      updateGlyphTransform(glyph, 0);
      glyph.mesh.rotation.z = random() * Math.PI * 2;
      const initialScale = 0.6 + random() * 0.8;
      glyph.mesh.scale.setScalar(initialScale);

      glyphs.push(glyph);
      layer.add(glyph.mesh);
    }

    group.add(layer);
  }

  const mutateGlyph = (glyph: AsciiCloudGlyph, timeSeconds: number) => {
    const glyphChar = pick(chars, random);
    glyph.mesh.geometry = getGeometryForGlyph(glyphChar);
    glyph.lifeStart = timeSeconds;
    glyph.lifeDuration = 5 + random() * 9;
    glyph.nextMutationAt = timeSeconds + glyph.mutationCadence * (0.7 + random() * 0.9);
    glyph.mesh.rotation.z += (random() - 0.5) * 0.5;
  };

  return {
    group,
    update: (timeSeconds, deltaSeconds) => {
      for (const glyph of glyphs) {
        glyph.angle += glyph.driftSpeed * deltaSeconds;
        updateGlyphTransform(glyph, timeSeconds);

        const revealT = THREE.MathUtils.clamp(
          (timeSeconds - glyph.revealDelay) / glyph.revealDuration,
          0,
          1,
        );
        const lifeT = (timeSeconds - glyph.lifeStart) / glyph.lifeDuration;
        const lifeWave = 0.55 + Math.sin(lifeT * Math.PI * 2) * 0.45;
        const breath = 0.7 + Math.sin(timeSeconds * (0.9 + glyph.layerIndex * 0.15) + glyph.angle * 2.2) * 0.3;
        const opacity = Math.pow(revealT, 1.4) * lifeWave * breath;

        const material = glyph.mesh.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = opacity * 0.64;
        }

        const scaleWave = 0.85 + Math.sin(timeSeconds * glyph.waveSpeed + glyph.angle) * 0.2;
        glyph.mesh.scale.setScalar(scaleWave);

        if (timeSeconds >= glyph.nextMutationAt) {
          mutateGlyph(glyph, timeSeconds);
        }
      }

      const slowRoll = 0.006 + Math.sin(timeSeconds * 0.08) * 0.003;
      group.rotation.y += deltaSeconds * slowRoll;
    },
  };
};

const updateGlyphTransform = (glyph: AsciiCloudGlyph, timeSeconds: number) => {
  const x = Math.cos(glyph.angle) * glyph.radius;
  const z = Math.sin(glyph.angle) * glyph.radius;
  const y = glyph.baseY + Math.sin(timeSeconds * glyph.waveSpeed + glyph.angle * 1.4) * glyph.waveAmplitude;
  glyph.mesh.position.set(x, y, z);
  glyph.mesh.lookAt(x * 1.08, y + 16, z * 1.08);
};

const pick = <T>(items: T[], random: () => number): T => {
  const index = Math.floor(random() * items.length) % items.length;
  return items[index] as T;
};

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};
