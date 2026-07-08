import * as THREE from "three";
import { KAKURIYO } from "./palette.ts";

/**
 * A painted sky: eternal golden hour. Horizon peach lifting into
 * periwinkle, a great low sun with a soft halo, and faint brushstroke
 * bands like the washes of a woodblock print.
 */
export const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.28, -0.62).normalize();

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenithColor;
  uniform vec3 horizonColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform float time;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(horizonColor, zenithColor, smoothstep(0.42, 0.85, height));

    // Brushstroke bands, barely-there, drifting imperceptibly
    float band = sin(dir.y * 26.0 + time * 0.01) * 0.5 + 0.5;
    sky += vec3(0.02, 0.015, 0.01) * band * (1.0 - height);

    // The great sun and its halo
    float sunDot = max(0.0, dot(dir, sunDirection));
    float disc = smoothstep(0.9986, 0.9993, sunDot);
    float halo = pow(sunDot, 24.0) * 0.32 + pow(sunDot, 6.0) * 0.12;
    sky += sunColor * (disc * 0.9 + halo);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export type KakuriyoSky = {
  mesh: THREE.Mesh;
  update: (t: number) => void;
  /** Live color uniforms, so stories can dim the world to night and back. */
  uniforms: {
    zenithColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    sunColor: { value: THREE.Color };
  };
};

export const createSky = (radius = 9000): KakuriyoSky => {
  const uniforms = {
    zenithColor: { value: new THREE.Color(KAKURIYO.skyZenith) },
    horizonColor: { value: new THREE.Color(KAKURIYO.skyHorizon) },
    sunColor: { value: new THREE.Color(KAKURIYO.sunColor) },
    sunDirection: { value: SUN_DIRECTION.clone() },
    time: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  material.toneMapped = false;

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), material);

  return {
    mesh,
    update: (t) => {
      uniforms.time.value = t;
    },
    uniforms,
  };
};
