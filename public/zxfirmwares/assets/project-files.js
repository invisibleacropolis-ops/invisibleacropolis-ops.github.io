// Shared, pure file organization for agent preparation, legacy caches and project views.
export function mimeFor(path) {
 const ext=path.split('.').at(-1).toLowerCase();
 return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',wav:'audio/wav',wave:'audio/wav',mp3:'audio/mpeg',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',pdf:'application/pdf',json:'application/json'})[ext] || (/\.(md|txt|c|cc|cpp|cxx|h|hpp|s|sh|py|ld|log|csv|toml|yml|yaml|html|css|js|mjs|ts|rs|patch|diff)$/i.test(path)||/(^|\/)(LICENSE|LICENSING|README|Makefile|CMakeLists\.txt|\.gitignore)$/i.test(path)?'text/plain':'application/octet-stream');
}
export function isSourcePath(path) {
 return /\.(c|cc|cpp|cxx|h|hh|hpp|s|asm|ld|lds|sh|bash|py|js|mjs|cjs|jsx|ts|tsx|rs|go|java|kt|swift|cmake|patch|diff)$/i.test(path)
  || /(^|\/)(Makefile|GNUmakefile|CMakeLists\.txt|Dockerfile|\.gitignore|\.gitattributes|Cargo\.(toml|lock)|package(-lock)?\.json)$/i.test(path)
  || /(^|\/)(firmware|src|tools|library)\/.*\.(json|toml|ya?ml|svbr|svbrr|bin)$/i.test(path);
}
export function categoryFor(path) {
 const mime=mimeFor(path);
 if(mime.startsWith('image/'))return 'image';
 if(/^(audio|video)\//.test(mime))return 'media';
 if(isSourcePath(path))return 'source';
 if(/roadmap|todo/i.test(path))return 'roadmap';
 if(/conversation|transcript/i.test(path))return 'conversation';
 if(/design|research/i.test(path)&&/\.md$/i.test(path))return 'research';
 if(/(controls|install|library|manual)\.md$/i.test(path))return 'manual';
 return 'document';
}
// Only repair machine-generated file documents. Never recategorize curated/user records.
export function organizeBackupSources(backup){const files=new Map(backup.artifacts.map(a=>[a.id,a]));return {...backup,resources:backup.resources.map(r=>organizeSourceRecord(r,files))};}
export function organizeSourceRecord(record,artifacts) {
 if(record.kind!=='document'||record.tags?.includes('category-explicit')||!record.tags?.includes('ingested-file')||!record.title.startsWith('File / ')||record.artifactIds?.length!==1)return record;
 const file=artifacts.get(record.artifactIds[0]);
 return file?.ownerType==='resource'&&file.ownerId===record.id&&file.projectId===record.projectId&&isSourcePath(file.name)?{...record,kind:'source'}:record;
}
