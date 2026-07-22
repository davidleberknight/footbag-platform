#!/usr/bin/env bash
# Config-seed / Configurable-Parameters parity gate.
#
# Administrator-configurable system parameters have their normative defaults
# defined in the Configurable Parameters section of docs/USER_STORIES.md and are
# seeded into the system_config table at initial database creation. The two lists
# must stay in lockstep: a key seeded in database/schema.sql that is not
# documented, or a documented seeded-default that is not seeded, is drift this
# gate fails on. Where both sides express a plain integer default, the values
# must match too.
#
# Narrow by design: it verifies only the documented seeded-default contract, not
# every runtime configuration read in application source. It reads USER_STORIES.md
# as data, which a CI gate may do and a unit/integration test may not.
#
# To diagnose locally:  bash scripts/ci/check_config_seed_parity.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

python3 - <<'PY'
import re, sys

schema = open('database/schema.sql', encoding='utf-8').read()
stories = open('docs/USER_STORIES.md', encoding='utf-8').read()

# A system_config seed tuple is (id, created_at, config_key, value_json, ...).
# Every seed id starts with 'seed-'; config_key and value_json share one line.
seeded = {}
for m in re.finditer(r"'seed-[a-z0-9-]+',\s*\n\s*'[^']*',\s*\n\s*'([a-z0-9_]+)',\s*'([^']*)',", schema):
    seeded[m.group(1)] = m.group(2)

# The Configurable Parameters section is the run of bullet lines under the
# heading naming it, up to the next top-level heading. Each seeded-default
# bullet reads `- ` + backtick + `key = value` + backtick.
documented = {}
lines = stories.split('\n')
start = next((i for i, l in enumerate(lines) if re.match(r'^##\s+.*Configurable Parameters', l)), None)
if start is None:
    print('[config-seed-parity] FAIL: Configurable Parameters heading not found', file=sys.stderr)
    sys.exit(1)
for l in lines[start + 1:]:
    if re.match(r'^##\s', l):
        break
    m = re.match(r'^- `([a-z0-9_]+)\s*=\s*([^`]+)`', l)
    if m:
        documented[m.group(1)] = m.group(2).strip()

# A plain-integer default on both sides is comparable; a documented value with a
# unit suffix ("730 days") compares on its leading integer, which is what the
# schema stores as value_json.
def leading_int(v):
    m = re.match(r'^(\d+)\b', v)
    return int(m.group(1)) if m else None

missing_from_schema = sorted(k for k in documented if k not in seeded)
missing_from_docs = sorted(k for k in seeded if k not in documented)
mismatches = []
for k, dv in documented.items():
    sv = seeded.get(k)
    if sv is None:
        continue
    di, si = leading_int(dv), leading_int(sv)
    if di is None or si is None:
        continue
    if di != si:
        mismatches.append(f'{k}: documented {di} vs seeded {si}')

bad = False
if missing_from_schema:
    bad = True
    print('[config-seed-parity] documented but not seeded in schema.sql:', file=sys.stderr)
    for k in missing_from_schema:
        print(f'    {k}', file=sys.stderr)
if missing_from_docs:
    bad = True
    print('[config-seed-parity] seeded but not documented as a configurable parameter:', file=sys.stderr)
    for k in missing_from_docs:
        print(f'    {k}', file=sys.stderr)
if mismatches:
    bad = True
    print('[config-seed-parity] documented vs seeded integer default mismatches:', file=sys.stderr)
    for m in mismatches:
        print(f'    {m}', file=sys.stderr)

if bad:
    print('  FAIL: schema.sql system_config seeds and the Configurable Parameters section must stay in lockstep', file=sys.stderr)
    sys.exit(1)

print(f'[config-seed-parity] pass ({len(seeded)} seeded keys, {len(documented)} documented, in lockstep)')
PY
