import {validateAudio} from './codec.js';
import {encodeBrrReel,decodeBrrRange} from './brr.js';
import {exactSse} from './encoder.js';
import {fitTonalPage} from './tonal-fit.js';
import {pcmFromWide,clampPcm,TONAL_PAGE} from './tonal.js';
import {serializeHybrid,decodeHybridRange,inspectHybrid} from './hybrid.js';
function error(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=(a[i]-b[i])**2;return sum;}
function normalizedBody(zbr){const body=zbr.slice(24);for(let i=0;i<body.length;i+=9)body[i]&=252;return body;}
export function flatPreference(flatBytes,flatError,candidateBytes,candidateError,target){
  if(![flatBytes,candidateBytes].every(n=>Number.isSafeInteger(n)&&n>=0)||![flatError,candidateError,target].every(n=>typeof n==='bigint'&&n>=0n))throw new Error('Invalid rate/distortion choice');
  const flatMet=flatError<=target,candidateMet=candidateError<=target;
  if(flatMet&&(!candidateMet||flatBytes<candidateBytes||(flatBytes===candidateBytes&&flatError<=candidateError)))return candidateMet?'flat-smaller-or-equal-at-target':'flat-only-target-met';
  if(!flatMet&&!candidateMet&&(flatError<candidateError||(flatError===candidateError&&flatBytes<=candidateBytes)))return 'flat-best-unmet-attempt';
  if(flatBytes<=candidateBytes&&flatError<=candidateError)return 'flat-dominates';
  return null;
}
export function encodeTonalProfiles(codec,renderer,pcm,rate,{maxPartials=2,refineSteps=3,targets=[30,40,50],onProgress}={}){
  validateAudio(pcm,rate);if(!Array.isArray(targets)||!targets.length||targets.length>8||targets.some(n=>!Number.isFinite(n)||n<0||n>100))throw new Error('Invalid objective SNR targets');
  const flatBytes=encodeBrrReel(codec,pcm,rate,{restart:16}),flatPcm=decodeBrrRange(codec,flatBytes),flatError=exactSse(pcm,flatPcm),power=exactSse(pcm,new Int16Array(pcm.length));
  const analysis=[],patches=[],partialHistogram=[0,0,0,0,0];let initialError=0,forcedLiteralPages=0,coefficientClamps=0;
  for(let start=0,page=0;start<pcm.length;start+=TONAL_PAGE,page++){
    const source=pcm.subarray(start,start+TONAL_PAGE);
    const first=24+start/16*9,size=Math.ceil(source.length/16)*9,body=flatBytes.slice(first,first+size);for(let i=0;i<body.length;i+=9)body[i]&=252;
    const fitted=fitTonalPage(source,rate,renderer,{maxPartials,refineSteps}).best,modelPcm=pcmFromWide(fitted.wide);
    const unsafe=fitted.wide.some((n,i)=>n < -32768||n>32767||source[i]-n < -32768||source[i]-n>32767);
    coefficientClamps+=fitted.clamps;
    if(unsafe){const record={mode:0,body};analysis.push({record,error:error(source,flatPcm.subarray(start,start+source.length)),length:source.length});forcedLiteralPages++;initialError+=analysis.at(-1).error;}
    else{
      const record={mode:1,model:fitted.model,patches:[]},baseError=error(source,modelPcm);analysis.push({record,error:baseError,length:source.length});initialError+=baseError;partialHistogram[fitted.model.partials.length]++;
      for(let chunk=0;chunk<Math.ceil(source.length/256);chunk++){
        const begin=chunk*256,n=Math.min(256,source.length-begin),residual=Int16Array.from({length:n},(_,i)=>source[begin+i]-fitted.wide[begin+i]);
        const zbr=encodeBrrReel(codec,residual,rate,{restart:16}),delta=decodeBrrRange(codec,zbr),combined=Int16Array.from(delta,(value,i)=>clampPcm(value+fitted.wide[begin+i]));
        const before=error(source.subarray(begin,begin+n),modelPcm.subarray(begin,begin+n)),after=error(source.subarray(begin,begin+n),combined),patch={page,chunk,body:normalizedBody(zbr),before,after};
        patches.push(patch);
      }
    }
    onProgress?.(page+1,Math.ceil(pcm.length/TONAL_PAGE));
  }
  function cartridge(chosen){
    const groups=analysis.map(item=>item.record.mode===0?item.record:{...item.record,patches:[]});
    for(const patch of chosen)groups[patch.page].patches.push({chunk:patch.chunk,body:patch.body});
    for(const group of groups)if(group.patches)group.patches.sort((a,b)=>a.chunk-b.chunk);
    const bytes=serializeHybrid(groups,rate,pcm.length),decoded=decodeHybridRange(codec,renderer,bytes);return {bytes,decoded,sse:exactSse(pcm,decoded).toString(),breakdown:inspectHybrid(bytes),patches:chosen.length};
  }
  const modelOnly=cartridge([]),dense=cartridge(patches),ranked=patches.filter(p=>p.before>p.after).sort((a,b)=>(b.before-b.after)/b.body.length-(a.before-a.after)/a.body.length||a.page-b.page||a.chunk-b.chunk);
  const profiles=targets.map(targetDb=>{
    const target=BigInt(Math.floor(Number(power)*10**(-targetDb/10)));let estimate=initialError;const selected=[];
    for(const patch of ranked){if(estimate<=Number(target))break;selected.push(patch);estimate-=patch.before-patch.after;}
    const candidate=cartridge(selected),candidateError=BigInt(candidate.sse),rawHybridBytes=candidate.bytes.length;
    const preference=flatPreference(flatBytes.length,flatError,candidate.bytes.length,candidateError,target),fallback=preference!==null,reason=preference||'hybrid';
    const bytes=fallback?flatBytes:candidate.bytes,decoded=fallback?flatPcm:candidate.decoded,sse=fallback?flatError:candidateError;
    return {targetDb,targetSse:target.toString(),targetMet:sse<=target,bytes,decoded,sse:sse.toString(),selection:reason,rawHybridBytes,rawHybridSse:candidate.sse,patches:fallback?0:selected.length,breakdown:fallback?inspectHybrid(flatBytes):candidate.breakdown};
  });
  return {flat:{bytes:flatBytes,decoded:flatPcm,sse:flatError.toString(),breakdown:inspectHybrid(flatBytes)},modelOnly,dense,profiles,analysis:{pages:analysis.length,partialHistogram,forcedLiteralPages,coefficientClamps,positivePatches:ranked.length,totalPatchCandidates:patches.length,power:power.toString(),maxPartials,refineSteps}};
}
