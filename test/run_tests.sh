#!/usr/bin/env bash
# SecBlocks — integration tests
# Usage: ./test/run_tests.sh [path/to/secblocks]
#
# Requires the secblocks binary. Looks for it at:
#   1. First argument passed to this script
#   2. cli/secblocks (relative to project root)
#   3. secblocks on PATH

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BINARY="${1:-}"
if [[ -z "$BINARY" ]]; then
    if [[ -x "$PROJECT_ROOT/cli/secblocks" ]]; then
        BINARY="$PROJECT_ROOT/cli/secblocks"
    elif command -v secblocks &>/dev/null; then
        BINARY="secblocks"
    else
        echo "ERROR: secblocks binary not found. Build it first or pass the path as argument." >&2
        exit 1
    fi
fi

SECRETS="$SCRIPT_DIR/.test.secrets"
PLAIN="$SCRIPT_DIR/EXAMPLE_FILE.md"
ENCRYPTED="$SCRIPT_DIR/EXAMPLE_FILE_ENCRIPTED.md"
TMPDIR_TESTS="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_TESTS"' EXIT

PASS=0
FAIL=0
CURRENT_TEST=""

# ── Helpers ──────────────────────────────────────────────────────────────────

ok()   { echo "  [PASS] $1"; ((PASS++)) || true; }
fail() { echo "  [FAIL] $1"; ((FAIL++)) || true; }

begin_test() {
    CURRENT_TEST="$1"
    echo ""
    echo "TEST: $CURRENT_TEST"
}

assert_exit() {
    local expected="$1"; shift
    local actual=0
    "$@" > /dev/null 2>&1 || actual=$?
    if [[ "$actual" -eq "$expected" ]]; then
        ok "exit code $expected"
    else
        fail "expected exit $expected, got $actual"
    fi
}

assert_contains() {
    local needle="$1"
    local haystack="$2"
    if echo "$haystack" | grep -qF "$needle"; then
        ok "output contains: $needle"
    else
        fail "output missing: $needle"
        echo "       got: $(echo "$haystack" | head -5)"
    fi
}

assert_not_contains() {
    local needle="$1"
    local haystack="$2"
    if ! echo "$haystack" | grep -qF "$needle"; then
        ok "output does not contain: $needle"
    else
        fail "output should NOT contain: $needle"
    fi
}

assert_files_equal() {
    local a="$1" b="$2"
    if diff -q "$a" "$b" > /dev/null 2>&1; then
        ok "files match: $(basename "$a") == $(basename "$b")"
    else
        fail "files differ: $(basename "$a") vs $(basename "$b")"
        diff "$a" "$b" | head -20 || true
    fi
}

# ── Tests ────────────────────────────────────────────────────────────────────

# 1. Encrypt produces encrypted output and hides plaintext
begin_test "encrypt: produces encrypted output"
OUT=$("$BINARY" encrypt --key "$SECRETS" "$PLAIN" 2>/dev/null) || true
assert_contains "[ENCRYPTED_L1]" "$OUT"
assert_contains "[ENCRYPTED_L2]" "$OUT"
assert_not_contains "db-password-123" "$OUT"
assert_not_contains "api-key-abcdef-123456" "$OUT"
assert_not_contains "refresh-token-xyz-987654" "$OUT"

# 2. Decrypt known file back to plaintext
begin_test "decrypt: known file decrypts back to plaintext"
OUT=$("$BINARY" decrypt --key "$SECRETS" "$ENCRYPTED" 2>/dev/null) || true
assert_contains "db-password-123" "$OUT"
assert_contains "api-key-abcdef-123456" "$OUT"
assert_contains "refresh-token-xyz-987654" "$OUT"
assert_contains "BEGIN OPENSSH PRIVATE KEY" "$OUT"

# 3. Roundtrip: encrypt → decrypt matches original
begin_test "roundtrip: encrypt then decrypt matches original"
TMP_ENC="$TMPDIR_TESTS/roundtrip_enc.md"
TMP_DEC="$TMPDIR_TESTS/roundtrip_dec.md"
"$BINARY" encrypt --key "$SECRETS" "$PLAIN"    -o "$TMP_ENC" 2>/dev/null || true
"$BINARY" decrypt --key "$SECRETS" "$TMP_ENC"  -o "$TMP_DEC" 2>/dev/null || true
assert_files_equal "$PLAIN" "$TMP_DEC"

# 4. --key uses ONLY the specified file, not home fallback
begin_test "--key flag: uses only specified file (no home fallback)"
STDERR=$("$BINARY" encrypt --key "$SECRETS" "$PLAIN" 2>&1 >/dev/null) || true
assert_contains ".test.secrets" "$STDERR"
# home file must NOT appear in the source list
if echo "$STDERR" | grep -qF ".env.secrets" && ! echo "$STDERR" | grep -qF ".test.secrets"; then
    fail "home ~/.env.secrets loaded despite explicit --key"
else
    ok "home fallback not listed when --key is explicit"
fi

# 5. Error on empty secrets file
begin_test "encrypt: error when secrets file has no passwords"
EMPTY="$TMPDIR_TESTS/.empty.secrets"
touch "$EMPTY"
assert_exit 1 "$BINARY" encrypt --key "$EMPTY" "$PLAIN"

# 6. Error when --key file does not exist
begin_test "encrypt: error when --key file does not exist"
assert_exit 1 "$BINARY" encrypt --key "/nonexistent/.env.secrets" "$PLAIN"

# 7. Partial decrypt: only levels with known password are decrypted
begin_test "decrypt: skips blocks with unknown password (partial decrypt)"
PARTIAL="$TMPDIR_TESTS/.partial.secrets"
L1_PASS=$(grep "SECRET_L1" "$SECRETS" | cut -d= -f2)
echo "SECRET_L1=$L1_PASS" > "$PARTIAL"
OUT=$("$BINARY" decrypt --key "$PARTIAL" "$ENCRYPTED" 2>/dev/null) || true
assert_contains "db-password-123" "$OUT"          # L1 → decrypted
assert_contains "[ENCRYPTED_L2]" "$OUT"            # L2 → still encrypted

# 8. Pipe: encrypt via stdin, output to stdout
begin_test "stdin/stdout: encrypt via pipe"
OUT=$(cat "$PLAIN" | "$BINARY" encrypt --key "$SECRETS" 2>/dev/null) || true
assert_contains "[ENCRYPTED_L1]" "$OUT"
assert_not_contains "[SECRET_L1]" "$OUT"

# 9. Pipe: decrypt via stdin, output to stdout
begin_test "stdin/stdout: decrypt via pipe"
OUT=$(cat "$ENCRYPTED" | "$BINARY" decrypt --key "$SECRETS" 2>/dev/null) || true
assert_contains "db-password-123" "$OUT"
assert_not_contains "[ENCRYPTED_L1]" "$OUT"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
echo "─────────────────────────────────"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
