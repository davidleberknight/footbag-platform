/**
 * scripts/internal/bootstrap-host-rebuild-keys.sh -- host_key_id_read, the
 * question an access-key installer asks a host before minting: which key id it
 * holds in one credentials file.
 *
 * Each case sources the library in `bash -c` with a stand-in ssh client that
 * drops the password line and runs the rest of the stream locally, as the host
 * would, so the real key-id half answers from a scratch credentials file.
 *
 * The contract pinned: the key id is read from the half's standard output only;
 * what the half marks as a problem is listed in the caller's closing report when
 * the caller is on the closing-report library, and shown on standard error when
 * it is not; and the stream carries the password line, the values, the remote
 * reporting library and the half, in that order, the password in no argument.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/internal/bootstrap-host-rebuild-keys.sh');
const REPORT = join(process.cwd(), 'scripts/lib/closing-report.sh');
const REPORT_REMOTE = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
const HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-keyid-remote.sh');
// A key id copied from the shapes the secret scan already allowlists.
const KEY = 'AKIAEXAMPLEEXAMPLE01';

let work: string;
let ssh: string;
let creds: string;

beforeEach(() => {
  work = createScratchDir('rebuild-keys');
  ssh = join(work, 'ssh');
  creds = join(work, 'credentials');
  writeFileSync(creds, `[footbag-staging-source-profile]\naws_access_key_id = ${KEY}\naws_secret_access_key = stub\n`);
  writeFileSync(ssh, [
    '#!/usr/bin/env bash',
    'STATE="$(dirname "$0")"',
    'printf "%s\\n" "$*" >> "$STATE/calls.log"',
    'cat > "$STATE/stream"',
    // A case can have the host mark a problem between the key-id line and the id.
    'if [[ -e "$STATE/marked" ]]; then',
    '  printf -- "---FOOTBAG-KEY-ID---\\n"; echo "---FOOTBAG-PROBLEM--- WARN stand-in host warning" >&2',
    `  printf "%s\\n---FOOTBAG-END---\\n" ${KEY}; exit 0`,
    'fi',
    'tail -n +2 "$STATE/stream" | bash -s',
  ].join('\n') + '\n');
  chmodSync(ssh, 0o755);
});

afterEach(() => removeScratch(work));

function ask(onLibrary: boolean, file = creds) {
  const body = [
    onLibrary ? `source "${REPORT}"` : '',
    `source "${LIB}"`,
    'require_host_ssh_opts() { return 0; }',
    'SUDO_PASS=stub-keyid-pass',
    `HOST_SSH_BIN=${JSON.stringify(ssh)}`,
    'HOST_SSH_OPTS=(-o BatchMode=yes)',
    `rc=0; host_key_id_read footbag-staging ${JSON.stringify(file)} footbag-staging-source-profile || rc=$?`,
    'printf "rc=%s\\nkey=%s\\n" "$rc" "$HOST_KEY_ID"',
  ].join('\n');
  const r = spawnSync('bash', ['-c', `set -euo pipefail\n${body}`], { encoding: 'utf-8', ...SPAWN_GUARD });
  const out: Record<string, string> = {};
  for (const line of (r.stdout ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  const stderr = r.stderr ?? '';
  return { status: r.status, out, stderr, report: stderr.slice(Math.max(0, stderr.lastIndexOf('Closing report'))) };
}

describe('host_key_id_read', () => {
  it('reads the key id the host holds, sending the library ahead of the half and the password in no argument', () => {
    // Defects caught: the half arrives without the reporting library and stops at
    // its first report, or the password reaches the host's process list.
    const r = ask(true);
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toMatchObject({ rc: '0', key: KEY });
    expect(readFileSync(join(work, 'stream'), 'utf-8')).toBe(
      `stub-keyid-pass\nCRED_FILE=${creds}\nCRED_PROFILE=footbag-staging-source-profile\n`
      + readFileSync(REPORT_REMOTE, 'utf-8') + readFileSync(HALF, 'utf-8'),
    );
    expect(readFileSync(join(work, 'calls.log'), 'utf-8')).not.toContain('stub-keyid-pass');
    expect(r.report).toMatch(/No errors or warnings/);
  });

  it('lists what the half marked in the closing report, and never reads it as the key id', () => {
    // Defect caught: a problem the host reported about its credentials is shown
    // mid-run and missing from the report the operator reads at the end.
    writeFileSync(join(work, 'marked'), '');
    const r = ask(true);
    expect(r.out).toMatchObject({ rc: '0', key: KEY });
    expect(r.report).toMatch(/Warnings \(1\):\n {2}- key id on footbag-staging: stand-in host warning/);
  });

  it('shows what the half marked on standard error for a caller not on the library', () => {
    writeFileSync(join(work, 'marked'), '');
    const r = ask(false);
    expect(r.status, r.stderr).toBe(0);
    expect(r.out).toMatchObject({ rc: '0', key: KEY });
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- WARN stand-in host warning$/m);
  });
});
