// Package parser locates and transforms <secret-LX> / <encrypted-LX> blocks
// in text documents (Markdown or plain text).
package parser

import (
	"fmt"
	"regexp"
	"strings"

	"secblocks/internal/crypto"
)

// Captures: [SECRET_L1]content[/SECRET_L1]
// Groups:   (1)=opening level  (2)=content  (3)=closing level
var secretRe = regexp.MustCompile(`(?s)\[SECRET_(L\d+)\](.*?)\[/SECRET_(L\d+)\]`)

// Captures: [ENCRYPTED_L1]base64[/ENCRYPTED_L1]
var encryptedRe = regexp.MustCompile(`(?s)\[ENCRYPTED_(L\d+)\](.*?)\[/ENCRYPTED_(L\d+)\]`)

// Result summarizes the result of a batch operation.
type Result struct {
	Text    string
	Done    int // blocks successfully processed
	Skipped int // blocks skipped (level has no password)
	Failed  int // blocks that failed (wrong password, corrupted data)
}

// SecretLevels returns the distinct level IDs found in secret blocks within text,
// preserving the order of first appearance. E.g. ["L1", "L3", "L10"].
func SecretLevels(text string) []string {
	matches := secretRe.FindAllStringSubmatch(text, -1)
	seen := map[string]bool{}
	var levels []string
	for _, m := range matches {
		openLevel  := m[1]
		closeLevel := m[3]
		if openLevel != closeLevel {
			continue
		}
		if !seen[openLevel] {
			seen[openLevel] = true
			levels = append(levels, openLevel)
		}
	}
	return levels
}

// Encrypt replaces all <secret-LX>…</secret-LX> with <encrypted-LX>…</encrypted-LX>.
// Blocks whose level has no password in passwords are skipped.
func Encrypt(text string, passwords map[string]string) (Result, error) {
	return process(text, secretRe, passwords, func(levelId, content, pwd string) (string, error) {
		b64, err := crypto.Encrypt(content, pwd)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("[ENCRYPTED_%s]%s[/ENCRYPTED_%s]", levelId, b64, levelId), nil
	})
}

// Decrypt replaces all <encrypted-LX>…</encrypted-LX> with <secret-LX>…</secret-LX>.
func Decrypt(text string, passwords map[string]string) (Result, error) {
	return process(text, encryptedRe, passwords, func(levelId, b64, pwd string) (string, error) {
		plain, err := crypto.Decrypt(strings.TrimSpace(b64), pwd)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("[SECRET_%s]%s[/SECRET_%s]", levelId, plain, levelId), nil
	})
}

type transformFn func(levelId, content, password string) (string, error)

// process is the core: finds all matches, iterates from end to start
// (avoiding index shifting), and applies transform to each block.
func process(text string, re *regexp.Regexp, passwords map[string]string, transform transformFn) (Result, error) {
	matches := re.FindAllStringSubmatchIndex(text, -1)
	if len(matches) == 0 {
		return Result{Text: text}, nil
	}

	result := text
	res := Result{}

	for i := len(matches) - 1; i >= 0; i-- {
		m := matches[i]
		// m[0..1] = full match
		// m[2..3] = level (opening), m[4..5] = content, m[6..7] = level (closing)
		openLevel  := text[m[2]:m[3]]
		closeLevel := text[m[6]:m[7]]
		content    := text[m[4]:m[5]]

		// Validate that opening and closing tags are the same level
		if openLevel != closeLevel {
			res.Skipped++
			continue
		}

		pwd, ok := passwords[openLevel]
		if !ok || pwd == "" {
			res.Skipped++
			continue
		}

		replacement, err := transform(openLevel, content, pwd)
		if err != nil {
			res.Failed++
			continue
		}

		result = result[:m[0]] + replacement + result[m[1]:]
		res.Done++
	}

	res.Text = result
	return res, nil
}
