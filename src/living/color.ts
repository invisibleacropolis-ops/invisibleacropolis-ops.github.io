// Spectrum + archetype identities. Each directory category gets one archetype:
// a limited band of the ROYGBIV spectrum, a core form, a branching language,
// a leaf glyph and a signature effect.
import { clamp, type V3 } from "./math.ts";

const STOPS: V3[] = [[1, .07, .14], [1, .38, .03], [1, .85, .1], [.12, 1, .3], [.06, .55, 1], [.22, .16, 1], [.66, .14, 1]];

/** ROYGBIV, red (0) -> violet (1), linear-light. */
export const spectrum = (x: number): V3 => {
  const s = clamp(x) * 6;
  const i = Math.min(Math.floor(s), 5);
  const f = s - i;
  const k = f * f * (3 - 2 * f);
  const a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

export const css = (c: V3) => {
  const [r, g, b] = c.map((v) => Math.round(255 * Math.pow(clamp(v * .92 + .08), 1 / 2.2)));
  return `rgb(${r} ${g} ${b})`;
};

export type FxKind = "flare" | "bubbles" | "scan" | "arc" | "migrate" | "tentacle" | "ripple" | "clouds" | "lock";
export type ArchetypeId = "ember" | "bloom" | "circuit";
export type Archetype = {
  id: ArchetypeId;
  name: string;      // core form
  branch: string;    // branching language (plural noun)
  hue: [number, number];
  signature: FxKind;
  slot: 0 | 1 | 2;   // GPU agent species this core hosts: embers / swarm / packets
};

export const ARCH: Record<ArchetypeId, Archetype> = {
  ember: { id: "ember", name: "EMBER LOTUS", branch: "TENTACLES", hue: [0, .24], signature: "flare", slot: 0 },
  bloom: { id: "bloom", name: "BLOOM CELL", branch: "DENDRITES", hue: [.32, .58], signature: "bubbles", slot: 1 },
  circuit: { id: "circuit", name: "CIRCUIT MONOLITH", branch: "TRACES", hue: [.64, 1], signature: "scan", slot: 2 },
};

const ORDER: ArchetypeId[] = ["ember", "bloom", "circuit"];
export const archetypeFor = (key: string, index: number): Archetype =>
  ARCH[key === "world" ? "ember" : key === "experiments" ? "bloom" : key === "systems" ? "circuit" : ORDER[index % 3]];

export const bandHue = (a: Archetype, u: number) => a.hue[0] + (a.hue[1] - a.hue[0]) * clamp(u);
export const palette = (a: Archetype, u: number): V3 => spectrum(bandHue(a, u));
export const wavelength = (hue: number) => Math.round(700 - hue * 300);
