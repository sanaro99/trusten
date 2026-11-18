#!/usr/bin/env bash
# Usage: commit-msg.sh <commit-msg-file>
msg=$(head -1 "$1")
if [[ ! $msg =~ ^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?\!?:\ .+ ]]; then
  printf 'Commit message must follow Conventional Commits format:\n'
  printf '  <type>(<optional scope>): <description>\n'
  printf '  Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build, revert\n'
  printf '\n'
  printf 'Examples:\n'
  printf '  feat(auth): add OAuth2 support\n'
  printf '  fix: resolve null pointer exception\n'
  exit 1
fi
