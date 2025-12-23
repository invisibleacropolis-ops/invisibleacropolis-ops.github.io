import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

import { loadPages } from "./data/pages.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");

if (!canvas) {
  throw new Error("Canvas element #scene not found.");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#050608");

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 0, 5);

const geometry = new THREE.IcosahedronGeometry(1.4, 0);
const material = new THREE.MeshStandardMaterial({
  color: "#6dd6ff",
  metalness: 0.2,
  roughness: 0.4,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const ambientLight = new THREE.AmbientLight("#9aa8ff", 0.6);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight("#ffffff", 0.9);
keyLight.position.set(3, 4, 6);
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
  mesh.rotation.y += delta * 0.4;
  mesh.rotation.x += delta * 0.15;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

const initialize = async () => {
  resize();
  window.addEventListener("resize", resize);

  try {
    const pages = await loadPages();
    if (pages.length > 0) {
      mesh.scale.setScalar(Math.min(2.2, 1 + pages.length / 12));
    }
  } catch (error) {
    console.warn("Failed to load pages.json", error);
  }

  requestAnimationFrame(animate);
};

void initialize();
