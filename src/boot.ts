/**
 * Entry switch for /kami.html. The default experience is Kakuriyo (the hidden
 * world of the kami). The previous neon-wireframe dimension is preserved
 * in full and reachable with ?classic while it awaits its final resting
 * place in the archive.
 */
const params = new URLSearchParams(window.location.search);

if (params.has("kami")) {
  void import("./yokai/kamiStudio.ts");
} else if (params.has("classic")) {
  void import("./index.ts");
} else {
  void import("./yokai/main.ts");
}
