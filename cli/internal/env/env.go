// Package env loads passwords for security levels.
// Sources (in increasing priority order):
//  1. ~/.env.secrets             (home fallback)
//  2. .env.secrets file in current directory (or explicit --env)
//  3. Environment variables (highest priority)
//
// Accepted key=value formats:
//
//	L1=password            → level L1
//	SECRET_L2=password     → level L2
//	SECBLOCKS_L10=password → level L10
package env

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const homeSecretsFile = ".env.secrets"

// keyRe extracts the level ID (LX) from keys in the format:
// L1, SECRET_L1, SECBLOCKS_L1, etc.
var keyRe = regexp.MustCompile(`(?i)^(?:[A-Z_]*?)?(L\d+)$`)

// LoadResult describes where the passwords were loaded from.
type LoadResult struct {
	Passwords   map[string]string
	LoadedFrom  []string // paths actually read
}

// Load reads passwords in cascade:
//  1. ~/.env.secrets             (base, lowest priority)
//  2. path (default: .env.secrets in current directory)
//  3. environment variables      (highest priority)
//
// If path was explicitly provided by the user and does not exist,
// returns an error. If it is the default value and does not exist, uses the fallback only.
func Load(path string, explicit bool) (LoadResult, error) {
	passwords := make(map[string]string)
	var loaded []string

	// 1. Home fallback
	if home, err := os.UserHomeDir(); err == nil {
		homePath := filepath.Join(home, homeSecretsFile)
		if readFile(homePath, passwords) == nil {
			if _, statErr := os.Stat(homePath); statErr == nil {
				loaded = append(loaded, homePath)
			}
		}
	}

	// 2. Local file / --env
	if path != "" {
		err := readFile(path, passwords)
		if err != nil {
			if explicit {
				return LoadResult{}, fmt.Errorf("opening %s: %w", path, err)
			}
			// default file absent → ok, only signals via empty LoadedFrom
		} else {
			if _, statErr := os.Stat(path); statErr == nil {
				loaded = append(loaded, path)
			}
		}
	}

	// 3. Environment variables
	envCount := loadEnvVars(passwords)
	if envCount > 0 {
		loaded = append(loaded, "environment variables")
	}

	return LoadResult{Passwords: passwords, LoadedFrom: loaded}, nil
}

func readFile(path string, out map[string]string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := parseLine(line)
		if ok && val != "" {
			out[key] = val
		}
	}
	return scanner.Err()
}

func loadEnvVars(out map[string]string) int {
	count := 0
	for _, entry := range os.Environ() {
		k, v, found := strings.Cut(entry, "=")
		if !found || v == "" {
			continue
		}
		m := keyRe.FindStringSubmatch(strings.ToUpper(k))
		if m != nil {
			out[m[1]] = v
			count++
		}
	}
	return count
}

// parseLine parses a "KEY=value" line and returns (levelId, password, ok).
func parseLine(line string) (string, string, bool) {
	key, val, found := strings.Cut(line, "=")
	if !found {
		return "", "", false
	}
	key = strings.TrimSpace(strings.ToUpper(key))
	val = strings.TrimSpace(val)
	val = strings.Trim(val, `"'`)

	m := keyRe.FindStringSubmatch(key)
	if m == nil {
		return "", "", false
	}
	return m[1], val, true
}
