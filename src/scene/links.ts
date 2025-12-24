import * as THREE from "three";
import { FontLoader, Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

import { loadPages, type PageEntry } from "../data/pages.ts";
import { WORLD_PALETTE } from "./palette.ts";

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
};

export type LinksOptions = {
  radius: number;
  elevation?: number;
  maxVisible?: number;
  maxDistance?: number;
  palette?: string[];
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
  const geometry = new TextGeometry(title, {
    font,
    size: 0.5,
    height: 0.08,
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
  elevation = 2.1,
  maxVisible = 3,
  maxDistance,
  palette = WORLD_PALETTE,
}: LinksOptions): Promise<LinksScene> => {
  const [font, pages] = await Promise.all([loadFont(), loadPages()]);
  const group = new THREE.Group();
  const labels: LinkLabel[] = [];

  if (pages.length === 0) {
    return {
      group,
      labels,
      pagesCount: 0,
      updateVisibility: () => { },
    };
  }

  const angleStep = (Math.PI * 2) / pages.length;
  const color = palette[4] ?? "#cdd9ff";

  pages.forEach((page, index) => {
    const angle = angleStep * index;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = elevation + Math.sin(angle * 1.8) * 0.4;

    const mesh = createLabelMesh(font, page.title, color);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, y, 0);
    mesh.userData.linkUrl = page.url;

    group.add(mesh);
    labels.push({ mesh, page });
  });

  const frustum = new THREE.Frustum();
  const projectionMatrix = new THREE.Matrix4();
  const tempPositionA = new THREE.Vector3();
  const tempPositionB = new THREE.Vector3();
  const clampedMaxVisible = Math.min(4, Math.max(2, Math.round(maxVisible)));
  const maxVisibleDistance = maxDistance ?? Math.max(radius * 1.35, 12);

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

  return {
    group,
    labels,
    pagesCount: pages.length,
    updateVisibility,
  };
};
