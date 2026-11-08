// Shared integer renderer bridge. Analysis is in tonal-fit.js, never the C core.
export const TONAL_PAGE=2048,MAX_PARTIALS=4;
const i16=n=>Number.isInteger(n)&&n>=-32768&&n<=32767;
export function validateModel(model){
  if(!model||!i16(model.dc0)||!i16(model.dc1)||!Array.isArray(model.partials)||model.partials.length>4||model.partials.some(p=>!p||!Number.isInteger(p.increment)||p.increment<1||p.increment>=2147483648||!['a0','b0','a1','b1'].every(k=>i16(p[k]))))throw new Error('Invalid quantized tonal model');
  return model;
}
export function parameterBytes(model){
  validateModel(model);const bytes=new Uint8Array(model.partials.length*12),v=new DataView(bytes.buffer);
  model.partials.forEach((p,i)=>{v.setUint32(i*12,p.increment,true);['a0','b0','a1','b1'].forEach((k,j)=>v.setInt16(i*12+4+j*2,p[k],true));});return bytes;
}
export async function createTonalRenderer(binary){
  const {instance}=await WebAssembly.instantiate(binary,{}),api=instance.exports;
  return {render(model,length,start=0,count=length-start){
    validateModel(model);
    if(!Number.isInteger(length)||length<1||length>2048||!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<1||start+count>length)throw new Error('Invalid tonal render range');
    new Uint8Array(api.memory.buffer,api.zx_tonal_params(),48).set(parameterBytes(model));
    const output=new Int32Array(count);
    for(let offset=0;offset<count;offset+=256){const n=Math.min(256,count-offset);if(api.zx_tonal_render(length,start+offset,n,model.partials.length,model.dc0,model.dc1)!==n)throw new Error('C tonal renderer rejected input');output.set(new Int32Array(api.memory.buffer,api.zx_tonal_output(),n),offset);}
    return output;
  }};
}
export const clampPcm=value=>Math.max(-32768,Math.min(32767,value));
export function pcmFromWide(wide){return Int16Array.from(wide,clampPcm);}
