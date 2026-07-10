import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** First composer pass: color render plus the canonical inverted-hull toon ink. */
class ToonRenderPass extends Pass {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly outline: OutlineEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.outline = new OutlineEffect(renderer, {
      defaultThickness: 0.003,
      defaultColor: [0.035, 0.045, 0.065],
      defaultAlpha: 0.94,
      defaultKeepAlive: true,
    });
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.outline.render(this.scene, this.camera);
  }
}

/**
 * Final color treatment for Kakuriyo.  The grade is intentionally restrained:
 * it gives the world the dense inks, warm paper highlights, and cool atmospheric
 * shadows of a hand-painted anime background without obscuring the procedural
 * texture work underneath it.
 */
const StorybookGrade = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

      // Cool ink in the shadows, sun-warmed paper in the highlights.
      color += vec3(-0.008, 0.004, 0.018) * (1.0 - smoothstep(0.08, 0.55, luma));
      color += vec3(0.018, 0.008, -0.008) * smoothstep(0.58, 1.0, luma);

      // A gentle S-curve and selective saturation keep the broad toon shapes
      // graphic while retaining detail in the brightest clouds and plaster.
      color = clamp((color - 0.5) * 1.045 + 0.515, 0.0, 1.0);
      float gradedLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(gradedLuma), color, 1.045);

      // Fine animated dither prevents gradient banding and suggests paper tooth.
      float grain = hash(gl_FragCoord.xy + fract(time * 17.0) * 193.0) - 0.5;
      color += grain * (0.012 - smoothstep(0.2, 0.9, gradedLuma) * 0.005);

      // Cinematic vignette, wide enough to frame rather than darken the view.
      vec2 centered = vUv - 0.5;
      centered.x *= resolution.x / max(resolution.y, 1.0);
      float vignette = smoothstep(0.82, 0.28, length(centered));
      color *= mix(0.9, 1.0, vignette);

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};

export type CinematicRenderer = {
  render: (time: number) => void;
  resize: (width: number, height: number) => void;
};

export const createCinematicRenderer = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): CinematicRenderer => {
  const composer = new EffectComposer(renderer);
  composer.addPass(new ToonRenderPass(renderer, scene, camera));

  // High threshold keeps bloom on the sun, spirit fire, and lanterns instead
  // of laying a generic glow over every pale surface.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.22,
    0.42,
    0.86,
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(StorybookGrade);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const resize = (width: number, height: number) => {
    composer.setSize(width, height);
    bloom.setSize(width, height);
    grade.uniforms.resolution.value.set(width, height);
  };
  resize(window.innerWidth, window.innerHeight);

  return {
    render: (time) => {
      grade.uniforms.time.value = time;
      composer.render();
    },
    resize,
  };
};
