package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"secblocks/internal/env"
	"secblocks/internal/parser"
)

var decryptOutput string

var decryptCmd = &cobra.Command{
	Use:   "decrypt [file]",
	Short: "Decrypts <encrypted-LX> blocks in the document",
	Long: `Reads the document (file or stdin), decrypts all
[ENCRYPTED_LX]…[/ENCRYPTED_LX] blocks that have a configured password and writes the result.

Examples:
  secblocks decrypt doc.enc.md -o doc.md
  secblocks decrypt doc.enc.md --key /etc/secblocks/.env.secrets
  cat doc.enc.md | secblocks decrypt > doc.md`,
	Args: cobra.MaximumNArgs(1),
	RunE: runDecrypt,
}

func init() {
	decryptCmd.Flags().StringVarP(&decryptOutput, "output", "o", "",
		"output file (default: stdout)")
	rootCmd.AddCommand(decryptCmd)
}

func runDecrypt(cmd *cobra.Command, args []string) error {
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

	result, err := parser.Decrypt(text, res.Passwords)
	if err != nil {
		return err
	}

	switch {
	case result.Done == 0 && result.Skipped == 0 && result.Failed == 0:
		fmt.Fprintln(os.Stderr, "⚠  no [ENCRYPTED_LX] blocks found in the document")
	default:
		parts := make([]string, 0, 3)
		if result.Done > 0 {
			parts = append(parts, fmt.Sprintf("%d decrypted", result.Done))
		}
		if result.Skipped > 0 {
			parts = append(parts, fmt.Sprintf("%d skipped (no password)", result.Skipped))
		}
		if result.Failed > 0 {
			parts = append(parts, fmt.Sprintf("%d failed (wrong password?)", result.Failed))
		}
		status := "✓"
		if result.Failed > 0 {
			status = "⚠"
		}
		fmt.Fprintf(os.Stderr, "%s  %s\n", status, joinParts(" · ", parts...))
	}

	return writeOutput(decryptOutput, result.Text)
}
