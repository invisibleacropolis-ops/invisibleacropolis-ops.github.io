// Thin, testable bridge to the actual pinned fm1-web CPU/SoC runtime.
export const XIP_BASE=0x02000000, MAX_IMAGE=1024*1024;
export const profiles=Object.freeze({
 'smk37-pro':Object.freeze({label:'SMK-37 Pro',board:'SMK-37',boardId:1,keyStart:0,keyCount:37,buttonStart:37,buttonCount:18,pads:16,encoders:8,maxAnalog:22}),
 'fm1':Object.freeze({label:'FM-1',board:'FM-1',boardId:0,keyStart:14,keyCount:27,buttonStart:0,buttonCount:14,pads:0,encoders:7,maxAnalog:15})
});
export function profileFor(id='smk37-pro'){if(!Object.hasOwn(profiles,id))throw Error('Unknown target profile.');return profiles[id];}
export function bootConfig(bytes,entry=XIP_BASE,mhz=120,profile='smk37-pro'){
 profileFor(profile);
 if(!(bytes instanceof Uint8Array)||bytes.length<2||bytes.length>MAX_IMAGE)throw Error('Raw XIP image must be 2 bytes–1 MiB.');
 if(!Number.isInteger(entry)||entry%2||entry<XIP_BASE||entry>=XIP_BASE+bytes.length)throw Error('Entry must be an even address inside this raw XIP image.');
 if(![24,60,120,240].includes(mhz))throw Error('Unsupported virtual clock.');
 if(['FWSC','PK\u0003\u0004','\u007fELF'].some(m=>new TextDecoder().decode(bytes.subarray(0,m.length))===m))throw Error('Use a built raw XIP .bin, not an update package, ZIP or ELF.');
 return {entry,mhz,profile};
}
export async function createEmulator(wasm){
 const {instance}=await WebAssembly.instantiate(wasm,{env:{fm1_jit_compile:()=>0}}),e=instance.exports;
 let loaded=false,config=null;
 const hex=n=>n.toString(16).padStart(8,'0');
 return {
  boot(bytes,entry=XIP_BASE,mhz=120,profile='smk37-pro'){const next=bootConfig(bytes,entry,mhz,profile),target=profileFor(profile);const p=e.fm1_alloc(bytes.length);new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);e.fm1_jit(0,0);e.fm1_ahead(0);e.fm1_boot(p,bytes.length,entry,mhz);if(e.zxf_select_board(target.boardId)!==0||e.fm1_board()!==target.boardId)throw Error('Runtime board selection failed.');config=next;loaded=true;return this.snapshot();},
  profileTest(profile){return e.zxf_profile_selftest(profileFor(profile).boardId)===0;},
  step(){if(!loaded)throw Error('Load a build first.');e.zxf_step();return this.snapshot();},
  run(){if(!loaded)throw Error('Load a build first.');const audioFrames=e.fm1_render(256,20000);e.zxf_trim_console();return audioFrames;},
  input(kind,index,value){if(!loaded)throw Error('Load a build first.');if(!Number.isInteger(index)||!Number.isInteger(value))throw Error('Invalid input.');
   const target=profileFor(config.profile);
   if(kind==='key'&&index>=0&&index<target.keyCount+target.buttonCount&&[0,1].includes(value))e.fm1_key(index,value);
   else if(kind==='analog'&&index>=0&&index<=target.maxAnalog&&value>=0&&value<=1023)e.fm1_analog(index,value);
   else if(kind==='encoder'&&index>=0&&index<target.encoders&&[-1,1].includes(value))e.fm1_enc(index,value);
   else if(kind==='velocity'&&config.profile==='smk37-pro'&&index===0&&value>=1000&&value<=100000)e.fm1_velocity(value);
   else throw Error('Input outside modeled '+target.label+' bounds.');
  },
  snapshot(){if(!loaded)throw Error('Load a build first.');const ram=Array.from({length:64},(_,i)=>e.zxf_ram(0x100+i));return {modelKeys:Array.from({length:profileFor(config.profile).keyCount+profileFor(config.profile).buttonCount},(_,i)=>!!e.zxf_model_key(i)),profile:config.profile,profileLabel:profileFor(config.profile).label,board:e.fm1_board()===1?'SMK-37':'FM-1',pc:hex(e.zxf_reg(16)),sp:hex(e.zxf_reg(17)),registers:Array.from({length:16},(_,i)=>hex(e.zxf_reg(i))),instructions:String(e.zxf_insns()),virtualMs:e.fm1_ms(),halted:!!e.fm1_halted(),core1Fault:!!e.fm1_cpu1_fault(),unknownAccesses:e.zxf_unknown_count(),console:new TextDecoder().decode(new Uint8Array(e.memory.buffer,e.zxf_console(),e.zxf_console_len())),ram,lcdRevision:e.fm1_lcd_revision(),config};},
  lcd(){return new Uint16Array(e.memory.buffer,e.fm1_lcd(),240*240).slice();},
 };
}
export async function smokeTest(wasm,fixture,profile='smk37-pro'){
 const target=profileFor(profile);
 const m=await createEmulator(wasm);const results=[];
 const check=(name,ok)=>{results.push({name,passed:!!ok});if(!ok)throw Error('Bring-up check failed: '+name);};
 check('Actual runtime boots as '+target.label,m.boot(fixture,XIP_BASE,120,profile).board===target.board);
 for(let i=0;i<40;i++)m.step();let s=m.snapshot();check('Original PI32 fixture executes and writes DBG_MSG',s.console==='ZXOS');
 check('PI32 writes the RAM counter',s.ram.slice(0,4).some(v=>v!==0));
 const before=BigInt(s.instructions);m.run();s=m.snapshot();check('Upstream dual-core scheduler advances CPU0',BigInt(s.instructions)>before&&!s.halted);
 check('Reset creates a fresh CPU state',m.boot(fixture,XIP_BASE,120,profile).instructions==='0');
 return {profile,scope:'Isolated original bring-up fixture, not custom-OS or hardware acceptance.',results};
}
export async function compatibilityTest(wasm,fixture){
 const results=[];
 for(const profile of Object.keys(profiles)){
  const report=await smokeTest(wasm,fixture,profile);results.push(...report.results.map(r=>({...r,name:profileFor(profile).label+' / '+r.name})));
  const m=await createEmulator(wasm),passed=m.profileTest(profile);if(!passed)throw Error('Board-specific input model failed: '+profile);results.push({name:profileFor(profile).label+' / board-specific key and analog routing',passed});
 }
 return {scope:'Shared PI32 execution and separate board models verified with original diagnostics. Not universal firmware, full OS or hardware acceptance.',results};
}
