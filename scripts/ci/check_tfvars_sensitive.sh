#!/usr/bin/env bash
# Sensitive-variable gate. A variable whose declaration carries `sensitive = true`
# is vault-governed: its value belongs in the gitignored secrets.auto.tfvars that
# Terraform auto-loads, and in no repository at all. The example values files are
# the only tfvars-family files allowed to be tracked, so an assignment in one is
# the single path by which a vault-governed value can reach public history. A
# placeholder there is not harmless either: it is the line the next operator
# edits, and the edit is what gets committed.
#
# Comments are fine. Only an assignment fails.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=""

for vars_file in terraform/*/variables.tf; do
  [ -f "$vars_file" ] || continue
  env_dir="$(dirname "$vars_file")"

  # Walk the declarations, carrying the enclosing variable's name, and emit the
  # name of every one marked sensitive.
  sensitive_names="$(awk '
    /^variable[[:space:]]+"/ { name = $2; gsub(/"/, "", name); next }
    /^[[:space:]]*sensitive[[:space:]]*=[[:space:]]*true[[:space:]]*$/ {
      if (name != "") print name
    }
  ' "$vars_file")"

  [ -n "$sensitive_names" ] || continue

  examples="$(git ls-files "$env_dir/*.tfvars.example")"
  [ -n "$examples" ] || continue

  for example in $examples; do
    for name in $sensitive_names; do
      hits="$(grep -nE "^[[:space:]]*${name}[[:space:]]*=" "$example" || true)"
      if [ -n "$hits" ]; then
        while IFS= read -r hit; do
          violations="${violations}${example}:${hit}"$'\n'
        done <<< "$hits"
      fi
    done
  done
done

if [ -n "$violations" ]; then
  printf '%s' "$violations" >&2
  echo "FAIL: a tracked tfvars example assigns a variable its declaration marks sensitive; the value belongs in the gitignored secrets.auto.tfvars, not in any repository" >&2
  exit 1
fi

echo "[tfvars-sensitive] pass"
