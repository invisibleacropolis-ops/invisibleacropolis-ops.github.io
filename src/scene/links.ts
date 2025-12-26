import * as THREE from "three";
import { FontLoader, Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

import { loadPages, type PageEntry } from "../data/pages.ts";
import { WORLD_PALETTE } from "./palette.ts";
import { createRng } from "./random.ts";

const FONT_URL = "/helvetiker_regular.typeface.json";

export type LinkLabel = {
  mesh: THREE.Mesh;
  page: PageEntry;
};

export type LinksScene = {
  group: THREE.Group;
  labels: LinkLabel[];
  pagesCount: number;
  updateVisibility: (camera: THREE.Camera) => void;
  setSize: (size: number) => void;
};

export type LinksOptions = {
  radius?: number; // Unused
  width?: number;
  depth?: number;
  seed?: number;
  heightAt?: (x: number, z: number) => number;
  elevation?: number;
  maxVisible?: number;
  maxDistance?: number;
  palette?: string[];
  spacing?: number;
  size?: number; // Base size scaling factor
};

const loadFont = async () => {
  const response = await fetch(FONT_URL);

  if (!response.ok) {
    throw new Error(`Font request failed: ${response.status}`);
  }

  const fontData = await response.json();
  const loader = new FontLoader();
  return loader.parse(fontData);
};

const createLabelMesh = (font: Font, title: string, color: string) => {
  // Base geometry size 1.0 allows for easy scaling
  const geometry = new TextGeometry(title, {
    font,
    size: 1.0,
    height: 0.2, // 20% depth relative to size
    curveSegments: 8,
  });

  geometry.computeBoundingBox();

  if (geometry.boundingBox) {
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  }

  const material = new THREE.MeshBasicMaterial({ color, wireframe: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  mesh.userData.baseColor = material.color.getHex();
  mesh.userData.hoverColor = new THREE.Color("#7799ff").getHex();
  return mesh;
};

export const createLinks = async ({
  radius,
  width = 5000,
  depth = 5000,
  seed = 123,
  heightAt,
  elevation = 6,
  maxVisible = 3,
  maxDistance,
  palette = WORLD_PALETTE,
  spacing = 300,
  size = 5.0, // Default 10x larger than previous 0.5 (effective)
}: LinksOptions): Promise<LinksScene> => {
  const [font, pages] = await Promise.all([loadFont(), loadPages()]);
  const group = new THREE.Group();
  const labels: LinkLabel[] = [];
  const rng = createRng(seed ^ 0x9f3d);

  if (pages.length === 0) {
    return {
      group,
      labels,
      pagesCount: 0,
      updateVisibility: () => { },
      setSize: () => { },
    };
  }

  const color = palette[4] ?? "#cdd9ff";
  const placedPositions: { x: number; z: number }[] = [];

  pages.forEach((page) => {
    let bestX = 0;
    let bestZ = 0;
    let bestDist = -1;

    // Try to find a spot far from others
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = (rng() - 0.5) * width * 0.8;
      const z = (rng() - 0.5) * depth * 0.8;

      let minDist = Infinity;
      minDist = Math.min(minDist, Math.sqrt(x * x + z * z));

      for (const pos of placedPositions) {
        const d = Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2);
        if (d < minDist) minDist = d;
      }

      if (minDist > spacing && minDist > bestDist) {
        bestX = x;
        bestZ = z;
        bestDist = minDist;
        if (minDist > spacing * 1.5) break;
      }
    }

    if (bestDist < 0) {
      bestX = (rng() - 0.5) * width * 0.8;
      bestZ = (rng() - 0.5) * depth * 0.8;
    }

    placedPositions.push({ x: bestX, z: bestZ });

    const y = heightAt ? heightAt(bestX, bestZ) : 0;
    const finalY = y + elevation + 5 + rng() * 10;

    const mesh = createLabelMesh(font, page.title, color);
    mesh.position.set(bestX, finalY, bestZ);
    mesh.lookAt(0, finalY, 0);

    // Apply initial size
    mesh.scale.set(size, size, size);

    mesh.userData.linkUrl = page.url;

    group.add(mesh);
    labels.push({ mesh, page });
  });

  const frustum = new THREE.Frustum();
  const projectionMatrix = new THREE.Matrix4();
  const tempPositionA = new THREE.Vector3();
  const tempPositionB = new THREE.Vector3();
  const clampedMaxVisible = Math.min(4, Math.max(2, Math.round(maxVisible)));
  const maxVisibleDistance = maxDistance ?? Math.max(width * 0.3, 2000);

  const updateVisibility = (camera: THREE.Camera) => {
    projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionMatrix);

    const candidates = labels.filter(({ mesh }) => {
      if (!frustum.intersectsObject(mesh)) {
        return false;
      }
      const distance = camera.position.distanceTo(mesh.getWorldPosition(tempPositionA));
      return distance <= maxVisibleDistance;
    });

    candidates.sort((a, b) => {
      const distanceA = camera.position.distanceTo(a.mesh.getWorldPosition(tempPositionA));
      const distanceB = camera.position.distanceTo(b.mesh.getWorldPosition(tempPositionB));
      return distanceA - distanceB;
    });

    labels.forEach(({ mesh }) => {
      mesh.visible = false;
    });

    candidates.slice(0, clampedMaxVisible).forEach(({ mesh }) => {
      mesh.visible = true;
    });
  };

  const setSize = (newSize: number) => {
    labels.forEach(({ mesh }) => {
      mesh.scale.set(newSize, newSize, newSize);
    });
  };

  return {
    group,
    labels,
    pagesCount: pages.length,
    updateVisibility,
    setSize,
  };
};
