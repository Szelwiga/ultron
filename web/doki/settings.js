// Settings Module managing profile, username updates, and workspaces.

const SettingsManager = (() => {
  const settingsTile = document.getElementById('settings-tile');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const usernameBanner = document.getElementById('username-banner');
  const settingsEmail = document.getElementById('settings-email');
  const settingsUsernameInput = document.getElementById('settings-username-input');
  const settingsSaveBtn = document.getElementById('settings-save-username-btn');
  const settingsFeedback = document.getElementById('settings-feedback');

  const wsCountBadge = document.getElementById('ws-count-badge');
  const newWsName = document.getElementById('new-ws-name');
  const newWsDesc = document.getElementById('new-ws-desc');
  const createWsBtn = document.getElementById('create-ws-btn');
  const workspacesListContainer = document.getElementById('workspaces-list-container');

  let callbacks = {};
  const THEME_STORAGE_KEY = 'doki_theme';
  let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';

  // Applies selected theme to document root and stores in localStorage.
  function applyTheme(theme) {
    currentTheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Failed to save theme in localStorage', e);
    }
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    updateThemeButtons();
  }

  // Updates active state on theme switcher buttons.
  function updateThemeButtons() {
    const lightBtn = document.getElementById('theme-btn-light');
    const darkBtn = document.getElementById('theme-btn-dark');
    if (lightBtn) lightBtn.classList.toggle('active', currentTheme === 'light');
    if (darkBtn) darkBtn.classList.toggle('active', currentTheme === 'dark');
  }

  // Initializes settings tile buttons and input handlers.
  function init(cbs) {
    callbacks = cbs;
    closeSettingsBtn.addEventListener('click', closeSettings);
    settingsSaveBtn.addEventListener('click', saveUsername);
    createWsBtn.addEventListener('click', createWorkspace);

    const lightBtn = document.getElementById('theme-btn-light');
    const darkBtn = document.getElementById('theme-btn-dark');
    if (lightBtn) lightBtn.addEventListener('click', () => applyTheme('light'));
    if (darkBtn) darkBtn.addEventListener('click', () => applyTheme('dark'));
    updateThemeButtons();
  }

  // Opens settings overlay tile.
  function openSettings(currentUser) {
    settingsEmail.textContent = currentUser.email || '';
    settingsUsernameInput.value = currentUser.username || '';
    settingsFeedback.style.display = 'none';
    updateThemeButtons();

    if (!currentUser.username || currentUser.username.trim() === '') {
      usernameBanner.style.display = 'flex';
      closeSettingsBtn.style.display = 'none';
    } else {
      usernameBanner.style.display = 'none';
      closeSettingsBtn.style.display = 'inline-flex';
    }

    settingsTile.classList.add('open');
  }

  // Closes settings overlay tile.
  function closeSettings() {
    settingsTile.classList.remove('open');
  }

  // Checks if settings overlay tile is currently open.
  function isOpen() {
    return settingsTile.classList.contains('open');
  }

  // Validates and saves desired username via API.
  async function saveUsername() {
    const desired = settingsUsernameInput.value.trim();
    if (!/^[a-zA-Z]+$/.test(desired)) {
      showFeedback('Username must contain only letters (a-zA-Z)', true);
      return;
    }

    try {
      showFeedback('Saving username...');
      const res = await fetch('/api/auth/set_username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ desiredName: desired })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showFeedback(data.errorMessage || 'Failed to update username', true);
        return;
      }

      showFeedback('Username saved successfully!');
      if (callbacks.onUsernameUpdated) {
        callbacks.onUsernameUpdated(data.username);
      }
    } catch (err) {
      showFeedback('Failed to save username: ' + err.message, true);
    }
  }

  // Displays feedback message inside profile settings.
  function showFeedback(msg, isError = false) {
    settingsFeedback.textContent = msg;
    settingsFeedback.style.color = isError ? 'var(--danger)' : 'var(--primary)';
    settingsFeedback.style.display = 'block';
  }

  // Renders accessible workspaces cards inside settings tile.
  function renderWorkspaces(currentUser, accessibleWorkspaces) {
    const owned = accessibleWorkspaces.filter(w =>
        w.ownerEmail.toLowerCase() === currentUser.email.toLowerCase());
    wsCountBadge.textContent = `${owned.length} / 10 owned`;

    workspacesListContainer.innerHTML = '';

    accessibleWorkspaces.forEach(ws => {
      const isOwner = ws.ownerEmail.toLowerCase() ===
          currentUser.email.toLowerCase();
      const card = document.createElement('div');
      card.className = 'ws-card';

      let collabsHtml = '';
      const collabs = ws.collaboratorEmails || [];
      if (collabs.length === 0) {
        collabsHtml = '<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">No collaborators</div>';
      } else {
        collabs.forEach(c => {
          collabsHtml += `
            <div class="collab-item">
              <span>${escapeHtml(c)}</span>
              ${isOwner ? `<button class="btn btn-danger remove-collab-btn" data-ws="${ws.workspaceId}" data-email="${escapeHtml(c)}" style="padding: 2px 8px; font-size: 11px;">Remove</button>` : ''}
            </div>
          `;
        });
      }

      const isPersonal = ws.isPersonal || ws.name === 'Personal';
      const badgeText = isPersonal ? 'Personal' : (isOwner ? 'Owner' : 'Collaborator');
      const canDelete = isOwner && !isPersonal;

      card.innerHTML = `
        <div class="ws-card-header">
          <div>
            <span class="ws-title">${escapeHtml(ws.name)}</span>
            <span class="ws-badge">${badgeText}</span>
          </div>
          ${canDelete ? `<button class="btn btn-danger delete-ws-btn" data-ws="${ws.workspaceId}" style="padding: 4px 10px; font-size: 12px;">Delete</button>` : ''}
        </div>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">${escapeHtml(ws.description || 'No description')}</p>

        ${isOwner ? `
          <div style="margin-bottom: 12px; display: flex; gap: 8px;">
            <input type="text" class="input-text edit-ws-name" value="${escapeHtml(ws.name)}" placeholder="Rename" ${isPersonal ? 'disabled title="Personal workspace cannot be renamed"' : ''}>
            <input type="text" class="input-text edit-ws-desc" value="${escapeHtml(ws.description || '')}" placeholder="Update description">
            <button class="btn btn-secondary update-ws-btn" data-ws="${ws.workspaceId}">Update</button>
          </div>
        ` : ''}

        <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px;">Collaborators:</div>
        ${collabsHtml}

        ${isOwner ? `
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <input type="email" class="input-text new-collab-email" placeholder="collaborator@example.com">
            <button class="btn btn-secondary add-collab-btn" data-ws="${ws.workspaceId}">Add</button>
          </div>
        ` : ''}
      `;

      if (isOwner) {
        card.querySelector('.update-ws-btn').addEventListener('click', async () => {
          const nameVal = card.querySelector('.edit-ws-name').value.trim();
          const descVal = card.querySelector('.edit-ws-desc').value.trim();
          await updateWorkspace(ws.workspaceId, nameVal, descVal);
        });

        const deleteBtn = card.querySelector('.delete-ws-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete workspace "${ws.name}"?`)) {
              await deleteWorkspace(ws.workspaceId);
            }
          });
        }

        card.querySelector('.add-collab-btn').addEventListener('click', async () => {
          const emailInput = card.querySelector('.new-collab-email');
          const emailVal = emailInput.value.trim();
          if (emailVal) {
            await manageCollaborator(ws.workspaceId, emailVal, 'ADD');
            emailInput.value = '';
          }
        });

        card.querySelectorAll('.remove-collab-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const emailVal = btn.getAttribute('data-email');
            await manageCollaborator(ws.workspaceId, emailVal, 'REMOVE');
          });
        });
      }

      workspacesListContainer.appendChild(card);
    });
  }

  // Handles creating a new workspace.
  async function createWorkspace() {
    const name = newWsName.value.trim();
    const desc = newWsDesc.value.trim();
    if (!name) {
      alert('Workspace name is required');
      return;
    }
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name, description: desc })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorMessage || 'Failed to create workspace');
        return;
      }
      newWsName.value = '';
      newWsDesc.value = '';
      if (callbacks.onWorkspacesChanged) await callbacks.onWorkspacesChanged();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // Handles updating workspace name and description.
  async function updateWorkspace(workspaceId, name, description) {
    try {
      const res = await fetch('/api/workspaces/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ workspaceId, name, description })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorMessage || 'Failed to update workspace');
        return;
      }
      if (callbacks.onWorkspacesChanged) await callbacks.onWorkspacesChanged();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // Handles adding or removing a collaborator.
  async function manageCollaborator(workspaceId, collaboratorEmail, action) {
    try {
      const res = await fetch('/api/workspaces/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ workspaceId, collaboratorEmail, action })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorMessage || 'Failed to update collaborator');
        return;
      }
      if (callbacks.onWorkspacesChanged) await callbacks.onWorkspacesChanged();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // Handles deleting a workspace.
  async function deleteWorkspace(workspaceId) {
    try {
      const res = await fetch('/api/workspaces/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorMessage || 'Failed to delete workspace');
        return;
      }
      if (callbacks.onWorkspaceDeleted) callbacks.onWorkspaceDeleted(workspaceId);
      if (callbacks.onWorkspacesChanged) await callbacks.onWorkspacesChanged();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { init, openSettings, closeSettings, isOpen, renderWorkspaces };
})();
