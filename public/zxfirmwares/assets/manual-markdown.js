// CommonMark + tables/strikethrough → allowlisted DOM, never imported HTML/innerHTML.
import MarkdownIt from './vendor/markdown-it.mjs';
export const MANUAL_LIMIT=512*1024;
const parser=new MarkdownIt({html:false,linkify:false,typographer:false,maxNesting:32});
export function manualTokens(source){if(typeof source!=='string'||new TextEncoder().encode(source).length>MANUAL_LIMIT)throw Error('Manual exceeds 512 KiB');const tokens=parser.parse(source,{});if(tokens.length>50000)throw Error('Manual has too many blocks');return tokens;}
export const headingSlug=text=>text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s/g,'-');
export function manualLink(value){
 if(typeof value!=='string'||/[\x00-\x20\x7f]/.test(value)||value.length>2048)return null;
 if(value.startsWith('#'))return {kind:'anchor',value:value.slice(1)};
 if(/^[a-z][a-z0-9+.-]*:/i.test(value)){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?{kind:'external',value:u.href}:null;}catch{return null;}}
 if(value.startsWith('/')||value.startsWith('\\')||value.includes('\\')||value.includes('?'))return null;
 const [path,anchor='']=value.split('#');if(!path||path.split('/').some(s=>!s||s==='..')||!path.match(/\.(md|markdown)$/i))return null;
 return {kind:'document',value:path.replace(/^\.\//,''),anchor};
}
const allowed=new Set(['p','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','table','thead','tbody','tr','th','td','strong','em','s','a']);
export function renderManual(source,{document:doc=globalThis.document,onDocument=()=>{},onNotice=()=>{},jump=()=>{},onImage=()=>{}}={}){
 const root=doc.createElement('div');root.className='manual-prose';const headings=new Map(),counts=new Map();let nodes=0;
 const append=(parent,child)=>{if(++nodes>100000)throw Error('Manual has too many nodes');parent.append(child);return child;};
 function link(token,parent){const a=doc.createElement('a'),target=manualLink(token.attrGet('href'));if(!target)return append(parent,doc.createElement('span'));if(target.kind==='external'){a.href=target.value;a.target='_blank';a.rel='noopener noreferrer';}else{a.href='#';a.onclick=e=>{e.preventDefault();if(target.kind==='document'){onDocument(target.value,target.anchor);return;}let id;try{id=decodeURIComponent(target.value);}catch{return onNotice('Invalid manual anchor');}const heading=headings.get(id);if(heading)jump(heading);else onNotice('Section not found: '+id);};}return append(parent,a);}
 function render(tokens,parent){const stack=[parent];for(const token of tokens){let current=stack.at(-1);if(token.type==='inline'){render(token.children||[],current);continue;}if(token.nesting===-1){if(stack.length>1)stack.pop();continue;}
  if(token.nesting===1){if(!allowed.has(token.tag))throw Error('Unsupported Markdown element: '+token.tag);let el;
   if(token.tag==='a')el=link(token,current);
   else{el=doc.createElement(token.tag);if(token.tag==='table'){const wrapper=append(current,doc.createElement('div'));wrapper.className='manual-table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('aria-label','Scrollable table');current=wrapper;}
    if(token.tag==='ol'&&/^\d{1,9}$/.test(token.attrGet('start')||''))el.start=Number(token.attrGet('start'));
    if(['th','td'].includes(token.tag)){const align=token.attrGet('style')?.match(/^text-align:(left|center|right)$/)?.[1];if(align)el.className='manual-align-'+align;if(token.tag==='th')el.scope='col';}
    if(/^h[1-6]$/.test(token.tag)){const title=tokens[tokens.indexOf(token)+1]?.content||'',base=headingSlug(title)||'section',n=counts.get(base)||0;counts.set(base,n+1);const slug=base+(n?'-'+n:'');el.id='os-manual-'+slug;headings.set(slug,el);}
    append(current,el);
   }stack.push(el);continue;
  }
  if(token.type==='text'||token.type==='code_inline'){const el=token.type==='code_inline'?doc.createElement('code'):doc.createTextNode(token.content);if(token.type==='code_inline')el.textContent=token.content;append(current,el);}
  else if(token.type==='fence'||token.type==='code_block'){const pre=doc.createElement('pre'),code=doc.createElement('code');code.textContent=token.content;pre.append(code);append(current,pre);}
  else if(token.type==='softbreak')append(current,doc.createTextNode(' '));
  else if(token.type==='hardbreak'||token.type==='hr')append(current,doc.createElement(token.type==='hr'?'hr':'br'));
  else if(token.type==='image'){const img=doc.createElement('img');img.alt=token.content;img.loading='lazy';append(current,img);onImage(token.attrGet('src'),img);}
  else if(token.content)append(current,doc.createTextNode(token.content));
 }}
 render(manualTokens(source),root);
 for(const li of root.querySelectorAll('li')){const first=li.firstElementChild?.tagName==='P'?li.firstElementChild:li,text=first.firstChild;if(text?.nodeType!==3)continue;const match=/^\[([ xX])\]\s+/.exec(text.data);if(match){text.data=text.data.slice(match[0].length);const checkbox=doc.createElement('input');checkbox.type='checkbox';checkbox.disabled=true;checkbox.checked=match[1]!==' ';checkbox.setAttribute('aria-label',checkbox.checked?'Completed task':'Incomplete task');first.prepend(checkbox);}}
 return {root,headings};
}
// Literal Unicode/case-insensitive search: regex metacharacters are never evaluated.
export function findTextMatches(text,query,limit=5000){if(!query||query.length>256)return {matches:[],truncated:false};const re=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'),matches=[];for(const match of text.matchAll(re)){if(matches.length===limit)return {matches,truncated:true};matches.push({start:match.index,end:match.index+match[0].length});}return {matches,truncated:false};}
const blocks=new Set(['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','PRE','TR','TD','TH','HR','BR']);
export function indexManualText(root){const runs=[];let text='';function visit(node){if(node.nodeType===3){runs.push({node,start:text.length,end:text.length+node.data.length});text+=node.data;return;}const block=blocks.has(node.tagName);if(block)text+='\n';for(const child of node.childNodes)visit(child);if(block)text+='\n';}visit(root);return {text,runs};}
export function clearManualMarks(root){for(const mark of root.querySelectorAll('mark[data-manual-match]'))mark.replaceWith(root.ownerDocument.createTextNode(mark.textContent));root.normalize();}
export function highlightManualMatches(root,query){clearManualMarks(root);const index=indexManualText(root),{matches,truncated}=findTextMatches(index.text,query),groups=matches.map(()=>[]);let cursor=0;
 for(const run of index.runs){while(cursor<matches.length&&matches[cursor].end<=run.start)cursor++;const local=[];for(let i=cursor;i<matches.length&&matches[i].start<run.end;i++)if(matches[i].end>run.start)local.push({i,start:Math.max(0,matches[i].start-run.start),end:Math.min(run.node.length,matches[i].end-run.start)});if(!local.length)continue;const fragment=root.ownerDocument.createDocumentFragment();let at=0;for(const match of local){fragment.append(run.node.data.slice(at,match.start));const mark=root.ownerDocument.createElement('mark');mark.dataset.manualMatch=String(match.i);mark.textContent=run.node.data.slice(match.start,match.end);fragment.append(mark);groups[match.i].push(mark);at=match.end;}fragment.append(run.node.data.slice(at));run.node.replaceWith(fragment);}
 return {groups,truncated};
}
