// Document Editor Module managing textarea editing and saving.

const DocumentEditor = (() => {
  let activeDocId = null;
  let activeDocName = null;
  let saveTimeout = null;
  let isSaving = false;
  let hasPendingChanges = false;

  const editorTile = document.getElementById('doc-editor-tile');
  const emptyState = document.getElementById('doc-empty-state');
  const activeState = document.getElementById('doc-active-state');
  const docTitle = document.getElementById('doc-title');
  const saveBadge = document.getElementById('doc-save-badge');
  const textarea = document.getElementById('doc-textarea');
  const saveBtn = document.getElementById('doc-save-btn');

  // Initializes editor event listeners.
  function init() {
    textarea.addEventListener('input', () => {
      hasPendingChanges = true;
      setSaveStatus('Unsaved changes');
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveContent, 800);
    });

    saveBtn.addEventListener('click', () => {
      if (hasPendingChanges) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveContent();
      }
    });
  }

  // Opens a document by ID, fetching full content from backend.
  async function open(docId, name) {
    if (activeDocId && hasPendingChanges) {
      await saveContent();
    }

    activeDocId = docId;
    activeDocName = name;
    emptyState.style.display = 'none';
    activeState.style.display = 'flex';
    docTitle.textContent = name;
    setSaveStatus('Loading...');
    textarea.value = '';
    textarea.disabled = true;

    try {
      const res = await fetch(
          `/api/documents/get?document_id=${encodeURIComponent(docId)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorMessage || 'Failed to load document');
        return;
      }

      const shards = data.document.shards || [];
      const content = shards.length > 0 ? shards[0].content || '' : '';
      textarea.value = content;
      textarea.disabled = false;
      hasPendingChanges = false;
      setSaveStatus('Saved');
    } catch (e) {
      setSaveStatus('Error loading');
      alert('Error loading document: ' + e.message);
    }
  }

  // Saves current textarea string content to the backend.
  async function saveContent() {
    if (!activeDocId || isSaving) return;
    isSaving = true;
    setSaveStatus('Saving...');

    try {
      const content = textarea.value;
      const res = await fetch('/api/documents/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          documentId: activeDocId,
          content: content
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        hasPendingChanges = false;
        setSaveStatus('Saved');
      } else {
        setSaveStatus('Failed to save');
      }
    } catch (e) {
      setSaveStatus('Network error');
    } finally {
      isSaving = false;
    }
  }

  // Resets editor back to empty state.
  function close() {
    activeDocId = null;
    activeDocName = null;
    hasPendingChanges = false;
    emptyState.style.display = 'flex';
    activeState.style.display = 'none';
  }

  // Updates visual save indicator.
  function setSaveStatus(msg) {
    saveBadge.textContent = msg;
  }

  // Returns current open document ID.
  function getActiveDocId() {
    return activeDocId;
  }

  return { init, open, close, saveContent, getActiveDocId };
})();
