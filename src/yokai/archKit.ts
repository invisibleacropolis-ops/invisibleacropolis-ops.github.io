import * as THREE from "three";
import { getWorldModel } from "./kamiModels.ts";
import { getToonGradient } from "./palette.ts";
import { getWindNoiseTexture } from "./shaders.ts";

/**
 * The architecture kit (tools/blender/arch_build.py): torii, stone lanterns,
 * pagoda, honden, komainu and minka, authored in Blender with baked vertex
 * colour and a per-vertex surface id. One toon material paints procedural
 * surface detail in world space, with no UVs or textures to ship:
 *   1 roof tiles   rows running down each slope and courses across it,
 *                  derived from the face's own slope direction
 *   2 wood         long grain and weathering
 *   3 stone        speckle, weathering and moss on the tops
 *   4 thatch       straw strands combed down the slope
 *   5 plaster      soft stains
 *   6 glow         lantern flame (an unlit material, animated by its owner)
 */

const DETAIL_VERTEX = /* glsl */ `
attribute float _surface;
varying float vSurface;
varying vec3 vArchWorld;
varying vec3 vArchNormal;
`;

const DETAIL_FRAGMENT = /* glsl */ `
uniform sampler2D uArchNoise;
varying float vSurface;
varying vec3 vArchWorld;
varying vec3 vArchNormal;

vec3 archDetail(vec3 base) {
  float id = floor(vSurface + 0.5);
  vec3 n = normalize(vArchNormal);
  vec3 p = vArchWorld;
  vec3 w = abs(n); w /= (w.x + w.y + w.z);
  float tri = texture2D(uArchNoise, p.yz / 38.0).g * w.x + texture2D(uArchNoise, p.xz / 38.0).g * w.y
            + texture2D(uArchNoise, p.xy / 38.0).g * w.z;
  float fine = texture2D(uArchNoise, p.xz / 6.0 + p.y / 7.0).r;
  // Slope frame: the horizontal direction a surface faces (downhill on roofs).
  vec2 down = n.xz / max(length(n.xz), 1e-4);
  float across = dot(p.xz, vec2(-down.y, down.x));
  float along = dot(p.xz, down) - p.y * 0.6;
  float k = 0.96 + 0.08 * tri;
  vec3 color = base;
  if (id == 1.0) {
    float column = abs(fract(across / 5.2) - 0.5) * 2.0;
    float course = fract(along / 6.8);
    k = mix(0.74, 1.06, smoothstep(0.85, 0.4, column)) * mix(0.8, 1.0, smoothstep(0.0, 0.14, course));
    k *= 0.92 + 0.12 * tri;
  } else if (id == 2.0) {
    float grain = texture2D(uArchNoise, vec2((p.x + p.z) / 26.0, p.y / 3.2)).b;
    k = 0.86 + 0.2 * grain + 0.06 * (fine - 0.5);
  } else if (id == 3.0) {
    k = 0.8 + 0.3 * tri + 0.12 * (fine - 0.5);
    float moss = smoothstep(0.55, 0.9, n.y) * smoothstep(0.55, 0.75, tri);
    color = mix(color, vec3(0.16, 0.25, 0.1), moss * 0.55);
  } else if (id == 4.0) {
    float strands = texture2D(uArchNoise, vec2(across / 1.9, along / 22.0)).a;
    k = 0.76 + 0.34 * strands + 0.08 * (tri - 0.5);
  } else if (id == 5.0) {
    k = 0.95 + 0.07 * tri - 0.05 * smoothstep(0.6, 0.9, fine);
  }
  return color * k;
}
`;

type Kit = {
  parts: Map<string, { name: string; geometry: THREE.BufferGeometry }[]>;
  material: THREE.MeshToonMaterial;
};
let kit: Kit | null | undefined;

const getKit = (): Kit | null => {
  if (kit !== undefined) return kit;
  const model = getWorldModel("architecture");
  if (!model) return (kit = null);
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonGradient() });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uArchNoise = { value: getWindNoiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${DETAIL_VERTEX}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
  vSurface = _surface;
  vArchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vArchNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${DETAIL_FRAGMENT}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.rgb = archDetail(diffuseColor.rgb);");
  };
  material.customProgramCacheKey = () => "kakuriyo-architecture";
  const parts = new Map<string, { name: string; geometry: THREE.BufferGeometry }[]>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const structure = object.name.split("_")[0]!;
    if (!parts.has(structure)) parts.set(structure, []);
    parts.get(structure)!.push({ name: object.name, geometry: object.geometry });
  });
  return (kit = { parts, material });
};

/**
 * A fresh instance of a kit structure (shared geometry), or undefined when
 * the kit is not loaded and the caller should build its procedural piece.
 * Glow parts get their own unlit material so each flame can flicker alone.
 */
export const archPiece = (structure: string): THREE.Group | undefined => {
  const k = getKit();
  const list = k?.parts.get(structure);
  if (!k || !list) return undefined;
  const group = new THREE.Group();
  group.name = structure;
  for (const { name, geometry } of list) {
    const glow = name.endsWith("_glow");
    const mesh = new THREE.Mesh(geometry, glow ? new THREE.MeshBasicMaterial({ color: "#ffe2a0" }) : k.material);
    mesh.name = glow ? `${structure}-glow` : name;
    mesh.castShadow = mesh.receiveShadow = !glow;
    group.add(mesh);
  }
  return group;
};
