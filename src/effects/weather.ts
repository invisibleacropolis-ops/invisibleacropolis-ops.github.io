import * as THREE from "three";

import { createRng } from "../scene/random.ts";

export type WeatherOptions = {
  scene: THREE.Scene;
  seed?: number;
  areaWidth?: number;
  areaDepth?: number;
  fogColor?: string;
  fogDensity?: number;
  rainEnabled?: boolean;
  rainCount?: number;
  rainHeight?: number;
  rainSpeed?: number;
  rainOpacity?: number;
  rainColor?: string;
  rainWireframe?: boolean;
};

type RainDrop = {
  mesh: THREE.Mesh;
  speed: number;
  resetY: number;
};

export const createWeatherEffects = ({
  scene,
  seed = 1337,
  areaWidth = 30,
  areaDepth = 30,
  fogColor = "#8aa3c7",
  fogDensity = 0.02,
  rainEnabled = false,
  rainCount = 120,
  rainHeight = 6,
  rainSpeed = 3,
  rainOpacity = 0.35,
  rainColor = "#9fc6ff",
  rainWireframe = true,
}: WeatherOptions) => {
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);

  const rng = createRng(seed ^ 0x3f2b);
  const rainGroup = new THREE.Group();
  const rainDrops: RainDrop[] = [];

  if (rainEnabled) {
    const geometry = new THREE.PlaneGeometry(0.06, 0.9, 1, 3);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(rainColor),
      transparent: true,
      opacity: rainOpacity,
      wireframe: rainWireframe,
      side: THREE.DoubleSide,
    });
    material.depthWrite = false;
    material.toneMapped = false;

    for (let i = 0; i < rainCount; i += 1) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (rng() - 0.5) * areaWidth,
        rng() * rainHeight + rainHeight * 0.25,
        (rng() - 0.5) * areaDepth,
      );
      mesh.rotation.y = rng() * Math.PI;
      mesh.rotation.z = (rng() - 0.5) * 0.4;
      const speed = rainSpeed * (0.6 + rng() * 0.8);
      const resetY = rainHeight * (1.1 + rng() * 0.4);
      rainDrops.push({ mesh, speed, resetY });
      rainGroup.add(mesh);
    }
  }

  const update = (time: number, delta: number) => {
    if (!rainEnabled) {
      return;
    }

    for (const drop of rainDrops) {
      drop.mesh.position.y -= drop.speed * delta;
      if (drop.mesh.position.y < -0.5) {
        drop.mesh.position.y = drop.resetY + rng();
        drop.mesh.position.x = (rng() - 0.5) * areaWidth;
        drop.mesh.position.z = (rng() - 0.5) * areaDepth;
      }
      drop.mesh.rotation.z = Math.sin(time * 0.4 + drop.speed) * 0.12;
    }
  };

  return {
    group: rainGroup,
    update,
  };
};
