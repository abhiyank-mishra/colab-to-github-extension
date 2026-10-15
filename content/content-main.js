/**
 * Injected Script (MAIN World)
 * Runs directly in the Google Colab page execution context.
 * Intercepts Colab's native download flow to extract the exact serialized .ipynb JSON,
 * with fallbacks to internal model and DOM reconstruction.
 */

(function () {
  'use strict';

  if (window.__COLAB_GITHUB_EXTENSION_INITIALIZED__) return;
  window.__COLAB_GITHUB_EXTENSION_INITIALIZED__ = true;

  console.log('[Colab to GitHub] Main world extractor active.');

  // Permanent Blob Cache (captures any notebook downloaded or saved by Colab)
  let cachedNotebookJson = null;
  try {
    const rawCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = function (blob) {
      const url = rawCreateObjectURL.apply(this, arguments);
      if (blob && typeof blob.text === 'function') {
        blob.text().then(text => {
          if (text && (text.includes('"cells"') || text.includes('"nbformat"'))) {
            cachedNotebookJson = text;
            window.__COLAB_CACHED_NOTEBOOK__ = text;
            console.log('[Colab to GitHub] Captured active notebook JSON via createObjectURL.');
          }
        }).catch(() => {});
      }
      return url;
    };
  } catch (e) {}

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

  // Scrape visible/loaded cells from DOM as a robust fallback
  function reconstructFromDOM() {
    const cells = [];
    const cellElements = document.querySelectorAll('colab-cell, .cell, [class*="colab-cell"]');

    cellElements.forEach((cellEl, idx) => {
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

  // Try extracting directly from internal Colab JavaScript models
  function tryExtractFromInternalModel() {
    try {
      const candidate = window.colab?.global?.notebook || 
                        window.colab?.global?.getNotebook?.() || 
                        window._colab?.notebook;
      if (candidate && typeof candidate.toJSON === 'function') {
        const json = candidate.toJSON();
        if (json && (json.cells || json.nbformat)) {
          console.log('[Colab to GitHub] Extracted directly from internal colab.global.notebook model.');
          return JSON.stringify(json, null, 2);
        }
      }
    } catch (e) {}
    return null;
  }

  // Intercept Colab download flow
  async function triggerColabDownloadAndIntercept(timeoutMs = 2800) {
    return new Promise((resolve) => {
      let isResolved = false;
      const originalClick = HTMLAnchorElement.prototype.click;
      const originalCreateObjectURL = window.URL.createObjectURL;
      let cleanupTimer = null;

      function done(result) {
        if (isResolved) return;
        isResolved = true;
        HTMLAnchorElement.prototype.click = originalClick;
        window.URL.createObjectURL = originalCreateObjectURL;
        if (cleanupTimer) clearTimeout(cleanupTimer);
        resolve(result);
      }

      // 1. Hook URL.createObjectURL (catches blob creation before anchor click)
      window.URL.createObjectURL = function (blob) {
        const url = originalCreateObjectURL.apply(this, arguments);
        if (blob && (blob.type === 'application/x-ipynb+json' || blob.type === 'application/json' || blob.size > 20)) {
          blob.text().then(text => {
            if (text && (text.includes('"cells"') || text.includes('"nbformat"'))) {
              console.log('[Colab to GitHub] Intercepted notebook blob via createObjectURL.');
              done({
                success: true,
                filename: getNotebookName(),
                content: text
              });
            }
          }).catch(() => {});
        }
        return url;
      };

      // 2. Intercept anchor clicks
      HTMLAnchorElement.prototype.click = function () {
        const downloadAttr = this.download || this.getAttribute('download') || '';
        const href = this.href || '';
        const isIpynb = downloadAttr.endsWith('.ipynb') || href.startsWith('blob:');

        if (isIpynb && href) {
          console.log('[Colab to GitHub] Intercepted Colab download anchor:', downloadAttr);
          fetch(href)
            .then(res => res.text())
            .then(content => {
              done({
                success: true,
                filename: downloadAttr || getNotebookName(),
                content
              });
            })
            .catch(() => {
              done(null);
            });
          return; // Suppress local disk file download
        }

        return originalClick.apply(this, arguments);
      };

      // 3. Trigger Ctrl+S to flush latest changes
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }));

      // 4. Click "File" menu item
      setTimeout(() => {
        try {
          const fileMenu = document.querySelector('#file-menu, colab-file-menu, #menu-file') ||
                           Array.from(document.querySelectorAll('[role="menubar"] [role="menuitem"], #menubar div, button, div')).find(el => {
                             const text = el.textContent?.trim();
                             return text === 'File' && el.offsetParent !== null && !el.closest('colab-cell');
                           });

          if (fileMenu) {
            fileMenu.click();
            fileMenu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            fileMenu.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

            // 5. Find "Download .ipynb" item
            setTimeout(() => {
              const downloadItem = document.querySelector('colab-menu-item[label*="Download .ipynb"]') ||
                                   Array.from(document.querySelectorAll('colab-menu-item, .goog-menuitem, [role="menuitem"], paper-item, div, span')).find(el => {
                                     return el.textContent?.includes('Download .ipynb') && el.offsetParent !== null;
                                   });

              if (downloadItem) {
                downloadItem.click();
              } else {
                const downloadParent = Array.from(document.querySelectorAll('colab-menu-item, .goog-menuitem, [role="menuitem"], div, span')).find(el => {
                  return el.textContent?.trim() === 'Download' && el.offsetParent !== null;
                });
                if (downloadParent) {
                  downloadParent.click();
                  downloadParent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  setTimeout(() => {
                    const subItem = Array.from(document.querySelectorAll('colab-menu-item, .goog-menuitem, [role="menuitem"], div, span')).find(el => {
                      return el.textContent?.includes('Download .ipynb') && el.offsetParent !== null;
                    });
                    if (subItem) subItem.click();
                  }, 150);
                }
              }
            }, 200);
          }
        } catch (e) {
          console.log('[Colab to GitHub] Menu navigation notice:', e.message);
        }
      }, 100);

      // Timeout fallback
      cleanupTimer = setTimeout(() => {
        done(null);
      }, timeoutMs);
    });
  }

  // Try extracting directly from Monaco Editor text models
  function tryExtractFromMonaco() {
    try {
      if (typeof window.monaco !== 'undefined' && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length > 0) {
          const cells = [];
          models.forEach((model, idx) => {
            const uri = model.uri ? model.uri.toString() : '';
            if (uri.includes('schema') || uri.includes('output') || uri.includes('diff')) return;
            const text = model.getValue();
            if (text !== undefined && text !== null) {
              const lines = text.split('\n').map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l));
              cells.push({
                cell_type: 'code',
                execution_count: idx + 1,
                metadata: { id: `monaco_cell_${idx}` },
                outputs: [],
                source: lines
              });
            }
          });

          if (cells.length > 0) {
            const ipynb = {
              nbformat: 4,
              nbformat_minor: 0,
              metadata: {
                colab: { provenance: [] },
                kernelspec: { name: 'python3', display_name: 'Python 3' },
                language_info: { name: 'python' }
              },
              cells
            };
            console.log(`[Colab to GitHub] Extracted ${cells.length} cells from Monaco Editor models.`);
            return JSON.stringify(ipynb, null, 2);
          }
        }
      }
    } catch (e) {
      console.log('[Colab to GitHub] Monaco extractor notice:', e.message);
    }
    return null;
  }

  // Try extracting from Colab custom element models
  function tryExtractFromColabElements() {
    try {
      const cellEls = document.querySelectorAll('colab-cell');
      if (cellEls && cellEls.length > 0) {
        const cells = [];
        cellEls.forEach((el, idx) => {
          const cellModel = el.cellModel || el.model;
          let text = '';
          let isCode = true;

          if (cellModel) {
            text = cellModel.text || cellModel.source || '';
            isCode = cellModel.type !== 'markdown';
          }

          if (!text) {
            const ed = el.querySelector('.monaco-editor, textarea, pre');
            if (ed) {
              const lines = ed.querySelectorAll('.view-line');
              if (lines.length > 0) {
                text = Array.from(lines).map(l => l.textContent).join('\n');
              } else {
                text = ed.textContent || ed.value || '';
              }
            } else {
              text = el.textContent || '';
            }
          }

          const formattedLines = text.split('\n').map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l));
          cells.push({
            cell_type: isCode ? 'code' : 'markdown',
            execution_count: idx + 1,
            metadata: { id: `cell_${idx}` },
            outputs: [],
            source: formattedLines
          });
        });

        if (cells.length > 0) {
          const ipynb = {
            nbformat: 4,
            nbformat_minor: 0,
            metadata: {
              colab: { provenance: [] },
              kernelspec: { name: 'python3', display_name: 'Python 3' },
              language_info: { name: 'python' }
            },
            cells
          };
          console.log(`[Colab to GitHub] Extracted ${cells.length} cells from Colab custom elements.`);
          return JSON.stringify(ipynb, null, 2);
        }
      }
    } catch (e) {
      console.log('[Colab to GitHub] Custom element extractor notice:', e.message);
    }
    return null;
  }

  // Extract notebook content using prioritized multi-tier strategies
  async function extractNotebook() {
    const filename = getNotebookName();

    // Strategy 0: Check memory-cached notebook from permanent blob interceptor
    if (cachedNotebookJson && (cachedNotebookJson.includes('"cells"') || cachedNotebookJson.includes('"nbformat"'))) {
      console.log('[Colab to GitHub] Using memory-cached notebook.');
      return {
        success: true,
        filename,
        content: cachedNotebookJson,
        method: 'memory-cache'
      };
    }

    // Strategy 1: Check internal Colab model
    const internalModel = tryExtractFromInternalModel();
    if (internalModel) {
      return {
        success: true,
        filename,
        content: internalModel,
        method: 'internal-model'
      };
    }

    // Strategy 2: Intercept native Colab download
    try {
      const intercepted = await triggerColabDownloadAndIntercept(1600);
      if (intercepted && intercepted.content) {
        cachedNotebookJson = intercepted.content;
        return {
          success: true,
          filename: intercepted.filename || filename,
          content: intercepted.content,
          method: 'native-intercept'
        };
      }
    } catch (e) {}

    // Strategy 3: Try Monaco editor models
    const monacoContent = tryExtractFromMonaco();
    if (monacoContent) {
      return {
        success: true,
        filename,
        content: monacoContent,
        method: 'monaco-models'
      };
    }

    // Strategy 4: Try Colab custom element models
    const elemContent = tryExtractFromColabElements();
    if (elemContent) {
      return {
        success: true,
        filename,
        content: elemContent,
        method: 'custom-elements'
      };
    }

    // Strategy 5: Full DOM scraping fallback
    try {
      const domContent = reconstructFromDOM();
      if (domContent) {
        return {
          success: true,
          filename,
          content: domContent,
          method: 'dom-reconstruction'
        };
      }
    } catch (e) {}

    // Strategy 6: If all in-page extractions failed, check Google Drive fileId delegate
    const driveMatch = window.location.pathname.match(/\/drive\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return {
        success: true,
        filename,
        fileId: driveMatch[1],
        needsDriveFetch: true,
        method: 'needs-drive-fetch'
      };
    }

    return {
      success: false,
      error: 'Could not extract notebook content through any strategy.'
    };
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

  window.postMessage({ type: 'COLAB_MAIN_READY' }, '*');
})();
