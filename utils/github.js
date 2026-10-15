/**
 * GitHub API Helper for Colab to GitHub Extension
 */

const GitHubAPI = {
  BASE_URL: 'https://api.github.com',

  getHeaders(token) {
    return {
      'Authorization': `Bearer ${token.trim()}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  },

  /**
   * Safely convert a UTF-8 string to Base64 (supporting emojis, unicode, math symbols)
   */
  toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(binString);
  },

  /**
   * Validate token and fetch user details
   */
  async getUser(token) {
    if (!token || !token.trim()) {
      throw new Error('GitHub Personal Access Token is required.');
    }
    const res = await fetch(`${this.BASE_URL}/user`, {
      method: 'GET',
      headers: this.getHeaders(token)
    });

    if (res.status === 401) {
      throw new Error('Invalid GitHub token. Please verify your token and permissions.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error (${res.status})`);
    }

    return await res.json();
  },

  /**
   * Check if repository exists, and create it if it does not
   */
  async getOrCreateRepo(token, repoName = 'DSV_Colab', isPrivate = false) {
    const user = await this.getUser(token);
    const username = user.login;
    const cleanRepoName = repoName.trim();

    // 1. Check if repo exists
    const checkRes = await fetch(`${this.BASE_URL}/repos/${username}/${cleanRepoName}`, {
      method: 'GET',
      headers: this.getHeaders(token)
    });

    if (checkRes.ok) {
      const repo = await checkRes.json();
      return {
        created: false,
        repo,
        username,
        defaultBranch: repo.default_branch || 'main'
      };
    }

    if (checkRes.status === 404) {
      // 2. Repo does not exist, create it
      const createRes = await fetch(`${this.BASE_URL}/user/repos`, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({
          name: cleanRepoName,
          description: 'Google Colab Notebooks auto-pushed from Google Colab',
          private: isPrivate,
          auto_init: true
        })
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to create repository ${cleanRepoName}`);
      }

      const newRepo = await createRes.json();
      // Wait 1.5 seconds to let GitHub initialize the branch and commit
      await new Promise(resolve => setTimeout(resolve, 1500));

      return {
        created: true,
        repo: newRepo,
        username,
        defaultBranch: newRepo.default_branch || 'main'
      };
    }

    const err = await checkRes.json().catch(() => ({}));
    throw new Error(err.message || `Error checking repository status (${checkRes.status})`);
  },

  /**
   * Check if a specific file exists in the repository
   */
  async checkFileExists(token, repoName = 'DSV_Colab', filePath, branch = 'main') {
    if (!token || !filePath) return { exists: false };
    try {
      const user = await this.getUser(token);
      let normalizedPath = filePath.trim();
      if (!normalizedPath.toLowerCase().endsWith('.ipynb')) {
        normalizedPath += '.ipynb';
      }

      const res = await fetch(
        `${this.BASE_URL}/repos/${user.login}/${repoName.trim()}/contents/${encodeURIComponent(normalizedPath)}?ref=${branch || 'main'}`,
        {
          method: 'GET',
          headers: this.getHeaders(token)
        }
      );

      if (res.ok) {
        const data = await res.json();
        return {
          exists: true,
          sha: data.sha,
          filePath: normalizedPath,
          fileUrl: data.html_url,
          username: user.login,
          repoName: repoName.trim(),
          branch: branch || 'main'
        };
      }
      return { exists: false, filePath: normalizedPath };
    } catch (e) {
      return { exists: false, error: e.message };
    }
  },

  /**
   * Push or update a notebook file in the repository
   */
  async pushNotebook({
    token,
    repoName = 'DSV_Colab',
    filePath,
    content,
    commitMessage,
    branch = 'main',
    isPrivate = false
  }) {
    if (!filePath) {
      throw new Error('File name / path cannot be empty.');
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error(`Notebook content is empty or invalid (type: ${typeof content}, length: ${content?.length || 0}).`);
    }

    // Ensure repo exists or create it
    const { username, defaultBranch } = await this.getOrCreateRepo(token, repoName, isPrivate);
    const targetBranch = branch || defaultBranch || 'main';

    // Normalize file path (ensure .ipynb extension)
    let normalizedPath = filePath.trim();
    if (!normalizedPath.toLowerCase().endsWith('.ipynb')) {
      normalizedPath += '.ipynb';
    }

    // Check if the file already exists to get its SHA
    let existingSha = null;
    const fileRes = await fetch(
      `${this.BASE_URL}/repos/${username}/${repoName.trim()}/contents/${encodeURIComponent(normalizedPath)}?ref=${targetBranch}`,
      {
        method: 'GET',
        headers: this.getHeaders(token)
      }
    );

    if (fileRes.ok) {
      const fileData = await fileRes.json();
      existingSha = fileData.sha;
    }

    // Format JSON with 2 spaces indentation for clean Git diffs
    let formattedContent = content;
    try {
      const parsed = JSON.parse(content);
      formattedContent = JSON.stringify(parsed, null, 2);
    } catch (e) {
      formattedContent = content;
    }

    // Prepare commit body
    const base64Content = this.toBase64(formattedContent);
    const finalCommitMessage = commitMessage || (existingSha 
      ? `Update ${normalizedPath} from Google Colab [${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
      : `Add ${normalizedPath} from Google Colab [${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`);

    const putBody = {
      message: finalCommitMessage,
      content: base64Content,
      branch: targetBranch
    };

    if (existingSha) {
      putBody.sha = existingSha;
    }

    // Commit file
    const putRes = await fetch(
      `${this.BASE_URL}/repos/${username}/${repoName.trim()}/contents/${encodeURIComponent(normalizedPath)}`,
      {
        method: 'PUT',
        headers: this.getHeaders(token),
        body: JSON.stringify(putBody)
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `Failed to push file to GitHub (${putRes.status})`);
    }

    const putData = await putRes.json();

    return {
      success: true,
      repoName: repoName.trim(),
      filePath: normalizedPath,
      fileUrl: putData.content?.html_url || `https://github.com/${username}/${repoName.trim()}/blob/${targetBranch}/${normalizedPath}`,
      commitUrl: putData.commit?.html_url || `https://github.com/${username}/${repoName.trim()}/commit/${putData.commit?.sha}`,
      isUpdate: Boolean(existingSha),
      branch: targetBranch,
      username
    };
  }
};

// Export for module or global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubAPI;
} else if (typeof window !== 'undefined') {
  window.GitHubAPI = GitHubAPI;
}
