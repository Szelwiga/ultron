// ModalDialog: Unified custom modal dialogs replacing browser alerts, confirms, and prompts.

const ModalDialog = (() => {
  let overlayEl = null;
  let boxEl = null;
  let titleEl = null;
  let messageEl = null;
  let inputEl = null;
  let errorEl = null;
  let cancelBtn = null;
  let confirmBtn = null;

  let currentResolver = null;
  let currentValidator = null;

  function ensureDom() {
    if (overlayEl) return;

    let el = document.getElementById('unified-modal-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'unified-modal-overlay';
      el.className = 'modal-overlay';
      el.innerHTML = `
        <div class="modal-box" id="unified-modal-box">
          <div class="modal-title" id="unified-modal-title"></div>
          <div class="modal-message" id="unified-modal-message" style="display: none;"></div>
          <input type="text" class="input-text" id="unified-modal-input" style="display: none; margin-top: 12px;">
          <div class="modal-error" id="unified-modal-error" style="display: none;"></div>
          <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
            <button type="button" class="btn btn-secondary" id="unified-modal-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="unified-modal-confirm">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }

    overlayEl = el;
    boxEl = document.getElementById('unified-modal-box');
    titleEl = document.getElementById('unified-modal-title');
    messageEl = document.getElementById('unified-modal-message');
    inputEl = document.getElementById('unified-modal-input');
    errorEl = document.getElementById('unified-modal-error');
    cancelBtn = document.getElementById('unified-modal-cancel');
    confirmBtn = document.getElementById('unified-modal-confirm');

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) handleCancel();
    });

    window.addEventListener('keydown', (e) => {
      if (overlayEl.style.display !== 'flex') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    });

    inputEl.addEventListener('input', () => {
      errorEl.style.display = 'none';
      inputEl.classList.remove('input-error');
    });
  }

  function handleCancel() {
    if (!currentResolver) return;
    const resolve = currentResolver;
    currentResolver = null;
    currentValidator = null;
    overlayEl.style.display = 'none';
    resolve(null);
  }

  function handleConfirm() {
    if (!currentResolver) return;

    if (inputEl.style.display !== 'none') {
      const val = inputEl.value;
      if (currentValidator) {
        const err = currentValidator(val);
        if (err) {
          showError(err);
          return;
        }
      }
      const resolve = currentResolver;
      currentResolver = null;
      currentValidator = null;
      overlayEl.style.display = 'none';
      resolve(val);
    } else {
      const resolve = currentResolver;
      currentResolver = null;
      currentValidator = null;
      overlayEl.style.display = 'none';
      resolve(true);
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    inputEl.classList.add('input-error');
    inputEl.focus();
  }

  // Opens a custom confirmation dialog. Returns Promise<boolean>.
  function confirm(options = {}) {
    ensureDom();
    if (currentResolver) handleCancel();

    return new Promise((resolve) => {
      currentResolver = (val) => resolve(!!val);
      currentValidator = null;

      titleEl.textContent = options.title || 'Confirm';
      if (options.message) {
        messageEl.textContent = options.message;
        messageEl.style.display = 'block';
      } else {
        messageEl.style.display = 'none';
      }

      inputEl.style.display = 'none';
      errorEl.style.display = 'none';

      cancelBtn.style.display = 'inline-flex';
      cancelBtn.textContent = options.cancelText || 'Cancel';

      confirmBtn.textContent = options.confirmText || 'Confirm';
      if (options.danger) {
        confirmBtn.className = 'btn btn-danger';
      } else {
        confirmBtn.className = 'btn btn-primary';
      }

      overlayEl.style.display = 'flex';
      confirmBtn.focus();
    });
  }

  // Opens an informational or error alert modal. Returns Promise<void>.
  function alert(options = {}) {
    ensureDom();
    if (currentResolver) handleCancel();

    const title = typeof options === 'string' ? 'Notice' : (options.title || 'Notice');
    const message = typeof options === 'string' ? options : (options.message || '');
    const isError = typeof options === 'object' && options.isError;
    const okText = (typeof options === 'object' && options.okText) || 'OK';

    return new Promise((resolve) => {
      currentResolver = () => resolve();
      currentValidator = null;

      titleEl.textContent = title;
      messageEl.textContent = message;
      messageEl.style.display = 'block';

      inputEl.style.display = 'none';
      errorEl.style.display = 'none';

      cancelBtn.style.display = 'none';
      confirmBtn.textContent = okText;
      confirmBtn.className = isError ? 'btn btn-danger' : 'btn btn-primary';

      overlayEl.style.display = 'flex';
      confirmBtn.focus();
    });
  }

  // Opens a text prompt modal with validation. Returns Promise<string|null>.
  function prompt(options = {}) {
    ensureDom();
    if (currentResolver) handleCancel();

    return new Promise((resolve) => {
      currentResolver = resolve;
      currentValidator = options.validate || null;

      titleEl.textContent = options.title || 'Prompt';
      if (options.message) {
        messageEl.textContent = options.message;
        messageEl.style.display = 'block';
      } else {
        messageEl.style.display = 'none';
      }

      inputEl.style.display = 'block';
      inputEl.value = options.defaultValue || '';
      inputEl.placeholder = options.placeholder || '';
      inputEl.classList.remove('input-error');
      errorEl.style.display = 'none';

      cancelBtn.style.display = 'inline-flex';
      cancelBtn.textContent = options.cancelText || 'Cancel';

      confirmBtn.textContent = options.confirmText || 'OK';
      confirmBtn.className = 'btn btn-primary';

      overlayEl.style.display = 'flex';
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    });
  }

  return { init: ensureDom, confirm, alert, prompt };
})();
