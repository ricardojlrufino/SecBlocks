package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	envFile     string
	envExplicit bool // true when --env was set by the user
	doEncrypt   bool
	doDecrypt   bool
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
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		switch {
		case doEncrypt:
			return runEncrypt(cmd, args)
		case doDecrypt:
			return runDecrypt(cmd, args)
		default:
			return cmd.Help()
		}
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&envFile, "key", "k", defaultEnvFile,
		"level passwords file")
	rootCmd.Flags().BoolVarP(&doEncrypt, "encrypt", "e", false, "encrypt [SECRET_LX] blocks")
	rootCmd.Flags().BoolVarP(&doDecrypt, "decrypt", "d", false, "decrypt [ENCRYPTED_LX] blocks")
	// Detect whether the user explicitly passed --env
	rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		envExplicit = cmd.Flags().Changed("key")
	}
}
