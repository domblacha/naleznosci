#!/usr/bin/env bash
# PostToolUse (Write|Edit): run the unit tests related to the edited file.
# Integration tests are out of scope here (they need the local Supabase stack).
export NO_COLOR=1 FORCE_COLOR=0
command -v jq >/dev/null || { echo "Hook related-tests.sh needs jq: install it or port the hook to Node." >&2; exit 2; }

INPUT=$(cat)
FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$FILE" ] || exit 0
case "$FILE" in /*) ;; *) FILE="${CWD:-$PWD}/$FILE" ;; esac

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# Same checkout rules as lint-edited-file.sh.
ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0
REPO=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
SESSION_REPO=$(git -C "${CWD:-$PWD}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
[ -n "$REPO" ] && [ "$REPO" = "$SESSION_REPO" ] || exit 0
cd "$ROOT" || exit 0

if ! OUTPUT=$(npx --no-install vitest related "$FILE" --run --project unit 2>&1 </dev/null); then
  echo "Tests related to $FILE fail:" >&2
  echo "$OUTPUT" >&2
  exit 2
fi
exit 0
