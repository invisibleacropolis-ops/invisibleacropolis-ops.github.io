import * as db from './os-library.js';
import {bootConfig} from './emulator-core.js';
import {supportStorage, SUPPORT} from './support-storage.js';
import {categoryFor,mimeFor,organizeBackupSources} from './project-files.js';
export {categoryFor,mimeFor} from './project-files.js';
import {validateProjects} from './projects-data.js';

// Both library entry points recognize complete containers before applying the legacy notes cap.
export async function readProjectImport(file) {
  if (!(file instanceof Blob) || file.size > db.LIMITS.backup) throw Error('Project import exceeds the 96 MiB complete-container limit');
  const data = JSON.parse(await file.text());
  if (data?.schema === 'ZX-OS-PROJECT-BACKUP-1') return {kind:'complete',data};
  if (file.size > 1000000) throw Error('Notes-only workspace limit is 1 MB; choose a complete project container for firmware/media');
  return {kind:'notes',data:validateProjects(data)};
}

const text = (value, limit, name) => { if (typeof value !== 'string' || value.length > limit) throw Error('Invalid ' + name); return value; };
export function filePath(value) {
  text(value, 255, 'relative file path');
  if (!value || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe or empty relative file path');
  return value;
}
// Preflight the entire selection before reading/hash-encoding a single file.
export function planIngestion(entries,overrides={}) {
 if(!Array.isArray(entries)||entries.length>400)throw Error('Select at most 400 files per ingestion');
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw Error('Invalid fileCategories map');
 const paths=new Set();let total=0;
 const plan=entries.map(entry=>{const path=filePath(entry.path||entry.file?.webkitRelativePath||entry.file?.name),file=entry.file;
  if(paths.has(path))throw Error('Duplicate relative file path: '+path);paths.add(path);
  if(!(file instanceof Blob)||file.size>db.LIMITS.file)throw Error('File exceeds 16 MiB or is invalid: '+path);
  if((total+=file.size)>db.LIMITS.payload)throw Error('Selected file batch exceeds 64 MiB');
  const kind=Object.hasOwn(overrides,path)?overrides[path]:entry.kind||categoryFor(path);
  if(!db.recordKinds.includes(kind))throw Error('Unknown record category for '+path);
  return {path,file,kind,explicit:Object.hasOwn(overrides,path)||!!entry.kind&&entry.kind!==categoryFor(path)};
 });
 for(const path of Object.keys(overrides))if(!paths.has(path))throw Error('Unused fileCategories path: '+path);
 return plan.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function ingestionReport(backup) {
 const records=new Map(backup.resources.map(r=>[r.id,r])),files=backup.artifacts.filter(a=>a.ownerType==='resource').map(a=>({path:a.name,size:a.size,sha256:a.sha256,kind:records.get(a.ownerId)?.kind})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const categories={},folders={};for(const file of files){categories[file.kind]=(categories[file.kind]||0)+1;const folder=file.path.includes('/')?file.path.slice(0,file.path.lastIndexOf('/')):'.';folders[folder]=(folders[folder]||0)+1;}
 return {schema:'ZX-OS-INGEST-REPORT-1',project:backup.project.title,projectId:backup.project.id,records:backup.resources.length,versions:backup.versions.map(v=>({label:v.label,format:v.format})),files:files.length,originalBytes:files.reduce((n,f)=>n+f.size,0),uniqueBytes:backup.blobs.reduce((n,b)=>n+b.size,0),categories,folders,duplicateBytes:files.reduce((n,f)=>n+f.size,0)-[...new Map(files.map(f=>[f.sha256,f.size])).values()].reduce((n,size)=>n+size,0),inventory:files};
}
// Agent-only bulk-import API: review has no writes; commit requires an explicit destination.
// See docs/AGENT_PROJECT_IMPORT.md. No public import controls mount this pipeline.
export async function reviewAgentProject(file) {
 const result=await readProjectImport(file);if(result.kind!=='complete')throw Error('Expected a complete project container');
 await db.validateBackup(result.data);const backup=organizeBackupSources(result.data);return {backup,report:ingestionReport(backup)};
}
export async function commitAgentProject(backup,{storage,onProgress=()=>{}}={}) {
 if(!['local','invisible-support'].includes(storage))throw Error('Choose an explicit storage destination');
 await db.validateBackup(backup);let data=organizeBackupSources(structuredClone(backup));
 if(storage==='invisible-support')data=await supportStorage.publishProject(data,onProgress);
 else if(data.project.cloud){data.project.originCloud=data.project.cloud;delete data.project.cloud;}
 return db.importProject(data);
}
// Pure preparation: inspect/hash/validate every byte before any IndexedDB or remote mutation.
export async function prepareIngestion(fields, entries = [], onProgress = () => {}) {
  const plan=planIngestion(entries,fields.fileCategories);
  const stamp = db.now(), id = db.projectId(fields.id || 'local-' + crypto.randomUUID()), metadataId = db.uid('project');
  const project = {id,metadataId,kind:'Custom OS / firmware',seed:false,createdAt:stamp,updatedAt:stamp,notes:text(fields.notes || '',20000,'notebook')};
  for (const [key, max, fallback] of [['title',80,''],['summary',2000,''],['status',120,'Imported / unverified'],['manufacturer',120,'M-VAVE'],['product',120,'SMK-37 Pro'],['hardwareRevision',240,'Unknown / not verified'],['firmwareLineage',2000,'']]) project[key] = text(fields[key] ?? fallback,max,key).trim();
  if (!project.title) throw Error('Project title required');
  project.target = fields.target || 'smk37-pro';
  const source = text(fields.source || 'Owner project ingestion',2000,'source');
  for (const key of ['overview','architecture','controls']) {
    const value = text(fields[key] || '',20000,key);
    project[key] = [value || (key === 'overview' ? project.summary || project.title : '')];
  }
  const backup = {schema:'ZX-OS-PROJECT-BACKUP-1',backupId:db.uid('backup'),exportedAt:stamp,project,resources:[],versions:[],artifacts:[],blobs:[],runs:[],chunks:[]};
  function record(kind,title,body,url='',tags=[]) {
    if (!db.recordKinds.includes(kind)) throw Error('Unknown record category');
    if (backup.resources.length >= db.LIMITS.records) throw Error('Project record limit reached');
    const row = {id:db.uid('record'),projectId:id,kind,title:text(title,160,'record title'),body:text(body,200000,'record text'),url:db.safeUrl(url),tags,source,versionId:null,artifactIds:[],createdAt:stamp};
    backup.resources.push(row); return row;
  }
  const profile = record('identification','Project identification / initial revision',JSON.stringify(Object.fromEntries(['title','summary','status','target','manufacturer','product','hardwareRevision','firmwareLineage'].map(k=>[k,project[k]])),null,2));
  project.profileRevisionId = profile.id; profile.previousId = null;
  const sections = [...(fields.sections || [])];
  for (const [key,kind] of [['research','research'],['conversations','conversation'],['roadmap','roadmap'],['plans','plan'],['manuals','manual']]) if (fields[key]) sections.push({kind,title:key[0].toUpperCase()+key.slice(1),body:fields[key]});
  if (sections.length > 90) throw Error('At most 90 curated sections');
  for (const section of sections) { const r=record(section.kind,section.title,section.body,section.url || '',section.tags || []); if (section.source) r.source=text(section.source,2000,'section source'); }
  if (fields.links) for (const url of text(fields.links,20000,'links').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) record('link',url.slice(0,160),'Reference URL',url);
  const blobs = new Map(), inventory = []; let total = 0;
  for (let i=0;i<plan.length;i++) {
    const {path,file,kind,explicit}=plan[i];total+=file.size;
    onProgress({done:i,total:plan.length,name:path});
    const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)throw Error('File size changed while reading: '+path);
    const sha256=await db.sha256(bytes),mime=mimeFor(path);
    if (!blobs.has(sha256)) blobs.set(sha256,{id:sha256,size:bytes.length,data:db.toBase64(bytes)});
    let body=`Original supplied file: ${path}\nBytes: ${bytes.length}\nSHA-256: ${sha256}\n`;
    // Source lives in the exact-byte attachment, not duplicated into knowledge text.
    if (kind!=='source'&&(mime==='text/plain'||mime==='application/json')) { const full=new TextDecoder().decode(bytes.subarray(0,16384)); body+='\n\n'+full+(bytes.length>16384?'\n[Text preview truncated; attached original file is complete.]':''); }
    const r=record(kind,('File / '+path).slice(0,160),body,'',['ingested-file',path.slice(0,100),...(explicit?['category-explicit']:[])]);
    const artifact={id:db.uid('file'),projectId:id,ownerType:'resource',ownerId:r.id,role:'primary',name:path,mime,size:bytes.length,sha256,createdAt:stamp};
    r.artifactIds.push(artifact.id); backup.artifacts.push(artifact);
    inventory.push({path,size:bytes.length,sha256,kind,recordId:r.id,artifactId:artifact.id});
  }
  backup.blobs=[...blobs.values()];
  if (fields.version?.primaryPath) {
    const v=fields.version, primary=backup.artifacts.find(a=>a.name===filePath(v.primaryPath)); if(!primary) throw Error('Version primary file was not selected');
    const version={id:db.uid('version'),projectId:id,label:text(v.label || '',120,'version label').trim(),title:text(v.title || v.label || '',160,'version title'),target:project.target,format:v.format || 'other',channel:v.channel || 'archived',sourceRevision:text(v.sourceRevision || '',240,'source revision'),source,notes:text(v.notes || '',20000,'version notes'),entry:null,mhz:null,createdAt:stamp,artifactIds:[]};
    if(!version.label) throw Error('Version label required when choosing a primary file');
    if(version.format==='raw-xip') { if(!v.rawConfirmed) throw Error('Explicit raw-XIP target/entry confirmation required'); version.entry=Number(v.entry); version.mhz=Number(v.mhz); bootConfig(db.fromBase64(blobs.get(primary.sha256).data),version.entry,version.mhz,version.target); }
    const artifact={...primary,id:db.uid('file'),ownerType:'version',ownerId:version.id}; version.primaryArtifactId=artifact.id; version.artifactIds=[artifact.id]; backup.artifacts.push(artifact); backup.versions.push(version);
    for(const r of backup.resources) r.versionId=version.id;
  }
  record('document','Ingestion inventory / exact original files',JSON.stringify({schema:'ZX-OS-INGEST-INVENTORY-1',source,files:inventory,originalFileCount:inventory.length,originalBytes:total,uniqueBlobBytes:backup.blobs.reduce((n,b)=>n+b.size,0),suppliedVersion:fields.version?.label || null,execution:[]},null,2),'',['inventory','provenance']);
  await db.validateBackup(backup); onProgress({done:entries.length,total:entries.length,name:'All bytes and project metadata validated'}); return backup;
}

const node=(tag,content,cls)=>{const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(cls)el.className=cls;return el;};
function field(form,id,label,{value,max=2000,rows,options,type='text',required=false}={}) {
  const l=node('label',label),el=node(options?'select':rows?'textarea':'input');el.id=id;el.name=id;l.htmlFor=id;
  if(options)for(const [value,label]of options){const o=node('option',label);o.value=value;el.append(o);}else if(rows)el.rows=rows;else el.type=type;
  if(type!=='file'&&value!==undefined)el.value=value;el.maxLength=max;el.required=required;l.append(el);form.append(l);return el;
}
function button(label,id){const b=node('button',label);b.type='button';if(id)b.id=id;return b;}
export function initProjectIngestion({host,status,onCommitted,isActive=()=>true}) {
  const notice=t=>{status.textContent=t;}, values={}, selected=[];let preview=null,busy=false,revision=0;
  host.append(node('a','← Projects library'));host.firstChild.href='#/';
  host.append(node('h2','Create Project'));
  // Bulk workspace/container import is agent-only; see docs/AGENT_PROJECT_IMPORT.md.
  // Keep prepareIngestion/reviewAgentProject/commitAgentProject available without mounting import UI.
  const connection=node('section',undefined,'work-card');connection.append(node('h3','Invisible Support / existing private storage'));
  const portal=node('a','Sign in / renew session in Invisible Support ↗','action');portal.href=SUPPORT.portal;portal.target='_blank';portal.rel='noopener noreferrer';connection.append(portal);
  const check=button('Check Invisible Support sign-in','ingest-connect'),authState=node('p','Session: —');
  check.onclick=()=>work(async()=>{const u=await supportStorage.user();authState.textContent='Connected as '+(u.email||u.id);});connection.append(check,authState);host.append(connection);
  const form=node('form',undefined,'work-card');form.id='new-project';form.append(node('h3','1 / Identify and describe the OS'));
  const definitions=[['title','Project name',80,0,true],['summary','Summary',2000,3],['status','Evidence / development status',120],['manufacturer','Manufacturer',120],['product','Product / variant',120],['hardwareRevision','Installed hardware / firmware revision (unknown unless verified)',240],['firmwareLineage','Firmware lineage / compatibility assumptions',2000,3],['source','Source folder / author / rights / provenance',2000,3]];
  for(const [key,label,max,rows,required]of definitions)values[key]=field(form,key==='title'?'new-project-title':'ingest-'+key,label,{max,rows,required,value:({manufacturer:'M-VAVE',product:'SMK-37 Pro',status:'Imported / unverified',hardwareRevision:'Unknown / not verified'})[key]||''});
  values.target=field(form,'ingest-target','Primary target',{options:[['smk37-pro','SMK-37 Pro'],['fm1','FM-1']]});
  values.storage=field(form,'ingest-storage','Storage destination',{options:[['invisible-support','Invisible Support private DB + browser working cache'],['local','Local cache']]});
  form.append(node('h3','2 / Place knowledge in the proper sections'));
  for(const [key,label]of [['overview','Overview / aspirations'],['architecture','Architecture / modules / constraints'],['controls','Control mapping'],['research','Research / evidence'],['conversations','Conversations / decision history'],['roadmap','Roadmap / milestones'],['plans','Development / acceptance plans'],['manuals','Manual / operating instructions'],['links','Reference URLs — one HTTP(S) URL per line'],['notes','Project notebook']])values[key]=field(form,'ingest-'+key,label,{rows:4,max:20000});
  form.append(node('h3','3 / Files'),node('p','400 files · 16 MiB/file · 64 MiB/batch'));
  const fileInput=field(form,'ingest-files','Add files',{type:'file'});fileInput.multiple=true;
  const folderInput=field(form,'ingest-folder','Add folder (if supported by your browser)',{type:'file'});folderInput.multiple=true;folderInput.setAttribute('webkitdirectory','');
  const clear=button('Clear selected files','ingest-clear-files'),fileList=node('div'),fileStatus=node('p','No files selected.');form.append(clear,fileStatus,fileList);
  const primary=field(form,'ingest-version-primary','Version primary file',{options:[['','None']]});
  const version={label:field(form,'ingest-version-label','Version / source snapshot label',{max:120}),title:field(form,'ingest-version-title','Version display title',{max:160}),format:field(form,'ingest-version-format','Version format',{options:[['other','Other / source snapshot — archive only'],['fwsc','FWSC — archive only'],['elf','ELF — archive only'],['raw-xip','Verified raw XIP — loadable']]}),sourceRevision:field(form,'ingest-version-revision','Source revision / supplied tag',{max:240}),notes:field(form,'ingest-version-notes','Version provenance / acceptance notes',{rows:3,max:20000}),entry:field(form,'ingest-version-entry','Raw entry address',{value:'0x02000000'}),mhz:field(form,'ingest-version-clock','Virtual MHz',{options:[[24,'24'],[60,'60'],[120,'120'],[240,'240']],value:'120'}),rawConfirmed:field(form,'ingest-version-confirm','Confirm raw-XIP target and entry',{type:'checkbox'})};
  const review=button('Review project','ingest-review');review.type='submit';const commit=button('Create project','ingest-commit');commit.disabled=true;const summary=node('pre');summary.id='ingest-review-summary';form.append(node('h3','4 / Review and commit'),review,commit,summary);host.append(form);
  function invalidate(){revision++;preview=null;commit.disabled=true;summary.textContent='Draft changed. Review required.';}
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  function displayFiles(){fileList.replaceChildren();primary.replaceChildren();const option=node('option','None');option.value='';primary.append(option);for(const entry of selected){const row=node('div',undefined,'ingest-file-row');row.append(node('span',entry.path+' / '+entry.file.size+' B'));const select=node('select');select.setAttribute('aria-label','Category for '+entry.path);for(const kind of db.recordKinds){const o=node('option',kind);o.value=kind;select.append(o);}select.value=entry.kind;select.onchange=()=>{entry.kind=select.value;};row.append(select);fileList.append(row);const o=node('option',entry.path);o.value=entry.path;primary.append(o);}fileStatus.textContent=selected.length+' selected files / '+selected.reduce((n,e)=>n+e.file.size,0)+' B';}
  function addFiles(input){try{const incoming=[...input.files].map(file=>({file,path:filePath(file.webkitRelativePath||file.name),kind:categoryFor(file.webkitRelativePath||file.name)})),all=[...selected,...incoming];if(all.length>400||all.reduce((n,e)=>n+e.file.size,0)>db.LIMITS.payload||all.some(e=>e.file.size>db.LIMITS.file))throw Error('Selection exceeds file count/size/batch limits');if(new Set(all.map(e=>e.path)).size!==all.length)throw Error('Duplicate relative path; clear/reselect or use distinct folder paths');selected.push(...incoming);displayFiles();invalidate();}catch(error){notice('File selection rejected: '+error.message+'');}input.value='';}
  fileInput.onchange=()=>addFiles(fileInput);folderInput.onchange=()=>addFiles(folderInput);clear.onclick=()=>{selected.length=0;displayFiles();invalidate();};
  const progress=e=>notice(`Ingestion ${e.done}/${e.total}: ${e.name}`);
  async function work(fn){if(busy)return;busy=true;const controls=[...host.querySelectorAll('input,textarea,select,button')],disabled=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);try{await fn();}catch(error){notice('Import error: '+error.message);}finally{controls.forEach((e,i)=>e.disabled=disabled[i]);busy=false;commit.disabled=!preview;}}
  form.onsubmit=e=>{e.preventDefault();const own=revision;work(async()=>{const data=Object.fromEntries(Object.entries(values).map(([k,e])=>[k,e.value]));if(primary.value)data.version={primaryPath:primary.value,...Object.fromEntries(Object.entries(version).map(([k,e])=>[k,k==='rawConfirmed'?e.checked:e.value]))};if(!['invisible-support','local'].includes(data.storage))throw Error('Choose an explicit storage destination');const next=await prepareIngestion(data,selected,progress);if(own!==revision)return;preview={backup:next,storage:data.storage};summary.textContent=JSON.stringify({...ingestionReport(next),target:next.project.target,storage:data.storage},null,2);notice('Review ready.');});};
  commit.onclick=()=>work(async()=>{if(!preview)throw Error('Review the current draft first');let backup=preview.backup;if(preview.storage==='invisible-support')backup=await supportStorage.publishProject(backup,progress);const p=await db.importProject(backup);preview=null;await onCommitted(p,isActive());notice('Project committed: '+p.title+(backup.project.cloud?' / Invisible Support':' / local'));});
  return {isBusy:()=>busy};
}
