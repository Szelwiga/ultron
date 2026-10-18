// Tree Viewer Module managing file explorer hierarchy and virtual directories.

const TreeViewer = (() => {
  let currentWorkspaceId = '';
  let currentWorkspaceName = '';
  let documents = [];
  let inMemoryDirs = new Set();
  let expandedDirs = new Set(['']);

  const treeBody = document.getElementById('tree-body');
  const treeTile = document.getElementById('tree-tile');
  const navTreeBtn = document.getElementById('nav-tree-btn');

  const handlerCallbacks = {
    reload: () => reload(),
    render: () => render(),
    expandDir: (dir) => expandedDirs.add(dir),
    addInMemoryDir: (dir) => inMemoryDirs.add(dir),
    renameInMemoryDir: (oldP, newP) => {
      inMemoryDirs.delete(oldP);
      inMemoryDirs.add(newP);
      expandedDirs.delete(oldP);
      expandedDirs.add(newP);
    },
    removeInMemoryDir: (dir) => inMemoryDirs.delete(dir)
  };

  // Initializes tree module, API listeners, and root header buttons.
  function init() {
    TreeApi.init();
    if (treeBody) {
      treeBody.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      TreeHandlers.setupDragDrop(
          treeBody, { type: 'root', path: '' }, currentWorkspaceId, handlerCallbacks);
    }

    const headerNewFile = document.getElementById('tree-header-new-file');
    if (headerNewFile) {
      headerNewFile.addEventListener('click', (e) => {
        e.stopPropagation();
        TreeHandlers.promptNewFile(currentWorkspaceId, '', handlerCallbacks);
      });
    }

    const headerNewDir = document.getElementById('tree-header-new-dir');
    if (headerNewDir) {
      headerNewDir.addEventListener('click', (e) => {
        e.stopPropagation();
        TreeHandlers.promptNewDir('', handlerCallbacks);
      });
    }

    const treeCloseBtn = document.getElementById('tree-close-btn');
    if (treeCloseBtn) {
      treeCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof DockLayout !== 'undefined' && DockLayout.toggleTreeTile) {
          DockLayout.toggleTreeTile();
        }
      });
    }
  }

  // Updates workspace name in tree tile header.
  function updateHeaderWorkspace() {
    const tile = treeTile || document.getElementById('tree-tile');
    const titleEl = tile ? tile.querySelector('#tree-ws-title') : document.getElementById('tree-ws-title');
    if (titleEl) {
      titleEl.textContent = currentWorkspaceName || 'Workspace';
    }
  }

  // Sets active workspace and loads its document tree from the backend.
  async function loadWorkspace(wsId, wsName) {
    currentWorkspaceId = wsId;
    currentWorkspaceName = wsName;
    inMemoryDirs.clear();
    updateHeaderWorkspace();
    await reload();
  }

  // Fetches documents for current workspace and re-renders tree.
  async function reload() {
    if (!currentWorkspaceId) return;
    try {
      const q = encodeURIComponent(currentWorkspaceId);
      const res = await fetch(`/api/documents?workspace_id=${q}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        documents = data.documents || [];
      }
    } catch (e) {
      console.error('Failed to load documents', e);
    }
    render();
  }

  // Builds and renders the complete tree hierarchy in DOM directly from depth 0.
  function render() {
    updateHeaderWorkspace();
    treeBody.innerHTML = '';
    const rootNode = buildTreeModel();

    if (rootNode.dirs.length === 0 && rootNode.files.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'tree-empty-message';
      emptyEl.style.cssText = 'padding: 24px 12px; font-size: 13px; color: var(--muted); text-align: center;';
      emptyEl.innerHTML = `
        <div style="margin-bottom: 8px;">No files in workspace</div>
        <button class="btn btn-secondary" id="tree-empty-add-btn" style="font-size: 12px; padding: 4px 10px;">
          + New File
        </button>
      `;
      const addBtn = emptyEl.querySelector('#tree-empty-add-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          TreeHandlers.promptNewFile(currentWorkspaceId, '', handlerCallbacks);
        });
      }
      treeBody.appendChild(emptyEl);
      return;
    }

    renderChildren(rootNode, 0);
  }

  // Recursively constructs in-memory tree from document paths and empty dirs.
  function buildTreeModel() {
    const root = { name: '', dirs: {}, files: [] };

    documents.forEach(doc => {
      const parts = doc.name.split('/');
      let curr = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!curr.dirs[seg]) {
          curr.dirs[seg] = { name: seg, dirs: {}, files: [] };
        }
        curr = curr.dirs[seg];
      }
      curr.files.push({ name: parts[parts.length - 1], doc: doc });
    });

    inMemoryDirs.forEach(dirPath => {
      const parts = dirPath.split('/');
      let curr = root;
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        if (!curr.dirs[seg]) {
          curr.dirs[seg] = { name: seg, dirs: {}, files: [] };
        }
        curr = curr.dirs[seg];
      }
    });

    return formatModel(root);
  }

  // Formats directories map to sorted lists (directories first).
  function formatModel(node) {
    const sortedDirs = Object.keys(node.dirs).sort().map(k => {
      const sub = formatModel(node.dirs[k]);
      sub.name = k;
      return sub;
    });
    const sortedFiles = node.files.sort((a, b) => a.name.localeCompare(b.name));
    return { name: node.name, dirs: sortedDirs, files: sortedFiles };
  }

  // Recursively renders children of a directory node.
  function renderChildren(parentNode, depth, parentPath = '') {
    parentNode.dirs.forEach(d => {
      const dirPath = parentPath ? `${parentPath}/${d.name}` : d.name;
      const isExpanded = expandedDirs.has(dirPath);
      const hasChildren = d.dirs.length > 0 || d.files.length > 0;

      const el = createNodeElement({
        name: d.name,
        type: 'dir',
        path: dirPath,
        hasChildren: hasChildren,
        isExpanded: isExpanded
      }, depth);
      treeBody.appendChild(el);

      if (isExpanded) {
        renderChildren(d, depth + 1, dirPath);
      }
    });

    parentNode.files.forEach(f => {
      const el = createNodeElement({
        name: f.name,
        type: 'doc',
        path: f.doc.name,
        docId: f.doc.documentId
      }, depth);
      treeBody.appendChild(el);
    });
  }

  // Creates DOM element for a tree node with hover action icons.
  function createNodeElement(info, depth) {
    const el = document.createElement('div');
    el.className = 'tree-node' + (info.type === 'root' ? ' tree-node-root' : '');
    let isOpen = false;
    if (info.type === 'doc') {
      el.dataset.docId = info.docId;
      if (typeof DocumentEditor !== 'undefined' && DocumentEditor.isDocOpen) {
        isOpen = DocumentEditor.isDocOpen(info.docId);
        if (isOpen) {
          el.classList.add('opened-doc');
        }
      }
    }
    el.style.paddingLeft = `${depth * 14 + 8}px`;

    // Left container: chevron + icon + label
    const leftCol = document.createElement('div');
    leftCol.className = 'tree-node-left';

    let chevronHtml = '<span class="tree-chevron placeholder"></span>';
    if (info.type === 'dir' || info.type === 'root') {
      const isExp = info.isExpanded;
      chevronHtml = [
        `<span class="tree-chevron ${isExp ? 'expanded' : ''}" `,
        `title="${isExp ? 'Collapse' : 'Expand'}">`,
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" ',
        'stroke="currentColor" stroke-width="2.5">',
        '<path d="m9 18 6-6-6-6"/>',
        '</svg>',
        '</span>'
      ].join('');
    }

    let iconHtml = '';
    if (info.type === 'root') {
      iconHtml = `<span class="tree-icon">${TreeIcons.getWorkspaceSvg()}</span>`;
    } else if (info.type === 'dir') {
      iconHtml = `<span class="tree-icon">${TreeIcons.getFolderSvg(info.isExpanded)}</span>`;
    } else {
      iconHtml = `<span class="tree-icon">${TreeIcons.getFileSvg()}</span>`;
    }

    const labelHtml = `<span class="tree-label">${TreeIcons.escapeHtml(info.name)}</span>`;
    leftCol.innerHTML = chevronHtml + iconHtml + labelHtml;
    el.appendChild(leftCol);

    // Right container: per-item hover action buttons
    const actionsCol = document.createElement('div');
    actionsCol.className = 'tree-item-actions';

    if (info.type === 'root' || info.type === 'dir') {
      const targetDir = info.type === 'root' ? '' : info.path;

      // New File Action Button
      const newFileBtn = document.createElement('button');
      newFileBtn.className = 'tree-item-action-btn';
      newFileBtn.title = 'New File';
      newFileBtn.innerHTML = TreeIcons.getNewFileSvg();
      newFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        TreeHandlers.promptNewFile(
            currentWorkspaceId, targetDir, handlerCallbacks);
      });
      actionsCol.appendChild(newFileBtn);

      // New Subdirectory Action Button
      const newDirBtn = document.createElement('button');
      newDirBtn.className = 'tree-item-action-btn';
      newDirBtn.title = 'New Subdirectory';
      newDirBtn.innerHTML = TreeIcons.getNewFolderSvg();
      newDirBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        TreeHandlers.promptNewDir(targetDir, handlerCallbacks);
      });
      actionsCol.appendChild(newDirBtn);

      // Delete Directory Action Button (only on directories)
      if (info.type === 'dir') {
        const deleteDirBtn = document.createElement('button');
        deleteDirBtn.className = 'tree-item-action-btn danger';
        deleteDirBtn.title = 'Delete Directory';
        deleteDirBtn.innerHTML = TreeIcons.getTrashSvg();
        deleteDirBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          TreeHandlers.trashDirectory(
              currentWorkspaceId, info.path, documents, handlerCallbacks);
        });
        actionsCol.appendChild(deleteDirBtn);
      }
    } else if (info.type === 'doc') {
      // Open in New Editor Action Button
      const splitBtn = document.createElement('button');
      splitBtn.className = 'tree-item-action-btn';
      splitBtn.title = 'Open in New Editor';
      splitBtn.innerHTML = TreeIcons.getSplitEditorSvg();
      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        DocumentEditor.openInNewEditor(info.docId, info.path);
      });
      actionsCol.appendChild(splitBtn);

      // Rename Document Button
      const renameBtn = document.createElement('button');
      renameBtn.className = 'tree-item-action-btn';
      renameBtn.title = 'Rename Document';
      renameBtn.innerHTML = TreeIcons.getRenameSvg();
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        TreeHandlers.promptRenameFile(
            info.docId, info.path, handlerCallbacks);
      });
      actionsCol.appendChild(renameBtn);

      // Delete Document Button
      const deleteDocBtn = document.createElement('button');
      deleteDocBtn.className = 'tree-item-action-btn danger';
      deleteDocBtn.title = 'Delete Document';
      deleteDocBtn.innerHTML = TreeIcons.getTrashSvg();
      deleteDocBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        TreeHandlers.deleteFile(info.docId, info.path, handlerCallbacks);
      });
      actionsCol.appendChild(deleteDocBtn);
    }
    el.appendChild(actionsCol);

    // Row selection and toggle
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (info.type === 'root') {
        if (expandedDirs.has('__root_collapsed__')) {
          expandedDirs.delete('__root_collapsed__');
        } else {
          expandedDirs.add('__root_collapsed__');
        }
        render();
      } else if (info.type === 'dir') {
        if (expandedDirs.has(info.path)) {
          expandedDirs.delete(info.path);
        } else {
          expandedDirs.add(info.path);
        }
        render();
      } else if (info.type === 'doc') {
        DocumentEditor.open(info.docId, info.path);
      }
    });

    // Explicit chevron click toggle
    const chevronEl = leftCol.querySelector('.tree-chevron:not(.placeholder)');
    if (chevronEl) {
      chevronEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (info.type === 'root') {
          if (expandedDirs.has('__root_collapsed__')) {
            expandedDirs.delete('__root_collapsed__');
          } else {
            expandedDirs.add('__root_collapsed__');
          }
          render();
        } else if (info.type === 'dir') {
          if (expandedDirs.has(info.path)) {
            expandedDirs.delete(info.path);
          } else {
            expandedDirs.add(info.path);
          }
          render();
        }
      });
    }

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    TreeHandlers.setupDragDrop(
        el, info, currentWorkspaceId, handlerCallbacks);
    return el;
  }

  // Synchronizes document highlight indicators for all open editors.
  function updateActiveFiles() {
    const openIds = (typeof DocumentEditor !== 'undefined' && DocumentEditor.getAllOpenDocIds)
        ? DocumentEditor.getAllOpenDocIds()
        : new Set();

    document.querySelectorAll('.tree-node').forEach(nodeEl => {
      const dId = nodeEl.dataset.docId;
      if (!dId) return;
      const isOpen = openIds.has(dId);

      nodeEl.classList.toggle('opened-doc', isOpen);
      nodeEl.classList.remove('active-file');
      nodeEl.classList.remove('selected');
    });
  }

  // Sets or clears currently active file highlight.
  function setActiveFile(docId) {
    updateActiveFiles();
  }

  return {
    init,
    loadWorkspace,
    reload,
    render,
    updateHeaderWorkspace,
    setActiveFile,
    updateActiveFiles,
    getCurrentWorkspaceId: () => currentWorkspaceId,
    getCurrentWorkspaceName: () => currentWorkspaceName,
    getDocuments: () => documents
  };
})();
