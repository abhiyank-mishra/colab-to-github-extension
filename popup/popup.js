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

        // Extract clean name from tab title
        let rawTitle = tab.title || '';
        let cleanName = rawTitle.replace(/\s*-\s*Colaboratory/i, '').replace(/\s*-\s*Colab/i, '').trim();
        if (cleanName && !cleanName.endsWith('.ipynb')) {
          cleanName += '.ipynb';
        }
        if (!cleanName) cleanName = 'Colab_Notebook.ipynb';

        notebookFileName.value = cleanName;
        commitMessageInput.value = `Update ${cleanName} from Google Colab`;

        // Check if token exists
        const { github_token } = await chrome.storage.local.get('github_token');
        if (github_token) {
          pushControlsCard.classList.remove('hidden');
        }
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
    primaryPushBtnText.textContent = 'Pushing...';

    // Show Progress Stepper
    progressStepper.classList.remove('hidden');
    stepExtract.className = 'stepper-item active';
    stepRepo.className = 'stepper-item';
    stepPush.className = 'stepper-item';

    try {
      // 1. Extract notebook from Colab tab
      const extractRes = await chrome.tabs.sendMessage(activeTab.id, {
        action: 'EXTRACT_FROM_PAGE'
      });

      if (!extractRes || !extractRes.success) {
        throw new Error(extractRes?.error || 'Failed to extract notebook from Colab page.');
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
      }, 500);

    } catch (err) {
      console.error('Push operation failed:', err);
      progressStepper.classList.add('hidden');
      errorMessageText.textContent = err.message || 'Push failed due to an unexpected error.';
      errorCard.classList.remove('hidden');
    } finally {
      primaryPushBtn.disabled = false;
      primaryPushBtnText.textContent = `Push to ${repoName}`;
    }
  });

  // Auto-update commit message when filename changes
  notebookFileName.addEventListener('input', () => {
    let name = notebookFileName.value.trim();
    if (name) {
      commitMessageInput.value = `Update ${name} from Google Colab`;
    }
  });

  // Initialization
  await loadSettings();
  await checkActiveTab();
});
