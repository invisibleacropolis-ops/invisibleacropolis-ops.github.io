// Exact restart-page dictionary around BRR. This regenerates encoded pages,
// not unknown audio: reconstructed ZBR1 bytes are bit-identical to the input.
import {crc32} from './codec.js';
import {inspectBrr,brrBytes,decodeBrrRange} from './brr.js';
const HEADER=36;
const magic=(b,text)=>[...text].every((c,i)=>b[i]===c.charCodeAt(0));
export function packMarkers(source) {
  const info=inspectBrr(source),flat=Uint8Array.from(source),pageBytes=info.restart*9,blocks=Math.ceil(info.frames/16),pages=Math.ceil(blocks/info.restart);
  const dictionary=[],ids=[],seen=new Map();
  for(let page=0;page<pages;page++){
    const bytes=new Uint8Array(pageBytes),start=24+page*pageBytes;bytes.set(flat.subarray(start,Math.min(flat.length,start+pageBytes)));
    for(let i=0;i<pageBytes;i+=9)bytes[i]&=252; // Final-end flag is restored on expansion.
    const key=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
    let id=seen.get(key);
    if(id===undefined){id=dictionary.length;if(id>=65535)return flat;seen.set(key,id);dictionary.push(bytes);}
    ids.push(id);
  }
  const size=HEADER+dictionary.length*pageBytes+pages*2;
  if(size>=flat.length)return flat; // Never inflate a flat BRR input.
  const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
  bytes.set([90,77,80,49]);bytes[4]=1;bytes[5]=1;
  view.setUint32(8,info.rate,true);view.setUint32(12,info.frames,true);view.setUint16(16,info.restart,true);view.setUint16(18,pageBytes,true);
  view.setUint32(20,pages,true);view.setUint32(24,dictionary.length,true);view.setUint32(28,size-HEADER,true);
  dictionary.forEach((page,i)=>bytes.set(page,HEADER+i*pageBytes));
  const refs=HEADER+dictionary.length*pageBytes;ids.forEach((id,i)=>view.setUint16(refs+i*2,id,true));
  view.setUint32(32,crc32(bytes),true);return bytes;
}
export function inspectMarkers(bytes) {
  if(!(bytes instanceof Uint8Array))throw new Error('Marker input must be bytes');
  if(magic(bytes,'ZBR1'))return {...inspectBrr(bytes),mode:'flat'};
  if(bytes.length<HEADER||!magic(bytes,'ZMP1'))throw new Error('Not a marker/BRR research container');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),rate=v.getUint32(8,true),frames=v.getUint32(12,true),restart=v.getUint16(16,true),pageBytes=v.getUint16(18,true),pages=v.getUint32(20,true),unique=v.getUint32(24,true);
  if(bytes[4]!==1||bytes[5]!==1||v.getUint16(6,true)!==0||rate<8000||rate>96000||!frames||frames>rate*30||![1,16,64].includes(restart)||pageBytes!==restart*9||pages!==Math.ceil(Math.ceil(frames/16)/restart)||!unique||unique>65535||unique>pages||bytes.length!==HEADER+unique*pageBytes+pages*2||bytes.length>=brrBytes(frames)||v.getUint32(28,true)!==bytes.length-HEADER)throw new Error('Invalid marker dimensions/length');
  const checked=Uint8Array.from(bytes);checked.fill(0,32,36);if(crc32(checked)!==v.getUint32(32,true))throw new Error('Marker checksum mismatch');
  for(let page=0;page<unique;page++)for(let block=0;block<restart;block++){
    const header=bytes[HEADER+page*pageBytes+block*9];
    if((header>>4)>12||(header&3)||(block===0&&(header&12)))throw new Error('Invalid normalized BRR dictionary page');
  }
  const refs=HEADER+unique*pageBytes,used=new Set();
  for(let i=0;i<pages;i++){const id=v.getUint16(refs+i*2,true);if(id>=unique)throw new Error('Marker reference out of range');used.add(id);}
  if(used.size!==unique)throw new Error('Unreferenced dictionary entry');
  const finalPage=HEADER+v.getUint16(refs+(pages-1)*2,true)*pageBytes,finalFrames=frames-(pages-1)*restart*16,finalBlocks=Math.ceil(finalFrames/16),tail=finalFrames%16;
  for(let i=finalBlocks*9;i<pageBytes;i++)if(bytes[finalPage+i])throw new Error('Nonzero marker page padding');
  if(tail)for(let i=tail;i<16;i++)if((bytes[finalPage+(finalBlocks-1)*9+1+Math.floor(i/2)]>>((i&1)?0:4))&15)throw new Error('Nonzero marker sample padding');
  return {mode:'dictionary',rate,frames,restart,pageBytes,pages,unique,refs};
}
export function expandMarkers(bytes) {
  const info=inspectMarkers(bytes);if(info.mode==='flat')return Uint8Array.from(bytes);
  const flat=new Uint8Array(brrBytes(info.frames)),v=new DataView(flat.buffer),input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  flat.set([90,66,82,49]);v.setUint32(4,info.rate,true);v.setUint32(8,info.frames,true);v.setUint16(12,info.restart,true);v.setUint16(14,16,true);v.setUint16(16,9,true);
  for(let i=0;i<info.pages;i++){
    const id=input.getUint16(info.refs+i*2,true),offset=HEADER+id*info.pageBytes,target=24+i*info.pageBytes;
    flat.set(bytes.subarray(offset,offset+Math.min(info.pageBytes,flat.length-target)),target);
  }
  flat[24+(Math.ceil(info.frames/16)-1)*9]|=1;v.setUint32(20,crc32(flat),true);inspectBrr(flat);return flat;
}
export function decodeMarkerRange(codec,bytes,start=0,count) {
  const info=inspectMarkers(bytes);if(info.mode==='flat')return decodeBrrRange(codec,bytes,start,count);
  count??=info.frames-start;
  if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1||start+count>info.frames)throw new Error('Invalid marker decode range');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=new Int16Array(count),pageFrames=info.restart*16;
  let history=[0,0];
  for(let frame=Math.floor(start/pageFrames)*pageFrames;frame<start+count;frame+=16){
    const page=Math.floor(frame/pageFrames);if(frame%pageFrames===0)history=[0,0];
    const id=view.getUint16(info.refs+page*2,true),offset=HEADER+id*info.pageBytes+(frame%pageFrames)/16*9,n=Math.min(16,info.frames-frame);
    const pcm=codec.decodeBlock(bytes.subarray(offset,offset+9),n,history);history=[pcm[n-1],n>1?pcm[n-2]:history[0]];
    const from=Math.max(start,frame),to=Math.min(start+count,frame+n);if(to>from)out.set(pcm.subarray(from-frame,to-frame),from-start);
  }
  return out;
}
