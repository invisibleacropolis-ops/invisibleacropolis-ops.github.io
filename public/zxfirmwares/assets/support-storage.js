// Existing Invisible Support backend; no service key, public URL, new bucket or SQL migration.
// Reuses its same-origin Supabase session without copying/refreshing/replacing its credentials.
export const SUPPORT = Object.freeze({
  url: 'https://guoyqsfvqllyhlsrknml.supabase.co',
  key: 'sb_publishable_ed-VTx2u60tI9SnQeVbGRQ_IEHA36FO',
  bucket: 'invisible-support-assets', table: 'assets',
  sessionKey: 'sb-guoyqsfvqllyhlsrknml-auth-token', portal: '/InvisibleSupport/'
});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
async function boundedBytes(response, max) {
  if (Number(response.headers.get('content-length')) > max) throw Error('Remote response exceeds its declared limit');
  const reader = response.body?.getReader();
  if (!reader) { const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > max) throw Error('Remote response too large'); return bytes; }
  const chunks = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > max) throw Error('Remote response too large'); chunks.push(value); } }
  catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; } return bytes;
}
// Injectable transport is for contract tests, not evidence of authenticated production acceptance.
export function createSupportStorage({ fetchImpl = (...args) => fetch(...args), session = () => {
  let value; try { value = JSON.parse(localStorage.getItem(SUPPORT.sessionKey) || 'null'); } catch { throw Error('Invisible Support session unavailable; sign in through its portal'); }
  return value;
} } = {}) {
  function credential(ownerId) {
    const value = session();
    if (!value?.access_token || !uuid.test(value.user?.id || '') || (value.expires_at && value.expires_at * 1000 < Date.now() + 15000)) throw Error('Sign in or renew your session in Invisible Support, then return here');
    if (ownerId && value.user.id !== ownerId) throw Error('Invisible Support account changed; project upload/download stopped');
    return value.access_token;
  }
  async function request(path, { ownerId, method = 'GET', headers = {}, body, max = 1024 * 1024, optional = false } = {}) {
    const token = credential(ownerId);
    const response = await fetchImpl(SUPPORT.url + path, { method, headers: { apikey: SUPPORT.key, Authorization: 'Bearer ' + token, ...headers }, body, signal: AbortSignal.timeout(120000), cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw Error('Invisible Support request failed (HTTP ' + response.status + ')');
    return boundedBytes(response, max);
  }
  async function json(path, options) { const bytes = await request(path, options); return bytes === null ? null : bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : null; }
  async function user() {
    const value = await json('/auth/v1/user');
    if (!uuid.test(value?.id || '')) throw Error('Invisible Support did not acknowledge an authenticated owner');
    credential(value.id); return { id: value.id, email: value.email || '' };
  }
  function objectPath(ownerId, assetId) {
    if (!uuid.test(ownerId) || !/^zxf-(?:blob|project|share)-[a-f0-9_-]+$/.test(assetId)) throw Error('Invalid project asset identity');
    return `${ownerId}/documents/${assetId}/content`;
  }
  async function row(assetId, ownerId) {
    const rows = await json(`/rest/v1/${SUPPORT.table}?id=eq.${encodeURIComponent(assetId)}&owner_id=eq.${ownerId}&select=*&limit=2`, { ownerId });
    if (!Array.isArray(rows) || rows.length > 1) throw Error('Invalid asset metadata response');
    return rows[0] || null;
  }
  function checkRow(value, expected) {
    const data = value?.exif?.zxfirmwares;
    if (!value || value.id !== expected.id || value.owner_id !== expected.owner_id || value.storage_path !== expected.storage_path || Number(value.size_bytes) !== expected.size_bytes || value.kind !== expected.kind || (data?.role === 'project' && value.mime_type !== expected.mime_type) || data?.schema !== 'ZXF-ASSET-1' || data.projectId !== expected.exif.zxfirmwares.projectId || data.projectMetadataId !== expected.exif.zxfirmwares.projectMetadataId || data.role !== expected.exif.zxfirmwares.role || data.sha256 !== expected.exif.zxfirmwares.sha256) throw Error('Remote asset metadata conflicts with the owning project or checksum');
  }
  async function downloadPath(path, ownerId, size, sha256) {
    if (!uuid.test(ownerId) || !path.startsWith(ownerId + '/documents/zxf-') || path.split('/').length !== 4 || path.split('/').at(-1) !== 'content' || !hashPattern.test(sha256) || !Number.isSafeInteger(size) || size < 0 || size > 96 * 1024 * 1024) throw Error('Invalid private project file reference');
    const bytes = await request(`/storage/v1/object/authenticated/${SUPPORT.bucket}/${encodePath(path)}`, { ownerId, max: size });
    if (bytes.length !== size || await digest(bytes) !== sha256) throw Error('Remote original file checksum/length failed');
    return bytes;
  }
  async function putVerified(bytes, metadata, ownerId) {
    const old = await row(metadata.id, ownerId);
    if (old) checkRow(old, metadata);
    else {
      // A failed earlier attempt may have staged an object but no row. Never overwrite it.
      let uploadError;
      try { await request(`/storage/v1/object/${SUPPORT.bucket}/${encodePath(metadata.storage_path)}`, { ownerId, method: 'POST', headers: { 'Content-Type': metadata.mime_type, 'x-upsert': 'false' }, body: new Blob([bytes], { type: metadata.mime_type }) }); }
      catch (error) { uploadError = error; }
      try { await downloadPath(metadata.storage_path, ownerId, bytes.length, metadata.exif.zxfirmwares.sha256); }
      catch (error) { throw uploadError || error; }
      try { await json(`/rest/v1/${SUPPORT.table}`, { ownerId, method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(metadata) }); }
      catch (error) { const current = await row(metadata.id, ownerId); if (!current) throw error; checkRow(current, metadata); }
    }
    // Durable byte evidence is the authenticated read-back, not a completed upload callback.
    await downloadPath(metadata.storage_path, ownerId, bytes.length, metadata.exif.zxfirmwares.sha256);
    checkRow(await row(metadata.id, ownerId), metadata);
    return { id: metadata.id, ownerId, path: metadata.storage_path, size: bytes.length, sha256: metadata.exif.zxfirmwares.sha256 };
  }
  function metadata(project, id, name, size, mime, sha256, role, ownerId) {
    return { id, owner_id: ownerId, kind: 'document', name, title: `[ZXFirmwares / ${project.title}] ${name}`,
      description: 'Private project asset; deleting it in Invisible Support can break the project snapshot.', alt: '', mime_type: mime || 'application/octet-stream', size_bytes: size,
      storage_path: objectPath(ownerId, id), exif: { zxfirmwares: { schema: 'ZXF-ASSET-1', projectId: project.id, projectMetadataId: project.metadataId, role, sha256 } } };
  }
  async function storeBlob(project, blob, artifacts, ownerId) {
    if (!/^project_[a-f0-9-]{36}$/.test(project.metadataId) || !hashPattern.test(blob.id)) throw Error('Invalid project/blob identity');
    const bytes = blob.bytes ? new Uint8Array(await blob.bytes.arrayBuffer()) : Uint8Array.from(atob(blob.data), c => c.charCodeAt(0));
    if (bytes.length !== blob.size || bytes.length > 16 * 1024 * 1024 || await digest(bytes) !== blob.id) throw Error('Original file checksum/size failed before upload');
    const a = artifacts.find(a => a.sha256 === blob.id); if (!a) throw Error('Unreferenced upload blob');
    const id = `zxf-blob-${ownerId}_${project.metadataId.slice(8)}_${blob.id}`;
    return putVerified(bytes, metadata(project, id, a.name, bytes.length, a.mime, blob.id, 'file', ownerId), ownerId);
  }
  async function uploadFiles(project, files, onProgress = () => {}) {
    const owner = await user();
    if (project.cloud?.ownerId && project.cloud.ownerId !== owner.id) throw Error('Sign in as this project’s Invisible Support owner');
    const refs = []; let i = 0;
    for (const blob of files.blobs) { onProgress({ done: i, total: files.blobs.length, name: files.artifacts.find(a => a.sha256 === blob.id)?.name || blob.id }); refs.push(await storeBlob(project, blob, files.artifacts, owner.id)); i++; }
    onProgress({ done: i, total: i, name: 'All original file bytes verified in private storage' });
    return { ownerId: owner.id, refs };
  }
  async function publishProject(input, onProgress = () => {}) {
    const { validateBackup } = await import('./os-library.js'); await validateBackup(input);
    const backup = structuredClone(input), { ownerId, refs } = await uploadFiles(backup.project, backup, onProgress);
    const id = 'zxf-project-' + ownerId + '_' + backup.backupId.slice(7), path = objectPath(ownerId, id);
    backup.project.cloud = { provider: 'invisible-support', ownerId, manifestAssetId: id, syncedAt: backup.exportedAt };
    const graph = structuredClone(backup); graph.blobs = graph.blobs.map(b => ({ id: b.id, size: b.size }));
    const manifest = { schema: 'ZX-OS-CLOUD-PROJECT-1', graph, refs };
    const bytes = new TextEncoder().encode(JSON.stringify(manifest)), sha256 = await digest(bytes);
    if (bytes.length > 8 * 1024 * 1024) throw Error('Project metadata snapshot exceeds 8 MiB');
    await putVerified(bytes, metadata(backup.project, id, 'ZXFirmwares-project.json', bytes.length, 'application/json', sha256, 'project', ownerId), ownerId);
    return backup;
  }
  async function listProjects() {
    const owner = await user(), rows = []; let truncated = true;
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await json(`/rest/v1/${SUPPORT.table}?owner_id=eq.${owner.id}&exif->zxfirmwares->>role=eq.project&exif->zxfirmwares->>schema=eq.ZXF-ASSET-1&select=*&order=created_at.desc,id.desc&limit=100&offset=${offset}`, { ownerId: owner.id, max: 8 * 1024 * 1024 });
      if (!Array.isArray(page)) throw Error('Invalid cloud project listing'); rows.push(...page); if (page.length < 100) { truncated = false; break; }
    }
    return { owner, rows, truncated };
  }
  async function restoreProject(assetId, onProgress = () => {}) {
    const owner = await user(), asset = await row(assetId, owner.id), info = asset?.exif?.zxfirmwares;
    if (info?.schema !== 'ZXF-ASSET-1' || info.role !== 'project' || asset.storage_path !== objectPath(owner.id, assetId) || asset.size_bytes > 8 * 1024 * 1024) throw Error('Not a private ZXFirmwares project snapshot');
    const bytes = await downloadPath(asset.storage_path, owner.id, Number(asset.size_bytes), info.sha256);
    const document = JSON.parse(new TextDecoder().decode(bytes)), { graph, refs } = document;
    if (document.schema !== 'ZX-OS-CLOUD-PROJECT-1' || !Array.isArray(refs) || !Array.isArray(graph?.blobs) || refs.length !== graph.blobs.length || refs.length > 4800 || graph.project?.id !== info.projectId || graph.project?.metadataId !== info.projectMetadataId || graph.project?.cloud?.ownerId !== owner.id) throw Error('Cloud project manifest ownership/schema mismatch');
    const seen = new Set(); let total = 0, i = 0;
    for (const blob of graph.blobs) {
      const matches = refs.filter(r => r.sha256 === blob.id); if (matches.length !== 1 || seen.has(blob.id)) throw Error('Duplicate/missing cloud blob reference'); seen.add(blob.id);
      const ref = matches[0], expected = `zxf-blob-${owner.id}_${info.projectMetadataId.slice(8)}_${blob.id}`;
      if (ref.ownerId !== owner.id || ref.id !== expected || ref.path !== objectPath(owner.id, expected) || ref.size !== blob.size || blob.size > 16 * 1024 * 1024 || blob.size < 0 || (total += blob.size) > 64 * 1024 * 1024) throw Error('Cross-owner cloud reference or payload limit');
      onProgress({ done: i++, total: graph.blobs.length, name: graph.artifacts?.find(a => a.sha256 === blob.id)?.name || blob.id });
      const raw = await downloadPath(ref.path, owner.id, ref.size, ref.sha256);
      const { toBase64 } = await import('./os-library.js'); blob.data = toBase64(raw);
    }
    const { validateBackup } = await import('./os-library.js'); await validateBackup(graph);
    onProgress({ done: i, total: i, name: 'Cloud snapshot and every original file verified' }); return graph;
  }
  function signedUrl(value,ownerId,assetId){
    const url=new URL(value.startsWith('/')?(value.startsWith('/storage/v1/')?SUPPORT.url:SUPPORT.url+'/storage/v1')+value:value);
    if(url.origin!==SUPPORT.url||url.username||url.password||url.pathname!=='/storage/v1/object/sign/'+SUPPORT.bucket+'/'+encodePath(objectPath(ownerId,assetId))||!url.searchParams.get('token')||url.href.length>8192)throw Error('Invalid project access link');return url.href;
  }
  async function createReadLink(input,{expiresIn=31536000}={}){
    const {validateBackup}=await import('./os-library.js');await validateBackup(input);if(!Number.isInteger(expiresIn)||expiresIn<60||expiresIn>31536000)throw Error('Invalid access-link lifetime');
    const owner=await user(),graph=structuredClone(input);if(graph.project.cloud?.ownerId!==owner.id)throw Error('Project account mismatch');
    const refs=graph.blobs.map(b=>{const id=`zxf-blob-${owner.id}_${graph.project.metadataId.slice(8)}_${b.id}`;return{id,ownerId:owner.id,path:objectPath(owner.id,id),size:b.size,sha256:b.id};});
    const signed=await json('/storage/v1/object/sign/'+SUPPORT.bucket,{ownerId:owner.id,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn,paths:refs.map(r=>r.path)})});
    if(!Array.isArray(signed)||signed.length!==refs.length)throw Error('File access-link count mismatch');
    for(const ref of refs){const matches=signed.filter(s=>s.path===ref.path);if(matches.length!==1||matches[0].error)throw Error('File access-link creation failed');ref.signedUrl=signedUrl(matches[0].signedURL||matches[0].signedUrl,owner.id,ref.id);}
    graph.blobs=graph.blobs.map(b=>({id:b.id,size:b.size}));const expiresAt=new Date(Date.now()+expiresIn*1000).toISOString(),document={schema:'ZX-OS-SHARED-PROJECT-1',graph,refs,expiresAt};
    const bytes=new TextEncoder().encode(JSON.stringify(document));if(bytes.length>8*1024*1024)throw Error('Shared project metadata exceeds8MiB');
    const id='zxf-share-'+owner.id+'_'+crypto.randomUUID(),sha256=await digest(bytes);await putVerified(bytes,metadata(graph.project,id,'ZXFirmwares-project-share.json',bytes.length,'application/json',sha256,'share',owner.id),owner.id);
    const link=await json('/storage/v1/object/sign/'+SUPPORT.bucket+'/'+encodePath(objectPath(owner.id,id)),{ownerId:owner.id,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn})});
    return{url:signedUrl(link.signedURL||link.signedUrl,owner.id,id),expiresAt,assetId:id,projectId:graph.project.id,ownerId:owner.id};
  }
  async function restoreReadLink(value,onProgress=()=>{}){
    const parsed=new URL(value),parts=parsed.pathname.split('/').filter(Boolean),ownerId=parts[5],assetId=parts[7];if(parts.length!==9||!assetId?.startsWith('zxf-share-'+ownerId+'_'))throw Error('Invalid shared project path');
    const url=signedUrl(value,ownerId,assetId);
    async function fetchSigned(url,max){const r=await fetchImpl(url,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Project access HTTP '+r.status);return boundedBytes(r,max);}
    const document=JSON.parse(new TextDecoder().decode(await fetchSigned(url,8*1024*1024))),{graph,refs}=document;
    if(document.schema!=='ZX-OS-SHARED-PROJECT-1'||!Array.isArray(graph?.blobs)||!Array.isArray(refs)||refs.length!==graph.blobs.length||refs.length>4800||graph.project?.cloud?.ownerId!==ownerId||!Number.isFinite(Date.parse(document.expiresAt)))throw Error('Shared project metadata mismatch');
    const {metadataId,validateBackup,toBase64}=await import('./os-library.js');metadataId(graph.project.metadataId,'project');const seen=new Set();let total=0,i=0;
    for(const blob of graph.blobs){const matches=refs.filter(r=>r.sha256===blob.id);if(matches.length!==1||seen.has(blob.id)||!hashPattern.test(blob.id)||!Number.isSafeInteger(blob.size)||blob.size<0||blob.size>16*1024*1024||(total+=blob.size)>64*1024*1024)throw Error('Shared file identity/limit mismatch');seen.add(blob.id);const ref=matches[0],id=`zxf-blob-${ownerId}_${graph.project.metadataId.slice(8)}_${blob.id}`;
      if(ref.ownerId!==ownerId||ref.id!==id||ref.path!==objectPath(ownerId,id)||ref.size!==blob.size)throw Error('Shared file ownership mismatch');onProgress({done:i,total:refs.length,name:graph.artifacts?.find(a=>a.sha256===blob.id)?.name||blob.id});
      const bytes=await fetchSigned(signedUrl(ref.signedUrl,ownerId,id),blob.size);if(bytes.length!==blob.size||await digest(bytes)!==blob.id)throw Error('Shared original checksum failed');blob.data=toBase64(bytes);i++;
    }
    graph.project.sourceCloud={...graph.project.cloud,access:'shared-snapshot',expiresAt:document.expiresAt};delete graph.project.cloud;await validateBackup(graph);onProgress({done:i,total:i,name:'Project verified'});return graph;
  }
  return { user, uploadFiles, publishProject, listProjects, restoreProject, createReadLink, restoreReadLink };
}
export const supportStorage = createSupportStorage();
