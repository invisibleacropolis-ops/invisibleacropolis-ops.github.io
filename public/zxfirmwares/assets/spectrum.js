// Storage arithmetic only. No presumed SMK partition or measured CPU limit.
export const spectrumFormats=[
  {id:'pcm16',name:'PCM16 WAV',fidelity:'Lossless PCM reference',note:'44-byte WAV header per reel; CD format only at 44.1 kHz stereo'},
  {id:'pcm8',name:'PCM8 WAV estimate',fidelity:'Lossy waveform',note:'8-bit body + 44-byte header + even-byte chunk padding; rate/channels are not fidelity'},
  {id:'ima4',name:'ZXA1 independent IMA4',fidelity:'Lossy waveform',note:'20-byte header/channel/reel; 132 bytes per 256 frames'},
  {id:'brr',name:'ZBR1 BRR baseline',fidelity:'Lossy waveform',note:'24-byte header/channel/reel; 9 bytes per 16 frames; restart policy affects quality/seeking, not byte count'},
  {id:'ideal2',name:'Ideal 2-bit body (not implemented)',fidelity:'Theoretical lower-bound body',note:'No codec, headers, quality or arbitrary-audio guarantee'}
];
export function storageBytes(format,frames,channels=2,reels=1) {
  if(!Number.isSafeInteger(frames)||frames<0||frames>536870912||![1,2].includes(channels)||![1,4].includes(reels)||!spectrumFormats.some(f=>f.id===format))throw new Error('Invalid spectrum dimensions');
  if(!frames)return 0;
  const bytes={pcm16:44+frames*channels*2,pcm8:44+frames*channels+(frames*channels%2),ima4:channels*(20+Math.ceil(frames/256)*132),brr:channels*(24+Math.ceil(frames/16)*9),ideal2:Math.ceil(frames*channels/4)}[format];
  return bytes*reels;
}
export function capacityRows({poolBytes,rate=44100,channels=2,reels=1}) {
  if(!Number.isSafeInteger(poolBytes)||poolBytes<0||poolBytes>67108864||!Number.isInteger(rate)||rate<8000||rate>96000||![1,2].includes(channels)||![1,4].includes(reels))throw new Error('Invalid storage scenario');
  return spectrumFormats.map(format=>{
    let low=0,high=Math.floor(poolBytes*4/(channels*reels))+1;
    while(low+1<high){const mid=Math.floor((low+high)/2);if(storageBytes(format.id,mid,channels,reels)<=poolBytes)low=mid;else high=mid;}
    return {...format,frames:low,secondsPerReel:low/rate,bytesAt30:storageBytes(format.id,rate*30,channels,reels)};
  });
}
const $=id=>document.getElementById(id);
function renderSpectrum() {
  const total=+$('spectrum-total').value*1024,reserved=+$('spectrum-reserved').value*1024;
  if(reserved>total){$('spectrum-caption').textContent='Reserved bytes exceed the hypothetical total. Choose a valid allocation.';$('spectrum-body').replaceChildren();return;}
  const rate=+$('spectrum-rate').value,channels=+$('spectrum-channels').value,reels=+$('spectrum-reels').value,poolBytes=total-reserved;
  const rows=capacityRows({poolBytes,rate,channels,reels});
  $('spectrum-caption').textContent=`${poolBytes.toLocaleString()} sample bytes after an assumed ${reserved/1024} KiB reservation, ${rate} Hz, ${channels} channel(s), ${reels} independent reel(s). Duration is per reel; four playheads sharing one reel do not multiply stored audio. These allocations are scenarios, not a verified flash map.`;
  $('spectrum-body').replaceChildren(...rows.map(item=>{
    const row=document.createElement('tr');
    for(const text of [item.name,item.fidelity,`${item.secondsPerReel.toFixed(3)} s`,`${item.bytesAt30.toLocaleString()} B`,item.note]){const cell=document.createElement('td');cell.className='p-3 border-b border-slate-800';cell.textContent=text;row.append(cell);}
    return row;
  }));
}
export function initSpectrum() {
  for(const id of ['spectrum-total','spectrum-reserved','spectrum-rate','spectrum-channels','spectrum-reels'])$(id).addEventListener('input',renderSpectrum);
  renderSpectrum();
  fetch(new URL('./generated/zx-brr.json',import.meta.url)).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(manifest=>{
    $('decoder-ledger').textContent=`Local build ledger: BRR encoder+decoder WASM ${manifest.artifacts['zx-brr.wasm'].bytes} bytes; decoder-only WASM ${manifest.artifacts['zx-brr-decoder.wasm'].bytes} bytes. ${manifest.compiler}. These include WASM module/wrapper/data overhead, not a complete player, executable, pi32v2 binary or hardware measurement.`;
  }).catch(()=>{$('decoder-ledger').textContent='Decoder-size manifest unavailable. Rebuild the artifact; storage calculations remain usable.';});
}
