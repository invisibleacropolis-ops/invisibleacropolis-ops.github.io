/**
 * @fileoverview Image viewer component for displaying images with zoom and EXIF.
 * Supports zoom controls, fit modes, and EXIF metadata display.
 */

import * as Utils from '../../shared/utils.js';
import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as ImageStore from './store.js';
import * as GitHubIntegration from '../../shared/services/github.js';

let initialized = false;
let canvas = null;
let preview = null;
let emptyState = null;
let controls = null;
let fitButtons = [];
let zoomSlider = null;
let meta = null;
let nameEl = null;
let filenameEl = null;
let dimensionsEl = null;
let sizeEl = null;
let typeEl = null;
let altEl = null;
let takenEl = null;
let linkInput = null;
let openLink = null;
let copyButton = null;
let exifContainer = null;
let exifList = null;

let currentId = null;
let currentFit = 'contain';
let zoom = 100;
let currentOrientation = 1;

function focusCanvas() { if (canvas) { canvas.setAttribute('tabindex', '-1'); canvas.focus({ preventScroll: true }); } }
function emitSelectionChange() { document.dispatchEvent(new CustomEvent('imageviewerchange', { detail: { id: currentId } })); }

function resolveOrientationTransform(value) {
    switch (value) {
        case 2: return 'scaleX(-1)';
        case 3: return 'rotate(180deg)';
        case 4: return 'scaleY(-1)';
        case 5: return 'rotate(90deg) scaleX(-1)';
        case 6: return 'rotate(90deg)';
        case 7: return 'rotate(-90deg) scaleX(-1)';
        case 8: return 'rotate(-90deg)';
        default: return '';
    }
}

function applyTransform() {
    if (!preview) return;
    const scale = zoom / 100;
    const orient = resolveOrientationTransform(currentOrientation);
    preview.style.transform = orient ? `${orient} scale(${scale})` : `scale(${scale})`;
}

function setZoom(value) {
    const clamped = Math.max(25, Math.min(200, Number(value) || 100));
    zoom = clamped;
    if (zoomSlider && zoomSlider.value !== String(clamped)) zoomSlider.value = String(clamped);
    applyTransform();
}

function setFit(nextFit) {
    currentFit = nextFit;
    if (canvas) canvas.dataset.fit = nextFit;
    fitButtons.forEach(b => b.classList.toggle('is-active', b.dataset.imageFit === nextFit));
    applyTransform();
}

function clearMeta() {
    [nameEl, filenameEl, dimensionsEl, sizeEl, typeEl, altEl, takenEl].forEach(el => { if (el) el.textContent = '—'; });
    if (linkInput) linkInput.value = '';
    if (copyButton) copyButton.setAttribute('data-copy', '');
    if (openLink) { openLink.href = '#'; openLink.setAttribute('aria-disabled', 'true'); }
    if (exifList) exifList.textContent = '';
    if (exifContainer) exifContainer.hidden = true;
}

function getImageUrl(image) {
    if (!image) return '';
    return image.blobUrl || image.downloadUrl || '';
}

function renderExif(exif) {
    if (!exifList || !exifContainer) return;
    exifList.textContent = '';
    if (!exif || Object.keys(exif).length === 0) { exifContainer.hidden = true; return; }

    const fields = [
        ['Camera', [exif.make, exif.model].filter(Boolean).join(' ')],
        ['Lens', exif.lensModel],
        ['Aperture', exif.fNumber ? `f/${exif.fNumber}` : null],
        ['Shutter', exif.exposureTime ? `${exif.exposureTime}s` : null],
        ['ISO', exif.iso],
        ['Focal Length', exif.focalLength ? `${exif.focalLength}mm` : null],
        ['Focal Length (35mm)', exif.focalLength35mm ? `${exif.focalLength35mm}mm` : null],
        ['Software', exif.software],
    ];

    let hasAny = false;
    fields.forEach(([label, value]) => {
        if (!value) return;
        hasAny = true;
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = String(value);
        exifList.append(dt, dd);
    });
    exifContainer.hidden = !hasAny;
}

function renderEmpty() {
    currentId = null;
    currentOrientation = 1;
    zoom = 100;
    if (zoomSlider) zoomSlider.value = '100';
    if (preview) { preview.src = ''; preview.alt = ''; preview.hidden = true; preview.style.transform = ''; }
    if (emptyState) emptyState.hidden = false;
    if (controls) controls.hidden = true;
    if (meta) meta.hidden = true;
    clearMeta();
    setFit('contain');
    emitSelectionChange();
    focusCanvas();
}

function renderImage(image) {
    if (!image) { renderEmpty(); return; }
    currentId = image.id;
    currentOrientation = image.exif?.orientation ?? 1;
    if (zoomSlider) zoomSlider.value = '100';
    zoom = 100;

    if (preview) {
        const src = image.blobUrl || image.downloadUrl || '';
        if (src) preview.src = src;
        preview.alt = image.alt || image.title || image.name;
        preview.hidden = false;
    }
    if (emptyState) emptyState.hidden = true;
    if (controls) controls.hidden = false;
    if (meta) meta.hidden = false;
    setFit(currentFit || 'contain');

    if (nameEl) nameEl.textContent = image.title || image.name;
    if (filenameEl) filenameEl.textContent = image.name;
    if (dimensionsEl) dimensionsEl.textContent = image.width && image.height ? `${image.width} × ${image.height}px` : '—';
    if (sizeEl) sizeEl.textContent = Utils.formatBytes(image.size);
    if (typeEl) typeEl.textContent = image.type || 'Unknown';
    if (altEl) altEl.textContent = image.alt || '—';
    if (takenEl) {
        let label = '—';
        if (image.capturedAt) { const f = Utils.formatDateTime(image.capturedAt); label = f !== '—' ? f : image.capturedAt; }
        else if (image.exif?.dateTimeOriginal) label = image.exif.dateTimeOriginal.replace(/\0/g, '').trim();
        takenEl.textContent = label || '—';
    }

    const imageUrl = getImageUrl(image);
    if (linkInput) linkInput.value = imageUrl;
    if (copyButton) copyButton.setAttribute('data-copy', imageUrl);
    if (openLink) {
        openLink.href = imageUrl || '#';
        if (imageUrl) openLink.removeAttribute('aria-disabled'); else openLink.setAttribute('aria-disabled', 'true');
    }

    renderExif(image.exif);
    applyTransform();
    emitSelectionChange();
    focusCanvas();
}

async function copyCurrentLink() {
    try {
        const image = currentId ? ImageStore.getImage(currentId) : null;
        const link = getImageUrl(image) || linkInput?.value || '';
        if (!link) {
            Notifications.toast(t('common.copyFailure'), 'error');
            return;
        }

        const copied = await Utils.copyToClipboard(link);
        Notifications.toast(
            copied ? t('common.copySuccess') : t('common.copyFailure'),
            copied ? 'success' : 'error'
        );
    } catch (err) {
        console.warn('Copy failed', err);
        Notifications.toast(t('common.copyFailure'), 'error');
    }
}

export function init() {
    if (initialized) return;
    canvas = document.querySelector('[data-image-canvas]');
    preview = canvas?.querySelector('[data-image-preview]');
    emptyState = canvas?.querySelector('[data-image-empty]');
    controls = document.querySelector('[data-image-controls]');
    fitButtons = controls ? Array.from(controls.querySelectorAll('[data-image-fit]')) : [];
    zoomSlider = controls?.querySelector('[data-image-zoom]');
    meta = document.querySelector('[data-image-meta]');
    nameEl = document.querySelector('[data-image-name]');
    filenameEl = document.querySelector('[data-image-filename]');
    dimensionsEl = document.querySelector('[data-image-dimensions]');
    sizeEl = document.querySelector('[data-image-size]');
    typeEl = document.querySelector('[data-image-type]');
    altEl = document.querySelector('[data-image-alt]');
    takenEl = document.querySelector('[data-image-taken]');
    linkInput = document.querySelector('[data-image-link]');
    copyButton = document.querySelector('[data-image-copy]');
    openLink = document.querySelector('[data-image-open]');
    exifContainer = document.querySelector('[data-image-exif]');
    exifList = document.querySelector('[data-image-exif-list]');

    if (openLink) {
        openLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if (openLink.getAttribute('aria-disabled') === 'true') return;
            const image = currentId ? ImageStore.getImage(currentId) : null;
            if (!image) return;
            try {
                if (image.repoPath && GitHubIntegration.isConfigured()) {
                    const { arrayBuffer, contentType } = await GitHubIntegration.downloadFile(image.repoPath);
                    const blob = new Blob([arrayBuffer], { type: contentType || image.type || 'application/octet-stream' });
                    const blobUrl = URL.createObjectURL(blob);
                    window.open(blobUrl, '_blank', 'noopener');
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                } else {
                    const url = image.blobUrl || image.downloadUrl;
                    if (url) window.open(url, '_blank', 'noopener');
                }
            } catch (err) {
                console.warn('Failed to open image in new tab', err);
            }
        });
    }

    if (copyButton) {
        copyButton.addEventListener('click', () => {
            void copyCurrentLink();
        });
    }

    fitButtons.forEach(b => b.addEventListener('click', () => { const fit = b.dataset.imageFit; if (fit) setFit(fit); }));
    if (zoomSlider) {
        zoomSlider.addEventListener('input', e => setZoom(e.target.value));
        zoomSlider.addEventListener('change', e => setZoom(e.target.value));
    }

    ImageStore.subscribe(items => {
        if (!currentId) { if (items.length === 0) renderEmpty(); return; }
        const match = items.find(i => i.id === currentId);
        if (!match) renderEmpty(); else renderImage(match);
    });

    renderEmpty();
    initialized = true;
}

export function selectImage(id) {
    const image = ImageStore.getImage(id);
    if (image) renderImage(image); else renderEmpty();
}

export function getSelectedId() { return currentId; }

export default { init, selectImage, getSelectedId };
