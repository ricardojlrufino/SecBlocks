# SecBlocks (**alpha)

Encrypt and decrypt sensitive blocks inside Markdown (or any text) documents using multi-level security. Each security level has its own master-password, so different team members can only decrypt what they are authorized to see.

The expected scenario is a team storing internal documentation (process docs, environment setup notes, team contact info, onboarding guides) in a private or semi-private repo ( on-premisse drive/git repo ).


Comes in two flavors:

- **Web UI** — `index.html`, runs entirely in the browser, zero dependencies
- **CLI** — Go binary, pipe-friendly, CI/CD ready

---

## How it works

Wrap any secret inside a tag that indicates the security level:

```markdown
# Database Credentials

Host: db.prod.internal
Password: [SECRET_L1]my-db-password[/SECRET_L1]
Root token: [SECRET_L10]ultra-secret-root-token[/SECRET_L10]
```

Run `secblocks encrypt` and the blocks become opaque ciphertext:

```markdown
# Database Credentials

Host: db.prod.internal
Password: [ENCRYPTED_L1]X+jz3W02h0/A6EEY...bAg==[/ENCRYPTED_L1]
Root token: [ENCRYPTED_L10]nFrnchBlnd3RQlo...umti[/ENCRYPTED_L10]
```

The document structure, comments, and non-secret content are preserved verbatim. Only the content inside the tags is touched.

### Security levels/blocks

| Tag | Suggested audience |
|---|---|
| `[SECRET_L1]` | All developers, support team, employees |
| `[SECRET_L2]` | Senior developers (authorized) |
| `[SECRET_L3]` | DevOps / infrastructure team |
| `[SECRET_L10]` | Administrators only |

Levels are completely arbitrary — use whatever numbering makes sense for your organization. Each level uses an independent AES-GCM-256 key derived from its own password via PBKDF2-SHA256 (200 000 iterations).

The encrypted format is **identical** between the CLI and the Web UI, so you can encrypt with one and decrypt with the other interchangeably.

---

### Transparent git integration (encrypt on commit, decrypt on checkout)

Git's **clean/smudge filter** mechanism lets you work with plaintext files locally while git stores only encrypted content — no manual encrypt/decrypt step needed.

#### How it works

| Git event | Filter triggered | Effect |
|---|---|---|
| `git add` / commit | **clean** → `secblocks encrypt` | Plaintext with `[SECRET_LX]` tags → ciphertext stored in git |
| `git checkout` / clone | **smudge** → `secblocks decrypt` | Ciphertext in git → plaintext with `[SECRET_LX]` tags on disk |

You always edit files with readable `[SECRET_LX]` tags. Git handles encryption silently.

#### 1. Register the filter (once per machine)

Add this to your **global** git config (`~/.gitconfig`) or to the repo's `.git/config`:

```bash
git config --global filter.secblocks.clean  "secblocks encrypt"
git config --global filter.secblocks.smudge "secblocks decrypt"
git config --global filter.secblocks.required true
```

`required = true` makes git abort the operation if `secblocks` is not installed, preventing accidental plaintext commits.

#### 2. Enable the filter per repository

Create or edit `.gitattributes` in the repository root:

```gitattributes
# Apply secblocks filter to all Markdown files
*.md  filter=secblocks diff=secblocks

# Or only specific files
credentials.md  filter=secblocks diff=secblocks
secrets/*.md    filter=secblocks diff=secblocks
```

Also add a diff text-converter so `git diff` shows readable diffs:

```bash
git config --global diff.secblocks.textconv "secblocks decrypt"
```

#### 3. Make sure passwords are available at checkout

The smudge filter runs non-interactively during `git checkout` and `git clone`, so passwords must be discoverable without any prompt. The recommended setup is the **home fallback** (scenario 0):

```bash
# Copy or generate your passwords there
secblocks keygen -n 10 -o ~/.env.secrets
chmod 600 ~/.env.secrets
```

`secblocks` always checks `~/.env.secrets` automatically, so no `--env` flag is needed.

In CI/CD, export passwords as environment variables — the tool picks them up without any file:

```bash
export SECRET_L1=... SECRET_L3=...
git checkout ...   # smudge runs secblocks decrypt with env vars
```

#### 4. Re-encrypt existing files after setup

If the repository already contains plaintext files, re-checkout them so git applies the smudge filter:

```bash
# Force git to re-process all tracked Markdown files through the filter
git ls-files -z "*.md" | xargs -0 git checkout-index --force
```

#### Caveats

- **Passwords must be present at checkout time.** A user without the right `.env.secrets` will see `[ENCRYPTED_LX]` tags in their working tree instead of plaintext — the smudge filter silently passes through blocks it cannot decrypt, so the operation never fails.
- **`git diff` on encrypted files** requires the `diff.secblocks.textconv` config above; without it, diffs show base64 noise.
- **Never apply the filter to the `.env.secrets` file itself** — that file must stay out of git entirely (add it to `.gitignore`).

---

## Security notes

- The `.env.secrets` file is written with mode `0600` (owner read/write only).
- Never commit `.env.secrets` to version control.
- The Web UI performs all cryptography locally in the browser via the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). No data is sent to any server.
- The CLI reads passwords from environment variables or a local file; passwords are never written to disk by the encrypt/decrypt commands.


---

## CLI

### Install

```bash
cd cli
go build -o secblocks .

# Optional: install system-wide
sudo mv secblocks /usr/local/bin/
```

### Commands

#### `keygen` — generate passwords

```bash
# Generate passwords for L1..L4 and write to .env.secrets
secblocks keygen -n 4 -o .env.secrets

# Generate L1..L10 into the home fallback location
secblocks keygen -n 10 -o ~/.env.secrets

# Custom password length in bytes before base64 encoding (default: 32 = 43 chars)
secblocks keygen -n 3 --length 48 -o .env.secrets
```

Output file format:

```dotenv
# SecBlocks — passwords file
# Generated: 2026-04-09 21:28:37
# WARNING: do not commit this file. Add it to .gitignore

SECRET_L1=c83I6s5sBsnFOhkWMvaSpCWWaektMrdw...
SECRET_L2=DXSMS2K7lusisEHPtuyD2sA8S-Gm1WQ4...
SECRET_L3=XXDoYO1h0S4ZvuCoaLL6wZfk4gboZjaA...
SECRET_L4=T1eHx0t7e1FcJGUc6snpJbNRgBs3KHG...
```

Running `keygen` on an existing file **preserves** passwords for levels already present and only generates new ones for new levels.

---

#### `encrypt` — encrypt secret blocks

```bash
# File in, file out
secblocks encrypt doc.md -o doc.enc.md

# Stdin / stdout (pipe-friendly)
cat doc.md | secblocks encrypt > doc.enc.md

# Custom secrets file
secblocks encrypt doc.md -e /run/secrets/.env.secrets -o doc.enc.md
```

Blocks whose level has no password configured are **silently skipped** — useful when a team member only has L1/L2 passwords and the document also contains L10 blocks.

---

#### `decrypt` — decrypt encrypted blocks

```bash
secblocks decrypt doc.enc.md -o doc.md
cat doc.enc.md | secblocks decrypt > doc.md
secblocks decrypt doc.enc.md -e /run/secrets/.env.secrets
```

---

#### Global flag

```
-e, --env string   path to passwords file (default: .env.secrets)
```

---

### Password sources

Passwords are merged from three sources in this order — later sources override earlier ones:

| Priority | Source | Notes |
|---|---|---|
| 1 (lowest) | `~/.env.secrets` | User-level fallback, always consulted |
| 2 | `.env.secrets` in the current directory (or `--env`) | Project-level file |
| 3 (highest) | Environment variables | Useful in CI/CD and containers |

The canonical format is `SECRET_LX`. The parser also accepts bare `LX` and `SECBLOCKS_LX` for compatibility.

```bash
# The tool prints where passwords were loaded from (to stderr)
$ secblocks encrypt doc.md
passwords: /home/alice/.env.secrets, .env.secrets
✓  3 encrypted
```

**Lookup rules for `--env`:**
- If `--env` is **not** passed: both the home fallback and `.env.secrets` (if present) are merged. Missing files are silently ignored.
- If `--env` is **explicitly** passed: the given path must exist, otherwise an error is returned.

```bash
# Inject passwords inline — no file needed at all
SECRET_L1=pass1 SECRET_L3=pass3 secblocks decrypt doc.enc.md

# Point to a specific file (must exist)
secblocks decrypt doc.enc.md --env /run/secrets/.env.secrets
```

---

## Web UI

Open `index.html` in any modern browser. No server, no build step, no internet connection required.

- **Document tab** — paste or open a Markdown file, encrypt/decrypt all levels at once
- **Direct text tab** — encrypt or decrypt a single value without a full document

Passwords are entered per-level in the security panel at the top and never leave the browser.

---

## Useful scenarios


### Partial decryption per role

A document can contain multiple levels simultaneously. Each person decrypts only what their password covers:

```markdown
# Server config

SSH host: bastion.prod.internal
SSH user: [SECRET_L1]deploy[/SECRET_L1]
SSH private key: [SECRET_L3]-----BEGIN OPENSSH PRIVATE KEY-----...[/SECRET_L3]
Root password: [SECRET_L10]c0rr3ct-h0rse-battery-staple[/SECRET_L10]
```

A developer with only `L1` configured will decrypt the username and see the `[ENCRYPTED_L3]` and `[ENCRYPTED_L10]` blocks untouched.

---

### Rotating a password for one level

To rotate the L2 password without affecting other levels:

```bash
# 1. Decrypt everything with the old passwords
secblocks decrypt secrets.enc.md -e old.env.secrets -o secrets.md

# 2. Update only L2 in the secrets file
sed -i 's/^SECRET_L2=.*/SECRET_L2=new-strong-password/' old.env.secrets
mv old.env.secrets new.env.secrets

# 3. Re-encrypt with the new passwords
secblocks encrypt secrets.md -e new.env.secrets -o secrets.enc.md
```

---

### Onboarding a new team member

Generate a new `.env.secrets` containing only the levels the person is authorized for:

```bash
secblocks keygen -n 1 -o onboarding-john.env.secrets
# Send onboarding-john.env.secrets via a secure channel (1Password, age, etc.)
```

John can decrypt L1 blocks and nothing else.

---

### Pipe with other tools

```bash
# Decrypt → view in less → re-encrypt on exit (simple secret viewer)
secblocks decrypt vault.enc.md | less

# Decrypt a specific section with grep
secblocks decrypt vault.enc.md | grep -A5 "## Database"

# Encrypt output of a secret generator
echo "generated-api-key-$(openssl rand -hex 16)" \
  | sed 's/.*/[SECRET_L2]&[\/SECRET_L2]/' \
  | secblocks encrypt >> api-keys.enc.md
```

---

## Security

See: [SECURITY.md](SECURITY.md) -- threat model, crypto details, accepted tradeoffs

**No audit-status - Community review and feedback are welcome**.

### Compatibility

The binary wire format (`base64( salt | iv | ciphertext )`) is identical between the CLI and the Web UI. However, the Web UI generates a random salt and IV on each encryption, so files encrypted by the browser will differ in ciphertext from CLI-encrypted files for the same plaintext. Both sides can decrypt each other's output interchangeably — only the clean-filter idempotency guarantee requires the CLI's deterministic scheme.

---

## Project structure

```
.
├── index.html          # Web UI (self-contained, no dependencies)
└── cli/
    ├── main.go
    ├── go.mod
    ├── cmd/
    │   ├── root.go     # global --env flag
    │   ├── encrypt.go
    │   ├── decrypt.go
    │   ├── keygen.go
    │   └── helpers.go
    └── internal/
        ├── crypto/     # AES-GCM + PBKDF2
        ├── env/        # .env.secrets parser + env var loader
        └── parser/     # [SECRET_LX] / [ENCRYPTED_LX] block processor
```

