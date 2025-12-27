(function(){
  // TrueHeart Password Reset Overlay (same as reference implementation)
  const DEFAULT_API = (typeof window !== 'undefined' && window.TRUEHEART_CONFIG && window.TRUEHEART_CONFIG.userAPI) ? window.TRUEHEART_CONFIG.userAPI : 'https://trueheartapps.com/user';

  function createStyle() {
    const css = `
.trueheart-passwd-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99999; display: flex; align-items: center; justify-content: center; }
.trueheart-passwd-panel { background: #fff; width: 100%; max-width: 420px; border-radius: 8px; padding: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.3); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
.trueheart-passwd-panel h2 { margin: 0 0 8px; font-size: 20px; }
.trueheart-passwd-panel p { margin: 0 0 16px; color: #333; }
.trueheart-passwd-input { width: 100%; padding: 10px 12px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
.trueheart-passwd-actions { display: flex; gap: 8px; justify-content: flex-end; }
.trueheart-passwd-btn { padding: 10px 14px; border-radius: 4px; border: none; cursor: pointer; font-weight: 600; }
.trueheart-passwd-btn.primary { background: #2b6cb0; color: white; }
.trueheart-passwd-btn.secondary { background: transparent; color: #333; border: 1px solid #ddd; }
.trueheart-passwd-error { color: #b00020; margin-bottom: 8px; min-height: 18px; }
.trueheart-passwd-success { color: #2a7f3e; margin-bottom: 8px; }
@media (max-width: 480px){ .trueheart-passwd-panel { margin: 16px; width: calc(100% - 32px); } }
`;
    const s = document.createElement('style');
    s.setAttribute('data-owner', 'trueheart-passwd');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function validatePassword(pwd) {
    if (!pwd || typeof pwd !== 'string') return { ok: false, error: 'Password required' };
    if (pwd.length < 8 || pwd.length > 128) return { ok: false, error: 'Password must be 8-128 characters' };
    if (!/[A-Z]/.test(pwd)) return { ok: false, error: 'Must include at least one uppercase letter' };
    if (!/[a-z]/.test(pwd)) return { ok: false, error: 'Must include at least one lowercase letter' };
    if (!/[0-9]/.test(pwd)) return { ok: false, error: 'Must include at least one number' };
    return { ok: true };
  }

  function buildPanel(apiBase, onSuccess, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'trueheart-passwd-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="trueheart-passwd-panel" role="document" aria-labelledby="tp-title">
        <h2 id="tp-title">Reset your password</h2>
        <p>Enter a new password to complete the reset.</p>
        <div class="trueheart-passwd-error" id="tp-error" aria-live="polite"></div>
        <input id="tp-new" class="trueheart-passwd-input" type="password" placeholder="New password" autocomplete="new-password" />
        <input id="tp-confirm" class="trueheart-passwd-input" type="password" placeholder="Confirm new password" autocomplete="new-password" />
        <div><label style="font-size:12px;color:#666"><input id="tp-show" type="checkbox"/> Show password</label></div>
        <div class="trueheart-passwd-actions" style="margin-top:12px">
          <button class="trueheart-passwd-btn secondary" id="tp-cancel">Cancel</button>
          <button class="trueheart-passwd-btn primary" id="tp-submit">Reset password</button>
        </div>
        <div class="trueheart-passwd-success" id="tp-success" aria-live="polite" style="display:none"></div>
      </div>
    `;

    // Handlers
    const inputNew = overlay.querySelector('#tp-new');
    const inputConfirm = overlay.querySelector('#tp-confirm');
    const btnSubmit = overlay.querySelector('#tp-submit');
    const btnCancel = overlay.querySelector('#tp-cancel');
    const errElem = overlay.querySelector('#tp-error');
    const successElem = overlay.querySelector('#tp-success');
    const showBox = overlay.querySelector('#tp-show');

    showBox.addEventListener('change', () => {
      const t = showBox.checked ? 'text' : 'password';
      inputNew.type = t; inputConfirm.type = t;
    });

    btnCancel.addEventListener('click', () => {
      removePanel(overlay);
      try { localStorage.removeItem('trueheart-reset-token'); } catch (e) {}
      if (onCancel) onCancel();
    });

    btnSubmit.addEventListener('click', async () => {
      errElem.textContent = '';
      const a = inputNew.value;
      const b = inputConfirm.value;
      if (a !== b) { errElem.textContent = 'Passwords do not match'; return; }
      const v = validatePassword(a);
      if (!v.ok) { errElem.textContent = v.error; return; }

      btnSubmit.disabled = true; btnCancel.disabled = true;
      try {
        const token = getTokenFromStorageOrUrl();
        if (!token) { errElem.textContent = 'Reset token not found'; btnSubmit.disabled = false; btnCancel.disabled = false; return; }

        const url = (apiBase || DEFAULT_API).replace(/\/+$/,'') + '/password/reset';
        const resp = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset_token: token, new_password: a })
        });
        const body = await resp.json().catch(()=>null);
        if (!resp.ok || (body && body.success === false)) {
          errElem.textContent = (body && (body.error || body.message)) || ('Reset failed (status ' + resp.status + ')');
          btnSubmit.disabled = false; btnCancel.disabled = false;
          return;
        }

        // Success
        successElem.style.display = 'block';
        successElem.textContent = body && body.message ? body.message : 'Password changed successfully';
        try { localStorage.removeItem('trueheart-reset-token'); } catch (e) {}
        // Small delay before closing to show success
        setTimeout(() => { removePanel(overlay); if (onSuccess) onSuccess(); }, 1200);
      } catch (err) {
        errElem.textContent = err && err.message ? err.message : 'Network error';
        btnSubmit.disabled = false; btnCancel.disabled = false;
      }
    });

    // Enter handling
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); btnSubmit.click();
      } else if (e.key === 'Escape') {
        e.preventDefault(); btnCancel.click();
      }
    });

    return overlay;
  }

  function removePanel(panel) {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    const existing = document.querySelector('style[data-owner="trueheart-passwd"]');
  }

  function getTokenFromStorageOrUrl() {
    try {
      const local = localStorage.getItem('trueheart-reset-token');
      if (local) return local;
    } catch (e) {}
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('reset_token');
      return t;
    } catch (e) {}
    return null;
  }

  function showIfTokenPresent(apiBase, opts = {}) {
    const token = getTokenFromStorageOrUrl();
    if (!token) return false;
    try {
      const u = new URL(window.location);
      if (u.searchParams.has('reset_token')) { u.searchParams.delete('reset_token'); window.history.replaceState({}, document.title, u.pathname + u.search); }
    } catch (e) {}

    if (!document.querySelector('style[data-owner="trueheart-passwd"]')) createStyle();

    const overlay = buildPanel(apiBase, opts.onSuccess, opts.onCancel);
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#tp-new');
    if (input) input.focus();
    return true;
  }

  window.TrueHeartPasswd = {
    init: function(options = {}) {
      const apiBase = options.apiBase || DEFAULT_API;
      showIfTokenPresent(apiBase, options);
      this.show = () => showIfTokenPresent(apiBase, options) || (function(){ })();
    },
    show: function(){ }
  };
})();
