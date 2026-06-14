export interface CredentialsHint {
  source: 'env' | 'stored' | 'missing';
  api_id_masked?: string;
}

export interface EnvSnapshot {
  TELEGRAM_API_ID?: string;
  TELEGRAM_API_HASH?: string;
  TELEGRAM_AGENT_HOME?: string;
  LOG_LEVEL?: string;
}

export interface PackageMeta {
  name: string;
  version: string;
  repoUrl?: string;
}

export interface LoginCodeDeliveryHint {
  type: string;
  nextType?: string;
  timeoutSec?: number;
  length?: number;
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}
function escapeAttr(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function renderAuthPage(
  authSessionId: string,
  accounts: { id: string; phone: string; username?: string }[],
  creds: CredentialsHint,
  env: EnvSnapshot,
  pkg: PackageMeta,
): string {
  const brandLink = pkg.repoUrl
    ? `<a href="${escapeAttr(pkg.repoUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(pkg.name)}</a>`
    : escapeText(pkg.name);
  const logoHtml = pkg.repoUrl
    ? `<a class="logo-link" href="${escapeAttr(pkg.repoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(pkg.name)} repository"><img class="logo" src="/logo.png" alt="${escapeAttr(pkg.name)}" /></a>`
    : `<img class="logo" src="/logo.png" alt="${escapeAttr(pkg.name)}" />`;
  const accountsJson = JSON.stringify(accounts);
  const credsJson = JSON.stringify(creds);
  const envJson = JSON.stringify(env);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>telegram-agent</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #0e1014;
    --card: #161a21;
    --fg: #e6e6e6;
    --muted: #8a8f99;
    --accent: #2aabee;
    --danger: #ff5c5c;
    --input: #1d222b;
    --border: #2a2f38;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f5f6f8; --card: #ffffff; --fg: #1a1a1a; --muted: #6a6f7a; --input: #f5f6f8; --border: #e3e5ea; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px;
    display: grid; place-items: center;
    background: var(--bg); color: var(--fg);
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .wrap { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 14px; align-items: center; }
  .header { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .logo { width: 56px; height: 56px; object-fit: contain; display: block; }
  .logo-link { display: inline-block; line-height: 0; border-radius: 8px; transition: transform .12s; }
  .logo-link:hover { transform: scale(1.05); }
  .logo-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  .brand-line { font-size: 12px; color: var(--muted); letter-spacing: 0.02em; margin: 0; }
  .brand-line b { color: var(--fg); font-weight: 600; }
  .brand-line a { color: var(--fg); }
  .safety { font-size: 11px; color: var(--muted); opacity: 0.65; margin: 0; text-align: center; max-width: 320px; line-height: 1.5; }
  .card {
    width: 100%;
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    display: flex; flex-direction: column;
  }
  .body { padding: 18px; }
  .step { display: none; flex-direction: column; gap: 12px; }
  .step.active { display: flex; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  p.lede { margin: -6px 0 2px; color: var(--muted); font-size: 13px; }
  p.subtle { margin: -4px 0 0; color: var(--muted); font-size: 11.5px; opacity: 0.75; }
  input {
    width: 100%; padding: 10px 12px;
    background: var(--input); color: var(--fg);
    border: 1px solid var(--border); border-radius: 8px;
    font-size: 14px; outline: none;
  }
  input:focus { border-color: var(--accent); }
  button {
    width: 100%; padding: 10px 12px;
    border: 0; border-radius: 8px;
    background: var(--accent); color: white;
    font-size: 14px; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    transition: opacity .16s ease, border-color .16s ease, color .16s ease, background-color .16s ease;
  }
  button[disabled] { opacity: 0.5; cursor: not-allowed; }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); }
  button.ghost:hover { border-color: var(--accent); color: var(--accent); }
  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1.75px solid currentColor;
    border-right-color: transparent;
    display: none;
    animation: spin .72s linear infinite;
  }
  button.loading .spinner { display: inline-block; }
  button.loading .label { opacity: 0.9; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .err {
    padding: 8px 10px;
    background: rgba(255,92,92,0.1); color: var(--danger);
    border-radius: 8px; font-size: 12.5px;
    display: none;
  }
  .err.show { display: block; }
  .hint {
    padding: 9px 10px;
    background: rgba(42,171,238,0.12);
    color: var(--fg);
    border: 1px solid rgba(42,171,238,0.24);
    border-radius: 8px;
    font-size: 12.5px;
    display: none;
  }
  .hint.show { display: block; }
  .hint b { font-weight: 600; }
  .hint a { color: var(--accent); }
  .accounts { display: flex; flex-direction: column; gap: 6px; }
  .account {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px;
    background: var(--input); border: 1px solid var(--border); border-radius: 8px;
    cursor: pointer;
  }
  .account:hover { border-color: var(--accent); }
  .account .who { display: flex; flex-direction: column; gap: 2px; }
  .account .who b { font-size: 13px; font-weight: 500; }
  .account .who span { font-size: 12px; color: var(--muted); }
  .account .chev { color: var(--muted); font-size: 16px; line-height: 1; }
  .success { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0 4px; }
  .success .check {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--accent); color: white;
    display: grid; place-items: center; font-size: 22px;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .mini-config {
    margin-top: -2px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .mini-config summary {
    color: var(--muted);
    font-size: 11.5px;
    opacity: 0.72;
  }
  .mini-config .lede { margin-top: 8px; }
  .mini-config .stack { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .mini-config .row { display: flex; gap: 8px; align-items: center; }
  .mini-config .row button { width: auto; min-width: 92px; padding: 8px 10px; font-size: 12px; }
  .mini-config .row .status { font-size: 11.5px; color: var(--muted); }
  .code-actions { display: flex; gap: 8px; align-items: center; }
  .code-actions button { width: auto; min-width: 116px; }
  .code-status { font-size: 11.5px; color: var(--muted); }
  .meta-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    color: var(--muted);
    font-size: 11.5px;
    margin-top: -4px;
  }
</style>
</head>
<body>
<div class="wrap">
<div class="header">
  ${logoHtml}
  <p class="brand-line"><b>${brandLink}</b> &middot; sign in</p>
</div>
<div class="card">
  <div class="body">
    <div id="step-creds" class="step">
      <h1>API credentials</h1>
      <p class="lede">Get them at <a href="https://my.telegram.org/apps" target="_blank" rel="noopener">my.telegram.org/apps</a>. Saved to <code>~/.telegram-agent</code>.</p>
      <input id="api_id" inputmode="numeric" placeholder="api_id" />
      <input id="api_hash" placeholder="api_hash" />
      <button id="save-creds">Continue</button>
      <div class="err" id="err-creds"></div>
    </div>

    <div id="step-pick" class="step">
      <h1>Sign in</h1>
      <p class="lede">Use an account or add another.</p>
      <div class="accounts" id="accounts"></div>
      <button id="add-new" class="ghost"><span class="label">Add account</span></button>
    </div>

    <div id="step-phone" class="step">
      <h1>Phone</h1>
      <p class="lede">Enter your number with country code.</p>
      <div class="meta-line"><span>Bundled credentials active</span><span id="phone-state"></span></div>
      <input id="phone" type="tel" autocomplete="tel" placeholder="+12025550123" />
      <button id="send-code"><span class="spinner" aria-hidden="true"></span><span class="label">Send code</span></button>
      <div class="err" id="err-phone"></div>
      <details class="mini-config">
        <summary>Use different API credentials</summary>
        <p class="lede">Optional override. Environment variables still win.</p>
        <div class="stack">
          <input id="api_id_inline" inputmode="numeric" placeholder="api_id" />
          <input id="api_hash_inline" placeholder="api_hash" />
          <div class="row">
            <button id="save-creds-inline" class="ghost" type="button"><span class="spinner" aria-hidden="true"></span><span class="label">Save override</span></button>
            <span class="status" id="creds-status"></span>
          </div>
          <div class="err" id="err-creds-inline"></div>
        </div>
      </details>
    </div>

    <div id="step-code" class="step">
      <h1>Code</h1>
      <p class="lede">Enter the code for <span id="phone-echo"></span>.</p>
      <div class="hint" id="delivery-hint"></div>
      <input id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="12345" />
      <div class="code-actions">
        <button id="resend-code" class="ghost" type="button"><span class="spinner" aria-hidden="true"></span><span class="label">Resend</span></button>
        <span class="code-status" id="resend-status"></span>
      </div>
      <button id="submit-code"><span class="spinner" aria-hidden="true"></span><span class="label">Continue</span></button>
      <div class="err" id="err-code"></div>
    </div>

    <div id="step-password" class="step">
      <h1>2FA password</h1>
      <p class="lede">Enter your Telegram password.</p>
      <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />
      <button id="submit-password"><span class="spinner" aria-hidden="true"></span><span class="label">Continue</span></button>
      <div class="err" id="err-password"></div>
    </div>

    <div id="step-done" class="step">
      <div class="success">
        <div class="check" id="done-check">&check;</div>
        <h1 id="done-title">Signed in</h1>
        <p class="lede" id="done-lede">All set. You can close this tab.</p>
      </div>
    </div>
  </div>

</div>

<p class="safety">Runs locally. Data goes to Telegram only.</p>
</div>

<script>
  const AUTH_ID = ${JSON.stringify(authSessionId)};
  const accounts = ${accountsJson};
  let creds = ${credsJson};
  const env = ${envJson};
  let delivery = null;
  let resendTimer = null;

  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
  };
  const showErr = (id, msg) => { const el = $(id); el.textContent = msg; el.classList.add('show'); };
  const clearErr = (id) => { $(id).classList.remove('show'); };
  const showHint = (id, msg) => { const el = $(id); el.innerHTML = msg; el.classList.add('show'); };
  const clearHint = (id) => { const el = $(id); el.classList.remove('show'); el.innerHTML = ''; };
  const setText = (id, msg) => { $(id).textContent = msg || ''; };
  const setLoading = (id, loading, label) => {
    const button = $(id);
    if (!button) return;
    button.classList.toggle('loading', !!loading);
    button.disabled = !!loading;
    const text = button.querySelector('.label');
    if (text && label) text.textContent = label;
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function renderAccounts() {
    const wrap = $('accounts');
    wrap.innerHTML = '';
    for (const a of accounts) {
      const div = document.createElement('div');
      div.className = 'account';
      const label = a.username ? '@' + a.username : a.phone;
      div.innerHTML = '<div class="who"><b>' + escapeHtml(label) + '</b><span>' + escapeHtml(a.phone) + '</span></div><span class="chev">&rsaquo;</span>';
      div.onclick = () => pickExisting(a.id);
      wrap.appendChild(div);
    }
  }

  function labelDeliveryType(kind) {
    const labels = {
      telegram_app: 'Telegram app',
      sms: 'SMS',
      call: 'Phone call',
      flash_call: 'Flash call',
      missed_call: 'Missed call',
      email: 'Email',
      setup_email_required: 'Email setup required',
      fragment_sms: 'Fragment SMS',
      firebase_sms: 'Firebase SMS',
      sms_word: 'SMS word',
      sms_phrase: 'SMS phrase',
      unknown: 'unknown channel',
    };
    return labels[kind] || kind.replace(/_/g, ' ');
  }

  function renderDeliveryHint(deliveryHint) {
    clearHint('delivery-hint');
    if (!deliveryHint || !deliveryHint.type) return;
    const parts = ['<b>Delivery:</b> ' + escapeHtml(labelDeliveryType(deliveryHint.type))];
    if (deliveryHint.length) parts.push('code length ' + escapeHtml(String(deliveryHint.length)));
    if (deliveryHint.timeoutSec) parts.push('retry after about ' + escapeHtml(String(deliveryHint.timeoutSec)) + 's');
    if (deliveryHint.nextType) parts.push('fallback: ' + escapeHtml(labelDeliveryType(deliveryHint.nextType)));
    if (deliveryHint.type === 'telegram_app') {
      parts.push('look for the official service chat named <b>Telegram</b> in another signed-in session');
    }
    showHint('delivery-hint', parts.join(' · '));
    armResendTimer(deliveryHint.timeoutSec);
  }

  function presentCodeError(error) {
    const text = String(error || 'Failed');
    if (text.includes('SEND_CODE_UNAVAILABLE')) {
      return 'Telegram is allowing app delivery only for this login. Check another signed-in Telegram session, then try a fresh login later if needed.';
    }
    return text;
  }

  function armResendTimer(timeoutSec) {
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }
    const button = $('resend-code');
    if (!timeoutSec || timeoutSec <= 0) {
      button.disabled = false;
      setText('resend-status', '');
      return;
    }
    let remaining = timeoutSec;
    button.disabled = true;
    setText('resend-status', 'retry in ' + remaining + 's');
    resendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
        button.disabled = false;
        setText('resend-status', 'resend available');
        return;
      }
      setText('resend-status', 'retry in ' + remaining + 's');
    }, 1000);
  }

  function startFlow() {
    renderAccounts();
    updateCredsStatus();
    if (accounts.length === 0) return show('step-phone');
    show('step-pick');
  }

  function updateCredsStatus() {
    const labels = {
      env: 'Environment override is active.',
      stored: 'Saved override is active.',
      missing: 'Bundled default is active.',
    };
    $('creds-status').textContent = labels[creds.source] || '';
    $('phone-state').textContent = creds.source === 'stored' ? 'Custom override' : creds.source === 'env' ? 'Env override' : 'Default';
  }

  async function pickExisting(accountId) {
    const r = await fetch('/authorize/use-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, account_id: accountId }) });
    if (r.status === 401) {
      const body = await r.json().catch(() => ({}));
      if (body.error === 'session_expired') {
        if (body.phone) {
          $('phone').value = body.phone;
          $('phone-echo').textContent = body.phone;
        }
        showErr('err-phone', 'Session expired — sign in again to refresh.');
        return show('step-phone');
      }
    }
    if (!r.ok) return alert('Failed to use account');
    finish();
  }

  $('save-creds').onclick = async () => {
    clearErr('err-creds');
    const api_id = $('api_id').value.trim();
    const api_hash = $('api_hash').value.trim();
    if (!api_id || !api_hash) return showErr('err-creds', 'Both fields required');
    $('save-creds').disabled = true;
    try {
      const r = await fetch('/authorize/save-credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, api_id, api_hash }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return showErr('err-creds', body.error || 'Failed');
      creds = { source: 'stored' };
      show(accounts.length === 0 ? 'step-phone' : 'step-pick');
    } finally { $('save-creds').disabled = false; }
  };

  $('save-creds-inline').onclick = async () => {
    clearErr('err-creds-inline');
    const api_id = $('api_id_inline').value.trim();
    const api_hash = $('api_hash_inline').value.trim();
    if (!api_id || !api_hash) return showErr('err-creds-inline', 'Both fields required');
    setLoading('save-creds-inline', true);
    try {
      const r = await fetch('/authorize/save-credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, api_id, api_hash }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return showErr('err-creds-inline', body.error || 'Failed');
      creds = { source: 'stored' };
      $('api_id_inline').value = '';
      $('api_hash_inline').value = '';
      updateCredsStatus();
    } finally { setLoading('save-creds-inline', false); }
  };

  $('add-new').onclick = () => show('step-phone');

  $('send-code').onclick = async () => {
    clearErr('err-phone');
    clearHint('delivery-hint');
    const phone = $('phone').value.trim();
    if (!phone) return showErr('err-phone', 'Phone required');
    setLoading('send-code', true, 'Sending');
    try {
      const r = await fetch('/authorize/login-start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, phone }) });
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: 'Failed' }));
        return showErr('err-phone', error || 'Failed');
      }
      const body = await r.json().catch(() => ({}));
      delivery = body.delivery || null;
      $('phone-echo').textContent = phone;
      renderDeliveryHint(delivery);
      show('step-code');
    } finally { setLoading('send-code', false, 'Send code'); }
  };

  $('submit-code').onclick = async () => {
    clearErr('err-code');
    const code = $('code').value.trim();
    if (!code) return showErr('err-code', 'Code required');
    setLoading('submit-code', true, 'Checking');
    try {
      const r = await fetch('/authorize/login-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, code }) });
      const body = await r.json();
      if (!r.ok) return showErr('err-code', presentCodeError(body.error));
      if (body.status === 'password_needed') return show('step-password');
      finish();
    } finally { setLoading('submit-code', false, 'Continue'); }
  };

  $('resend-code').onclick = async () => {
    clearErr('err-code');
    setLoading('resend-code', true, 'Resending');
    setText('resend-status', 'requesting fallback…');
    try {
      const r = await fetch('/authorize/login-resend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setText('resend-status', '');
        return showErr('err-code', presentCodeError(body.error));
      }
      delivery = body.delivery || null;
      renderDeliveryHint(delivery);
      if (!delivery?.timeoutSec) setText('resend-status', 'resent');
    } finally {
      if (!delivery?.timeoutSec) setLoading('resend-code', false, 'Resend');
      else {
        const label = $('resend-code').querySelector('.label');
        if (label) label.textContent = 'Resend';
        $('resend-code').classList.remove('loading');
      }
    }
  };

  $('submit-password').onclick = async () => {
    clearErr('err-password');
    const password = $('password').value;
    if (!password) return showErr('err-password', 'Password required');
    setLoading('submit-password', true, 'Checking');
    try {
      const r = await fetch('/authorize/login-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, password }) });
      const body = await r.json();
      if (!r.ok) return showErr('err-password', body.error || 'Failed');
      finish();
    } finally { setLoading('submit-password', false, 'Continue'); }
  };

  function finish() {
    show('step-done');
  }

  startFlow();
</script>
</body>
</html>`;
}
