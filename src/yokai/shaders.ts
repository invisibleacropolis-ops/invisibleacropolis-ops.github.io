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

export const applyWindSway = (
  material: THREE.Material,
  amplitude = 2.4,
  frequency = 1.1
): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWindAmp = { value: amplitude };
    shader.uniforms.uWindFreq = { value: frequency };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uWindTime;
uniform float uWindAmp;
uniform float uWindFreq;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    float windPhase = instanceMatrix[3][0] * 0.021 + instanceMatrix[3][2] * 0.017;
  #else
    float windPhase = 0.0;
  #endif
  // Tops sway, roots hold
  float windGate = smoothstep(-40.0, 50.0, transformed.y);
  transformed.x += sin(uWindTime * uWindFreq + windPhase) * uWindAmp * windGate;
  transformed.z += cos(uWindTime * uWindFreq * 0.83 + windPhase * 1.31) * uWindAmp * 0.7 * windGate;
}`
      );
  };
  // Distinct programs per (amplitude, frequency) family
  material.customProgramCacheKey = () => `wind-${amplitude}-${frequency}`;
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

const instancedOutlineVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  uniform float outlineThickness;

  void main() {
    vec4 localPosition = vec4(position, 1.0);
    vec3 localNormal = normal;

    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
      localNormal = normalize(mat3(instanceMatrix) * localNormal);
    #endif

    vec4 mvPosition = modelViewMatrix * localPosition;
    vec4 projected = projectionMatrix * mvPosition;
    vec4 normalPosition = projectionMatrix * modelViewMatrix * vec4(localPosition.xyz + localNormal, 1.0);
    vec4 clipNormal = normalize(projected - normalPosition);
    gl_Position = projected + clipNormal * outlineThickness * projected.w;

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
  const material = new THREE.ShaderMaterial({
    uniforms: {
      outlineThickness: { value: 0.00215 },
      outlineColor: { value: new THREE.Color(0.035, 0.045, 0.065) },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    },
    vertexShader: instancedOutlineVertex,
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
      (object.name === "sakura-crowns" || object.name.startsWith("pine-canopy"))
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
