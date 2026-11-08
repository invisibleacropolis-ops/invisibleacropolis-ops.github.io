import {projects,pages,route,validateProjects} from './projects-data.js';
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const key='zxfirmwares.projects.v1';let state={version:1,custom:[],notes:{}},storageFailed=false;
try{const raw=localStorage.getItem(key);if(raw)state=validateProjects(JSON.parse(raw));}catch{storageFailed=true;}
function notice(text){$('project-status').textContent=text;}
function save(){try{localStorage.setItem(key,JSON.stringify(state));notice('Saved in this browser only. Export for a durable copy; this is not a Git commit.');}catch{notice('Storage unavailable. Changes are only in memory — export now.');}}
function link(text,href){const a=make('a',text,'action');a.href=href;return a;}
function draw(){
 const r=route(location.hash),all=[...projects,...state.custom],p=all.find(p=>p.id===r.id);$('project-index').hidden=!!p;$('project-detail').hidden=!p;
 $('project-cards').replaceChildren(...all.map(p=>{const c=make('article',undefined,'work-card');c.append(make('p',p.kind,'eyebrow'),make('h2',p.title),make('p',p.status,'accent'),make('p',p.summary),link('Open project →',`#/${p.id}/overview`));return c;}));
 if(!p){if(r.id)notice('Unknown project. Showing the project index; nothing was created or overwritten.');return;}
 $('project-title').textContent=p.title;$('project-kind').textContent=`${p.kind} / ${p.status}`;
 $('project-pages').replaceChildren(...pages.map(name=>{const a=link(name[0].toUpperCase()+name.slice(1),`#/${p.id}/${name}`);if(name===r.page)a.setAttribute('aria-current','page');return a;}),link('Emulator & tests ↗',`../emulator/?project=${encodeURIComponent(p.id)}`));
 $('project-page-title').textContent=r.page[0].toUpperCase()+r.page.slice(1);const content=$('project-copy');content.replaceChildren();
 const notes=$('project-notes');notes.hidden=r.page!=='notes';
 if(r.page==='notes'){notes.value=state.notes[p.id]||'';notes.oninput=()=>{state.notes[p.id]=notes.value;save();};content.append(make('p','Development log, decisions, source revisions, build hashes and links. Local to this browser; export to preserve.'));}
 else for(const text of p[r.page]||['New OS workspace. Record requirements, architecture and current build state in Notes; then load a build in Emulator & tests.'])content.append(make('p',text));
 const actions=$('project-actions');actions.replaceChildren(link('Run / inspect a build',`../emulator/?project=${encodeURIComponent(p.id)}`),link('Research workbench','../#tab-research'),link('Control proposals','../#tab-hal'));
}
$('new-project').onsubmit=e=>{e.preventDefault();try{if(state.custom.length>=20)throw Error('Local project limit reached');const title=$('new-project-title').value.trim();const next=validateProjects({...state,custom:[...state.custom,{id:'local-'+crypto.randomUUID(),title}]});state=next;save();$('new-project-title').value='';location.hash=`/${state.custom.at(-1).id}/overview`;}catch(error){notice(error.message);}};
function download(name,text){const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=link('',u);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('export-projects').onclick=()=>{download('ZXFirmwares-projects.json',JSON.stringify(state,null,2)+'\n');notice('Export requested. Check Downloads; contains local project notes, not firmware or media.');};
$('import-projects').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>1000000)throw Error('Workspace too large');const next=validateProjects(JSON.parse(await f.text()));if(!confirm('Replace local projects and notes? Export first if needed.'))return;state=next;save();draw();}catch(error){notice('Import rejected: '+error.message+'. Current workspace unchanged.');}finally{e.target.value='';}};
window.addEventListener('hashchange',draw);notice(storageFailed?'Saved project data unavailable or invalid; original storage left untouched until you edit/import.':'Project registry + local notebooks. No firmware or private audio is stored here.');draw();
