/**
 * @fileoverview Toast and inline notification system.
 * Depends on Localization for dismiss button text.
 */

import { t } from '../localization/index.js';

// Toast configuration
const HIDE_DELAY = 5000;

// Tone definitions with icon and CSS class
const tones = new Map([
    ['success', { icon: '✓', className: 'toast--success' }],
    ['error', { icon: '⚠', className: 'toast--error' }],
    ['info', { icon: 'ℹ', className: 'toast--info' }],
]);

// Cached reference to toast stack element
let stackElement = null;

/**
 * Gets or initializes the toast stack element
 * @returns {Element|null}
 */
function getStack() {
    if (!stackElement && typeof document !== 'undefined') {
        stackElement = document.querySelector('[data-toast-stack]');
    }
    return stackElement;
}

/**
 * Builds a toast element
 * @param {string} message - Message to display
 * @param {string} tone - "success", "error", or "info"
 * @returns {HTMLDivElement} Toast element
 */
function buildToast(message, tone = 'info') {
    const meta = tones.get(tone) || tones.get('info');
    const toastEl = document.createElement('div');
    toastEl.className = `toast ${meta?.className ?? ''}`.trim();
    toastEl.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toastEl.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    toastEl.tabIndex = 0;

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = meta?.icon ?? 'ℹ';

    const textNode = document.createElement('span');
    textNode.className = 'toast__message';
    textNode.textContent = message;

    const dismissButton = document.createElement('button');
    dismissButton.className = 'toast__dismiss';
    dismissButton.type = 'button';
    dismissButton.textContent = t('common.dismiss');
    dismissButton.setAttribute('aria-label', t('common.dismiss'));

    toastEl.append(icon, textNode, dismissButton);
    toastEl.dataset.dismissButton = '';
    return toastEl;
}

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {string} tone - "success", "error", or "info"
 * @param {Object} options - Configuration options
 * @param {number} options.duration - Time in ms before auto-dismiss
 */
export function toast(message, tone = 'info', { duration = HIDE_DELAY } = {}) {
    const stack = getStack();
    if (!stack || !message) return;

    const toastEl = buildToast(message, tone);
    stack.appendChild(toastEl);

    requestAnimationFrame(() => {
        toastEl.classList.add('is-visible');
    });

    const dismiss = () => {
        toastEl.classList.remove('is-visible');
        toastEl.addEventListener(
            'transitionend',
            () => {
                toastEl.remove();
            },
            { once: true }
        );
    };

    const timer = window.setTimeout(dismiss, duration);

    toastEl.addEventListener('click', (event) => {
        if (event.target instanceof HTMLButtonElement) return;
        window.clearTimeout(timer);
        dismiss();
    });

    toastEl.querySelector('.toast__dismiss')?.addEventListener('click', (event) => {
        event.stopPropagation();
        window.clearTimeout(timer);
        dismiss();
    });

    toastEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            window.clearTimeout(timer);
            dismiss();
        }
    });
}

/**
 * Shows an inline feedback message in an element
 * @param {Element} target - Target element to show message in
 * @param {string} message - Message to display (empty to clear)
 * @param {string} tone - "error", "success", or default
 */
export function inline(target, message, tone) {
    if (!target) return;
    const normalized = message?.trim() ?? '';
    target.classList.remove('is-error', 'is-success');

    if (!normalized) {
        target.hidden = true;
        target.textContent = '';
        target.removeAttribute('role');
        return;
    }

    target.hidden = false;
    target.textContent = normalized;

    if (tone === 'error') {
        target.classList.add('is-error');
    } else if (tone === 'success') {
        target.classList.add('is-success');
    }
    target.setAttribute('role', 'alert');
}

// Default export for convenience
export default { toast, inline };
