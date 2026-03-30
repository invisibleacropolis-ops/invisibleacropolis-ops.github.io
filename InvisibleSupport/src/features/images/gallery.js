/**
 * @fileoverview Image gallery component for thumbnail grid/list display.
 * Supports grid/list view modes, search filtering, and lazy loading.
 */

import * as Utils from '../../shared/utils.js';
import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as ImageStore from './store.js';
import * as ImageViewer from './viewer.js';

let initialized = false;
let items = null;
let emptyState = null;
let searchInput = null;
let viewButtons = [];
let images = [];
let query = '';
let viewMode = 'grid';
let pendingFocusId = null;
let observer = null;

function getButtonSelector(id) {
    if (!id) return null;
    if (typeof CSS !== 'undefined' && CSS.escape) return `.image-gallery__thumb[data-id="${CSS.escape(id)}"]`;
    return `.image-gallery__thumb[data-id="${String(id).replace(/"/g, '\\"')}"]`;
}

export function focusItem(id) {
    const sel = getButtonSelector(id);
    if (!sel || !items) return;
    items.querySelector(sel)?.focus({ preventScroll: false });
}

function clearObserver() { observer?.disconnect(); }

function matches(image) {
    if (!query) return true;
    const value = query.toLowerCase();
    return [image.title, image.name, image.type, image.alt, image.exif?.make, image.exif?.model, image.exif?.lensModel]
        .filter(Boolean)
        .some(f => String(f).toLowerCase().includes(value));
}

function syncSelection() {
    const selectedId = ImageViewer?.getSelectedId?.();
    items?.querySelectorAll('.image-gallery__thumb').forEach(thumb => {
        thumb.classList.toggle('is-selected', thumb.dataset.id === selectedId);
        if (thumb.dataset.id === selectedId) thumb.setAttribute('aria-current', 'true');
        else thumb.removeAttribute('aria-current');
    });
}

function applyPendingFocus() {
    if (!pendingFocusId) return;
    if (pendingFocusId === 'search') searchInput?.focus({ preventScroll: false });
    else focusItem(pendingFocusId);
    pendingFocusId = null;
}

function render() {
    clearObserver();
    if (!items) return;
    items.textContent = '';
    const filtered = images.filter(matches);
    if (emptyState) emptyState.hidden = filtered.length > 0;
    items.classList.toggle('image-gallery__items--grid', viewMode === 'grid');
    items.classList.toggle('image-gallery__items--list', viewMode === 'list');
    if (filtered.length === 0) { syncSelection(); applyPendingFocus(); return; }

    filtered.forEach(image => {
        const li = document.createElement('li');
        li.className = 'image-gallery__item';

        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'image-gallery__thumb'; btn.dataset.id = image.id;
        const labelName = image.title || image.name || t('common.unknownFile');
        btn.setAttribute('aria-label', t('gallery.selectImage', { name: labelName }));

        const media = document.createElement('span');
        media.className = 'image-gallery__thumb-media';
        const img = document.createElement('img');
        img.alt = image.alt || image.title || image.name;
        img.decoding = 'async'; img.loading = 'lazy';
        const src = image.blobUrl || image.downloadUrl;
        if (src) { if (observer) { img.dataset.src = src; observer.observe(img); } else img.src = src; }
        media.appendChild(img);

        const meta = document.createElement('div');
        meta.className = 'image-gallery__thumb-meta';
        const title = document.createElement('span');
        title.className = 'image-gallery__meta-title'; title.textContent = image.title || image.name;
        const subtitle = document.createElement('span');
        subtitle.className = 'image-gallery__meta-subtitle'; subtitle.textContent = image.name;
        const extra = document.createElement('div');
        extra.className = 'image-gallery__thumb-extra';
        if (image.width && image.height) { const d = document.createElement('span'); d.textContent = `${image.width}×${image.height}px`; extra.appendChild(d); }
        if (image.size) { const s = document.createElement('span'); s.textContent = Utils.formatBytes(image.size); extra.appendChild(s); }
        meta.append(title, subtitle, extra);

        const actions = document.createElement('div');
        actions.className = 'image-gallery__thumb-actions';
        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'image-gallery__delete'; delBtn.textContent = t('common.remove');
        delBtn.addEventListener('click', e => {
            e.stopPropagation();
            const fallback = li.nextElementSibling?.querySelector('.image-gallery__thumb')?.dataset.id || li.previousElementSibling?.querySelector('.image-gallery__thumb')?.dataset.id || 'search';
            pendingFocusId = fallback;
            ImageStore.removeImage(image.id).then(() => Notifications.toast(t('notifications.imageRemoved'), 'info')).catch(err => { console.error('Delete failed', err); Notifications.toast(t('errors.persistFailure'), 'error'); });
        });
        actions.appendChild(delBtn);

        btn.append(media, meta, actions);
        btn.addEventListener('click', () => { ImageViewer?.selectImage?.(image.id); syncSelection(); });
        li.appendChild(btn);
        items.appendChild(li);
    });

    syncSelection();
    applyPendingFocus();
}

export function init() {
    if (initialized) return;
    items = document.querySelector('[data-image-gallery-items]');
    emptyState = document.querySelector('[data-image-gallery-empty]');
    searchInput = document.querySelector('[data-image-search]');
    viewButtons = Array.from(document.querySelectorAll('[data-image-view]'));

    if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(e => { if (!e.isIntersecting) return; const t = e.target; if (t.dataset.src) { t.src = t.dataset.src; t.removeAttribute('data-src'); } obs.unobserve(t); });
        }, { rootMargin: '120px', threshold: 0.1 });
    }

    ImageStore.subscribe(next => { images = next; render(); });

    viewButtons.forEach(b => b.addEventListener('click', () => {
        const next = b.dataset.imageView; if (!next) return;
        viewMode = next;
        viewButtons.forEach(t => t.classList.toggle('is-active', t.dataset.imageView === next));
        render();
    }));

    searchInput?.addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });

    items?.addEventListener('keydown', e => {
        const btn = e.target.closest('.image-gallery__thumb');
        if (!btn || e.target !== btn) return;
        const id = btn.dataset.id; if (!id) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ImageViewer?.selectImage?.(id); syncSelection(); }
        else if (e.key === 'Delete') {
            e.preventDefault();
            const li = btn.closest('li');
            pendingFocusId = li?.nextElementSibling?.querySelector('.image-gallery__thumb')?.dataset.id || li?.previousElementSibling?.querySelector('.image-gallery__thumb')?.dataset.id || 'search';
            ImageStore.removeImage(id).then(() => Notifications.toast(t('notifications.imageRemoved'), 'info')).catch(err => { console.error('Delete failed', err); Notifications.toast(t('errors.persistFailure'), 'error'); });
        }
    });

    document.addEventListener('imageviewerchange', () => syncSelection());
    initialized = true;
}

export default { init, focusItem };
