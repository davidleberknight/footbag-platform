/**
 * scripts/staging_diagnostics.sh — the diagnostic toolkit uploaded to the
 * staging host and run there.
 *
 * The contract it has to keep is which installation it reads. The deploy
 * promotes a release into the live install and composes the running stack from
 * there, while the directory a release is uploaded to lives in the connecting
 * account's own home and is therefore a different path for every connecting
 * account. A diagnostic that names one account's upload directory is either missing on
 * everybody else's run or, worse, describes whatever that other account last
 * uploaded -- answering confidently about a stack the host is not running.
 *
 * What is pinned here:
 *
 *   - the subcommands compose against the live install, proved by driving the
 *     script and reading the arguments it actually passed;
 *   - no path in the file is rooted in a particular person's home directory;
 *   - the upload instructions name the connecting account's own home rather
 *     than a literal one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createTestDb } from '../fixtures/testDb';
import {
  insertFreestyleTrick, insertMediaSource, insertMember, insertSesEvent, insertSystemAlarmEvent,
} from '../fixtures/factories';

const SCRIPT = join(process.cwd(), 'scripts/staging_diagnostics.sh');
const LIVE_INSTALL = '/srv/footbag';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-diag-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Puts a `sudo` that simply runs its arguments, and a `docker` that records
 * them, ahead of everything on PATH. Both stand in for tools whose contract the
 * caller already knows -- run this, and here are the arguments -- so an
 * acknowledged fake cannot mislead the assertion about a format either tool is
 * free to change.
 */
function stubTools(): { path: string; argsFile: string } {
  const binDir = join(workDir, 'bin');
  const argsFile = join(workDir, 'docker-args.txt');
  writeFileSync(join(workDir, 'mkbin'), '', 'utf-8');
  rmSync(join(workDir, 'mkbin'));
  spawnSync('mkdir', ['-p', binDir], SPAWN_GUARD);

  // The host's recorded environment is read through `sudo awk` from a file the
  // suite cannot create at its real path, so the stand-in answers that one read
  // with STUB_HOST_ENV (staging unless a case says otherwise) and runs the rest.
  const sudo = join(binDir, 'sudo');
  writeFileSync(
    sudo,
    ['#!/usr/bin/env bash', 'if [[ "$1" == awk ]]; then printf \'%s\\n\' "${STUB_HOST_ENV-staging}"; exit 0; fi', 'exec "$@"', ''].join('\n'),
    'utf-8',
  );
  chmodSync(sudo, 0o755);

  const docker = join(binDir, 'docker');
  writeFileSync(
    docker,
    ['#!/usr/bin/env bash', `printf '%s\\n' "$*" >> ${JSON.stringify(argsFile)}`, 'exit 0', ''].join(
      '\n',
    ),
    'utf-8',
  );
  chmodSync(docker, 0o755);

  return { path: `${binDir}:${process.env.PATH ?? ''}`, argsFile };
}

function runSubcommand(sub: string, hostEnv?: string) {
  const { path, argsFile } = stubTools();
  const res = spawnSync('bash', [SCRIPT, sub], {
    encoding: 'utf-8',
    env: { PATH: path, HOME: workDir, ...(hostEnv === undefined ? {} : { STUB_HOST_ENV: hostEnv }) },
    ...SPAWN_GUARD,
  });
  let dockerArgs = '';
  try {
    dockerArgs = readFileSync(argsFile, 'utf-8');
  } catch {
    dockerArgs = '';
  }
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', dockerArgs };
}

describe('the diagnostics read the live install', () => {
  it('composes status against the live install, not an upload directory', () => {
    const r = runSubcommand('status');
    expect(r.dockerArgs).toContain(`-f ${LIVE_INSTALL}/docker/docker-compose.yml`);
    expect(r.dockerArgs).toContain(`-f ${LIVE_INSTALL}/docker/docker-compose.prod.yml`);
    expect(r.dockerArgs).toContain(`--env-file ${LIVE_INSTALL}/env`);
  });

  it('still reaches the compose subcommand it was asked for', () => {
    const r = runSubcommand('status');
    expect(r.dockerArgs.trim().endsWith(' ps')).toBe(true);
  });
});

describe('the diagnostics run only on a host that records a deployed environment', () => {
  // Defect caught: the toolkit runs against a host that has not confirmed it is
  // staging or production, and reports confidently about the wrong machine.
  it('runs on a host recording production, which the host-diagnostics wrapper targets', () => {
    const r = runSubcommand('status', 'production');
    expect(r.status, r.stderr).toBe(0);
    expect(r.dockerArgs.trim().endsWith(' ps')).toBe(true);
  });

  it('refuses a host recording any other environment, before touching docker', () => {
    const r = runSubcommand('status', 'development');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('REFUSING');
    expect(r.dockerArgs).toBe('');
  });

  it('refuses a host that records no environment', () => {
    const r = runSubcommand('status', '');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('REFUSING');
    expect(r.dockerArgs).toBe('');
  });

  it('prints help without asking the host anything', () => {
    const r = runSubcommand('help', '');
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('REFUSING');
  });
});

describe('table-digests proves a deploy left the preserved rows as they were', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(workDir, 'footbag.db');
    const db = createTestDb(dbPath);
    insertMember(db, { slug: 'digest-member' });
    insertFreestyleTrick(db, { slug: 'digest-trick' });
    insertMediaSource(db, 'digest-source');
    db.close();
  });

  /**
   * Runs the subcommand with a docker that hands the script's own JavaScript to
   * node on this machine, pointed at the scratch database instead of the
   * container's path, so the digest code under test is the shipped code.
   */
  function digests(): Record<string, string> {
    const { path } = stubTools();
    const docker = join(workDir, 'bin', 'docker');
    writeFileSync(docker, [
      '#!/usr/bin/env bash',
      `sed "s#/app/db/footbag.db#${dbPath}#" | NODE_PATH=${JSON.stringify(join(process.cwd(), 'node_modules'))} node`,
      '',
    ].join('\n'));
    chmodSync(docker, 0o755);
    const res = spawnSync('bash', [SCRIPT, 'table-digests'], {
      encoding: 'utf-8', env: { ...process.env, PATH: path, HOME: workDir }, ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr).toBe(0);
    const out: Record<string, string> = {};
    for (const m of res.stdout.matchAll(/^DIGEST (\S+) (rows=\d+ sha256=[0-9a-f]{64})$/gm)) out[m[1]] = m[2];
    return out;
  }
  const change = (sql: string) => { const db = new BetterSqlite3(dbPath); db.exec(sql); db.close(); };

  // Defect caught: a digest that differs between two reads of the same rows,
  // so every durability comparison fails and the check is ignored.
  it('reports the same four digests for the same rows, each counting its rows', () => {
    const first = digests();
    expect(Object.keys(first).sort()).toEqual(['curated_media', 'email_templates', 'freestyle', 'members']);
    expect(first.members).toMatch(/^rows=[1-9]/);
    expect(first.freestyle).toMatch(/^rows=[1-9]/);
    expect(digests()).toEqual(first);
  });

  // Defect caught: a digest of counts only, so a deploy that rewrote a member's
  // row in place passes as having preserved it.
  it('changes only the group whose row contents changed, at the same count', () => {
    const before = digests();
    change("UPDATE members SET display_name = 'Changed In Place' WHERE slug = 'digest-member'");
    const after = digests();
    expect(after.members).not.toEqual(before.members);
    expect(after.members.split(' ')[0]).toEqual(before.members.split(' ')[0]);
    for (const g of ['curated_media', 'email_templates', 'freestyle']) expect(after[g], g).toEqual(before[g]);
  });

  // Defect caught: the rehearsal's own probe table, which every migration run
  // adds, counted as a change to the preserved rows.
  it('ignores a table outside the groups, such as a migration probe', () => {
    const before = digests();
    change('CREATE TABLE sitting_durability_probe (id INTEGER PRIMARY KEY); INSERT INTO sitting_durability_probe VALUES (1);');
    expect(digests()).toEqual(before);
  });

  // Defect caught: a deleted row in the freestyle tables not noticed.
  it('notices a deleted freestyle row', () => {
    const before = digests();
    change("DELETE FROM freestyle_tricks WHERE slug = 'digest-trick'");
    expect(digests().freestyle).not.toEqual(before.freestyle);
  });
});

describe('ses-bounces --since proves the bounce feed delivered a notification', () => {
  let dbPath: string;
  const PROBE_SENT = '2026-11-12T10:00:00Z';

  beforeEach(() => {
    dbPath = join(workDir, 'footbag.db');
    createTestDb(dbPath).close();
  });

  /** Runs the shipped JavaScript with node on this machine against the scratch
   *  database, as the digest cases do. */
  function sinceRun(...args: string[]) {
    const { path } = stubTools();
    const docker = join(workDir, 'bin', 'docker');
    writeFileSync(docker, [
      '#!/usr/bin/env bash',
      `sed "s#/app/db/footbag.db#${dbPath}#" | NODE_PATH=${JSON.stringify(join(process.cwd(), 'node_modules'))} node`,
      '',
    ].join('\n'));
    chmodSync(docker, 0o755);
    const res = spawnSync('bash', [SCRIPT, 'ses-bounces', ...args], {
      encoding: 'utf-8', env: { ...process.env, PATH: path, HOME: workDir }, ...SPAWN_GUARD,
    });
    return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }
  const seed = (o: Parameters<typeof insertSesEvent>[1]) => {
    const db = new BetterSqlite3(dbPath); const id = insertSesEvent(db, o); db.close(); return id;
  };

  // Defect caught: the sitting's bounce check passes on a bounce from an earlier
  // probe, so a feed that broke since then reads as working.
  it('fails when the only bounce was processed before the probe was sent', () => {
    seed({ event_type: 'bounce', processed_at: '2026-11-12T09:59:59.000Z' });
    const r = sinceRun('--since', PROBE_SENT);
    expect(r.status, r.stderr).toBe(3);
    expect(r.stdout).not.toMatch(/^BOUNCE 2026/m);
  });

  // Defect caught: a complaint, which the probe never produces, taken as proof
  // that the bounce reached the platform.
  it('fails when only a complaint arrived after the probe', () => {
    seed({ event_type: 'complaint', processed_at: '2026-11-12T10:03:00.000Z' });
    expect(sinceRun('--since', PROBE_SENT).status).toBe(3);
  });

  // Defect caught: the check never passes, so the operator is pushed back to
  // answering a question by hand.
  it('passes on a bounce processed after the probe, naming that notification', () => {
    seed({ event_type: 'bounce', processed_at: '2026-11-12T09:00:00.000Z' });
    const id = seed({ event_type: 'bounce', processed_at: '2026-11-12T10:02:30.123Z', mail_message_id: 'probe-mail-id' });
    const r = sinceRun('--since', PROBE_SENT);
    expect(r.status, r.stderr).toBe(0);
    // The provider's id for the bounced message, which ties the row to the probe.
    expect(r.stdout).toContain(`BOUNCE 2026-11-12T10:02:30.123Z ${id} mail=probe-mail-id`);
  });

  // Defect caught: a malformed time written into the JavaScript the host runs.
  it('refuses a time that is not a UTC timestamp, before reaching the container', () => {
    const r = sinceRun('--since', "2026-11-12'; process.exit(0); '");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: ses-bounces');
  });
});

describe('active-alarms reads what the admin alarms page lists as active', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(workDir, 'footbag.db');
    createTestDb(dbPath).close();
  });

  function activeRun() {
    const { path } = stubTools();
    const docker = join(workDir, 'bin', 'docker');
    writeFileSync(docker, [
      '#!/usr/bin/env bash',
      `sed "s#/app/db/footbag.db#${dbPath}#" | NODE_PATH=${JSON.stringify(join(process.cwd(), 'node_modules'))} node`,
      '',
    ].join('\n'));
    chmodSync(docker, 0o755);
    const res = spawnSync('bash', [SCRIPT, 'active-alarms'], {
      encoding: 'utf-8', env: { ...process.env, PATH: path, HOME: workDir }, ...SPAWN_GUARD,
    });
    return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }
  const seed = (o: Parameters<typeof insertSystemAlarmEvent>[1]) => {
    const db = new BetterSqlite3(dbPath); insertSystemAlarmEvent(db, o); db.close();
  };

  // Defect caught: the sitting reads the estate as quiet while the page still
  // shows an alarm nobody has picked up.
  it('fails while an alarm is active, naming it', () => {
    seed({ alarm_type: 'footbag-staging-media-replication-backlog', status: 'active' });
    seed({ alarm_type: 'footbag-staging-old-alarm', status: 'cleared' });
    const r = activeRun();
    expect(r.status, r.stderr).toBe(3);
    expect(r.stdout).toMatch(/^ACTIVE critical footbag-staging-media-replication-backlog /m);
    expect(r.stdout).not.toContain('footbag-staging-old-alarm');
  });

  // Defect caught: a cleared or acknowledged alarm, which the page does not
  // count, holding the check red forever.
  it('passes when every alarm is cleared or acknowledged', () => {
    seed({ status: 'cleared' });
    seed({ status: 'acknowledged' });
    const r = activeRun();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('NO ACTIVE ALARMS');
  });
});

describe('no path belongs to one particular connecting account', () => {
  it('roots no path in a named home directory', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    const homeRooted = source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /\/home\/[a-z_][a-z0-9_-]*\//.test(line));
    expect(homeRooted.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });

  it('uploads to the connecting account own home rather than a literal one', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).toMatch(/scp scripts\/staging_diagnostics\.sh footbag-staging:~\//);
  });
});

describe('the subcommands are run from a session on the host', () => {
  it('never asks ssh for a terminal, which this tree forbids', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).not.toMatch(/ssh\s+-t\b/);
    expect(source).not.toMatch(/RequestTTY/);
  });

  it('shows no subcommand passed as a one-shot argument to ssh', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    const oneShot = source
      .split('\n')
      .filter((line) => /ssh\s+\S+\s+['"].*staging_diagnostics\.sh/.test(line));
    expect(oneShot).toEqual([]);
  });
});
