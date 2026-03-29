/**
 * @fileoverview Reactive State Store using JavaScript Proxy.
 * Automatically emits events when state properties change.
 */

import * as EventBus from './event-bus.js';

/**
 * Creates a reactive store that emits events on property changes
 * @param {Object} initialState - Initial state object
 * @param {string} namespace - Event namespace prefix (e.g., "state")
 * @returns {Proxy} Reactive proxy that emits events on changes
 */
export function createStore(initialState = {}, namespace = 'state') {
    return new Proxy(initialState, {
        set(target, property, value) {
            const oldValue = target[property];
            target[property] = value;

            // Only emit if value actually changed
            if (oldValue !== value) {
                EventBus.emit(`${namespace}:${String(property)}`, value);
                EventBus.emit(`${namespace}:change`, { property, value, oldValue });
            }

            return true;
        },

        get(target, property) {
            return target[property];
        },

        deleteProperty(target, property) {
            const oldValue = target[property];
            const deleted = delete target[property];

            if (deleted && oldValue !== undefined) {
                EventBus.emit(`${namespace}:${String(property)}`, undefined);
                EventBus.emit(`${namespace}:change`, { property, value: undefined, oldValue });
            }

            return deleted;
        },
    });
}

/**
 * Subscribe to changes on a specific store property
 * @param {string} namespace - Store namespace
 * @param {string} property - Property name to watch
 * @param {Function} callback - Callback receiving new value
 * @returns {Function} Unsubscribe function
 */
export function subscribeToProperty(namespace, property, callback) {
    return EventBus.subscribe(`${namespace}:${property}`, callback);
}

/**
 * Subscribe to any change in the store
 * @param {string} namespace - Store namespace
 * @param {Function} callback - Callback receiving { property, value, oldValue }
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAny(namespace, callback) {
    return EventBus.subscribe(`${namespace}:change`, callback);
}

// Default export
export default { createStore, subscribeToProperty, subscribeToAny };
