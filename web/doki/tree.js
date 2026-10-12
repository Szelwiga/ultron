// Tree Viewer Module managing file explorer hierarchy and virtual directories.

const TreeViewer = (() => {
  let currentWorkspaceId = '';
  let currentWorkspaceName = '';
  let documents = [];
  let inMemoryDirs = new Set();
  let selectedNode = null;
  let expandedDirs = new Set(['']);

  const treeBody = document.getElementById('tree-body');
  const treeTile = document.getElementById('tree-tile');
  const navTreeBtn = document.getElementById('nav-tree-btn');
  const trashDirBtn = document.getElementById('tree-trash-dir-btn');

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

  // Initializes tree tile toggle, toolbar buttons, and document click.
  function init() {
    TreeApi.init();
    TreeMenu.init(document.getElementById('tree-context-menu'), {
      onNewFile: (p) => TreeHandlers.promptNewFile(
          currentWorkspaceId, p, handlerCallbacks),
      onNewDir: (p) => TreeHandlers.promptNewDir(p, handlerCallbacks),
      onRenameDir: (p) => TreeHandlers.promptRenameDir(
          currentWorkspaceId, p, handlerCallbacks),
      onTrashDir: (p) => TreeHandlers.trashDirectory(
          currentWorkspaceId, p, documents, handlerCallbacks),
      onOpenDoc: (id, path) => DocumentEditor.open(id, path),
      onRenameDoc: (id, path) => TreeHandlers.promptRenameFile(
          id, path, handlerCallbacks),
      onDeleteDoc: (id, path) => TreeHandlers.deleteFile(
          id, path, handlerCallbacks)
    });

    navTreeBtn.addEventListener('click', toggleVisibility);
    document.getElementById('tree-new-file-btn').addEventListener(
        'click', () => TreeHandlers.promptNewFile(
            currentWorkspaceId, getTargetDirPath(), handlerCallbacks));
    trashDirBtn.addEventListener('click', () => {
      if (selectedNode && selectedNode.type === 'dir') {
        TreeHandlers.trashDirectory(
            currentWorkspaceId, selectedNode.path, documents, handlerCallbacks);
      }
    });
    document.getElementById('tree-refresh-btn').addEventListener(
        'click', reload);
    document.getElementById('tree-collapse-btn').addEventListener(
        'click', () => {
          expandedDirs.clear();
          render();
        });

    const stored = localStorage.getItem('doki_tree_visible');
    if (stored === 'false') treeTile.classList.add('hidden');
  }

  // Toggles visibility of the tree viewer tile.
  function toggleVisibility() {
    treeTile.classList.toggle('hidden');
    const isVisible = !treeTile.classList.contains('hidden');
    localStorage.setItem('doki_tree_visible', isVisible ? 'true' : 'false');
  }

  // Sets active workspace and loads its document tree from the backend.
  async function loadWorkspace(wsId, wsName) {
    currentWorkspaceId = wsId;
    currentWorkspaceName = wsName;
    inMemoryDirs.clear();
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

  // Builds and renders the complete tree hierarchy in DOM.
  function render() {
    treeBody.innerHTML = '';
    const rootNode = buildTreeModel();

    const rootEl = createNodeElement({
      name: currentWorkspaceName || 'Workspace',
      type: 'root',
      path: '',
      hasChildren: rootNode.dirs.length > 0 || rootNode.files.length > 0
    }, 0);
    treeBody.appendChild(rootEl);

    renderChildren(rootNode, 1);
    updateToolbar();
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

  // Creates DOM element for a tree node with icons and event handlers.
  function createNodeElement(info, depth) {
    const el = document.createElement('div');
    el.className = 'tree-node';
    if (selectedNode && selectedNode.type === info.type &&
        selectedNode.path === info.path) {
      el.classList.add('selected');
    }
    el.style.paddingLeft = `${depth * 14 + 8}px`;

    let chevronHtml = '<span class="tree-chevron"></span>';
    if (info.type === 'dir' || info.type === 'root') {
      const isExp = info.type === 'root' ? true : info.isExpanded;
      chevronHtml = [
        `<span class="tree-chevron ${isExp ? 'expanded' : ''}">`,
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" ',
        'stroke="currentColor" stroke-width="2.5">',
        '<path d="m9 18 6-6-6-6"/>',
        '</svg>',
        '</span>'
      ].join('');
    }

    let iconHtml = '';
    if (info.type === 'root') {
      const wsSvg = TreeIcons.getWorkspaceSvg();
      iconHtml = `<span class="tree-icon">${wsSvg}</span>`;
    } else if (info.type === 'dir') {
      const folderSvg = TreeIcons.getFolderSvg(info.isExpanded);
      iconHtml = `<span class="tree-icon">${folderSvg}</span>`;
    } else {
      iconHtml = `<span class="tree-icon">${TreeIcons.getFileSvg()}</span>`;
    }

    const label = TreeIcons.escapeHtml(info.name);
    el.innerHTML = chevronHtml + iconHtml +
        `<span class="tree-label">${label}</span>`;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(info);
      if (info.type === 'dir') {
        if (expandedDirs.has(info.path)) expandedDirs.delete(info.path);
        else expandedDirs.add(info.path);
        render();
      } else if (info.type === 'doc') {
        DocumentEditor.open(info.docId, info.path);
      }
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectNode(info);
      TreeMenu.show(e.clientX, e.clientY, info);
    });

    TreeHandlers.setupDragDrop(
        el, info, currentWorkspaceId, handlerCallbacks);
    return el;
  }

  // Sets selected node and updates toolbar button states.
  function selectNode(info) {
    selectedNode = info;
    document.querySelectorAll('.tree-node')
        .forEach(n => n.classList.remove('selected'));
    updateToolbar();
  }

  // Updates toolbar icons (e.g. enabling Trash Directory button).
  function updateToolbar() {
    trashDirBtn.disabled = !(selectedNode && selectedNode.type === 'dir');
  }

  // Returns targeted directory path for creating new files or directories.
  function getTargetDirPath() {
    if (!selectedNode || selectedNode.type === 'root') return '';
    if (selectedNode.type === 'dir') return selectedNode.path;
    const parts = selectedNode.path.split('/');
    parts.pop();
    return parts.join('/');
  }

  return { init, loadWorkspace, reload };
})();
