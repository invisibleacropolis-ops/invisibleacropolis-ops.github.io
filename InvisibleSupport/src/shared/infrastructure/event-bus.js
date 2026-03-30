/**
 * @fileoverview Simple Pub/Sub Event Bus for inter-module communication.
 * Allows decoupled components to communicate via named events.
 */

/** @type {Map<string, Set<Function>>} */
const subscribers = new Map();

/**
 * Subscribe to an event
 * @param {string} event - Event name
 * @param {Function} callback - Callback to invoke when event is emitted
 * @returns {Function} Unsubscribe function
 */
export function subscribe(event, callback) {
    if (typeof callback !== 'function') {
        return () => { };
    }

    if (!subscribers.has(event)) {
        subscribers.set(event, new Set());
    }

    subscribers.get(event).add(callback);

    // Return unsubscribe function
    return () => {
        const listeners = subscribers.get(event);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) {
                subscribers.delete(event);
            }
        }
    };
}

/**
 * Emit an event to all subscribers
 * @param {string} event - Event name
 * @param {*} payload - Data to pass to subscribers
 */
export function emit(event, payload) {
    const listeners = subscribers.get(event);
    if (!listeners) return;

    listeners.forEach((callback) => {
        try {
            callback(payload);
        } catch (error) {
            console.error(`[EventBus] Error in handler for "${event}":`, error);
        }
    });
}

/**
 * Subscribe to an event for a single emission only
 * @param {string} event - Event name
 * @param {Function} callback - Callback to invoke once
 * @returns {Function} Unsubscribe function
 */
export function once(event, callback) {
    const unsubscribe = subscribe(event, (payload) => {
        unsubscribe();
        callback(payload);
    });
    return unsubscribe;
}

/**
 * Remove all subscribers for an event
 * @param {string} event - Event name
 */
export function clear(event) {
    subscribers.delete(event);
}

/**
 * Remove all subscribers for all events
 */
export function clearAll() {
    subscribers.clear();
}

// Default export for convenience
export default { subscribe, emit, once, clear, clearAll };
