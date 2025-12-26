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

export type PlacementShape = "ring" | "square" | "random";

export type LinksOptions = {
  radius?: number; // Unused
  width?: number; // Unused
  depth?: number; // Unused
  seed?: number;
  heightAt?: (x: number, z: number) => number;
  elevation?: number;
  maxVisible?: number;
  maxDistance?: number;
  palette?: string[];
  spacing?: number;
  size?: number;
  placementShape?: PlacementShape;
  placementRadius?: number;
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

const getPlacementPosition = (
  index: number,
  total: number,
  shape: PlacementShape,
  radius: number,
  rng: () => number
): { x: number, z: number } => {
  if (shape === "ring") {
    const angle = (index / total) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius
    };
  } else if (shape === "square") {
    // Distribute along perimeter of square (side = radius * 2)
    const t = index / total; // 0 to 1
    const side = radius * 2;

    if (t < 0.25) { // Top (z = -radius)
      const localT = t / 0.25;
      return { x: -radius + localT * side, z: -radius };
    } else if (t < 0.5) { // Right (x = radius)
      const localT = (t - 0.25) / 0.25;
      return { x: radius, z: -radius + localT * side };
    } else if (t < 0.75) { // Bottom (z = radius)
      const localT = (t - 0.5) / 0.25;
      return { x: radius - localT * side, z: radius };
    } else { // Left (x = -radius)
      const localT = (t - 0.75) / 0.25;
      return { x: -radius, z: radius - localT * side };
    }
  } else { // Random
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    return {
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r
    };
  }
};

export const createLinks = async ({
  radius,
  width = 5000,
  depth = 5000,
  seed = 123,
  heightAt,
  elevation = 0,
  maxVisible = 3,
  maxDistance,
  palette = WORLD_PALETTE,
  size = 5.0,
  placementShape = "ring",
  placementRadius = 2000,
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

  pages.forEach((page, index) => {

    const pos = getPlacementPosition(index, pages.length, placementShape, placementRadius, rng);

    // Get Terrain Height
    const y = heightAt ? heightAt(pos.x, pos.z) : 0;

    // Sit on terrain: Y + half size + elevation
    const finalY = y + (size * 0.5) + elevation;

    const mesh = createLabelMesh(font, page.title, color);

    mesh.position.set(pos.x, finalY, pos.z);
    mesh.lookAt(0, finalY, 0);

    mesh.scale.set(size, size, size);

    mesh.userData.linkUrl = page.url;
    mesh.userData.elevation = elevation;
    // Store exact terrain height for resize calculations
    mesh.userData.terrainY = y;

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
      const tY = mesh.userData.terrainY || 0;
      const elev = mesh.userData.elevation || 0;
      mesh.position.y = tY + (newSize * 0.5) + elev;
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
