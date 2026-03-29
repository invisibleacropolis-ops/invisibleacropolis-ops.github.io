/**
 * @fileoverview Localization/i18n module for the Invisible Support Portal.
 * Provides translation lookup with placeholder interpolation.
 */

// Detect browser language, fallback to English
const defaultLocale = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
const fallbackLocale = 'en';

/**
 * Locale string dictionaries organized by language and namespace
 */
const locales = {
    en: {
        common: {
            copySuccess: 'Link copied to clipboard.',
            copyFailure: 'Copy failed. Please copy manually.',
            dismiss: 'Dismiss notification',
            remove: 'Remove',
            manageStorage: 'Manage storage',
            usageSummary: '{used} of {limit}',
            storageWarning: 'Storage is almost full ({percent}% used).',
            unknownFile: 'File',
            save: 'Save',
        },
        notifications: {
            documentRemoved: 'Document removed from library.',
            imageRemoved: 'Image removed from gallery.',
            imageUploadSuccess: 'Images uploaded successfully.',
            imageUploadSelectPrompt: 'Select at least one image to upload.',
            documentUploadSuccess: 'Documents uploaded successfully.',
            documentUploadSelectPrompt: 'Select at least one document to upload.',
            storageQuotaExceeded: 'Storage quota exceeded. Remove items or clear space to continue.',
            duplicateName: 'An item with this name already exists. Renamed automatically.',
            largeFileWarning: 'File is large and may exceed available space.',
            storageCleared: 'Stored items cleared successfully.',
            githubConfigSaved: 'Repository settings saved.',
            githubTestSuccess: 'Connection to GitHub succeeded.',
            githubTestFailure: 'GitHub connection failed. Check credentials and permissions.',
            storageWarning: 'Storage is almost full ({percent}% used).',
        },
        errors: {
            quotaExceeded: 'Unable to save changes because storage is full.',
            persistFailure: 'Unable to persist items. Try clearing storage and retrying.',
            invalidDocument: 'Invalid document file.',
            invalidImage: 'Invalid image file.',
            unsupportedImageType: 'Unsupported image type.',
            imageDimensions: 'Unable to read image dimensions.',
            imageTooLarge: 'Image exceeds maximum supported dimensions.',
            githubConfigMissing: 'Configure the GitHub repository settings before uploading.',
            githubRequestFailed: 'GitHub request failed. Review the setup instructions and try again.',
            githubValidation: 'Enter the repository owner and name before saving.',
        },
        labels: {
            storageUsed: 'Storage used',
            storageLimit: 'Storage limit',
            storageAvailable: 'Available space',
            storageDocuments: 'Documents',
            storageImages: 'Images',
            storageDocumentSingular: 'Document',
            storageImageSingular: 'Image',
            storageLimitUnset: 'Limit not configured',
            storageDialogTitle: 'Storage management',
            storageDialogDescription:
                'Local storage is near capacity. Clear older items or export data to continue uploading.',
            storageClearCta: 'Clear all stored items',
            storageCancelCta: 'Keep items',
            storageManageCta: 'Manage stored data',
            storageWarningCta: 'Review storage',
            githubOwner: 'Repository owner',
            githubRepo: 'Repository name',
            githubBranch: 'Branch',
            githubToken: 'Personal access token',
            githubStorageLimit: 'Storage budget (MB)',
        },
        upload: {
            waitingImages: 'Waiting for images…',
            waitingDocuments: 'Waiting for files…',
            validating: '{name} • validating',
            progress: '{name} • {percent}%',
            summaryImagesSingle: '{name} uploaded',
            summaryImagesMultiple: '{count} images uploaded',
            summaryDocumentsSingle: '{name} uploaded',
            summaryDocumentsMultiple: '{count} documents uploaded',
            completeImages: 'Upload complete. Images are ready in the gallery.',
            completeDocuments: 'Upload complete. Documents are ready in the library.',
            queueTitle: 'Selected files',
            queueEmpty: 'No files selected yet.',
            queueClear: 'Clear selection',
            queueSummarySingle: '"{name}" ready to upload ({size})',
            queueSummaryMultiple: '{count} files ready to upload ({size})',
            errorSelectImages: 'Select at least one image to upload.',
            errorSelectDocuments: 'Select at least one document to upload.',
            errorUnsupportedImage: '{name} is not a supported image type.',
            errorImageTooLarge: '{name} exceeds the {limit}px dimension limit.',
            errorImageDimensions: 'Unable to read dimensions for {name}.',
            errorUploadFailed: 'Upload failed for {name}.',
            errorMissingConfiguration: 'Configure repository settings before uploading.',
        },
        gallery: {
            selectImage: 'Select {name}',
        },
    },
};

/** Currently active locale */
let activeLocale = locales[defaultLocale] ? defaultLocale : fallbackLocale;

/**
 * Retrieves a raw string from the locale dictionary by dot-separated key
 * @param {string} key - Dot-separated key path (e.g., "common.copySuccess")
 * @returns {string} The localized string or the key if not found
 */
function getString(key) {
    const segments = key.split('.');
    let current = locales[activeLocale] || locales[fallbackLocale];
    for (const segment of segments) {
        if (current && typeof current === 'object' && segment in current) {
            current = current[segment];
        } else {
            return key;
        }
    }
    return typeof current === 'string' ? current : key;
}

/**
 * Replaces placeholders in a template string
 * @param {string} template - Template with {placeholder} syntax
 * @param {Object} replacements - Key-value pairs for replacement
 * @returns {string} Interpolated string
 */
function format(template, replacements = {}) {
    return template.replace(/\{(.*?)\}/g, (_, token) => {
        const value = replacements[token.trim()];
        return value ?? '';
    });
}

/**
 * Main translation function - retrieves and interpolates a localized string
 * @param {string} key - Dot-separated key path
 * @param {Object} replacements - Optional placeholder replacements
 * @returns {string} The translated string
 */
export function t(key, replacements) {
    const template = getString(key);
    return typeof template === 'string' ? format(template, replacements) : key;
}

/**
 * Applies translations to all elements with data-i18n-key attribute
 * @param {Document|Element} root - Root element to search within
 */
export function apply(root = document) {
    root.querySelectorAll?.('[data-i18n-key]').forEach((node) => {
        const key = node.getAttribute('data-i18n-key');
        if (!key) return;
        const text = t(key);
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
            node.placeholder = text;
        } else {
            node.textContent = text;
        }
    });
}

/**
 * Sets the active locale
 * @param {string} locale - Locale code (e.g., "en")
 */
export function setLocale(locale) {
    if (!locales[locale]) return;
    activeLocale = locale;
    apply();
}

/**
 * Gets the currently active locale
 * @returns {string} Current locale code
 */
export function getLocale() {
    return activeLocale;
}

// Default export for convenience
export default { t, apply, setLocale, getLocale };
