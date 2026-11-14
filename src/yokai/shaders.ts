import * as THREE from "three";

/**
 * Shader enhancements layered onto the standard toon materials.
 *
 * Wind sway: a vertex-stage injection (via onBeforeCompile) that rocks
 * instanced foliage on a shared breeze clock, phase-offset by each
 * instance's world position so the whole valley never sways in lockstep.
 */

/** The one breeze every leaf listens to; advanced each frame by main. */
export const windTime: { value: number } = { value: 0 };

/**
 * How hard that breeze blows (1 = normal). Stories may still the air for
 * a drought or raise it before a storm; main scales the clock by this.
 */
export const windStrength: { value: number } = { value: 1 };

/**
 * The valley's gust field, in world space: broad fronts roll down-valley
 * along the prevailing wind, with a slower cross-swell. Grass, trees and
 * outlines all sample it, so a gust visibly travels across meadow and
 * forest together. Returns ~0 (lull) .. ~1.3 (gust).
 */
export const GUST_GLSL = /* glsl */ `
float kakuriyoGust(vec2 p, float t) {
  float front = dot(p, vec2(0.8, 0.6)) * 0.0019 - t * 0.62;
  float g = 0.5 + 0.5 * sin(front) * (0.65 + 0.35 * sin(front * 0.41 + 1.7));
  g += 0.22 * sin(dot(p, vec2(-0.55, 0.83)) * 0.0012 - t * 0.21);
  return clamp(g, 0.0, 1.3);
}
`;

/** The same gust field on the CPU, for particles (petals, leaves). */
export const gustAt = (x: number, z: number, t: number): number => {
  const front = (x * 0.8 + z * 0.6) * 0.0019 - t * 0.62;
  let g = 0.5 + 0.5 * Math.sin(front) * (0.65 + 0.35 * Math.sin(front * 0.41 + 1.7));
  g += 0.22 * Math.sin((-0.55 * x + 0.83 * z) * 0.0012 - t * 0.21);
  return Math.min(1.3, Math.max(0, g));
};

/** World-space sway for an instanced plant (base = its root position). */
export const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
uniform float uWindAmp;
uniform float uWindHeight;
uniform float uWindFlutter;
uniform float uWindFreq;
${GUST_GLSL}
vec3 kakuriyoWind(vec3 world, vec3 base, float t) {
  // Bend grows with height (roots hold), so trunks curve rather than tilt.
  float h = clamp((world.y - base.y) / uWindHeight, 0.0, 1.4);
  float bend = h * h;
  float gust = kakuriyoGust(base.xz, t);
  float phase = base.x * 0.021 + base.z * 0.017;
  // Leaning downwind with the gust, rocking back between pulses.
  float sway = (0.3 + gust) * (0.7 + 0.3 * sin(t * uWindFreq * 1.7 + phase)) + 0.25 * sin(t * uWindFreq + phase);
  float side = 0.3 * sin(t * uWindFreq * 0.8 + phase * 1.3);
  vec3 offset = vec3(0.8 * sway - 0.6 * side, 0.0, 0.6 * sway + 0.8 * side) * (uWindAmp * bend);
  offset.y -= length(offset.xz) * 0.12 * h;             // tips dip as they arc
  // Leaf shimmer: quick, small, decorrelated per vertex, louder in gusts.
  float flick = sin(t * 8.0 + dot(world, vec3(0.37, 0.21, 0.29)));
  offset += vec3(flick, 0.6 * flick, -flick) * (uWindFlutter * (0.4 + gust) * h);
  return offset;
}
`;

export type WindProfile = {
  /** Tip travel (world units) in a full gust. */
  amplitude: number;
  /** Height over which the bend develops; the plant's height. */
  height: number;
  /** Leaf shimmer amplitude (0 for trunks). */
  flutter?: number;
  /** Rocking rate. */
  frequency?: number;
};

const windUniforms = (profile: WindProfile) => ({
  uWindTime: windTime,
  uWindAmp: { value: profile.amplitude },
  uWindHeight: { value: profile.height },
  uWindFlutter: { value: profile.flutter ?? 0 },
  uWindFreq: { value: profile.frequency ?? 1 },
});

/**
 * Sways an (instanced) material in the shared wind. The offset is applied in
 * world space after the instance transform, so every tree bends the same
 * way regardless of its own rotation. Canopy outlines reuse the profile.
 */
export const applyWindSway = (material: THREE.Material, profile: WindProfile): void => {
  material.userData.wind = profile;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms(profile));
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WIND_GLSL}`)
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vec3 windBase = instanceMatrix[3].xyz;
#else
  vec3 windBase = vec3( 0.0 );
#endif
mvPosition.xyz += kakuriyoWind( mvPosition.xyz, windBase, uWindTime );
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`
      );
  };
  const { amplitude, height, flutter = 0, frequency = 1 } = profile;
  material.customProgramCacheKey = () => `wind-${amplitude}-${height}-${flutter}-${frequency}`;
};

type OutlineParameters = {
  thickness?: number;
  color?: [number, number, number];
  alpha?: number;
  visible?: boolean;
  keepAlive?: boolean;
};

type OutlineMaterial = THREE.Material & {
  userData: { outlineParameters?: OutlineParameters };
};

const instancedOutlineVertex = (wind: boolean) => /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  ${wind ? WIND_GLSL : ""}

  uniform float outlineThickness;

  void main() {
    vec4 localPosition = vec4(position, 1.0);
    vec3 localNormal = normal;

    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
      localNormal = mat3(instanceMatrix) * localNormal;
      ${wind ? "localPosition.xyz += kakuriyoWind(localPosition.xyz, instanceMatrix[3].xyz, uWindTime);" : ""}
    #endif

    // Inverted hull expanded in VIEW space. The previous clip-space
    // formulation normalized (projected - normalProjected), which goes
    // to zero when a normal aligns with the view ray — normalize(0) is
    // NaN, and one NaN vertex rasterizes as a screen-covering black
    // triangle for a frame. View-space expansion has no such pole.
    vec4 mvPosition = modelViewMatrix * localPosition;
    vec3 viewNormal = mat3(modelViewMatrix) * localNormal;
    float normalLength = length(viewNormal);
    if (normalLength > 0.00001) {
      viewNormal /= normalLength;
      // Scale by depth so the line width stays constant on screen
      mvPosition.xyz += viewNormal * outlineThickness * max(1.0, -mvPosition.z);
    }
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const instancedOutlineFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform vec3 outlineColor;

  void main() {
    gl_FragColor = vec4(outlineColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const addInstancedCanopyOutline = (source: THREE.InstancedMesh): void => {
  // The ink hull must sway with the canopy it outlines.
  const wind = (source.material as THREE.Material).userData.wind as WindProfile | undefined;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      outlineThickness: { value: 0.00215 },
      outlineColor: { value: new THREE.Color(0.035, 0.045, 0.065) },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...(wind ? windUniforms(wind) : {}),
    },
    vertexShader: instancedOutlineVertex(!!wind),
    fragmentShader: instancedOutlineFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: true,
  });
  material.userData.outlineParameters = { visible: false };

  const outline = new THREE.InstancedMesh(source.geometry, material, source.count);
  outline.name = `${source.name}-ink-outline`;
  outline.instanceMatrix = source.instanceMatrix;
  outline.count = source.count;
  outline.frustumCulled = source.frustumCulled;
  outline.renderOrder = -1;
  source.add(outline);
};

/**
 * Opts authored toon meshes into Three.js's inverted-hull OutlineEffect.
 * Instanced vegetation is excluded: the r160 outline shader has no instancing
 * transform support, and distant foliage reads better as uncluttered color mass.
 */
export const configureCelOutlines = (root: THREE.Object3D): void => {
  const outlined = new Set<OutlineMaterial>();
  const excluded = new Set<OutlineMaterial>();
  const canopyInstances: THREE.InstancedMesh[] = [];

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = (Array.isArray(object.material) ? object.material : [object.material]) as OutlineMaterial[];

    for (const material of materials) {
      if (
        material instanceof THREE.MeshToonMaterial &&
        !(object instanceof THREE.InstancedMesh) &&
        material.userData.outlineParameters?.visible !== false
      ) {
        outlined.add(material);
      } else {
        excluded.add(material);
      }
    }

    if (
      object instanceof THREE.InstancedMesh &&
      (object.userData.inkCanopy === true || object.name === "sakura-crowns" || object.name.startsWith("pine-canopy"))
    ) {
      canopyInstances.push(object);
    }
  });

  for (const material of excluded) {
    material.userData.outlineParameters = { visible: false };
  }

  for (const material of outlined) {
    if (excluded.has(material)) continue;
    material.userData.outlineParameters = {
      visible: true,
      thickness: 0.003,
      color: [0.035, 0.045, 0.065],
      alpha: 0.94,
      keepAlive: true,
    };
  }

  for (const canopy of canopyInstances) addInstancedCanopyOutline(canopy);
};
