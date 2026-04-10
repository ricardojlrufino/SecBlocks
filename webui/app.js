// ══════════════════════════════════════════════
//  CRYPTO  (AES-GCM 256 + PBKDF2 SHA-256)
// ══════════════════════════════════════════════

const SALT_LEN = 16, IV_LEN = 12, ITER = 200_000;

async function deriveKey(password, salt) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: ITER },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptText(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv   = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key  = await deriveKey(password, salt);
  const buf  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
  );
  const out = new Uint8Array(SALT_LEN + IV_LEN + buf.byteLength);
  out.set(salt, 0); out.set(iv, SALT_LEN); out.set(new Uint8Array(buf), SALT_LEN + IV_LEN);
  return btoa(String.fromCharCode(...out));
}

async function decryptText(b64, password) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key   = await deriveKey(password, bytes.slice(0, SALT_LEN));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(SALT_LEN, SALT_LEN + IV_LEN) },
    key, bytes.slice(SALT_LEN + IV_LEN)
  );
  return new TextDecoder().decode(plain);
}

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

function setLevelsCollapsed(collapsed) {
  const body = document.getElementById('levelsBody');
  const chevron = document.getElementById('levelsChevron');
  if (!body || !chevron) return;
  body.classList.toggle('collapsed', collapsed);
  chevron.classList.toggle('open', !collapsed);
}

// ── Render vault tab + banner based on current state ──
function vaultRenderState() {
  const vault  = vaultLoad();
  const banner = document.getElementById('vault-banner');
  const card   = document.getElementById('vault-status-card');
  const tabBtn = document.querySelector('[data-tab="vault"]');
  if (!banner || !card || !tabBtn) return;

  if (!vault) {
    setLevelsCollapsed(false);
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
    setLevelsCollapsed(false);
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
  setLevelsCollapsed(true);
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

// ══════════════════════════════════════════════
//  LEVELS STATE
// ══════════════════════════════════════════════

let levels = [
  { id: 'L1',  desc: 'Desenvolvedores e equipe de suporte' },
  { id: 'L2',  desc: 'Desenvolvedor sênior autorizado'     },
  { id: 'L3',  desc: 'DevOps'                              },
  { id: 'L10', desc: 'Apenas administradores'              },
];

// Returns password from the DOM input for a given level id
function getPassword(levelId) {
  const el = document.getElementById('pass-' + levelId);
  return el ? el.value.trim() : '';
}

// Numeric extraction for sorting / color
function levelNum(id) {
  return parseInt(id.replace(/[^0-9]/g, '')) || 0;
}

// Color: green (L1) → yellow (L5) → red (L10+)
function levelColor(id) {
  const n = Math.min(levelNum(id), 10);
  const hue = Math.round(120 - (n / 10) * 120);
  return `hsl(${hue}, 75%, 55%)`;
}

function levelBg(id) {
  const n = Math.min(levelNum(id), 10);
  const hue = Math.round(120 - (n / 10) * 120);
  return `hsla(${hue}, 75%, 55%, 0.12)`;
}

// ══════════════════════════════════════════════
//  RENDER LEVELS
// ══════════════════════════════════════════════

function renderLevels() {
  const list = document.getElementById('levelsList');
  list.innerHTML = '';

  levels.forEach(lvl => {
    const color = levelColor(lvl.id);
    const bg    = levelBg(lvl.id);
    const row   = document.createElement('div');
    row.className = 'level-row';
    row.id = 'row-' + lvl.id;
    row.innerHTML = `
      <span class="level-badge" style="color:${color};background:${bg};border:1px solid ${color}40;">${lvl.id}</span>
      <div class="level-info">
        <span class="level-desc">${lvl.desc}</span>
        <span class="level-tag">[SECRET_${lvl.id}] → [ENCRYPTED_${lvl.id}]</span>
      </div>
      <div class="level-pass-wrap">
        <input type="password" id="pass-${lvl.id}" placeholder="Senha ${lvl.id}..." autocomplete="off" />
        <button class="icon-btn" onclick="toggleLevelPass('${lvl.id}', this)" title="Mostrar/ocultar">👁</button>
      </div>
      <button class="icon-btn del" onclick="removeLevel('${lvl.id}')" title="Remover nível">✕</button>
    `;
    list.appendChild(row);
  });

  updateLevelsSummary();
  renderDirectSelects();
}

function updateLevelsSummary() {
  const total    = levels.length;
  const withPass = levels.filter(l => getPassword(l.id)).length;
  document.getElementById('levelsSummary').textContent =
    `${total} nível${total !== 1 ? 'is' : ''} · ${withPass} com senha`;
}

function renderDirectSelects() {
  ['directLevel', 'directDecLevel'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = levels.map(l =>
      `<option value="${l.id}">${l.id} — ${l.desc}</option>`
    ).join('');
    if (prev && levels.find(l => l.id === prev)) sel.value = prev;
  });
}

function toggleLevelPass(id, btn) {
  const el = document.getElementById('pass-' + id);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? '👁' : '🙈';
}

function addLevel() {
  let id   = document.getElementById('newLevelId').value.trim().toUpperCase();
  const desc = document.getElementById('newLevelDesc').value.trim();
  if (!id) return setStatus('Informe o ID do nível (ex: L5).', 'err');
  if (!id.startsWith('L')) id = 'L' + id;
  if (levels.find(l => l.id === id)) return setStatus(`Nível ${id} já existe.`, 'err');

  levels.push({ id, desc: desc || `Nível ${id}` });
  // Sort by numeric value
  levels.sort((a, b) => levelNum(a.id) - levelNum(b.id));

  document.getElementById('newLevelId').value   = '';
  document.getElementById('newLevelDesc').value = '';
  renderLevels();
  setStatus(`Nível ${id} adicionado.`, 'ok');
}

function removeLevel(id) {
  if (levels.length <= 1) return setStatus('Deve existir pelo menos um nível.', 'err');
  levels = levels.filter(l => l.id !== id);
  renderLevels();
  setStatus(`Nível ${id} removido.`, '');
}

function toggleLevels() {
  const body    = document.getElementById('levelsBody');
  const chevron = document.getElementById('levelsChevron');
  body.classList.toggle('collapsed');
  chevron.classList.toggle('open');
}

// Keep summary updated as passwords change
document.addEventListener('input', e => {
  if (e.target && e.target.id && e.target.id.startsWith('pass-')) {
    updateLevelsSummary();
  }
});

// ══════════════════════════════════════════════
//  DOCUMENT MODE
// ══════════════════════════════════════════════

// Match any [SECRET_LX]…[/SECRET_LX]
const SECRET_RE    = /\[SECRET_(L\d+)\]([\s\S]*?)\[\/SECRET_\1\]/gi;
// Match any [ENCRYPTED_LX]…[/ENCRYPTED_LX]
const ENCRYPTED_RE = /\[ENCRYPTED_(L\d+)\]([\s\S]*?)\[\/ENCRYPTED_\1\]/gi;

async function encryptDocument() {
  const input = document.getElementById('inputDoc').value;
  SECRET_RE.lastIndex = 0;
  const matches = [...input.matchAll(SECRET_RE)];

  if (matches.length === 0)
    return setStatus('Nenhum bloco [SECRET_LX] encontrado no documento.', 'err');

  setStatus(`Criptografando ${matches.length} bloco(s)…`, 'info');

  let result = input, offset = 0, done = 0, skipped = 0;

  for (const m of matches) {
    const levelId = m[1];
    const pwd     = getPassword(levelId);

    if (!pwd) { skipped++; continue; }

    try {
      const b64     = await encryptText(m[2], pwd);
      const replace = `[ENCRYPTED_${levelId}]${b64}[/ENCRYPTED_${levelId}]`;
      const start   = m.index + offset;
      result = result.slice(0, start) + replace + result.slice(start + m[0].length);
      offset += replace.length - m[0].length;
      done++;
    } catch (e) {
      skipped++;
    }
  }

  document.getElementById('outputDoc').value = result;

  if (skipped > 0 && done === 0)
    setStatus(`Nenhum bloco criptografado — configure as senhas dos níveis encontrados.`, 'err');
  else if (skipped > 0)
    setStatus(`✓ ${done} criptografado(s). ${skipped} ignorado(s) — nível sem senha.`, 'ok');
  else
    setStatus(`✓ ${done} bloco(s) criptografado(s).`, 'ok');
}

async function decryptDocument() {
  const input = document.getElementById('inputDoc').value;
  ENCRYPTED_RE.lastIndex = 0;
  const matches = [...input.matchAll(ENCRYPTED_RE)];

  if (matches.length === 0)
    return setStatus('Nenhum bloco [ENCRYPTED_LX] encontrado no documento.', 'err');

  setStatus(`Descriptografando ${matches.length} bloco(s)…`, 'info');

  let result = input, offset = 0, done = 0, failed = 0, skipped = 0;

  for (const m of matches) {
    const levelId = m[1];
    const pwd     = getPassword(levelId);

    if (!pwd) { skipped++; continue; }

    try {
      const plain   = await decryptText(m[2].trim(), pwd);
      const replace = `[SECRET_${levelId}]${plain}[/SECRET_${levelId}]`;
      const start   = m.index + offset;
      result = result.slice(0, start) + replace + result.slice(start + m[0].length);
      offset += replace.length - m[0].length;
      done++;
    } catch {
      failed++;
    }
  }

  document.getElementById('outputDoc').value = result;

  const parts = [];
  if (done)    parts.push(`✓ ${done} descriptografado(s)`);
  if (failed)  parts.push(`✗ ${failed} falhou (senha errada?)`);
  if (skipped) parts.push(`${skipped} ignorado(s) (sem senha)`);
  setStatus(parts.join(' · '), failed > 0 ? 'err' : 'ok');
}

function swapPanels() {
  const a = document.getElementById('inputDoc');
  const b = document.getElementById('outputDoc');
  [a.value, b.value] = [b.value, a.value];
}

function clearAll() {
  document.getElementById('inputDoc').value  = '';
  document.getElementById('outputDoc').value = '';
  setStatus('Painéis limpos.', '');
}

// ══════════════════════════════════════════════
//  DIRECT MODE
// ══════════════════════════════════════════════

async function directEncrypt() {
  document.getElementById('shareBtn').style.display = 'none';
  const levelId = document.getElementById('directLevel').value;
  const pwd     = getPassword(levelId);
  if (!pwd) return setStatus(`Configure a senha para o nível ${levelId} acima.`, 'err');

  const plain = document.getElementById('directPlain').value.trim();
  if (!plain) return setStatus('Digite o texto a criptografar.', 'err');

  setStatus('Criptografando…', 'info');
  try {
    const b64 = await encryptText(plain, pwd);
    document.getElementById('directEncResult').value =
      `[ENCRYPTED_${levelId}]${b64}[/ENCRYPTED_${levelId}]`;
    document.getElementById('shareBtn').style.display = 'inline-flex';
    setStatus(`✓ Texto criptografado como ${levelId}.`, 'ok');
  } catch (e) {
    setStatus('Erro: ' + e.message, 'err');
  }
}

function shareDirectLink() {
  const result = document.getElementById('directEncResult').value.trim();
  const match  = result.match(/\[ENCRYPTED_(L\d+)\]([\s\S]*?)\[\/ENCRYPTED_\1\]/i);
  if (!match) return setStatus('Nenhum resultado para compartilhar.', 'err');

  const uri = `web+secblocks://${match[1]}/${match[2].trim()}`;
  const btn = document.getElementById('shareBtn');

  navigator.clipboard.writeText(uri).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copiado!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {
    setStatus(`Link: ${uri}`, 'ok');
  });
}

async function directDecrypt() {
  const raw = document.getElementById('directCipher').value.trim();
  if (!raw) return setStatus('Cole o bloco a descriptografar.', 'err');

  // Auto-detect level from tag
  const tagMatch = raw.match(/\[ENCRYPTED_(L\d+)\]([\s\S]*?)\[\/ENCRYPTED_\1\]/i);

  let b64, levelId;
  if (tagMatch) {
    levelId = tagMatch[1];
    b64     = tagMatch[2].trim();
  } else {
    // fallback: use selected level, treat raw as base64
    levelId = document.getElementById('directDecLevel').value;
    b64     = raw;
  }

  const pwd = getPassword(levelId);
  if (!pwd) return setStatus(`Configure a senha para o nível ${levelId} acima.`, 'err');

  setStatus('Descriptografando…', 'info');
  try {
    const plain = await decryptText(b64, pwd);
    document.getElementById('directDecResult').value = plain;
    setStatus(`✓ Descriptografado (nível ${levelId}).`, 'ok');
  } catch {
    setStatus('Falha — senha incorreta ou bloco corrompido.', 'err');
  }
}

// ══════════════════════════════════════════════
//  UI HELPERS
// ══════════════════════════════════════════════

function setStatus(msg, type = '') {
  const el = document.getElementById('statusBar');
  el.textContent = msg;
  el.className = 'status-bar' + (type ? ' ' + type : '');
}

function copyText(id) {
  const el = document.getElementById(id);
  if (!el || !el.value) return;
  navigator.clipboard.writeText(el.value).then(() => {
    const btn = document.querySelector(`[onclick="copyText('${id}')"]`);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ Copiado!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  });
}

async function pasteFromClipboard() {
  try {
    document.getElementById('inputDoc').value = await navigator.clipboard.readText();
  } catch {
    setStatus('Permissão de clipboard negada. Use Ctrl+V.', 'err');
  }
}

function openFile() { document.getElementById('fileInput').click(); }

function openEnvFile() { document.getElementById('envFileInput').click(); }

function loadEnvFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    let loaded = 0, created = 0;
    const toSet = [];

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      // Skip blank lines and comments
      if (!line || line.startsWith('#')) continue;

      // Accept:  L1=senha  |  SECRET_L1=senha  |  SECBLOCKS_L1=senha
      const m = line.match(/^(?:[A-Z_]*?_?)?(L\d+)\s*=\s*["']?(.+?)["']?\s*$/i);
      if (!m) continue;

      const levelId = m[1].toUpperCase();
      const pwd     = m[2];

      // Create level if it doesn't exist yet
      if (!levels.find(l => l.id === levelId)) {
        levels.push({ id: levelId, desc: `Nível ${levelId}` });
        levels.sort((a, b) => levelNum(a.id) - levelNum(b.id));
        created++;
      }

      toSet.push({ levelId, pwd });
    }

    // Render once so all inputs exist, then set all values
    renderLevels();
    for (const { levelId, pwd } of toSet) {
      const el = document.getElementById('pass-' + levelId);
      if (el) { el.value = pwd; loaded++; }
    }

    updateLevelsSummary();
    input.value = '';

    const parts = [];
    if (loaded)   parts.push(`${loaded} senha${loaded !== 1 ? 's' : ''} carregada${loaded !== 1 ? 's' : ''}`);
    if (created)  parts.push(`${created} nível${created !== 1 ? 'is' : ''} criado${created !== 1 ? 's' : ''}`);
    if (parts.length) setStatus(`✓ .env.secrets: ${parts.join(', ')}.`, 'ok');
    else setStatus('Nenhuma entrada válida encontrada no .env.secrets.', 'err');
  };
  reader.onerror = () => setStatus('Erro ao ler o arquivo .env.secrets.', 'err');
  reader.readAsText(file, 'UTF-8');
}

function loadFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('inputDoc').value = e.target.result;
    setStatus(`✓ Arquivo carregado: ${file.name}`, 'ok');
  };
  reader.onerror = () => setStatus('Erro ao ler o arquivo.', 'err');
  reader.readAsText(file, 'UTF-8');
  input.value = '';
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// Init
renderLevels();
vaultRenderState();

// PWA: Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
}

// PWA: Protocol Handler (fallback para Firefox e browsers sem manifest protocol_handlers)
if ('registerProtocolHandler' in navigator) {
  try {
    navigator.registerProtocolHandler(
      'web+secblocks',
      window.location.origin + window.location.pathname + '?uri=%s'
    );
  } catch(e) { /* silently ignore file://, iframes, etc */ }
}

// Deep Link: ?uri=web+secblocks://LEVEL/BASE64
(function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const rawUri = params.get('uri');
  if (!rawUri) return;

  // Double-decode guard (Windows pode double-encode)
  let uri = rawUri;
  try { uri = decodeURIComponent(uri); } catch {}
  if (uri.includes('%')) { try { uri = decodeURIComponent(uri); } catch {} }

  const match = uri.match(/^web\+secblocks:\/\/([^\/]+)\/(.+)$/i);
  if (!match) return setStatus('Deep link inválido.', 'err');

  const level = match[1].toUpperCase();  // ex: "L1"
  const b64   = match[2];               // base64 data

  // Preenche o textarea com o bloco completo
  const block = `[ENCRYPTED_${level}]${b64}[/ENCRYPTED_${level}]`;
  const cipherEl = document.getElementById('directCipher');
  if (cipherEl) cipherEl.value = block;

  // Seleciona o nível no fallback select
  const decLevelEl = document.getElementById('directDecLevel');
  if (decLevelEl) {
    const opt = [...decLevelEl.options].find(o => o.value === level);
    if (opt) decLevelEl.value = level;
  }

  // Muda para aba "Texto Direto"
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="direct"]')?.classList.add('active');
  document.getElementById('tab-direct')?.classList.add('active');

  setStatus(`🔗 Link recebido — nível ${level}. Configure a senha e clique Descriptografar.`, 'ok');

  // Auto-descriptografa se a senha já estiver configurada
  if (getPassword(level)) {
    setTimeout(() => directDecrypt(), 80);
  }
})();
