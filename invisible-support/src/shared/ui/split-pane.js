/**
 * @fileoverview Split-pane component for drag-to-resize panel layouts.
 * Each split pane contains two child panels separated by a draggable handle.
 * The handle updates a CSS custom property on the container to control the split ratio.
 */

const STORAGE_KEY_PREFIX = 'splitPane:';
const MIN_PCT = 15;
const MAX_PCT = 85;

/** @type {Map<HTMLElement, { cleanup: () => void }>} */
const instances = new Map();

/**
 * Persist the split position for a given pane ID.
 */
function save(id, pct) {
    try { localStorage.setItem(STORAGE_KEY_PREFIX + id, String(pct)); } catch { /* quota */ }
}

/**
 * Load persisted split position, or return null.
 */
function load(id) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_PREFIX + id);
        if (raw !== null) {
            const n = parseFloat(raw);
            if (Number.isFinite(n) && n >= MIN_PCT && n <= MAX_PCT) return n;
        }
    } catch { /* private browsing */ }
    return null;
}

/**
 * Clamp a percentage value to the allowed range.
 */
function clamp(pct) {
    return Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
}

/**
 * Initialize a single split-pane container.
 */
function initPane(container) {
    const handle = container.querySelector('[data-split-handle]');
    if (!handle || instances.has(container)) return;

    const paneId = container.dataset.splitId || '';
    const saved = paneId ? load(paneId) : null;
    if (saved !== null) {
        container.style.setProperty('--split-left', saved + '%');
    }

    let dragging = false;

    function update(pct) {
        const rounded = Math.round(clamp(pct) * 10) / 10;
        container.style.setProperty('--split-left', rounded + '%');
        handle.setAttribute('aria-valuenow', String(Math.round(rounded)));
        return rounded;
    }

    function getClientX(e) {
        if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
        if (typeof e.clientX === 'number') return e.clientX;
        return null;
    }

    function onPointerMove(e) {
        if (!dragging) return;
        const clientX = getClientX(e);
        if (clientX === null) return;

        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const pct = (x / rect.width) * 100;
        update(pct);
    }

    function stopDrag() {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('is-dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onPointerMove, true);
        document.removeEventListener('mouseup', stopDrag, true);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', stopDrag);

        if (paneId) {
            const raw = container.style.getPropertyValue('--split-left');
            const val = parseFloat(raw);
            if (Number.isFinite(val)) save(paneId, Math.round(val * 10) / 10);
        }
    }

    function startDrag(e) {
        // Only left mouse button
        if (e.type === 'mousedown' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        handle.classList.add('is-dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        if (e.type === 'touchstart') {
            document.addEventListener('touchmove', onPointerMove, { passive: false });
            document.addEventListener('touchend', stopDrag);
        } else {
            document.addEventListener('mousemove', onPointerMove, true);
            document.addEventListener('mouseup', stopDrag, true);
        }
    }

    function onKeydown(e) {
        const step = e.shiftKey ? 5 : 1;
        const raw = container.style.getPropertyValue('--split-left');
        const currentVal = parseFloat(raw) || 50;
        let next = currentVal;

        if (e.key === 'ArrowLeft') { next = currentVal - step; }
        else if (e.key === 'ArrowRight') { next = currentVal + step; }
        else if (e.key === 'Home') { next = MIN_PCT; }
        else if (e.key === 'End') { next = MAX_PCT; }
        else return;

        e.preventDefault();
        const rounded = update(next);
        if (paneId) save(paneId, rounded);
    }

    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });
    handle.addEventListener('keydown', onKeydown);

    instances.set(container, {
        cleanup() {
            handle.removeEventListener('mousedown', startDrag);
            handle.removeEventListener('touchstart', startDrag);
            handle.removeEventListener('keydown', onKeydown);
            stopDrag();
        }
    });
}

/**
 * Initialize all split-pane containers on the page.
 */
export function init() {
    const panes = document.querySelectorAll('.split-pane');
    panes.forEach(initPane);
}

export default { init };
