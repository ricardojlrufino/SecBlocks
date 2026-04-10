package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"secblocks/internal/env"
	"secblocks/internal/parser"
)

var encryptOutput string

var encryptCmd = &cobra.Command{
	Use:   "encrypt [file]",
	Short: "Encrypts <secret-LX> blocks in the document",
	Long: `Reads the document (file or stdin), encrypts all
[SECRET_LX]…[/SECRET_LX] blocks that have a configured password and writes the result.

Examples:
  secblocks encrypt doc.md -o doc.enc.md
  secblocks encrypt doc.md --env /etc/secblocks/.env.secrets
  cat doc.md | secblocks encrypt > doc.enc.md`,
	Args: cobra.MaximumNArgs(1),
	RunE: runEncrypt,
}

func init() {
	encryptCmd.Flags().StringVarP(&encryptOutput, "output", "o", "",
		"output file (default: stdout)")
	rootCmd.AddCommand(encryptCmd)
}

// missingPasswords returns the level IDs present in text that have no password configured.
func missingPasswords(text string, passwords map[string]string) []string {
	var missing []string
	for _, level := range parser.SecretLevels(text) {
		if passwords[level] == "" {
			missing = append(missing, level)
		}
	}
	return missing
}

func runEncrypt(cmd *cobra.Command, args []string) error {
	res, err := env.Load(envFile, envExplicit)
	if err != nil {
		return err
	}
	if len(res.Passwords) == 0 {
		return fmt.Errorf("no passwords found — configure ~/.secblocks/.env.secrets, .env.secrets or environment variables")
	}
	fmt.Fprintf(os.Stderr, "[SecBlocks] using passwords: %s\n", joinParts(", ", res.LoadedFrom...))

	text, err := readInput(args)
	if err != nil {
		return err
	}

	// Validate: every level present in the document must have a password
	if missing := missingPasswords(text, res.Passwords); len(missing) > 0 {
		tags := make([]string, len(missing))
		for i, l := range missing {
			tags[i] = "[SECRET_" + l + "]"
		}
		return fmt.Errorf(
			"[SecBlocks] VALIDATION ERROR: cannot encrypt — missing password for block(s): %s\n"+
				"  Add the missing entries to .env.secrets or export SECRET_%s=... before retrying.",
			strings.Join(tags, ", "),
			missing[0],
		)
	}

	result, err := parser.Encrypt(text, res.Passwords)
	if err != nil {
		return err
	}

	switch {
	case result.Done == 0 && result.Skipped == 0:
		fmt.Fprintln(os.Stderr, "⚠  no [SECRET_LX] blocks found in the document")
	default:
		parts := make([]string, 0, 3)
		if result.Done > 0 {
			parts = append(parts, fmt.Sprintf("%d encrypted", result.Done))
		}
		if result.Skipped > 0 {
			parts = append(parts, fmt.Sprintf("%d skipped (no password)", result.Skipped))
		}
		if result.Failed > 0 {
			parts = append(parts, fmt.Sprintf("%d failed", result.Failed))
		}
		fmt.Fprintf(os.Stderr, "✓  %s\n", joinParts(" · ", parts...))
	}

	return writeOutput(encryptOutput, result.Text)
}
