/**
 * @fileoverview GitHub API client for file storage operations.
 * Provides CRUD operations for files stored in a GitHub repository.
 */

import { t } from '../localization/index.js';

// Configuration keys
const CONFIG_KEY = 'invisibleSupport.githubConfig';

// Text encoding/decoding utilities
const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

/**
 * Infers repository defaults from GitHub Pages URL
 */
function inferRepositoryDefaults() {
    try {
        const { hostname, pathname } = window.location || {};
        if (!hostname || !hostname.endsWith('github.io')) {
            return { owner: '', repo: '' };
        }
        const parts = hostname.split('.');
        if (parts.length < 3) {
            return { owner: '', repo: '' };
        }
        const owner = parts[0];
        const cleanPath = (pathname || '').replace(/^\/+|\/+$|\s+/g, '');
        if (!cleanPath) {
            return { owner, repo: `${owner}.github.io` };
        }
        const [repo] = cleanPath.split('/');
        return { owner, repo: repo || '' };
    } catch (error) {
        console.warn('Failed to infer GitHub repository from location', error);
        return { owner: '', repo: '' };
    }
}

// Default configuration with inferred values
const inferred = inferRepositoryDefaults();
const DEFAULT_CONFIG = {
    owner: inferred.owner,
    repo: inferred.repo,
    branch: 'main',
    token: '',
    storageLimitMb: 200,
};

// Internal state
const configListeners = new Set();
let config = loadConfigFromStorage();

/**
 * Sanitizes raw config input
 */
function sanitizeConfig(raw) {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_CONFIG };
    }
    const limit = Number(raw.storageLimitMb);
    const owner = typeof raw.owner === 'string' ? raw.owner.trim() : '';
    const repo = typeof raw.repo === 'string' ? raw.repo.trim() : '';
    const branch =
        typeof raw.branch === 'string' && raw.branch.trim() ? raw.branch.trim() : DEFAULT_CONFIG.branch;
    return {
        owner: owner || DEFAULT_CONFIG.owner,
        repo: repo || DEFAULT_CONFIG.repo,
        branch,
        token: typeof raw.token === 'string' ? raw.token.trim() : '',
        storageLimitMb: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_CONFIG.storageLimitMb,
    };
}

/**
 * Loads configuration from localStorage
 */
function loadConfigFromStorage() {
    try {
        const stored = localStorage.getItem(CONFIG_KEY);
        if (!stored) return { ...DEFAULT_CONFIG };
        const parsed = JSON.parse(stored);
        return sanitizeConfig(parsed);
    } catch (error) {
        console.warn('Failed to read GitHub configuration', error);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Notifies all config subscribers
 */
function notifyConfigListeners() {
    const snapshot = getConfig();
    configListeners.forEach((listener) => {
        try {
            listener(snapshot);
        } catch (error) {
            console.warn('GitHub config listener error', error);
        }
    });
}

/**
 * Persists config to localStorage
 */
function persistConfig(next) {
    config = sanitizeConfig({ ...config, ...next });
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
        console.warn('Unable to persist GitHub configuration', error);
    }
    notifyConfigListeners();
}

/**
 * Gets a copy of current config
 */
export function getConfig() {
    return { ...config };
}

/**
 * Subscribes to config changes
 */
export function subscribe(listener) {
    if (typeof listener !== 'function') return () => { };
    configListeners.add(listener);
    listener(getConfig());
    return () => configListeners.delete(listener);
}

/**
 * Updates configuration with partial values
 */
export function updateConfig(partial = {}) {
    persistConfig(partial);
}

/**
 * Checks if GitHub is fully configured
 */
export function isConfigured() {
    return Boolean(config.owner && config.repo && config.token);
}

/**
 * Throws if not configured
 */
function ensureConfigured() {
    if (isConfigured()) return;
    const error = new Error(t('errors.githubConfigMissing'));
    error.code = 'config';
    throw error;
}

/**
 * Gets the configured branch
 */
function getBranch() {
    return config.branch && config.branch.trim() ? config.branch.trim() : DEFAULT_CONFIG.branch;
}

/**
 * Builds the API base URL
 */
function buildApiBase() {
    return `https://api.github.com/repos/${config.owner}/${config.repo}`;
}

/**
 * Builds a full API URL
 */
function buildApiUrl(path = '') {
    const base = buildApiBase();
    return path ? `${base}/${path}` : base;
}

/**
 * Builds request headers
 */
function buildHeaders(extra) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (config.token) {
        headers.Authorization = `Bearer ${config.token}`;
    }
    if (extra) {
        Object.assign(headers, extra);
    }
    return headers;
}

/**
 * Encodes a path for API URLs
 */
function encodePath(path) {
    return path
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

/**
 * Encodes a string to base64
 */
function encodeBase64(value) {
    if (!value) return '';
    if (textEncoder) {
        const bytes = textEncoder.encode(value);
        let binary = '';
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(value)));
}

/**
 * Decodes base64 to string
 */
function decodeBase64(value) {
    if (!value) return '';
    try {
        const binary = atob(value);
        if (textDecoder) {
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            return textDecoder.decode(bytes);
        }
        return decodeURIComponent(escape(binary));
    } catch (error) {
        console.warn('Failed to decode base64 payload', error);
        return '';
    }
}

/**
 * Gets file contents from GitHub
 */
export async function getContents(path) {
    ensureConfigured();
    const encodedPath = encodePath(path);
    const branch = encodeURIComponent(getBranch());
    const url = `${buildApiUrl(`contents/${encodedPath}`)}?ref=${branch}`;
    const response = await fetch(url, { headers: buildHeaders() });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }
        const error = new Error(payload?.message || t('errors.githubRequestFailed'));
        error.code = 'request';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return response.json();
}

/**
 * Puts file contents to GitHub
 */
async function putContents(path, { message, content, sha } = {}) {
    ensureConfigured();
    const body = {
        message: message || `Update ${path}`,
        content,
        branch: getBranch(),
    };
    if (sha) {
        body.sha = sha;
    }
    const response = await fetch(buildApiUrl(`contents/${encodePath(path)}`), {
        method: 'PUT',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }
        const error = new Error(payload?.message || t('errors.githubRequestFailed'));
        error.code = 'request';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return response.json();
}

/**
 * Deletes file contents from GitHub
 */
async function deleteContents(path, { message, sha } = {}) {
    ensureConfigured();
    const body = {
        message: message || `Remove ${path}`,
        sha,
        branch: getBranch(),
    };
    const response = await fetch(buildApiUrl(`contents/${encodePath(path)}`), {
        method: 'DELETE',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
    });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }
        const error = new Error(payload?.message || t('errors.githubRequestFailed'));
        error.code = 'request';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return response.json();
}

/**
 * Downloads a file's raw content
 */
export async function downloadFile(path) {
    ensureConfigured();
    const branch = encodeURIComponent(getBranch());
    const url = `${buildApiUrl(`contents/${encodePath(path)}`)}?ref=${branch}`;
    const response = await fetch(url, {
        headers: buildHeaders({ Accept: 'application/vnd.github.v3.raw' }),
    });
    if (!response.ok) {
        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }
        const error = new Error(payload?.message || t('errors.githubRequestFailed'));
        error.code = 'request';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    const contentType = response.headers.get('Content-Type') || '';
    const arrayBuffer = await response.arrayBuffer();
    return { arrayBuffer, contentType };
}

/**
 * Reads a JSON manifest file
 */
export async function readManifest(path) {
    const file = await getContents(path);
    if (!file) {
        return { items: [], sha: null };
    }
    const text = decodeBase64(file.content || '');
    let data = [];
    if (text) {
        try {
            const parsed = JSON.parse(text);
            data = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Failed to parse manifest', error);
            data = [];
        }
    }
    return { items: data, sha: file.sha };
}

/**
 * Writes a JSON manifest file
 */
export async function writeManifest(path, items, sha) {
    const payload = JSON.stringify(items ?? [], null, 2);
    const response = await putContents(path, {
        content: encodeBase64(payload),
        message: `Update ${path}`,
        sha,
    });
    return {
        sha: response?.content?.sha ?? response?.sha ?? null,
        path: response?.content?.path ?? path,
    };
}

/**
 * Deletes a manifest file
 */
export async function deleteManifest(path, sha) {
    await deleteContents(path, { sha, message: `Remove ${path}` });
}

/**
 * Uploads a file to GitHub
 */
export async function uploadFile(path, base64Content, message) {
    const response = await putContents(path, { content: base64Content, message });
    const content = response?.content ?? {};
    return {
        path: content.path ?? path,
        sha: content.sha ?? response?.sha ?? null,
        downloadUrl: content.download_url ?? buildRawUrl(content.path ?? path),
    };
}

/**
 * Deletes a file from GitHub
 */
export async function deleteFile(path, sha, message) {
    await deleteContents(path, { sha, message });
}

/**
 * Tests the GitHub connection
 */
export async function testConnection() {
    ensureConfigured();
    const response = await fetch(buildApiUrl(), { headers: buildHeaders() });
    if (!response.ok) {
        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }
        const error = new Error(payload?.message || t('errors.githubRequestFailed'));
        error.code = 'request';
        error.status = response.status;
        throw error;
    }
    return true;
}

/**
 * Gets storage limit in bytes
 */
export function getStorageLimitBytes() {
    const limitMb = Number(config.storageLimitMb);
    if (Number.isFinite(limitMb) && limitMb > 0) {
        return limitMb * 1024 * 1024;
    }
    return DEFAULT_CONFIG.storageLimitMb * 1024 * 1024;
}

/**
 * Builds a raw GitHub URL for a file
 */
export function buildRawUrl(path) {
    if (!config.owner || !config.repo) return '';
    return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${getBranch()}/${path}`;
}

// Default export
export default {
    getConfig,
    updateConfig,
    subscribe,
    isConfigured,
    readManifest,
    writeManifest,
    deleteManifest,
    uploadFile,
    deleteFile,
    testConnection,
    getStorageLimitBytes,
    buildRawUrl,
    downloadFile,
};
