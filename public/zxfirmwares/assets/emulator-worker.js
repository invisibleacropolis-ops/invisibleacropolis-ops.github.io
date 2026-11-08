import {createEmulator,compatibilityTest} from './emulator-core.js';
let machine=null,running=false,timer=null,last=0,lcdRevision=-1,audioFrames=0;
const wasmPromise=fetch(new URL('./generated/fm1-web.wasm',import.meta.url)).then(r=>{if(!r.ok)throw Error('Emulator WASM unavailable');return r.arrayBuffer();});
const fixture=()=>fetch(new URL('./generated/os-bringup.bin',import.meta.url)).then(r=>{if(!r.ok)throw Error('Bring-up fixture unavailable');return r.arrayBuffer();}).then(b=>new Uint8Array(b));
function snapshot(){const state=machine.snapshot();state.running=running;state.audioFrames=audioFrames;const message={type:'state',state};if(state.lcdRevision!==lcdRevision){lcdRevision=state.lcdRevision;message.lcd=machine.lcd();}postMessage(message);}
function pause(){running=false;clearTimeout(timer);timer=null;}
function loop(){if(!running)return;try{audioFrames+=machine.run();const s=machine.snapshot();if(s.halted||s.core1Fault)pause();if(!running||performance.now()-last>150){last=performance.now();snapshot();}if(running)timer=setTimeout(loop,0);}catch(error){pause();postMessage({type:'error',message:error.message});}}
self.onmessage=async({data})=>{try{
 if(data.type==='load'){pause();machine=await createEmulator(await wasmPromise);const bytes=data.bytes?new Uint8Array(data.bytes):await fixture();machine.boot(bytes,data.entry,data.mhz,data.profile);lcdRevision=-1;audioFrames=0;snapshot();}
 else if(data.type==='run'){if(!machine)throw Error('Load a build first');if(!running){running=true;loop();}}
 else if(data.type==='pause'){pause();if(machine)snapshot();}
 else if(data.type==='step'){pause();if(!machine)throw Error('Load a build first');machine.step();snapshot();}
 else if(data.type==='input'){if(!machine)throw Error('Load a build first');machine.input(data.kind,data.index,data.value);postMessage({type:'input',kind:data.kind,index:data.index,value:data.value,origin:data.origin});if(!running)snapshot();}
 else if(data.type==='tests'){postMessage({type:'tests',report:await compatibilityTest(await wasmPromise,await fixture())});}
 else throw Error('Unknown emulator command');
 }catch(error){pause();postMessage({type:'error',message:error.message});}};
