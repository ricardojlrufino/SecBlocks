package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	envFile     string
	envExplicit bool // true when --env was set by the user
)

const defaultEnvFile = ".env.secrets"

var rootCmd = &cobra.Command{
	Use:   "secblocks",
	Short: "Multi-level encryption for Markdown documents",
	Long: `SecBlocks — encrypts and decrypts [SECRET_LX] blocks in Markdown documents.

Password lookup order (lowest → highest priority):
  1. ~/.env.secrets              (home fallback)
  2. .env.secrets in current directory (or --env)
  3. Environment variables

Canonical format: SECRET_L1=password
Also accepted:    L1=password, SECBLOCKS_L1=password`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&envFile, "env", "e", defaultEnvFile,
		"level passwords file")
	// Detect whether the user explicitly passed --env
	rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		envExplicit = cmd.Flags().Changed("env")
	}
}
