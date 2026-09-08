/** Automatic screenshots of an EXISTING Playwright Page. No extra browser,
 * driver, Python package or dependency installation required. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '../.captures/playwright');
const MARKER = 'kakuriyo-playwright-screen-export-v1';
const sessions = new WeakMap();
const pad = (n, width = 2) => String(n).padStart(width, '0');
function timecode(ms) {
  const t = Math.max(0, Math.floor(ms));
  return `${pad(Math.floor(t / 3600000))}-${pad(Math.floor(t / 60000) % 60)}-${pad(Math.floor(t / 1000) % 60)}.${pad(t % 1000, 3)}`;
}

async function start(page, { label = 'review', intervalMs = 1000, maxFrames = 600, timeoutMs = 5000 } = {}) {
  if (!page || typeof page.screenshot !== 'function' || page.isClosed()) throw new Error('An open Playwright Page is required.');
  if (sessions.has(page)) throw new Error('This page already has a capture session. Stop it before starting another.');
  for (const [name, value, min, max] of [['intervalMs', intervalMs, 100, 60000], ['maxFrames', maxFrames, 1, 3600], ['timeoutMs', timeoutMs, 100, 30000]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'review';
  const started = new Date();
  const id = `${started.toISOString().replace(/[:.]/g, '-')}_${safeLabel}_${randomUUID().slice(0, 8)}`;
  const folder = path.join(ROOT, id);
  await fs.mkdir(folder, { recursive: true });
  const manifest = {
    format: MARKER, id, label: String(label), startedAtUtc: started.toISOString(),
    intervalMs, maxFrames, timeoutMs, status: 'recording', stopReason: null,
    initialUrl: page.url(), frames: [], errors: [], missedSlots: 0,
  };
  const origin = performance.now();
  let timer, inFlight = Promise.resolve(), stopped = false, finishing, attempts = 0;
  const snapshot = () => ({ folder, status: manifest.status, frames: manifest.frames.length,
    errors: manifest.errors.length, missedSlots: manifest.missedSlots, stopReason: manifest.stopReason });
  const save = () => fs.writeFile(path.join(folder, 'session.json'), JSON.stringify(manifest, null, 2));
  const onClose = () => { void finish('page-closed').catch(reportFailure); };
  const reportFailure = (error) => { console.error(`[screen-export] ${folder}: ${error.message}`); };

  async function finish(reason = 'manual') {
    if (finishing) return finishing;
    stopped = true;
    clearTimeout(timer);
    finishing = (async () => {
      await inFlight;
      page.off('close', onClose);
      manifest.status = 'stopped'; manifest.stopReason = reason;
      manifest.endedAtUtc = new Date().toISOString();
      try { await save(); } finally { sessions.delete(page); }
      return snapshot();
    })();
    return finishing;
  }

  async function capture() {
    const elapsedMs = performance.now() - origin;
    const utc = new Date().toISOString();
    const filename = `tc_${timecode(elapsedMs)}__${pad(attempts++, 6)}.png`;
    try {
      await page.screenshot({ path: path.join(folder, filename), type: 'png', fullPage: false,
        animations: 'allow', caret: 'hide', scale: 'css', timeout: timeoutMs });
      manifest.frames.push({ filename, elapsedMs: Math.round(elapsedMs), captureStartedAtUtc: utc,
        captureFinishedAtUtc: new Date().toISOString(), durationMs: Math.round(performance.now() - origin - elapsedMs), url: page.url() });
    } catch (error) {
      manifest.errors.push({ elapsedMs: Math.round(elapsedMs), utc, message: error.message });
    }
    await save();
  }

  function schedule() {
    if (stopped) return;
    if (attempts >= maxFrames) { void finish('frame-limit').catch(reportFailure); return; }
    const elapsed = performance.now() - origin;
    const nextSlot = Math.floor(elapsed / intervalMs) + 1;
    manifest.missedSlots = Math.max(0, nextSlot - attempts);
    timer = setTimeout(() => {
      if (stopped) return;
      inFlight = capture();
      void inFlight.then(schedule, (error) => {
        reportFailure(error);
        // Avoid a rejected capture promise preventing finalization.
        inFlight = Promise.resolve();
        void finish('write-error').catch(reportFailure);
      });
    }, Math.max(0, nextSlot * intervalMs - elapsed));
  }
  sessions.set(page, { snapshot, finish });
  page.on('close', onClose);
  try {
    inFlight = capture();
    await inFlight;
    schedule();
    return snapshot();
  } catch (error) {
    inFlight = Promise.resolve();
    await finish('write-error');
    throw error;
  }
}

function status(page) { return sessions.get(page)?.snapshot() ?? { status: 'not-recording' }; }
async function stop(page) { return sessions.has(page) ? sessions.get(page).finish() : { status: 'not-recording' }; }

async function list() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true }).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const folder = path.join(ROOT, entry.name);
    try {
      const data = JSON.parse(await fs.readFile(path.join(folder, 'session.json'), 'utf8'));
      if (data.format === MARKER) results.push({ folder, status: data.status, frames: data.frames.length, startedAtUtc: data.startedAtUtc });
    } catch {
      if (/_tool_[a-f0-9]+$/.test(entry.name)) {
        const files = await fs.readdir(folder);
        results.push({ folder, status: files.some((f) => f.endsWith('__stopped.png')) ? 'stopped' : 'recording-or-interrupted', frames: files.filter((f) => f.startsWith('tc_') && f.endsWith('.png')).length });
      }
    }
  }
  return results;
}

/** Deletes ONLY a marked, stopped, direct child session. Rejects roots,
 * traversal, junctions/symlinks and still-running or unrecognized folders. */
async function clean(sessionFolder) {
  if (!sessionFolder) throw new Error('Provide one exact stopped session folder.');
  const target = path.resolve(sessionFolder);
  if (path.dirname(target).toLowerCase() !== ROOT.toLowerCase()) throw new Error('Cleanup is limited to one direct child of the capture root.');
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Session must be a real directory, not a link.');
  const realRoot = await fs.realpath(ROOT), realTarget = await fs.realpath(target);
  if (path.dirname(realTarget).toLowerCase() !== realRoot.toLowerCase()) throw new Error('Resolved session escapes the capture root.');
  if (/_tool_[a-f0-9]+$/.test(path.basename(target))) {
    const files = await fs.readdir(target, { withFileTypes: true });
    const png = /^tc_\d{2,}-\d{2}-\d{2}\.\d{3}__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z__\d{6}(__stopped)?\.png$/;
    if (!files.some((f) => f.name.endsWith('__stopped.png')) || !files.every((f) => f.isFile() && png.test(f.name))) throw new Error('Tool session needs a final stopped frame and may contain only timecoded PNGs.');
  } else {
    const data = JSON.parse(await fs.readFile(path.join(target, 'session.json'), 'utf8'));
    if (data.format !== MARKER || data.id !== path.basename(target) || data.status !== 'stopped') throw new Error('Only a marked, stopped session can be removed.');
  }
  await fs.rm(target, { recursive: true, force: false });
  return { removed: target };
}

module.exports = { start, stop, status, list, clean, ROOT };
async function prepareTool(label = 'review') {
  const adapter = require('./playwright-screen-export-adapter.cjs');
  const options = { root: ROOT.replaceAll('\\', '/'), label: label.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'review', maxFrames: 600 };
  const filename = path.resolve(ROOT, '../playwright-start.tool.js');
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, `async (page) => (${adapter.toString()})(page, ${JSON.stringify(options)})`);
  return { filename, next: 'Pass this filename to browser_run_code_unsafe. Then interact normally; stop with page.__screenExport.stop().' };
}
if (require.main === module) {
  const [command, folder] = process.argv.slice(2);
  const action = command === 'list' ? list() : command === 'clean' ? clean(folder) : command === 'tool-start' ? prepareTool(folder) : Promise.reject(new Error('Usage: node scripts/playwright-screen-export.cjs tool-start [label] | list | clean "<exact-session-folder>"\nSee docs/playwright-screen-export.md.'));
  action.then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
