#!/usr/bin/env bash
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ $branch == main || $branch == master ]]; then
  exit 0
fi
if [[ ! $branch =~ ^(feat|fix|bugfix|hotfix|release|docs|refactor|test|chore|experiment)/[a-z0-9-]+$ ]]; then
  printf 'Warning: Branch name %s does not match recommended format.\n' "$branch"
  printf '  Use: <type>/<short-description>\n'
  printf '  Types: feat, fix, bugfix, hotfix, release, docs, refactor, test, chore, experiment\n'
  printf '  Example: feat/add-auth, fix/login-crash\n'
  printf '\n'
  printf '  To rename your branch:\n'
  printf '    git branch -m <new-name>\n'
  printf '    git push -u origin <new-name>\n'
fi
