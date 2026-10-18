// Main Doki Studio coordinator managing session, navigation, and state.

document.addEventListener('DOMContentLoaded', async () => {
  const navUserDisplay = document.getElementById('nav-user-display');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const navLogoutBtn = document.getElementById('nav-logout-btn');

  const wsSwitcherBtn = document.getElementById('ws-switcher-btn');
  const currentWsName = document.getElementById('current-ws-name');
  const wsSwitcherMenu = document.getElementById('ws-switcher-menu');
  const wsSwitcherList = document.getElementById('ws-switcher-list');
  const wsManageMenuItem = document.getElementById('ws-manage-menu-item');

  let currentUser = { email: '', username: '' };
  let accessibleWorkspaces = [];
  let currentWorkspaceId = localStorage.getItem('doki_current_ws_id') || '';

  // Initializes modules and settings callbacks.
  TreeViewer.init();
  DocumentEditor.init();
  DockLayout.init();

  SettingsManager.init({
    onUsernameUpdated: (newUsername) => {
      currentUser.username = newUsername;
      renderAppState();
    },
    onWorkspacesChanged: async () => {
      await loadWorkspaces();
    },
    onWorkspaceDeleted: (deletedId) => {
      if (currentWorkspaceId === deletedId) {
        currentWorkspaceId = '';
        localStorage.removeItem('doki_current_ws_id');
      }
    }
  });

  // Updates user display and toggles mandatory username banner if missing.
  function renderAppState() {
    const display = currentUser.username && currentUser.username.trim() !== ''
        ? currentUser.username
        : currentUser.email.split('@')[0];
    navUserDisplay.textContent = display;

    if (!currentUser.username || currentUser.username.trim() === '') {
      SettingsManager.openSettings(currentUser);
    } else {
      SettingsManager.closeSettings();
    }
  }

  // Loads accessible workspaces and synchronizes with TreeViewer.
  async function loadWorkspaces() {
    try {
      const res = await fetch('/api/workspaces', {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      accessibleWorkspaces = data.workspaces || [];

      if (accessibleWorkspaces.length > 0) {
        const found = accessibleWorkspaces.find(
            w => w.workspaceId === currentWorkspaceId);
        if (!found) {
          currentWorkspaceId = accessibleWorkspaces[0].workspaceId;
          localStorage.setItem('doki_current_ws_id', currentWorkspaceId);
        }
      }

      renderWorkspaceSwitcher();
      SettingsManager.renderWorkspaces(currentUser, accessibleWorkspaces);

      const active = getActiveWorkspace();
      if (active) {
        await TreeViewer.loadWorkspace(active.workspaceId, active.name);
      }
    } catch (e) {
      console.error('Failed to load workspaces', e);
    }
  }

  // Returns active workspace object.
  function getActiveWorkspace() {
    return accessibleWorkspaces.find(
        w => w.workspaceId === currentWorkspaceId) || null;
  }

  // Renders dropdown options for workspace switcher.
  function renderWorkspaceSwitcher() {
    const active = getActiveWorkspace();
    const name = active ? active.name : 'Select Workspace';
    currentWsName.textContent = name;

    wsSwitcherList.innerHTML = '';
    accessibleWorkspaces.forEach(ws => {
      const item = document.createElement('div');
      item.className = 'workspace-menu-item' +
          (ws.workspaceId === currentWorkspaceId ? ' active' : '');
      const isActive = ws.workspaceId === currentWorkspaceId;
      const mark = isActive ? '<span>✓</span>' : '';
      item.innerHTML = `<span>${escapeHtml(ws.name)}</span>${mark}`;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectWorkspace(ws.workspaceId);
      });
      wsSwitcherList.appendChild(item);
    });
  }

  // Selects active workspace and refreshes document tree.
  function selectWorkspace(id) {
    currentWorkspaceId = id;
    localStorage.setItem('doki_current_ws_id', id);
    wsSwitcherMenu.classList.remove('open');
    renderWorkspaceSwitcher();
    SettingsManager.renderWorkspaces(currentUser, accessibleWorkspaces);

    const active = getActiveWorkspace();
    if (active) {
      TreeViewer.loadWorkspace(active.workspaceId, active.name);
    }
    DocumentEditor.close();
  }

  // Workspace dropdown toggle
  wsSwitcherBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    wsSwitcherMenu.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    wsSwitcherMenu.classList.remove('open');
  });

  wsManageMenuItem.addEventListener('click', () => {
    SettingsManager.openSettings(currentUser);
  });

  navSettingsBtn.addEventListener('click', () => {
    if (SettingsManager.isOpen()) {
      SettingsManager.closeSettings();
    } else {
      SettingsManager.openSettings(currentUser);
    }
  });

  navLogoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.replace('/login/index.html');
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  }

  // Session verification: redirect to login if unauthenticated.
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        currentUser.email = data.email || '';
        currentUser.username = data.username || '';
        renderAppState();
        await loadWorkspaces();
        return;
      }
    }
  } catch (e) {
    console.warn('Session verification failed', e);
  }

  window.location.replace('/login/index.html');
});
