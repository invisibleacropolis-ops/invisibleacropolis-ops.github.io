import * as THREE from "three";
import { FontLoader, Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

import { loadPages, sortPagesByPriority, type PageEntry } from "../data/pages.ts";
import { WORLD_PALETTE } from "./palette.ts";
import { createRng } from "./random.ts";

const FONT_URL = "/helvetiker_regular.typeface.json";

/** Accent color per navigation group, mirrored in the UI tokens. */
const NAV_GROUP_COLORS: Record<string, string> = {
  "Start here": "#ffc857",
  Workflows: "#6fe1ff",
  Reference: "#7cffc4",
  Labs: "#ff7ad9",
};

const DEFAULT_LINK_COLOR = "#cdd9ff";

export type LinkLabel = {
  /** The wireframe text mesh (proximity effect tints this). */
  mesh: THREE.Mesh;
  /** The whole monument: text + base ring + light pillar. */
  monument: THREE.Group;
  page: PageEntry;
  accentColor: string;
};

export type LinksScene = {
  group: THREE.Group;
  labels: LinkLabel[];
  pagesCount: number;
  updateVisibility: (camera: THREE.Camera) => void;
  setSize: (size: number) => void;
  /** Animate beacons; call once per frame. */
  update: (time: number, camera?: THREE.Camera) => void;
  /** Resolve the page for any object hit by a raycast inside the links group. */
  pageForObject: (object: THREE.Object3D | null) => PageEntry | null;
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
  mesh.frustumCulled = false;
  mesh.userData.baseColor = material.color.getHex();
  mesh.userData.hoverColor = new THREE.Color("#ffffff").getHex();
  return mesh;
};

/**
 * Beacon parts live in "unit space" (text glyph height = 1) inside the
 * monument group; the group itself is scaled by the configured link size,
 * so resizing never has to rebuild geometry.
 */
const createBeaconParts = (accent: THREE.Color) => {
  const parts = new THREE.Group();

  // Base ring sitting just above the terrain
  const ringGeo = new THREE.TorusGeometry(1.7, 0.045, 10, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.85,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 0.06;
  parts.add(ring);

  // Slow counter-rotating outer ring for depth
  const outerGeo = new THREE.TorusGeometry(2.3, 0.02, 8, 64);
  const outerMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.35,
  });
  const outerRing = new THREE.Mesh(outerGeo, outerMat);
  outerRing.rotation.x = Math.PI * 0.5;
  outerRing.position.y = 0.03;
  parts.add(outerRing);

  // Volumetric-looking light pillar — doubles as a generous click target
  const pillarGeo = new THREE.CylinderGeometry(0.55, 1.1, 6.5, 18, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 3.25;
  parts.add(pillar);

  return { parts, ring, outerRing, pillar, ringMat, outerMat, pillarMat };
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
  const font = await loadFont();
  const pages = await loadPages().catch((error) => {
    console.error("3D links failed to load pages.json", error);
    return [] as PageEntry[];
  });
  const prioritizedPages = sortPagesByPriority(pages);
  const group = new THREE.Group();
  const labels: LinkLabel[] = [];
  const rng = createRng(seed ^ 0x9f3d);

  if (prioritizedPages.length === 0) {
    return {
      group,
      labels,
      pagesCount: 0,
      updateVisibility: () => { },
      setSize: () => { },
      update: () => { },
      pageForObject: () => null,
    };
  }

  type AnimatedBeacon = {
    monument: THREE.Group;
    textMesh: THREE.Mesh;
    ring: THREE.Mesh;
    outerRing: THREE.Mesh;
    pillarMat: THREE.MeshBasicMaterial;
    textBaseY: number;
    phase: number;
    /** 0 close → 1 far; far pillars burn brighter so doorways read across the valley. */
    distanceFactor: number;
  };
  const animated: AnimatedBeacon[] = [];
  const pageByObjectId = new Map<number, PageEntry>();

  prioritizedPages.forEach((page, index) => {
    const pos = getPlacementPosition(index, prioritizedPages.length, placementShape, placementRadius, rng);

    // Get Terrain Height
    const y = heightAt ? heightAt(pos.x, pos.z) : 0;

    const accentColor = NAV_GROUP_COLORS[page.navGroup] ?? palette[4] ?? DEFAULT_LINK_COLOR;
    const accent = new THREE.Color(accentColor);

    const monument = new THREE.Group();
    monument.position.set(pos.x, y, pos.z);
    monument.scale.setScalar(size);

    // Text floats above the ring; offsets are in unit space (pre-scale)
    const textBaseY = 0.85 + elevation / size;
    const mesh = createLabelMesh(font, page.title, accentColor);
    mesh.position.y = textBaseY;
    monument.add(mesh);

    const beacon = createBeaconParts(accent);
    monument.add(beacon.parts);

    // Face the center of the valley
    monument.lookAt(0, y, 0);

    // Every part of the monument resolves to the same destination,
    // so the pillar and rings are all valid click targets.
    monument.userData.linkUrl = page.url;
    monument.userData.priority = page.priority;
    monument.traverse((child) => {
      child.userData.linkUrl = page.url;
      pageByObjectId.set(child.id, page);
    });
    pageByObjectId.set(monument.id, page);

    group.add(monument);
    labels.push({ mesh, monument, page, accentColor });
    animated.push({
      monument,
      textMesh: mesh,
      ring: beacon.ring,
      outerRing: beacon.outerRing,
      pillarMat: beacon.pillarMat,
      textBaseY,
      phase: index * 1.13,
      distanceFactor: 0,
    });
  });

  const updateVisibility = (camera: THREE.Camera) => {
    // No culling or distance limits
    labels.forEach(({ monument }) => {
      monument.visible = true;
    });
  };

  const setSize = (newSize: number) => {
    labels.forEach(({ monument }) => {
      monument.scale.setScalar(newSize);
    });
  };

  const update = (time: number, camera?: THREE.Camera) => {
    for (const beacon of animated) {
      // Gentle levitation of the title
      beacon.textMesh.position.y = beacon.textBaseY + Math.sin(time * 0.8 + beacon.phase) * 0.07;
      // Counter-rotating base rings
      beacon.ring.rotation.z = time * 0.25 + beacon.phase;
      beacon.outerRing.rotation.z = -time * 0.12 + beacon.phase;

      if (camera) {
        const distance = camera.position.distanceTo(beacon.monument.position);
        beacon.distanceFactor = THREE.MathUtils.clamp((distance - 800) / 3200, 0, 1);
      }

      // Breathing light pillar; nearly invisible up close, a bright doorway from afar
      const baseOpacity = THREE.MathUtils.lerp(0.05, 0.2, beacon.distanceFactor);
      beacon.pillarMat.opacity = baseOpacity + Math.sin(time * 1.4 + beacon.phase) * 0.025;
    }
  };

  const pageForObject = (object: THREE.Object3D | null): PageEntry | null => {
    let current: THREE.Object3D | null = object;
    while (current) {
      const page = pageByObjectId.get(current.id);
      if (page) return page;
      current = current.parent;
    }
    return null;
  };

  return {
    group,
    labels,
    pagesCount: prioritizedPages.length,
    updateVisibility,
    setSize,
    update,
    pageForObject,
  };
};
