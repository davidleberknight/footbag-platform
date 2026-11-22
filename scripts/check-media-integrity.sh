#!/usr/bin/env bash
# Media storage-integrity check (entrypoint).
#
# Delegates to the adapter-backed TypeScript check, which resolves every
# stored-bytes reference through the MediaStorageAdapter — so it works against
# S3 (production/staging) and the local store (dev, including the curated
# read-lane) identically, with no filesystem or `/curated` assumptions, and
# skips linked videos (no stored bytes), whose links it holds to YouTube, Vimeo,
# TikTok and Instagram. Read-only; exits 0 OK, 1 on missing objects or an
# off-platform video link, 2 on setup error.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx tsx scripts/check-media-integrity.ts "$@"
