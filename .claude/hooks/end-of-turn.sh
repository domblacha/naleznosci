#!/usr/bin/env bash
# Stop: sweep everything this turn changed before the agent finishes, one retry.
export NO_COLOR=1 FORCE_COLOR=0
command -v jq >/dev/null || { echo "Hook end-of-turn.sh needs jq: install it or port the hook to Node." >&2; exit 2; }

INPUT=$(cat)

# Already sent back once by this hook: let it finish. The commit gate catches the rest.
# (loop_count covers Cursor, which imports this hook from .claude/settings.json.)
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
LOOPS=$(printf '%s' "$INPUT" | jq -r '.loop_count // 0' 2>/dev/null)
if [ "$ACTIVE" = "true" ] || [ "${LOOPS:-0}" != "0" ]; then
  exit 0
fi

# Checkouts to sweep: the session's (payload cwd follows EnterWorktree, $CLAUDE_PROJECT_DIR
# does not) plus every checkout lint-edited-file.sh registered for this session.
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
REGISTRY="${TMPDIR:-/tmp}/claude-hooks/${SID:-none}.roots"
ROOTS=()
while IFS= read -r r; do
  [ -n "$r" ] && [ -d "$r" ] && ROOTS+=("$r")
done <<EOF
$({ git -C "${CWD:-$PWD}" rev-parse --show-toplevel 2>/dev/null; [ -n "$SID" ] && cat "$REGISTRY" 2>/dev/null; } | sort -u)
EOF
if [ "${#ROOTS[@]}" -eq 0 ]; then
  # Not silent: the user sees why nothing was checked.
  jq -cn --arg m "end-of-turn.sh: no git checkout at ${CWD:-$PWD}, nothing checked." '{systemMessage: $m}'
  exit 0
fi

SKIPPED=""
REPORT=""
for ROOT in "${ROOTS[@]}"; do
  cd "$ROOT" || continue

  # Changed and new files. Nothing changed (a Q&A turn): nothing to check here.
  CHANGED=$({ git diff --name-only HEAD; git ls-files -o --exclude-standard; } 2>/dev/null | sort -u)
  [ -n "$CHANGED" ] || continue

  # Changed files the linter covers (list from eslint.config.js) that still exist.
  # This also catches files rewritten through a shell command, which never reach a per-edit hook.
  FILES=()
  while IFS= read -r f; do
    case "$f" in *.ts|*.tsx|*.astro|*.js|*.jsx|*.mjs|*.cjs) [ -f "$f" ] && FILES+=("$f") ;; esac
  done <<EOF
$CHANGED
EOF

  if [ "${#FILES[@]}" -gt 0 ]; then
    OUT=$(npx --no-install eslint --quiet "${FILES[@]}" 2>&1 </dev/null) || REPORT="$REPORT
ESLint errors in changed files ($ROOT):
$OUT
"
  fi

  # The whole unit suite takes under a second, so run all of it.
  OUT=$(npm test 2>&1 </dev/null) || REPORT="$REPORT
Unit tests fail ($ROOT):
$OUT
"

  # astro check syncs the generated types itself.
  OUT=$(npx --no-install astro check 2>&1 </dev/null) || REPORT="$REPORT
astro check fails ($ROOT):
$OUT
"
done

if [ -n "$REPORT" ]; then
  [ -n "$SKIPPED" ] && REPORT="$REPORT
Skipped on this host:$SKIPPED
"
  echo "Fix these before you finish:$REPORT" >&2
  exit 2
fi
# Green: the registered checkouts are clean, start the next turn with an empty registry.
[ -n "$SID" ] && : >"$REGISTRY" 2>/dev/null
[ -n "$SKIPPED" ] && jq -cn --arg m "end-of-turn.sh passed, but skipped on this host:$SKIPPED" '{systemMessage: $m}'
exit 0
