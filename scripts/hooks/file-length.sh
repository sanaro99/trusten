#!/usr/bin/env bash
# Usage: file-length.sh <file>...
for file in "$@"; do
  if [[ -f $file ]]; then
    lines=$(wc -l < "$file" | tr -d ' ')
    if [[ $lines -gt 400 ]]; then
      printf 'Warning: %s has %s lines (threshold: 400)\n' "$file" "$lines"
      printf 'Consider splitting this file if it has multiple responsibilities.\n'
    fi
  fi
done
