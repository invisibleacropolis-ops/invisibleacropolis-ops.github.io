/**
 * Copies the standalone demo pages (and the assets they reference) into dist/
 * after the Vite build. These pages are self-contained HTML files served from
 * the repo root — Vite only bundles the entries listed in vite.config.ts, so
 * without this step the deployed site 404s on every destination link.
 */
const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Standalone HTML pages at the repo root (everything pages.json points at).
const IGNORED_DIRS = new Set(['.git', '.github', 'dist', 'node_modules', 'public', 'src', 'scripts', 'docs']);
// Vite processes both entry pages; copying their source HTML would overwrite
// the bundled output and break module loading in production.
const EXCLUDED_FILES = new Set(['index.html', 'kami.html']);

// Non-HTML assets the standalone pages depend on.
const EXTRA_ASSETS = ['galaxy.js', 'galaxy.css', 'fluid', 'app-ads.txt'];

const copyEntry = async (relativePath) => {
  const source = path.join(ROOT_DIR, relativePath);
  const target = path.join(DIST_DIR, relativePath);

  try {
    await fs.access(source);
  } catch {
    console.warn(`copy-static-pages: skipping missing entry "${relativePath}"`);
    return false;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
  return true;
};

const main = async () => {
  const copied = [];

  const rootEntries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name.endsWith('.html') && !EXCLUDED_FILES.has(entry.name)) {
      if (await copyEntry(entry.name)) copied.push(entry.name);
    }
  }

  for (const asset of EXTRA_ASSETS) {
    if (await copyEntry(asset)) copied.push(asset);
  }

  console.log(`copy-static-pages: copied ${copied.length} entries -> ${copied.join(', ')}`);
};

main().catch((error) => {
  console.error('copy-static-pages failed');
  console.error(error);
  process.exitCode = 1;
});
