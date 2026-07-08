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
