document.addEventListener('DOMContentLoaded', async () => {
  const loginView = document.getElementById('login-view');
  const workspaceView = document.getElementById('workspace-view');
  const userDisplayPill = document.getElementById('user-display-pill');
  const statusEl = document.getElementById('status');
  const googleBtn = document.getElementById('google-login-btn');
  const loginControls = document.getElementById('login-controls');
  const usernamePrompt = document.getElementById('username-prompt');
  const desiredNameInput = document.getElementById('desired-name');
  const saveUsernameBtn = document.getElementById('save-username-btn');
  const logoutBtn = document.getElementById('logout-btn');

  let googleClientId = null;

  function showStatus(msg, type = 'info') {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + type;
  }

  function showWorkspace(displayName) {
    userDisplayPill.textContent = displayName || 'User';
    loginView.classList.remove('active');
    workspaceView.classList.add('active');
  }

  function showLogin() {
    workspaceView.classList.remove('active');
    loginView.classList.add('active');
    usernamePrompt.style.display = 'none';
    loginControls.style.display = 'block';
    statusEl.className = 'status';
  }

  // 1. Initial check: are we already logged in?
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          showWorkspace(data.displayName);
          return true;
        }
      }
    } catch (e) {
      console.warn('Session check failed', e);
    }
    showLogin();
    return false;
  }

  // 2. Fetch Google Client ID from backend
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

  // Callback when Google credential returns
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

      if (data.needsUsernamePrompt) {
        loginControls.style.display = 'none';
        usernamePrompt.style.display = 'block';
        desiredNameInput.value = data.displayName || '';
        desiredNameInput.focus();
        showStatus('First login! Please set your username.', 'info');
      } else {
        showWorkspace(data.displayName);
      }
    } catch (err) {
      showStatus('Network error: ' + err.message, 'error');
    }
  }

  // 3. Setup Google button click
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
      google.accounts.id.prompt(); // Opens Google Sign-In prompt
    } else {
      showStatus('Google Identity Services library loading...', 'info');
    }
  });

  // Render official Google button if gsi is loaded
  function tryRenderGoogleButton() {
    if (window.google && window.google.accounts && googleClientId) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential
      });
      google.accounts.id.renderButton(
        document.getElementById('login-controls'),
        { theme: 'outline', size: 'large', width: 340 }
      );
      googleBtn.style.display = 'none';
    }
  }

  // 4. Save custom username
  saveUsernameBtn.addEventListener('click', async () => {
    const desired = desiredNameInput.value.trim();
    if (!/^[a-zA-Z]+$/.test(desired)) {
      showStatus('Username must contain only letters (a-zA-Z)', 'error');
      return;
    }

    try {
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
        showStatus(data.errorMessage || 'Failed to update username', 'error');
        return;
      }

      showWorkspace(data.displayName);
    } catch (err) {
      showStatus('Failed to save username: ' + err.message, 'error');
    }
  });

  // 5. Logout
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      showLogin();
      tryRenderGoogleButton();
    }
  });

  await checkSession();
  await initGoogleAuth();
  setTimeout(tryRenderGoogleButton, 500);
});
