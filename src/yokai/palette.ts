import * as THREE from "three";

/**
 * Art direction for Kakuriyo — a mystical Japan seen through the eyes of
 * its spirits. Golden-hour light, mist-layered mountains, vivid meadows:
 * the palette of ukiyo-e prints and Ghibli skies.
 */
export const KAKURIYO = {
  // Sky
  skyZenith: "#7fa8d9",
  skyHorizon: "#ffd9ae",
  sunColor: "#ffe9c4",
  hazeColor: "#dbe4ee",

  // Land
  meadow: "#8ec96b",
  hillside: "#5da05f",
  forestFloor: "#3e7d4f",
  cliff: "#8d97a8",
  sand: "#e8d9b0",

  // Mountains (near → far, fading into the mist)
  mountainNear: "#7a8fb5",
  mountainMid: "#93a6c6",
  mountainFar: "#aebfd8",
  snow: "#f7f4ec",

  // Water
  water: "#7fc3d4",
  waterDeep: "#5b9fb5",
  foam: "#f2fbff",

  // Architecture
  vermilion: "#d0442a",
  templeWood: "#7d4230",
  roofTile: "#46586e",
  stone: "#a8a89e",
  paperWhite: "#f4efe2",
  gold: "#e0b354",

  // Flora
  sakura: "#ffc4d6",
  sakuraDeep: "#f79bb8",
  pine: "#2f6e4f",
  bamboo: "#71b25c",
  trunk: "#6b4a38",

  // Spirits
  spiritWhite: "#f5f2ea",
  spiritGlow: "#aee3ff",
  foxRed: "#c9502e",
  tanukiBrown: "#8a6748",
  kappaGreen: "#6da85c",
} as const;

/** Shared 3-step toon gradient so every material cel-shades consistently. */
let gradientMap: THREE.DataTexture | null = null;

export const getToonGradient = (): THREE.DataTexture => {
  if (!gradientMap) {
    const data = new Uint8Array([110, 190, 255]);
    gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
};

export const toon = (color: string | number, opts: { flatShading?: boolean } = {}) => {
  const material = new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient() });
  if (opts.flatShading) {
    // MeshToonMaterial has no flatShading flag in the type, but the
    // underlying shader honors it like other lit materials.
    (material as THREE.MeshToonMaterial & { flatShading: boolean }).flatShading = true;
  }
  return material;
};
