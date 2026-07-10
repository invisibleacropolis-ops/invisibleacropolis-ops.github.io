import * as THREE from "three";

/**
 * Art direction for Kakuriyo — a mystical Japan seen through the eyes of
 * its spirits. Golden-hour light, mist-layered mountains, vivid meadows:
 * the palette of ukiyo-e prints and Ghibli skies.
 */
export const KAKURIYO = {
  // Sky
  skyZenith: "#6685b4",
  skyHorizon: "#efb995",
  sunColor: "#ffe4b5",
  hazeColor: "#b9c5d0",

  // Land
  meadow: "#789f5c",
  hillside: "#4d774d",
  forestFloor: "#315741",
  cliff: "#737d8c",
  sand: "#c9b991",

  // Mountains (near → far, fading into the mist)
  mountainNear: "#64738c",
  mountainMid: "#7e8ba1",
  mountainFar: "#9da8b8",
  snow: "#e7e1d5",

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
  sakura: "#e8abc0",
  sakuraDeep: "#bd7898",
  pine: "#315a46",
  bamboo: "#659252",
  trunk: "#6b4a38",

  // Spirits
  spiritWhite: "#f5f2ea",
  spiritGlow: "#aee3ff",
  foxRed: "#c9502e",
  tanukiBrown: "#8a6748",
  kappaGreen: "#6da85c",
} as const;

/**
 * Shared two-band ramp. Fewer, clearly separated bands are essential here:
 * MeshToonMaterial samples this 1D texture with nearest filtering, so each
 * texel becomes a deliberate cel-lighting plane rather than a smooth gradient.
 */
let gradientMap: THREE.DataTexture | null = null;

export const getToonGradient = (): THREE.DataTexture => {
  if (!gradientMap) {
    // The shadow stays colorful at ~69% brightness rather than collapsing to
    // black; the sharp jump into the light plane supplies the graphic anime read.
    // Three repeated shadow texels move the hard light break toward the
    // sun-facing end of N·L. This creates broad colored shadow planes with a
    // narrow, graphic key-light shape—the familiar hand-painted cel pattern.
    const data = new Uint8Array([190, 190, 190, 255]);
    gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
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
