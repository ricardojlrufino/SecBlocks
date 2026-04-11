package cmd

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
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

// writeOutput writes to outputPath, replaces inputPath in-place (if --replace),
// or falls back to stdout. Priority: -o > --replace > stdout.
func writeOutput(outputPath, inputPath, text string) error {
	if outputPath != "" {
		return writeFileAtomic(outputPath, text)
	}
	if replaceInPlace {
		if inputPath == "" {
			return fmt.Errorf("--replace requires a file argument")
		}
		return writeFileAtomic(inputPath, text)
	}
	_, err := fmt.Print(text)
	return err
}

// writeFileAtomic writes text to path via a temp file + os.Rename so the
// original is never left in a partially-written state on crash or disk-full.
func writeFileAtomic(path, text string) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".secblocks-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.WriteString(text); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
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
