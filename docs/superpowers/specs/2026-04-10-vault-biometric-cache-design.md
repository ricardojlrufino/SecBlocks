# Design: Cofre de Senhas com Biometria / PIN

**Data:** 2026-04-10  
**Status:** Aprovado  
**Escopo:** Web UI (`index.html`) — sem mudanças no CLI

---

## Objetivo

Eliminar a necessidade de redigitar ou recarregar o `.env.secrets` a cada sessão. As senhas dos níveis de segurança são cifradas e persistidas localmente, protegidas por biometria (WebAuthn) ou PIN. O desbloqueio preenche automaticamente os campos de senha na UI.

---

## Arquitetura

Três camadas adicionadas ao `index.html` existente:

```
┌─────────────────────────────────────────────────────┐
│  UI Layer                                            │
│  Aba "Cofre" · Banner de atalho · Modal de setup    │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  VaultManager (módulo JS inline)                     │
│  - detectCapability()                                │
│  - setup(pin?)                                       │
│  - unlock()                                          │
│  - save(passwords)                                   │
│  - lock()                                            │
│  - remove()                                          │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────┐   ┌──────────▼──────────────────┐
│  WebAuthn API   │   │  Web Crypto API              │
│  PRF extension  │   │  AES-GCM-256 · PBKDF2-SHA256 │
└─────────────────┘   └─────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│  localStorage["secblocks_vault"]                     │
└─────────────────────────────────────────────────────┘
```

---

## Modos de operação

Detectados automaticamente no setup — o usuário não escolhe manualmente.

| Modo | Chave de cifração | Biometria |
|------|------------------|-----------|
| `prf` | 32 bytes gerados pelo WebAuthn PRF | Digital / Face ID / YubiKey |
| `basic` | PBKDF2(PIN + salt) | WebAuthn como portão de acesso + PIN como chave |
| `pin` | PBKDF2(PIN + salt) | Apenas PIN |

**Detecção de modo:**
1. Tenta registrar credencial WebAuthn com extensão PRF → modo `prf`
2. Se PRF indisponível mas WebAuthn disponível → modo `basic`
3. Se WebAuthn indisponível → modo `pin`

**Plataformas:**
- Android (Chrome 108+): modo `prf` via impressão digital / Face Unlock
- Linux + YubiKey/FIDO2 (Chrome/Edge): modo `prf` via toque na chave física
- Linux sem hardware biométrico: modo `pin`

---

## Estrutura do cofre (localStorage)

Chave: `secblocks_vault`

```json
{
  "version": 1,
  "mode": "prf | basic | pin",
  "credentialId": "base64url... (ausente no modo pin)",
  "salt": "base64... (ausente no modo prf puro)",
  "iv": "base64...",
  "blob": "base64..."
}
```

**Payload decifrado** (nunca persiste em disco):

```json
{
  "L1": "senha-nivel-1",
  "L2": "senha-nivel-2",
  "L3": "senha-nivel-3"
}
```

---

## Fluxo de setup

```
Usuário clica "Configurar cofre" (na aba Cofre)
        │
        ▼
detectCapability()
        │
        ├─ modo prf ──► Modal: "Biometria disponível. Toque no sensor para registrar."
        │               Pede PIN de fallback opcional (mín. 6 dígitos)
        │               navigator.credentials.create() com extensão PRF
        │               Cofre vazio criado e salvo
        │
        ├─ modo basic ─► Modal: "WebAuthn disponível. Defina um PIN obrigatório."
        │                navigator.credentials.create() sem PRF
        │                PBKDF2(PIN + salt aleatório) → chave AES
        │                Cofre vazio criado e salvo
        │
        └─ modo pin ──► Modal: "Defina um PIN obrigatório."
                        PBKDF2(PIN + salt aleatório) → chave AES
                        Cofre vazio criado e salvo
```

---

## Fluxo de desbloqueio

```
App abre → cofre detectado em localStorage
        │
        ▼
Banner no topo: "🔒 Suas senhas estão salvas. [ Desbloquear cofre ]"
        │
Usuário clica (banner ou botão na aba Cofre)
        │
        ├─ modo prf ──► navigator.credentials.get() com PRF
        │               PRF output → chave AES → decifra blob
        │               Preenche campos da UI ✓
        │
        ├─ modo basic ─► navigator.credentials.get() (prova de presença)
        │                Pede PIN
        │                PBKDF2(PIN + salt) → chave AES → decifra blob
        │                Preenche campos da UI ✓
        │
        └─ modo pin ──► Pede PIN
                        PBKDF2(PIN + salt) → chave AES → decifra blob
                        Preenche campos da UI ✓
```

---

## Fluxo de salvar senhas

Explícito — o usuário clica **"Salvar no cofre"** após configurar as senhas. Não há salvamento automático.

```
Usuário clica "Salvar no cofre"
        │
        ▼
Autentica (mesmo fluxo de desbloqueio para derivar a chave)
        │
        ▼
Gera novo IV aleatório
AES-GCM cifra JSON das senhas atuais dos campos
        │
        ▼
localStorage ← cofre atualizado com novo iv + blob
```

---

## Mudanças na UI

### Nova aba "Cofre"

```
[ Documento ]  [ Texto Direto ]  [ Cofre 🔒 ]
```

O ícone da aba reflete o estado: 🔒 bloqueado / 🔓 desbloqueado.

### Estados da aba Cofre

**Não configurado:**
```
🔒 Cofre de Senhas
Salve suas senhas protegidas por biometria ou PIN.

[ Configurar cofre ]
```

**Configurado e bloqueado:**
```
🔒 Cofre disponível · modo: biometria
[ Desbloquear ]  [ Remover cofre ]
```

**Desbloqueado:**
```
🔓 Cofre desbloqueado · 3 níveis carregados
[ Salvar no cofre ]  [ Bloquear ]
```

### Banner de atalho (fora da aba)

Exibido abaixo do header quando cofre configurado e bloqueado. Não bloqueia o uso do app.

```
🔒 Suas senhas estão salvas.  [ Desbloquear cofre ]
```

Some após desbloqueio. Não é exibido se cofre não configurado.

### Modal de setup (etapas)

**Etapa 1:** Detecção e confirmação do modo  
**Etapa 2 (modo basic/pin):** Definição do PIN (mín. 6 dígitos, campo de confirmação)

---

## Propriedades de segurança

| Propriedade | Detalhe |
|---|---|
| Chave nunca persiste | Modo `prf`: derivada do hardware a cada unlock. Modos `basic`/`pin`: derivada do PIN em memória, descartada após uso |
| PBKDF2 | SHA-256, 200.000 iterações (mesmo parâmetro já usado no app) |
| AES-GCM-256 | Autenticado — adulteração no blob é detectada e rejeitada |
| IV único por save | Novo IV gerado a cada "Salvar no cofre" |
| Sem senhas em claro no storage | Apenas ciphertext em localStorage |
| Senhas em memória JS | Após unlock, senhas ficam em variável JS — não gravadas em sessionStorage/localStorage em claro |
| Botão "Bloquear" | Limpa variável em memória e os campos da UI |

### Tradeoffs aceitos

- **XSS**: script malicioso na página poderia capturar senhas em memória. Mitigado: app é single-file sem dependências externas.
- **Acesso físico com aba aberta**: senhas ficam em memória enquanto a aba estiver aberta. O botão "Bloquear" mitiga manualmente.
- **Exportação de cofre**: fora de escopo — cofre é local por dispositivo/browser.

---

## O que não muda

- Campos de senha existentes
- Botão "Carregar .env.secrets"
- Toda lógica de criptografia/descriptografia de documentos
- Nenhuma dependência externa adicionada
- Formato de ciphertext dos documentos (compatibilidade CLI ↔ Web UI mantida)
