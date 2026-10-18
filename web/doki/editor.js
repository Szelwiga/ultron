// Document Editor & Welcome Tile Module managing multi-editor split views and recent documents.

// Helper for persisting and retrieving recent documents per workspace.
const RecentDocs = (() => {
  function getKey(wsId) {
    return 'doki_recent_docs_' + (wsId || 'default');
  }

  function get(wsId) {
    try {
      const raw = localStorage.getItem(getKey(wsId));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function add(wsId, docId, name) {
    if (!docId || !name) return;
    let list = get(wsId).filter(item => item.docId !== docId);
    list.unshift({ docId, name, timestamp: Date.now() });
    if (list.length > 5) list = list.slice(0, 5);
    try {
      localStorage.setItem(getKey(wsId), JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save recent doc', e);
    }
  }

  return { get, add };
})();

// Welcome Tile Module displayed when no editor tiles are open.
const WelcomeTile = (() => {
  let currentUser = { email: '', username: '' };

  function setUser(user) {
    currentUser = user || { email: '', username: '' };
    render();
  }

  function render() {
    const welcomeEl = document.getElementById('welcome-tile');
    if (!welcomeEl) return;

    const greetingEl = document.getElementById('welcome-greeting');
    if (greetingEl) {
      const name = (currentUser && currentUser.username && currentUser.username.trim() !== '')
          ? currentUser.username
          : ((currentUser && currentUser.email) ? currentUser.email.split('@')[0] : 'User');
      greetingEl.textContent = `Hi ${name}`;
    }

    const listContainer = document.getElementById('welcome-recent-list');
    if (!listContainer) return;

    const wsId = (typeof TreeViewer !== 'undefined' && TreeViewer.getCurrentWorkspaceId)
        ? TreeViewer.getCurrentWorkspaceId()
        : (localStorage.getItem('doki_current_ws_id') || '');

    let recent = RecentDocs.get(wsId);

    // If recent docs list is empty, supplement with up to 5 documents from active tree
    if (recent.length === 0 && typeof TreeViewer !== 'undefined' && TreeViewer.getDocuments) {
      const allDocs = TreeViewer.getDocuments();
      if (allDocs && allDocs.length > 0) {
        recent = allDocs.slice(0, 5).map(d => ({ docId: d.documentId, name: d.name }));
      }
    }

    listContainer.innerHTML = '';
    if (recent.length === 0) {
      listContainer.innerHTML = `
        <div class="welcome-recent-empty">
          No recent documents. Select a file from the explorer tree or create a new file to get started.
        </div>
      `;
      return;
    }

    recent.forEach(item => {
      const el = document.createElement('div');
      el.className = 'welcome-recent-item';
      const fileName = item.name.split('/').pop();
      const dirPath = item.name.includes('/') ? item.name.substring(0, item.name.lastIndexOf('/')) : '';

      el.innerHTML = `
        <div class="welcome-recent-item-left">
          <span class="tree-icon">${TreeIcons.getFileSvg()}</span>
          <span class="welcome-recent-name">${TreeIcons.escapeHtml(fileName)}</span>
          ${dirPath ? `<span class="welcome-recent-path">${TreeIcons.escapeHtml(dirPath)}</span>` : ''}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--muted); opacity: 0.6;">
          <path d="M5 12h14m-7-7 7 7-7 7"/>
        </svg>
      `;

      el.addEventListener('click', () => {
        DocumentEditor.open(item.docId, item.name);
      });

      listContainer.appendChild(el);
    });
  }

  return { setUser, render };
})();

// Document Editor Module managing all editor instances, [main] labeling, and split docking.
const DocumentEditor = (() => {
  const editors = {};
  let mainEditorId = null;
  let activeEditorId = null;
  let editorCounter = 0;

  function init() {
    // Initial state: no editor tiles are open; welcome tile will display
    updateFocusVisuals();
  }

  // Registers and binds listeners for an editor instance on a tile element.
  function registerEditorInstance(tileId, tileEl) {
    const activeState = tileEl.querySelector('.editor-active') || tileEl;
    const docTitle = activeState.querySelector('.editor-doc-name');
    const homeIcon = activeState.querySelector('.editor-main-home-icon');
    const saveBadge = activeState.querySelector('.editor-save-badge');
    const textarea = activeState.querySelector('.editor-textarea');
    const saveBtn = activeState.querySelector('.editor-save-btn');
    const closeBtn = activeState.querySelector('.editor-close-btn');

    const inst = {
      tileId,
      tileEl,
      docTitle,
      homeIcon,
      saveBadge,
      textarea,
      saveBtn,
      closeBtn,
      activeDocId: null,
      activeDocName: null,
      hasPendingChanges: false,
      isSaving: false,
      saveTimeout: null,

      // Opens a document by ID and populates textarea content.
      async open(docId, name) {
        if (inst.activeDocId && inst.hasPendingChanges) {
          await inst.saveContent();
        }

        inst.activeDocId = docId;
        inst.activeDocName = name;
        if (inst.docTitle) inst.docTitle.textContent = name;
        inst.setSaveStatus('Loading...');
        if (inst.textarea) {
          inst.textarea.value = '';
          inst.textarea.disabled = true;
        }

        const wsId = (typeof TreeViewer !== 'undefined' && TreeViewer.getCurrentWorkspaceId)
            ? TreeViewer.getCurrentWorkspaceId()
            : (localStorage.getItem('doki_current_ws_id') || '');
        RecentDocs.add(wsId, docId, name);

        try {
          const res = await fetch(
              `/api/documents/get?document_id=${encodeURIComponent(docId)}`, {
            headers: { 'Accept': 'application/json' }
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            if (typeof ModalDialog !== 'undefined') {
              ModalDialog.alert({
                title: 'Error',
                message: data.errorMessage || 'Failed to load document',
                isError: true
              });
            }
            return;
          }

          const shards = data.document.shards || [];
          const content = shards.length > 0 ? shards[0].content || '' : '';
          if (inst.textarea) {
            inst.textarea.value = content;
            inst.textarea.disabled = false;
          }
          inst.hasPendingChanges = false;
          inst.setSaveStatus('Saved');
        } catch (e) {
          inst.setSaveStatus('Error loading');
          if (typeof ModalDialog !== 'undefined') {
            ModalDialog.alert({
              title: 'Error',
              message: 'Error loading document: ' + e.message,
              isError: true
            });
          }
        }
      },

      // Saves current editor string content to backend.
      async saveContent() {
        if (!inst.activeDocId || inst.isSaving || !inst.textarea) return;
        inst.isSaving = true;
        inst.setSaveStatus('Saving...');

        try {
          const content = inst.textarea.value;
          const res = await fetch('/api/documents/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              documentId: inst.activeDocId,
              content: content
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            inst.hasPendingChanges = false;
            inst.setSaveStatus('Saved');
          } else {
            inst.setSaveStatus('Failed to save');
          }
        } catch (e) {
          inst.setSaveStatus('Network error');
        } finally {
          inst.isSaving = false;
        }
      },

      // Updates save status badge.
      setSaveStatus(msg) {
        if (inst.saveBadge) inst.saveBadge.textContent = msg;
      },

      // Cleanup on destruction.
      destroy() {
        if (inst.saveTimeout) clearTimeout(inst.saveTimeout);
      }
    };

    if (textarea) {
      textarea.addEventListener('input', () => {
        inst.hasPendingChanges = true;
        inst.setSaveStatus('Unsaved changes');
        if (inst.saveTimeout) clearTimeout(inst.saveTimeout);
        inst.saveTimeout = setTimeout(() => inst.saveContent(), 800);
      });
      textarea.addEventListener('focus', () => {
        setActiveEditor(tileId);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (inst.hasPendingChanges) {
          if (inst.saveTimeout) clearTimeout(inst.saveTimeout);
          inst.saveContent();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeEditor(tileId);
      });
    }

    tileEl.addEventListener('mousedown', () => {
      setActiveEditor(tileId);
    });

    editors[tileId] = inst;
    updateMainTag();
    return inst;
  }

  // Creates DOM element for an editor tile.
  function createEditorTileElement(tileId) {
    const el = document.createElement('main');
    el.id = tileId;
    el.className = 'floating-window doc-editor-tile';
    el.innerHTML = `
      <div class="editor-active"
           style="display: flex; flex-direction: column; height: 100%; width: 100%; flex: 1;">
        <div class="editor-header window-header">
          <div class="window-header-left">
            <div class="window-corner-drag" title="Drag to move">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/>
                <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
                <circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>
              </svg>
            </div>
            <div class="editor-title-container" style="display: flex; align-items: center; gap: 6px;">
              <span class="editor-main-home-icon" style="display: none;" title="Main Editor">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </span>
              <span class="editor-doc-name"></span>
              <span class="editor-save-badge">Saved</span>
            </div>
          </div>
          <div class="window-header-right" style="display: flex; align-items: center; gap: 8px;">
            <button class="btn-icon editor-close-btn" title="Close editor" aria-label="Close editor">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="editor-body">
          <textarea class="editor-textarea" placeholder="Type document content here..."
                    spellcheck="false"></textarea>
        </div>
      </div>
    `;
    return el;
  }

  // Opens a document: focuses if already open anywhere, or opens in the [main] editor.
  async function open(docId, name) {
    // 1. Prevent opening multiple times: if already open in any editor, focus it
    const existing = Object.values(editors).find(e => e.activeDocId === docId);
    if (existing) {
      setActiveEditor(existing.tileId);
      updateTreeHighlights();
      return;
    }

    // 2. If no editor tile currently exists, spawn the first one as [main]
    const editorKeys = Object.keys(editors);
    if (editorKeys.length === 0) {
      const newId = `doc-editor-tile-${++editorCounter}`;
      const newEl = createEditorTileElement(newId);
      mainEditorId = newId;
      setActiveEditor(newId);

      if (typeof DockLayout !== 'undefined' && DockLayout.openTileSplit) {
        DockLayout.openTileSplit(newId, newEl, null, 'right');
      }

      const inst = registerEditorInstance(newId, newEl);
      await inst.open(docId, name);
      updateFocusVisuals();
      updateTreeHighlights();
      return;
    }

    // 3. Otherwise, open in the [main] editor (or active editor if main is unavailable)
    let targetInst = editors[mainEditorId] || editors[activeEditorId] || editors[editorKeys[0]];
    if (targetInst) {
      setActiveEditor(targetInst.tileId);
      await targetInst.open(docId, name);
      updateFocusVisuals();
      updateTreeHighlights();
    }
  }

  // Opens a document in a newly spawned split editor tile (or focuses if already open).
  async function openInNewEditor(docId, name) {
    // 1. Prevent duplicate opening: if already open anywhere, focus it
    const existing = Object.values(editors).find(e => e.activeDocId === docId);
    if (existing) {
      setActiveEditor(existing.tileId);
      updateTreeHighlights();
      return;
    }

    // 2. If no editors currently exist, spawn the first one as [main]
    if (Object.keys(editors).length === 0) {
      await open(docId, name);
      return;
    }

    // 3. Spawn a new secondary editor tile docked adjacent to current active editor
    const newId = `doc-editor-tile-${++editorCounter}`;
    const newEl = createEditorTileElement(newId);

    if (typeof DockLayout !== 'undefined' && DockLayout.openTileSplit) {
      DockLayout.openTileSplit(newId, newEl, activeEditorId || mainEditorId, 'right');
    }

    const inst = registerEditorInstance(newId, newEl);
    setActiveEditor(newId);
    await inst.open(docId, name);
    updateFocusVisuals();
    updateTreeHighlights();
  }

  // Closes a specific editor tile and removes it from the layout tree.
  async function closeEditor(tileId) {
    const inst = editors[tileId];
    if (!inst) return;

    if (inst.hasPendingChanges) {
      await inst.saveContent();
    }

    // Remove from DockLayout and DOM
    if (typeof DockLayout !== 'undefined' && DockLayout.removeTile) {
      DockLayout.removeTile(tileId);
    }
    inst.destroy();
    delete editors[tileId];

    // Manage [main] role transition
    const remainingKeys = Object.keys(editors);
    if (remainingKeys.length > 0) {
      if (mainEditorId === tileId) {
        mainEditorId = remainingKeys[0];
      }
      if (activeEditorId === tileId) {
        activeEditorId = mainEditorId;
      }
    } else {
      mainEditorId = null;
      activeEditorId = null;
    }

    updateMainTag();
    updateFocusVisuals();
    updateTreeHighlights();
  }

  // Closes any editor instance displaying the given document ID.
  async function closeDoc(docId) {
    const matching = Object.values(editors).filter(e => e.activeDocId === docId);
    for (const inst of matching) {
      await closeEditor(inst.tileId);
    }
  }

  // Closes all editors (e.g. on workspace switch).
  async function closeAll() {
    const editorKeys = Object.keys(editors);
    for (const key of editorKeys) {
      const inst = editors[key];
      if (inst && inst.hasPendingChanges) {
        await inst.saveContent();
      }
      if (typeof DockLayout !== 'undefined' && DockLayout.removeTile) {
        DockLayout.removeTile(key);
      }
      if (inst) inst.destroy();
      delete editors[key];
    }

    mainEditorId = null;
    activeEditorId = null;
    updateFocusVisuals();
    updateTreeHighlights();
  }

  // Sets active/focused editor tile.
  function setActiveEditor(tileId) {
    if (editors[tileId]) {
      activeEditorId = tileId;
      updateFocusVisuals();
      updateTreeHighlights();
    }
  }

  // Updates main editor indicator (yellow home icon) across all editor instances.
  function updateMainTag() {
    Object.keys(editors).forEach(id => {
      const inst = editors[id];
      if (inst && inst.homeIcon) {
        inst.homeIcon.style.display = (id === mainEditorId) ? 'inline-flex' : 'none';
      }
    });
  }

  // Updates visual border/focus highlights on editor tiles.
  function updateFocusVisuals() {
    document.querySelectorAll('.doc-editor-tile, .floating-window').forEach(el => {
      if (el.id === 'tree-tile' || el.id === 'welcome-tile') return;
      el.classList.toggle('editor-tile-focused', el.id === activeEditorId);
    });
  }

  // Updates document highlights in explorer tree.
  function updateTreeHighlights() {
    if (typeof TreeViewer !== 'undefined' && TreeViewer.updateActiveFiles) {
      TreeViewer.updateActiveFiles();
    }
  }

  // Returns document ID currently open in the active editor.
  function getActiveDocId() {
    const inst = editors[activeEditorId] || editors[mainEditorId];
    return inst ? inst.activeDocId : null;
  }

  // Returns Set of all document IDs currently open across all editor instances.
  function getAllOpenDocIds() {
    const ids = new Set();
    Object.values(editors).forEach(inst => {
      if (inst.activeDocId) ids.add(inst.activeDocId);
    });
    return ids;
  }

  // Checks if a document ID is open in any editor tile.
  function isDocOpen(docId) {
    return getAllOpenDocIds().has(docId);
  }

  // Saves current content of active editor.
  async function saveContent() {
    const inst = editors[activeEditorId] || editors[mainEditorId];
    if (inst) await inst.saveContent();
  }

  // Closes active editor.
  function close() {
    if (activeEditorId) closeEditor(activeEditorId);
  }

  return {
    init,
    open,
    openInNewEditor,
    close,
    closeEditor,
    closeDoc,
    closeAll,
    saveContent,
    getActiveDocId,
    getAllOpenDocIds,
    isDocOpen,
    setActiveEditor,
    getMainEditorId: () => mainEditorId
  };
})();
