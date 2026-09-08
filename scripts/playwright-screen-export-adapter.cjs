/** Serialized into a Playwright tool callback by `tool-start`. Intentionally
 * self-contained: the tool VM provides Page but no require/import or timers. */
module.exports = async function startToolCapture(page, options) {
  if (page.__screenExport?.status().status === 'recording') throw new Error('Stop the current capture before starting another.');
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  const tc = (ms) => {
    const n = Math.max(0, Math.floor(ms));
    return `${pad(Math.floor(n / 3600000))}-${pad(Math.floor(n / 60000) % 60)}-${pad(Math.floor(n / 1000) % 60)}.${pad(n % 1000, 3)}`;
  };
  const origin = Date.now();
  const utc = () => new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${utc()}_${options.label}_tool_${Math.random().toString(16).slice(2, 10)}`;
  const folder = `${options.root}/${id}`;
  const data = { folder, status: 'recording', startedAtUtc: new Date().toISOString(),
    frames: [], errors: [], missedSlots: 0, intervalMs: 1000, stopReason: null };
  let stopped = false, inFlight = Promise.resolve(), finishing, attempts = 0;
  const status = () => ({ folder, status: data.status, frames: data.frames.length, errors: data.errors.length,
    missedSlots: data.missedSlots, stopReason: data.stopReason });
  async function frame(final = false) {
    const started = Date.now(), elapsedMs = started - origin;
    const filename = `tc_${tc(elapsedMs)}__${utc()}__${pad(attempts++, 6)}${final ? '__stopped' : ''}.png`;
    try {
      await page.screenshot({ path: `${folder}/${filename}`, type: 'png', fullPage: false,
        animations: 'allow', caret: 'hide', scale: 'css', timeout: 5000 });
      data.frames.push({ filename, elapsedMs, captureStartedAtUtc: new Date(started).toISOString(),
        durationMs: Date.now() - started, url: page.url() });
      return true;
    } catch (error) {
      data.errors.push({ elapsedMs, message: error.message });
      return false;
    }
  }
  async function stop(reason = 'manual') {
    if (finishing) return finishing;
    stopped = true;
    finishing = (async () => {
      await inFlight;
      // A final timecoded PNG is also the tool mode's on-disk stop receipt.
      // No filesystem API is available inside this Playwright VM.
      const receipt = !page.isClosed() && await frame(true);
      data.status = 'stopped'; data.stopReason = reason; data.endedAtUtc = new Date().toISOString();
      return { ...status(), cleanupReady: receipt, metadata: data };
    })();
    return finishing;
  }
  async function loop() {
    while (!stopped && !page.isClosed() && attempts < options.maxFrames) {
      const elapsed = Date.now() - origin;
      const slot = Math.floor(elapsed / 1000) + 1;
      data.missedSlots = Math.max(0, slot - attempts);
      try { await page.waitForTimeout(Math.max(1, slot * 1000 - elapsed)); } catch { break; }
      if (stopped || page.isClosed()) break;
      inFlight = frame();
      await inFlight;
    }
    if (!stopped) await stop(page.isClosed() ? 'page-closed' : 'frame-limit');
  }
  page.__screenExport = { status, stop, metadata: () => data };
  inFlight = frame();
  if (!await inFlight) { await stop('initial-capture-failed'); throw new Error(data.errors[0].message); }
  void loop().catch((error) => { data.errors.push({ message: error.message }); data.status = 'error'; });
  return status();
};
