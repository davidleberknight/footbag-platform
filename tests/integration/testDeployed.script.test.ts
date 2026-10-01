/**
 * scripts/test-deployed.sh, the launcher for the read-only browser check against
 * a deployed environment.
 *
 * Contract: it refuses any target but staging or production, hands the browser
 * run the environment's address and the target name, runs the deployed config and
 * never the local suite's, and announces a test seam when one is in use. On both
 * targets the spec registers the anonymous page walk only, and the browser's
 * policy-violation report never reaches the deployed host.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = path.join(process.cwd(), 'scripts/test-deployed.sh');
const dir = createScratchDir('test-deployed');
afterAll(() => removeScratch(dir));

const RECORD = path.join(dir, 'playwright-call');
const STUB = path.join(dir, 'playwright');
writeFileSync(
  STUB,
  `#!/usr/bin/env bash\nprintf '%s\\n' "args=$*" "target=$DEPLOYED_TARGET" "base=$DEPLOYED_BASE_URL" > ${JSON.stringify(RECORD)}\n`,
  { mode: 0o755 },
);

function run(args: string[]): { status: number | null; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DEPLOYED_BASE_URL: 'https://staging.example.test', FOOTBAG_PLAYWRIGHT_BIN: STUB },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stderr: res.stderr ?? '' };
}

describe('test-deployed.sh', () => {
  // Defect caught: a typo or a missing argument sends the browser check at an
  // environment nobody named.
  it('refuses a target that is not staging or production', () => {
    for (const bad of [[], ['--target', 'prod'], ['--target', 'development']]) {
      const res = run(bad);
      expect(res.status, bad.join(' ')).toBe(2);
      expect(res.stderr).toMatch(/--target (is required|must be) .*'staging' or 'production'/);
    }
  });

  // Defect caught: an environment named without the flag every other operator
  // command uses, which is how a second convention for naming one comes back.
  it('takes the environment only as --target', () => {
    const res = run(['staging']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument 'staging'");
  });

  // Defect caught: the production run registers the persona leg, or runs the
  // local suite, whose specs write to a database.
  it('runs the deployed config with the address and the target name', () => {
    for (const target of ['staging', 'production']) {
      const res = run(['--target', target]);
      expect(res.status, res.stderr).toBe(0);
      const call = readFileSync(RECORD, 'utf8');
      expect(call).toContain('args=test -c tests/playwright.deployed.config.ts');
      expect(call).toContain(`target=${target}`);
      expect(call).toContain('base=https://staging.example.test');
      expect(res.stderr).toContain('TEST SEAM');
    }
  });

  // Defect caught: the check against a deployed environment signs in through the
  // persona switch, which writes an audit row on the deployed host, or registers
  // anything beyond the anonymous page walk on either target.
  it('registers only the anonymous page walk, on staging and on production alike', () => {
    for (const target of ['staging', 'production']) {
      const res = spawnSync(path.join(process.cwd(), 'node_modules/.bin/playwright'), ['test', '-c', 'tests/playwright.deployed.config.ts', '--list'], {
        encoding: 'utf8',
        env: { ...process.env, DEPLOYED_TARGET: target, DEPLOYED_BASE_URL: 'https://staging.example.test' },
        ...SPAWN_GUARD,
      });
      expect(res.status, res.stderr).toBe(0);
      const listed = (res.stdout ?? '').split('\n').filter((l) => l.includes('deployed-browser.spec.ts'));
      expect(listed.length, `${target}:\n${res.stdout}`).toBe(1);
      expect(listed[0], target).toContain('anonymous landing pages');
    }
    const spec = readFileSync(path.join(process.cwd(), 'tests/e2e/deployed/deployed-browser.spec.ts'), 'utf8');
    expect(spec).not.toContain('/dev/');
    // The local Playwright config never collects the deployed spec.
    expect(readFileSync(path.join(process.cwd(), 'tests/playwright.config.ts'), 'utf8')).toContain("testIgnore: ['deployed/**']");
  });

  // Defect caught: a policy violation during the walk makes the browser POST a
  // report to the deployed host, which writes a log line there; the walk still
  // sees the violation through the page's own listener.
  it('blocks the browser’s report POST while still listening for policy violations', () => {
    const spec = readFileSync(path.join(process.cwd(), 'tests/e2e/deployed/deployed-browser.spec.ts'), 'utf8');
    expect(spec).toMatch(/page\.route\('\*\*\/csp-report', \(route\) => route\.abort\(\)\)/);
    expect(spec).toContain("addEventListener('securitypolicyviolation'");
  });
});
