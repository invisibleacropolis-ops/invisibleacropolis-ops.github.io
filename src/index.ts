import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

import { loadPages } from "./data/pages.ts";
import { createRoads } from "./scene/roads.ts";
import { createTerrainMesh } from "./scene/terrain.ts";
import { createValleyMesh } from "./scene/valleys.ts";
import { WORLD_PALETTE } from "./scene/palette.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");

if (!canvas) {
  throw new Error("Canvas element #scene not found.");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#050608");

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(0, 7, 12);

const world = new THREE.Group();
scene.add(world);

const WORLD_SEED = 1337;

const terrain = createTerrainMesh({
  seed: WORLD_SEED,
  width: 14,
  depth: 14,
  segments: 36,
  height: 2.6,
  palette: WORLD_PALETTE,
});
world.add(terrain.mesh);

const valleyMesh = createValleyMesh({
  seed: WORLD_SEED,
  width: terrain.width,
  depth: terrain.depth,
  segments: terrain.segments,
  height: terrain.height * 0.9,
  palette: WORLD_PALETTE,
});
valleyMesh.position.y = 0.05;
world.add(valleyMesh);

const roads = createRoads({
  seed: WORLD_SEED,
  width: terrain.width,
  depth: terrain.depth,
  count: 4,
  elevation: 0.15,
  palette: WORLD_PALETTE,
  heightAt: terrain.heightAt,
});
world.add(roads);

const ambientLight = new THREE.AmbientLight("#9aa8ff", 0.6);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight("#ffffff", 0.5);
keyLight.position.set(3, 6, 6);
scene.add(keyLight);

const state = {
  lastTime: 0,
};

const resize = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

const animate = (time: number) => {
  const delta = (time - state.lastTime) * 0.001;
  state.lastTime = time;
  world.rotation.y += delta * 0.08;
  world.rotation.x = -0.35 + Math.sin(time * 0.0002) * 0.05;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

const initialize = async () => {
  resize();
  window.addEventListener("resize", resize);

  try {
    const pages = await loadPages();
    if (pages.length > 0) {
      camera.position.z = Math.min(18, 10 + pages.length * 0.3);
    }
  } catch (error) {
    console.warn("Failed to load pages.json", error);
  }

  requestAnimationFrame(animate);
};

void initialize();
