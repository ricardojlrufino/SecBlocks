# Guia do Usuário: Web UI e Deep Links

## O que é o SecBlocks

O SecBlocks permite criptografar senhas e segredos diretamente no navegador.

Na Web UI, você pode:

- proteger trechos de um documento
- criptografar um valor isolado
- compartilhar um segredo por link sem enviar a senha junto

O conteúdo é criptografado localmente no navegador. A senha do nível nunca é enviada no link.

---

## Acesso à Web UI

Use a interface em:

`https://ricardojlrufino.github.io/SecBlocks/`

Ou localmente em:

[`webui/index.html`](./webui/index.html)

---

## Instalar como aplicativo (PWA)

Para abrir links `web+secblocks://...` diretamente no SecBlocks, instale a Web UI como aplicativo.

### Chrome ou Edge no desktop

1. Abra a Web UI.
2. Clique no ícone de instalar na barra de endereço.
3. Confirme a instalação.

### Android com Chrome

1. Abra a Web UI.
2. Abra o menu do navegador.
3. Toque em `Adicionar à tela inicial`.

Depois disso, links `web+secblocks://...` poderão abrir o SecBlocks diretamente.

---

## Como usar o Cofre

Use para salvar localmente seu arquivo de senhas-mestre dos níveis no navegador, protegidas por biometria ou PIN.

Isso evita redigitar as mesmas senhas toda vez.

1. Abra a aba `Cofre`.
2. Clique em `Configurar cofre`.
3. Siga o fluxo de biometria ou PIN.
4. Depois de configurar, desbloqueie o cofre quando quiser preencher as senhas automaticamente.

O cofre é local ao seu navegador e dispositivo.

---

## Como compartilhar uma senha com segurança

Esse é o fluxo recomendado para Slack, Discord, WhatsApp ou e-mail.

1. Abra a aba `Texto Direto`.
2. Escolha o nível de segurança, por exemplo `L1`.
3. Digite o segredo.
4. Clique em `Criptografar`.
5. Clique em `Compartilhar`.

O SecBlocks vai gerar um link como:

```text
web+secblocks://L1/X+jz3W02h0...bAg==
```

Você pode enviar esse link no canal de comunicação.

O link contém apenas o conteúdo criptografado. A senha do nível não vai junto.

---

## Como o destinatário abre o link

1. O destinatário precisa ter acesso ao SecBlocks.
2. Ele abre o link recebido.
3. O SecBlocks abre na aba `Texto Direto`.
4. Se a senha do nível já estiver configurada, a descriptografia pode acontecer automaticamente.
5. Caso contrário, ele informa a senha do nível e clica em `Descriptografar`.

Sem a senha correta, o conteúdo não pode ser lido.

---

## Exemplo prático

Você quer enviar uma senha temporária para a equipe de suporte.

1. Configure a senha-mestre do nível `L1`.
2. Na aba `Texto Direto`, digite `SenhaTemp-2026!`.
3. Clique em `Criptografar`.
4. Clique em `Compartilhar`.
5. Envie o link gerado no Slack ou WhatsApp.

Quem tiver a senha-mestre do nível `L1` conseguirá abrir.

---

## Regra de segurança mais importante

Nunca envie **o link criptografado** e a **senha-mestre** do nível no mesmo canal.

O uso seguro é:

- enviar o link no chat
- compartilhar a senha-mestre do nível por outro meio seguro

Exemplos de outro meio:

- gerenciador de senhas
- ligação
- canal interno restrito

---

## Quando usar cada aba

Use `Documento` quando:

- estiver trabalhando com um arquivo Markdown
- precisar proteger vários trechos no mesmo texto

Use `Texto Direto` quando:

- quiser compartilhar um único segredo
- precisar gerar um deep link

Use `Cofre` quando:

- quiser guardar as senhas-mestre dos níveis localmente
- quiser desbloquear e preencher os campos mais rápido

---

## Limitações importantes

- quem não tiver a senha correta não consegue descriptografar
- se a senha do nível for perdida, o conteúdo daquele nível não poderá ser recuperado
- o cofre é local ao navegador/dispositivo
- links `web+secblocks://...` funcionam melhor com a Web UI instalada como PWA
