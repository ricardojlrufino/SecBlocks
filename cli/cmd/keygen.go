package cmd

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	keygenOutput string
	keygenLen    int
	keygenCount  int
)

var keygenCmd = &cobra.Command{
	Use:   "keygen",
	Short: "Generates random passwords and writes the .env.secrets file",
	Long: `Generates cryptographically secure passwords for N sequential levels (L1..LN)
and produces a ready-to-use .env.secrets file.

If a destination file already exists, existing levels are preserved
and only new levels are added.

Examples:
  secblocks keygen -n 4 -o .env.secrets           # generates L1, L2, L3, L4
  secblocks keygen -n 10 -o ~/.secblocks/.env.secrets
  secblocks keygen -n 3 --length 48               # 48-byte passwords`,
	Args: cobra.NoArgs,
	RunE: runKeygen,
}

func init() {
	keygenCmd.Flags().StringVarP(&keygenOutput, "output", "o", "",
		"output file (default: stdout)")
	keygenCmd.Flags().IntVarP(&keygenCount, "count", "n", 0,
		"number of levels to generate (L1..LN)")
	keygenCmd.Flags().IntVar(&keygenLen, "length", 32,
		"password length in bytes before encoding (default: 32 = 43 base64 chars)")
	_ = keygenCmd.MarkFlagRequired("count")
	rootCmd.AddCommand(keygenCmd)
}

func runKeygen(cmd *cobra.Command, args []string) error {
	if keygenCount < 1 {
		return fmt.Errorf("-n must be at least 1")
	}

	// Build ordered level list: L1, L2, ..., LN
	levels := make([]string, keygenCount)
	for i := range levels {
		levels[i] = fmt.Sprintf("L%d", i+1)
	}

	// Read existing passwords if output file already exists (preserve them)
	// existing maps normalised level ID (e.g. "L1") → password
	existing := map[string]string{}
	if keygenOutput != "" {
		if data, err := os.ReadFile(keygenOutput); err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				line = strings.TrimSpace(line)
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				k, v, ok := strings.Cut(line, "=")
				if !ok {
					continue
				}
				// Strip optional prefix (SECRET_, SECBLOCKS_, etc.) to get L\d+
				k = strings.ToUpper(strings.TrimSpace(k))
				if idx := strings.LastIndex(k, "L"); idx >= 0 {
					k = k[idx:] // e.g. "SECRET_L2" → "L2"
				}
				existing[k] = strings.TrimSpace(v)
			}
		}
	}

	// Generate passwords
	var sb strings.Builder
	sb.WriteString("# SecBlocks — passwords file\n")
	sb.WriteString("# Generated: " + time.Now().Format("2006-01-02 15:04:05") + "\n")
	sb.WriteString("# WARNING: do not commit this file. Add it to .gitignore\n\n")

	for _, id := range levels {
		var pwd string
		if v, ok := existing[id]; ok {
			pwd = v
			fmt.Fprintf(os.Stderr, "  %s  (preserved)\n", id)
		} else {
			var err error
			pwd, err = randomPassword(keygenLen)
			if err != nil {
				return fmt.Errorf("generating password for %s: %w", id, err)
			}
			fmt.Fprintf(os.Stderr, "  %s  (generated)\n", id)
		}
		sb.WriteString(fmt.Sprintf("SECRET_%s=%s\n", id, pwd))
	}

	if keygenOutput != "" {
		if err := os.WriteFile(keygenOutput, []byte(sb.String()), 0o600); err != nil {
			return fmt.Errorf("writing %s: %w", keygenOutput, err)
		}
		fmt.Fprintf(os.Stderr, "✓  file written: %s\n", keygenOutput)
	} else {
		fmt.Print(sb.String())
	}
	return nil
}

func randomPassword(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func levelNum(id string) int {
	n := 0
	fmt.Sscanf(strings.TrimPrefix(strings.ToUpper(id), "L"), "%d", &n)
	return n
}
