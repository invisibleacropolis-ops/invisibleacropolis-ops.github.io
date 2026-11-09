export const pages=['overview','profile','architecture','controls','research','conversations','documents','images','media','links','roadmap','plans','manuals','versions','builds','sessions','notes'];
export const projects=[
 {id:'smk-tape-os',title:'SMK Tape OS',kind:'Custom OS / firmware',status:'Active host development · working title',summary:'SMK-37 Pro-first four-track sample/tape mangler. Develop the OS here; use codec research as supporting work, not the project structure.',
  overview:['Target: SMK-37 Pro','Planned tracks: 4','Planned capture: 30 s'],
  architecture:['Modules: boot / HAL / controls / transport / mixer / storage / display'],
  controls:['37 keys / 16 pads / 8 encoders / 4 faders / pitch / mod / pedal'],
  builds:[]},
 {id:'zxfirmmobile',title:'ZXFirmMobile',kind:'Companion tool',status:'Android build prepared · personal acceptance pending',summary:'Separate native Android audition companion. Not the SMK operating system.',overview:['Package: dev.typhon.zxfirmmobile','Version: 0.1.0 / code 1','Platform: Android ARM64'],architecture:['PI32 / Direct C'],controls:['Play / pause / seek / loop / gain'],builds:[]},
 {id:'audio-research',title:'Audio / codec research',kind:'Supporting research',status:'Archived comparisons · available when needed',summary:'Keep codec candidates, measurements and private AudioLab work together without blocking OS development.',overview:['Candidate A / BRRLAB / Opus'],architecture:['BRR / tonal models / residuals / HF'],controls:[],builds:[]}
];
export function route(hash){const p=hash.replace(/^#\/?/,'').split('/');return {id:p[0]||null,page:pages.includes(p[1])?p[1]:'overview'};}
export function validateProjects(value){
 if(!value||value.version!==1||!Array.isArray(value.custom)||value.custom.length>20||!value.notes||typeof value.notes!=='object'||Array.isArray(value.notes))throw Error('Invalid project workspace');
 const ids=new Set(projects.map(p=>p.id)),custom=[];
 for(const p of value.custom){if(!p||!/^local-[a-z0-9-]{1,64}$/.test(p.id)||ids.has(p.id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>80)throw Error('Invalid custom project');ids.add(p.id);custom.push({id:p.id,title:p.title.trim(),kind:'Custom OS / firmware',status:'Local project · not committed',summary:'Owner-created OS workspace.'});}
 const notes={};for(const[k,v]of Object.entries(value.notes)){if(!ids.has(k)||typeof v!=='string'||v.length>20000)throw Error('Invalid project note');notes[k]=v;}
 return {version:1,custom,notes};
}
