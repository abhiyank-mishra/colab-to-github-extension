/**
 * Content Script (ISOLATED World)
 * Injects floating button and toast notifications into Google Colab.
 * Bridges communication between the extension background/popup and content-main.js.
 * Dynamically detects whether notebook is already in GitHub (Update mode vs Push mode).
 */

(function () {
  'use strict';

  if (window.__COLAB_TO_GITHUB_INJECTED__) return;
  window.__COLAB_TO_GITHUB_INJECTED__ = true;

  let toastContainer = null;
  let floatingBtn = null;

  // Real-time notebook tracking state
  const notebookState = {
    filename: '',
    existsOnGithub: false,
    sha: null,
    fileUrl: null,
    repoName: 'DSV_Colab',
    checking: false
  };

  /**
   * Comprehensive notebook filename detector from Colab DOM
   */
  function getNotebookName() {
    // 1. Text inputs in the header / toolbar
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), input.editable, #header input'));
    
    // 1a. Input whose value ends with .ipynb
    const ipynbInput = inputs.find(i => i.value && i.value.trim().endsWith('.ipynb'));
    if (ipynbInput && ipynbInput.value.trim()) {
      return ipynbInput.value.trim();
    }

    // 1b. Input with iron-googledrive-title or aria-label containing filename/notebook
    const titleAttrInput = inputs.find(i => {
      const aria = (i.getAttribute('aria-label') || '').toLowerCase();
      const title = (i.getAttribute('title') || '').toLowerCase();
      const id = (i.id || '').toLowerCase();
      const cls = (i.className || '').toLowerCase();
      return aria.includes('notebook') || aria.includes('file') || 
             title.includes('notebook') || title.includes('file') ||
             id.includes('title') || id.includes('name') || 
             cls.includes('title') || cls.includes('name') ||
             i.hasAttribute('iron-googledrive-title');
    });
    if (titleAttrInput && titleAttrInput.value && titleAttrInput.value.trim()) {
      let name = titleAttrInput.value.trim();
      return name.endsWith('.ipynb') ? name : `${name}.ipynb`;
    }

    // 1c. Any input inside header/toolbar area (excluding search boxes)
    const headerInput = document.querySelector('#header input, colab-header input, [role="banner"] input, colab-studio-toolbar input, colab-doc-name input');
    if (headerInput && headerInput.value && headerInput.value.trim() && !headerInput.value.toLowerCase().includes('search')) {
      let name = headerInput.value.trim();
      return name.endsWith('.ipynb') ? name : `${name}.ipynb`;
    }

    // 2. DOM elements with notebook title
    const titleContainers = document.querySelectorAll('#doc-name, .notebook-title, colab-doc-name, [data-doc-name]');
    for (const el of titleContainers) {
      const text = el.textContent?.trim();
      if (text && !text.toLowerCase().includes('google colab')) {
        return text.endsWith('.ipynb') ? text : `${text}.ipynb`;
      }
    }

    // 3. Document title (stripping generic prefixes/suffixes)
    const docTitle = document.title || '';
    if (docTitle) {
      let clean = docTitle
        .replace(/\s*-\s*Colaboratory.*$/i, '')
        .replace(/\s*-\s*Colab.*$/i, '')
        .replace(/\s*-\s*Google Drive.*$/i, '')
        .replace(/^Google Colab\s*-\s*/i, '')
        .replace(/^Google Colaboratory\s*-\s*/i, '')
        .trim();

      if (clean && !/^Google\s*Colab(oratory)?$/i.test(clean) && !/^Welcome\s*to\s*Colab(oratory)?$/i.test(clean)) {
        return clean.endsWith('.ipynb') ? clean : `${clean}.ipynb`;
      }
    }

    // 4. URL path fallback
    const ghMatch = window.location.pathname.match(/\/([^/]+\.ipynb)$/i);
    if (ghMatch && ghMatch[1]) {
      return decodeURIComponent(ghMatch[1]);
    }

    return 'Colab_Notebook.ipynb';
  }

  /**
   * DOM cell scraper and Jupyter notebook JSON builder
   */
  function reconstructNotebookFromDOM() {
    try {
      const cells = [];
      const cellEls = document.querySelectorAll('colab-cell, .cell, [class*="colab-cell"]');
      cellEls.forEach((cellEl, idx) => {
        const isCode = cellEl.tagName.toLowerCase().includes('code') || 
                       cellEl.classList.contains('code') || 
                       Boolean(cellEl.querySelector('.code-cell, .monaco-editor, .view-lines'));
        
        const textEditor = cellEl.querySelector('.monaco-editor, .view-lines, textarea, pre');
        let sourceText = '';
        if (textEditor) {
          const lines = textEditor.querySelectorAll('.view-line');
          if (lines.length > 0) {
            sourceText = Array.from(lines).map(l => l.textContent).join('\n');
          } else {
            sourceText = textEditor.textContent || textEditor.value || '';
          }
        } else {
          sourceText = cellEl.textContent || '';
        }

        const formattedSource = sourceText.split('\n').map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l));

        if (isCode) {
          cells.push({
            cell_type: 'code',
            execution_count: idx + 1,
            metadata: { id: `cell_${idx}` },
            outputs: [],
            source: formattedSource
          });
        } else {
          cells.push({
            cell_type: 'markdown',
            metadata: { id: `cell_${idx}` },
            source: formattedSource
          });
        }
      });

      const ipynb = {
        nbformat: 4,
        nbformat_minor: 0,
        metadata: {
          colab: { provenance: [] },
          kernelspec: { name: 'python3', display_name: 'Python 3' },
          language_info: { name: 'python' }
        },
        cells: cells.length > 0 ? cells : [
          {
            cell_type: 'code',
            execution_count: 1,
            metadata: { id: 'cell_init' },
            outputs: [],
            source: ['# Exported from Google Colab\n']
          }
        ]
      };

      return JSON.stringify(ipynb, null, 2);
    } catch (e) {
      console.log('[Colab to GitHub] DOM cell scraper notice:', e.message);
      return null;
    }
  }

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

  // Update floating button visuals based on Push vs Update status (Compact, no badge)
  function updateButtonVisuals() {
    if (!floatingBtn || floatingBtn.classList.contains('loading') || floatingBtn.classList.contains('success-state')) return;

    const repoName = notebookState.repoName || 'DSV_Colab';

    if (notebookState.existsOnGithub) {
      floatingBtn.className = 'c2gh-floating-btn update-mode';
      floatingBtn.setAttribute('title', `File '${notebookState.filename}' exists in ${repoName}. Click to update changes.`);
      floatingBtn.innerHTML = `
        <div class="c2gh-btn-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z"/>
          </svg>
        </div>
        <span>Update</span>
      `;
    } else {
      floatingBtn.className = 'c2gh-floating-btn';
      floatingBtn.setAttribute('title', `New file '${notebookState.filename}'. Click to push to ${repoName}.`);
      floatingBtn.innerHTML = `
        <div class="c2gh-btn-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </div>
        <span>Push</span>
      `;
    }
  }

  // Check if notebook file already exists in GitHub repository
  async function checkFileOnGitHub() {
    const filename = getNotebookName();
    notebookState.filename = filename;

    const config = await chrome.storage.local.get(['github_token', 'repo_name', 'branch', 'subfolder']);
    let token = config.github_token;
    const repoName = config.repo_name || 'DSV_Colab';
    const branch = config.branch || 'main';
    const subfolder = config.subfolder || '';
    notebookState.repoName = repoName;

    if (!token) {
      try {
        const defRes = await chrome.runtime.sendMessage({ action: 'GET_DEFAULT_TOKEN' });
        if (defRes?.defaultToken) {
          token = defRes.defaultToken;
        }
      } catch (e) {}
    }

    if (!token) return;

    let targetPath = filename;
    if (subfolder && subfolder.trim()) {
      targetPath = `${subfolder.trim().replace(/^\/+|\/+$/g, '')}/${filename}`;
    }

    try {
      notebookState.checking = true;
      const res = await chrome.runtime.sendMessage({
        action: 'CHECK_FILE_EXISTS',
        token,
        repoName,
        filePath: targetPath,
        branch
      });

      if (res && res.success) {
        notebookState.existsOnGithub = Boolean(res.exists);
        notebookState.sha = res.sha || null;
        notebookState.fileUrl = res.fileUrl || null;
      }
    } catch (e) {
      console.log('[Colab to GitHub] Error checking file status:', e.message);
    } finally {
      notebookState.checking = false;
      updateButtonVisuals();
    }
  }

  // Handle push or update trigger
  async function handlePush() {
    if (floatingBtn && floatingBtn.classList.contains('loading')) return;

    const config = await chrome.storage.local.get([
      'github_token',
      'repo_name',
      'branch',
      'subfolder',
      'is_private'
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
        console.log('[Colab to GitHub] Could not fetch default token notice:', e.message);
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

    const isUpdate = notebookState.existsOnGithub;

    // Stage 1 Animation: Reading / Extracting notebook
    if (floatingBtn) {
      floatingBtn.className = 'c2gh-floating-btn loading';
      floatingBtn.innerHTML = `
        <div class="c2gh-btn-spinner"></div>
        <span>Reading...</span>
        <div class="c2gh-btn-progress" style="width: 35%;"></div>
      `;
    }

    showToast({
      title: isUpdate ? '⏳ Preparing Notebook Update...' : '⏳ Preparing New Notebook...',
      message: `Extracting latest notebook content for ${repoName}...`,
      type: 'info',
      duration: 3500
    });

    try {
      // 1. Extract notebook
      const extractResult = await requestExtraction();
      let content = extractResult?.content;

      if (extractResult?.needsDriveFetch && extractResult?.fileId && !content) {
        try {
          const driveRes = await chrome.runtime.sendMessage({
            action: 'FETCH_DRIVE_NOTEBOOK',
            fileId: extractResult.fileId
          });
          if (driveRes && driveRes.success && driveRes.content) {
            content = driveRes.content;
          }
        } catch (e) {
          console.log('[Colab to GitHub] Background drive fetch notice:', e.message);
        }
      }

      // High-reliability DOM fallback if content is still empty
      if (!content || !content.trim()) {
        content = reconstructNotebookFromDOM();
      }

      // Pre-flight assertion: ensure content is valid non-empty string
      if (!content || typeof content !== 'string' || content.trim().length < 20) {
        throw new Error('Notebook extraction failed: Content was empty. Please check your notebook cells.');
      }

      // Priority: use the accurately detected filename
      let fileName = extractResult?.filename || getNotebookName();
      notebookState.filename = fileName;

      let filePath = fileName;
      if (subfolder && subfolder.trim()) {
        const cleanFolder = subfolder.trim().replace(/^\/+|\/+$/g, '');
        filePath = `${cleanFolder}/${fileName}`;
      }

      const commitMessage = isUpdate
        ? `Update ${fileName} from Google Colab [${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
        : `Add ${fileName} from Google Colab [${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`;

      // Stage 2 Animation: Rocket Pushing to GitHub
      if (floatingBtn) {
        floatingBtn.innerHTML = `
          <span class="c2gh-btn-icon c2gh-anim-rocket">🚀</span>
          <span>${isUpdate ? 'Updating...' : 'Pushing...'}</span>
          <div class="c2gh-btn-progress" style="width: 80%;"></div>
        `;
      }

      // 2. Delegate push to background worker
      const pushResponse = await chrome.runtime.sendMessage({
        action: 'EXECUTE_GITHUB_PUSH',
        token,
        repoName,
        branch,
        filePath,
        content: content,
        commitMessage,
        isPrivate
      });

      if (!pushResponse || !pushResponse.success) {
        throw new Error(pushResponse?.error || 'GitHub push failed.');
      }

      // Mark as existing on GitHub
      notebookState.existsOnGithub = true;
      notebookState.fileUrl = pushResponse.fileUrl;

      // Stage 3 Animation: Pop Success Animation
      if (floatingBtn) {
        floatingBtn.className = 'c2gh-floating-btn success-state';
        floatingBtn.innerHTML = `
          <span class="c2gh-btn-icon c2gh-anim-pop">✅</span>
          <span>${pushResponse.isUpdate ? 'Updated!' : 'Pushed!'}</span>
          <div class="c2gh-btn-progress" style="width: 100%;"></div>
        `;
      }

      // 3. Success Toast
      showToast({
        title: pushResponse.isUpdate ? '✅ Updated in DSV_Colab!' : '✅ Pushed to DSV_Colab!',
        message: `${pushResponse.filePath} was ${pushResponse.isUpdate ? 'updated' : 'committed'} to ${repoName} (${pushResponse.branch}).`,
        type: 'success',
        linkText: 'View on GitHub ↗',
        linkUrl: pushResponse.fileUrl,
        duration: 10000
      });

      // Restore to compact idle state after 2.2 seconds
      setTimeout(() => {
        if (floatingBtn) {
          floatingBtn.classList.remove('success-state', 'loading');
          updateButtonVisuals();
        }
      }, 2200);

    } catch (err) {
      console.error('[Colab to GitHub] Push error:', err);

      // Error Animation
      if (floatingBtn) {
        floatingBtn.className = 'c2gh-floating-btn error-state';
        floatingBtn.innerHTML = `
          <span class="c2gh-btn-icon">❌</span>
          <span>Failed</span>
        `;
        setTimeout(() => {
          if (floatingBtn) {
            floatingBtn.classList.remove('error-state', 'loading');
            updateButtonVisuals();
          }
        }, 2500);
      }

      showToast({
        title: isUpdate ? '❌ Update Failed' : '❌ Push Failed',
        message: err.message || 'An error occurred while pushing to GitHub.',
        type: 'error',
        duration: 8000
      });
    } finally {
      // Re-verify file state with GitHub
      setTimeout(checkFileOnGitHub, 1200);
    }
  }

  // Create floating button in bottom right
  async function initFloatingButton() {
    if (document.getElementById('c2gh-floating-btn')) return;

    const config = await chrome.storage.local.get(['repo_name']);
    const repoName = config.repo_name || 'DSV_Colab';
    notebookState.repoName = repoName;

    floatingBtn = document.createElement('button');
    floatingBtn.id = 'c2gh-floating-btn';
    floatingBtn.className = 'c2gh-floating-btn';
    updateButtonVisuals();

    floatingBtn.addEventListener('click', handlePush);
    document.body.appendChild(floatingBtn);

    // Initial check
    setTimeout(checkFileOnGitHub, 800);
  }

  // Handle messages from extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING_COLAB') {
      const filename = getNotebookName();
      sendResponse({
        isColab: true,
        filename,
        title: document.title
      });
      return true;
    }

    if (request.action === 'GET_NOTEBOOK_INFO') {
      const filename = getNotebookName();
      notebookState.filename = filename;
      
      checkFileOnGitHub().then(() => {
        sendResponse({
          isColab: true,
          filename,
          existsOnGithub: notebookState.existsOnGithub,
          fileUrl: notebookState.fileUrl,
          sha: notebookState.sha,
          repoName: notebookState.repoName
        });
      });
      return true; // keep async channel open
    }

    if (request.action === 'EXTRACT_FROM_PAGE') {
      requestExtraction().then(async (result) => {
        let content = result.content;
        if (result.needsDriveFetch && result.fileId && !content) {
          try {
            const driveRes = await chrome.runtime.sendMessage({
              action: 'FETCH_DRIVE_NOTEBOOK',
              fileId: result.fileId
            });
            if (driveRes && driveRes.success && driveRes.content) {
              content = driveRes.content;
            }
          } catch (e) {
            console.log('[Colab to GitHub] Background drive fetch notice:', e.message);
          }
        }

        if (!content || !content.trim()) {
          content = reconstructNotebookFromDOM();
        }

        sendResponse({
          ...result,
          success: Boolean(content),
          content,
          filename: result.filename || getNotebookName()
        });
      });
      return true; // keep async channel open
    }
  });

  // Watch for filename changes in Colab UI
  function setupTitleObservers() {
    // 1. Listen to input/change events in header
    document.addEventListener('input', (e) => {
      if (e.target && (e.target.matches('input[type="text"]') || e.target.closest('#header, colab-header, colab-studio-toolbar'))) {
        setTimeout(checkFileOnGitHub, 600);
      }
    }, true);

    // 2. Observe document.title changes
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const observer = new MutationObserver(() => {
        setTimeout(checkFileOnGitHub, 600);
      });
      observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
  }

  // Listen for storage changes to update button repo badge
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.repo_name) {
      notebookState.repoName = changes.repo_name.newValue || 'DSV_Colab';
      updateButtonVisuals();
      checkFileOnGitHub();
    }
  });

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initFloatingButton();
      setupTitleObservers();
    });
  } else {
    initFloatingButton();
    setupTitleObservers();
  }
})();
