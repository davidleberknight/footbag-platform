/**
 * scripts/ci/check_config_seed_parity.sh — the three-way contract it enforces.
 *
 * Administrator-configurable parameters are seeded into the database at initial
 * creation and their normative defaults are written down in the stories. The
 * gate holds three lists in lockstep: what is seeded, what is documented, and
 * what application source actually reads.
 *
 * The reader leg is the one these cases exist for. A key can be seeded and
 * documented and read by nothing, and then an administrator changes the value
 * and the site behaves exactly as before — a control that is advertised and does
 * not work, which is worse than offering none. The gate refuses that unless the
 * key is on its own allow-list with a reason.
 *
 * The gate runs against a throwaway repository rather than this one, so a case
 * can assert what an unread key does without an unread key having to exist in
 * the real tree. The stories document is reached through the gate's synthetic
 * input variable rather than placed at its real path, because a separate
 * convention rule forbids a documentation filename from appearing anywhere
 * under tests/. Every suite run exercises the real paths anyway, by running the
 * gate against this repository.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/ci/check_config_seed_parity.sh');
const FIXTURE_STORIES = 'fixture-stories.txt';

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** One seed tuple in the shape the gate parses out of the schema. */
function seed(key: string, value: string): string {
  return [
    '  (',
    `   'seed-${key.replace(/_/g, '-')}',`,
    "   '2000-01-01T00:00:00.000Z',",
    `   '${key}', '${value}',`,
    "   '2000-01-01T00:00:00.000Z',",
    `   'Fixture parameter ${key}.',`,
    '   NULL',
    '  ),',
  ].join('\n');
}

function schemaWith(seeds: string[]): string {
  return ['INSERT OR IGNORE INTO system_config', '  VALUES', ...seeds, '  ;', ''].join('\n');
}

/** The run of bullets under the heading the gate locates by name. */
function storiesWith(bullets: string[]): string {
  return ['# Fixture stories', '', '## Configurable Parameters', '', ...bullets, '', '## Next', ''].join('\n');
}

function inFixtureRepo(
  seeds: string[],
  bullets: string[],
  sources: Record<string, string>,
): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-cfgseed-'));
  try {
    mkdirSync(join(dir, 'database'), { recursive: true });
    writeFileSync(join(dir, 'database/schema.sql'), schemaWith(seeds), 'utf-8');
    writeFileSync(join(dir, FIXTURE_STORIES), storiesWith(bullets), 'utf-8');
    for (const [rel, contents] of Object.entries(sources)) {
      const full = join(dir, 'src', rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, contents, 'utf-8');
    }
    const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    expect(init.status).toBe(0);

    const r = spawnSync('bash', [SCRIPT], {
      cwd: dir,
      encoding: 'utf-8',
      env: { ...process.env, CONFIG_SEED_STORIES: FIXTURE_STORIES },
      ...SPAWN_GUARD,
    });
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('check_config_seed_parity.sh', () => {
  it('passes a key that is seeded, documented and read', () => {
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      ['- `demo_limit_per_hour = 30` (fixture)'],
      { 'services/demoService.ts': "readIntConfig('demo_limit_per_hour', 30);\n" },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/\[config-seed-parity\] pass/);
  });

  it('fails a seeded, documented key that nothing reads, and says what to do', () => {
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      ['- `demo_limit_per_hour = 30` (fixture)'],
      { 'services/demoService.ts': 'const unrelated = 1;\n' },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('demo_limit_per_hour');
    expect(r.stderr).toMatch(/seeded but read by nothing/);
    expect(r.stderr).toMatch(/Wire a reader, remove the seed, or add the key/);
  });

  it('accepts an unread key that the allow-list names with its reason', () => {
    // Exercises the real allow-list rather than a fixture one, so a case cannot
    // pass against an allow-list mechanism the live gate does not have.
    const r = inFixtureRepo(
      [seed('audit_retention_days', '2555')],
      ['- `audit_retention_days = 2555` (fixture)'],
      { 'services/demoService.ts': 'const unrelated = 1;\n' },
    );
    expect(r.exitCode).toBe(0);
  });

  it('refuses an allow-list entry whose reason has expired because a reader now exists', () => {
    const r = inFixtureRepo(
      [seed('audit_retention_days', '2555')],
      ['- `audit_retention_days = 2555` (fixture)'],
      { 'services/demoService.ts': "readIntConfig('audit_retention_days', 2555);\n" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/listed as having no reader, but src\/ now reads them/);
    expect(r.stderr).toContain('audit_retention_days');
  });

  it('does not count the admin parameters display surface as a reader', () => {
    // The screen lists the keys it renders. Counting that as a reader would let
    // an inert key pass by being displayed on the very screen that advertises
    // the control it does not have.
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      ['- `demo_limit_per_hour = 30` (fixture)'],
      { 'services/adminSystemParametersService.ts': "{ key: 'demo_limit_per_hour' }\n" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('demo_limit_per_hour');
  });

  it('counts a key reached through a shared helper rather than a direct reader call', () => {
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      ['- `demo_limit_per_hour = 30` (fixture)'],
      {
        'services/demoService.ts':
          "throttlePerActor('demo', actorId,\n  'demo_limit_per_hour', 30,\n  'Too many.');\n",
      },
    );
    expect(r.exitCode).toBe(0);
  });

  it('searches nested source directories, not only the top level', () => {
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      ['- `demo_limit_per_hour = 30` (fixture)'],
      { 'deeply/nested/demoService.ts': "readIntConfig('demo_limit_per_hour', 30);\n" },
    );
    expect(r.exitCode).toBe(0);
  });

  it('still fails a documented key that is not seeded', () => {
    const r = inFixtureRepo([], ['- `demo_limit_per_hour = 30` (fixture)'], {});
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/documented but not seeded/);
  });

  it('still fails a seeded key that is not documented', () => {
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      [],
      { 'services/demoService.ts': "readIntConfig('demo_limit_per_hour', 30);\n" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/seeded but not documented/);
  });

  it('still fails a documented default that disagrees with the seeded value', () => {
    const r = inFixtureRepo(
      [seed('demo_limit_per_hour', '30')],
      ['- `demo_limit_per_hour = 45` (fixture)'],
      { 'services/demoService.ts': "readIntConfig('demo_limit_per_hour', 30);\n" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/documented 45 vs seeded 30/);
  });
});
