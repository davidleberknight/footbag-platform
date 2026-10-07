/**
 * The site refusing to start while a restored database has not had its
 * erasures re-applied.
 *
 * A restore whose erasure replay did not complete leaves a marker beside the
 * database. The restore stops the service, but a deploy's restart or a reboot
 * would start it again and serve personal data members asked to have erased, so
 * the main unit runs this check before every start.
 *
 * The contract these assert: the check refuses while the marker exists and
 * names the one command that finishes the replay; it allows the start once the
 * marker is gone; and the unit really runs it before every start, by the
 * command line the unit itself carries, from a path the code deploy ships to
 * the host.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const UNIT = readFileSync(join(REPO_ROOT, 'ops/systemd/footbag.service'), 'utf8');

let dbDir: string;

beforeEach(() => {
  dbDir = createScratchDir('erasure-replay-pending');
});

afterEach(() => {
  rmSync(dbDir, { recursive: true, force: true });
});

/** The unit's own ExecStartPre command line, run as systemd would run it. */
function unitPreStartCommand(): string[] {
  const line = UNIT.split('\n').find((l) => l.startsWith('ExecStartPre='));
  expect(line, 'the service unit has no ExecStartPre').toBeDefined();
  return line!.slice('ExecStartPre='.length).trim().split(/\s+/);
}

function runPreStart(): { status: number; stderr: string } {
  const [bin, ...args] = unitPreStartCommand();
  // The unit's WorkingDirectory is the install root, which mirrors the
  // repository layout, so the relative script path resolves the same way here.
  const res = spawnSync(bin, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, FOOTBAG_DB_DIR: dbDir, FOOTBAG_ENV: 'staging' },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stderr: res.stderr ?? '' };
}

describe('starting the site while an erasure replay is pending', () => {
  // Defect caught: a reboot or a deploy's restart brought the site up on a
  // restored database still holding data members asked to have erased.
  it('refuses the start and names the command that finishes the replay', () => {
    writeFileSync(join(dbDir, '.erasure-replay-pending'), 'snapshot=routine/x.db.gz\n');

    const res = runPreStart();

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('bash scripts/restore-db.sh --target staging --resume-erasure-replay');
    expect(res.stderr).toContain('snapshot=routine/x.db.gz');
  });

  // Defect caught: a check that refused every start, taking the site down on a
  // host with nothing pending.
  it('allows the start when nothing is pending', () => {
    expect(runPreStart().status).toBe(0);
  });

  // Defect caught: the unit naming a script the code deploy never copies to the
  // host, so every start there fails on a missing file and the site stays down.
  it('names a script the code deploy ships to the host', () => {
    const script = unitPreStartCommand().find((a) => a.startsWith('scripts/'));
    expect(script).toBeDefined();
    expect(readFileSync(join(REPO_ROOT, 'scripts/deploy-code.sh'), 'utf8'))
      .toContain(`--include='/${script}'`);
  });
});
