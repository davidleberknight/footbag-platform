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
# The third leg is the reader check. A key can be seeded and documented and still
# be read by nothing, in which case an administrator changes the value and the
# site carries on exactly as before: the screen advertises a control that does
# not exist, which is worse than offering none. So every seeded key must either
# be named somewhere in application source, or appear in the allow-list below
# with the reason it legitimately has no reader.
#
# It reads USER_STORIES.md as data, which a CI gate may do and a unit/integration
# test may not.
#
# Synthetic mode (CI tests only; nobody runs this by hand): CONFIG_SEED_STORIES
#
# To diagnose locally:  bash scripts/ci/check_config_seed_parity.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

CONFIG_SEED_STORIES="${CONFIG_SEED_STORIES:-docs/USER_STORIES.md}"
export CONFIG_SEED_STORIES

python3 - <<'PY'
import os, pathlib, re, sys

schema = open('database/schema.sql', encoding='utf-8').read()
stories = open(os.environ['CONFIG_SEED_STORIES'], encoding='utf-8').read()

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

# Keys that legitimately have no reader, each with the reason. Two kinds only.
# A stated obligation is a number the platform records and never acts on, so
# there is nothing for code to read; a pending reader belongs to a feature that
# is designed but not yet built, and lands with it. Anything else on this list
# is a key that should have been wired or removed.
UNREAD_ALLOWED = {
    'audit_retention_days':
        'a stated archive obligation, not a deletion schedule: nothing on the '
        'platform trims audit rows, and the admin screen presents it as a hold',
    'ballot_retention_days':
        'a stated archive obligation, not a deletion schedule: disposing of vote '
        'records is a governance decision and the cleanup sweep never touches them',
    'event_registration_reminder_days':
        'the reminder is sent by event registration, which is not built; the '
        'reader lands with that feature',
    'group_email_rate_limit_per_hour':
        'the ceiling applies when a member posts to a group, and native groups '
        'are not built; the reader lands with that feature',
}

# A key counts as read when application source names it. The admin
# system-parameters service is excluded because it is a display surface: it
# lists the keys it renders, and every consuming service reads its own key
# through the config reader rather than through that list. Without the
# exclusion an inert key passes merely by being shown on the screen that
# advertises it, which is the failure this check exists to catch. Matching the
# bare literal rather than a reader call is deliberate too, since several keys
# reach the reader indirectly through a shared throttle helper.
DISPLAY_ONLY = pathlib.Path('src/services/adminSystemParametersService.ts')
src_literals = set()
for path in pathlib.Path('src').rglob('*.ts'):
    if path == DISPLAY_ONLY:
        continue
    src_literals.update(re.findall(r"'([a-z0-9_]+)'", path.read_text(encoding='utf-8')))

unread = sorted(k for k in seeded if k not in src_literals and k not in UNREAD_ALLOWED)
stale_allowed = sorted(k for k in UNREAD_ALLOWED if k in seeded and k in src_literals)

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
if unread:
    bad = True
    print('[config-seed-parity] seeded but read by nothing in src/:', file=sys.stderr)
    for k in unread:
        print(f'    {k}', file=sys.stderr)
    print('    Wire a reader, remove the seed, or add the key to UNREAD_ALLOWED in this'
          ' script with the reason it has none.', file=sys.stderr)
if stale_allowed:
    bad = True
    print('[config-seed-parity] listed as having no reader, but src/ now reads them:', file=sys.stderr)
    for k in stale_allowed:
        print(f'    {k}', file=sys.stderr)
    print('    Remove these from UNREAD_ALLOWED in this script; the reason no longer holds.',
          file=sys.stderr)

if bad:
    print('  FAIL: schema.sql system_config seeds, the Configurable Parameters section and the'
          ' readers in src/ must stay in lockstep', file=sys.stderr)
    sys.exit(1)

with_readers = sum(1 for k in seeded if k in src_literals)
print(f'[config-seed-parity] pass ({len(seeded)} seeded keys, {len(documented)} documented, in lockstep;'
      f' {with_readers} with a reader in src/, {len(seeded) - with_readers} allowed without one)')
PY
