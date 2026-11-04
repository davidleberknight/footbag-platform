/**
 * scripts/lib/iam-dev-tester-user.sh — the named dev-and-tester IAM users, and
 * the one identity family they must never be confused with.
 *
 * footbag-operator administers every other identity and is the break-glass
 * account; the shared host account's name is not an IAM user at all. The
 * library refuses both, and an empty name, in every mutating function before
 * any AWS call, whatever its caller has already checked. Its callers refuse
 * those names too, so this guard is the second line and no caller's suite can
 * reach it: these cases drive the library directly, through its AWS seam, and
 * count the calls it makes.
 *
 * The rest of the library's refusals (a user that is somebody else's, a read
 * that failed, a console login profile) are pinned through the onboarding and
 * management suites that drive it end to end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/iam-dev-tester-user.sh');
const ROLE_ARN = 'arn:aws:iam::123456789012:role/FootbagDevTester';
const RESERVED = ['footbag-operator', 'footbag', ''];

let workDir: string;
let calls: string;
let aws: string;

beforeEach(() => {
  workDir = createScratchDir('iam-dev-tester-user');
  calls = join(workDir, 'aws.calls');
  aws = join(workDir, 'aws');
  // Records every call and answers success, so a guard that let a call through
  // shows up as a line in the log rather than as an error the run swallowed.
  writeFileSync(aws, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(calls)}\nexit 0\n`);
  chmodSync(aws, 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function run(script: string) {
  const res = spawnSync('bash', ['-c', `set -uo pipefail; source ${JSON.stringify(LIB)}; ${script}`], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
    env: { ...process.env, IAM_DEV_TESTER_AWS_BIN: aws },
  });
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
  };
}

describe('iam-dev-tester-user.sh on a name that is not a named dev-tester', () => {
  // Defect caught: onboarding under the administrators' own name creates or
  // grants on footbag-operator, handing the break-glass identity to the job
  // role's lifecycle, which a later offboarding would then delete.
  it('refuses to create or grant, and makes no AWS call', () => {
    for (const name of RESERVED) {
      const r = run(`iam_dev_tester_ensure ${JSON.stringify(name)} 0 ${ROLE_ARN}`);
      expect(r.status, `name ${JSON.stringify(name)}`).not.toBe(0);
      expect(r.out, `name ${JSON.stringify(name)}`).toContain('is not a named dev-tester');
      expect(r.calls, `name ${JSON.stringify(name)}`).toBe('');
    }
  });

  // Defect caught: an interrupted run whose recorded target is a reserved name
  // deletes that user and its policy from its cleanup trap.
  it('undoes nothing, whatever the run recorded it created', () => {
    for (const name of RESERVED) {
      const r = run(
        `IAM_DEV_TESTER_TARGET=${JSON.stringify(name)}; IAM_DEV_TESTER_CREATED_USER=1;` +
          ` IAM_DEV_TESTER_CREATED_POLICY=1; iam_dev_tester_undo`,
      );
      expect(r.status, `name ${JSON.stringify(name)}`).toBe(0);
      expect(r.calls, `name ${JSON.stringify(name)}`).toBe('');
    }
  });

  // Defect caught: an undo whose delete AWS refuses leaves an IAM user and its
  // policy behind with nothing saying so, because the failure was swallowed.
  it('lists a refused delete during the undo with AWS\'s own reason, and lists nothing when it succeeds', () => {
    writeFileSync(aws, [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(calls)}`,
      'if [[ "$2" == delete-user ]]; then echo "An error occurred (DeleteConflict) when calling the DeleteUser operation: Cannot delete entity, must remove access keys first." >&2; exit 254; fi',
      'exit 0',
      '',
    ].join('\n'));
    const undo = 'IAM_DEV_TESTER_TARGET=jane_doe; IAM_DEV_TESTER_CREATED_USER=1; IAM_DEV_TESTER_CREATED_POLICY=1; iam_dev_tester_undo';
    const refused = run(undo);
    expect(refused.status).toBe(0);
    expect(refused.out).toMatch(/ERROR: the IAM user jane_doe this run created was not deleted: .*DeleteConflict/);
    expect(refused.out).not.toMatch(/policy on jane_doe was not removed/);
    writeFileSync(aws, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(calls)}\nexit 0\n`);
    const clean = run(undo);
    expect(clean.out).not.toMatch(/ERROR:/);
  });

  // Defect caught: the two cases above pass because the seam is not reaching
  // the stand-in at all, so no name could ever have produced a call.
  it('does reach AWS through the seam for a named dev-tester', () => {
    const r = run(`iam_dev_tester_ensure jane_doe 0 ${ROLE_ARN}`);
    expect(r.calls).toMatch(/^iam create-user --user-name jane_doe /m);
  });
});
