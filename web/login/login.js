document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');
  const googleBtn = document.getElementById('google-login-btn');
  const loginStatus = document.getElementById('login-status');
  const loginContainer = document.getElementById('google-login-container');

  const navUserDisplay = document.getElementById('nav-user-display');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const navLogoutBtn = document.getElementById('nav-logout-btn');

  const settingsTile = document.getElementById('settings-tile');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const usernameBanner = document.getElementById('username-banner');
  const settingsEmail = document.getElementById('settings-email');
  const settingsUsernameInput = document.getElementById('settings-username-input');
  const settingsSaveBtn = document.getElementById('settings-save-username-btn');
  const settingsFeedback = document.getElementById('settings-feedback');

  let currentUser = { email: '', username: '' };
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

  // Switches between Login and Main Workspace View
  function switchView(isLoggedIn) {
    if (isLoggedIn) {
      loginView.classList.remove('active');
      mainView.classList.add('active');
      renderAppState();
    } else {
      mainView.classList.remove('active');
      loginView.classList.add('active');
      closeSettings();
    }
  }

  // Opens Settings Tile (takes full canvas)
  function openSettings() {
    settingsEmail.textContent = currentUser.email || '';
    settingsUsernameInput.value = currentUser.username || '';
    settingsFeedback.style.display = 'none';

    if (!currentUser.username || currentUser.username.trim() === '') {
      usernameBanner.style.display = 'flex';
      closeSettingsBtn.style.display = 'none'; // Require setting or closing after
    } else {
      usernameBanner.style.display = 'none';
      closeSettingsBtn.style.display = 'inline-flex';
    }

    settingsTile.classList.add('open');
  }

  // Closes Settings Tile
  function closeSettings() {
    settingsTile.classList.remove('open');
  }

  // Renders main UI header and checks if settings tile should pop up
  function renderAppState() {
    const display = currentUser.username && currentUser.username.trim() !== ''
        ? currentUser.username
        : currentUser.email.split('@')[0];
    navUserDisplay.textContent = display;

    // If username is empty, automatically pop up the settings tile
    if (!currentUser.username || currentUser.username.trim() === '') {
      openSettings();
    } else {
      closeSettings();
    }
  }

  // 1. Check existing session
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

  // 2. Fetch Google Client ID
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

  // Handles Google Credential response
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

  // Google button setup
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

  // 3. Settings interactions
  navSettingsBtn.addEventListener('click', () => {
    if (settingsTile.classList.contains('open')) {
      closeSettings();
    } else {
      openSettings();
    }
  });

  closeSettingsBtn.addEventListener('click', closeSettings);

  // Save username in settings
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

  // 4. Logout
  navLogoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      currentUser = { email: '', username: '' };
      switchView(false);
      tryRenderGoogleButton();
    }
  });

  await checkSession();
  await initGoogleAuth();
  setTimeout(tryRenderGoogleButton, 500);
});
