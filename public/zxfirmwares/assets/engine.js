// Pure host-side models. No device I/O and no claim of measured DSP performance.
function bounded(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${name}`);
  return value;
}
export function estimateMemory({ sampleRate, voices, operators, delaySeconds, bufferFrames, poolKiB = 360, operatorBytes = 1843, overheadKiB = 32, channels = 2, sampleBytes = 4, bufferCount = 2 }) {
  bounded(sampleRate, 8000, 192000, 'sample rate');
  bounded(voices, 1, 128, 'voices'); bounded(operators, 1, 64, 'operators');
  bounded(delaySeconds, 0, 60, 'delay'); bounded(bufferFrames, 1, 8192, 'buffer frames');
  bounded(poolKiB, 1, 65536, 'pool'); bounded(operatorBytes, 0, 1048576, 'operator state');
  bounded(overheadKiB, 0, 65536, 'overhead'); bounded(channels, 1, 16, 'channels');
  bounded(sampleBytes, 1, 8, 'sample bytes'); bounded(bufferCount, 1, 16, 'buffers');
  for (const n of [sampleRate, voices, operators, bufferFrames, channels, sampleBytes, bufferCount, operatorBytes]) if (!Number.isInteger(n)) throw new RangeError('Counts must be integers');
  const oscillatorKiB = voices * operators * operatorBytes / 1024;
  const delayKiB = sampleRate * delaySeconds * channels * sampleBytes / 1024;
  const ioKiB = bufferFrames * channels * sampleBytes * bufferCount / 1024;
  const totalKiB = oscillatorKiB + delayKiB + ioKiB + overheadKiB;
  const remainingKiB = poolKiB - totalKiB;
  return { oscillatorKiB, delayKiB, ioKiB, overheadKiB, totalKiB, remainingKiB, poolKiB,
    bufferMs: bufferFrames / sampleRate * 1000,
    status: remainingKiB < 0 ? 'over-budget' : remainingKiB < poolKiB * .15 ? 'low-headroom' : 'within-model' };
}
// Illustrative normalized response, NOT the SMK trim decoder or a calibration tool.
export function velocityCurve(soft, hard) {
  bounded(soft, 1, 63, 'soft point'); bounded(hard, 65, 126, 'hard point');
  return [1, soft, 64, hard, 127];
}
export function matchesFirmware(item, search, category) {
  const text = [item.name, item.author, item.desc, item.status, ...item.tags].join(' ').toLowerCase();
  return (category === 'all' || item.cat === category) && text.includes(search.trim().toLowerCase());
}
export function softTakeover(previous, current, target, latched = false, tolerance = .02) {
  for (const v of [previous, current, target]) bounded(v, 0, 1, 'normalized control');
  bounded(tolerance, 0, .2, 'pickup tolerance');
  const pickedUp = latched || Math.abs(current - target) <= tolerance || (previous - target) * (current - target) <= 0;
  return { pickedUp, value: pickedUp ? current : target };
}
export function emptyWorkspace() { return { version: 1, notes: '', completed: [], mappings: {} }; }
export function validateWorkspace(input, milestoneIds, controlIds) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) throw new Error('Unsupported workspace version');
  if (typeof input.notes !== 'string' || input.notes.length > 100000) throw new Error('Notes must be at most 100,000 characters');
  if (!Array.isArray(input.completed) || input.completed.length > milestoneIds.length || input.completed.some(id => !milestoneIds.includes(id))) throw new Error('Invalid milestone IDs');
  if (!input.mappings || typeof input.mappings !== 'object' || Array.isArray(input.mappings)) throw new Error('Invalid control mappings');
  const mappings = {};
  for (const [key, value] of Object.entries(input.mappings)) {
    if (!controlIds.includes(key) || typeof value !== 'string' || value.length > 240) throw new Error('Invalid control mapping');
    mappings[key] = value;
  }
  return { version: 1, notes: input.notes, completed: [...new Set(input.completed)], mappings };
}
