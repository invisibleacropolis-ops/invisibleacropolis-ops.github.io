/**
 * @fileoverview Application entry point for the Invisible Support Portal.
 * 
 * This bootstrapper imports all modules and initializes the application.
 * During the migration, it will expose modules globally to maintain 
 * compatibility with the legacy inline scripts.
 */

// =====================================================================
// Phase IV: Shared Infrastructure Modules
// =====================================================================
import * as Utils from './shared/utils.js';
import * as Localization from './shared/localization/index.js';
import * as Notifications from './shared/ui/notifications.js';
import * as EventBus from './shared/infrastructure/event-bus.js';
import * as Store from './shared/infrastructure/store.js';

// =====================================================================
// Phase V: Integration Modules
// =====================================================================
import * as GitHubIntegration from './shared/services/github.js';
import * as StorageManager from './shared/services/storage-manager.js';

// =====================================================================
// Phase VI: Feature Slices - Documents
// =====================================================================
import * as DocumentStore from './features/documents/store.js';
import * as DocumentViewer from './features/documents/viewer.js';
import * as LibraryView from './features/documents/library-view.js';
import * as UploadController from './features/documents/upload.js';

// =====================================================================
// Phase VI: Feature Slices - Images
// =====================================================================
import * as ImageStore from './features/images/store.js';
import * as ImageViewer from './features/images/viewer.js';
import * as ImageGallery from './features/images/gallery.js';
import * as ImageUpload from './features/images/upload.js';

// =====================================================================
// Phase VI: Feature Slices - Settings & Storage
// =====================================================================
import * as GitHubSettings from './features/settings/github-settings.js';
import * as StorageUI from './features/storage/ui.js';

// =====================================================================
// Shared UI Components
// =====================================================================
import * as SplitPane from './shared/ui/split-pane.js';

// =====================================================================
// Expose to global scope for legacy compatibility during migration
// =====================================================================
window.Utils = Utils;
window.Localization = Localization;
window.Notifications = Notifications;
window.EventBus = EventBus;
window.Store = Store;
window.GitHubIntegration = GitHubIntegration;
window.StorageManager = StorageManager;
window.DocumentStore = DocumentStore;
window.ImageStore = ImageStore;
window.DocumentViewer = DocumentViewer;
window.ImageViewer = ImageViewer;
window.ImageGallery = ImageGallery;
window.LibraryView = LibraryView;

// =====================================================================
// Application Initialization
// =====================================================================

/**
 * Initialize panel collapse/expand toggle buttons.
 */
function initPanelToggles() {
    document.querySelectorAll('[data-panel-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.u-card');
            if (!card) return;
            const collapsed = card.classList.toggle('is-collapsed');
            btn.textContent = collapsed ? 'Expand' : 'Collapse';
            btn.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
        });
    });
}

/**
 * Initialize the application once the DOM is ready
 */
function init() {
    console.log('[ESM] Invisible Support Portal initialized (17 modules loaded)');

    // Apply translations to the DOM
    Localization.apply();

    // Initialize feature modules
    GitHubSettings.init();
    StorageUI.init();
    DocumentViewer.init();
    LibraryView.init();
    UploadController.init();
    ImageViewer.init();
    ImageGallery.init();
    ImageUpload.init();

    // Initialize UI components
    SplitPane.init();
    initPanelToggles();

    // Expose modal functions globally for legacy code
    window.openStorageModal = StorageUI.openModal;
    window.closeStorageModal = StorageUI.closeModal;
}

// Wait for DOM to be ready before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
