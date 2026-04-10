// Package crypto implements AES-GCM-256 + PBKDF2-SHA256.
// The binary format is compatible with the SecBlocks HTML page:
//   base64( salt[16] | iv[12] | ciphertext )
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/pbkdf2"
)

const (
	SaltLen = 16
	IVLen   = 12
	KeyLen  = 32      // AES-256
	Iter    = 200_000 // PBKDF2 iterations
)

func deriveKey(password string, salt []byte) []byte {
	return pbkdf2.Key([]byte(password), salt, Iter, KeyLen, sha256.New)
}

// Encrypt encrypts plaintext with the password and returns base64 ready for use in tags.
//
// Salt and IV are derived deterministically from (password, plaintext) via HMAC-SHA256
// so that the same inputs always produce identical ciphertext. This is required for
// git clean filters: a random nonce would cause git to see "local changes" every time
// the smudge filter runs, even when the plaintext hasn't changed.
//
// Security note: deriving IV from (key, plaintext) ensures different plaintexts get
// different IVs under the same key, which avoids AES-GCM nonce reuse.
func Encrypt(plaintext, password string) (string, error) {
	// salt = HMAC-SHA256(password, plaintext)[0:16]
	h1 := hmac.New(sha256.New, []byte(password))
	h1.Write([]byte(plaintext))
	salt := h1.Sum(nil)[:SaltLen]

	key := deriveKey(password, salt)

	// iv = HMAC-SHA256(key, plaintext)[0:12]
	h2 := hmac.New(sha256.New, key)
	h2.Write([]byte(plaintext))
	iv := h2.Sum(nil)[:IVLen]

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	ct := gcm.Seal(nil, iv, []byte(plaintext), nil)

	// Layout: salt | iv | ciphertext
	combined := make([]byte, SaltLen+IVLen+len(ct))
	copy(combined[0:], salt)
	copy(combined[SaltLen:], iv)
	copy(combined[SaltLen+IVLen:], ct)

	return base64.StdEncoding.EncodeToString(combined), nil
}

// Decrypt decrypts the base64 produced by Encrypt.
func Decrypt(b64encoded, password string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(b64encoded)
	if err != nil {
		return "", fmt.Errorf("invalid base64: %w", err)
	}
	if len(data) < SaltLen+IVLen+1 {
		return "", fmt.Errorf("block too short to be valid")
	}

	salt := data[:SaltLen]
	iv   := data[SaltLen : SaltLen+IVLen]
	ct   := data[SaltLen+IVLen:]

	key := deriveKey(password, salt)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	plain, err := gcm.Open(nil, iv, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed (wrong password?): %w", err)
	}

	return string(plain), nil
}
