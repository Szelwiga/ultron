// Tree API and modal prompt operations for file/directory mutations.

const TreeApi = (() => {
  // Initializes modal prompt system.
  function init() {
    if (typeof ModalDialog !== 'undefined' && ModalDialog.init) {
      ModalDialog.init();
    }
  }

  // Opens validated prompt dialog using ModalDialog.
  async function openPrompt(title, defaultVal, callback) {
    const val = await ModalDialog.prompt({
      title: title,
      defaultValue: defaultVal || '',
      placeholder: 'Name (no spaces allowed)',
      validate: (v) => {
        const trimmed = (v || '').trim();
        if (!trimmed) {
          return 'Name cannot be empty';
        }
        if (/\s/.test(v)) {
          return 'File and directory names cannot contain spaces';
        }
        if (v.includes('//')) {
          return 'Name cannot contain consecutive slashes';
        }
        return null;
      }
    });

    if (val !== null && callback) {
      await callback(val.trim());
    }
  }

  // Closes prompt dialog.
  function closePrompt() {
    // Handled by ModalDialog
  }

  // Shows error text inside alert modal.
  function showError(msg) {
    if (typeof ModalDialog !== 'undefined' && ModalDialog.alert) {
      ModalDialog.alert({
        title: 'Error',
        message: msg,
        isError: true
      });
    } else {
      console.error(msg);
    }
  }

  // Creates document on the backend.
  async function createDoc(workspaceId, fullPath) {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        workspaceId: workspaceId,
        name: fullPath,
        content: ''
      })
    });
    return res.json();
  }

  // Renames single document on backend.
  async function renameDoc(docId, newName) {
    const res = await fetch('/api/documents/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        documentId: docId,
        newName: newName
      })
    });
    return res.json();
  }

  // Batch renames directory path prefix on backend.
  async function renamePrefix(workspaceId, oldPrefix, newPrefix) {
    const res = await fetch('/api/documents/batch_rename_prefix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        workspaceId: workspaceId,
        oldPrefix: oldPrefix,
        newPrefix: newPrefix
      })
    });
    return res.json();
  }

  // Deletes single document on backend.
  async function deleteDoc(docId) {
    const res = await fetch('/api/documents/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ documentId: docId })
    });
    return res.json();
  }

  // Deletes directory prefix on backend.
  async function deletePrefix(workspaceId, prefix) {
    const res = await fetch('/api/documents/delete_prefix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        workspaceId: workspaceId,
        prefix: prefix
      })
    });
    return res.json();
  }

  return {
    init,
    openPrompt,
    closePrompt,
    showError,
    createDoc,
    renameDoc,
    renamePrefix,
    deleteDoc,
    deletePrefix
  };
})();
