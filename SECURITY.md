## Cryptography

| Property | Value |
|---|---|
| Cipher | AES-GCM-256 |
| Key derivation | PBKDF2-SHA256, 200 000 iterations |
| Salt | 16 bytes, derived deterministically via HMAC-SHA256 |
| Nonce / IV | 12 bytes, derived deterministically via HMAC-SHA256 |
| Wire format | `base64( salt[16] \| iv[12] \| ciphertext )` |
| Auth tag | 16 bytes (GCM default) |

### Deterministic encryption

Salt and IV are derived deterministically from the password and plaintext using HMAC-SHA256:

```
salt = HMAC-SHA256(password, plaintext)[0:16]
key  = PBKDF2-SHA256(password, salt, 200_000)
iv   = HMAC-SHA256(key, plaintext)[0:12]
```

This means **the same plaintext encrypted with the same password always produces identical ciphertext**. This property is required for correct operation of the git clean/smudge filter: a random nonce would make git detect "local changes" on every checkout, because the clean filter would produce a different base64 blob than the one stored in the index, even though the plaintext is unchanged.

**Security considerations:**
- **Nonce safety**: deriving IV from `HMAC(key, plaintext)` guarantees that different plaintexts under the same key always get different IVs, which is the critical requirement for AES-GCM safety. Nonce reuse only occurs if the same plaintext is re-encrypted with the same key — which by definition produces the same ciphertext and is therefore harmless.
- **Equality leakage**: two blocks encrypted with the same password and the same plaintext will have identical ciphertext, revealing that they contain the same secret. This is an acceptable trade-off for a git-filter workflow where the primary threat model is preventing unauthorized readers from seeing the plaintext, not hiding equality between blocks.
- **The authentication tag** (16 bytes, GCM default) guarantees that any tampering with the ciphertext is detected at decryption time.

### Audit Status
this tool has not been independently audited. The underlying cryptographic primitives come from Go libraries, but the protocol design, key derivation scheme, and implementation have not been reviewed by a third party -- **use this at your own risk**. 

**Community review and feedback are welcome**.
