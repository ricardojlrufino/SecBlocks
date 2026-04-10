package cmd

import (
	"fmt"
	"io"
	"os"
	"strings"
)

// readInput reads from a file (args[0]) or from stdin if args is empty.
func readInput(args []string) (string, error) {
	var r io.Reader
	if len(args) == 0 {
		r = os.Stdin
	} else {
		f, err := os.Open(args[0])
		if err != nil {
			return "", fmt.Errorf("opening file: %w", err)
		}
		defer f.Close()
		r = f
	}
	b, err := io.ReadAll(r)
	if err != nil {
		return "", fmt.Errorf("reading input: %w", err)
	}
	return string(b), nil
}

// writeOutput writes to a file or to stdout if path is empty.
func writeOutput(path, text string) error {
	if path == "" {
		_, err := fmt.Print(text)
		return err
	}
	return os.WriteFile(path, []byte(text), 0o600)
}

// joinParts joins non-empty parts with the separator.
func joinParts(sep string, parts ...string) string {
	filtered := parts[:0]
	for _, p := range parts {
		if p != "" {
			filtered = append(filtered, p)
		}
	}
	return strings.Join(filtered, sep)
}
