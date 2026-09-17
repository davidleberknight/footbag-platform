/**
 * scripts/lib/terraform-output.sh — the reader that keeps terraform's own
 * words instead of discarding them.
 *
 * Every deploy read of a terraform output used to redirect stderr to /dev/null,
 * tolerate the failure, and then guess at the cause on an empty value. The
 * guess named one cause, an uninitialised tree, while at least three produce
 * exactly that symptom: an uninitialised tree, an access key that no longer
 * authenticates because it was deactivated or rotated, and an operator profile
 * that was never installed on the machine at all. So a deploy run during a key
 * rotation reads as an infrastructure fault and sends the operator to the wrong
 * place.
 *
 * What is pinned here:
 *
 *   - a failed read surrenders no value and carries terraform's stderr;
 *   - a successful read carries the value and no error, including when the
 *     value is legitimately empty;
 *   - the explanation names all three causes, so none is checked in preference
 *     to the others;
 *   - the temp file the capture needs does not outlive the call, and neither
 *     does the trap that removes it;
 *   - both deploy entry points route every output read through this, because a
 *     single site left on the old form is the one that will be hit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/terraform-output.sh');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-tfout-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** A terraform stub with the given stdout, stderr and exit status. */
function tfStub(out: string, err: string, status: number, name = 'terraform-stub'): string {
  const path = join(workDir, `${name}.sh`);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      out ? `printf '%s' ${JSON.stringify(out)}` : ':',
      err ? `printf '%s\\n' ${JSON.stringify(err)} >&2` : ':',
      `exit ${status}`,
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * An `aws` stub that answers the two questions the identity library asks before
 * any read: which profiles exist, and what the identity resolves to. The reader
 * settles an identity first, by design, so a suite about what it does with
 * terraform's output has to supply one rather than let the run refuse.
 */
function awsStub(): string {
  const path = join(workDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      "  printf '%s\\n' 'footbag-operator'",
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      "  printf '%s\\n' 'arn:aws:iam::000000000000:user/footbag-operator'",
      '  exit 0',
      'fi',
      'echo "unexpected aws invocation: $*" >&2',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/** Sources the library, runs the given body, and returns what it printed. */
function withLib(body: string, stub: string) {
  const script = join(workDir, 'driver.sh');
  writeFileSync(
    script,
    ['#!/usr/bin/env bash', 'set -euo pipefail', `source "${LIB}"`, body, ''].join('\n'),
    'utf-8',
  );
  const aws = awsStub();
  const res = spawnSync('bash', [script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      TF_OUTPUT_BIN: stub,
      TMPDIR: workDir,
      AWS_PROFILE_BIN: aws,
      AWS_IDENTITY_BIN: aws,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('tf_output_read', () => {
  it('keeps terraform stderr on a failed read, and surrenders no value', () => {
    const stub = tfStub('', 'Error: no valid credential sources for S3 Backend found.', 1);
    const r = withLib(
      [
        'tf_output_read /nowhere cloudfront_domain || echo "rc=$?"',
        'echo "VALUE=[$TF_OUTPUT_VALUE]"',
        'echo "ERROR=[$TF_OUTPUT_ERROR]"',
      ].join('\n'),
      stub,
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stdout).toContain('VALUE=[]');
    expect(r.stdout).toContain('no valid credential sources');
  });

  it('carries the value and no error on a successful read', () => {
    const stub = tfStub('d1234.cloudfront.net', '', 0);
    const r = withLib(
      ['tf_output_read /nowhere cloudfront_domain', 'echo "V=[$TF_OUTPUT_VALUE]E=[$TF_OUTPUT_ERROR]"'].join(
        '\n',
      ),
      stub,
    );
    expect(r.stdout).toContain('V=[d1234.cloudfront.net]E=[]');
  });

  it('treats a legitimately empty output as a successful read, not a failure', () => {
    // An output that exists and is empty is an answer. Reporting it as a failed
    // read would send the operator looking for a credential problem that is not
    // there.
    const stub = tfStub('', '', 0);
    const r = withLib(
      ['tf_output_read /nowhere some_flag && echo "READ OK"', 'echo "E=[$TF_OUTPUT_ERROR]"'].join('\n'),
      stub,
    );
    expect(r.stdout).toContain('READ OK');
    expect(r.stdout).toContain('E=[]');
  });

  it('clears the previous error when a later read succeeds', () => {
    // A stale error left in the variable would be printed against the next
    // failure, which is worse than no message: it names a cause that has been
    // fixed.
    const failing = tfStub('', 'Error: stale', 1);
    const r = withLib(
      [
        `tf_output_read /nowhere a || true`,
        `TF_OUTPUT_BIN="${tfStub('ok', '', 0, 'terraform-ok')}"`,
        'tf_output_read /nowhere b || true',
        'echo "E=[$TF_OUTPUT_ERROR]"',
      ].join('\n'),
      failing,
    );
    expect(r.stdout).toContain('E=[]');
  });

  it('leaves no temp file behind, and no trap to fire later', () => {
    const stub = tfStub('', 'Error: nope', 1);
    const r = withLib(
      [
        'tf_output_read /nowhere a || true',
        'tf_output_read /nowhere b || true',
        'echo "TRAP=[$(trap -p RETURN)]"',
      ].join('\n'),
      stub,
    );
    // A RETURN trap fires for the function that set it and then stays set on
    // the shell, so one that does not clear itself runs rm on a freed path at
    // the next source.
    expect(r.stdout).toContain('TRAP=[]');
    const leftovers = readdirSync(workDir).filter((f) => f.startsWith('tmp.'));
    expect(leftovers).toEqual([]);
  });
});

describe('tf_output_explain', () => {
  it('names all three causes rather than the one that used to be guessed', () => {
    const stub = tfStub('', 'Error: nope', 1);
    const r = withLib(
      ['tf_output_read /nowhere cloudfront_domain || true', 'tf_output_explain terraform/staging cloudfront_domain'].join(
        '\n',
      ),
      stub,
    );
    expect(r.stderr).toMatch(/has not been initialised/);
    expect(r.stderr).toMatch(/deactivated/);
    expect(r.stderr).toMatch(/operator profile is not installed on this machine/);
    // And terraform's own sentence, which is the one that distinguishes them.
    expect(r.stderr).toContain('Error: nope');
  });
});

describe('the deploy entry points read outputs through it', () => {
  it.each(['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh'])(
    '%s has no output read that discards the reason',
    (script) => {
      const body = readFileSync(join(process.cwd(), script), 'utf-8');
      const discarding = body
        .split('\n')
        .filter((line) => /output -raw/.test(line))
        .filter((line) => !line.trim().startsWith('#'));
      expect(discarding, discarding.join('\n')).toEqual([]);
      expect(body).toContain('lib/terraform-output.sh');
    },
  );
});
