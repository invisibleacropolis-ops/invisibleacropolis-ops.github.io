// Prints one stride of a kami's gait: girdle heights, body pitch, spine
// flex and which paws are planted. Usage: node scripts/inspect-gait.mjs [gait] [kind]
import { build } from "esbuild";
import * as THREE from "three";

const [gait = "gallop", kind = "kitsune"] = process.argv.slice(2);
const bundled = await build({
  stdin: { contents: 'export * from "./src/yokai/kamiCharacters.ts";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
});
const { buildArticulatedKami } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const fox = buildArticulatedKami(kind);
fox.setGroundSampler(undefined);
fox.setGait(gait);
const step = 1 / 120;
let t = 0;
for (; t < 6; t += step) fox.animate(t, 0, 1); // settle into the gait
const bone = (name) => fox.group.getObjectByName(name);
const spine = bone("spine"), chest = bone("chest"), hips = bone("hips");
const v = new THREE.Vector3();
const names = ["F-", "F+", "H-", "H+"];
console.log(`${kind} ${gait}: t   spineY  pitch°  flex°  planted   paw y (F- F+ H- H+)`);
for (let i = 0; i < 24; i++) {
  for (let k = 0; k < 5; k++) { t += step; fox.animate(t, 0, 1); }
  fox.group.updateMatrixWorld(true);
  const paws = fox.limbs.map((leg) => fox.group.worldToLocal(leg.end.getWorldPosition(v.clone())));
  const planted = paws.map((p, j) => (p.y < 2.2 ? names[j] : "  ")).join(" ");
  console.log(`${t.toFixed(3)}  ${spine.position.y.toFixed(2)}  ${(spine.rotation.x * 57.3).toFixed(1).padStart(5)}  ${(chest.rotation.x * 57.3).toFixed(1).padStart(5)}  ${planted}  ${paws.map((p) => p.y.toFixed(1)).join(" ")}`);
}
