// Geometry from the owner-supplied 1436×561 front-panel drawing.
// Logical input IDs come from pinned fm1-soc/smk.rs, NOT image-inferred wiring.
export const surfaceSize=Object.freeze({width:1436,height:561});
export const smkButtons=['KNOB BANK','FADER BANK','<','>','OCTAVE−','OCTAVE+','ARP','NOTE REPEAT','SCALE','CHORD','GLOBE','BT','PATCH','PARA','FX','SEQ','SEQ PLAY','SEQ REC'];
const controls=[];
for(let i=0;i<8;i++)controls.push({id:`k${i+1}`,label:`K${i+1}`,kind:'encoder',index:i,cx:404+i*79,cy:74,r:23});
const legends=['PLAY','PAUSE','REC','REW','FF','◁','▷','UNDO'];
for(let i=0;i<16;i++)controls.push({id:`pad${i+1}`,label:`Pad ${i+1}`,legend:i>=8?legends[i-8]:'',kind:'pad',index:i,x:374+(i%8)*79,y:i<8?114:173,w:61,h:49});
for(let i=0;i<18;i++){
 const left=i<6,j=left?i:i-6;
 controls.push({id:`button${i}`,label:smkButtons[i],kind:'button',index:37+i,x:left?232+(j%2)*44:1033+(j%6)*47,y:left?170+Math.floor(j/2)*22:192+Math.floor(j/6)*23,w:left?41:42,h:18});
}
for(let i=0;i<4;i++)controls.push({id:`fader${i+1}`,label:`FADER ${i+1}`,kind:'fader',index:16+i,x:1030+i*80,y:54,w:42,h:116,min:0,max:1023,rest:0});
controls.push({id:'pitch',label:'PITCH',kind:'pitch',index:20,x:82,y:81,w:39,h:121,min:445,max:640,rest:535},{id:'mod',label:'MOD',kind:'mod',index:21,x:147,y:81,w:39,h:121,min:474,max:629,rest:629});
const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],whitePcs=[0,2,4,5,7,9,11];let white=0;
const blackCenters=[134,198,301,364,427,527,591,693,756,819,921,984,1085,1148,1211];let black=0;
for(let i=0;i<37;i++){
 const pc=i%12,octave=3+Math.floor(i/12),isWhite=whitePcs.includes(pc);
 controls.push({id:`key${i}`,label:`${names[pc]}${octave}`,kind:'key',index:i,black:!isWhite,x:isWhite?84+white++*56:blackCenters[black++]-17,y:296,w:isWhite?56:34,h:isWhite?235:144});
}
export const surfaceControls=Object.freeze(controls.map(Object.freeze));
export function surfaceInput(c,value){
 if(!surfaceControls.includes(c))throw Error('Unknown surface control');
 const kind=c.kind==='key'||c.kind==='button'?'key':c.kind==='encoder'?'encoder':'analog';
 if(!Number.isInteger(value))throw Error('Integer input required');
 if(kind==='key'&&![0,1].includes(value))throw Error('Momentary control expects 0/1');
 if(kind==='encoder'&&![-1,1].includes(value))throw Error('Encoder expects one detent');
 if(kind==='analog'&&(value<0||value>1023))throw Error('Analog input out of bounds');
 return {kind,index:c.index,value};
}
export function analogAt(c,y){const low=c.kind==='mod'?c.max:c.min,high=c.kind==='mod'?c.min:c.max;const fraction=Math.max(0,Math.min(1,(y-c.y)/c.h));return Math.round(high+(low-high)*fraction);}
