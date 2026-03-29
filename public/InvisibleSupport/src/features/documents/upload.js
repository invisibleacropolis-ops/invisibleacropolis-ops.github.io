/**
 * @fileoverview Document upload form controller with queue and drag-and-drop.
 * Handles document file validation, upload progress, queue management.
 */

import * as Utils from '../../shared/utils.js';
import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as StorageManager from '../../shared/services/storage-manager.js';
import * as DocumentStore from './store.js';
import * as DocumentViewer from './viewer.js';
import * as LibraryView from './library-view.js';

let initialized = false;
let form = null;
let fileInput = null;
let titleInput = null;
let descriptionInput = null;
let progressContainer = null;
let progressBar = null;
let progressFill = null;
let progressLabel = null;
let feedback = null;
let dropzone = null;
let queueContainer = null;
let queueList = null;
let queueSummary = null;
let queueEmpty = null;
let queueClear = null;

const pendingFiles = [];
const pendingKeys = new Set();
let isUploading = false;

function buildFileKey(file) { return `${file.name}::${file.size}::${file.lastModified}`; }
function getTotalSize() { return pendingFiles.reduce((sum, f) => sum + (Number(f?.size) || 0), 0); }
function resetFeedback() { Notifications.inline(feedback, ''); }
function showFeedback(message, tone) { Notifications.inline(feedback, message, tone); }

function hideProgress() {
    if (!progressContainer || !progressFill || !progressLabel || !progressBar) return;
    progressContainer.hidden = true; progressFill.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressLabel.textContent = t('upload.waitingDocuments');
}

function updateProgress(percent, label) {
    if (!progressContainer || !progressFill || !progressLabel || !progressBar) return;
    const clamped = Math.max(0, Math.min(100, percent));
    progressContainer.hidden = false; progressFill.style.width = `${clamped}%`;
    progressBar.setAttribute('aria-valuenow', String(Math.round(clamped)));
    if (label) progressLabel.textContent = label;
}

function renderQueue() {
    if (!queueContainer || !queueList) return;
    queueList.textContent = '';
    const hasFiles = pendingFiles.length > 0;
    queueContainer.hidden = !hasFiles;
    if (queueClear) queueClear.disabled = !hasFiles || isUploading;
    if (queueEmpty) queueEmpty.hidden = hasFiles;
    if (!hasFiles) {
        if (queueSummary) { queueSummary.hidden = true; queueSummary.textContent = ''; }
        if (progressLabel && (progressContainer?.hidden ?? true)) progressLabel.textContent = t('upload.waitingDocuments');
        return;
    }
    const sizeText = Utils.formatBytes(getTotalSize());
    if (queueSummary) {
        const summary = pendingFiles.length === 1 ? t('upload.queueSummarySingle', { name: pendingFiles[0].name, size: sizeText }) : t('upload.queueSummaryMultiple', { count: pendingFiles.length, size: sizeText });
        queueSummary.hidden = false; queueSummary.textContent = summary;
        if (progressLabel && (progressContainer?.hidden ?? false) && !isUploading) progressLabel.textContent = summary;
    }
    pendingFiles.forEach(file => {
        const key = buildFileKey(file);
        const item = document.createElement('li'); item.className = 'upload-card__queue-item'; item.dataset.key = key;
        const details = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = file.name;
        const meta = document.createElement('p'); meta.className = 'upload-card__queue-meta'; meta.textContent = Utils.formatBytes(file.size);
        details.append(title, meta);
        const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.className = 'upload-card__queue-remove';
        removeBtn.dataset.queueRemove = key; removeBtn.textContent = t('common.remove'); removeBtn.disabled = isUploading;
        item.append(details, removeBtn);
        queueList.appendChild(item);
    });
}

function clearQueue() { pendingFiles.splice(0); pendingKeys.clear(); if (fileInput) fileInput.value = ''; renderQueue(); }
function removeFromQueue(key) { if (!key) return; const i = pendingFiles.findIndex(f => buildFileKey(f) === key); if (i === -1) return; pendingFiles.splice(i, 1); pendingKeys.delete(key); renderQueue(); }
function addFiles(fileList) { const files = Array.from(fileList ?? []).filter(f => f instanceof File); if (!files.length) return 0; let added = 0; files.forEach(f => { const k = buildFileKey(f); if (pendingKeys.has(k)) return; pendingKeys.add(k); pendingFiles.push(f); added++; }); if (added > 0) renderQueue(); return added; }

async function processFiles(fileList) {
    const files = Array.from(fileList ?? []).filter(f => f instanceof File);
    if (!files.length) { const msg = t('upload.errorSelectDocuments'); showFeedback(msg, 'error'); Notifications.toast(msg, 'error'); return; }
    resetFeedback(); isUploading = true; renderQueue();
    let lastDoc = null; const baseTitle = titleInput?.value.trim() ?? ''; const desc = descriptionInput?.value.trim() ?? ''; let warnedLarge = false;
    try {
        for (const [i, file] of files.entries()) {
            const impact = StorageManager.estimateImpact(file.size);
            const snap = StorageManager.getSnapshot();
            if (!StorageManager.canStore(impact)) { const msg = t('notifications.storageQuotaExceeded'); showFeedback(msg, 'error'); Notifications.toast(msg, 'error'); hideProgress(); return; }
            const ratio = snap.limit ? Math.round(((snap.used + impact) / snap.limit) * 100) : 100;
            if (!warnedLarge && ratio >= 85) { Notifications.toast(t('notifications.largeFileWarning'), 'info'); warnedLarge = true; }
            updateProgress((i / files.length) * 100, t('upload.progress', { name: file.name, percent: 0 }));
            try {
                const rec = await DocumentStore.createDocument(file, { title: baseTitle ? (files.length > 1 ? `${baseTitle} (${i + 1})` : baseTitle) : undefined, description: desc }, p => updateProgress(((i + p) / files.length) * 100, t('upload.progress', { name: file.name, percent: Math.round(p * 100) })));
                lastDoc = rec;
            } catch (err) { console.error('Upload failed', err); const msg = err?.code === 'config' ? t('upload.errorMissingConfiguration') : err?.code === 'quota' ? t('notifications.storageQuotaExceeded') : err?.code === 'persist' ? t('errors.persistFailure') : t('upload.errorUploadFailed', { name: file?.name ?? t('common.unknownFile') }); showFeedback(msg, 'error'); Notifications.toast(msg, 'error'); hideProgress(); return; }
        }
        const summary = files.length > 1 ? t('upload.summaryDocumentsMultiple', { count: files.length }) : t('upload.summaryDocumentsSingle', { name: files[0]?.name ?? t('common.unknownFile') });
        updateProgress(100, summary); showFeedback(t('upload.complete'), 'success'); Notifications.toast(t('notifications.documentUploadSuccess'), 'success');
        form?.reset(); clearQueue();
        setTimeout(() => hideProgress(), 600);
        if (lastDoc) { DocumentViewer?.selectDocument?.(lastDoc.id); setTimeout(() => LibraryView?.focusRow?.(lastDoc.id), 0); }
    } finally { isUploading = false; renderQueue(); }
}

export function init() {
    if (initialized) return;
    form = document.getElementById('document-upload-form');
    if (!form) return;
    fileInput = form.querySelector('[data-file-input]');
    titleInput = form.querySelector('[data-title-input]');
    descriptionInput = form.querySelector('[data-description-input]');
    progressContainer = form.querySelector('[data-upload-progress]');
    progressBar = progressContainer?.querySelector('.upload-progress__bar');
    progressFill = form.querySelector('[data-progress-fill]');
    progressLabel = form.querySelector('[data-progress-label]');
    feedback = form.querySelector('[data-upload-feedback]');
    dropzone = form.querySelector('[data-dropzone]');
    queueContainer = form.querySelector('[data-upload-queue]');
    queueList = form.querySelector('[data-queue-list]');
    queueSummary = form.querySelector('[data-queue-summary]');
    queueEmpty = form.querySelector('[data-queue-empty]');
    queueClear = form.querySelector('[data-queue-clear]');

    form.addEventListener('submit', e => { e.preventDefault(); const files = pendingFiles.length > 0 ? pendingFiles : Array.from(fileInput?.files ?? []); processFiles(files); });
    form.addEventListener('reset', () => { hideProgress(); resetFeedback(); clearQueue(); });
    fileInput?.addEventListener('change', () => { resetFeedback(); addFiles(fileInput?.files ?? []); });
    queueClear?.addEventListener('click', () => { if (!isUploading) clearQueue(); });
    queueList?.addEventListener('click', e => { const btn = e.target.closest('[data-queue-remove]'); if (btn && !isUploading) removeFromQueue(btn.dataset.queueRemove); });

    if (dropzone) {
        ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
        ['dragleave', 'dragend'].forEach(ev => dropzone.addEventListener(ev, () => dropzone.classList.remove('is-dragover')));
        dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('is-dragover'); if (e.dataTransfer?.files?.length) { addFiles(e.dataTransfer.files); if (pendingFiles.length > 0) processFiles(pendingFiles); } });
    }
    initialized = true;
}

export default { init };
