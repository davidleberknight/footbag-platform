#!/usr/bin/env bash
# Media storage-integrity check (entrypoint).
#
# Delegates to the adapter-backed TypeScript check, which resolves every
# stored-bytes reference through the MediaStorageAdapter — so it works against
# S3 (production/staging) and the local store (dev, including the curated
# read-lane) identically, with no filesystem or `/curated` assumptions, and
# skips YouTube/Vimeo (no stored bytes). Read-only; exits 0 OK, 1 on missing
# objects, 2 on setup error.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx tsx scripts/check-media-integrity.ts "$@"
