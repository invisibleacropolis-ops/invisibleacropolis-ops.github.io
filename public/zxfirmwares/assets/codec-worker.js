import { createCodec, parseWav, resample, makeDemo, encodeReel, decodeRange, errorMetrics, pcm8 } from './codec.js';
import { createBrr, brrStatistics } from './brr.js';
import { optimizeBrr } from './encoder.js';
import { packMarkers, inspectMarkers } from './markers.js';
let codecPromise, brrPromise;
function getBrr(){return brrPromise??=fetch(new URL('./generated/zx-brr.wasm',import.meta.url)).then(response=>{if(!response.ok)throw new Error('BRR WASM unavailable');return response.arrayBuffer();}).then(createBrr);}
async function getCodec() {
  codecPromise ??= fetch(new URL('./generated/zx-codec.wasm',import.meta.url)).then(response=>{
    if(!response.ok) throw new Error('Codec WASM could not be loaded');
    return response.arrayBuffer();
  }).then(createCodec);
  return codecPromise;
}
self.onmessage = async event => {
  try {
    const {buffer,rate,search,mask=15,restart=16,beam=0,tonal=false,tonalPartials=2,tonalTarget=40}=event.data;
    const [codec,brr]=await Promise.all([getCodec(),getBrr()]);
    const source=buffer ? parseWav(buffer) : {samples:makeDemo(rate),rate,channels:1};
    const original=resample(source.samples,source.rate,rate);
    const encoded=encodeReel(codec,original,rate,search);
    const decoded=decodeRange(codec,encoded);
    const eight=pcm8(original);
    const optimized=optimizeBrr(brr,original,rate,{mask,restart,beam}),brrEncoded=optimized.bytes,brrDecoded=optimized.decoded;
    const markerEncoded=packMarkers(brrEncoded),markerInfo=inspectMarkers(markerEncoded),encoderSelection=optimized.selection;
    const metrics=errorMetrics(original,decoded), metrics8=errorMetrics(original,eight),metricsBrr=errorMetrics(original,brrDecoded),statistics=brrStatistics(brrEncoded);
    let tonalResult=null;
    if(tonal){
      const [{createTonalRenderer},{encodeTonalProfiles}]=await Promise.all([import('./tonal.js'),import('./hybrid-encode.js')]);
      const response=await fetch(new URL('./generated/zx-tonal.wasm',import.meta.url));if(!response.ok)throw new Error('Tonal WASM unavailable');
      const renderer=await createTonalRenderer(await response.arrayBuffer());
      const experiment=encodeTonalProfiles(brr,renderer,original,rate,{maxPartials:tonalPartials,targets:[tonalTarget],onProgress:(done,total)=>{if(done===1||done%16===0||done===total)self.postMessage({progress:`Source-fitted tonal analysis ${done}/${total} pages…`});}});
      const selected=experiment.profiles[0],{pages,...breakdown}=selected.breakdown;
      tonalResult={modelPcm:experiment.modelOnly.decoded,densePcm:experiment.dense.decoded,hybridPcm:selected.decoded,encoded:selected.bytes,summary:{targetDb:selected.targetDb,targetMet:selected.targetMet,selection:selected.selection,bytes:selected.bytes.length,flatBytes:experiment.flat.bytes.length,modelBytes:experiment.modelOnly.bytes.length,denseBytes:experiment.dense.bytes.length,breakdown,analysis:experiment.analysis,metrics:errorMetrics(original,selected.decoded)}};
    }
    const transfer=[original.buffer,decoded.buffer,eight.buffer,encoded.buffer,brrEncoded.buffer,brrDecoded.buffer,markerEncoded.buffer,...(tonalResult?[tonalResult.modelPcm.buffer,tonalResult.densePcm.buffer,tonalResult.hybridPcm.buffer,tonalResult.encoded.buffer]:[])];
    self.postMessage({original,decoded,eight,encoded,brrEncoded,brrDecoded,markerEncoded,markerInfo,encoderSelection,metrics,metrics8,metricsBrr,statistics,tonal:tonalResult,rate,sourceRate:source.rate,sourceChannels:source.channels},[...new Set(transfer)]);
  } catch(error) { self.postMessage({error:error.message}); }
};
