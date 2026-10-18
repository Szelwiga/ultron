// Action handlers for tree mutations (file/dir prompts, drag and drop).

const TreeHandlers = (() => {
  // Prompts and creates a new document.
  function promptNewFile(wsId, dirPrefix, callbacks) {
    TreeApi.openPrompt('Create New File', '', async (name) => {
      const fullPath = dirPrefix ? `${dirPrefix}/${name}` : name;
      const data = await TreeApi.createDoc(wsId, fullPath);
      if (!data.success) {
        TreeApi.showError(data.errorMessage || 'Failed to create file');
        return false;
      }
      if (dirPrefix && callbacks.expandDir) {
        callbacks.expandDir(dirPrefix);
      }
      await callbacks.reload();
      DocumentEditor.open(data.document.documentId, fullPath);
      return true;
    });
  }

  // Prompts and creates a virtual directory in memory.
  function promptNewDir(parentDir, callbacks) {
    TreeApi.openPrompt('Create New Directory', '', async (name) => {
      const fullPath = parentDir ? `${parentDir}/${name}` : name;
      callbacks.addInMemoryDir(fullPath);
      if (parentDir && callbacks.expandDir) {
        callbacks.expandDir(parentDir);
      }
      callbacks.expandDir(fullPath);
      callbacks.render();
      return true;
    });
  }

  // Prompts and renames single document.
  function promptRenameFile(docId, oldPath, callbacks) {
    const oldName = oldPath.split('/').pop();
    TreeApi.openPrompt('Rename Document', oldName, async (newName) => {
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const targetPath = parts.join('/');
      const data = await TreeApi.renameDoc(docId, targetPath);
      if (!data.success) {
        TreeApi.showError(data.errorMessage || 'Rename failed');
        return false;
      }
      await callbacks.reload();
      return true;
    });
  }

  // Prompts and renames directory path prefix.
  function promptRenameDir(wsId, oldPrefix, callbacks) {
    const oldDirName = oldPrefix.split('/').pop();
    TreeApi.openPrompt('Rename Directory', oldDirName, async (newDirName) => {
      const parts = oldPrefix.split('/');
      parts[parts.length - 1] = newDirName;
      const targetPrefix = parts.join('/');
      const data = await TreeApi.renamePrefix(wsId, oldPrefix, targetPrefix);
      if (!data.success) {
        TreeApi.showError(data.errorMessage || 'Directory rename failed');
        return false;
      }
      callbacks.renameInMemoryDir(oldPrefix, targetPrefix);
      await callbacks.reload();
      return true;
    });
  }

  // Trashes directory (empty from UI memory, or non-empty via backend API).
  async function trashDirectory(wsId, dirPath, docs, callbacks) {
    const count = docs.filter(d =>
        d.name.startsWith(dirPath + '/') || d.name === dirPath).length;

    if (count === 0) {
      callbacks.removeInMemoryDir(dirPath);
      callbacks.render();
      return;
    }

    const msg = `Delete directory "${dirPath}" and all ${count} document(s)?`;
    const confirmed = await ModalDialog.confirm({
      title: 'Delete Directory',
      message: msg,
      danger: true,
      confirmText: 'Delete'
    });
    if (!confirmed) return;

    const data = await TreeApi.deletePrefix(wsId, dirPath);
    if (!data.success) {
      await ModalDialog.alert({
        title: 'Error',
        message: data.errorMessage || 'Failed to delete directory',
        isError: true
      });
      return;
    }
    callbacks.removeInMemoryDir(dirPath);
    await callbacks.reload();
  }

  // Deletes single document.
  async function deleteFile(docId, path, callbacks) {
    const confirmed = await ModalDialog.confirm({
      title: 'Delete Document',
      message: `Are you sure you want to delete "${path}"?`,
      danger: true,
      confirmText: 'Delete'
    });
    if (!confirmed) return;

    const data = await TreeApi.deleteDoc(docId);
    if (!data.success) {
      await ModalDialog.alert({
        title: 'Error',
        message: data.errorMessage || 'Failed to delete document',
        isError: true
      });
      return;
    }
    if (typeof DocumentEditor !== 'undefined' && DocumentEditor.isDocOpen(docId)) {
      DocumentEditor.closeDoc(docId);
    }
    await callbacks.reload();
  }

  // Sets up drag and drop handlers on a tree node.
  function setupDragDrop(el, info, wsId, callbacks) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify(info));
      e.stopPropagation();
    });
    el.addEventListener('dragover', (e) => {
      if (info.type === 'dir' || info.type === 'root') {
        e.preventDefault();
        el.classList.add('drag-over');
      }
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const src = JSON.parse(dataStr);
      if (src.path === info.path) return;

      const destPrefix = info.type === 'root' ? '' : info.path;
      if (src.type === 'doc') {
        const fileName = src.path.split('/').pop();
        const targetPath = destPrefix ? `${destPrefix}/${fileName}` : fileName;
        await TreeApi.renameDoc(src.docId, targetPath);
        await callbacks.reload();
      } else if (src.type === 'dir') {
        const dirName = src.path.split('/').pop();
        const targetPrefix = destPrefix ? `${destPrefix}/${dirName}` : dirName;
        await TreeApi.renamePrefix(wsId, src.path, targetPrefix);
        await callbacks.reload();
      }
    });
  }

  return {
    promptNewFile,
    promptNewDir,
    promptRenameFile,
    promptRenameDir,
    trashDirectory,
    deleteFile,
    setupDragDrop
  };
})();
