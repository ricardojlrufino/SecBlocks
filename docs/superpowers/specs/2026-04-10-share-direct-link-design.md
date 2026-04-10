# Share Direct Link — Design Spec

**Date:** 2026-04-10  
**Scope:** Modo Texto Direto → painel Criptografar

---

## Feature

Botão "🔗 Compartilhar" no painel de criptografia que gera e copia para o clipboard um link `web+secblocks://LEVEL/BASE64` a partir do resultado da criptografia.

---

## UI

- Botão adicionado ao `row-btns` do painel Criptografar, após o botão "⎘ Copiar"
- Inicialmente oculto (`display:none`)
- Exibido somente após `directEncrypt()` ter sucesso
- Ocultado novamente ao iniciar uma nova criptografia

```html
<button id="shareBtn" class="copy-btn" style="padding:7px 12px;display:none;"
        onclick="shareDirectLink()">🔗 Compartilhar</button>
```

---

## Lógica

### Modificações em `directEncrypt()`

1. No início da função: `document.getElementById('shareBtn').style.display = 'none'`
2. No `try`, após setar `directEncResult`: `document.getElementById('shareBtn').style.display = 'inline-flex'`

### Nova função `shareDirectLink()`

```
1. Lê valor de #directEncResult
2. Extrai levelId e b64 via regex: /\[ENCRYPTED_(L\d+)\]([\s\S]*?)\[\/ENCRYPTED_\1\]/i
3. Monta URI: `web+secblocks://${levelId}/${b64}`
4. navigator.clipboard.writeText(uri)
5. Sucesso: muda label para "✓ Copiado!", restaura "🔗 Compartilhar" após 2s
6. Fallback (clipboard negado): setStatus com o link para copiar manualmente
```

---

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `index.html` | +1 botão no HTML, +2 linhas em `directEncrypt()`, +1 função `shareDirectLink()` |
