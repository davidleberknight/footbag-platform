#!/usr/bin/env bash
# Audit action_type catalogue-membership gate.
#
# Every audit action_type literal written in src/ must appear in the action_type
# catalogue in docs/USER_STORIES.md's companion data model, which calls itself
# the authoritative inventory and which readers, reviewers and incident
# responders treat as one. Checking only the SHAPE of a name (lowercase, dotted,
# namespaced) let dozens of values accumulate in the code that the inventory
# never mentioned, whole namespaces among them, and nothing surfaced it until
# someone read both lists side by side.
#
# A value assembled at its call site rather than written as a literal is
# invisible here, exactly as it is to the shape check that runs alongside this
# one. That is deliberate rather than an oversight: a partial name is not a name,
# and the catalogue records those cases in prose instead.
#
# Split out of the main conventions gate so it can be exercised against a
# throwaway fixture repository. Run inside the big gate, a fixture tree has to
# satisfy every other rule first, and the ones that read the stylesheet and the
# view templates abort long before this rule is reached, so the rule that
# actually needed covering could never be reached by a test.
#
# Synthetic mode (CI tests only; nobody runs this by hand): AUDIT_CATALOGUE_DOC
# points the gate at a fixture catalogue instead of the real one. The convention
# gate forbids a documentation filename from appearing anywhere under tests/, so
# a suite covering this rule cannot name the real document even to build a
# fixture beside it. The default below is the only path that ever matters in
# practice, and every suite run exercises it against the real repository.
#
# It also holds every action type, written or catalogued, to the one topic map
# in src/services/auditTopics.ts. The write path throws on an action type the
# map does not cover, so an unmapped name is an audit row that fails at runtime;
# finding it here moves that failure to the build.
#
# To diagnose locally:  bash scripts/ci/check_audit_catalogue.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

AUDIT_CATALOGUE_DOC="${AUDIT_CATALOGUE_DOC:-docs/DATA_MODEL.md}"
AUDIT_TOPIC_MAP_SRC="src/services/auditTopics.ts"
export AUDIT_CATALOGUE_DOC AUDIT_TOPIC_MAP_SRC

python3 - <<'PY'
import os, re, pathlib, sys

doc_path = pathlib.Path(os.environ['AUDIT_CATALOGUE_DOC'])
if not doc_path.is_file():
    print(f'[audit-catalogue] {doc_path} not found; the gate cannot check membership',
          file=sys.stderr)
    sys.exit(1)

doc = doc_path.read_text(encoding='utf-8')
try:
    section = doc.split('Emitted values, grouped by namespace')[1] \
                 .split('This list is the authoritative inventory')[0]
except IndexError:
    print(f'[audit-catalogue] action_type catalogue section not found in {doc_path}; '
          'the gate cannot check membership', file=sys.stderr)
    sys.exit(1)

documented = set()
for line in section.splitlines():
    m = re.match(r'^- \*\*`([a-z_.]+)\.\*`\*\*:(.*)', line.strip())
    if not m:
        continue
    namespace, rest = m.group(1), m.group(2)
    for value in re.findall(r'`([a-z0-9_.]+)`', rest):
        documented.add(f'{namespace}.{value}')

map_path = pathlib.Path(os.environ['AUDIT_TOPIC_MAP_SRC'])
if not map_path.is_file():
    print(f'[audit-catalogue] {map_path} not found; the gate cannot check topics',
          file=sys.stderr)
    sys.exit(1)
topic_keys = re.findall(r"^\s*\['([a-z0-9_.]+)',\s*'[a-z]+'\],\s*$",
                        map_path.read_text(encoding='utf-8'), re.M)
if not topic_keys:
    print(f'[audit-catalogue] no topic map entries found in {map_path}; '
          'the gate cannot check topics', file=sys.stderr)
    sys.exit(1)

def has_topic(action_type):
    return any(action_type.startswith(k) for k in topic_keys)

unmapped = [f"{doc_path}: catalogued action_type '{v}' has no topic in {map_path}"
            for v in sorted(documented) if not has_topic(v)]

root = pathlib.Path('src')
pats = [
    re.compile(r"actionType\s*[:=]\s*'([^']+)'"),
    re.compile(r"_AUDIT_ACTION_TYPE\s*=\s*'([^']+)'"),
]
undocumented = []
literals = 0
for f in sorted(root.rglob('*.ts')):
    for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
        for pat in pats:
            for m in pat.finditer(line):
                literals += 1
                if m.group(1) not in documented:
                    undocumented.append(f"{f}:{i}: audit action_type '{m.group(1)}' "
                                        f"is not in the data model's action_type catalogue")
                if not has_topic(m.group(1)):
                    unmapped.append(f"{f}:{i}: audit action_type '{m.group(1)}' "
                                    f"has no topic in {map_path}")

if undocumented:
    for hit in undocumented:
        print(hit, file=sys.stderr)
    print(f'  FAIL: add the action_type to the catalogue in {doc_path} '
          'as part of this change', file=sys.stderr)
if unmapped:
    for hit in unmapped:
        print(hit, file=sys.stderr)
    print(f'  FAIL: give the action_type a topic in {map_path} '
          'as part of this change', file=sys.stderr)
if undocumented or unmapped:
    sys.exit(1)

print(f'[audit-catalogue] pass ({literals} literals in src/, {len(documented)} catalogued)')
PY
