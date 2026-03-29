/**
 * @fileoverview Document store for CRUD operations on documents.
 * Manages document persistence via GitHub and provides subscription model.
 */

import { t } from '../../shared/localization/index.js';
import * as Utils from '../../shared/utils.js';
import { BaseResourceStore } from '../../shared/services/base-store.js';

const STORAGE_KEY = 'invisibleSupport.documents';

class DocumentStore extends BaseResourceStore {
    constructor() {
        super(STORAGE_KEY, 'uploads/documents');
        // Load initial data
        this.load();
    }

    /**
     * Guesses MIME type from filename
     */
    guessMimeType(name, fallback = 'application/octet-stream') {
        if (!name) return fallback;
        const extension = name.split('.').pop()?.toLowerCase();
        const lookup = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            csv: 'text/csv',
            txt: 'text/plain',
            rtf: 'application/rtf',
            json: 'application/json',
            log: 'text/plain',
        };
        return lookup[extension] || fallback;
    }

    /**
     * Normalizes a file into a document record
     */
    normalizeDocument(file, extras) {
        const now = new Date().toISOString();
        const title = extras.title?.trim();
        const description = extras.description?.trim() ?? '';
        const type = file.type || this.guessMimeType(file.name);
        // Use ensureUniqueName from BaseResourceStore
        const normalizedName = this.ensureUniqueName(file.name);

        return {
            id: this.generateId('doc'),
            name: normalizedName,
            title: title || normalizedName,
            description,
            type,
            size: file.size,
            updatedAt: now,
            repoPath: '',
            sha: '',
            downloadUrl: '',
            blobUrl: '',
        };
    }

    /**
     * Creates and uploads a new document
     */
    async createDocument(file, extras = {}, progressCallback) {
        if (!(file instanceof File)) {
            const error = new Error(t('errors.invalidDocument'));
            error.code = 'invalid';
            throw error;
        }

        const dataUrl = await Utils.readFileAsDataUrl(file, progressCallback);
        const base64 = Utils.dataUrlToBase64(dataUrl);
        const documentRecord = this.normalizeDocument(file, extras);

        const uploadInfo = await this.uploadToGitHub(
            documentRecord.id,
            documentRecord.name,
            base64
        );

        Object.assign(documentRecord, uploadInfo);
        documentRecord.blobUrl = documentRecord.downloadUrl;

        await this.add(documentRecord);
        return documentRecord;
    }

    // Helper methods to maintain compatibility with existing API

    /**
     * Removes a document by ID
     */
    removeDocument(id) {
        return this.remove(id);
    }

    /**
     * Gets a document by ID
     */
    getDocument(id) {
        return this.get(id);
    }

    /**
     * Gets all documents
     */
    getDocuments() {
        return this.getAll();
    }
}

// Singleton instance
const store = new DocumentStore();

// Export bound methods for compatibility
export const subscribe = store.subscribe.bind(store);
export const createDocument = store.createDocument.bind(store);
export const removeDocument = store.removeDocument.bind(store);
export const getDocument = store.getDocument.bind(store);
export const getDocuments = store.getDocuments.bind(store);
export const clearAll = store.clearAll.bind(store);

// Default export
export default {
    subscribe,
    createDocument,
    removeDocument,
    getDocument,
    getDocuments,
    clearAll,
};
