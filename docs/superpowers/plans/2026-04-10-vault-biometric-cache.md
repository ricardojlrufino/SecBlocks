# Vault Biometric Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password vault to the SecBlocks Web UI that persists encrypted passwords in localStorage and unlocks via WebAuthn biometrics (PRF mode) or PIN fallback, with a new "Cofre" tab and an unlock banner.

**Architecture:** VaultManager is a self-contained JS module inline in `index.html`. It detects the best available auth mechanism (WebAuthn PRF → WebAuthn basic → PIN-only), stores an AES-GCM-256 ciphertext blob in localStorage, and derives the key from either the WebAuthn PRF output or PBKDF2(PIN+salt). A non-extractable `CryptoKey` is held in memory after unlock and cleared on lock.

**Tech Stack:** WebAuthn API (PRF extension), Web Crypto API (AES-GCM-256 already in use), localStorage — all native browser APIs, zero new dependencies.

---

## File Map

| File | Change |
|------|--------|
| `index.html` | All changes — CSS, HTML markup, JS VaultManager module |

All 8 tasks modify only `index.html`.

---

### Task 1: Add CSS for vault components

**Files:**
- Modify: `index.html` — inside `<style>` block, before `</style>` (line 439)

- [ ] **Step 1: Insert vault CSS before `</style>`**

Find `</style>` (line 439) and insert before it:

```css
    /* ── Vault Banner ── */
    .vault-banner {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: var(--surface);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 9px 14px;
      font-size: 0.82rem;
      color: var(--accent);
      margin-bottom: 14px;
    }
    .vault-banner span { display: flex; align-items: center; gap: 6px; }

    /* ── Vault Tab Panel ── */
    .vault-panel {
      max-width: 560px;
      margin: 40px auto 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
    }
    .vault-state-icon { font-size: 3rem; line-height: 1; }
    .vault-state-title { font-size: 1.1rem; font-weight: 700; color: var(--text); margin: 0; }
    .vault-state-desc { font-size: 0.85rem; color: var(--muted); margin: 0; }
    .vault-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

    /* ── Vault Buttons ── */
    .btn-vault  { background: var(--accent); color: #fff; }
    .btn-danger { background: var(--danger);  color: #fff; }

    /* ── Vault Modal ── */
    .vault-modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.65);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .vault-modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      max-width: 420px;
      width: 90%;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .vault-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .vault-modal-header span {
      font-weight: 700;
      font-size: 1rem;
      color: var(--text);
    }
    .vault-modal-body { display: flex; flex-direction: column; gap: 12px; }
    .vault-modal-msg  { color: var(--muted); font-size: 0.88rem; margin: 0; }
    .vault-modal-hint { color: var(--muted); font-size: 0.82rem; margin: 0; }
    .vault-modal-btns { display: flex; gap: 8px; }

    /* ── PIN Input ── */
    .vault-pin-wrap { display: flex; flex-direction: column; gap: 4px; }
    .vault-pin-wrap label { font-size: 0.8rem; color: var(--muted); }
    .vault-pin-input { letter-spacing: 4px; font-size: 1.1rem; text-align: center; }
    .vault-pin-err  { color: var(--danger); font-size: 0.8rem; margin: 0; }
```

- [ ] **Step 2: Verify in browser**

Open `index.html` in Chrome. Open DevTools → Console. Run:
```javascript
document.querySelector('.vault-modal-overlay')
```
Expected: `null` (doesn't exist yet — CSS loaded, no errors in console).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: add vault UI CSS (banner, tab panel, modal, PIN input)"
```

---

### Task 2: Add HTML markup

**Files:**
- Modify: `index.html` — tabs div (line 462), main div (line 465), after direct tab panel (line 628), before `<script>` (line 633)

- [ ] **Step 1: Add vault tab button**

Find in `.tabs`:
```html
  <button class="tab-btn" data-tab="direct">Texto Direto</button>
```
Insert after it:
```html
  <button class="tab-btn" data-tab="vault">Cofre 🔒</button>
```

- [ ] **Step 2: Add unlock banner**

Find:
```html
<div class="main">
```
Insert immediately after:
```html

  <!-- ── VAULT BANNER ── -->
  <div id="vault-banner" class="vault-banner">
    <span>🔒 Suas senhas estão salvas.</span>
    <button class="icon-btn" onclick="vaultUnlock()">Desbloquear cofre</button>
  </div>

```

- [ ] **Step 3: Add vault tab panel**

Find:
```html
</div><!-- /tab-direct -->
```
Insert after it:
```html

  <!-- ══════════════ TAB: COFRE ══════════════ -->
  <div class="tab-panel" id="tab-vault">
    <div class="vault-panel">
      <div id="vault-status-card"></div>
    </div>
  </div><!-- /tab-vault -->

```

- [ ] **Step 4: Add modal**

Find:
```html
</div><!-- /main -->

<script>
```
Insert between them:
```html
<!-- ── VAULT MODAL ── -->
<div id="vault-modal-overlay" class="vault-modal-overlay" onclick="vaultModalBackdropClick(event)">
  <div class="vault-modal">
    <div class="vault-modal-header">
      <span id="vault-modal-title">Cofre</span>
      <button class="icon-btn" onclick="vaultHideModal()">✕</button>
    </div>
    <div class="vault-modal-body" id="vault-modal-body"></div>
  </div>
</div>

```

- [ ] **Step 5: Verify in browser**

Open `index.html`. Expected:
- Third tab "Cofre 🔒" visible in tab bar
- Clicking it shows an empty white area (vault-status-card not populated yet)
- No JS errors in console

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add vault HTML — tab button, banner, tab panel, modal skeleton"
```

---

### Task 3: Vault core helpers

**Files:**
- Modify: `index.html` — inside `<script>`, before `// ══ LEVELS STATE ══` section (after line 670)

- [ ] **Step 1: Insert vault helpers section**

Find:
```javascript
// ══════════════════════════════════════════════
//  LEVELS STATE
// ══════════════════════════════════════════════
```
Insert before it:
```javascript
// ══════════════════════════════════════════════
//  VAULT MANAGER
// ══════════════════════════════════════════════

const VAULT_STORAGE_KEY = 'secblocks_vault';
const VAULT_PRF_LABEL   = new TextEncoder().encode('secblocks-vault-v1');
const VAULT_RP_ID       = window.location.hostname || 'localhost';

// ── Vault runtime state ──
let vaultUnlocked  = false;
let vaultPasswords = null;  // { L1: 'pwd', ... } when unlocked
let vaultKey       = null;  // non-extractable CryptoKey, cleared on lock

// ── Base64 / base64url helpers ──
function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function bytesToB64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Vault-specific AES-GCM (key pre-imported, no PBKDF2 inside) ──
async function vaultImportKey(rawBytes) {
  return crypto.subtle.importKey(
    'raw', rawBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function vaultEncryptPayload(payload, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return { iv: bytesToB64(iv), blob: bytesToB64(new Uint8Array(ct)) };
}
async function vaultDecryptPayload(iv, blob, key) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(iv) },
    key,
    b64ToBytes(blob)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── localStorage ──
function vaultLoad() {
  try { return JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY)); }
  catch { return null; }
}
function vaultStore(data) {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(data));
}

```

- [ ] **Step 2: Verify in browser console**

```javascript
// Run in DevTools console
typeof vaultLoad === 'function' &&
typeof vaultEncryptPayload === 'function' &&
typeof b64urlToBytes === 'function'
// Expected: true
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add VaultManager core helpers (base64, AES-GCM, localStorage)"
```

---

### Task 4: Vault UI helpers (modal + PIN prompt)

**Files:**
- Modify: `index.html` — inside the VAULT MANAGER script section (after Task 3 additions)

- [ ] **Step 1: Add modal UI functions**

Insert after the `vaultStore` function added in Task 3:

```javascript
// ── Modal UI ──
function vaultShowModalContent(html) {
  const overlay = document.getElementById('vault-modal-overlay');
  overlay.style.display = 'flex';
  document.getElementById('vault-modal-body').innerHTML =
    `<p class="vault-modal-msg">${html}</p>`;
}
function vaultHideModal() {
  document.getElementById('vault-modal-overlay').style.display = 'none';
}
function vaultModalBackdropClick(e) {
  if (e.target === document.getElementById('vault-modal-overlay')) vaultHideModal();
}

// ── PIN prompt — returns Promise<string|null> ──
function vaultPromptPin(title, hint, isSetup) {
  return new Promise(resolve => {
    document.getElementById('vault-modal-title').textContent = title;
    document.getElementById('vault-modal-overlay').style.display = 'flex';

    const confirmHtml = isSetup ? `
      <div class="vault-pin-wrap">
        <label>Confirmar PIN:</label>
        <input type="password" id="vault-pin2" class="vault-pin-input"
               placeholder="••••••" minlength="6" />
      </div>` : '';

    document.getElementById('vault-modal-body').innerHTML = `
      ${hint ? `<p class="vault-modal-hint">${hint}</p>` : ''}
      <div class="vault-pin-wrap">
        <label>PIN (mín. 6 dígitos):</label>
        <input type="password" id="vault-pin1" class="vault-pin-input"
               placeholder="••••••" minlength="6" />
      </div>
      ${confirmHtml}
      <p id="vault-pin-err" class="vault-pin-err" style="display:none"></p>
      <div class="vault-modal-btns">
        <button class="btn btn-vault" id="vault-pin-ok">Confirmar</button>
        <button class="btn btn-ghost" id="vault-pin-cancel">Cancelar</button>
      </div>
    `;

    const input1 = document.getElementById('vault-pin1');
    input1.focus();

    const showErr = msg => {
      const el = document.getElementById('vault-pin-err');
      el.textContent = msg; el.style.display = 'block';
    };

    document.getElementById('vault-pin-ok').onclick = () => {
      const pin = input1.value;
      if (pin.length < 6) return showErr('PIN deve ter no mínimo 6 dígitos.');
      if (isSetup) {
        const pin2 = document.getElementById('vault-pin2').value;
        if (pin !== pin2) return showErr('PINs não coincidem.');
      }
      vaultHideModal();
      resolve(pin);
    };

    document.getElementById('vault-pin-cancel').onclick = () => {
      vaultHideModal(); resolve(null);
    };

    input1.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('vault-pin-ok').click();
    });
  });
}

```

- [ ] **Step 2: Verify PIN prompt in console**

```javascript
// Opens modal with PIN prompt — type 6+ chars and click Confirmar
vaultPromptPin('Teste', 'Dica de teste', false).then(pin => console.log('PIN:', pin));
// Expected: modal opens; after confirming, logs the PIN; cancelling logs null
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add vault modal and PIN prompt UI helpers"
```

---

### Task 5: Vault setup flow

**Files:**
- Modify: `index.html` — inside VAULT MANAGER section

- [ ] **Step 1: Add vaultSetup and vaultShowSetupModal**

Insert after `vaultPromptPin`:

```javascript
// ── Setup ──
async function vaultSetup() {
  const hasWebAuthn = window.PublicKeyCredential && window.isSecureContext;

  if (!hasWebAuthn) {
    // PIN-only
    const pin = await vaultPromptPin('Definir PIN do cofre',
      'Biometria não disponível neste contexto. Use um PIN de pelo menos 6 dígitos.', true);
    if (!pin) return;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key  = await deriveKey(pin, salt);
    const { iv, blob } = await vaultEncryptPayload({}, key);
    vaultStore({ version: 1, mode: 'pin', salt: bytesToB64(salt), iv, blob });
    setStatus('✓ Cofre configurado com PIN.', 'ok');
    vaultRenderState();
    return;
  }

  // Try WebAuthn (PRF detected during credential creation)
  vaultShowModalContent('Registrando credencial… toque no sensor ou chave de segurança quando solicitado.');

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId    = crypto.getRandomValues(new Uint8Array(16));

    const credential = await navigator.credentials.create({ publicKey: {
      challenge,
      rp: { name: 'SecBlocks', id: VAULT_RP_ID },
      user: { id: userId, name: 'secblocks-user', displayName: 'SecBlocks User' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: VAULT_PRF_LABEL } } }
    }});

    const prfResult    = credential.getClientExtensionResults().prf?.results?.first;
    const credentialId = bytesToB64url(new Uint8Array(credential.rawId));

    if (prfResult) {
      // PRF mode: key from PRF, no PIN needed
      const key = await vaultImportKey(prfResult);
      const { iv, blob } = await vaultEncryptPayload({}, key);
      vaultStore({ version: 1, mode: 'prf', credentialId, iv, blob });
      vaultHideModal();
      setStatus('✓ Cofre configurado com biometria (PRF).', 'ok');
    } else {
      // Basic mode: WebAuthn as gate, PIN as key
      const pin = await vaultPromptPin('Definir PIN de backup',
        'Biometria disponível mas sem PRF. O PIN será a chave de cifração.', true);
      if (!pin) { vaultHideModal(); return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key  = await deriveKey(pin, salt);
      const { iv, blob } = await vaultEncryptPayload({}, key);
      vaultStore({ version: 1, mode: 'basic', credentialId, salt: bytesToB64(salt), iv, blob });
      setStatus('✓ Cofre configurado com WebAuthn + PIN.', 'ok');
    }

    vaultRenderState();

  } catch (err) {
    vaultHideModal();
    if (err.name === 'NotAllowedError') {
      // User cancelled biometric → offer PIN fallback
      const pin = await vaultPromptPin('Definir PIN do cofre',
        'Biometria cancelada. Configure um PIN para proteger o cofre.', true);
      if (!pin) return;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key  = await deriveKey(pin, salt);
      const { iv, blob } = await vaultEncryptPayload({}, key);
      vaultStore({ version: 1, mode: 'pin', salt: bytesToB64(salt), iv, blob });
      setStatus('✓ Cofre configurado com PIN.', 'ok');
      vaultRenderState();
    } else {
      setStatus(`Erro ao configurar cofre: ${err.message}`, 'err');
    }
  }
}

function vaultShowSetupModal() {
  document.getElementById('vault-modal-title').textContent = 'Configurar cofre';
  vaultShowModalContent('Detectando capacidades do dispositivo…');
  vaultSetup();
}

```

- [ ] **Step 2: Manual test — PIN-only path**

Run in console to simulate non-secure context:
```javascript
// Temporarily override to test PIN path (restore after)
const orig = window.isSecureContext;
Object.defineProperty(window, 'isSecureContext', { get: () => false, configurable: true });
vaultShowSetupModal();
// Expected: PIN prompt appears (no biometric attempt)
// After confirming PIN: localStorage.getItem('secblocks_vault') contains JSON with mode: 'pin'
// Restore:
Object.defineProperty(window, 'isSecureContext', { get: () => orig, configurable: true });
localStorage.removeItem('secblocks_vault');
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add vault setup flow with WebAuthn PRF / basic / PIN detection"
```

---

### Task 6: Vault unlock and applyVaultPasswords

**Files:**
- Modify: `index.html` — inside VAULT MANAGER section

- [ ] **Step 1: Add applyVaultPasswords**

Insert after `vaultShowSetupModal`:

```javascript
// ── Apply passwords to UI ──
function applyVaultPasswords(passwords) {
  for (const levelId of Object.keys(passwords)) {
    if (!levels.find(l => l.id === levelId)) {
      levels.push({ id: levelId, desc: `Nível ${levelId}` });
      levels.sort((a, b) => levelNum(a.id) - levelNum(b.id));
    }
  }
  renderLevels();
  for (const [levelId, pwd] of Object.entries(passwords)) {
    const el = document.getElementById('pass-' + levelId);
    if (el) el.value = pwd;
  }
  updateLevelsSummary();
}

```

- [ ] **Step 2: Add vaultUnlock**

Insert after `applyVaultPasswords`:

```javascript
// ── Unlock ──
async function vaultUnlock() {
  const vault = vaultLoad();
  if (!vault) return;

  try {
    let key;

    if (vault.mode === 'prf') {
      vaultShowModalContent('Toque no sensor ou chave de segurança para desbloquear…');
      const assertion = await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: VAULT_RP_ID,
        allowCredentials: [{ type: 'public-key', id: b64urlToBytes(vault.credentialId) }],
        userVerification: 'preferred',
        extensions: { prf: { eval: { first: VAULT_PRF_LABEL } } }
      }});
      const prfResult = assertion.getClientExtensionResults().prf?.results?.first;
      if (!prfResult) throw new Error('PRF não retornou resultado.');
      key = await vaultImportKey(prfResult);
      vaultHideModal();

    } else if (vault.mode === 'basic') {
      vaultShowModalContent('Toque no sensor para verificar presença…');
      await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: VAULT_RP_ID,
        allowCredentials: [{ type: 'public-key', id: b64urlToBytes(vault.credentialId) }],
        userVerification: 'preferred'
      }});
      vaultHideModal();
      const pin = await vaultPromptPin('PIN do cofre', '', false);
      if (!pin) return;
      key = await deriveKey(pin, b64ToBytes(vault.salt));

    } else { // pin
      const pin = await vaultPromptPin('PIN do cofre', '', false);
      if (!pin) return;
      key = await deriveKey(pin, b64ToBytes(vault.salt));
    }

    const passwords = await vaultDecryptPayload(vault.iv, vault.blob, key);
    vaultKey       = key;
    vaultPasswords = passwords;
    vaultUnlocked  = true;

    applyVaultPasswords(passwords);
    const count = Object.keys(passwords).length;
    setStatus(`🔓 Cofre desbloqueado — ${count} nível(is) carregado(s).`, 'ok');
    vaultRenderState();

  } catch (err) {
    vaultHideModal();
    if (err.name !== 'NotAllowedError') {
      setStatus(`Falha ao desbloquear: ${err.message}`, 'err');
    }
  }
}

```

- [ ] **Step 3: Verify unlock flow (manual)**

Run in console to set up a PIN vault first:
```javascript
// Set up vault with PIN
(async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Reuse deriveKey from the app
  const key = await deriveKey('minhasenha123', salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify({ L1: 'testpwd' })));
  localStorage.setItem('secblocks_vault', JSON.stringify({
    version: 1, mode: 'pin',
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    blob: btoa(String.fromCharCode(...new Uint8Array(ct)))
  }));
  console.log('Vault created');
})();
```
Then call `vaultUnlock()`. Enter `minhasenha123`. Expected: field `#pass-L1` is filled with `testpwd`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add vaultUnlock and applyVaultPasswords"
```

---

### Task 7: Vault save, lock, remove

**Files:**
- Modify: `index.html` — inside VAULT MANAGER section

- [ ] **Step 1: Add vaultSave, vaultLock, vaultRemove**

Insert after `vaultUnlock`:

```javascript
// ── Save (requires vault already unlocked — reuses vaultKey) ──
async function vaultSave() {
  if (!vaultKey) return setStatus('Desbloqueie o cofre antes de salvar.', 'err');
  const vault = vaultLoad();
  if (!vault) return;

  const passwords = {};
  for (const lvl of levels) {
    const pwd = getPassword(lvl.id);
    if (pwd) passwords[lvl.id] = pwd;
  }
  if (Object.keys(passwords).length === 0)
    return setStatus('Nenhuma senha configurada para salvar.', 'err');

  const { iv, blob } = await vaultEncryptPayload(passwords, vaultKey);
  vaultStore({ ...vault, iv, blob });
  vaultPasswords = passwords;
  const count = Object.keys(passwords).length;
  setStatus(`✓ ${count} senha(s) salva(s) no cofre.`, 'ok');
  vaultRenderState();
}

// ── Lock ──
function vaultLock() {
  vaultKey       = null;
  vaultPasswords = null;
  vaultUnlocked  = false;
  for (const lvl of levels) {
    const el = document.getElementById('pass-' + lvl.id);
    if (el) el.value = '';
  }
  updateLevelsSummary();
  setStatus('🔒 Cofre bloqueado.', '');
  vaultRenderState();
}

// ── Remove ──
function vaultRemove() {
  if (!confirm('Remover o cofre permanentemente? As senhas salvas serão perdidas.')) return;
  localStorage.removeItem(VAULT_STORAGE_KEY);
  vaultKey = null; vaultPasswords = null; vaultUnlocked = false;
  for (const lvl of levels) {
    const el = document.getElementById('pass-' + lvl.id);
    if (el) el.value = '';
  }
  updateLevelsSummary();
  setStatus('Cofre removido.', '');
  vaultRenderState();
}

```

- [ ] **Step 2: Quick verify**

Run in console:
```javascript
typeof vaultSave === 'function' &&
typeof vaultLock === 'function' &&
typeof vaultRemove === 'function'
// Expected: true
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add vaultSave, vaultLock, vaultRemove"
```

---

### Task 8: Vault UI state renderer

**Files:**
- Modify: `index.html` — inside VAULT MANAGER section

- [ ] **Step 1: Add vaultRenderState**

Insert after `vaultRemove`:

```javascript
// ── Render vault tab + banner based on current state ──
function vaultRenderState() {
  const vault  = vaultLoad();
  const banner = document.getElementById('vault-banner');
  const card   = document.getElementById('vault-status-card');
  const tabBtn = document.querySelector('[data-tab="vault"]');
  if (!banner || !card || !tabBtn) return;

  if (!vault) {
    banner.style.display = 'none';
    tabBtn.textContent = 'Cofre 🔒';
    card.innerHTML = `
      <div class="vault-state-icon">🔒</div>
      <p class="vault-state-title">Cofre não configurado</p>
      <p class="vault-state-desc">Salve suas senhas protegidas por biometria ou PIN.</p>
      <div class="vault-actions">
        <button class="btn btn-vault" onclick="vaultShowSetupModal()">Configurar cofre</button>
      </div>`;
    return;
  }

  const modeLabel = { prf: 'biometria (PRF)', basic: 'WebAuthn + PIN', pin: 'PIN' }[vault.mode] || vault.mode;

  if (!vaultUnlocked) {
    banner.style.display = 'flex';
    tabBtn.textContent = 'Cofre 🔒';
    card.innerHTML = `
      <div class="vault-state-icon">🔒</div>
      <p class="vault-state-title">Cofre disponível</p>
      <p class="vault-state-desc">Modo: <strong>${modeLabel}</strong></p>
      <div class="vault-actions">
        <button class="btn btn-vault" onclick="vaultUnlock()">Desbloquear</button>
        <button class="btn btn-danger" onclick="vaultRemove()">Remover cofre</button>
      </div>`;
    return;
  }

  const count = vaultPasswords ? Object.keys(vaultPasswords).length : 0;
  banner.style.display = 'none';
  tabBtn.textContent = 'Cofre 🔓';
  card.innerHTML = `
    <div class="vault-state-icon">🔓</div>
    <p class="vault-state-title">Cofre desbloqueado</p>
    <p class="vault-state-desc">Modo: <strong>${modeLabel}</strong> · ${count} nível(is) carregado(s)</p>
    <div class="vault-actions">
      <button class="btn btn-vault" onclick="vaultSave()">Salvar no cofre</button>
      <button class="btn btn-ghost" onclick="vaultLock()">Bloquear</button>
      <button class="btn btn-danger" onclick="vaultRemove()">Remover cofre</button>
    </div>`;
}

```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add vaultRenderState — renders vault tab and banner from current state"
```

---

### Task 9: Initialization and wiring

**Files:**
- Modify: `index.html` — `// Init` section (around line 1086)

- [ ] **Step 1: Call vaultRenderState on init**

Find:
```javascript
// Init
renderLevels();
```
Change to:
```javascript
// Init
renderLevels();
vaultRenderState();
```

- [ ] **Step 2: End-to-end test — full PIN flow**

1. Open `index.html` in Chrome
2. Click tab "Cofre 🔒"
3. Expected: card shows "Cofre não configurado" + "Configurar cofre" button
4. Click "Configurar cofre" (no biometria in localhost? → PIN prompt appears)
5. Enter PIN `minhasenha123`, confirm → status: "✓ Cofre configurado"
6. Tab shows "Cofre 🔒", card shows "Cofre disponível · Modo: PIN"
7. Banner appears above status bar: "🔒 Suas senhas estão salvas."
8. Reload page → banner still shown
9. Click "Desbloquear" (banner or vault tab) → PIN prompt
10. Enter `minhasenha123` → status: "🔓 Cofre desbloqueado — 0 nível(is)"
11. Tab shows "Cofre 🔓", banner hidden, card shows save/lock/remove buttons
12. Configure L1 password field with `teste123`
13. Click "Salvar no cofre" in vault tab → status: "✓ 1 senha(s) salva(s)"
14. Click "Bloquear" → L1 field clears, banner reappears
15. Reload → click "Desbloquear" → L1 fills automatically with `teste123`

- [ ] **Step 3: End-to-end test — biometric flow (Android/Chrome with fingerprint)**

1. Open PWA on Android Chrome
2. Tap "Configurar cofre"
3. Expected: Android fingerprint prompt appears
4. Authenticate → status: "✓ Cofre configurado com biometria (PRF)"
5. Reload → banner shown
6. Tap "Desbloquear" → fingerprint prompt → passwords loaded

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: initialize vault on app load — complete vault feature"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task that covers it |
|---|---|
| Session memory (passwords in JS var) | Task 6 — `vaultKey`, `vaultPasswords` in memory |
| Persistent vault with biometria | Task 5 — `vaultSetup` PRF path |
| PRF mode (Chrome 108+, Android, YubiKey) | Task 5 — PRF extension in credential |
| Basic mode (WebAuthn gate + PIN key) | Task 5 — basic fallback |
| PIN-only mode | Task 5 — no WebAuthn path |
| Auto-fill fields on unlock | Task 6 — `applyVaultPasswords` |
| Vault tab (not panel) | Task 2 — new tab-btn + tab-panel |
| Banner shortcut to unlock | Task 2 — `#vault-banner`; Task 9 — shown on init |
| Icon 🔒/🔓 reflects state | Task 8 — `vaultRenderState` |
| "Salvar no cofre" explicit, not auto | Task 7 — `vaultSave` called only on button click |
| "Bloquear" clears memory + fields | Task 7 — `vaultLock` |
| "Remover cofre" with confirmation | Task 7 — `vaultRemove` + `confirm()` |
| Local per-device (no export) | No export implemented — correct |

**Placeholder scan:** None found. All steps have complete code.

**Type consistency:** `deriveKey(pin, salt)` — `pin` is string, `salt` is `Uint8Array`. Matches existing signature at line 640. `b64ToBytes` returns `Uint8Array`. `vault.salt` stored as base64, read back with `b64ToBytes(vault.salt)` — consistent across Tasks 5, 6, 7. `VAULT_PRF_LABEL` defined once in Task 3, used in Tasks 5 and 6. `vaultKey` set in Task 6 unlock, consumed in Task 7 save, cleared in Task 7 lock — consistent.
