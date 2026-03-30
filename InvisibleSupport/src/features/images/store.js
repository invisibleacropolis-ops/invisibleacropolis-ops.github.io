/**
 * @fileoverview Image store for CRUD operations on images.
 * Manages image persistence via GitHub, EXIF/dimension validation, and subscriptions.
 */

import { t } from '../../shared/localization/index.js';
import * as Utils from '../../shared/utils.js';
import { BaseResourceStore } from '../../shared/services/base-store.js';

const STORAGE_KEY = 'invisibleSupport.images';
const MAX_IMAGE_DIMENSION = 8192;
const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/svg+xml',
    'image/tiff',
]);

class ImageStore extends BaseResourceStore {
    constructor() {
        super(STORAGE_KEY, 'uploads/images');
        this.load();
    }

    /**
     * Hydrates images with download URLs and default type
     */
    hydrate(rawItems) {
        const items = super.hydrate(rawItems);
        return items.map(item => ({
            ...item,
            type: item.type || 'image/png'
        }));
    }

    /**
     * Guesses MIME type from filename
     */
    guessMimeType(name, fallback = 'image/png') {
        if (!name) return fallback;
        const extension = name.split('.').pop()?.toLowerCase();
        const lookup = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            heic: 'image/heic',
            svg: 'image/svg+xml',
        };
        return lookup[extension] || fallback;
    }

    /**
     * Checks if a MIME type is supported
     */
    isSupportedImageType(type) {
        if (!type) return false;
        const normalized = type.toLowerCase();
        if (SUPPORTED_IMAGE_TYPES.has(normalized)) return true;
        return normalized.startsWith('image/');
    }

    /**
     * Gets image dimensions from a file
     */
    getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                const width = image.naturalWidth || image.width;
                const height = image.naturalHeight || image.height;
                URL.revokeObjectURL(url);
                resolve({ width, height });
            };
            image.onerror = (error) => {
                URL.revokeObjectURL(url);
                reject(error);
            };
            image.src = url;
        });
    }

    /**
     * Formats EXIF date to ISO string
     */
    formatExifDate(value) {
        if (!value || typeof value !== 'string') return null;
        const cleaned = value.replace(/\0/g, '').trim();
        const match = cleaned.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return cleaned || null;
        const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return cleaned || null;
        return date.toISOString();
    }

    /**
     * Normalizes a file into an image record
     */
    normalizeImage(file, extras, dimensions, exif) {
        const now = new Date().toISOString();
        const title = extras.title?.trim();
        const alt = extras.alt?.trim();
        const type = file.type || this.guessMimeType(file.name, 'image/png');
        const capturedAtIso = this.formatExifDate(exif?.dateTimeOriginal);
        // Use ensureUniqueName from BaseResourceStore
        const normalizedName = this.ensureUniqueName(file.name);

        return {
            id: this.generateId('img'),
            name: normalizedName,
            title: title || normalizedName,
            alt: alt || '',
            type,
            size: file.size,
            width: dimensions.width,
            height: dimensions.height,
            updatedAt: now,
            capturedAt: capturedAtIso,
            exif: exif || {},
            repoPath: '',
            sha: '',
            downloadUrl: '',
            blobUrl: '',
        };
    }

    /**
     * Creates and uploads a new image
     */
    async createImage(file, extras = {}, progressCallback) {
        if (!(file instanceof File)) {
            const error = new Error(t('errors.invalidImage'));
            error.code = 'invalid';
            throw error;
        }

        const mimeType = file.type || this.guessMimeType(file.name, 'image/png');
        if (!this.isSupportedImageType(mimeType)) {
            const error = new Error(t('errors.unsupportedImageType'));
            error.code = 'type';
            throw error;
        }

        let dimensions;
        try {
            dimensions = await this.getImageDimensions(file);
        } catch (error) {
            const dimensionError = new Error(t('errors.imageDimensions'));
            dimensionError.code = 'dimensions';
            throw dimensionError;
        }

        if (!dimensions || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
            const sizeError = new Error(t('errors.imageTooLarge'));
            sizeError.code = 'max-dimensions';
            sizeError.details = dimensions;
            throw sizeError;
        }

        const dataUrl = await Utils.readFileAsDataUrl(file, progressCallback);
        // Note: EXIF parsing removed for simplicity - can be added back if needed
        const exif = {};

        const base64 = Utils.dataUrlToBase64(dataUrl);
        const imageRecord = this.normalizeImage(file, extras, dimensions, exif);

        const uploadInfo = await this.uploadToGitHub(
            imageRecord.id,
            imageRecord.name,
            base64
        );

        Object.assign(imageRecord, uploadInfo);
        imageRecord.blobUrl = imageRecord.downloadUrl;

        await this.add(imageRecord);
        return imageRecord;
    }

    // Helper methods compatibility

    removeImage(id) {
        return this.remove(id);
    }

    getImage(id) {
        return this.get(id);
    }

    getImages() {
        return this.getAll();
    }
}

// Singleton instance
const store = new ImageStore();

// Export bound methods
export const subscribe = store.subscribe.bind(store);
export const createImage = store.createImage.bind(store);
export const removeImage = store.removeImage.bind(store);
export const getImage = store.getImage.bind(store);
export const getImages = store.getImages.bind(store);
export const clearAll = store.clearAll.bind(store);

// Default export
export default {
    subscribe,
    createImage,
    removeImage,
    getImage,
    getImages,
    clearAll,
};
