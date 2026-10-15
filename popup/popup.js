/**
 * Popup Script for Colab to GitHub Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Navigation
  const tabPushBtn = document.getElementById('tabPushBtn');
  const tabSettingsBtn = document.getElementById('tabSettingsBtn');
  const pushView = document.getElementById('pushView');
  const settingsView = document.getElementById('settingsView');
  const goToSettingsBtn = document.getElementById('goToSettingsBtn');

  // DOM Elements - Header & Status
  const colabStatus = document.getElementById('colabStatus');
  const colabStatusText = document.getElementById('colabStatusText');

  // DOM Elements - Push View
  const tokenWarningCard = document.getElementById('tokenWarningCard');
  const notColabCard = document.getElementById('notColabCard');
  const pushControlsCard = document.getElementById('pushControlsCard');
  const displayRepoName = document.getElementById('displayRepoName');
  const displayBranchName = document.getElementById('displayBranchName');
  const notebookFileName = document.getElementById('notebookFileName');
  const commitMessageInput = document.getElementById('commitMessageInput');
  const primaryPushBtn = document.getElementById('primaryPushBtn');
  const primaryPushBtnText = document.getElementById('primaryPushBtnText');
  const primaryPushBtnIcon = document.getElementById('primaryPushBtnIcon');
  const fileModeBadge = document.getElementById('fileModeBadge');
  const fileModeText = document.getElementById('fileModeText');
  const fileStatusIndicator = document.getElementById('fileStatusIndicator');
  const fileExistingHint = document.getElementById('fileExistingHint');

  let currentFileExists = false;

  function updatePushUIState(exists, filename, repoName) {
    currentFileExists = Boolean(exists);
    const cleanName = filename || notebookFileName.value.trim() || 'notebook.ipynb';
    const cleanRepo = repoName || displayRepoName.textContent || 'DSV_Colab';

    if (currentFileExists) {
      if (fileModeBadge) {
        fileModeBadge.className = 'mode-pill update';
        if (fileModeText) fileModeText.textContent = '🔄 Existing File';
      }
      if (fileStatusIndicator) {
        fileStatusIndicator.className = 'file-status-indicator existing';
        fileStatusIndicator.textContent = '(Found on GitHub)';
      }
      if (fileExistingHint) {
        fileExistingHint.textContent = `File already exists in ${cleanRepo}. Pushing will update the commit.`;
        fileExistingHint.classList.remove('hidden');
      }
      primaryPushBtn.className = 'btn btn-primary btn-block btn-update';
      if (primaryPushBtnIcon) primaryPushBtnIcon.textContent = '🔄';
      primaryPushBtnText.textContent = `Update in ${cleanRepo}`;
      commitMessageInput.value = `Update ${cleanName} from Google Colab [${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`;
    } else {
      if (fileModeBadge) {
        fileModeBadge.className = 'mode-pill new';
        if (fileModeText) fileModeText.textContent = '✨ New File';
      }
      if (fileStatusIndicator) {
        fileStatusIndicator.className = 'file-status-indicator new';
        fileStatusIndicator.textContent = '(New)';
      }
      if (fileExistingHint) {
        fileExistingHint.classList.add('hidden');
      }
      primaryPushBtn.className = 'btn btn-primary btn-block';
      if (primaryPushBtnIcon) primaryPushBtnIcon.textContent = '🚀';
      primaryPushBtnText.textContent = `Push to ${cleanRepo}`;
      commitMessageInput.value = `Add ${cleanName} from Google Colab [${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`;
    }
  }

  // DOM Elements - Stepper
  const progressStepper = document.getElementById('progressStepper');
  const stepExtract = document.getElementById('stepExtract');
  const stepRepo = document.getElementById('stepRepo');
  const stepPush = document.getElementById('stepPush');

  // DOM Elements - Feedback Cards
  const successCard = document.getElementById('successCard');
  const successTitle = document.getElementById('successTitle');
  const successSubtitle = document.getElementById('successSubtitle');
  const viewOnGithubBtn = document.getElementById('viewOnGithubBtn');
  const viewCommitBtn = document.getElementById('viewCommitBtn');
  const errorCard = document.getElementById('errorCard');
  const errorMessageText = document.getElementById('errorMessageText');

  // DOM Elements - Settings View
  const githubTokenInput = document.getElementById('githubTokenInput');
  const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
  const verifyTokenBtn = document.getElementById('verifyTokenBtn');
  const autoFillTokenBtn = document.getElementById('autoFillTokenBtn');
  const autoConnectTokenBtn = document.getElementById('autoConnectTokenBtn');
  const tokenVerifyStatus = document.getElementById('tokenVerifyStatus');
  const repoNameInput = document.getElementById('repoNameInput');
  const branchNameInput = document.getElementById('branchNameInput');
  const subfolderInput = document.getElementById('subfolderInput');
  const isPrivateCheckbox = document.getElementById('isPrivateCheckbox');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsFeedback = document.getElementById('settingsFeedback');

  let activeTab = null;
  let isColabTab = false;

  // Tab switching
  function switchTab(target) {
    if (target === 'push') {
      tabPushBtn.classList.add('active');
      tabSettingsBtn.classList.remove('active');
      pushView.classList.remove('hidden');
      settingsView.classList.add('hidden');
    } else {
      tabSettingsBtn.classList.add('active');
      tabPushBtn.classList.remove('active');
      settingsView.classList.remove('hidden');
      pushView.classList.add('hidden');
    }
  }

  tabPushBtn.addEventListener('click', () => switchTab('push'));
  tabSettingsBtn.addEventListener('click', () => switchTab('settings'));
  goToSettingsBtn?.addEventListener('click', () => switchTab('settings'));

  // Toggle token password mask
  toggleTokenVisibility.addEventListener('click', () => {
    if (githubTokenInput.type === 'password') {
      githubTokenInput.type = 'text';
      toggleTokenVisibility.textContent = '🔒';
    } else {
      githubTokenInput.type = 'password';
      toggleTokenVisibility.textContent = '👁️';
    }
  });

  async function handleAutoConnect() {
    try {
      const def = await chrome.runtime.sendMessage({ action: 'GET_DEFAULT_TOKEN' });
      if (def?.defaultToken) {
        githubTokenInput.value = def.defaultToken;
        await chrome.storage.local.set({ github_token: def.defaultToken });
        tokenVerifyStatus.className = 'verify-status success';
        tokenVerifyStatus.textContent = 'Auto-connected with default token ✅';
        tokenVerifyStatus.classList.remove('hidden');
        await loadSettings();
        if (isColabTab) {
          pushControlsCard.classList.remove('hidden');
        }
      }
    } catch (e) {
      console.warn('Auto connect failed:', e);
    }
  }

  autoConnectTokenBtn?.addEventListener('click', handleAutoConnect);
  autoFillTokenBtn?.addEventListener('click', handleAutoConnect);

  // Load and apply settings
  async function loadSettings() {
    const config = await chrome.storage.local.get([
      'github_token',
      'repo_name',
      'branch',
      'subfolder',
      'is_private'
    ]);

    let token = config.github_token || '';
    if (!token) {
      try {
        const def = await chrome.runtime.sendMessage({ action: 'GET_DEFAULT_TOKEN' });
        if (def?.defaultToken) {
          token = def.defaultToken;
          await chrome.storage.local.set({ github_token: token });
        }
      } catch (e) {
        console.warn('Auto-fetch default token failed:', e);
      }
    }

    const repoName = config.repo_name || 'DSV_Colab';
    const branch = config.branch || 'main';
    const subfolder = config.subfolder || '';
    const isPrivate = Boolean(config.is_private);

    // Update settings inputs
    githubTokenInput.value = token;
    repoNameInput.value = repoName;
    branchNameInput.value = branch;
    subfolderInput.value = subfolder;
    isPrivateCheckbox.checked = isPrivate;

    // Update display labels in Push View
    displayRepoName.textContent = repoName;
    displayBranchName.textContent = branch;
    primaryPushBtnText.textContent = `Push to ${repoName}`;

    // Show/hide token warning
    if (!token) {
      tokenWarningCard.classList.remove('hidden');
      pushControlsCard.classList.add('hidden');
    } else {
      tokenWarningCard.classList.add('hidden');
      if (isColabTab) {
        pushControlsCard.classList.remove('hidden');
      }
    }
  }

  // Detect active tab and Colab context
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab;

      if (tab?.url && tab.url.includes('colab.research.google.com')) {
        isColabTab = true;
        colabStatus.className = 'colab-status connected';
        colabStatusText.textContent = 'Google Colab Connected';
        notColabCard.classList.add('hidden');

        // Check if token exists
        const { github_token, repo_name, branch, subfolder } = await chrome.storage.local.get([
          'github_token',
          'repo_name',
          'branch',
          'subfolder'
        ]);

        if (github_token) {
          pushControlsCard.classList.remove('hidden');
        }

        const targetRepo = repo_name || 'DSV_Colab';
        let detectedName = '';
        let fileExists = false;

        // 1. Query active tab for live notebook info directly from Colab DOM
        try {
          const info = await chrome.tabs.sendMessage(tab.id, { action: 'GET_NOTEBOOK_INFO' });
          if (info && info.filename) {
            detectedName = info.filename;
            fileExists = Boolean(info.existsOnGithub);
          }
        } catch (e) {
          console.warn('Could not query Colab tab directly:', e);
        }

        // Fallback to title parsing if message didn't reply
        if (!detectedName) {
          let rawTitle = tab.title || '';
          let clean = rawTitle
            .replace(/\s*-\s*Colaboratory.*$/i, '')
            .replace(/\s*-\s*Colab.*$/i, '')
            .replace(/\s*-\s*Google Drive.*$/i, '')
            .replace(/^Google Colab\s*-\s*/i, '')
            .replace(/^Google Colaboratory\s*-\s*/i, '')
            .trim();

          if (clean && !/^Google\s*Colab(oratory)?$/i.test(clean) && !/^Welcome\s*to\s*Colab(oratory)?$/i.test(clean)) {
            detectedName = clean.endsWith('.ipynb') ? clean : `${clean}.ipynb`;
          } else {
            detectedName = 'Colab_Notebook.ipynb';
          }
        }

        notebookFileName.value = detectedName;

        // If fileExists was not confirmed yet, verify directly with GitHub
        if (github_token && !fileExists) {
          let targetPath = detectedName;
          if (subfolder && subfolder.trim()) {
            targetPath = `${subfolder.trim().replace(/^\/+|\/+$/g, '')}/${detectedName}`;
          }
          try {
            const checkRes = await chrome.runtime.sendMessage({
              action: 'CHECK_FILE_EXISTS',
              token: github_token,
              repoName: targetRepo,
              filePath: targetPath,
              branch: branch || 'main'
            });
            if (checkRes?.success && checkRes.exists) {
              fileExists = true;
            }
          } catch (e) {}
        }

        updatePushUIState(fileExists, detectedName, targetRepo);
      } else {
        isColabTab = false;
        colabStatus.className = 'colab-status disconnected';
        colabStatusText.textContent = 'No Colab Tab Active';
        notColabCard.classList.remove('hidden');
        pushControlsCard.classList.add('hidden');
      }
    } catch (err) {
      console.warn('Error checking active tab:', err);
      colabStatus.className = 'colab-status disconnected';
      colabStatusText.textContent = 'Detection Error';
    }
  }

  // Verify GitHub Token
  verifyTokenBtn.addEventListener('click', async () => {
    const token = githubTokenInput.value.trim();
    if (!token) {
      tokenVerifyStatus.className = 'verify-status error';
      tokenVerifyStatus.textContent = 'Please enter a token first.';
      tokenVerifyStatus.classList.remove('hidden');
      return;
    }

    verifyTokenBtn.disabled = true;
    verifyTokenBtn.textContent = 'Verifying...';
    tokenVerifyStatus.className = 'verify-status';
    tokenVerifyStatus.textContent = 'Checking with GitHub...';
    tokenVerifyStatus.classList.remove('hidden');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'VERIFY_GITHUB_TOKEN',
        token
      });

      if (response && response.success) {
        tokenVerifyStatus.className = 'verify-status success';
        tokenVerifyStatus.textContent = `Valid! Connected as @${response.user.login} (${response.user.name || ''})`;
      } else {
        tokenVerifyStatus.className = 'verify-status error';
        tokenVerifyStatus.textContent = response?.error || 'Token verification failed.';
      }
    } catch (err) {
      tokenVerifyStatus.className = 'verify-status error';
      tokenVerifyStatus.textContent = err.message || 'Connection error.';
    } finally {
      verifyTokenBtn.disabled = false;
      verifyTokenBtn.textContent = 'Verify Token';
    }
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', async () => {
    const token = githubTokenInput.value.trim();
    const repoName = repoNameInput.value.trim() || 'DSV_Colab';
    const branch = branchNameInput.value.trim() || 'main';
    const subfolder = subfolderInput.value.trim();
    const isPrivate = isPrivateCheckbox.checked;

    await chrome.storage.local.set({
      github_token: token,
      repo_name: repoName,
      branch: branch,
      subfolder: subfolder,
      is_private: isPrivate
    });

    settingsFeedback.classList.remove('hidden');
    setTimeout(() => {
      settingsFeedback.classList.add('hidden');
    }, 2500);

    // Refresh push tab state
    await loadSettings();
  });

  // Multi-tier extractor: Messages content script, falls back to background Drive fetch or direct scripting
  async function extractNotebookFromTab(tab) {
    // Strategy 1: Message active content script
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_FROM_PAGE' });
      if (res && res.success && res.content) {
        return res;
      }
    } catch (err) {
      console.warn('[Colab to GitHub] Direct content script message failed, falling back:', err.message);
    }

    // Strategy 2: Google Drive direct fetch via background service worker (handles unrefreshed tabs)
    const driveMatch = (tab.url || '').match(/\/drive\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      try {
        console.log('[Colab to GitHub] Attempting background Google Drive fetch for fileId:', driveMatch[1]);
        const driveRes = await chrome.runtime.sendMessage({
          action: 'FETCH_DRIVE_NOTEBOOK',
          fileId: driveMatch[1]
        });
        if (driveRes && driveRes.success && driveRes.content) {
          return {
            success: true,
            content: driveRes.content,
            filename: notebookFileName.value.trim() || 'Colab_Notebook.ipynb',
            method: 'background-drive'
          };
        }
      } catch (e) {
        console.warn('[Colab to GitHub] Background drive fetch warning:', e);
      }
    }

    // Strategy 3: Dynamic script execution via chrome.scripting.executeScript
    try {
      console.log('[Colab to GitHub] Attempting direct in-tab execution via chrome.scripting...');
      const [execResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // A. Try internal model
          try {
            const m = window.colab?.global?.notebook || window._colab?.notebook;
            if (m && typeof m.toJSON === 'function') {
              return { success: true, content: JSON.stringify(m.toJSON(), null, 2) };
            }
          } catch (e) {}

          // B. DOM Cell Scraper
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
              kernelspec: { name: "python3", display_name: "Python 3" },
              language_info: { name: "python" }
            },
            cells: cells.length > 0 ? cells : [
              {
                cell_type: "code",
                execution_count: 1,
                metadata: { id: "cell_init" },
                outputs: [],
                source: ["# Exported from Google Colab\n"]
              }
            ]
          };

          return { success: true, content: JSON.stringify(ipynb, null, 2) };
        }
      });

      if (execResult?.result?.success && execResult.result.content) {
        return {
          success: true,
          content: execResult.result.content,
          filename: notebookFileName.value.trim() || 'Colab_Notebook.ipynb',
          method: 'scripting-exec'
        };
      }
    } catch (e) {
      console.warn('[Colab to GitHub] Dynamic scripting execution failed:', e);
    }

    throw new Error('Could not connect to Colab tab. Please refresh the Colab tab (F5) once and try again.');
  }

  // Handle Primary Push Button
  primaryPushBtn.addEventListener('click', async () => {
    if (!isColabTab || !activeTab) return;

    const config = await chrome.storage.local.get([
      'github_token',
      'repo_name',
      'branch',
      'subfolder',
      'is_private'
    ]);

    const token = config.github_token;
    const repoName = config.repo_name || 'DSV_Colab';
    const branch = config.branch || 'main';
    const subfolder = config.subfolder || '';
    const isPrivate = Boolean(config.is_private);
    let fileName = notebookFileName.value.trim() || 'Colab_Notebook.ipynb';
    if (!fileName.endsWith('.ipynb')) fileName += '.ipynb';

    const commitMsg = commitMessageInput.value.trim();

    if (!token) {
      switchTab('settings');
      return;
    }

    // Reset UI states
    successCard.classList.add('hidden');
    errorCard.classList.add('hidden');
    primaryPushBtn.disabled = true;
    primaryPushBtnText.textContent = currentFileExists ? 'Updating...' : 'Pushing...';

    // Show Progress Stepper
    progressStepper.classList.remove('hidden');
    stepExtract.className = 'stepper-item active';
    stepRepo.className = 'stepper-item';
    stepPush.className = 'stepper-item';

    try {
      // 1. Extract notebook from Colab tab with multi-tier fallback
      const extractRes = await extractNotebookFromTab(activeTab);

      if (!extractRes || !extractRes.content) {
        throw new Error('Failed to extract notebook content from Colab tab.');
      }

      stepExtract.className = 'stepper-item done';
      stepRepo.className = 'stepper-item active';

      let targetPath = extractRes.filename || fileName;
      if (subfolder) {
        const cleanFolder = subfolder.replace(/^\/+|\/+$/g, '');
        targetPath = `${cleanFolder}/${targetPath}`;
      }

      // 2 & 3. Check/Create Repo and Commit via Background Service Worker
      stepRepo.className = 'stepper-item active';
      
      const pushRes = await chrome.runtime.sendMessage({
        action: 'EXECUTE_GITHUB_PUSH',
        token,
        repoName,
        branch,
        filePath: targetPath,
        content: extractRes.content,
        commitMessage: commitMsg,
        isPrivate
      });

      if (!pushRes || !pushRes.success) {
        throw new Error(pushRes?.error || 'Failed to push file to GitHub repository.');
      }

      stepRepo.className = 'stepper-item done';
      stepPush.className = 'stepper-item done';

      // Hide stepper, show success card
      setTimeout(() => {
        progressStepper.classList.add('hidden');
        successTitle.textContent = pushRes.isUpdate ? 'Notebook Updated!' : 'Notebook Created!';
        successSubtitle.textContent = `Pushed to ${pushRes.repoName} (${pushRes.branch}) as ${pushRes.filePath}`;
        viewOnGithubBtn.href = pushRes.fileUrl;
        viewCommitBtn.href = pushRes.commitUrl;
        successCard.classList.remove('hidden');
        updatePushUIState(true, pushRes.filePath, pushRes.repoName);
      }, 500);

    } catch (err) {
      console.error('Push operation failed:', err);
      progressStepper.classList.add('hidden');
      errorMessageText.textContent = err.message || 'Push failed due to an unexpected error.';
      errorCard.classList.remove('hidden');
    } finally {
      primaryPushBtn.disabled = false;
      primaryPushBtnText.textContent = currentFileExists ? `Update in ${repoName}` : `Push to ${repoName}`;
    }
  });

  // Dynamic file check and commit message update when user edits filename
  let nameDebounceTimer = null;
  notebookFileName.addEventListener('input', () => {
    clearTimeout(nameDebounceTimer);
    nameDebounceTimer = setTimeout(async () => {
      let name = notebookFileName.value.trim();
      if (!name) return;
      if (!name.endsWith('.ipynb')) name += '.ipynb';

      const config = await chrome.storage.local.get(['github_token', 'repo_name', 'branch', 'subfolder']);
      const token = config.github_token;
      const repoName = config.repo_name || 'DSV_Colab';
      const branch = config.branch || 'main';
      const subfolder = config.subfolder || '';

      let targetPath = name;
      if (subfolder && subfolder.trim()) {
        targetPath = `${subfolder.trim().replace(/^\/+|\/+$/g, '')}/${name}`;
      }

      if (token) {
        try {
          const res = await chrome.runtime.sendMessage({
            action: 'CHECK_FILE_EXISTS',
            token,
            repoName,
            filePath: targetPath,
            branch
          });
          updatePushUIState(Boolean(res?.exists), name, repoName);
        } catch (e) {
          updatePushUIState(false, name, repoName);
        }
      } else {
        updatePushUIState(false, name, repoName);
      }
    }, 400);
  });

  // Initialization
  await loadSettings();
  await checkActiveTab();
});
