document.addEventListener('DOMContentLoaded', async () => {
  const googleBtn = document.getElementById('google-login-btn');
  const loginStatus = document.getElementById('login-status');
  const loginContainer = document.getElementById('google-login-container');
  let googleClientId = null;

  function showStatus(msg, type = 'info') {
    loginStatus.textContent = msg;
    loginStatus.className = 'status-msg ' + type;
  }

  function redirectToStudio() {
    window.location.replace('/doki/studio.html');
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          redirectToStudio();
          return true;
        }
      }
    } catch (e) {
      console.warn('Session check failed', e);
    }
    return false;
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

      redirectToStudio();
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

  const alreadyLoggedIn = await checkSession();
  if (!alreadyLoggedIn) {
    await initGoogleAuth();
    setTimeout(tryRenderGoogleButton, 500);
  }
});
