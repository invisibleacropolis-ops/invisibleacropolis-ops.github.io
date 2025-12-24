import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";

type BloomOptions = {
  strength?: number;
  radius?: number;
  threshold?: number;
};

type AntiAliasMode = "smaa" | "fxaa" | "none";

type PostProcessingOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  bloom?: BloomOptions;
  antiAlias?: AntiAliasMode;
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

export const createPostProcessing = ({
  renderer,
  scene,
  camera,
  bloom,
  antiAlias = "smaa",
}: PostProcessingOptions) => {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    bloom?.strength ?? 1.25,
    bloom?.radius ?? 0.5,
    bloom?.threshold ?? 0.15,
  );
  composer.addPass(bloomPass);

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
    bloomPass.setSize(width, height);

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
    bloomPass,
    render,
    resize,
  };
};
