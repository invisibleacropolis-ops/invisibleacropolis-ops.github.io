// Reviewed public releases only. No private project snapshot, session or capability.
import * as db from './os-library.js';
import {BRRBOX_ID} from './projects-data.js';
export {BRRBOX_ID};
export const RELEASE_PATH='../releases/brrbox/v0.9-build1/';
export const MANIFEST_SHA256='7a188da1e675266eff49bf51cb6262bea445503c8be1cef089334586c36004b7';
const expected=[
 {label:'v0.9-build1',format:'raw-xip',sha256:'4423fd090e6f7a2f32c59ce5a5b13fc2eaa9f7feb9c6cf22df1b309a91bc4ab3',entry:0x02000120,mhz:120},
 {label:'v0.9-build1-fwsc',format:'fwsc',sha256:'b363364aef102e6fa490f293daef2caaa53bfb220fce180213e5f0fcf4bbdbdd',entry:null,mhz:null}
];
export function validatePublishedManifest(m){
 if(m?.schema!=='ZX-OS-PUBLISHED-RELEASE-1'||m.projectId!==BRRBOX_ID||m.release!=='v0.9-build1'||!Array.isArray(m.files)||m.files.length!==3||!Array.isArray(m.versions)||m.versions.length!==2||!Number.isFinite(Date.parse(m.createdAt)))throw Error('Invalid published release');
 const names=new Set();let bytes=0;
 for(const f of m.files){if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(f.name)||f.name.includes('..')||names.has(f.name)||!Number.isSafeInteger(f.size)||f.size<1||f.size>4*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256)||(bytes+=f.size)>8*1024*1024)throw Error('Invalid published file');names.add(f.name);}
 const ids=new Set();for(let i=0;i<expected.length;i++){const v=m.versions[i],e=expected[i];db.metadataId(v.id,'version');if(ids.has(v.id)||v.label!==e.label||v.target!=='smk37-pro'||v.format!==e.format||v.entry!==e.entry||v.mhz!==e.mhz||v.files?.length!==2||v.artifactIds?.length!==2||new Set(v.files).size!==2||v.files.some(n=>!names.has(n))||m.files.find(f=>f.name===v.files[0])?.sha256!==e.sha256)throw Error('Invalid published version');ids.add(v.id);for(const id of v.artifactIds){db.metadataId(id,'file');if(ids.has(id))throw Error('Duplicate published ID');ids.add(id);}}
 return m;
}
async function bytesAt(name,max){const url=new URL(RELEASE_PATH+name,import.meta.url),r=await fetch(url,{credentials:'omit',redirect:'error',cache:'no-cache',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Build download HTTP '+r.status);if(Number(r.headers.get('content-length'))>max)throw Error('Build download exceeds limit');const reader=r.body?.getReader();if(!reader){const b=new Uint8Array(await r.arrayBuffer());if(b.length>max)throw Error('Build download exceeds limit');return b;}const chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>max)throw Error('Build download exceeds limit');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}const b=new Uint8Array(size);let at=0;for(const chunk of chunks){b.set(chunk,at);at+=chunk.length;}return b;}
async function installed(pid){const versions=await db.versions(pid);const found=[];for(const e of expected){const v=versions.find(v=>v.label===e.label&&v.target==='smk37-pro');if(v){const a=await db.artifact(pid,v.primaryArtifactId);if(v.format!==e.format||v.entry!==e.entry||v.mhz!==e.mhz||a.sha256!==e.sha256)throw Error('Existing build label conflicts with published firmware; current files preserved');}found.push(!!v);}return found;}
let pending;
export async function ensurePublishedBuilds(pid,onProgress=()=>{}){
 if(pid!==BRRBOX_ID)return;
 if(pending)return pending;
 pending=(async()=>{
  const present=await installed(pid);if(present.every(Boolean))return;
  onProgress('Loading build files…');const raw=await bytesAt('manifest.json',256*1024);if(await db.sha256(raw)!==MANIFEST_SHA256)throw Error('Published manifest checksum failed');const manifest=validatePublishedManifest(JSON.parse(new TextDecoder().decode(raw))),needed=new Set(manifest.versions.filter((v,i)=>!present[i]).flatMap(v=>v.files)),downloaded=new Map();
  for(const file of manifest.files.filter(f=>needed.has(f.name))){onProgress('Loading '+file.name+'…');const bytes=await bytesAt(file.name,file.size);if(bytes.length!==file.size||await db.sha256(bytes)!==file.sha256)throw Error('Published build checksum failed: '+file.name);downloaded.set(file.name,bytes);}
  // Read latest local project/notes after network I/O. Strict atomic import rejects
  // concurrent edits or immutable-ID conflicts; it never replaces existing data.
  const backup=await db.exportProject(pid),latest=await installed(pid);for(let i=0;i<manifest.versions.length;i++){if(latest[i])continue;const {files,artifactIds,...fields}=manifest.versions[i],v={...fields,projectId:pid,createdAt:manifest.createdAt,artifactIds,primaryArtifactId:artifactIds[0]};backup.versions.push(v);for(let j=0;j<files.length;j++){const f=manifest.files.find(f=>f.name===files[j]),bytes=downloaded.get(f.name);if(!bytes)throw Error('Published build staging incomplete');backup.artifacts.push({id:artifactIds[j],projectId:pid,ownerType:'version',ownerId:v.id,role:j===0?'primary':'supporting',name:f.name,mime:f.mime,size:f.size,sha256:f.sha256,createdAt:manifest.createdAt});if(!backup.blobs.some(b=>b.id===f.sha256))backup.blobs.push({id:f.sha256,size:f.size,data:db.toBase64(bytes)});}}
  await db.importProject(backup);onProgress('Build files ready.');
 })().finally(()=>{pending=null;});return pending;
}
