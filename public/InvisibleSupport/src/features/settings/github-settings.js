/**
 * @fileoverview GitHub settings form controller.
 * Handles form submission, validation, and connection testing.
 */

import { t } from '../../shared/localization/index.js';
import * as Notifications from '../../shared/ui/notifications.js';
import * as GitHubIntegration from '../../shared/services/github.js';

let initialized = false;

/**
 * Initialize the GitHub settings form
 */
export function init() {
    if (initialized) return;

    const form = document.querySelector('[data-github-settings]');
    if (!form) return;

    const ownerInput = form.querySelector('[data-github-owner]');
    const repoInput = form.querySelector('[data-github-repo]');
    const branchInput = form.querySelector('[data-github-branch]');
    const tokenInput = form.querySelector('[data-github-token]');
    const limitInput = form.querySelector('[data-github-limit]');
    const feedback = form.querySelector('[data-github-feedback]');
    const testButton = form.querySelector('[data-github-test]');

    function clearFeedback() {
        if (feedback) {
            Notifications.inline(feedback, '');
        }
    }

    function showFeedback(message, tone = 'info') {
        if (feedback && message) {
            Notifications.inline(feedback, message, tone);
        }
    }

    function populate(config) {
        if (!config) return;
        if (ownerInput && document.activeElement !== ownerInput) {
            ownerInput.value = config.owner || '';
        }
        if (repoInput && document.activeElement !== repoInput) {
            repoInput.value = config.repo || '';
        }
        if (branchInput && document.activeElement !== branchInput) {
            branchInput.value = config.branch || '';
        }
        if (limitInput && document.activeElement !== limitInput) {
            const limit = Number(config.storageLimitMb);
            limitInput.value = Number.isFinite(limit) && limit > 0 ? String(limit) : '';
        }
        if (tokenInput && document.activeElement !== tokenInput) {
            tokenInput.value = '';
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        clearFeedback();
        const owner = ownerInput?.value.trim() ?? '';
        const repo = repoInput?.value.trim() ?? '';
        if (!owner || !repo) {
            showFeedback(t('errors.githubValidation'), 'error');
            return;
        }
        const branch = branchInput?.value.trim() || 'main';
        const limitValue = Number(limitInput?.value);
        const payload = { owner, repo, branch };
        if (Number.isFinite(limitValue) && limitValue > 0) {
            payload.storageLimitMb = limitValue;
        }
        const token = tokenInput?.value.trim();
        if (token) {
            payload.token = token;
        }
        try {
            GitHubIntegration.updateConfig(payload);
            if (tokenInput) {
                tokenInput.value = '';
            }
            showFeedback(t('notifications.githubConfigSaved'), 'success');
            Notifications.toast(t('notifications.githubConfigSaved'), 'success');
        } catch (error) {
            console.error('Failed to save GitHub configuration', error);
            showFeedback(t('errors.githubRequestFailed'), 'error');
        }
    });

    testButton?.addEventListener('click', async (event) => {
        event.preventDefault();
        clearFeedback();
        testButton.disabled = true;
        const originalText = testButton.textContent;
        try {
            await GitHubIntegration.testConnection();
            showFeedback(t('notifications.githubTestSuccess'), 'success');
            Notifications.toast(t('notifications.githubTestSuccess'), 'success');
        } catch (error) {
            console.error('GitHub connection test failed', error);
            const message = error?.code === 'config'
                ? t('errors.githubConfigMissing')
                : t('notifications.githubTestFailure');
            showFeedback(message, 'error');
            Notifications.toast(message, 'error');
        } finally {
            testButton.disabled = false;
            if (typeof originalText === 'string') {
                testButton.textContent = originalText;
            }
        }
    });

    GitHubIntegration.subscribe((config) => {
        populate(config);
    });

    populate(GitHubIntegration.getConfig());
    initialized = true;
}

// Default export
export default { init };
