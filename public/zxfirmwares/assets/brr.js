import { validateAudio, crc32 } from './codec.js';
export const BRR_HEADER=24;
const historyValid=h=>Array.isArray(h)&&h.length===2&&h.every(v=>Number.isInteger(v)&&v>=-32768&&v<=32766&&v%2===0);
const nextHistory=(pcm,h)=>[pcm[pcm.length-1],pcm.length>1?pcm[pcm.length-2]:h[0]];
export function brrBytes(frames) {
  if(!Number.isInteger(frames)||frames<1||frames>2880000)throw new Error('Invalid BRR frame count');
  return BRR_HEADER+Math.ceil(frames/16)*9;
}
export async function createBrr(binary) {
  const {instance}=await WebAssembly.instantiate(binary,{}),api=instance.exports;
  const bytes=()=>new Uint8Array(api.memory.buffer,api.zx_brr_bytes(),9);
  return {
    encodeBlock(pcm,history=[0,0],mask=15,beam=0) {
      if(!api.zx_brr_encode)throw new Error('Decoder-only module cannot encode');
      if(!(pcm instanceof Int16Array)||!pcm.length||pcm.length>16||!historyValid(history)||![1,15].includes(mask))throw new Error('Invalid BRR block input');
      new Int16Array(api.memory.buffer,api.zx_brr_input(),16).set(pcm);
      if(![0,2,4,8,16].includes(beam))throw new Error('Invalid beam width');
      const size=beam ? api.zx_brr_encode_beam(pcm.length,...history,mask,beam) : api.zx_brr_encode(pcm.length,...history,mask);
      if(size!==9)throw new Error('BRR encoder rejected input');
      return bytes().slice();
    },
    decodeBlock(block,count=16,history=[0,0]) {
      if(!(block instanceof Uint8Array)||block.length!==9||!Number.isInteger(count)||count<1||count>16||!historyValid(history))throw new Error('Invalid BRR decode input');
      bytes().set(block);
      if(api.zx_brr_decode(count,...history)!==count)throw new Error('BRR decoder rejected range, flags, history or padding');
      return new Int16Array(api.memory.buffer,api.zx_brr_output(),16).slice(0,count);
    }
  };
}
export function encodeBrrReel(codec,pcm,rate,{mask=15,restart=16,beam=0}={}) {
  validateAudio(pcm,rate);
  if(![1,15].includes(mask)||![1,16,64].includes(restart)||![0,2,4,8,16].includes(beam))throw new Error('Invalid BRR search/restart policy');
  const bytes=new Uint8Array(brrBytes(pcm.length)),view=new DataView(bytes.buffer);
  bytes.set([90,66,82,49]);view.setUint32(4,rate,true);view.setUint32(8,pcm.length,true);view.setUint16(12,restart,true);view.setUint16(14,16,true);view.setUint16(16,9,true);
  let history=[0,0];
  for(let frame=0,block=0;frame<pcm.length;frame+=16,block++) {
    const reset=block%restart===0;if(reset)history=[0,0];
    const samples=pcm.subarray(frame,frame+16),encoded=codec.encodeBlock(samples,history,reset?1:mask,beam);
    if(frame+16>=pcm.length)encoded[0]|=1;
    bytes.set(encoded,BRR_HEADER+block*9);history=nextHistory(codec.decodeBlock(encoded,samples.length,history),history);
  }
  view.setUint32(20,crc32(bytes),true);return bytes;
}
export function inspectBrr(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<BRR_HEADER||![90,66,82,49].every((n,i)=>bytes[i]===n))throw new Error('Not a ZBR1 research container');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),rate=view.getUint32(4,true),frames=view.getUint32(8,true),restart=view.getUint16(12,true);
  if(rate<8000||rate>96000||!frames||frames>rate*30||![1,16,64].includes(restart)||view.getUint16(14,true)!==16||view.getUint16(16,true)!==9||view.getUint16(18,true)!==0||bytes.length!==brrBytes(frames))throw new Error('Invalid ZBR1 dimensions');
  const checked=Uint8Array.from(bytes);checked.fill(0,20,24);if(crc32(checked)!==view.getUint32(20,true))throw new Error('ZBR1 checksum mismatch');
  const blocks=Math.ceil(frames/16);
  for(let i=0;i<blocks;i++) {
    const header=bytes[BRR_HEADER+i*9];
    if((header>>4)>12||(header&3)!==(i===blocks-1?1:0)||(i%restart===0&&(header&12)))throw new Error('Invalid ZBR1 block/reset header');
  }
  const tail=frames%16;
  if(tail)for(let i=tail;i<16;i++)if((bytes[BRR_HEADER+(blocks-1)*9+1+Math.floor(i/2)]>>((i&1)?0:4))&15)throw new Error('Invalid ZBR1 tail padding');
  return {rate,frames,restart};
}
export function decodeBrrRange(codec,bytes,start=0,count) {
  const info=inspectBrr(bytes);count??=info.frames-start;
  if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1||start+count>info.frames)throw new Error('Invalid BRR range');
  const output=new Int16Array(count),first=Math.floor(Math.floor(start/16)/info.restart)*info.restart;
  let history=[0,0];
  for(let block=first,frame=first*16;frame<start+count;block++,frame+=16) {
    if(block%info.restart===0)history=[0,0];
    const offset=BRR_HEADER+block*9,pcm=codec.decodeBlock(bytes.subarray(offset,offset+9),Math.min(16,info.frames-frame),history);
    history=nextHistory(pcm,history);
    const from=Math.max(frame,start),to=Math.min(frame+pcm.length,start+count);
    if(to>from)output.set(pcm.subarray(from-frame,to-frame),from-start);
  }
  return output;
}
export function brrStatistics(bytes) {
  const {frames,restart}=inspectBrr(bytes),filters=[0,0,0,0],ranges=Array(13).fill(0);
  for(let i=BRR_HEADER;i<bytes.length;i+=9){filters[(bytes[i]>>2)&3]++;ranges[bytes[i]>>4]++;}
  return {filters,ranges,restart,blocks:Math.ceil(frames/16),maxPrerollFrames:(restart-1)*16};
}
