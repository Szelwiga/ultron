document.addEventListener('DOMContentLoaded', async () => {
  // Views & UI Elements
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');
  const googleBtn = document.getElementById('google-login-btn');
  const loginStatus = document.getElementById('login-status');
  const loginContainer = document.getElementById('google-login-container');

  const navUserDisplay = document.getElementById('nav-user-display');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const navLogoutBtn = document.getElementById('nav-logout-btn');

  // Workspace Switcher
  const wsSwitcherBtn = document.getElementById('ws-switcher-btn');
  const currentWsName = document.getElementById('current-ws-name');
  const wsSwitcherMenu = document.getElementById('ws-switcher-menu');
  const wsSwitcherList = document.getElementById('ws-switcher-list');
  const wsManageMenuItem = document.getElementById('ws-manage-menu-item');
  const canvasWsTitle = document.getElementById('canvas-ws-title');

  // Settings Tile
  const settingsTile = document.getElementById('settings-tile');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const usernameBanner = document.getElementById('username-banner');
  const settingsEmail = document.getElementById('settings-email');
  const settingsUsernameInput = document.getElementById('settings-username-input');
  const settingsSaveBtn = document.getElementById('settings-save-username-btn');
  const settingsFeedback = document.getElementById('settings-feedback');

  // Workspaces in Settings
  const wsCountBadge = document.getElementById('ws-count-badge');
  const newWsName = document.getElementById('new-ws-name');
  const newWsDesc = document.getElementById('new-ws-desc');
  const createWsBtn = document.getElementById('create-ws-btn');
  const workspacesListContainer = document.getElementById('workspaces-list-container');

  let currentUser = { email: '', username: '' };
  let accessibleWorkspaces = [];
  let currentWorkspaceId = localStorage.getItem('doki_current_ws_id') || '';
  let googleClientId = null;

  function showStatus(msg, type = 'info') {
    loginStatus.textContent = msg;
    loginStatus.className = 'status-msg ' + type;
  }

  function showFeedback(msg, isError = false) {
    settingsFeedback.textContent = msg;
    settingsFeedback.style.color = isError ? 'var(--danger)' : 'var(--primary)';
    settingsFeedback.style.display = 'block';
  }

  function switchView(isLoggedIn) {
    if (isLoggedIn) {
      loginView.classList.remove('active');
      mainView.classList.add('active');
      renderAppState();
      loadWorkspaces();
    } else {
      mainView.classList.remove('active');
      loginView.classList.add('active');
      closeSettings();
    }
  }

  function openSettings() {
    settingsEmail.textContent = currentUser.email || '';
    settingsUsernameInput.value = currentUser.username || '';
    settingsFeedback.style.display = 'none';

    if (!currentUser.username || currentUser.username.trim() === '') {
      usernameBanner.style.display = 'flex';
      closeSettingsBtn.style.display = 'none';
    } else {
      usernameBanner.style.display = 'none';
      closeSettingsBtn.style.display = 'inline-flex';
    }

    settingsTile.classList.add('open');
  }

  function closeSettings() {
    settingsTile.classList.remove('open');
  }

  function renderAppState() {
    const display = currentUser.username && currentUser.username.trim() !== ''
        ? currentUser.username
        : currentUser.email.split('@')[0];
    navUserDisplay.textContent = display;

    if (!currentUser.username || currentUser.username.trim() === '') {
      openSettings();
    } else {
      closeSettings();
    }
  }

  // --- WORKSPACE LOGIC ---

  async function loadWorkspaces() {
    try {
      const res = await fetch('/api/workspaces', {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      accessibleWorkspaces = data.workspaces || [];

      // Determine active workspace
      if (accessibleWorkspaces.length > 0) {
        const found = accessibleWorkspaces.find(w => w.workspaceId === currentWorkspaceId);
        if (!found) {
          currentWorkspaceId = accessibleWorkspaces[0].workspaceId;
          localStorage.setItem('doki_current_ws_id', currentWorkspaceId);
        }
      }

      renderWorkspaceSwitcher();
      renderSettingsWorkspaces();
    } catch (e) {
      console.error('Failed to load workspaces', e);
    }
  }

  function getActiveWorkspace() {
    return accessibleWorkspaces.find(w => w.workspaceId === currentWorkspaceId) || null;
  }

  function renderWorkspaceSwitcher() {
    const active = getActiveWorkspace();
    const name = active ? active.name : 'Select Workspace';
    currentWsName.textContent = name;
    canvasWsTitle.textContent = name;

    wsSwitcherList.innerHTML = '';
    accessibleWorkspaces.forEach(ws => {
      const item = document.createElement('div');
      item.className = 'workspace-menu-item' + (ws.workspaceId === currentWorkspaceId ? ' active' : '');
      item.innerHTML = `<span>${escapeHtml(ws.name)}</span>` +
          (ws.workspaceId === currentWorkspaceId ? '<span>✓</span>' : '');
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectWorkspace(ws.workspaceId);
      });
      wsSwitcherList.appendChild(item);
    });
  }

  function selectWorkspace(id) {
    currentWorkspaceId = id;
    localStorage.setItem('doki_current_ws_id', id);
    wsSwitcherMenu.classList.remove('open');
    renderWorkspaceSwitcher();
    renderSettingsWorkspaces();
  }

  function renderSettingsWorkspaces() {
    const owned = accessibleWorkspaces.filter(w =>
        w.ownerEmail.toLowerCase() === currentUser.email.toLowerCase());
    wsCountBadge.textContent = `${owned.length} / 10 owned`;

    workspacesListContainer.innerHTML = '';

    accessibleWorkspaces.forEach(ws => {
      const isOwner = ws.ownerEmail.toLowerCase() === currentUser.email.toLowerCase();
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

      // Event listeners for this card
      if (isOwner) {
        // Update name/description
        card.querySelector('.update-ws-btn').addEventListener('click', async () => {
          const nameVal = card.querySelector('.edit-ws-name').value.trim();
          const descVal = card.querySelector('.edit-ws-desc').value.trim();
          await updateWorkspace(ws.workspaceId, nameVal, descVal);
        });

        // Delete (only rendered for non-personal workspaces)
        const deleteBtn = card.querySelector('.delete-ws-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete workspace "${ws.name}"?`)) {
              await deleteWorkspace(ws.workspaceId);
            }
          });
        }

        // Add collaborator
        card.querySelector('.add-collab-btn').addEventListener('click', async () => {
          const emailInput = card.querySelector('.new-collab-email');
          const emailVal = emailInput.value.trim();
          if (emailVal) {
            await manageCollaborator(ws.workspaceId, emailVal, 'ADD');
            emailInput.value = '';
          }
        });

        // Remove collaborator
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

  // API calls for workspace operations
  createWsBtn.addEventListener('click', async () => {
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
      await loadWorkspaces();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  });

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
      await loadWorkspaces();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

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
      await loadWorkspaces();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

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
      if (currentWorkspaceId === workspaceId) {
        currentWorkspaceId = '';
        localStorage.removeItem('doki_current_ws_id');
      }
      await loadWorkspaces();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  // Switcher menu toggle
  wsSwitcherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    wsSwitcherMenu.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    wsSwitcherMenu.classList.remove('open');
  });

  wsManageMenuItem.addEventListener('click', () => {
    openSettings();
  });

  // --- AUTH & SETTINGS USERNAME ---

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          currentUser.email = data.email || '';
          currentUser.username = data.username || '';
          switchView(true);
          return;
        }
      }
    } catch (e) {
      console.warn('Session check failed', e);
    }
    switchView(false);
  }

  async function initGoogleAuth() {
    try {
      const res = await fetch('/api/auth/config');
      if (res.ok) {
        const data = await res.json();
        if (data.client_id) {
          googleClientId = data.client_id;
        }
      }
    } catch (err) {
      console.warn('Could not load google auth config', err);
    }
  }

  async function handleGoogleCredential(response) {
    showStatus('Verifying Google credentials...', 'info');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ idToken: response.credential })
      });

      if (!res.ok) {
        showStatus('Authentication failed (' + res.status + ')', 'error');
        return;
      }

      const data = await res.json();
      if (!data.success) {
        showStatus(data.errorMessage || 'Login failed', 'error');
        return;
      }

      currentUser.email = data.email || '';
      currentUser.username = data.username || '';
      switchView(true);
    } catch (err) {
      showStatus('Network error: ' + err.message, 'error');
    }
  }

  googleBtn.addEventListener('click', () => {
    if (!googleClientId) {
      showStatus('Google Client ID not loaded yet.', 'error');
      return;
    }
    if (window.google && window.google.accounts && window.google.accounts.id) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential
      });
      google.accounts.id.prompt();
    }
  });

  function tryRenderGoogleButton() {
    if (window.google && window.google.accounts && googleClientId) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential
      });
      google.accounts.id.renderButton(
        loginContainer,
        { theme: 'outline', size: 'large', width: 320 }
      );
      googleBtn.style.display = 'none';
    }
  }

  navSettingsBtn.addEventListener('click', () => {
    if (settingsTile.classList.contains('open')) {
      closeSettings();
    } else {
      openSettings();
    }
  });

  closeSettingsBtn.addEventListener('click', closeSettings);

  settingsSaveBtn.addEventListener('click', async () => {
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

      currentUser.username = data.username;
      showFeedback('Username saved successfully!');
      setTimeout(() => {
        renderAppState();
      }, 500);
    } catch (err) {
      showFeedback('Failed to save username: ' + err.message, true);
    }
  });

  navLogoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      currentUser = { email: '', username: '' };
      switchView(false);
      tryRenderGoogleButton();
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  await checkSession();
  await initGoogleAuth();
  setTimeout(tryRenderGoogleButton, 500);
});
