import {surfaceControls,surfaceInput,analogAt} from './smk-surface-map.js';
const momentary=c=>['key','button','pad'].includes(c.kind);
// Multiple contacts on the same pad/key must release only after the last pointer.
export class SurfaceContacts {
 constructor(forward){this.forward=forward;this.held=new Map();this.active=false;}
 reset(active=false){this.held.clear();this.active=active;}
 down(c,token,force=700){if(!this.active)return false;let h=this.held.get(c.id);if(!h){h={c,tokens:new Map()};this.held.set(c.id,h);}h.tokens.set(token,c.kind==='pad'?Math.max(1,Math.min(1023,force)):1);this.emit(h);return true;}
 emit(h){this.forward(h.c,Math.max(0,...h.tokens.values()));}
 up(c,token){const h=this.held.get(c.id);if(!h)return;h.tokens.delete(token);this.emit(h);if(!h.tokens.size)this.held.delete(c.id);}
 releaseAll(){for(const h of this.held.values())this.forward(h.c,0);this.held.clear();}
}
export async function initSmkSurface(forward){
 const $=id=>document.getElementById(id),byId=new Map(surfaceControls.map(c=>[c.id,c]));
 const r=await fetch(new URL('./generated/smk37-pro-surface.svg',import.meta.url));if(!r.ok)throw Error('SVG surface unavailable');
 const doc=new DOMParser().parseFromString(await r.text(),'image/svg+xml'),safe=new Set(['svg','title','desc','style','rect','path','g','circle','line','text','image']);
 if(doc.querySelector('parsererror'))throw Error('Invalid surface SVG');
 for(const e of doc.querySelectorAll('*')){if(!safe.has(e.localName))throw Error('Unexpected SVG element');for(const a of e.attributes)if(/^on/i.test(a.name)||a.localName==='href')throw Error('Unexpected SVG action/reference');}
 if(/@import|url\(/i.test(doc.documentElement.textContent))throw Error('External SVG styles rejected');
 // Interactive styles live in the external page sheet (strict style-src CSP).
 for(const style of doc.querySelectorAll('style'))style.remove();
 const svg=document.importNode(doc.documentElement,true);$('smk-surface-stage').replaceChildren(svg);
 const groups=new Map([...svg.querySelectorAll('[data-control]')].map(e=>[e.dataset.control,e]));if(groups.size!==85||[...groups.keys()].some(id=>!byId.has(id)))throw Error('Surface map mismatch');
 let selected=surfaceControls[0],active=false,scale=1;const values=new Map(),pointers=new Map();
 const contacts=new SurfaceContacts((c,v)=>{emit(c,v);groups.get(c.id).classList.toggle('held',v>0);groups.get(c.id).setAttribute('aria-pressed',String(v>0));});
 function emit(c,value){const msg=surfaceInput(c,value);const accepted=active&&forward(msg.kind,msg.index,msg.value,'surface:'+c.id);$('smk-surface-status').textContent=accepted?`${c.label} → ${msg.kind} ${msg.index} = ${msg.value} (forwarded)`:'Load SMK-37 Pro firmware.';return accepted;}
 function paint(c,value){values.set(c.id,value);const g=groups.get(c.id);g.setAttribute('aria-valuenow',String(value));if(c.kind==='encoder'){const line=g.querySelector('[data-indicator]');line.setAttribute('transform',`rotate(${value*12} ${c.cx} ${c.cy})`);}else if(!momentary(c)){const f=c.kind==='mod'?(value-c.min)/(c.max-c.min):1-(value-c.min)/(c.max-c.min);g.querySelector('[data-handle]').setAttribute('y',String(c.y+Math.max(0,Math.min(1,f))*c.h-5));}if(c===selected){$('smk-value').value=String(value);$('smk-value-label').textContent=String(value);}}
 function set(c,value,send=true){const v=Math.round(Math.max(c.min??0,Math.min(c.max??1023,value)));paint(c,v);if(send)emit(c,v);}
 function turn(c,delta){if(!active){$('smk-surface-status').textContent='Load a SMK-37 Pro build to turn an encoder.';return;}paint(c,(values.get(c.id)||0)+delta);emit(c,delta);}
 function select(c){selected=c;$('smk-selected').value=c.id;for(const[id,g]of groups)g.classList.toggle('selected',id===c.id);$('smk-control-name').textContent=c.label;$('smk-control-address').textContent=`${c.kind} / model ${surfaceInput(c,c.kind==='encoder'?1:0).kind} ${c.index}`;$('smk-hold').hidden=!momentary(c);$('smk-turns').hidden=c.kind!=='encoder';$('smk-value-wrap').hidden=momentary(c)&&c.kind!=='pad'||c.kind==='encoder';$('smk-value').min=String(c.min??0);$('smk-value').max=String(c.max??1023);$('smk-value').value=String(values.get(c.id)??(c.kind==='pad'?700:c.rest??0));$('smk-value-label').textContent=$('smk-value').value;}
 function coords(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());}
 function endPointer(e){const h=pointers.get(e.pointerId);if(!h)return;pointers.delete(e.pointerId);if(momentary(h.c))contacts.up(h.c,'pointer:'+e.pointerId);else if(h.c.kind==='pitch')set(h.c,h.c.rest);}
 svg.addEventListener('pointerdown',e=>{const g=e.target.closest('[data-control]');if(!g)return;e.preventDefault();const c=byId.get(g.dataset.control);select(c);g.focus();if(!active){$('smk-surface-status').textContent='Load SMK-37 Pro firmware.';return;}svg.setPointerCapture(e.pointerId);const p=coords(e);pointers.set(e.pointerId,{c,y:p.y,accum:0});if(momentary(c))contacts.down(c,'pointer:'+e.pointerId,e.pointerType==='touch'&&e.pressure>0?Math.round(e.pressure*1023):Number($('smk-pad-force').value));else if(c.kind!=='encoder')set(c,analogAt(c,p.y));});
 svg.addEventListener('pointermove',e=>{const h=pointers.get(e.pointerId);if(!h)return;const p=coords(e);if(h.c.kind==='encoder'){h.accum+=h.y-p.y;const steps=Math.max(-16,Math.min(16,Math.trunc(h.accum/8)));for(let i=0;i<Math.abs(steps);i++)turn(h.c,Math.sign(steps));h.accum-=steps*8;}else if(h.c.kind==='pad'&&e.pointerType==='touch'&&e.pressure>0)contacts.down(h.c,'pointer:'+e.pointerId,Math.round(e.pressure*1023));else if(!momentary(h.c))set(h.c,analogAt(h.c,p.y));h.y=p.y;});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,endPointer);
 svg.addEventListener('wheel',e=>{const g=e.target.closest('[data-control]'),c=g&&byId.get(g.dataset.control);if(c?.kind!=='encoder')return;e.preventDefault();select(c);turn(c,e.deltaY<0?1:-1);},{passive:false});
 svg.addEventListener('keydown',e=>{const g=e.target.closest('[data-control]');if(!g)return;const c=byId.get(g.dataset.control);select(c);if(momentary(c)&&[' ','Enter'].includes(e.key)){e.preventDefault();contacts.down(c,'keyboard');}else if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();const d=['ArrowUp','ArrowRight'].includes(e.key)?1:-1;if(c.kind==='encoder')turn(c,d);else if(!momentary(c))set(c,(values.get(c.id)??c.rest)+d*16);}});
 svg.addEventListener('keyup',e=>{const g=e.target.closest('[data-control]');if(g&&[' ','Enter'].includes(e.key)){e.preventDefault();contacts.up(byId.get(g.dataset.control),'keyboard');}});
 svg.addEventListener('focusout',e=>{const g=e.target.closest('[data-control]');if(g)contacts.up(byId.get(g.dataset.control),'keyboard');});
 for(const c of surfaceControls){const option=document.createElement('option');option.value=c.id;option.textContent=`${c.label} (${c.kind})`;$('smk-selected').append(option);if(!momentary(c))paint(c,c.rest??0);}
 $('smk-selected').onchange=()=>select(byId.get($('smk-selected').value));$('smk-value').oninput=()=>{if(selected.kind==='pad'){$('smk-pad-force').value=$('smk-value').value;$('smk-value-label').textContent=$('smk-value').value;}else set(selected,Number($('smk-value').value));};
 $('smk-minus').onclick=()=>turn(selected,-1);$('smk-plus').onclick=()=>turn(selected,1);
 let inspectorHeld=null;const hold=$('smk-hold');function holdDown(token){if(!momentary(selected))return;inspectorHeld=selected;contacts.down(selected,token,Number($('smk-pad-force').value));}function holdUp(token){if(inspectorHeld)contacts.up(inspectorHeld,token);inspectorHeld=null;}
 hold.onpointerdown=e=>{e.preventDefault();hold.setPointerCapture(e.pointerId);holdDown('inspector');};hold.onpointerup=hold.onpointercancel=hold.onlostpointercapture=()=>holdUp('inspector');hold.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();holdDown('inspector');}};hold.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();holdUp('inspector');}};hold.onblur=()=>holdUp('inspector');
 function zoom(n){scale=Math.max(.5,Math.min(3,n));svg.setAttribute('width',String(Math.round(1436*scale)));$('smk-zoom-label').textContent=Math.round(scale*100)+'%';}$('smk-zoom-in').onclick=()=>zoom(scale+.25);$('smk-zoom-out').onclick=()=>zoom(scale-.25);$('smk-fit').onclick=()=>zoom(Math.max(.5,Math.min(1,($('smk-surface-stage').clientWidth-4)/1436)));
 $('smk-velocity').oninput=()=>{if(active)forward('velocity',0,Number($('smk-velocity').value),'surface:velocity');};
 select(selected);zoom(Math.max(.5,Math.min(1,($('smk-surface-stage').clientWidth-4)/1436)));
 const api={
  releaseAll(){contacts.releaseAll();pointers.clear();inspectorHeld=null;for(const c of surfaceControls)if(c.kind==='pitch'&&values.get(c.id)!==c.rest)set(c,c.rest);},
  reset(profile,enabled){contacts.reset(enabled&&profile==='smk37-pro');active=contacts.active;pointers.clear();for(const g of groups.values()){g.classList.remove('held','guest-down');if(g.getAttribute('role')==='button')g.setAttribute('aria-pressed','false');}for(const c of surfaceControls)if(!momentary(c))paint(c,c.rest??0);$('smk-surface-panel').hidden=profile!=='smk37-pro';$('smk-surface-status').textContent=active?'SMK-37 Pro / green: contact / cyan: model contact':'SMK-37 Pro / idle';$('smk-velocity').value='3000';},
  receipt(kind,index,value,origin){if(!active)return;const c=surfaceControls.find(c=>c.index===index&&(kind==='encoder'?c.kind==='encoder':kind==='analog'&&!momentary(c)&&c.kind!=='encoder'));if(!c)return;if(c.kind==='encoder'){if(!String(origin).startsWith('surface:'))paint(c,(values.get(c.id)||0)+value);}else paint(c,value);},
  observe(state){if(state.profile!=='smk37-pro')return;for(const c of surfaceControls.filter(c=>['key','button'].includes(c.kind)))groups.get(c.id).classList.toggle('guest-down',!!state.modelKeys?.[c.index]);},
  display(url){svg.querySelector('[data-display]').setAttribute('href',url);}
 };return api;
}
