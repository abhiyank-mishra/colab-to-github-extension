/**
 * Background Service Worker
 * Handles installation defaults and centralized GitHub API operations.
 */

try {
  importScripts('utils/github.js');
} catch (e) {
  console.error('[Colab to GitHub] Failed to import github.js in service worker:', e);
}

// Optionally import local config if present (untracked by git)
try {
  importScripts('config.local.js');
} catch (e) {
  // config.local.js is optional
}

const DEFAULT_USER_TOKEN = (typeof self !== 'undefined' && self.LOCAL_CONFIG?.defaultToken) || '';

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Colab to GitHub] Extension installed / updated:', details.reason);

  const existing = await chrome.storage.local.get(['github_token', 'repo_name', 'branch', 'is_private']);
  const defaults = {};

  // Pre-configure token by default if available in local config
  if (!existing.github_token && DEFAULT_USER_TOKEN) {
    defaults.github_token = DEFAULT_USER_TOKEN;
  }
  if (!existing.repo_name) defaults.repo_name = 'DSV_Colab';
  if (!existing.branch) defaults.branch = 'main';
  if (existing.is_private === undefined) defaults.is_private = false;

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
    console.log('[Colab to GitHub] Defaults initialized successfully.');
  }
});

// Centralized message router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_DEFAULT_TOKEN') {
    sendResponse({ defaultToken: DEFAULT_USER_TOKEN });
    return true;
  }

  if (request.action === 'VERIFY_GITHUB_TOKEN') {
    (async () => {
      try {
        const user = await GitHubAPI.getUser(request.token);
        sendResponse({ success: true, user });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // asynchronous response
  }

  if (request.action === 'EXECUTE_GITHUB_PUSH') {
    (async () => {
      try {
        const result = await GitHubAPI.pushNotebook({
          token: request.token || DEFAULT_USER_TOKEN,
          repoName: request.repoName || 'DSV_Colab',
          branch: request.branch || 'main',
          filePath: request.filePath,
          content: request.content,
          commitMessage: request.commitMessage,
          isPrivate: Boolean(request.isPrivate)
        });
        sendResponse({ success: true, ...result });
      } catch (err) {
        console.error('[Colab to GitHub] Background push failed:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // asynchronous response
  }
});
