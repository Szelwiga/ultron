// Context Menu module for TreeViewer actions.

const TreeMenu = (() => {
  let menuEl = null;
  let callbacks = {};

  // Initializes context menu element and action callbacks.
  function init(el, cbs) {
    menuEl = el;
    callbacks = cbs;
    document.addEventListener('click', () => {
      menuEl.style.display = 'none';
    });
  }

  // Displays contextual menu at coordinates for target tree node.
  function show(x, y, info) {
    menuEl.innerHTML = '';
    const items = [];

    if (info.type === 'root') {
      items.push({
        label: 'New File...',
        action: () => callbacks.onNewFile('')
      });
      items.push({
        label: 'New Directory...',
        action: () => callbacks.onNewDir('')
      });
    } else if (info.type === 'dir') {
      items.push({
        label: 'New File Here...',
        action: () => callbacks.onNewFile(info.path)
      });
      items.push({
        label: 'New Directory Here...',
        action: () => callbacks.onNewDir(info.path)
      });
      items.push({ isDivider: true });
      items.push({
        label: 'Rename Directory...',
        action: () => callbacks.onRenameDir(info.path)
      });
      items.push({
        label: 'Trash Directory',
        action: () => callbacks.onTrashDir(info.path),
        danger: true
      });
    } else if (info.type === 'doc') {
      items.push({
        label: 'Open in Editor',
        action: () => callbacks.onOpenDoc(info.docId, info.path)
      });
      items.push({ isDivider: true });
      items.push({
        label: 'Rename...',
        action: () => callbacks.onRenameDoc(info.docId, info.path)
      });
      items.push({
        label: 'Delete Document',
        action: () => callbacks.onDeleteDoc(info.docId, info.path),
        danger: true
      });
    }

    items.forEach(it => {
      if (it.isDivider) {
        const div = document.createElement('div');
        div.className = 'context-menu-divider';
        menuEl.appendChild(div);
        return;
      }
      const el = document.createElement('div');
      el.className = 'context-menu-item' + (it.danger ? ' danger' : '');
      if (it.danger) el.style.color = 'var(--danger)';
      el.innerHTML = `<span>${it.label}</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        menuEl.style.display = 'none';
        it.action();
      });
      menuEl.appendChild(el);
    });

    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
    menuEl.style.display = 'flex';
  }

  return { init, show };
})();
