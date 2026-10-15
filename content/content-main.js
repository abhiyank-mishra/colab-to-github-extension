/**
 * Injected Script (MAIN World)
 * Runs directly in the Google Colab page execution context.
 * Intercepts Colab's native download flow to extract the exact serialized .ipynb JSON,
 * with fallbacks to Google Drive fetch and DOM reconstruction.
 */

(function () {
  'use strict';

  if (window.__COLAB_GITHUB_EXTENSION_INITIALIZED__) return;
  window.__COLAB_GITHUB_EXTENSION_INITIALIZED__ = true;

  console.log('[Colab to GitHub] Main world extractor active.');

  function getNotebookName() {
    // 1. Check all text inputs in the page that look like notebook titles
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), input.editable, #header input'));
    
    // 1a. Input whose value ends with .ipynb
    const ipynbInput = inputs.find(i => i.value && i.value.trim().endsWith('.ipynb'));
    if (ipynbInput && ipynbInput.value.trim()) {
      return ipynbInput.value.trim();
    }

    // 1b. Input with iron-googledrive-title, aria-label="Notebook filename", or title/name patterns
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

    // 2. Look for DOM elements with notebook title or contenteditable in header
    const titleContainers = document.querySelectorAll('#doc-name, .notebook-title, colab-doc-name, [data-doc-name]');
    for (const el of titleContainers) {
      const text = el.textContent?.trim();
      if (text && !text.toLowerCase().includes('google colab')) {
        return text.endsWith('.ipynb') ? text : `${text}.ipynb`;
      }
    }

    // 3. Inspect document.title thoroughly
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

    // 4. Check URL if opened from GitHub or Drive
    const ghMatch = window.location.pathname.match(/\/([^/]+\.ipynb)$/i);
    if (ghMatch && ghMatch[1]) {
      return decodeURIComponent(ghMatch[1]);
    }

    return 'Colab_Notebook.ipynb';
  }

  // Scrape visible/loaded cells from DOM as an emergency fallback
  function reconstructFromDOM() {
    const cells = [];
    const cellElements = document.querySelectorAll('colab-cell, .cell, [class*="colab-cell"]');

    cellElements.forEach((cellEl, idx) => {
      const isCode = cellEl.tagName.toLowerCase().includes('code') || 
                     cellEl.classList.contains('code') || 
                     cellEl.querySelector('.code-cell, .monaco-editor');
      
      const textEditor = cellEl.querySelector('.monaco-editor, .view-lines, textarea, pre');
      let sourceText = '';
      if (textEditor) {
        // Collect text from monaco view lines
        const lines = textEditor.querySelectorAll('.view-line');
        if (lines.length > 0) {
          sourceText = Array.from(lines).map(l => l.textContent).join('\n');
        } else {
          sourceText = textEditor.textContent || textEditor.value || '';
        }
      } else {
        sourceText = cellEl.textContent || '';
      }

      const formattedSource = sourceText.split('\n').map((line, i, arr) => (i < arr.length - 1 ? `${line}\n` : line));

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
        colab: {
          provenance: [],
          authorship_tag: "ABX9Ty"
        },
        kernelspec: {
          name: "python3",
          display_name: "Python 3"
        },
        language_info: {
          name: "python"
        }
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

    return JSON.stringify(ipynb, null, 2);
  }

  async function triggerColabDownloadAndIntercept(timeoutMs = 3500) {
    return new Promise((resolve) => {
      let isResolved = false;
      const originalClick = HTMLAnchorElement.prototype.click;
      let cleanupTimer = null;

      function done(result) {
        if (isResolved) return;
        isResolved = true;
        HTMLAnchorElement.prototype.click = originalClick;
        if (cleanupTimer) clearTimeout(cleanupTimer);
        resolve(result);
      }

      // 1. Intercept anchor clicks
      HTMLAnchorElement.prototype.click = function () {
        const downloadAttr = this.download || this.getAttribute('download') || '';
        const href = this.href || '';
        const isIpynb = downloadAttr.endsWith('.ipynb') || href.startsWith('blob:');

        if (isIpynb && href) {
          console.log('[Colab to GitHub] Intercepted Colab download blob:', downloadAttr, href);
          fetch(href)
            .then(res => res.text())
            .then(content => {
              done({
                success: true,
                filename: downloadAttr || getNotebookName(),
                content
              });
            })
            .catch(err => {
              console.warn('[Colab to GitHub] Failed to fetch intercepted blob:', err);
              done(null);
            });
          return; // Suppress native browser file download
        }

        return originalClick.apply(this, arguments);
      };

      // 2. Trigger Ctrl+S to flush latest changes
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }));

      // 3. Search and click "File" menu item
      setTimeout(() => {
        try {
          const allElements = Array.from(document.querySelectorAll('div, button, [role="menuitem"], [role="button"], span'));
          const fileMenu = allElements.find(el => {
            const text = el.textContent?.trim();
            return text === 'File' && el.offsetParent !== null && !el.closest('colab-cell');
          });

          if (fileMenu) {
            fileMenu.click();
            fileMenu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            fileMenu.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            console.log('[Colab to GitHub] Clicked File menu.');

            // 4. Wait for menu popup to show, find "Download .ipynb" or "Download"
            setTimeout(() => {
              const menuItems = Array.from(document.querySelectorAll('.goog-menuitem, [role="menuitem"], paper-item, div, span'));
              
              const downloadIpynb = menuItems.find(el => el.textContent?.includes('Download .ipynb') && el.offsetParent !== null);
              if (downloadIpynb) {
                console.log('[Colab to GitHub] Found Download .ipynb item, clicking.');
                downloadIpynb.click();
              } else {
                const downloadParent = menuItems.find(el => el.textContent?.trim() === 'Download' && el.offsetParent !== null);
                if (downloadParent) {
                  downloadParent.click();
                  downloadParent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  setTimeout(() => {
                    const subItems = Array.from(document.querySelectorAll('.goog-menuitem, [role="menuitem"], paper-item, div, span'));
                    const subIpynb = subItems.find(el => el.textContent?.includes('Download .ipynb') && el.offsetParent !== null);
                    if (subIpynb) {
                      subIpynb.click();
                    }
                  }, 200);
                }
              }
            }, 250);
          }
        } catch (e) {
          console.warn('[Colab to GitHub] Error navigating menu:', e);
        }
      }, 150);

      // Timeout fallback
      cleanupTimer = setTimeout(() => {
        done(null);
      }, timeoutMs);
    });
  }

  // Extract notebook content using primary method with fallbacks
  async function extractNotebook() {
    const filename = getNotebookName();

    // Strategy 1: Intercept native Colab download
    try {
      const intercepted = await triggerColabDownloadAndIntercept(2500);
      if (intercepted && intercepted.content) {
        return {
          success: true,
          filename: intercepted.filename || filename,
          content: intercepted.content,
          method: 'native-intercept'
        };
      }
    } catch (e) {
      console.warn('[Colab to GitHub] Intercept failed, falling back:', e);
    }

    // Strategy 2: Google Drive download link if URL is /drive/<fileId>
    try {
      const driveMatch = window.location.pathname.match(/\/drive\/([a-zA-Z0-9_-]+)/);
      if (driveMatch && driveMatch[1]) {
        const fileId = driveMatch[1];
        const res = await fetch(`https://docs.google.com/uc?export=download&id=${fileId}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const text = await res.text();
          if (text && (text.includes('"cells"') || text.includes('"nbformat"'))) {
            return {
              success: true,
              filename,
              content: text,
              method: 'drive-fetch'
            };
          }
        }
      }
    } catch (e) {
      console.warn('[Colab to GitHub] Drive fallback failed:', e);
    }

    // Strategy 3: DOM scraping and reconstruction
    try {
      const domContent = reconstructFromDOM();
      return {
        success: true,
        filename,
        content: domContent,
        method: 'dom-reconstruction'
      };
    } catch (e) {
      return {
        success: false,
        error: `All extraction methods failed: ${e.message}`
      };
    }
  }

  // Listen for extraction requests from content.js (ISOLATED world)
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'COLAB_EXTRACT_REQUEST') {
      return;
    }

    const result = await extractNotebook();
    window.postMessage({
      type: 'COLAB_EXTRACT_RESPONSE',
      requestId: event.data.requestId,
      ...result
    }, '*');
  });

  // Notify that main script is ready
  window.postMessage({ type: 'COLAB_MAIN_READY' }, '*');
})();
