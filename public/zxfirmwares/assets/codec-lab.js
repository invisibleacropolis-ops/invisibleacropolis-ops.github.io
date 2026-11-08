import { codecBytes, writeWav } from './codec.js';
import { brrBytes } from './brr.js';
const $=id=>document.getElementById(id);
let worker,result,context,source,outputGain;
let playbackEpoch=0,encodeEpoch=0;
export function stopAudition() {
  playbackEpoch++;
  if(source) { source.onended=null; try {source.stop();} catch {} source.disconnect(); source=null; }
  outputGain?.disconnect(); outputGain=null;
  const state=$('audition-status'); if(state) state.textContent='Stopped. Audio starts only when you press Play.';
}
function download(bytes,name,type) {
  const url=URL.createObjectURL(new Blob([bytes],{type})),link=document.createElement('a');
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setBusy(busy) {
  for(const id of ['codec-run','codec-file','codec-rate','codec-search','brr-mask','brr-restart','brr-beam','tonal-enable','tonal-partials','tonal-target']) $(id).disabled=busy;
  $('codec-cancel').disabled=!busy;
  for(const id of ['tonal-export','tonal-wav'])$(id).disabled=busy||!result?.tonal;
  $('audition-source').querySelectorAll('[data-tonal]').forEach(option=>{option.disabled=busy||!result?.tonal;});
  if(!result?.tonal&&$('audition-source').value.startsWith('tonal-'))$('audition-source').value='original';
  for(const id of ['audition-play','codec-export','codec-wav','codec-original-wav','brr-export','brr-wav','marker-export']) $(id).disabled=busy || !result;
}
function renderBudget() {
  const rate=+$('codec-rate').value,reels=+$('codec-reels').value,frames=rate*30,pool=+$('codec-pool').value*1024;
  const rows=[['PCM16 mono',frames*2*reels,'Raw body; container overhead excluded'],['Linear PCM8 mono',frames*reels,'Raw body; container overhead excluded'],['ZXA1 IMA4 mono',codecBytes(frames,reels),'Includes 20-byte header/reel and independent 132-byte blocks'],['ZBR1 BRR mono',brrBytes(frames)*reels,'Includes 24-byte header/reel and 9 bytes per 16 frames'],['2-bit ideal mono',Math.ceil(frames/4)*reels,'Lower-bound math only; no encoder/header/quality claim']];
  $('codec-budget').replaceChildren(...rows.map(([name,bytes,note])=>{
    const row=document.createElement('tr');
    for(const text of [name,`${(bytes/1024).toFixed(1)} KiB`,bytes<=pool?'Within hypothetical pool':'Exceeds hypothetical pool',note]) {const cell=document.createElement('td');cell.textContent=text;cell.className='p-3 border-b border-slate-800';row.append(cell);}
    return row;
  }));
  $('codec-budget-caption').textContent=`30 seconds × ${reels} independent mono reel${reels===1?'':'s'} at ${rate} Hz, compared with a hypothetical ${pool/1024} KiB sample-only pool. Stereo approximately doubles the audio budget. Firmware, protected data, metadata and wear policy still need a real layout.`;
}
async function runCodec() {
  const epoch=++encodeEpoch;
  stopAudition();setBusy(true);
  $('codec-status').textContent='Encoding in a worker… no microphone, USB or network upload. A long clip may take several seconds.';
  try {
    const file=$('codec-file').files?.[0];
    if(file && file.size>16*1024*1024) throw new Error('WAV exceeds 16 MiB');
    const buffer=file ? await file.arrayBuffer() : undefined;
    if(epoch!==encodeEpoch)return;
    worker?.terminate(); worker=new Worker(new URL('./codec-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=event=>{
      if(epoch!==encodeEpoch)return;
      if(event.data.progress){$('codec-status').textContent=event.data.progress;return;}
      if(event.data.error) { $('codec-status').textContent=`Not encoded: ${event.data.error}. Previous result, if any, is unchanged.`;setBusy(false);worker.terminate();worker=null;return; }
      result=event.data;
      const snr=metrics=>metrics.snrDb===null ? 'not defined (silence or zero error)' : `${metrics.snrDb.toFixed(2)} dB`;
      $('codec-status').textContent=`Ready: ${(result.original.length/result.rate).toFixed(3)} s, ${result.rate} Hz mono; input ${result.sourceRate} Hz / ${result.sourceChannels} channel(s). ${result.encoded.length} encoded bytes (${(result.encoded.length/1024).toFixed(2)} KiB). IMA RMSE ${result.metrics.rmse.toFixed(2)}, SNR ${snr(result.metrics)}; PCM8 RMSE ${result.metrics8.rmse.toFixed(2)}, SNR ${snr(result.metrics8)}. Metrics compare against the resampled/downmixed PCM16 reference, not the original multichannel file. BRR: ${result.brrEncoded.length} bytes, RMSE ${result.metricsBrr.rmse.toFixed(2)}, SNR ${snr(result.metricsBrr)}, filters [${result.statistics.filters.join(', ')}], restart ${result.statistics.restart} blocks, encoder ${result.encoderSelection}. Exact-marker container: ${result.markerEncoded.length} bytes (${result.markerInfo.mode}); no extra loss relative to this BRR result. Listen before choosing.`;
      $('tonal-summary').textContent=result.tonal?`Source-fitted candidate: ${result.tonal.summary.bytes} B vs ${result.tonal.summary.flatBytes} B flat BRR. Objective target ${result.tonal.summary.targetDb} dB SNR: ${result.tonal.summary.targetMet?'MET':'NOT MET'}; measured ${snr(result.tonal.summary.metrics)}; selection ${result.tonal.summary.selection}. Model-only ${result.tonal.summary.modelBytes} B; dense repair ${result.tonal.summary.denseBytes} B. Not a perceptual hi-fi verdict.`:'Tonal experiment not requested. Enable it and encode to fit models from this PCM.';
      setBusy(false);worker.terminate();worker=null;
    };
    worker.onerror=event=>{event.preventDefault();if(epoch!==encodeEpoch)return;$('codec-status').textContent='Worker/codec failed. Rebuild the site and check browser WASM support. Previous result is unchanged.';setBusy(false);worker?.terminate();worker=null;};
    worker.postMessage({buffer,rate:+$('codec-rate').value,search:$('codec-search').checked,mask:+$('brr-mask').value,restart:+$('brr-restart').value,beam:+$('brr-beam').value,tonal:$('tonal-enable').checked,tonalPartials:+$('tonal-partials').value,tonalTarget:+$('tonal-target').value},buffer?[buffer]:[]);
  } catch(error) { $('codec-status').textContent=`Not encoded: ${error.message}.`;setBusy(false); }
}
async function play() {
  if(!result)return;
  stopAudition();
  try {
    const data={original:result.original,ima:result.decoded,pcm8:result.eight,brr:result.brrDecoded,'tonal-model':result.tonal?.modelPcm,'tonal-hybrid':result.tonal?.hybridPcm,'tonal-dense':result.tonal?.densePcm}[$('audition-source').value];
    const start=Math.min(data.length-1,Math.floor(data.length*+$('audition-start').value/100));
    const count=Math.max(1,Math.min(data.length-start,Math.floor(data.length*+$('audition-length').value/100)));
    const selected=data.slice(start,start+count); if($('audition-reverse').checked)selected.reverse();
    const epoch=playbackEpoch;
    context??=new AudioContext(); await context.resume();
    if(epoch!==playbackEpoch)return;
    const audio=context.createBuffer(1,selected.length,result.rate);
    const channel=audio.getChannelData(0); for(let i=0;i<selected.length;i++)channel[i]=selected[i]/32768;
    source=context.createBufferSource();source.buffer=audio;source.playbackRate.value=+$('audition-speed').value;source.loop=$('audition-loop').checked;
    const gain=context.createGain();outputGain=gain;gain.gain.value=.25;source.connect(gain);gain.connect(context.destination);
    const current=source;source.onended=()=>{current.disconnect();gain.disconnect();if(source===current){source=null;outputGain=null;$('audition-status').textContent='Finished.';}};
    source.start();$('audition-status').textContent=`Playing ${$('audition-source').selectedOptions[0].textContent}, ${count} frames from ${start}, ${$('audition-speed').value}×${$('audition-reverse').checked?', reversed':''}${source.loop?', looped':''}. Gain is fixed at 25%.`;
  } catch(error) { $('audition-status').textContent=`Playback unavailable: ${error.message}. WAV export still works.`; }
}
export function initCodecLab() {
  $('codec-run').addEventListener('click',runCodec);
  $('tonal-export').addEventListener('click',()=>{if(result?.tonal)download(result.tonal.encoded,'zx-tonal-candidate.ztr','application/octet-stream');});
  $('tonal-wav').addEventListener('click',()=>{if(result?.tonal)download(writeWav(result.tonal.hybridPcm,result.rate),'zx-tonal-candidate.wav','audio/wav');});
  $('codec-cancel').addEventListener('click',()=>{encodeEpoch++;worker?.terminate();worker=null;setBusy(false);$('codec-status').textContent='Encoding cancelled. Previous result, if any, is retained.';});
  $('marker-export').addEventListener('click',()=>{if(result)download(result.markerEncoded,'zx-research-markers.zmp','application/octet-stream');});
  $('brr-export').addEventListener('click',()=>{if(result)download(result.brrEncoded,'zx-research-brr.zbr','application/octet-stream');});
  $('brr-wav').addEventListener('click',()=>{if(result)download(writeWav(result.brrDecoded,result.rate),'zx-brr-decoded.wav','audio/wav');});
  $('audition-play').addEventListener('click',play);
  $('audition-stop').addEventListener('click',stopAudition);
  for(const id of ['codec-rate','codec-reels','codec-pool'])$(id).addEventListener('input',renderBudget);
  $('codec-export').addEventListener('click',()=>{if(result)download(result.encoded,'zx-research-reel.zxa','application/octet-stream');});
  $('codec-wav').addEventListener('click',()=>{if(result)download(writeWav(result.decoded,result.rate),'zx-ima-decoded.wav','audio/wav');});
  $('codec-original-wav').addEventListener('click',()=>{if(result)download(writeWav(result.original,result.rate),'zx-pcm16-reference.wav','audio/wav');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudition();});
  setBusy(false);renderBudget();stopAudition();
}
