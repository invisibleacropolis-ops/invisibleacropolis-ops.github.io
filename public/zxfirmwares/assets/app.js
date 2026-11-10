import { sources, claims, firmwares, controls, milestones } from './research-data.js';
import { estimateMemory, velocityCurve, matchesFirmware, softTakeover, emptyWorkspace, validateWorkspace } from './engine.js';
import { initCodecLab, stopAudition } from './codec-lab.js';
import { initSpectrum } from './spectrum.js';

const $ = id => document.getElementById(id);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const storageKey = 'zxfirmwares.workspace.v1';
const milestoneIds = milestones.map(item => item.id);
const controlIds = controls.map(item => item.id);
const validate = value => validateWorkspace(value, milestoneIds, controlIds);
let workspace = emptyWorkspace();
let storageNotice = '';
const charts = {};
const sourceMap = new Map(sources.map(source => [source.id, source]));
function sourceLink(id) {
  const source = sourceMap.get(id);
  if (!source?.url) return node('span', `${id} · private source`, 'badge');
  const link = node('a', `${id} ↗`, 'badge');
  link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = source.title;
  return link;
}
function saveWorkspace() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(workspace));
    $('workspace-status').textContent = 'Saved locally.';
  } catch {
    $('workspace-status').textContent = 'Storage unavailable/full. Export JSON.';
  }
}
function loadWorkspace() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) workspace = validate(JSON.parse(raw));
    storageNotice = raw ? 'Workspace loaded.' : '';
  } catch {
    storageNotice = 'Workspace read failed.';
  }
}
function renderClaims() {
  const query = $('research-search').value.trim().toLowerCase();
  const status = $('research-filter').value;
  const filtered = claims.filter(claim => (status === 'all' || claim.status === status) && [claim.id, claim.title, claim.text, claim.scope, ...claim.sources].join(' ').toLowerCase().includes(query));
  $('claims-list').replaceChildren(...filtered.map(claim => {
    const card = node('article', undefined, 'research-card');
    card.append(node('span', `${claim.id} / ${claim.status}`, 'eyebrow'), node('h3', claim.title, 'font-semibold mt-2'));
    const links = node('div', undefined, 'flex flex-wrap gap-2 mt-3'); links.append(...claim.sources.map(sourceLink)); card.append(links);
    return card;
  }));
  $('claim-count').textContent = `${filtered.length} of ${claims.length} claims${filtered.length ? '' : ' — no matches'}`;
}
function renderSources() {
  $('source-list').replaceChildren(...sources.map(source => {
    const card = node('article', undefined, 'research-card'); card.id = `source-${source.id}`;
    card.append(node('p', `${source.id} / ${source.kind}`, 'eyebrow'), node('h3', source.title, 'font-semibold mt-2'));
    if (source.url) { const link = sourceLink(source.id); link.textContent = 'Open source reference ↗'; card.append(link); }
    else card.append(node('p', source.path, 'muted mt-3'));
    return card;
  }));
}
function updateProgress() {
  $('plan-progress').textContent = `${workspace.completed.length} / ${milestones.length}`;
}
function renderMilestones() {
  $('milestone-list').replaceChildren(...milestones.map(item => {
    const label = node('label', undefined, 'check-card');
    const input = node('input'); input.type = 'checkbox'; input.checked = workspace.completed.includes(item.id); input.dataset.milestone = item.id;
    input.addEventListener('change', () => {
      workspace.completed = input.checked ? [...new Set([...workspace.completed, item.id])] : workspace.completed.filter(id => id !== item.id);
      updateProgress(); saveWorkspace();
    });
    const text = node('span'); text.append(node('strong', item.title, 'block'));
    label.append(input, text); return label;
  })); updateProgress();
}
function renderControls() {
  $('control-list').replaceChildren(...controls.map(control => {
    const card = node('article', undefined, 'research-card');
    const label = node('label', 'Proposed role (editable)', 'block text-xs mt-3');
    const input = node('input', undefined, 'field mt-1'); input.type = 'text'; input.maxLength = 240; input.id = `mapping-${control.id}`; input.value = workspace.mappings[control.id] ?? control.proposal; label.htmlFor = input.id;
    input.addEventListener('input', () => { workspace.mappings[control.id] = input.value; saveWorkspace(); });
    card.append(node('h3', control.title, 'font-semibold'), label, input); return card;
  }));
}
function renderFirmware() {
  const filtered = firmwares.filter(item => matchesFirmware(item, $('fw-search').value, $('fw-filter').value));
  $('firmware-grid').replaceChildren(...filtered.map(item => {
    const card = node('article', undefined, 'research-card');
    card.append(node('p', item.status, 'eyebrow'), node('h3', item.name, 'font-bold mt-2'), node('p', item.author, 'muted mt-1'), node('p', `Polyphony: ${item.poly} · RAM: ${item.ram}`, 'muted mt-3'));
    const tags = node('div', undefined, 'flex flex-wrap gap-2 mt-3'); tags.append(...item.tags.map(tag => node('span', tag, 'badge')), sourceLink(item.source)); card.append(tags); return card;
  }));
  if (!filtered.length) $('firmware-grid').append(node('p', '0 results' , 'notice'));
}
function makeChart(id, configuration) {
  if (!window.Chart) {
    $(id).parentElement.append(node('p', 'Chart unavailable.', 'muted')); return null;
  }
  return new window.Chart($(id), configuration);
}
function initVisibleChart(tab) {
  if (window.Chart) window.Chart.defaults.font.family = '"Silkscreen", "Courier New", monospace';
  const common = { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#cfdae1' } } } };
  if (tab === 'tab-architecture' && !charts.sram) charts.sram = makeChart('sramChart', {
    type:'doughnut', data:{labels:['Pool budget','Application RAM budget','Other / reserved window'],datasets:[{data:[360,72,80],backgroundColor:['#ffb078','#79b9f0','#425f72'],borderColor:'#05080a',borderWidth:2}]}, options:common
  });
  if (tab === 'tab-hal' && !charts.velocity) {
    charts.velocity = makeChart('velocityChart', { type:'line',data:{labels:['0','0.25','0.5','0.75','1'],datasets:[{label:'Illustrative MIDI velocity',data:velocityCurve(+$('trim-p1').value,+$('trim-p5').value),borderColor:'#ffb078',tension:0}]},options:{...common,scales:{y:{min:0,max:127,ticks:{color:'#cfdae1'}},x:{ticks:{color:'#cfdae1'}}}} });
    updateVelocity();
  }
  if (tab === 'tab-calculator' && !charts.dsp) {
    charts.dsp = makeChart('dspChart', {type:'bar',data:{labels:['Operator state','Delay line','I/O buffers','Overhead','Remaining'],datasets:[{label:'KiB',data:[],backgroundColor:['#ffb078','#79b9f0','#79d3a6','#a7a4ff','#425f72']}]},options:{...common,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{color:'#cfdae1'}},y:{ticks:{color:'#cfdae1'}}}}});
    calculateDSP();
  }
  for (const chart of Object.values(charts)) chart?.resize();
  void document.fonts?.ready.then(() => { for (const chart of Object.values(charts)) chart?.update('none'); });
}
function activateTab(id, updateHash = true, focus = false) {
  const target = $(id); if (!target?.classList.contains('tab-content')) id = 'tab-research';
  document.querySelectorAll('.tab-content').forEach(panel => { const selected = panel.id === id; panel.classList.toggle('hidden', !selected); panel.hidden = !selected; });
  document.querySelectorAll('[role=tab]').forEach(button => {
    const selected = button.dataset.tab === id; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    if (selected && focus) { button.focus(); button.scrollIntoView({block:'nearest',inline:'nearest'}); }
  });
  if (updateHash) history.replaceState(null, '', `#${id}`);
  initVisibleChart(id);
  if(id !== 'tab-prototype') stopAudition();
}
const flashDetails = {
  app:'S06 / Pro 016 / decoded payload: [0x4120, 0x9B5D8)',
  collision:'S06 / FM-1 save base: 0x97000 / SMK Pro application: [0x4120, 0x9B5D8)',
  trim:'S06 / S07 / USRTRIM calibration and identity',
  clock:'S05 / SYS_CLK: 360000000 Hz / family specification: 320 MHz / runtime measurement: —'
};
function updateVelocity() {
  const values = velocityCurve(+$('trim-p1').value, +$('trim-p5').value);
  $('velocity-summary').textContent = `Curve: ${values.join(', ')}`;
  if (charts.velocity) { charts.velocity.data.datasets[0].data = values; charts.velocity.update(); }
}
function calculateDSP() {
  const sampleRate = +$('param-sr').value, voices = +$('param-voices').value, operators = +$('param-ops').value, delaySeconds = +$('param-reverb').value, bufferFrames = +$('param-buffer').value;
  const model = estimateMemory({ sampleRate, voices, operators, delaySeconds, bufferFrames });
  for (const [id, value] of Object.entries({'val-sr':`${sampleRate} Hz`,'val-voices':`${voices} voices`,'val-ops':`${operators} operators`,'val-reverb':`${delaySeconds.toFixed(1)} s`,'val-buffer':`${bufferFrames} frames`,'calc-ram-total':`${model.totalKiB.toFixed(1)} KiB`,'calc-ram-free':`${model.remainingKiB.toFixed(1)} KiB`})) $(id).textContent = value;
  $('calc-status').textContent = { 'over-budget':'EXCEEDS MODEL POOL', 'low-headroom':'LOW MODEL HEADROOM', 'within-model':'WITHIN POOL' }[model.status];
  $('calc-status').className = `badge ${model.status === 'over-budget' ? 'text-rose-300' : 'text-amber-300'}`;
  $('buffer-duration').textContent = `${bufferFrames} frames / ${model.bufferMs.toFixed(2)} ms / ${sampleRate} Hz\nState ${model.oscillatorKiB.toFixed(1)} · delay ${model.delayKiB.toFixed(1)} · I/O ${model.ioKiB.toFixed(1)} · overhead ${model.overheadKiB.toFixed(1)} KiB`;
  if (charts.dsp) { charts.dsp.data.datasets[0].data = [model.oscillatorKiB,model.delayKiB,model.ioKiB,model.overheadKiB,Math.max(0,model.remainingKiB)]; charts.dsp.update(); }
}
let pickupPrevious = .2, pickupLatched = false;
function updatePickup(reset = false) {
  const current = +$('pickup-input').value / 100, target = +$('pickup-target').value / 100;
  if (reset) { pickupPrevious = current; pickupLatched = false; }
  const result = softTakeover(pickupPrevious, current, target, pickupLatched);
  pickupPrevious = current; pickupLatched = result.pickedUp;
  $('pickup-status').textContent = `Target ${Math.round(target*100)}% · Input ${Math.round(current*100)}% · Output ${Math.round(result.value*100)}% · ${result.pickedUp ? 'PICKED UP — following fader' : 'WAITING — target held'}`;
}
function setupNotebook() {
  $('research-notes').value = workspace.notes;
  $('workspace-status').textContent = storageNotice;
  $('research-notes').addEventListener('input', event => { workspace.notes = event.target.value; saveWorkspace(); });
  $('export-workspace').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(workspace, null, 2) + '\n'], {type:'application/json'});
    const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = `zxfirmwares-workspace-${new Date().toISOString().slice(0,10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('workspace-status').textContent = 'JSON export requested.';
  });
  $('import-workspace').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 512000) throw new Error('File exceeds 500 KiB');
      const imported = validate(JSON.parse(await file.text()));
      if (!window.confirm('Replace this browser’s notes, mappings and checklist with the imported workspace? Export first if needed.')) return;
      workspace = imported; $('research-notes').value = workspace.notes; renderControls(); renderMilestones(); saveWorkspace();
    } catch (error) { $('workspace-status').textContent = `Import rejected: ${error.message}. Current workspace unchanged.`; }
    finally { event.target.value = ''; }
  });
}
function start() {
  initCodecLab();initSpectrum();
  loadWorkspace(); renderClaims(); renderSources(); renderMilestones(); renderControls(); renderFirmware(); setupNotebook(); updateVelocity(); calculateDSP(); updatePickup(true);
  for (const id of ['research-search','research-filter']) $(id).addEventListener('input', renderClaims);
  for (const id of ['fw-search','fw-filter']) $(id).addEventListener('input', renderFirmware);
  for (const id of ['trim-p1','trim-p5']) $(id).addEventListener('input', updateVelocity);
  for (const id of ['param-sr','param-voices','param-ops','param-reverb','param-buffer']) $(id).addEventListener('input', calculateDSP);
  $('pickup-input').addEventListener('input', () => updatePickup()); $('pickup-target').addEventListener('input', () => updatePickup(true)); $('pickup-reset').addEventListener('click', () => updatePickup(true));
  document.querySelectorAll('[data-flash]').forEach(button => button.addEventListener('click', () => { $('flash-detail-card').textContent = flashDetails[button.dataset.flash]; }));
  const tabs = [...document.querySelectorAll('[role=tab]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); activateTab(tabs[next].dataset.tab, true, true); }
    });
  });
  window.addEventListener('hashchange', () => activateTab(location.hash.slice(1), false));
  activateTab(location.hash.slice(1) || 'tab-research', false);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
