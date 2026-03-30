/**
 * @fileoverview Utility functions for formatting, Blob handling, and clipboard operations.
 * This is a "Leaf Node" module with no dependencies on other application modules.
 */

// Formatters are created once and reused for performance
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const bytesFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
});

// Registry to track created blob URLs for cleanup
const blobRegistry = new Set();

/**
 * Formats a byte count into a human-readable string (e.g., "1.5 MB")
 * @param {number} bytes - The number of bytes
 * @returns {string} Formatted string
 */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${bytesFormatter.format(value)} ${units[exponent]}`;
}

/**
 * Formats an ISO date string into a relative time string (e.g., "2 days ago")
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} Relative time string
 */
export function formatRelativeTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    const diffMs = date.getTime() - Date.now();
    const units = [
        { unit: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
        { unit: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
        { unit: 'day', ms: 1000 * 60 * 60 * 24 },
        { unit: 'hour', ms: 1000 * 60 * 60 },
        { unit: 'minute', ms: 1000 * 60 },
        { unit: 'second', ms: 1000 },
    ];
    for (const { unit, ms } of units) {
        if (Math.abs(diffMs) >= ms || unit === 'second') {
            const value = Math.round(diffMs / ms);
            return relativeTimeFormatter.format(value, unit);
        }
    }
    return relativeTimeFormatter.format(0, 'second');
}

/**
 * Formats an ISO date string into a localized date/time string
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} Formatted date/time string
 */
export function formatDateTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    return dateTimeFormatter.format(date);
}

/**
 * Creates an object URL from a Blob/File and registers it for later cleanup
 * @param {Blob|File} value - The blob or file
 * @returns {string} Object URL or empty string on error
 */
export function createObjectUrl(value) {
    if (!value) return '';
    try {
        const url = URL.createObjectURL(value);
        blobRegistry.add(url);
        return url;
    } catch (error) {
        console.warn('Failed to create object URL', error);
        return '';
    }
}

/**
 * Revokes an object URL and removes it from the registry
 * @param {string} url - The object URL to revoke
 */
export function revokeObjectUrl(url) {
    if (!url) return;
    blobRegistry.delete(url);
    try {
        URL.revokeObjectURL(url);
    } catch (error) {
        console.warn('Failed to revoke object URL', error);
    }
}

/**
 * Revokes all tracked object URLs
 */
export function revokeAllObjectUrls() {
    blobRegistry.forEach((url) => {
        try {
            URL.revokeObjectURL(url);
        } catch (error) {
            console.warn('Failed to revoke object URL', error);
        }
    });
    blobRegistry.clear();
}

/**
 * Converts a data URL to a Blob
 * @param {string} dataUrl - The data URL
 * @param {string} fallbackType - MIME type fallback
 * @returns {{ blob: Blob, type: string }} Object with blob and MIME type
 */
export function dataUrlToBlob(dataUrl, fallbackType = 'application/octet-stream') {
    if (!dataUrl) {
        return { blob: new Blob([], { type: fallbackType }), type: fallbackType };
    }
    const [header, payload] = dataUrl.split(',');
    try {
        const match = header?.match(/data:(.*?);base64/);
        const mime = match?.[1] || fallbackType;
        const binary = atob(payload ?? '');
        const length = binary.length;
        const bytes = new Uint8Array(length);
        for (let index = 0; index < length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return { blob: new Blob([bytes], { type: mime }), type: mime };
    } catch (error) {
        console.error('Failed to parse stored file', error);
        return { blob: new Blob([], { type: fallbackType }), type: fallbackType };
    }
}

/**
 * Extracts the base64 content from a data URL
 * @param {string} dataUrl - The data URL
 * @returns {string} Base64 encoded content
 */
export function dataUrlToBase64(dataUrl) {
    if (!dataUrl) return '';
    const parts = dataUrl.split(',');
    if (parts.length === 1) {
        return parts[0] ?? '';
    }
    return parts[1] ?? '';
}

/**
 * Reads a file and returns its content as a data URL
 * @param {File} file - The file to read
 * @param {function} progressCallback - Optional callback for progress updates (0-1)
 * @returns {Promise<string>} Data URL
 */
export function readFileAsDataUrl(file, progressCallback) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onprogress = (event) => {
            if (event.lengthComputable) {
                const progress = event.total > 0 ? event.loaded / event.total : 0;
                progressCallback?.(progress);
            }
        };
        reader.onload = () => {
            resolve(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Copies text to the clipboard with robust multi-step fallback behavior.
 * @param {string} text - Text to copy
 * @param {HTMLInputElement|HTMLTextAreaElement|null} sourceEl - Optional visible source field to select from.
 * @returns {Promise<boolean>} True if successful
 */
export async function copyToClipboard(text, sourceEl = null) {
    const resolvedText = (() => {
        if (sourceEl && typeof sourceEl.value === 'string' && sourceEl.value) {
            return sourceEl.value;
        }
        return text;
    })();
    if (!resolvedText) return false;

    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selection = document.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const canSelectSource = sourceEl && document.body.contains(sourceEl) && typeof sourceEl.select === 'function';

    if (canSelectSource) {
        try {
            sourceEl.focus({ preventScroll: true });
            sourceEl.select();
            if (typeof sourceEl.setSelectionRange === 'function') {
                sourceEl.setSelectionRange(0, String(resolvedText).length);
            }
            if (document.execCommand('copy')) {
                activeEl?.focus?.({ preventScroll: true });
                if (range && selection) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
                return true;
            }
        } catch (error) {
            console.warn('Source element copy fallback failed', error);
        }
    }

    try {
        await navigator.clipboard.writeText(resolvedText);
        return true;
    } catch (error) {
        console.warn('Async clipboard failed, attempting textarea fallback', error);
    }

    const textarea = document.createElement('textarea');
    textarea.value = resolvedText;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (error) {
        console.error('Textarea fallback copy failed', error);
    } finally {
        textarea.blur();
        document.body.removeChild(textarea);
    }

    activeEl?.focus?.({ preventScroll: true });
    if (range && selection) {
        selection.removeAllRanges();
        selection.addRange(range);
    }
    return success;
}

// Default export for convenience
export default {
    formatBytes,
    formatRelativeTime,
    formatDateTime,
    createObjectUrl,
    revokeObjectUrl,
    revokeAllObjectUrls,
    dataUrlToBlob,
    dataUrlToBase64,
    readFileAsDataUrl,
    copyToClipboard,
};
