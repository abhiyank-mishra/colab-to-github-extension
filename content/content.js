/**
 * Content Script (ISOLATED World)
 * Injects floating button and toast notifications into Google Colab.
 * Bridges communication between the extension background/popup and content-main.js.
 */

(function () {
  'use strict';

  let toastContainer = null;
  let floatingBtn = null;

  function createToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'c2gh-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showToast({ title, message, type = 'info', linkText = '', linkUrl = '', duration = 6000 }) {
    const container = createToastContainer();
    const toast = document.createElement('div');
    toast.className = `c2gh-toast ${type}`;

    let linkHtml = '';
    if (linkUrl && linkText) {
      linkHtml = `<a class="c2gh-toast-link" href="${linkUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    }

    toast.innerHTML = `
      <div class="c2gh-toast-body">
        <div class="c2gh-toast-title">${title}</div>
        <div class="c2gh-toast-msg">${message}</div>
        ${linkHtml}
      </div>
      <button class="c2gh-toast-close" title="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.c2gh-toast-close');
    closeBtn.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (toast.isConnected) {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(10px)';
          setTimeout(() => toast.remove(), 300);
        }
      }, duration);
    }

    return toast;
  }

  // Request notebook extraction from content-main.js
  function requestExtraction() {
    return new Promise((resolve) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      let timer = null;

      function onMessage(event) {
        if (event.source !== window || !event.data || event.data.type !== 'COLAB_EXTRACT_RESPONSE') {
          return;
        }
        if (event.data.requestId === requestId) {
          window.removeEventListener('message', onMessage);
          if (timer) clearTimeout(timer);
          resolve(event.data);
        }
      }

      window.addEventListener('message', onMessage);

      window.postMessage({
        type: 'COLAB_EXTRACT_REQUEST',
        requestId
      }, '*');

      // Timeout safety
      timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve({
          success: false,
          error: 'Extraction request timed out after 6 seconds.'
        });
      }, 6000);
    });
  }

  // Handle push trigger
  async function handlePush() {
    if (floatingBtn && floatingBtn.classList.contains('loading')) return;

    // 1. Get settings
    const config = await chrome.storage.local.get([
      'github_token',
      'repo_name',
      'branch',
      'subfolder',
      'is_private',
      'commit_message_prefix'
    ]);

    let token = config.github_token;
    const repoName = config.repo_name || 'DSV_Colab';
    const branch = config.branch || 'main';
    const subfolder = config.subfolder || '';
    const isPrivate = Boolean(config.is_private);

    if (!token || !token.trim()) {
      try {
        const defRes = await chrome.runtime.sendMessage({ action: 'GET_DEFAULT_TOKEN' });
        if (defRes?.defaultToken) {
          token = defRes.defaultToken;
          await chrome.storage.local.set({ github_token: token });
        }
      } catch (e) {
        console.warn('[Colab to GitHub] Could not fetch default token:', e);
      }
    }

    if (!token || !token.trim()) {
      showToast({
        title: '⚠️ GitHub Token Required',
        message: 'Please click the extension icon in your Chrome toolbar to enter your GitHub Personal Access Token.',
        type: 'error',
        duration: 8000
      });
      return;
    }

    // Set button loading
    if (floatingBtn) {
      floatingBtn.classList.add('loading');
      floatingBtn.innerHTML = `
        <div class="c2gh-spinner"></div>
        <span>Pushing...</span>
        <span class="c2gh-btn-badge">${repoName}</span>
      `;
    }

    const initialToast = showToast({
      title: '⏳ Preparing Notebook...',
      message: `Extracting latest content for ${repoName}...`,
      type: 'info',
      duration: 4000
    });

    try {
      // 2. Extract notebook
      const extractResult = await requestExtraction();
      if (!extractResult.success) {
        throw new Error(extractResult.error || 'Failed to extract notebook content.');
      }

      let filePath = extractResult.filename || 'Colab_Notebook.ipynb';
      if (subfolder && subfolder.trim()) {
        const cleanFolder = subfolder.trim().replace(/^\/+|\/+$/g, '');
        filePath = `${cleanFolder}/${filePath}`;
      }

      // 3. Delegate push to background worker
      const pushResponse = await chrome.runtime.sendMessage({
        action: 'EXECUTE_GITHUB_PUSH',
        token,
        repoName,
        branch,
        filePath,
        content: extractResult.content,
        isPrivate
      });

      if (!pushResponse || !pushResponse.success) {
        throw new Error(pushResponse?.error || 'GitHub push failed.');
      }

      // 4. Success Toast
      showToast({
        title: '✅ Pushed to DSV_Colab!',
        message: `${pushResponse.filePath} was committed to ${repoName} (${pushResponse.isUpdate ? 'Updated' : 'Created'}).`,
        type: 'success',
        linkText: 'View on GitHub ↗',
        linkUrl: pushResponse.fileUrl,
        duration: 10000
      });

    } catch (err) {
      console.error('[Colab to GitHub] Push error:', err);
      showToast({
        title: '❌ Push Failed',
        message: err.message || 'An error occurred while pushing to GitHub.',
        type: 'error',
        duration: 8000
      });
    } finally {
      // Restore button
      if (floatingBtn) {
        floatingBtn.classList.remove('loading');
        floatingBtn.innerHTML = `
          <div class="c2gh-btn-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </div>
          <span>Push</span>
          <span class="c2gh-btn-badge">${repoName}</span>
        `;
      }
    }
  }

  // Create floating button in bottom right
  async function initFloatingButton() {
    if (document.getElementById('c2gh-floating-btn')) return;

    const config = await chrome.storage.local.get(['repo_name']);
    const repoName = config.repo_name || 'DSV_Colab';

    floatingBtn = document.createElement('button');
    floatingBtn.id = 'c2gh-floating-btn';
    floatingBtn.className = 'c2gh-floating-btn';
    floatingBtn.setAttribute('title', `One-click push to GitHub repository: ${repoName}`);
    floatingBtn.innerHTML = `
      <div class="c2gh-btn-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </div>
      <span>Push</span>
      <span class="c2gh-btn-badge">${repoName}</span>
    `;

    floatingBtn.addEventListener('click', handlePush);
    document.body.appendChild(floatingBtn);
  }

  // Handle messages from extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING_COLAB') {
      sendResponse({
        isColab: true,
        title: document.title
      });
      return true;
    }

    if (request.action === 'EXTRACT_FROM_PAGE') {
      requestExtraction().then(result => {
        sendResponse(result);
      });
      return true; // keep async channel open
    }
  });

  // Listen for storage changes to update button repo badge
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.repo_name && floatingBtn) {
      const badge = floatingBtn.querySelector('.c2gh-btn-badge');
      if (badge) {
        badge.textContent = changes.repo_name.newValue || 'DSV_Colab';
      }
    }
  });

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingButton);
  } else {
    initFloatingButton();
  }
})();
