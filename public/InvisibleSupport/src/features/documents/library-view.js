/**
 * @fileoverview Library view component for document table display.
 * Shows filterable table of uploaded documents with actions.
 */

import * as Utils from '../../shared/utils.js';
import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as DocumentStore from './store.js';
import * as DocumentViewer from './viewer.js';

let initialized = false;
let rows = null;
let emptyState = null;
let searchInput = null;
let docs = [];
let query = '';
let pendingFocusTarget = null;

function matches(doc) {
    if (!query) return true;
    const value = query.toLowerCase();
    return [doc.title, doc.name, doc.type, doc.description]
        .filter(Boolean)
        .some(field => field.toLowerCase().includes(value));
}

function getRowSelector(id) {
    if (!id) return null;
    if (typeof CSS !== 'undefined' && CSS.escape) return `tr[data-id="${CSS.escape(id)}"]`;
    return `tr[data-id="${String(id).replace(/"/g, '\\"')}"]`;
}

export function focusRow(id) {
    const sel = getRowSelector(id);
    if (!rows || !sel) return;
    rows.querySelector(sel)?.focus({ preventScroll: false });
}

function markSelection(row, isSelected) {
    row.classList.toggle('is-selected', isSelected);
    if (isSelected) row.setAttribute('aria-selected', 'true');
    else row.removeAttribute('aria-selected');
}

function syncSelection() {
    const selectedIds = new Set();
    if (DocumentViewer?.getSelectedId) { const id = DocumentViewer.getSelectedId(); if (id) selectedIds.add(id); }
    rows?.querySelectorAll('tr[data-id]').forEach(row => markSelection(row, selectedIds.has(row.dataset.id)));
}

function applyPendingFocus() {
    if (!pendingFocusTarget) return;
    if (pendingFocusTarget === 'search') searchInput?.focus({ preventScroll: false });
    else focusRow(pendingFocusTarget);
    pendingFocusTarget = null;
}

function render() {
    if (!rows) return;
    rows.textContent = '';
    const filtered = docs.filter(matches);
    if (emptyState) emptyState.hidden = filtered.length > 0;
    if (filtered.length === 0) { applyPendingFocus(); return; }

    const selectedIds = new Set();
    if (DocumentViewer?.getSelectedId) { const id = DocumentViewer.getSelectedId(); if (id) selectedIds.add(id); }

    filtered.forEach(doc => {
        const docUrl = doc.downloadUrl || doc.blobUrl || '';
        const row = document.createElement('tr');
        row.dataset.id = doc.id;
        row.tabIndex = -1;
        markSelection(row, selectedIds.has(doc.id));

        // Title cell
        const titleCell = document.createElement('td');
        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'library-table__title';
        const title = document.createElement('strong');
        title.textContent = doc.title || doc.name;
        const subtitle = document.createElement('span');
        subtitle.textContent = doc.description || doc.name;
        titleWrapper.append(title, subtitle);
        titleCell.appendChild(titleWrapper);
        row.appendChild(titleCell);

        // Size cell
        const sizeCell = document.createElement('td');
        sizeCell.textContent = Utils.formatBytes(doc.size);
        row.appendChild(sizeCell);

        // Updated cell
        const updatedCell = document.createElement('td');
        updatedCell.textContent = Utils.formatRelativeTime(doc.updatedAt);
        row.appendChild(updatedCell);

        // Actions cell
        const actionsCell = document.createElement('td');
        actionsCell.className = 'library-table__actions';

        const viewBtn = document.createElement('button');
        viewBtn.type = 'button'; viewBtn.className = 'library-action'; viewBtn.dataset.action = 'view'; viewBtn.textContent = 'View';
        actionsCell.appendChild(viewBtn);

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button'; copyBtn.className = 'library-action'; copyBtn.dataset.copy = docUrl; copyBtn.textContent = 'Copy link';
        actionsCell.appendChild(copyBtn);

        const dlLink = document.createElement('a');
        dlLink.className = 'library-action'; dlLink.href = docUrl || '#'; dlLink.target = '_blank'; dlLink.rel = 'noopener'; dlLink.download = doc.name; dlLink.textContent = 'Download';
        if (!docUrl) { dlLink.classList.add('is-disabled'); dlLink.setAttribute('aria-disabled', 'true'); }
        actionsCell.appendChild(dlLink);

        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'library-action'; delBtn.dataset.action = 'delete'; delBtn.textContent = 'Delete';
        actionsCell.appendChild(delBtn);

        row.appendChild(actionsCell);
        rows.appendChild(row);
    });

    applyPendingFocus();
    syncSelection();
}

export function init() {
    if (initialized) return;
    rows = document.querySelector('[data-library-rows]');
    emptyState = document.querySelector('[data-library-empty]');
    searchInput = document.querySelector('[data-library-search]');

    DocumentStore.subscribe(nextDocs => { docs = nextDocs; render(); });

    searchInput?.addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });

    rows?.addEventListener('click', e => {
        const copyTarget = e.target.closest('[data-copy]');
        if (copyTarget) {
            const link = copyTarget.dataset.copy;
            if (link) {
                Utils.copyToClipboard(link)
                    .then(ok => Notifications.toast(ok ? t('common.copySuccess') : t('common.copyFailure'), ok ? 'success' : 'error'))
                    .catch(() => Notifications.toast(t('common.copyFailure'), 'error'));
            }
            return;
        }
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;
        const row = actionTarget.closest('tr[data-id]');
        const id = row?.dataset.id;
        if (!id) return;
        if (actionTarget.dataset.action === 'view') {
            DocumentViewer?.selectDocument?.(id);
            pendingFocusTarget = id;
            syncSelection();
        } else if (actionTarget.dataset.action === 'delete') {
            pendingFocusTarget = row.previousElementSibling?.dataset.id || row.nextElementSibling?.dataset.id || 'search';
            DocumentStore.removeDocument(id)
                .then(() => Notifications.toast(t('notifications.documentRemoved'), 'info'))
                .catch(err => { console.error('Delete failed', err); Notifications.toast(t('errors.persistFailure'), 'error'); });
        }
    });

    rows?.addEventListener('keydown', e => {
        const row = e.target.closest('tr[data-id]');
        if (!row || e.target !== row) return;
        const id = row.dataset.id;
        if (!id) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            DocumentViewer?.selectDocument?.(id);
            pendingFocusTarget = id;
            syncSelection();
        } else if (e.key === 'Delete') {
            e.preventDefault();
            pendingFocusTarget = row.previousElementSibling?.dataset.id || row.nextElementSibling?.dataset.id || 'search';
            DocumentStore.removeDocument(id)
                .then(() => Notifications.toast(t('notifications.documentRemoved'), 'info'))
                .catch(err => { console.error('Delete failed', err); Notifications.toast(t('errors.persistFailure'), 'error'); });
        }
    });

    document.addEventListener('documentviewerchange', () => syncSelection());
    initialized = true;
}

export function focusFirst() {
    rows?.querySelector('tr[data-id]')?.focus({ preventScroll: false });
}

export default { init, focusRow, focusFirst };
