// Exact reviewed nested-app boundary plus owner-requested BRRbox release.
// No original recordings/private archives/project backups/credentials/APKs.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {posix,resolve} from 'node:path';
const allowed=['assets/published-builds.js','releases/brrbox/v0.9-build1/manifest.json','releases/brrbox/v0.9-build1/BRRbox-v0.9-build1-smk37-pro-xip.bin','releases/brrbox/v0.9-build1/BRRbox-v0.9-build1-smk37-pro.fwsc','releases/brrbox/v0.9-build1/BRRbox-v0.9-build1-corresponding-source.zip','assets/project-ingest.js','assets/support-storage.js','assets/os-library.js','assets/project-library.js','assets/run-log.js','assets/smk-surface.js','assets/smk-surface-map.js','assets/generated/smk37-pro-surface.svg','assets/generated/smk-input-probe.bin','.nojekyll','SHA256SUMS','THIRD_PARTY_NOTICES.md','index.html','projects/index.html','emulator/index.html','assets/app.js','assets/engine.js','assets/research-data.js','assets/codec.js','assets/codec-worker.js','assets/codec-lab.js','assets/brr.js','assets/spectrum.js','assets/encoder.js','assets/markers.js','assets/tonal.js','assets/tonal-fit.js','assets/hybrid.js','assets/hybrid-encode.js','assets/favicon.svg','assets/styles.css','assets/vendor/chart.umd.js','assets/vendor/Chart-LICENSE.md','assets/projects.js','assets/projects-data.js','assets/emulator-core.js','assets/emulator-worker.js','assets/emulator-ui.js','assets/os-workbench.css','assets/generated/zx-codec.wasm','assets/generated/zx-codec.json','assets/generated/zx-brr.wasm','assets/generated/zx-brr-decoder.wasm','assets/generated/zx-brr.json','assets/generated/zx-tonal.wasm','assets/generated/zx-tonal.json','assets/generated/fm1-web.wasm','assets/generated/fm1-web.json','assets/generated/fm1-emu-LICENSE.txt','assets/generated/os-bringup.bin'].sort();
const hash=b=>createHash('sha256').update(b).digest('hex');
async function verify(root){
 const found=[];
 async function walk(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink(),'No symlinks');if(e.isDirectory())await walk(dir+'/'+e.name,prefix+e.name+'/');else {assert.ok(e.isFile());found.push(prefix+e.name);}}}
 await walk(root);assert.deepEqual(found.sort(),allowed,root+' must contain only the reviewed 55-file client/release artifact (no private project database/archive)');
 const records=(await readFile(root+'/SHA256SUMS','utf8')).trim().split('\n'),seen=[];
 for(const line of records){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m);const[,h,n]=m;assert.ok(allowed.includes(n)&&n!=='SHA256SUMS');assert.equal(hash(await readFile(root+'/'+n)),h,n);seen.push(n);}
 assert.deepEqual(seen.sort(),allowed.filter(n=>n!=='SHA256SUMS'));
 for(const name of ['index.html','projects/index.html','emulator/index.html']){const html=await readFile(root+'/'+name,'utf8');for(const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)){assert.ok(/^\.\.?\//.test(m[1]));assert.ok(allowed.includes(posix.normalize(posix.join(posix.dirname(name),m[1]))));}}
 const wasm=await readFile(root+'/assets/generated/fm1-web.wasm'),info=JSON.parse(await readFile(root+'/assets/generated/fm1-web.json','utf8'));
 assert.equal(info.primaryTarget,'smk37-pro');assert.deepEqual(info.profiles,['smk37-pro','fm1']);assert.equal(info.loadFormat,'raw-XIP');
 assert.equal(info.commit,'92a21df72e9eae4c78b44c3199c974bc5937c620');assert.equal(hash(wasm),info.sha256);assert.equal(wasm.length,info.bytes);
 assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(wasm)),[{module:'env',name:'fm1_jit_compile',kind:'function'}]);
 assert.equal(hash(await readFile(root+'/assets/generated/os-bringup.bin')),'14f1fad9337d36a88b89c7b077d6e76ba87bc821056ae76f949565535318e181','Only original reviewed diagnostic is bundled');
 assert.equal(hash(await readFile(root+'/assets/generated/smk-input-probe.bin')),'34222cdcb8a32078c95b80277cc1b7657fbeef67eae4241e88ffaa5e0998df31','Only reviewed original MMIO probe, no vendor image');
 const svg=await readFile(root+'/assets/generated/smk37-pro-surface.svg','utf8');assert.equal((svg.match(/data-control=/g)||[]).length,85);assert.ok(!/<script|foreignObject|\.jpe?g|base64|https?:\/\/(?!www.w3.org)/i.test(svg));
 const notices=await readFile(root+'/assets/generated/fm1-emu-LICENSE.txt','utf8');for(const text of ['Joakim Eriksson','Rust standard-library runtime / LICENSE-MIT','Rust standard-library runtime / LICENSE-APACHE','Rust standard-library runtime / LICENSE-THIRD-PARTY'])assert.ok(notices.includes(text));
 const release=root+'/releases/brrbox/v0.9-build1/',raw=await readFile(release+'manifest.json');assert.equal(hash(raw),'7a188da1e675266eff49bf51cb6262bea445503c8be1cef089334586c36004b7');const manifest=JSON.parse(raw);assert.equal(manifest.schema,'ZX-OS-PUBLISHED-RELEASE-1');assert.equal(manifest.projectId,'local-144e9c8c-874f-4fa0-ae82-f7d69fcc2ec0');assert.equal(manifest.files.length,3);for(const f of manifest.files){assert.ok(allowed.includes('releases/brrbox/v0.9-build1/'+f.name));const b=await readFile(release+f.name);assert.equal(b.length,f.size);assert.equal(hash(b),f.sha256);}assert.equal(manifest.files.find(f=>f.name.endsWith('.zip')).sha256,'857908868d1a89cac234d8dbd35eff8bb74a21ed0587e3ff08b9b26018008c77','Only reviewed corresponding source; never private full archive/media bundle');
 return records;
}
const source=resolve('public/zxfirmwares'),built=resolve('dist/zxfirmwares');
assert.deepEqual(await verify(source),await verify(built),'Vite must preserve all published bytes');
for(const n of allowed)assert.deepEqual(await readFile(source+'/'+n),await readFile(built+'/'+n),n);
const entries=JSON.parse(await readFile('dist/pages.json','utf8')),lab=entries.filter(p=>p.title==='ZXFirmwares Lab');assert.equal(lab.length,1);assert.equal(lab[0].url,'/zxfirmwares/projects/');
console.log('ZXFirmwares: 55-file reviewed client/release boundary, 54 digests, 85-control SVG and SMK/FM1 profiles, runtime notices/imports, original diagnostic, navigation and exact Vite pass-through verified.');
