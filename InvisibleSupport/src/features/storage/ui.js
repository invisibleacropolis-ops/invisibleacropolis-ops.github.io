/**
 * @fileoverview Storage UI component for meter and management modal.
 * Shows storage usage, warnings, and provides clear functionality.
 */

import { t } from '../../shared/localization/index.js';
import * as Utils from '../../shared/utils.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as StorageManager from '../../shared/services/storage-manager.js';
import * as DocumentStore from '../documents/store.js';
import * as ImageStore from '../images/store.js';

let initialized = false;
let openStorageModalFn = null;
let closeStorageModalFn = null;

/**
 * Initialize the Storage UI
 */
export function init() {
    if (initialized) return;

    const meter = document.querySelector('[data-storage-meter]');
    const summaryEl = meter?.querySelector('[data-storage-summary]');
    const limitEl = meter?.querySelector('[data-storage-limit]');
    const progress = meter?.querySelector('[data-storage-progress]');
    const progressBar = meter?.querySelector('[data-storage-progress-bar]');
    const warningEl = meter?.querySelector('[data-storage-warning]');
    const manageButton = meter?.querySelector('[data-storage-manage]');
    const storageModal = document.getElementById('storage-modal');
    const modalUsed = storageModal?.querySelector('[data-storage-used]');
    const modalAvailable = storageModal?.querySelector('[data-storage-available]');
    const modalDocuments = storageModal?.querySelector('[data-storage-documents]');
    const modalImages = storageModal?.querySelector('[data-storage-images]');
    const modalClear = storageModal?.querySelector('[data-storage-clear]');
    const modalCancel = storageModal?.querySelector('[data-storage-cancel]');

    let lastTrigger = null;
    let snapshot = StorageManager.getSnapshot();
    let documents = DocumentStore.getDocuments();
    let images = ImageStore.getImages();

    function formatLimit(limitBytes) {
        if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
            return t('labels.storageLimitUnset');
        }
        return Utils.formatBytes(limitBytes);
    }

    function describeCollection(count, singularKey, pluralKey, bytes) {
        const label = count === 1 ? t(singularKey) : t(pluralKey);
        const sizeText = Utils.formatBytes(bytes);
        return `${count} ${label.toLowerCase()} • ${sizeText}`;
    }

    function renderMeter() {
        if (!meter) return;
        const usedText = Utils.formatBytes(snapshot.used);
        const limitText = formatLimit(snapshot.limit);
        const percent = snapshot.limit > 0 ? Math.min(100, Math.round((snapshot.used / snapshot.limit) * 100)) : 0;

        if (summaryEl) {
            summaryEl.textContent = t('common.usageSummary', { used: usedText, limit: limitText });
        }
        if (limitEl) {
            limitEl.textContent = limitText;
        }
        if (progress) {
            progress.setAttribute('aria-valuemin', '0');
            progress.setAttribute('aria-valuemax', '100');
            progress.setAttribute('aria-valuenow', String(percent));
        }
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        meter.classList.toggle('is-warning', snapshot.isWarning || snapshot.isExceeded);
        meter.classList.toggle('is-exceeded', snapshot.isExceeded);

        if (warningEl) {
            if (snapshot.isExceeded) {
                warningEl.hidden = false;
                warningEl.textContent = t('notifications.storageQuotaExceeded');
            } else if (snapshot.isWarning) {
                warningEl.hidden = false;
                warningEl.textContent = t('notifications.storageWarning', { percent });
            } else {
                warningEl.hidden = true;
                warningEl.textContent = '';
            }
        }
    }

    function renderModal() {
        if (!storageModal) return;
        const docBytes = documents.reduce((total, doc) => total + (Number(doc?.size) || 0), 0);
        const imageBytes = images.reduce((total, image) => total + (Number(image?.size) || 0), 0);
        const availableBytes = snapshot.limit > 0 ? Math.max(snapshot.limit - snapshot.used, 0) : 0;

        if (modalUsed) {
            modalUsed.textContent = Utils.formatBytes(snapshot.used);
        }
        if (modalAvailable) {
            modalAvailable.textContent = snapshot.limit > 0
                ? Utils.formatBytes(availableBytes)
                : t('labels.storageLimitUnset');
        }
        if (modalDocuments) {
            modalDocuments.textContent = describeCollection(
                documents.length,
                'labels.storageDocumentSingular',
                'labels.storageDocuments',
                docBytes
            );
        }
        if (modalImages) {
            modalImages.textContent = describeCollection(
                images.length,
                'labels.storageImageSingular',
                'labels.storageImages',
                imageBytes
            );
        }
    }

    function openModalInternal(trigger) {
        if (!storageModal) return;
        lastTrigger = trigger ?? null;
        renderModal();
        storageModal.classList.add('is-open');
        modalClear?.focus({ preventScroll: true });
    }

    function closeModalInternal() {
        if (!storageModal) return;
        storageModal.classList.remove('is-open');
        if (lastTrigger) {
            lastTrigger.focus({ preventScroll: true });
            lastTrigger = null;
        }
    }

    if (manageButton) {
        manageButton.addEventListener('click', (event) => {
            event.preventDefault();
            openModalInternal(manageButton);
        });
    }

    modalCancel?.addEventListener('click', closeModalInternal);
    storageModal?.addEventListener('click', (event) => {
        if (event.target === storageModal) {
            closeModalInternal();
        }
    });

    if (modalClear) {
        modalClear.addEventListener('click', async () => {
            if (modalClear.disabled) return;
            modalClear.disabled = true;
            try {
                await Promise.all([DocumentStore.clearAll(), ImageStore.clearAll()]);
                Notifications.toast(t('notifications.storageCleared'), 'success');
                closeModalInternal();
            } catch (error) {
                console.error('Failed to clear storage', error);
                Notifications.toast(t('errors.persistFailure'), 'error');
            } finally {
                modalClear.disabled = false;
            }
        });
    }

    StorageManager.subscribe((nextSnapshot) => {
        snapshot = nextSnapshot;
        renderMeter();
        renderModal();
    });

    DocumentStore.subscribe((nextDocuments) => {
        documents = nextDocuments;
        renderMeter();
        renderModal();
    });

    ImageStore.subscribe((nextImages) => {
        images = nextImages;
        renderModal();
        renderMeter();
    });

    renderMeter();
    renderModal();

    openStorageModalFn = openModalInternal;
    closeStorageModalFn = closeModalInternal;
    initialized = true;
}

/**
 * Opens the storage modal
 */
export function openModal(trigger) {
    if (openStorageModalFn) {
        openStorageModalFn(trigger);
    }
}

/**
 * Closes the storage modal
 */
export function closeModal() {
    if (closeStorageModalFn) {
        closeStorageModalFn();
    }
}

// Default export
export default { init, openModal, closeModal };
