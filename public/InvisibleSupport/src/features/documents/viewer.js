/**
 * @fileoverview Document viewer component for previewing documents.
 * Supports PDF, DOCX, Office files, text, images, video, and audio.
 */

import * as Utils from '../../shared/utils.js';
import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as GitHubIntegration from '../../shared/services/github.js';
import * as DocumentStore from './store.js';

// Configuration
const ADOBE_EMBED_CLIENT_ID = 'd6b613e7ac104dc49aae04788ff781df';
const MAMMOTH_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
const TEXT_CHAR_LIMIT = 100000;

// Script loading state
let adobeSdkPromise = null;
let mammothPromise = null;
const scriptPromises = new Map();

// DOM elements (initialized on init)
let preview = null;
let meta = null;
let linkInput = null;
let openLink = null;
let copyButton = null;
let nameEl = null;
let filenameEl = null;
let typeEl = null;
let sizeEl = null;
let updatedEl = null;
let descriptionEl = null;
let selectInput = null;
let emptyTemplate = null;

// State
const previewCache = new Map();
let currentId = null;
let renderToken = 0;
let initialized = false;

// MIME type sets
const OFFICE_MIME_TYPES = new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'dotx', 'ppt', 'pptx', 'pps', 'ppsx', 'xls', 'xlsx']);
const TEXT_MIME_TYPES = new Set(['application/json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/csv']);
const TEXT_EXTENSIONS = new Set(['txt', 'log', 'md', 'json', 'csv', 'yml', 'yaml', 'xml', 'ini', 'conf']);

// Helper functions
function getExtension(name) {
    if (!name) return '';
    const parts = String(name).toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() ?? '' : '';
}

function getDocumentUrl(doc) {
    if (!doc) return '';
    return doc.blobUrl || doc.downloadUrl || '';
}

function sanitizeForId(value) {
    if (!value) return 'document';
    const cleaned = String(value).replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || 'document';
}

function createPdfContainerId(doc) {
    return `pdf-viewer-${sanitizeForId(doc?.id)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadScriptOnce(src) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => { script.remove(); resolve(); };
        script.onerror = () => { script.remove(); scriptPromises.delete(src); reject(new Error(`Failed to load: ${src}`)); };
        document.head.appendChild(script);
    });
    scriptPromises.set(src, promise);
    return promise;
}

function waitForAdobeSdk() {
    if (window.AdobeDC?.View) return Promise.resolve(window.AdobeDC);
    if (!adobeSdkPromise) {
        adobeSdkPromise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => { adobeSdkPromise = null; reject(new Error('Adobe SDK timeout')); }, 10000);
            const onReady = () => { clearTimeout(timeoutId); resolve(window.AdobeDC); };
            const prev = document.adobe_dc_view_sdk_ready;
            document.adobe_dc_view_sdk_ready = () => { if (typeof prev === 'function') prev(); onReady(); };
        });
    }
    return adobeSdkPromise;
}

function waitForMammoth() {
    if (window.mammoth?.convertToHtml) return Promise.resolve(window.mammoth);
    if (!mammothPromise) {
        mammothPromise = loadScriptOnce(MAMMOTH_SCRIPT_URL)
            .then(() => window.mammoth?.convertToHtml ? window.mammoth : Promise.reject(new Error('Mammoth init failed')))
            .catch(e => { mammothPromise = null; throw e; });
    }
    return mammothPromise;
}

function createViewerFallback(doc, message) {
    const fallback = document.createElement('div');
    fallback.className = 'viewer-card__fallback';
    fallback.innerHTML = `<h3>Preview unavailable</h3><p class="portal__lede" style="font-size:0.95rem">${message || `This file type (${doc?.type || 'unknown'}) cannot be previewed inline.`}</p>`;
    return fallback;
}

// Type detection
function isPdf(type, ext) { return type === 'application/pdf' || ext === 'pdf'; }
function isOfficeDocument(type, ext) { return OFFICE_MIME_TYPES.has(type) || OFFICE_EXTENSIONS.has(ext); }
function isTextDocument(type, ext) { return type.startsWith('text/') || TEXT_MIME_TYPES.has(type) || TEXT_EXTENSIONS.has(ext); }
function isImage(type) { return type.startsWith('image/'); }
function isVideo(type) { return type.startsWith('video/'); }
function isAudio(type) { return type.startsWith('audio/'); }

// Preview caching
async function fetchDocumentResource(doc) {
    if (!doc) return null;
    const url = getDocumentUrl(doc);
    const revision = String(doc.sha || doc.updatedAt || '');
    const cached = previewCache.get(doc.id);
    if (cached && cached.revision === revision) return cached;
    if (cached) { cached.dispose?.(); previewCache.delete(doc.id); }

    const useExisting = url?.startsWith('blob:');
    const fallbackType = doc.type || 'application/octet-stream';

    async function cacheFromBlob(blob) {
        if (!blob) return null;
        const objectUrl = useExisting ? url : URL.createObjectURL(blob);
        const resource = { url: objectUrl, type: blob.type || fallbackType, blob, revision, dispose: useExisting ? null : () => URL.revokeObjectURL(objectUrl) };
        previewCache.set(doc.id, resource);
        return resource;
    }

    if (url) {
        try {
            const res = await fetch(url);
            if (res.ok) return cacheFromBlob(await res.blob());
        } catch (e) { console.warn('Fetch failed', e); }
    }

    if (doc.repoPath && GitHubIntegration?.downloadFile) {
        try {
            const { arrayBuffer, contentType } = await GitHubIntegration.downloadFile(doc.repoPath);
            return cacheFromBlob(new Blob([arrayBuffer], { type: contentType || fallbackType }));
        } catch (e) { console.warn('GitHub download failed', e); }
    }
    return null;
}

// Rendering
function focusPreview() { if (preview) { preview.setAttribute('tabindex', '-1'); preview.focus({ preventScroll: true }); } }
function emitSelectionChange() { document.dispatchEvent(new CustomEvent('documentviewerchange', { detail: { id: currentId } })); }

function updateSelectValue(id) {
    if (!selectInput) return;
    selectInput.value = id && Array.from(selectInput.options).find(o => o.value === id) ? id : '';
}

function updateSelectOptions(docs) {
    if (!selectInput) return;
    const frag = document.createDocumentFragment();
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = docs.length ? 'Select a document…' : 'No documents uploaded yet'; frag.appendChild(ph);
    docs.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.title || d.name; frag.appendChild(o); });
    selectInput.replaceChildren(frag);
    selectInput.disabled = docs.length === 0;
    if (currentId && docs.some(d => d.id === currentId)) selectInput.value = currentId; else selectInput.value = '';
}

function cleanupCache(validIds) { previewCache.forEach((e, id) => { if (!validIds.has(id)) { e.dispose?.(); previewCache.delete(id); } }); }
function renderLoading() { if (!preview) return; preview.innerHTML = ''; preview.dataset.state = 'loading'; const l = document.createElement('div'); l.className = 'viewer-card__loading'; l.textContent = 'Loading preview…'; preview.appendChild(l); }

function resetMeta() {
    if (meta) meta.hidden = true;
    [nameEl, filenameEl, typeEl, sizeEl, updatedEl].forEach(el => { if (el) el.textContent = '—'; });
    if (descriptionEl) { descriptionEl.hidden = true; descriptionEl.textContent = ''; }
    if (linkInput) linkInput.value = '';
    if (copyButton) copyButton.setAttribute('data-copy', '');
    if (openLink) { openLink.href = '#'; openLink.setAttribute('aria-disabled', 'true'); }
}

function updateMeta(doc) {
    const docUrl = getDocumentUrl(doc);
    if (meta) meta.hidden = false;
    if (nameEl) nameEl.textContent = doc.title || doc.name;
    if (filenameEl) filenameEl.textContent = doc.name;
    if (typeEl) typeEl.textContent = doc.type || 'Unknown';
    if (sizeEl) sizeEl.textContent = Utils.formatBytes(doc.size);
    if (updatedEl) updatedEl.textContent = Utils.formatRelativeTime(doc.updatedAt);
    if (descriptionEl) { descriptionEl.hidden = !doc.description; descriptionEl.textContent = doc.description || ''; }
    if (linkInput) linkInput.value = docUrl;
    if (copyButton) copyButton.setAttribute('data-copy', docUrl);
    if (openLink) { openLink.href = docUrl || '#'; if (docUrl) openLink.removeAttribute('aria-disabled'); else openLink.setAttribute('aria-disabled', 'true'); }
}

async function copyCurrentLink() {
    const doc = currentId ? DocumentStore.getDocument(currentId) : null;
    const link = getDocumentUrl(doc) || linkInput?.value || '';
    if (!link) {
        return;
    }

    const copied = await Utils.copyToClipboard(link);
    Notifications.toast(
        copied ? t('common.copySuccess') : t('common.copyFailure'),
        copied ? 'success' : 'error'
    );
}

async function buildPreviewContent(doc) {
    const type = (doc.type || '').toLowerCase();
    const ext = getExtension(doc.name);
    const displayName = doc.title || doc.name;
    const directUrl = getDocumentUrl(doc);
    const pdfLocale = document.documentElement.lang || 'en-US';

    if (isPdf(type, ext)) {
        const res = await fetchDocumentResource(doc);
        if (res?.blob) {
            const container = document.createElement('div');
            container.className = 'viewer-card__pdf'; container.id = createPdfContainerId(doc);
            container.dataset.state = 'loading'; container.setAttribute('aria-busy', 'true');
            container.innerHTML = '<p class="viewer-card__pdf-message">Loading secure PDF preview…</p>';
            const bufPromise = res.blob.arrayBuffer();
            waitForAdobeSdk().then(() => bufPromise).then(buf => {
                if (!container.isConnected || currentId !== doc.id) return;
                container.textContent = ''; container.dataset.state = 'ready'; container.removeAttribute('aria-busy');
                new window.AdobeDC.View({ clientId: ADOBE_EMBED_CLIENT_ID, divId: container.id, locale: pdfLocale })
                    .previewFile({ content: { promise: Promise.resolve(buf) }, metaData: { fileName: doc.name, id: doc.id } }, { embedMode: 'FULL_WINDOW', showAnnotationTools: false, showDownloadPDF: true, showPrintPDF: true });
            }).catch(() => { if (container.isConnected && currentId === doc.id) container.replaceWith(createViewerFallback(doc, 'Unable to load PDF preview.')); });
            return container;
        }
    }

    if (isOfficeDocument(type, ext)) {
        const isDocx = ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (isDocx) {
            const res = await fetchDocumentResource(doc);
            if (res?.blob) {
                const container = document.createElement('div'); container.className = 'viewer-card__docx'; container.dataset.state = 'loading';
                container.innerHTML = '<p class="viewer-card__docx-message">Rendering document preview.</p>';
                const bufPromise = res.blob.arrayBuffer();
                Promise.all([waitForMammoth(), bufPromise]).then(([m, buf]) => {
                    if (!container.isConnected || currentId !== doc.id) return null;
                    return m.convertToHtml({ arrayBuffer: buf }, m.images?.inline ? { convertImage: m.images.inline(el => el.read('base64').then(b => ({ src: `data:${el.contentType};base64,${b}` }))) } : {});
                }).then(r => { if (!container.isConnected || currentId !== doc.id || !r) return; container.dataset.state = 'ready'; container.innerHTML = r.value || ''; })
                    .catch(() => { if (container.isConnected && currentId === doc.id) container.replaceWith(createViewerFallback(doc, 'Unable to load DOCX preview.')); });
                return container;
            }
        }
        if (directUrl) { const frame = document.createElement('iframe'); frame.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(directUrl)}`; frame.title = `${displayName} preview`; frame.loading = 'lazy'; return frame; }
    }

    if (isImage(type)) { const res = await fetchDocumentResource(doc); if (res?.url) { const img = document.createElement('img'); img.src = res.url; img.alt = displayName; img.loading = 'lazy'; return img; } }
    if (isVideo(type)) { const res = await fetchDocumentResource(doc); if (res?.url) { const v = document.createElement('video'); v.controls = true; v.src = res.url; v.preload = 'metadata'; return v; } }
    if (isAudio(type)) { const res = await fetchDocumentResource(doc); if (res?.url) { const a = document.createElement('audio'); a.controls = true; a.src = res.url; return a; } }
    if (isTextDocument(type, ext)) { const res = await fetchDocumentResource(doc); if (res?.blob) { try { const t = await res.blob.text(); const pre = document.createElement('pre'); pre.textContent = t.length > TEXT_CHAR_LIMIT ? t.slice(0, TEXT_CHAR_LIMIT) + '\n… (truncated)' : t; return pre; } catch (e) { console.warn('Text decode failed', e); } } }

    const res = await fetchDocumentResource(doc);
    if (res?.url) { const obj = document.createElement('object'); obj.data = res.url; obj.type = res.type || doc.type || 'application/octet-stream'; obj.className = 'viewer-card__object'; return obj; }
    return null;
}

function renderEmpty() {
    renderToken++; if (!preview) return;
    preview.innerHTML = ''; preview.dataset.state = 'empty';
    if (emptyTemplate) preview.appendChild(emptyTemplate.cloneNode(true));
    resetMeta(); updateSelectValue(null); currentId = null; emitSelectionChange(); focusPreview();
}

async function renderDocument(doc) {
    if (!preview) return;
    if (!doc) { renderEmpty(); return; }
    const token = ++renderToken; currentId = doc.id; updateSelectValue(doc.id); renderLoading();
    let content = null;
    try { content = await buildPreviewContent(doc); } catch (e) { console.error('Preview failed', e); }
    if (token !== renderToken || currentId !== doc.id) return;
    preview.innerHTML = ''; preview.dataset.state = 'ready';
    preview.appendChild(content || createViewerFallback(doc));
    updateMeta(doc); emitSelectionChange(); focusPreview();
}

export function init() {
    if (initialized) return;
    preview = document.querySelector('[data-viewer-preview]');
    meta = document.querySelector('[data-viewer-meta]');
    linkInput = document.querySelector('[data-viewer-link]');
    openLink = document.querySelector('[data-viewer-open]');
    copyButton = document.querySelector('[data-viewer-copy]');
    nameEl = document.querySelector('[data-viewer-name]');
    filenameEl = document.querySelector('[data-viewer-filename]');
    typeEl = document.querySelector('[data-viewer-type]');
    sizeEl = document.querySelector('[data-viewer-size]');
    updatedEl = document.querySelector('[data-viewer-updated]');
    descriptionEl = document.querySelector('[data-viewer-description]');
    selectInput = document.querySelector('[data-viewer-select]');
    emptyTemplate = preview?.querySelector('[data-viewer-empty]')?.cloneNode(true) ?? null;

    if (openLink) {
        openLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if (openLink.getAttribute('aria-disabled') === 'true') return;
            const doc = currentId ? DocumentStore.getDocument(currentId) : null;
            if (!doc) return;
            try {
                const res = await fetchDocumentResource(doc);
                if (res?.url) window.open(res.url, '_blank', 'noopener');
            } catch (err) {
                console.warn('Failed to open document in new tab', err);
            }
        });
    }

    if (copyButton) {
        copyButton.addEventListener('click', () => {
            void copyCurrentLink();
        });
    }

    selectInput?.addEventListener('change', e => {
        const id = e.target.value;
        if (!id) { renderEmpty(); return; }
        if (id === currentId) return;
        const doc = DocumentStore.getDocument(id);
        if (doc) renderDocument(doc); else renderEmpty();
    });

    DocumentStore.subscribe(docs => {
        updateSelectOptions(docs);
        cleanupCache(new Set(docs.map(d => d.id)));
        if (!currentId) { if (docs.length === 0) renderEmpty(); return; }
        const match = docs.find(d => d.id === currentId);
        if (!match) renderEmpty(); else renderDocument(match);
    });

    renderEmpty();
    initialized = true;
}

export function selectDocument(id) {
    if (!id) { renderEmpty(); return; }
    const doc = DocumentStore.getDocument(id);
    if (doc) renderDocument(doc); else renderEmpty();
}

export function getSelectedId() { return currentId; }

export default { init, selectDocument, getSelectedId };
