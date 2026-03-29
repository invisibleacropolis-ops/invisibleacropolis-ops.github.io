/**
 * @fileoverview Image upload form controller with drag-and-drop.
 * Handles image file validation, upload progress, and batch processing.
 */

import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as StorageManager from '../../shared/services/storage-manager.js';
import * as ImageStore from './store.js';
import * as ImageViewer from './viewer.js';
import * as ImageGallery from './gallery.js';

const MAX_IMAGE_DIMENSION = 8192;
let initialized = false;
let form = null;
let fileInput = null;
let titleInput = null;
let altInput = null;
let progressContainer = null;
let progressBar = null;
let progressFill = null;
let progressLabel = null;
let feedback = null;
let dropzone = null;

function resetFeedback() { Notifications.inline(feedback, ''); }
function showFeedback(message, tone) { Notifications.inline(feedback, message, tone); }

function hideProgress() {
    if (!progressContainer || !progressFill || !progressLabel || !progressBar) return;
    progressContainer.hidden = true;
    progressFill.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressLabel.textContent = t('upload.waitingImages');
}

function updateProgress(percent, label) {
    if (!progressContainer || !progressFill || !progressLabel || !progressBar) return;
    const clamped = Math.max(0, Math.min(100, percent));
    progressContainer.hidden = false;
    progressFill.style.width = `${clamped}%`;
    progressBar.setAttribute('aria-valuenow', String(Math.round(clamped)));
    if (label) progressLabel.textContent = label;
}

function describeError(file, error) {
    const fileName = file?.name ?? t('common.unknownFile');
    switch (error?.code) {
        case 'config': return t('upload.errorMissingConfiguration');
        case 'type': return t('upload.errorUnsupportedImage', { name: fileName });
        case 'max-dimensions': return t('upload.errorImageTooLarge', { name: fileName, limit: MAX_IMAGE_DIMENSION });
        case 'dimensions': return t('upload.errorImageDimensions', { name: fileName });
        case 'quota': return t('notifications.storageQuotaExceeded');
        case 'persist': return t('errors.persistFailure');
        default: return t('upload.errorUploadFailed', { name: fileName });
    }
}

async function processFiles(fileList) {
    const files = Array.from(fileList ?? []).filter(f => f instanceof File);
    if (!files.length) { const msg = t('upload.errorSelectImages'); showFeedback(msg, 'error'); Notifications.toast(msg, 'error'); return; }

    resetFeedback();
    let lastImage = null;
    const baseTitle = titleInput?.value.trim() ?? '';
    const baseAlt = altInput?.value.trim() ?? '';
    let warnedLarge = false;

    for (const [index, file] of files.entries()) {
        const impact = StorageManager.estimateImpact(file.size);
        const snap = StorageManager.getSnapshot();
        if (!StorageManager.canStore(impact)) { const msg = t('notifications.storageQuotaExceeded'); showFeedback(msg, 'error'); Notifications.toast(msg, 'error'); hideProgress(); return; }
        const ratio = snap.limit ? Math.round(((snap.used + impact) / snap.limit) * 100) : 100;
        if (!warnedLarge && ratio >= 85) { Notifications.toast(t('notifications.largeFileWarning'), 'info'); warnedLarge = true; }
        updateProgress((index / files.length) * 100, t('upload.validating', { name: file.name }));
        try {
            const rec = await ImageStore.createImage(file, {
                title: baseTitle ? (files.length > 1 ? `${baseTitle} (${index + 1})` : baseTitle) : undefined,
                alt: baseAlt ? (files.length > 1 ? `${baseAlt} (${index + 1})` : baseAlt) : undefined,
            }, p => updateProgress(((index + p) / files.length) * 100, t('upload.progress', { name: file.name, percent: Math.round(p * 100) })));
            lastImage = rec;
        } catch (err) { console.error('Image upload failed', err); const msg = describeError(file, err); showFeedback(msg, 'error'); Notifications.toast(msg, 'error'); hideProgress(); return; }
    }

    const summary = files.length > 1 ? t('upload.summaryImagesMultiple', { count: files.length }) : t('upload.summaryImagesSingle', { name: files[0]?.name ?? t('common.unknownFile') });
    updateProgress(100, summary);
    showFeedback(t('upload.completeImages'), 'success');
    Notifications.toast(t('notifications.imageUploadSuccess'), 'success');
    form?.reset();
    if (fileInput) fileInput.value = '';
    setTimeout(() => hideProgress(), 600);
    if (lastImage) { ImageViewer?.selectImage?.(lastImage.id); setTimeout(() => ImageGallery?.focusItem?.(lastImage.id), 0); }
}

export function init() {
    if (initialized) return;
    form = document.querySelector('[data-image-form]');
    if (!form) return;
    fileInput = form.querySelector('[data-image-file-input]');
    titleInput = form.querySelector('[data-image-title]');
    altInput = form.querySelector('[data-image-alt]');
    progressContainer = form.querySelector('[data-image-progress]');
    progressBar = progressContainer?.querySelector('[data-image-progress-bar]');
    progressFill = form.querySelector('[data-image-progress-fill]');
    progressLabel = form.querySelector('[data-image-progress-label]');
    feedback = form.querySelector('[data-image-feedback]');
    dropzone = form.querySelector('[data-image-dropzone]');

    form.addEventListener('submit', e => { e.preventDefault(); processFiles(fileInput?.files ?? []); });
    form.addEventListener('reset', () => { hideProgress(); resetFeedback(); });
    fileInput?.addEventListener('change', () => resetFeedback());

    if (dropzone) {
        ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('is-dragover'); }));
        ['dragleave', 'dragend'].forEach(ev => dropzone.addEventListener(ev, () => dropzone.classList.remove('is-dragover')));
        dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('is-dragover'); if (e.dataTransfer?.files?.length) processFiles(e.dataTransfer.files); });
    }
    initialized = true;
}

export default { init };
