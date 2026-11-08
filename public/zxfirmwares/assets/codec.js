// Host-side audio helpers and experimental container. No device I/O.
export const BLOCK_FRAMES = 256, BLOCK_BYTES = 132, HEADER_BYTES = 20;
export const MAX_SECONDS = 30;
export function validateAudio(samples, rate) {
  if (!(samples instanceof Int16Array) || !Number.isInteger(rate) || rate < 8000 || rate > 96000 || !samples.length || samples.length > rate * MAX_SECONDS) throw new Error('Need 1–30 seconds (or a shorter clip) of PCM16 mono at 8–96 kHz');
}
export function codecBytes(frames, reels = 1) {
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > 2880000 || ![1,4].includes(reels)) throw new Error('Invalid recording budget');
  return reels * (HEADER_BYTES + Math.ceil(frames / BLOCK_FRAMES) * BLOCK_BYTES);
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function signature(bytes, start, text) { return [...text].every((c,i)=>bytes[start+i] === c.charCodeAt(0)); }
export function parsePcmWav(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (bytes.length < 44 || bytes.length > 16*1024*1024 || !signature(bytes,0,'RIFF') || !signature(bytes,8,'WAVE') || view.getUint32(4,true) + 8 !== bytes.length) throw new Error('Expected a complete RIFF/WAVE file, at most 16 MiB');
  let fmt, data;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error('Truncated WAV chunk header');
    const size = view.getUint32(offset+4,true), start = offset+8, next = start+size+(size&1);
    if (next > bytes.length) throw new Error('Truncated WAV chunk');
    if (signature(bytes,offset,'fmt ')) {
      if (fmt || size < 16) throw new Error('Invalid/duplicate WAV format');
      fmt = {type:view.getUint16(start,true),channels:view.getUint16(start+2,true),rate:view.getUint32(start+4,true),byteRate:view.getUint32(start+8,true),align:view.getUint16(start+12,true),bits:view.getUint16(start+14,true)};
    }
    if (signature(bytes,offset,'data')) {
      if (data) throw new Error('Duplicate WAV audio data');
      data = {start,size};
    }
    offset = next;
  }
  if (!fmt || !data || fmt.type !== 1 || fmt.bits !== 16 || ![1,2].includes(fmt.channels) || !Number.isInteger(fmt.rate) || fmt.rate < 8000 || fmt.rate > 96000 || fmt.align !== fmt.channels*2 || fmt.byteRate !== fmt.rate*fmt.align || !data.size || data.size % fmt.align) throw new Error('Use uncompressed PCM16 WAV, mono/stereo, 8–96 kHz');
  const count = data.size / fmt.align;
  if (count > fmt.rate*MAX_SECONDS) throw new Error('Clip exceeds 30 seconds — trim it before importing');
  const interleaved = new Int16Array(count*fmt.channels);
  for (let i=0;i<interleaved.length;i++)interleaved[i]=view.getInt16(data.start+i*2,true);
  return {interleaved,frames:count,rate:fmt.rate,channels:fmt.channels};
}
export function parseWav(buffer) {
  const source=parsePcmWav(buffer),samples=new Int16Array(source.frames);
  for(let i=0;i<source.frames;i++)samples[i]=source.channels===1?source.interleaved[i]:Math.round((source.interleaved[i*2]+source.interleaved[i*2+1])/2);
  return {samples,rate:source.rate,channels:source.channels};
}
export function writeWav(samples, rate) { return writePcmWav(samples,rate,1); }
export function writePcmWav(samples, rate, channels=1) {
  if(!(samples instanceof Int16Array)||![1,2].includes(channels)||!samples.length||samples.length%channels||!Number.isInteger(rate)||rate<8000||rate>96000||samples.length/channels>rate*MAX_SECONDS)throw new Error('Invalid PCM16 WAV dimensions');
  const bytes = new Uint8Array(44+samples.length*2), view = new DataView(bytes.buffer);
  const text = (offset,value)=>[...value].forEach((c,i)=>{bytes[offset+i]=c.charCodeAt(0);});
  text(0,'RIFF'); view.setUint32(4,bytes.length-8,true); text(8,'WAVE'); text(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true); view.setUint32(24,rate,true); view.setUint32(28,rate*channels*2,true); view.setUint16(32,channels*2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i)=>view.setInt16(44+i*2,sample,true)); return bytes;
}
// Windowed-sinc host resampler, 32 taps, deliberately not an on-device SRC.
export function resample(samples, sourceRate, targetRate) {
  validateAudio(samples,sourceRate);
  if (!Number.isInteger(targetRate) || targetRate < 8000 || targetRate > 96000) throw new Error('Invalid target rate');
  if (sourceRate === targetRate) return samples.slice();
  const length = Math.max(1,Math.floor(samples.length*targetRate/sourceRate));
  const result = new Int16Array(length), cutoff = .45*Math.min(1,targetRate/sourceRate), radius = 16;
  for (let i=0;i<length;i++) {
    const position = i*sourceRate/targetRate, center=Math.floor(position);
    let sum=0,weights=0;
    for(let index=center-radius+1;index<=center+radius;index++) {
      const distance=index-position;
      const weight=(Math.abs(distance)<1e-12 ? 2*cutoff : Math.sin(2*Math.PI*cutoff*distance)/(Math.PI*distance))*(.5+.5*Math.cos(Math.PI*distance/radius));
      sum += samples[Math.max(0,Math.min(samples.length-1,index))]*weight; weights += weight;
    }
    result[i]=Math.max(-32768,Math.min(32767,Math.round(sum/weights)));
  }
  return result;
}
export function makeDemo(rate=16000) {
  if (!Number.isInteger(rate) || rate<8000 || rate>96000) throw new Error('Invalid demo rate');
  const samples=new Int16Array(rate*3); let seed=7;
  for(let i=0;i<samples.length;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const t=i/rate, envelope=Math.exp(-8*(t% .5));
    const signal=.32*Math.sin(2*Math.PI*(110*t+35*t*t))+.22*envelope*Math.sin(2*Math.PI*70*t)+.12*envelope*(seed/2147483648-1);
    samples[i]=Math.round(signal*32767);
  }
  return samples;
}
export function pcm8(samples) { return Int16Array.from(samples,value=>Math.max(-128,Math.min(127,Math.round(value/256)))*256); }
export function errorMetrics(reference, decoded) {
  if(reference.length!==decoded.length || !reference.length) throw new Error('Metric length mismatch');
  let signal=0,error=0,peak=0;
  for(let i=0;i<reference.length;i++) { const delta=reference[i]-decoded[i]; signal+=reference[i]*reference[i]; error+=delta*delta; peak=Math.max(peak,Math.abs(delta)); }
  return {snrDb:error===0 ? null : signal===0 ? null : 10*Math.log10(signal/error),rmse:Math.sqrt(error/reference.length),peakError:peak};
}
export async function createCodec(binary) {
  const {instance} = await WebAssembly.instantiate(binary, {}), api = instance.exports;
  const input=()=>new Int16Array(api.memory.buffer,api.zx_input(),BLOCK_FRAMES);
  const output=()=>new Int16Array(api.memory.buffer,api.zx_output(),BLOCK_FRAMES);
  const block=()=>new Uint8Array(api.memory.buffer,api.zx_bytes(),BLOCK_BYTES);
  return {
    encodeBlock(samples, search=true) {
      if(!(samples instanceof Int16Array) || samples.length<1 || samples.length>BLOCK_FRAMES || typeof search!=='boolean') throw new Error('Invalid block input');
      input().set(samples);
      if(api.zx_encode(samples.length,search?1:0)!==BLOCK_BYTES) throw new Error('Block encoder rejected input');
      return block().slice();
    },
    decodeBlock(bytes, count) {
      if(!(bytes instanceof Uint8Array) || bytes.length!==BLOCK_BYTES || !Number.isInteger(count) || count<1 || count>BLOCK_FRAMES) throw new Error('Invalid block size');
      block().set(bytes);
      if(api.zx_decode(count)!==count) throw new Error('Block decoder rejected header or padding');
      return output().slice(0,count);
    }
  };
}
export function encodeReel(codec, samples, rate, search=true) {
  validateAudio(samples,rate);
  const bytes=new Uint8Array(codecBytes(samples.length)), view=new DataView(bytes.buffer);
  bytes.set([90,88,65,49]); view.setUint32(4,rate,true); view.setUint32(8,samples.length,true); view.setUint16(12,BLOCK_FRAMES,true); view.setUint16(14,BLOCK_BYTES,true);
  for(let frame=0,offset=HEADER_BYTES;frame<samples.length;frame+=BLOCK_FRAMES,offset+=BLOCK_BYTES) bytes.set(codec.encodeBlock(samples.subarray(frame,frame+BLOCK_FRAMES),search),offset);
  view.setUint32(16,crc32(bytes),true);
  return bytes;
}
export function inspectReel(bytes) {
  if(!(bytes instanceof Uint8Array) || bytes.length<HEADER_BYTES || !signature(bytes,0,'ZXA1')) throw new Error('Not an experimental ZXA1 container');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), rate=view.getUint32(4,true), frames=view.getUint32(8,true);
  if(rate<8000 || rate>96000 || !frames || frames>rate*MAX_SECONDS || view.getUint16(12,true)!==BLOCK_FRAMES || view.getUint16(14,true)!==BLOCK_BYTES || bytes.length!==codecBytes(frames)) throw new Error('Invalid container dimensions or length');
  const checked=Uint8Array.from(bytes);checked.fill(0,16,20);
  if(view.getUint32(16,true)!==crc32(checked)) throw new Error('Container checksum mismatch');
  return {rate,frames};
}
export function decodeRange(codec, bytes, start=0, count) {
  const info=inspectReel(bytes); count ??= info.frames-start;
  if(!Number.isInteger(start) || !Number.isInteger(count) || start<0 || count<1 || start+count>info.frames) throw new Error('Invalid decode range');
  const result=new Int16Array(count);
  for(let frame=Math.floor(start/BLOCK_FRAMES)*BLOCK_FRAMES;frame<start+count;frame+=BLOCK_FRAMES) {
    const offset=HEADER_BYTES+(frame/BLOCK_FRAMES)*BLOCK_BYTES;
    const decoded=codec.decodeBlock(bytes.subarray(offset,offset+BLOCK_BYTES),Math.min(BLOCK_FRAMES,info.frames-frame));
    const from=Math.max(frame,start),to=Math.min(frame+decoded.length,start+count);
    result.set(decoded.subarray(from-frame,to-frame),from-start);
  }
  return result;
}
