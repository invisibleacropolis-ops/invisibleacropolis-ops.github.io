import * as db from './os-library.js';
import {BRRBOX_ID} from './projects-data.js';
import {MANUAL_LIMIT,renderManual,highlightManualMatches,clearManualMarks} from './manual-markdown.js';
// Owner-selected public manual only; one historical private session URL omitted. No automatic publication of other project resources.
export const BRRBOX_MANUAL=Object.freeze({id:'published-brrbox-manual-r1',title:'BRR-OS Manual · r1',path:'BRRosManual.md',url:new URL('../releases/brrbox/manual/BRRosManual.md',import.meta.url).href,size:79352,sha256:'7a95358593bff5d558f2cf26184e54211ca74dd6bdd3ec0fd9edd77a2486503e'});
export async function publishedManualBytes(manual,signal){
 const response=await fetch(manual.url,{credentials:'omit',redirect:'error',cache:'no-cache',signal});if(!response.ok)throw Error('Manual download HTTP '+response.status);
 if(Number(response.headers.get('content-length'))>manual.size)throw Error('Manual download exceeds expected size');
 const stream=response.body?.getReader();let bytes;
 if(stream){const parts=[];let size=0;try{for(;;){const {done,value}=await stream.read();if(done)break;if((size+=value.length)>manual.size)throw Error('Manual download exceeds expected size');parts.push(value);}}catch(error){await stream.cancel().catch(()=>{});throw error;}bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}}
 else bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==manual.size||await db.sha256(bytes)!==manual.sha256)throw Error('Manual checksum/length mismatch');return bytes;
}
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
const button=(text,fn)=>{const el=node('button',text);el.type='button';el.onclick=fn;return el;};
function select(label,id,options){const wrapper=node('label',label),el=node('select');el.id=id;wrapper.htmlFor=id;for(const [value,text]of options){const option=node('option',text);option.value=value;el.append(option);}wrapper.append(el);return {wrapper,el};}
export function initManualReader({host}){
 let projectId=null,epoch=0,controller=null,dispose=()=>{};
 function show(project){
  if((project?.id||null)===projectId)return;
  projectId=project?.id||null;const own=++epoch;controller?.abort();dispose();host.replaceChildren();if(!project)return;controller=new AbortController();const signal=controller.signal;
  const panel=node('details');panel.id='os-manual';panel.className='manual-panel work-card';const summary=node('summary','OS Manual');panel.append(summary);
  const toolbar=node('div');toolbar.className='manual-toolbar';const documents=select('Document','manual-document',[]),sizes=select('Reader size','manual-size',[['quarter','Quarter · 270px'],['half','Half · 540px'],['full','Full · 1080px']]);
  const download=button('Download Markdown',()=>{if(!currentBytes)return;const url=URL.createObjectURL(new Blob([currentBytes],{type:'text/markdown;charset=utf-8'})),a=node('a');a.href=url;a.download=currentChoice?.path?.split('/').at(-1)||'OS-Manual.md';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});download.disabled=true;
  const retry=button('Retry',()=>{choicesPromise=null;void open();});retry.hidden=true;
  toolbar.append(documents.wrapper,sizes.wrapper,download,button('Refresh manuals',()=>{choices=null;choicesPromise=null;loaded=null;void open();}),button('Fold',()=>{panel.open=false;summary.focus();}),retry);
  const form=node('form');form.className='manual-find';const label=node('label','Find'),query=node('input');query.type='search';query.id='manual-find';query.maxLength=256;query.autocomplete='off';label.htmlFor=query.id;label.append(query);
  const find=node('button','Find');find.type='submit';const previous=button('Previous match',()=>advance(-1)),next=button('Next match',()=>advance(1)),count=node('output','0 matches');count.id='manual-find-count';count.setAttribute('aria-live','polite');form.append(label,find,previous,next,count);
  const status=node('p');status.id='manual-status';status.setAttribute('role','status');const reader=node('div');reader.id='manual-reader';reader.className='manual-reader manual-size-quarter';reader.tabIndex=0;reader.setAttribute('role','region');reader.setAttribute('aria-label','OS Manual document');panel.append(toolbar,form,status,reader);host.append(panel);
  let choices=null,choicesPromise=null,currentChoice=null,currentBytes=null,root=null,headings=null,loaded=null,loadNumber=0,timer=null,lastQuery='',groups=[],active=-1,truncated=false,hasJumped=false,projectFiles=[],imageUrls=[];const cache=new Map();
  const releaseImages=()=>{for(const url of imageUrls)URL.revokeObjectURL(url);imageUrls=[];};
  const alive=()=>own===epoch&&panel.isConnected&&!signal.aborted;
  const notice=text=>{if(alive())status.textContent=text;};
  function searchState(){previous.disabled=next.disabled=!groups.length;find.disabled=query.disabled=!root;count.textContent=groups.length?`${active+1} / ${groups.length}${truncated?'+':''}`:query.value?'0 matches':'0 matches';}
  function jump(target){const top=target.getBoundingClientRect().top-reader.getBoundingClientRect().top+reader.scrollTop-16;reader.scrollTop=top;for(let p=target.parentElement;p&&p!==reader;p=p.parentElement)if(p.scrollWidth>p.clientWidth){const d=target.getBoundingClientRect(),r=p.getBoundingClientRect();if(d.left<r.left)p.scrollLeft-=r.left-d.left;else if(d.right>r.right)p.scrollLeft+=d.right-r.right;}}
  function advance(delta){if(!groups.length)return;hasJumped=true;for(const mark of groups[active]||[])mark.classList.remove('manual-current-match');active=(active+delta+groups.length)%groups.length;for(const mark of groups[active])mark.classList.add('manual-current-match');jump(groups[active][0]);searchState();}
  function search(jumpToMatch=false){clearTimeout(timer);if(!root)return;const text=query.value;if(text===lastQuery&&groups.length){if(jumpToMatch){if(hasJumped)advance(1);else{jump(groups[active][0]);hasJumped=true;}}return;}lastQuery=text;hasJumped=false;({groups,truncated}=highlightManualMatches(root,text));active=groups.length?0:-1;for(const mark of groups[0]||[])mark.classList.add('manual-current-match');if(jumpToMatch&&groups.length){jump(groups[0][0]);hasJumped=true;}searchState();}
  query.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>search(false),120);};query.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();clearTimeout(timer);query.value='';lastQuery='';if(root)clearManualMarks(root);groups=[];active=-1;searchState();}};
  form.onsubmit=e=>{e.preventDefault();search(true);};panel.addEventListener('keydown',e=>{if(panel.open&&root&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();query.focus();query.select();}if(panel.open&&root&&e.key==='F3'){e.preventDefault();advance(e.shiftKey?-1:1);}});
  sizes.el.onchange=()=>{reader.className='manual-reader manual-size-'+sizes.el.value;};documents.el.onchange=()=>void load(documents.el.value);
  async function getChoices(){if(choices)return choices;if(choicesPromise)return choicesPromise;choicesPromise=(async()=>{
   const resources=await db.resources(project.id),files=new Map((await db.artifacts(project.id)).map(a=>[a.id,a])),list=project.id===BRRBOX_ID?[{...BRRBOX_MANUAL,published:true}]:[];
   for(const record of resources.filter(r=>r.kind==='manual').sort((a,b)=>Number(b.tags?.includes('os-manual'))-Number(a.tags?.includes('os-manual'))||a.title.localeCompare(b.title))){const markdown=record.artifactIds.map(id=>files.get(id)).filter(a=>a&&/\.(md|markdown)$/i.test(a.name)&&a.size<=MANUAL_LIMIT);for(const file of markdown)if(!list.some(item=>item.sha256===file.sha256))list.push({id:file.id,title:record.title+' / '+file.name,path:file.name,sha256:file.sha256,file});if(!markdown.length&&record.body?.trim())list.push({id:record.id,title:record.title,path:'OS-Manual.md',body:record.body});}
   if(!alive())return [];projectFiles=[...files.values()];choices=list;documents.el.replaceChildren();for(const choice of list){const option=node('option',choice.title);option.value=choice.id;documents.el.append(option);}documents.el.disabled=list.length<2;return list;
  })().catch(error=>{choicesPromise=null;throw error;});return choicesPromise;}
  async function load(id,anchor=''){
   const choice=choices?.find(c=>c.id===id);if(!choice)return;const serial=++loadNumber;releaseImages();currentChoice=choice;currentBytes=null;root=null;loaded=null;download.disabled=true;reader.replaceChildren();groups=[];active=-1;lastQuery='';searchState();notice('Loading manual…');retry.hidden=true;
   try{
    let pending=cache.get(id);if(!pending){pending=(async()=>{const bytes=choice.published?await publishedManualBytes(choice,AbortSignal.any([signal,AbortSignal.timeout(30000)])):choice.file?(await db.artifact(project.id,choice.file.id)).bytes:new TextEncoder().encode(choice.body);if(bytes.length>MANUAL_LIMIT)throw Error('Manual exceeds 512 KiB');return {bytes,source:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};})();cache.set(id,pending);pending.catch(()=>cache.delete(id));}
    const data=await pending;if(!alive()||serial!==loadNumber)return;
    let imageCount=0,imageBytes=0;
    const rendered=renderManual(data.source,{jump,onNotice:notice,onImage:(path,img)=>{if(typeof path!=='string'||/^[a-z][a-z0-9+.-]*:|^\/|\\\\|[?#]/i.test(path)||++imageCount>16)return;const parts=choice.path.split('/').slice(0,-1);for(const part of path.split('/')){if(part==='..'){if(!parts.length)return;parts.pop();}else if(part!=='.')parts.push(part);}const relative=parts.join('/'),matches=projectFiles.filter(a=>a.name===relative||a.name===path);if(matches.length!==1)return;const file=matches[0];if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.mime)||file.size>4*1024*1024||(imageBytes+=file.size)>8*1024*1024)return;void db.artifact(project.id,file.id).then(a=>{if(!alive()||serial!==loadNumber||!img.isConnected)return;const url=URL.createObjectURL(new Blob([a.bytes],{type:file.mime}));imageUrls.push(url);img.src=url;}).catch(()=>{if(alive()&&serial===loadNumber)notice('Manual image unavailable: '+path);});},onDocument:(path,fragment)=>{const exact=choices.filter(c=>c.path===path),matches=exact.length?exact:choices.filter(c=>c.path?.endsWith('/'+path));if(matches.length!==1){notice('Document not available: '+path);return;}documents.el.value=matches[0].id;void load(matches[0].id,fragment);}});
    root=rendered.root;headings=rendered.headings;reader.replaceChildren(root);reader.scrollTop=0;currentBytes=data.bytes;loaded=id;download.disabled=false;notice('');search(true);if(anchor){const heading=headings.get(decodeURIComponent(anchor));if(heading)jump(heading);else notice('Section not found: '+anchor);}searchState();
   }catch(error){if(alive()&&serial===loadNumber){notice('Manual unavailable: '+error.message);retry.hidden=false;searchState();}}
  }
  async function open(){try{const list=await getChoices();if(!alive())return;if(!list.length){notice('No Markdown manual.');return;}if(!loaded)await load(documents.el.value||list[0].id);}catch(error){if(alive()){notice('Manual unavailable: '+error.message);retry.hidden=false;}}}
  panel.ontoggle=()=>{if(panel.open)void open();};searchState();dispose=()=>{clearTimeout(timer);releaseImages();};
 }
 return {show};
}
