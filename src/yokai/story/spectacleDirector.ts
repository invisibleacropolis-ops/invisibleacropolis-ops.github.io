import * as THREE from "three";
import type { Shot } from "./engine.ts";
import type { ArticulatedKami, KamiPerformance } from "../kamiCharacters.ts";
import { createSpellParticles, createEchoRings, createRainbowArc, enchantCharacter } from "./spectacleFx.ts";

export type SpellCue = { at: number; fire: () => void };
export type SpellShot = {
  pose?: KamiPerformance;
  enter?: () => void;
  cues?: SpellCue[];
  frame?: (progress: number, seconds: number, dt: number) => void;
};

/** Adds cues AFTER existing movement; preserves shot callbacks and narration.
 * Cues are threshold-based, not frame equality, and reset on every onEnter. */
export function createStorySpectacle(parent: THREE.Group, colorA: string, colorB: string, actor?: ArticulatedKami) {
  const group = new THREE.Group(); group.name = "story-spectacle"; parent.add(group);
  const sparks = createSpellParticles("sparks", 768);
  const confetti = createSpellParticles("confetti", 512, 141);
  const smoke = createSpellParticles("smoke", 128, 231);
  const echoes = createEchoRings(colorA);
  const rainbow = createRainbowArc();
  sparks.setColors(colorA, colorB); confetti.setColors(colorA, colorB); smoke.setColors(colorB, "#dce0db");
  group.add(sparks.group, confetti.group, smoke.group, echoes.group, rainbow.group);
  const enchantment = actor ? enchantCharacter(actor.group, colorA) : undefined;
  let clock = 0, trailClock = 0, disposed = false;
  return {
    group, sparks, confetti, smoke, echoes, rainbow, enchantment,
    trail(at: THREE.Vector3, dt: number, strength = 1) {
      trailClock += dt * 35 * strength;
      const count = Math.min(12, Math.floor(trailClock)); trailClock -= Math.floor(trailClock);
      if (count > 0) sparks.burst(at, { count, size: 10, speed: 9, life: 2.2, spread: 5 });
    },
    direct(shots: Shot[], scenes: Record<number, SpellShot>) {
      shots.forEach((shot, index) => {
        const scene = scenes[index];
        const originalEnter = shot.onEnter, originalUpdate = shot.onUpdate;
        const fired = new Set<number>();
        shot.onEnter = () => {
          fired.clear();
          actor?.setPerformance(scene?.pose ?? {});
          originalEnter?.(); scene?.enter?.();
        };
        shot.onUpdate = (progress, dt, seconds) => {
          originalUpdate?.(progress, dt, seconds);
          clock += dt;
          sparks.update(clock); confetti.update(clock); smoke.update(clock); echoes.update(clock); rainbow.update(clock); enchantment?.update(clock);
          scene?.cues?.forEach((cue, cueIndex) => {
            if (seconds >= cue.at && !fired.has(cueIndex)) { fired.add(cueIndex); cue.fire(); }
          });
          scene?.frame?.(progress, seconds, dt);
        };
      });
    },
    dispose() {
      if (disposed) return; disposed = true;
      sparks.dispose(); confetti.dispose(); smoke.dispose(); echoes.dispose(); rainbow.dispose(); enchantment?.dispose(); group.removeFromParent();
    },
  };
}
