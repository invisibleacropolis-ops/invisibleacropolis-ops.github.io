import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";

// Layer for objects that should receive bloom
export const BLOOM_LAYER = 1;

type BloomOptions = {
  strength?: number;
  radius?: number;
  threshold?: number;
};

type AntiAliasMode = "smaa" | "fxaa" | "none";

export type QualityTier = "low" | "medium" | "high" | "ultra";

export type QualityBudgetTargets = {
  timeToInteractiveMs: number;
  frameTimeMs: number;
  memoryMb: number;
};

export type QualityPreset = {
  tier: QualityTier;
  budget: QualityBudgetTargets;
  pixelRatioCap: number;
  renderScale: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  antiAlias: AntiAliasMode;
  rainEnabled: boolean;
};

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  low: {
    tier: "low",
    budget: {
      timeToInteractiveMs: 2600,
      frameTimeMs: 25,
      memoryMb: 700,
    },
    pixelRatioCap: 1,
    renderScale: 0.72,
    bloomStrength: 0.25,
    bloomRadius: 0.2,
    bloomThreshold: 0.2,
    antiAlias: "none",
    rainEnabled: false,
  },
  medium: {
    tier: "medium",
    budget: {
      timeToInteractiveMs: 2200,
      frameTimeMs: 20,
      memoryMb: 1000,
    },
    pixelRatioCap: 1.25,
    renderScale: 0.86,
    bloomStrength: 0.45,
    bloomRadius: 0.32,
    bloomThreshold: 0.05,
    antiAlias: "fxaa",
    rainEnabled: false,
  },
  high: {
    tier: "high",
    budget: {
      timeToInteractiveMs: 1800,
      frameTimeMs: 16.7,
      memoryMb: 1400,
    },
    pixelRatioCap: 1.5,
    renderScale: 1,
    bloomStrength: 0.6,
    bloomRadius: 0.4,
    bloomThreshold: 0,
    antiAlias: "smaa",
    rainEnabled: true,
  },
  ultra: {
    tier: "ultra",
    budget: {
      timeToInteractiveMs: 1600,
      frameTimeMs: 14,
      memoryMb: 2200,
    },
    pixelRatioCap: 2,
    renderScale: 1,
    bloomStrength: 0.8,
    bloomRadius: 0.5,
    bloomThreshold: 0,
    antiAlias: "smaa",
    rainEnabled: true,
  },
};

type PostProcessingOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  bloom?: BloomOptions;
  antiAlias?: AntiAliasMode;
  qualityTier?: QualityTier;
};

// Shader to composite bloom layer onto base scene
const CompositeShader = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec4 bloom = texture2D(bloomTexture, vUv);
      // Additive blend for bloom
      gl_FragColor = base + bloom;
    }
  `,
};

const setFxaaResolution = (
  pass: ShaderPass,
  width: number,
  height: number,
  pixelRatio: number,
) => {
  const resolution = pass.material.uniforms["resolution"].value as THREE.Vector2;
  resolution.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
};

export const createSelectiveBloomPostProcessing = ({
  renderer,
  scene,
  camera,
  bloom = { strength: 0.8, radius: 0.3, threshold: 0.0 },
  antiAlias = "smaa",
  qualityTier = "high",
}: PostProcessingOptions) => {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();

  // Create bloom layer
  const bloomLayer = new THREE.Layers();
  bloomLayer.set(BLOOM_LAYER);

  // Materials cache for darkening non-bloom objects
  const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const materialCache = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();

  // Store original background
  let originalBackground: THREE.Color | THREE.Texture | null = null;

  // Darken non-bloom objects
  const darkenNonBloom = () => {
    originalBackground = scene.background;
    scene.background = null;

    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !bloomLayer.test(obj.layers)) {
        materialCache.set(obj, obj.material);
        obj.material = darkMaterial;
      }
    });
  };

  // Restore materials
  const restoreMaterials = () => {
    scene.background = originalBackground;

    materialCache.forEach((material, obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = material;
      }
    });
    materialCache.clear();
  };

  // Bloom composer - renders only bloom layer
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    bloom.strength ?? 0.8,
    bloom.radius ?? 0.3,
    bloom.threshold ?? 0.0,
  );
  bloomComposer.addPass(bloomPass);

  // Final composer - renders full scene and composites bloom
  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));

  const compositePass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: CompositeShader.vertexShader,
      fragmentShader: CompositeShader.fragmentShader,
      defines: {},
    }),
    "baseTexture"
  );
  compositePass.needsSwap = true;
  finalComposer.addPass(compositePass);

  // Anti-aliasing
  const smaaPass = new SMAAPass(size.x * pixelRatio, size.y * pixelRatio);
  const fxaaPass = new ShaderPass(FXAAShader);
  setFxaaResolution(fxaaPass, size.x, size.y, pixelRatio);
  finalComposer.addPass(smaaPass);
  finalComposer.addPass(fxaaPass);

  let viewportWidth = size.x;
  let viewportHeight = size.y;
  let currentRenderScale = QUALITY_PRESETS[qualityTier].renderScale;
  let bloomEnabled = true;

  const setAntiAliasMode = (mode: AntiAliasMode) => {
    smaaPass.enabled = mode === "smaa";
    fxaaPass.enabled = mode === "fxaa";
  };

  const updateComposerResolution = (width: number, height: number) => {
    const nextPixelRatio = renderer.getPixelRatio();
    const scaledWidth = Math.max(1, Math.floor(width * currentRenderScale));
    const scaledHeight = Math.max(1, Math.floor(height * currentRenderScale));
    bloomComposer.setSize(scaledWidth, scaledHeight);
    finalComposer.setSize(scaledWidth, scaledHeight);
    bloomPass.setSize(scaledWidth, scaledHeight);
    smaaPass.setSize(scaledWidth * nextPixelRatio, scaledHeight * nextPixelRatio);
    setFxaaResolution(fxaaPass, scaledWidth, scaledHeight, nextPixelRatio);
  };

  const resize = (width: number, height: number) => {
    viewportWidth = width;
    viewportHeight = height;
    updateComposerResolution(width, height);
  };

  const setQualityTier = (tier: QualityTier) => {
    const preset = QUALITY_PRESETS[tier];
    currentRenderScale = preset.renderScale;
    bloomPass.strength = preset.bloomStrength;
    bloomPass.radius = preset.bloomRadius;
    bloomPass.threshold = preset.bloomThreshold;
    setAntiAliasMode(preset.antiAlias);
    updateComposerResolution(viewportWidth, viewportHeight);
  };

  const setBloomEnabled = (enabled: boolean) => {
    bloomEnabled = enabled;
  };

  setQualityTier(qualityTier);
  if (antiAlias !== QUALITY_PRESETS[qualityTier].antiAlias) {
    setAntiAliasMode(antiAlias);
  }

  const render = () => {
    // First pass: render only bloom objects with bloom effect
    if (bloomEnabled) {
      darkenNonBloom();
      bloomComposer.render();
      restoreMaterials();
    }

    // Second pass: render full scene and composite with bloom
    finalComposer.render();
  };

  return {
    bloomComposer,
    finalComposer,
    bloomPass,
    bloomLayer: BLOOM_LAYER,
    setQualityTier,
    setBloomEnabled,
    setAntiAliasMode,
    render,
    resize,
  };
};

// Simple post-processing without bloom (fallback)
export const createPostProcessing = ({
  renderer,
  scene,
  camera,
  antiAlias = "smaa",
}: Omit<PostProcessingOptions, "bloom">) => {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let smaaPass: SMAAPass | null = null;
  let fxaaPass: ShaderPass | null = null;

  if (antiAlias === "smaa") {
    smaaPass = new SMAAPass(size.x * pixelRatio, size.y * pixelRatio);
    composer.addPass(smaaPass);
  } else if (antiAlias === "fxaa") {
    fxaaPass = new ShaderPass(FXAAShader);
    setFxaaResolution(fxaaPass, size.x, size.y, pixelRatio);
    composer.addPass(fxaaPass);
  }

  const resize = (width: number, height: number) => {
    const nextPixelRatio = renderer.getPixelRatio();
    composer.setSize(width, height);

    if (smaaPass) {
      smaaPass.setSize(width * nextPixelRatio, height * nextPixelRatio);
    }

    if (fxaaPass) {
      setFxaaResolution(fxaaPass, width, height, nextPixelRatio);
    }
  };

  const render = () => {
    composer.render();
  };

  return {
    composer,
    render,
    resize,
  };
};
