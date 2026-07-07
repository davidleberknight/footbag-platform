#!/usr/bin/env bash
# Terraform artifact gate. Terraform state and plan bundles embed resolved
# resource attributes -- including decrypted SecureString secret values --
# so they must never be tracked. .gitignore blocks the common names, but a
# nonstandard filename slips those globs silently; this gate closes the hole
# by allowlisting what MAY be tracked under terraform/ and failing on
# anything else.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=$(git ls-files 'terraform/' \
  | grep -vE '(\.tf|\.hcl|\.tfvars\.example)$|/cloudfront-functions/[^/]+\.js$' \
  || true)

if [ -n "$violations" ]; then
  echo "$violations" >&2
  echo "FAIL: only *.tf, *.hcl, *.tfvars.example, and cloudfront-functions/*.js may be tracked under terraform/; state and plan artifacts embed secret values" >&2
  exit 1
fi

echo "[terraform-artifacts] pass"
