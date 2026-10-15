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

  // Auto-inject content scripts into any already open Colab tabs so user doesn't even need to refresh
  await injectIntoExistingColabTabs();
});

async function injectIntoExistingColabTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://colab.research.google.com/*' });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/content.css']
        });
      } catch (e) {}

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content-main.js'],
          world: 'MAIN'
        });
      } catch (e) {}

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        });
      } catch (e) {}
    }
  } catch (err) {
    console.log('[Colab to GitHub] Tab auto-injection completed.');
  }
}

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

  if (request.action === 'CHECK_FILE_EXISTS') {
    (async () => {
      try {
        const result = await GitHubAPI.checkFileExists(
          request.token || DEFAULT_USER_TOKEN,
          request.repoName || 'DSV_Colab',
          request.filePath,
          request.branch || 'main'
        );
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // asynchronous response
  }

  if (request.action === 'FETCH_DRIVE_NOTEBOOK') {
    (async () => {
      try {
        const fileId = request.fileId;
        const candidateUrls = [
          `https://docs.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
          `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`,
          `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
        ];

        let content = null;
        for (const url of candidateUrls) {
          try {
            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) {
              const text = await res.text();
              if (text && (text.includes('"cells"') || text.includes('"nbformat"'))) {
                content = text;
                break;
              }
            }
          } catch (e) {
            console.log('[Colab to GitHub] Drive URL fetch attempt notice:', e.message);
          }
        }

        if (content) {
          sendResponse({ success: true, content });
        } else {
          sendResponse({ success: false, error: 'Could not fetch valid notebook JSON from Google Drive' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
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
