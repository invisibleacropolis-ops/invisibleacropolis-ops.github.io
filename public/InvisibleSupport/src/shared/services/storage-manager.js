/**
 * @fileoverview Storage quota manager that tracks usage across manifests.
 * Provides quota checking, persistence, and storage usage notifications.
 */

import { t } from '../localization/index.js';
import * as GitHubIntegration from './github.js';

// Warning threshold (80% of quota)
const WARNING_THRESHOLD = 0.8;

// Track sizes by storage key
const trackedSizes = new Map();
const manifestMeta = new Map();
const listeners = new Set();

// Map storage keys to GitHub paths
const KEY_PATH_MAP = new Map([
    ['invisibleSupport.documents', 'storage/documents.json'],
    ['invisibleSupport.images', 'storage/images.json'],
]);

/**
 * Calculates total size from an array of items
 */
function calculateSize(value) {
    if (!Array.isArray(value)) return 0;
    return value.reduce((total, item) => total + (Number(item?.size) || 0), 0);
}

/**
 * Resolves a storage key to its manifest path
 */
function resolvePath(key) {
    return KEY_PATH_MAP.get(key) ?? null;
}

/**
 * Builds a storage snapshot
 */
function buildSnapshot(overrideKey, overrideSize) {
    let used = 0;
    trackedSizes.forEach((size, key) => {
        if (overrideKey && key === overrideKey && typeof overrideSize === 'number') {
            used += overrideSize;
        } else {
            used += size;
        }
    });
    if (overrideKey && !trackedSizes.has(overrideKey) && typeof overrideSize === 'number') {
        used += overrideSize;
    }
    const limit = GitHubIntegration.getStorageLimitBytes();
    const ratio = limit > 0 ? used / limit : 0;
    return {
        used,
        limit,
        ratio,
        isWarning: ratio >= WARNING_THRESHOLD && ratio < 1,
        isExceeded: ratio >= 1,
    };
}

/**
 * Notifies all storage listeners
 */
function notify(snapshot = buildSnapshot()) {
    listeners.forEach((listener) => {
        try {
            listener({ ...snapshot });
        } catch (error) {
            console.warn('Storage listener error', error);
        }
    });
}

/**
 * Persists data to GitHub and updates tracking
 */
export async function persist(key, value) {
    const path = resolvePath(key);
    if (!path) {
        console.warn(`No manifest path registered for key: ${key}`);
        return value;
    }
    const size = calculateSize(value);
    const snapshot = buildSnapshot(key, size);
    if (snapshot.isExceeded) {
        const error = new Error(t('errors.quotaExceeded'));
        error.code = 'quota';
        error.snapshot = snapshot;
        throw error;
    }
    try {
        const meta = manifestMeta.get(key);
        const result = await GitHubIntegration.writeManifest(path, value, meta?.sha);
        manifestMeta.set(key, { sha: result.sha });
        trackedSizes.set(key, size);
        notify();
        return value;
    } catch (error) {
        if (error?.code === 'config') {
            throw error;
        }
        const persistError = new Error(t('errors.persistFailure'));
        persistError.code = 'persist';
        persistError.cause = error;
        throw persistError;
    }
}

/**
 * Reads data from GitHub and updates tracking
 */
export async function read(key) {
    const path = resolvePath(key);
    if (!path) return null;
    try {
        const result = await GitHubIntegration.readManifest(path);
        manifestMeta.set(key, { sha: result.sha });
        const size = calculateSize(result.items);
        trackedSizes.set(key, size);
        notify();
        return result.items;
    } catch (error) {
        if (error?.code === 'config') {
            trackedSizes.set(key, 0);
            notify();
            throw error;
        }
        console.error('Failed to read manifest', error);
        trackedSizes.set(key, 0);
        notify();
        return null;
    }
}

/**
 * Clears a specific storage key
 */
export async function clear(key) {
    const path = resolvePath(key);
    if (!path) return;
    const meta = manifestMeta.get(key);
    try {
        await GitHubIntegration.deleteManifest(path, meta?.sha ?? null);
    } catch (error) {
        console.warn('Failed to remove manifest', error);
    }
    manifestMeta.delete(key);
    trackedSizes.set(key, 0);
    notify();
}

/**
 * Clears all storage keys
 */
export async function clearAll() {
    const tasks = Array.from(KEY_PATH_MAP.keys()).map((key) => clear(key));
    await Promise.all(tasks);
}

/**
 * Subscribes to storage changes
 */
export function subscribe(listener) {
    if (typeof listener !== 'function') return () => { };
    listeners.add(listener);
    listener(buildSnapshot());
    return () => listeners.delete(listener);
}

/**
 * Gets the current storage snapshot
 */
export function getSnapshot() {
    return buildSnapshot();
}

/**
 * Estimates the storage impact of additional bytes
 */
export function estimateImpact(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 0;
    return bytes;
}

/**
 * Gets remaining storage capacity in bytes
 */
export function getRemainingCapacity() {
    const snapshot = buildSnapshot();
    return Math.max(snapshot.limit - snapshot.used, 0);
}

/**
 * Checks if additional bytes can be stored
 */
export function canStore(additionalBytes) {
    if (!Number.isFinite(additionalBytes) || additionalBytes <= 0) return true;
    const snapshot = buildSnapshot();
    return snapshot.used + additionalBytes <= snapshot.limit;
}

// Subscribe to GitHub config changes to update notifications
GitHubIntegration.subscribe(() => {
    notify();
});

// Default export
export default {
    persist,
    read,
    clear,
    clearAll,
    subscribe,
    getSnapshot,
    estimateImpact,
    getRemainingCapacity,
    canStore,
};
