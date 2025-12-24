const fs = require('fs/promises');
const path = require('path');

const ROOT_DIR = process.cwd();
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'pages.json');
const DEFAULT_EXCLUDES = new Set(['index.html']);
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'public']);

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
    pages.push({
      title,
      url: `/${relativePath}`,
    });
  }

  pages.sort((a, b) => a.url.localeCompare(b.url));

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
