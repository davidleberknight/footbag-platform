/**
 * scripts/internal/install-host-credentials-remote.sh, the root-side body that
 * writes the application's long-lived access key onto a deployed host.
 *
 * The body takes its inputs as shell variables, so it runs here directly. It
 * acts on fixed host paths as root, so the system tools it calls are stand-ins
 * on PATH: `install` records the mode, group and destination it was asked for
 * and copies the content into the case directory instead of /root/.aws;
 * `getent` and `groupadd` model the host's group database; `aws` answers the
 * identity proofs the body makes after writing. Each stand-in records its own
 * argument list, which is how the suite sees that the secret never reached one.
 *
 * `getent group` answers in the group(5) line shape (name:password:gid:members),
 * which is the documented format, not a captured sample.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REMOTE_HALF = path.resolve(__dirname, '..', '..', 'scripts', 'internal', 'install-host-credentials-remote.sh');

const AKID = 'AKIAIOSFODNN7EXAMPLE';
const SAK = 'secret-value-not-real';
const ACCOUNT = '123456789012';

let root: string;
let caseCount = 0;

beforeAll(() => {
  root = createScratchDir('install-host-credentials-remote');
});
afterAll(() => removeScratch(root));

function writeExec(file: string, lines: string[]) {
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o755 });
}

interface CaseOpts {
  /** gid the host's awscreds group already has; absent means no such group. */
  groupGid?: string;
  /** A profile whose identity proof fails. */
  failProfile?: string;
  /** Overrides for the assignments the wrapper emits. */
  vars?: Record<string, string>;
}

function runBody(opts: CaseOpts = {}) {
  const dir = path.join(root, `case-${++caseCount}`);
  const bin = path.join(dir, 'bin');
  const dest = path.join(dir, 'root-aws');
  const tmp = path.join(dir, 'tmp');
  const argvLog = path.join(dir, 'argv.log');
  const installLog = path.join(dir, 'install.log');
  const gidFile = path.join(dir, 'gid');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(tmp);
  if (opts.groupGid !== undefined) fs.writeFileSync(gidFile, opts.groupGid);

  const log = `printf '%s %s\\n' "$(basename "$0")" "$*" >> ${JSON.stringify(argvLog)}`;
  writeExec(path.join(bin, 'getent'), [
    '#!/usr/bin/env bash',
    log,
    `[[ -f ${JSON.stringify(gidFile)} ]] || exit 2`,
    `printf '%s:x:%s:\\n' "$2" "$(cat ${JSON.stringify(gidFile)})"`,
  ]);
  writeExec(path.join(bin, 'groupadd'), [
    '#!/usr/bin/env bash',
    log,
    // groupadd --gid N NAME
    `printf '%s' "$2" > ${JSON.stringify(gidFile)}`,
  ]);
  writeExec(path.join(bin, 'install'), [
    '#!/usr/bin/env bash',
    log,
    'mode=""; group=""; dir=0; args=()',
    'while [[ $# -gt 0 ]]; do',
    '  case "$1" in',
    '    -d) dir=1; shift ;;',
    '    -m) mode="$2"; shift 2 ;;',
    '    -o) shift 2 ;;',
    '    -g) group="$2"; shift 2 ;;',
    '    *) args+=("$1"); shift ;;',
    '  esac',
    'done',
    `mkdir -p ${JSON.stringify(dest)}`,
    'if [[ "$dir" == 1 ]]; then',
    `  printf 'dir %s %s %s\\n' "$mode" "$group" "\${args[0]}" >> ${JSON.stringify(installLog)}`,
    'else',
    `  cp "\${args[0]}" ${JSON.stringify(dest)}/"$(basename "\${args[1]}")"`,
    `  printf 'file %s %s %s\\n' "$mode" "$group" "\${args[1]}" >> ${JSON.stringify(installLog)}`,
    'fi',
  ]);
  writeExec(path.join(bin, 'aws'), [
    '#!/usr/bin/env bash',
    log,
    'profile=""; prev=""',
    'for a in "$@"; do [[ "$prev" == "--profile" ]] && profile="$a"; prev="$a"; done',
    'profile="${profile:-$AWS_PROFILE}"',
    `if [[ -n "${opts.failProfile ?? ''}" && "$profile" == "${opts.failProfile ?? ''}" ]]; then`,
    '  echo "An error occurred (AccessDenied) when calling the AssumeRole operation" >&2; exit 254',
    'fi',
    'case "$1 $2" in',
    `  "sts get-caller-identity") echo "arn:aws:sts::${ACCOUNT}:assumed-role/$profile/x" ;;`,
    '  "ssm get-parameter") echo false ;;',
    'esac',
  ]);

  const res = spawnSync('bash', [REMOTE_HALF], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      TMPDIR: tmp,
      AKID,
      SAK,
      ACCOUNT_ID: ACCOUNT,
      TARGET_ENV: 'staging',
      AWS_REGION_VAL: 'us-east-1',
      ...opts.vars,
    },
    ...SPAWN_GUARD,
  });
  const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  return {
    ...res,
    argv: read(argvLog),
    installs: read(installLog).split('\n').filter(Boolean),
    credentials: read(path.join(dest, 'credentials')),
    config: read(path.join(dest, 'config')),
    tmpLeft: fs.readdirSync(tmp),
  };
}

describe('install-host-credentials-remote.sh writes the runtime credential chain', () => {
  it('installs both files group-readable only, with the key in the source profile and the role behind it', () => {
    const res = runBody({ groupGid: '1500' });
    expect(res.status, res.stderr).toBe(0);
    // Owner root, group awscreds, 0640: the containers read it through the
    // group, and nobody else reads it at all.
    expect(res.installs).toEqual([
      'dir 0750 awscreds /root/.aws',
      'file 0640 awscreds /root/.aws/credentials',
      'file 0640 awscreds /root/.aws/config',
    ]);
    expect(res.credentials).toBe(
      `[footbag-staging-source-profile]\naws_access_key_id = ${AKID}\naws_secret_access_key = ${SAK}\n`,
    );
    expect(res.config).toContain('[profile footbag-staging-runtime]');
    expect(res.config).toContain(`role_arn = arn:aws:iam::${ACCOUNT}:role/footbag-staging-app-runtime`);
    expect(res.config).toContain('source_profile = footbag-staging-source-profile');
    expect(res.config).not.toContain(SAK);
    // The secret travels only through a file: any process list on the host
    // would show it otherwise.
    expect(res.argv).not.toContain(SAK);
    // The staged copies holding the secret are gone once it is installed.
    expect(res.tmpLeft).toEqual([]);
  });

  it('proves both profiles resolve, and fails the run when the role cannot be assumed', () => {
    // A key that authenticates but cannot assume the role otherwise surfaces
    // later, inside the application, as an opaque denial.
    const ok = runBody({ groupGid: '1500' });
    expect(ok.argv).toContain('aws sts get-caller-identity --profile footbag-staging-source-profile');
    expect(ok.argv).toContain('aws sts get-caller-identity --profile footbag-staging-runtime');

    const res = runBody({ groupGid: '1500', failProfile: 'footbag-staging-runtime' });
    expect(res.status).not.toBe(0);
    expect(res.stdout).not.toContain('go-live marker reads');
    expect(res.tmpLeft).toEqual([]);
  });

  it('creates the group at the id the containers join when the host has none', () => {
    const res = runBody();
    expect(res.status, res.stderr).toBe(0);
    expect(res.argv).toContain('groupadd --gid 1500 awscreds');
    expect(res.installs).toContain('file 0640 awscreds /root/.aws/credentials');
  });

  it('refuses a group of that name at another id, before writing any credential', () => {
    // The containers join gid 1500; a same-named group at another id leaves
    // them unable to read the files, which looks like a credential fault.
    const res = runBody({ groupGid: '1600' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('group awscreds has gid 1600, expected 1500');
    expect(res.installs).toEqual([]);
    expect(res.credentials).toBe('');
  });

  it('refuses before touching the host when a value it needs is missing', () => {
    // An empty secret would write a credential file that authenticates as
    // nothing, over the one that worked.
    for (const name of ['AKID', 'SAK', 'ACCOUNT_ID', 'TARGET_ENV', 'AWS_REGION_VAL']) {
      const res = runBody({ groupGid: '1500', vars: { [name]: '' } });
      expect(res.status, name).not.toBe(0);
      expect(res.stderr, name).toContain(`remote half requires ${name}`);
      expect(res.argv, `${name}: nothing may run`).toBe('');
    }
  });
});
