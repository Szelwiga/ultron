// Tree API and modal prompt operations for file/directory mutations.

const TreeApi = (() => {
  const promptModal = document.getElementById('name-prompt-modal');
  const promptTitle = document.getElementById('prompt-title');
  const promptInput = document.getElementById('prompt-input');
  const promptError = document.getElementById('prompt-error');
  const promptSubmitBtn = document.getElementById('prompt-submit-btn');
  const promptCancelBtn = document.getElementById('prompt-cancel-btn');

  let activeCallback = null;

  // Initializes prompt modal button listeners.
  function init() {
    promptCancelBtn.addEventListener('click', closePrompt);
    promptSubmitBtn.addEventListener('click', handleSubmit);
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubmit();
      if (e.key === 'Escape') closePrompt();
    });
  }

  // Opens validated prompt dialog.
  function openPrompt(title, defaultVal, callback) {
    promptTitle.textContent = title;
    promptInput.value = defaultVal || '';
    promptError.style.display = 'none';
    activeCallback = callback;
    promptModal.style.display = 'flex';
    promptInput.focus();
  }

  // Closes prompt dialog.
  function closePrompt() {
    promptModal.style.display = 'none';
    activeCallback = null;
  }

  // Validates input blocking spaces before invoking callback.
  async function handleSubmit() {
    const val = promptInput.value.trim();
    if (!val) {
      showError('Name cannot be empty');
      return;
    }
    if (/\s/.test(val)) {
      showError('File and directory names cannot contain spaces');
      return;
    }
    if (val.includes('//')) {
      showError('Name cannot contain consecutive slashes');
      return;
    }
    if (activeCallback) {
      const ok = await activeCallback(val);
      if (ok !== false) closePrompt();
    }
  }

  // Shows error text inside prompt modal.
  function showError(msg) {
    promptError.textContent = msg;
    promptError.style.display = 'block';
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
