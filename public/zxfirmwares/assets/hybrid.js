import {crc32} from './codec.js';
import {inspectBrr,decodeBrrRange} from './brr.js';
import {TONAL_PAGE,validateModel,parameterBytes,clampPcm} from './tonal.js';
const HEADER=32,magic=(bytes,text)=>[...text].every((c,i)=>bytes[i]===c.charCodeAt(0));
export function chunkFrames(length,chunk){return Math.min(256,length-chunk*256);}
const bodyBytes=n=>Math.ceil(n/16)*9;
function checkBody(bytes,frames){
  if(bytes.length!==bodyBytes(frames))throw new Error('Invalid BRR patch size');
  for(let block=0;block<Math.ceil(frames/16);block++){const h=bytes[block*9];if((h>>4)>12||(h&3)||(block%16===0&&(h&12)))throw new Error('Invalid independent BRR patch header');}
  const tail=frames%16;if(tail)for(let i=tail;i<16;i++)if((bytes[(Math.ceil(frames/16)-1)*9+1+Math.floor(i/2)]>>((i&1)?0:4))&15)throw new Error('Invalid BRR patch padding');
}
function parsePage(bytes,frames){
  if(bytes.length<8||bytes[3]!==0||bytes[0]>1||bytes[1]>4)throw new Error('Invalid hybrid page header');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),mode=bytes[0],count=bytes[1],mask=bytes[2],dc0=v.getInt16(4,true),dc1=v.getInt16(6,true);
  if(mode===0&&(count||mask||dc0||dc1))throw new Error('Literal page has model metadata');
  if(mask>>Math.ceil(frames/256))throw new Error('Residual mask exceeds page');
  if(bytes.length<8+12*count)throw new Error('Truncated tonal parameters');
  const model={dc0,dc1,partials:Array.from({length:count},(_,i)=>({increment:v.getUint32(8+i*12,true),...Object.fromEntries(['a0','b0','a1','b1'].map((key,j)=>[key,v.getInt16(12+i*12+j*2,true)]))}))};validateModel(model);
  let offset=8+count*12;const patches=[];
  if(mode===0){const body=bytes.subarray(offset);checkBody(body,frames);return {mode,frames,model,mask,body,patches,parameterBytes:8};}
  for(let chunk=0;chunk<Math.ceil(frames/256);chunk++)if(mask&(1<<chunk)){const n=chunkFrames(frames,chunk),size=bodyBytes(n);const body=bytes.subarray(offset,offset+size);checkBody(body,n);patches.push({chunk,frames:n,body});offset+=size;}
  if(offset!==bytes.length)throw new Error('Unexpected hybrid page bytes');
  return {mode,frames,model,mask,patches,parameterBytes:8+count*12};
}
export function serializeHybrid(pages,rate,frames){
  if(!Array.isArray(pages)||pages.length!==Math.ceil(frames/TONAL_PAGE)||!Number.isInteger(rate)||rate<8000||rate>96000||!Number.isInteger(frames)||frames<1||frames>rate*30)throw new Error('Invalid hybrid dimensions');
  const records=pages.map((page,i)=>{
    if(!page||![0,1].includes(page.mode))throw new Error('Invalid hybrid page mode');
    const n=Math.min(TONAL_PAGE,frames-i*TONAL_PAGE),model=page.mode===0?{dc0:0,dc1:0,partials:[]}:validateModel(page.model),params=parameterBytes(model),patches=page.patches||[];
    const mask=page.mode===0?0:patches.reduce((bits,p)=>bits|(1<<p.chunk),0);
    if(patches.some((p,j)=>!Number.isInteger(p.chunk)||p.chunk<0||p.chunk>=8||(j&&p.chunk<=patches[j-1].chunk)||!(p.body instanceof Uint8Array)))throw new Error('Invalid patch ordering');
    const payload=page.mode===0?page.body:Uint8Array.from(patches.flatMap(p=>Array.from(p.body)));
    if(!(payload instanceof Uint8Array))throw new Error('Missing BRR payload');
    const bytes=new Uint8Array(8+params.length+payload.length),v=new DataView(bytes.buffer);bytes[0]=page.mode;bytes[1]=model.partials.length;bytes[2]=mask;v.setInt16(4,model.dc0,true);v.setInt16(6,model.dc1,true);bytes.set(params,8);bytes.set(payload,8+params.length);parsePage(bytes,n);return bytes;
  });
  const directoryBytes=(pages.length+1)*4,payloadBytes=records.reduce((sum,r)=>sum+r.length,0),bytes=new Uint8Array(HEADER+directoryBytes+payloadBytes),v=new DataView(bytes.buffer);
  bytes.set([90,84,82,49]);v.setUint32(4,rate,true);v.setUint32(8,frames,true);v.setUint16(12,TONAL_PAGE,true);bytes[14]=4;bytes[15]=1;v.setUint32(16,pages.length,true);v.setUint32(20,directoryBytes,true);v.setUint32(24,payloadBytes,true);
  let at=0;records.forEach((record,i)=>{v.setUint32(HEADER+i*4,at,true);bytes.set(record,HEADER+directoryBytes+at);at+=record.length;});v.setUint32(HEADER+pages.length*4,at,true);v.setUint32(28,crc32(bytes),true);return bytes;
}
export function inspectHybrid(bytes){
  if(!(bytes instanceof Uint8Array))throw new Error('Hybrid input must be bytes');
  if(magic(bytes,'ZBR1'))return {...inspectBrr(bytes),format:'flat',bytes:bytes.length,headerBytes:24,directoryBytes:0,modelBytes:0,brrBytes:bytes.length-24};
  if(bytes.length<HEADER||bytes.length>4*1024*1024||!magic(bytes,'ZTR1'))throw new Error('Not a ZTR1 research cartridge');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),rate=v.getUint32(4,true),frames=v.getUint32(8,true),count=v.getUint32(16,true),dir=v.getUint32(20,true),payload=v.getUint32(24,true);
  if(rate<8000||rate>96000||!frames||frames>rate*30||v.getUint16(12,true)!==TONAL_PAGE||bytes[14]!==4||bytes[15]!==1||count!==Math.ceil(frames/TONAL_PAGE)||dir!==(count+1)*4||HEADER+dir+payload!==bytes.length)throw new Error('Invalid hybrid cartridge dimensions');
  const checked=Uint8Array.from(bytes);checked.fill(0,28,32);if(crc32(checked)!==v.getUint32(28,true))throw new Error('Hybrid checksum mismatch');
  if(v.getUint32(HEADER,true)!==0||v.getUint32(HEADER+count*4,true)!==payload)throw new Error('Invalid hybrid directory');
  const pages=[];for(let i=0;i<count;i++){const from=v.getUint32(HEADER+i*4,true),to=v.getUint32(HEADER+(i+1)*4,true);if(to<=from||to>payload)throw new Error('Nonmonotonic hybrid page directory');pages.push(parsePage(bytes.subarray(HEADER+dir+from,HEADER+dir+to),Math.min(TONAL_PAGE,frames-i*TONAL_PAGE)));}
  return {format:'hybrid',rate,frames,pages,bytes:bytes.length,headerBytes:HEADER,directoryBytes:dir,modelBytes:pages.reduce((n,p)=>n+p.parameterBytes,0),brrBytes:pages.reduce((n,p)=>n+(p.mode===0?p.body.length:p.patches.reduce((s,q)=>s+q.body.length,0)),0)};
}
function decodeBody(codec,body,frames){
  const result=new Int16Array(frames);let history=[0,0];
  for(let frame=0;frame<frames;frame+=16){if(frame%256===0)history=[0,0];const n=Math.min(16,frames-frame),pcm=codec.decodeBlock(body.subarray(frame/16*9,frame/16*9+9),n,history);result.set(pcm,frame);history=[pcm[n-1],n>1?pcm[n-2]:history[0]];}
  return result;
}
export function decodeHybridRange(codec,renderer,bytes,start=0,count){
  const info=inspectHybrid(bytes);if(info.format==='flat')return decodeBrrRange(codec,bytes,start,count);
  count??=info.frames-start;if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1||start+count>info.frames)throw new Error('Invalid hybrid decode range');
  const result=new Int16Array(count);
  for(let page=Math.floor(start/TONAL_PAGE);page<Math.ceil((start+count)/TONAL_PAGE);page++){
    const p=info.pages[page],base=page*TONAL_PAGE,from=Math.max(start,base)-base,to=Math.min(start+count,base+p.frames)-base;
    if(p.mode===0){const pcm=decodeBody(codec,p.body,p.frames);result.set(pcm.subarray(from,to),base+from-start);continue;}
    const wide=renderer.render(p.model,p.frames,from,to-from);
    for(const patch of p.patches){const begin=patch.chunk*256,end=begin+patch.frames;if(end<=from||begin>=to)continue;const decoded=decodeBody(codec,patch.body,patch.frames);for(let n=Math.max(begin,from);n<Math.min(end,to);n++)wide[n-from]+=decoded[n-begin];}
    for(let n=0;n<wide.length;n++)result[base+from+n-start]=clampPcm(wide[n]);
  }
  return result;
}
