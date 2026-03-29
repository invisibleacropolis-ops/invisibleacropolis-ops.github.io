/**
 * @fileoverview Base class for resource stores.
 * Provides common functionality for state management, persistence, and GitHub integration.
 */

import { t } from '../localization/index.js';
import * as Utils from '../utils.js';
import * as Notifications from '../ui/notifications.js';
import * as GitHubIntegration from './github.js';
import * as StorageManager from './storage-manager.js';

export class BaseResourceStore {
    /**
     * @param {string} storageKey - unique key for StorageManager
     * @param {string} baseUploadPath - base path for GitHub uploads (e.g. 'uploads/images')
     * @param {Function} [normalizeFn] - function to normalize items before adding
     */
    constructor(storageKey, baseUploadPath, normalizeFn = null) {
        this.storageKey = storageKey;
        this.baseUploadPath = baseUploadPath;
        this.normalizeFn = normalizeFn;
        this.items = [];
        this.listeners = new Set();

        // Auto-subscribe to GitHub config changes
        GitHubIntegration.subscribe(() => {
            this.load();
        });
    }

    /**
     * Converts items to serializable format (stripping blob URLs)
     * @param {Array} items 
     * @returns {Array}
     */
    toSerializable(items) {
        return items.map(({ blobUrl, ...rest }) => rest);
    }

    /**
     * Hydrates items with download/blob URLs
     * @param {Array} rawItems
     * @returns {Array}
     */
    hydrate(rawItems) {
        return rawItems.map((item) => {
            const downloadUrl = item.downloadUrl || (item.repoPath ? GitHubIntegration.buildRawUrl(item.repoPath) : '');
            return { ...item, downloadUrl, blobUrl: downloadUrl };
        });
    }

    /**
     * Notifies all subscribers
     */
    notify() {
        const snapshot = this.getAll();
        this.listeners.forEach((listener) => listener(snapshot));
    }

    /**
     * Subscribes to changes
     * @param {Function} listener 
     * @returns {Function} unsubscribe
     */
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.getAll());
        return () => this.listeners.delete(listener);
    }

    /**
     * Persists items to storage
     * @param {Array} nextItems 
     */
    async persist(nextItems) {
        const serializable = this.toSerializable(nextItems);
        await StorageManager.persist(this.storageKey, serializable);
    }

    /**
     * Loads items from storage
     */
    async load() {
        try {
            const stored = await StorageManager.read(this.storageKey);
            if (Array.isArray(stored)) {
                // Default sort by updatedAt descending
                this.items = this.hydrate(stored).sort(
                    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
                );
            } else {
                this.items = [];
            }
        } catch (error) {
            if (error?.code !== 'config') {
                console.error(`Failed to load stored items for ${this.storageKey}`, error);
            }
            this.items = [];
        }
        this.notify();
        this.reconcile();
    }

    /**
     * Reconciles stored items against what actually exists in the GitHub repo.
     * Removes manifest entries whose upload folders no longer exist.
     * Runs in the background after load — non-blocking.
     */
    async reconcile() {
        if (!GitHubIntegration.isConfigured() || this.items.length === 0) return;
        try {
            const dirContents = await GitHubIntegration.getContents(this.baseUploadPath);
            if (!Array.isArray(dirContents)) return;
            const existingFolders = new Set(dirContents.map((entry) => entry.name));
            const depthOffset = this.baseUploadPath.split('/').filter(Boolean).length;
            const validItems = this.items.filter((item) => {
                if (!item.repoPath) return true;
                const idSegment = item.repoPath.split('/').filter(Boolean)[depthOffset];
                return !idSegment || existingFolders.has(idSegment);
            });
            if (validItems.length !== this.items.length) {
                this.items = validItems;
                await this.persist(validItems);
                this.notify();
            }
        } catch (e) {
            console.warn(`Reconciliation skipped for ${this.storageKey}:`, e?.message ?? e);
        }
    }

    /**
     * Generates a unique ID
     */
    generateId(prefix = 'item') {
        return typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * Ensures unique name by appending counter
     * @param {string} name 
     * @returns {string} unique name
     */
    ensureUniqueName(name) {
        if (!name) return name;
        const trimmed = name.trim();
        if (!trimmed) return trimmed;

        const [base, extension] = (() => {
            const lastDot = trimmed.lastIndexOf('.');
            if (lastDot > 0 && lastDot < trimmed.length - 1) {
                return [trimmed.slice(0, lastDot), trimmed.slice(lastDot)];
            }
            return [trimmed, ''];
        })();

        let candidate = trimmed;
        let counter = 2;
        // Check existence in current items
        while (this.items.some((item) => item.name === candidate)) {
            candidate = `${base} (${counter})${extension}`;
            counter += 1;
        }

        if (candidate !== trimmed) {
            Notifications.toast(t('notifications.duplicateName'), 'info');
        }
        return candidate;
    }

    /**
     * Adds an item to the store
     * @param {Object} item 
     */
    async add(item) {
        const nextItems = [item, ...this.items].sort(
            (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
        await this.persist(nextItems);
        this.items = nextItems;
        this.notify();
    }

    /**
     * Removes an item by ID (and deletes from GitHub if repoPath exists)
     * @param {string} id 
     */
    async remove(id) {
        const item = this.items.find((i) => i.id === id);
        if (!item) return;

        try {
            if (item.repoPath) {
                await GitHubIntegration.deleteFile(
                    item.repoPath,
                    item.sha,
                    `Remove ${item.name || 'item'}`
                );
            }
        } catch (error) {
            console.warn(`Failed to delete remote item ${id}`, error);
        }

        if (item.blobUrl?.startsWith('blob:')) {
            Utils.revokeObjectUrl(item.blobUrl);
        }

        const nextItems = this.items.filter((i) => i.id !== id);
        await this.persist(nextItems);
        this.items = nextItems;
        this.notify();
    }

    /**
     * Clears all items (and deletes from GitHub)
     */
    async clearAll() {
        await Promise.all(
            this.items.map((item) => {
                if (!item.repoPath) return Promise.resolve();
                return GitHubIntegration.deleteFile(
                    item.repoPath,
                    item.sha,
                    `Remove ${item.name || 'item'}`
                ).catch((error) => {
                    console.warn(`Failed to delete remote item ${item.id}`, error);
                });
            })
        );

        this.items.forEach((item) => {
            if (item?.blobUrl?.startsWith('blob:')) {
                Utils.revokeObjectUrl(item.blobUrl);
            }
        });

        this.items = [];
        await StorageManager.clear(this.storageKey);
        this.notify();
    }

    /**
     * Gets an item by ID
     * @param {string} id 
     * @returns {Object|null}
     */
    get(id) {
        return this.items.find((item) => item.id === id) ?? null;
    }

    /**
     * Gets all items
     * @returns {Array}
     */
    getAll() {
        return [...this.items];
    }

    /**
     * Uploads a file to GitHub and adds it to the store
     * @param {string} id 
     * @param {string} name 
     * @param {string} base64Content 
     * @returns {Promise<Object>} GitHub upload response partial { path, sha, downloadUrl }
     */
    async uploadToGitHub(id, name, base64Content) {
        if (!GitHubIntegration.isConfigured()) {
            const error = new Error(t('errors.githubConfigMissing'));
            error.code = 'config';
            throw error;
        }

        const repoPath = `${this.baseUploadPath}/${id}/${encodeURIComponent(name)}`;

        try {
            const upload = await GitHubIntegration.uploadFile(
                repoPath,
                base64Content,
                `Add ${name}`
            );
            return {
                repoPath: upload.path,
                sha: upload.sha ?? '',
                downloadUrl: upload.downloadUrl ?? '',
            };
        } catch (error) {
            const failure =
                error?.code === 'config' || error?.code === 'quota' || error?.code === 'persist'
                    ? error
                    : new Error(t('errors.persistFailure'));

            if (failure !== error) {
                failure.code = 'persist';
                failure.cause = error;
            }
            throw failure;
        }
    }
}
