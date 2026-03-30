const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = process.cwd();
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'pages.json');
const DEFAULT_EXCLUDES = new Set(['index.html']);
const IGNORED_DIRS = new Set(['.git', 'dist', 'node_modules', 'public']);

const normalizePath = (filePath) => filePath.split(path.sep).join('/');

const loadExcludedPaths = () => {
  const raw = process.env.PAGES_EXCLUDE || '';
  const entries = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^\.\//, ''))
    .map((value) => value.replace(/^\//, ''))
    .map((value) => normalizePath(value));
  return new Set(entries);
};

const toTitleCase = (value) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const humanizeFilename = (filePath) => {
  const base = path.basename(filePath, '.html');
  const spaced = base.replace(/[-_]+/g, ' ');
  return toTitleCase(spaced);
};

const extractTitle = async (filePath) => {
  const contents = await fs.readFile(filePath, 'utf8');
  const match = contents.match(/<title>([^<]+)<\/title>/i);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return humanizeFilename(filePath);
};

const walk = async (dir, files = []) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      await walk(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
};

const IA_CONTRACT = {
  'audio-reactive.html': {
    description: 'Audio-driven visualizer with spectrum-reactive geometry.',
    category: 'Realtime Audio',
    navGroup: 'Workflows',
    priority: 20,
    statusBadge: 'Stable',
    iconToken: '🔊',
    audience: 'Creative technologists',
  },
  'cloth.html': {
    description: 'XPBD cloth simulation playground with tweakable constraints.',
    category: 'Physics Simulation',
    navGroup: 'Labs',
    priority: 60,
    statusBadge: 'Experimental',
    iconToken: '🧵',
    audience: 'Simulation engineers',
  },
  'flow-field.html': {
    description: 'GPU particle advection through procedural vector fields.',
    category: 'GPU Compute',
    navGroup: 'Workflows',
    priority: 30,
    statusBadge: 'Stable',
    iconToken: '🌊',
    audience: 'Graphics engineers',
  },
  'fluid.html': {
    description: 'WebGL fluid volume prototype and solver experiments.',
    category: 'Fluid Dynamics',
    navGroup: 'Labs',
    priority: 70,
    statusBadge: 'Experimental',
    iconToken: '💧',
    audience: 'Shader developers',
  },
  'galaxy.html': {
    description: 'Interactive 3D galaxy scene with cinematic controls.',
    category: 'Showcase',
    navGroup: 'Start here',
    priority: 10,
    statusBadge: 'Featured',
    iconToken: '🌌',
    audience: 'All visitors',
  },
  'procedural-city.html': {
    description: 'Procedural city block generation and systems layout.',
    category: 'World Generation',
    navGroup: 'Reference',
    priority: 40,
    statusBadge: 'Stable',
    iconToken: '🏙️',
    audience: 'Systems designers',
  },
  'volumetric-nebula.html': {
    description: 'Volumetric raymarching demo for atmospheric nebula rendering.',
    category: 'Rendering Research',
    navGroup: 'Reference',
    priority: 50,
    statusBadge: 'Beta',
    iconToken: '☁️',
    audience: 'Rendering engineers',
  },
};

const getContract = (relativePath) => {
  const baseName = path.basename(relativePath);
  const contract = IA_CONTRACT[baseName];
  if (contract) return contract;

  return {
    description: `Explore ${humanizeFilename(baseName)}.`,
    category: 'General',
    navGroup: 'Labs',
    priority: 999,
    statusBadge: 'Unclassified',
    iconToken: '🧭',
    audience: 'All visitors',
  };
};

const buildPagesJson = async () => {
  const excludedPaths = loadExcludedPaths();
  const htmlFiles = await walk(ROOT_DIR);
  const pages = [];

  for (const filePath of htmlFiles) {
    const relativePath = normalizePath(path.relative(ROOT_DIR, filePath));
    const baseName = path.basename(relativePath);

    if (DEFAULT_EXCLUDES.has(relativePath) || DEFAULT_EXCLUDES.has(baseName)) {
      continue;
    }

    if (excludedPaths.has(relativePath) || excludedPaths.has(baseName)) {
      continue;
    }

    const title = await extractTitle(filePath);
    const contract = getContract(relativePath);
    pages.push({
      title,
      url: `/${relativePath}`,
      ...contract,
    });
  }

  pages.sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url));

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(pages, null, 2)}\n`);
  return pages.length;
};

buildPagesJson()
  .then((count) => {
    console.log(`Generated ${count} entries in ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
  })
  .catch((error) => {
    console.error('Failed to generate pages.json');
    console.error(error);
    process.exitCode = 1;
  });
