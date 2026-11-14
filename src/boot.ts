/**
 * Entry switch for /kami.html. The default experience is Kakuriyo (the hidden
 * world of the kami). The previous neon-wireframe dimension is preserved
 * in full and reachable with ?classic while it awaits its final resting
 * place in the archive.
 */
const params = new URLSearchParams(window.location.search);

// Sculpted kami bodies must be registered before the world builds its cast;
// a failed fetch leaves those kami on their procedural bodies.
const withKamiModels = (start: () => Promise<unknown>) =>
  import("./yokai/kamiModels.ts")
    .then(({ preloadKamiModels }) => preloadKamiModels(import.meta.env.BASE_URL))
    .catch((error) => console.warn("Kakuriyo: sculpted kami unavailable", error))
    .then(start);

if (params.has("kami")) {
  void withKamiModels(() => import("./yokai/kamiStudio.ts"));
} else if (params.has("classic")) {
  void import("./index.ts");
} else {
  void withKamiModels(() => import("./yokai/main.ts"));
}
