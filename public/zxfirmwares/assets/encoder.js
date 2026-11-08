// Offline encoder policy only; not part of the firmware decoder.
import {encodeBrrReel,decodeBrrRange} from './brr.js';
export function exactSse(reference,reconstruction) {
  if(!(reference instanceof Int16Array)||!(reconstruction instanceof Int16Array)||reference.length!==reconstruction.length)throw new Error('SSE input mismatch');
  // Each 65,536-sample chunk fits exactly in Number; combine chunks as BigInt.
  let total=0n,chunk=0;
  for(let i=0;i<reference.length;i++){
    const difference=reference[i]-reconstruction[i];chunk+=difference*difference;
    if((i&65535)===65535){total+=BigInt(chunk);chunk=0;}
  }
  return total+BigInt(chunk);
}
export function optimizeBrr(codec,pcm,rate,{beam=0,restart=16,mask=15}={}) {
  if(![0,2,4,8,16].includes(beam))throw new Error('Invalid beam width');
  const greedy=encodeBrrReel(codec,pcm,rate,{restart,mask}),greedyPcm=decodeBrrRange(codec,greedy),greedyError=exactSse(pcm,greedyPcm);
  if(!beam)return {bytes:greedy,decoded:greedyPcm,selection:'greedy',greedySse:greedyError.toString(),beamSse:null,beamWidth:0};
  const candidate=encodeBrrReel(codec,pcm,rate,{restart,mask,beam}),candidatePcm=decodeBrrRange(codec,candidate),beamError=exactSse(pcm,candidatePcm);
  const improved=beamError<greedyError;
  return {bytes:improved?candidate:greedy,decoded:improved?candidatePcm:greedyPcm,selection:improved?'beam':'greedy-fallback',greedySse:greedyError.toString(),beamSse:beamError.toString(),beamWidth:beam};
}
