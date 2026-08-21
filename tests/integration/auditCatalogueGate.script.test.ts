/**
 * scripts/ci/check_audit_catalogue.sh — the membership contract it enforces.
 *
 * Audit action names are a closed vocabulary that downstream queries, metric
 * filters and reviews match on, and the data model's catalogue calls itself the
 * authoritative inventory of them. Nothing stopped a new name reaching the main
 * branch without its catalogue entry: the shape rule beside this one accepts any
 * lowercase dotted value, so names accumulated in the code that the inventory
 * never mentioned, and only a side-by-side reading of both lists surfaced it.
 *
 * The gate runs against a throwaway repository rather than this one, so a case
 * can assert what an undocumented name does without an undocumented name having
 * to exist in src/. That is also why the rule is its own script: inside the main
 * conventions gate, a fixture tree aborts on a rule that reads the stylesheet
 * hundreds of lines before this one is reached, so the rule that most needed
 * covering was the one a test could not get to.
 *
 * The fixture catalogue is pointed at through the gate's synthetic-input
 * variable rather than placed at the real inventory's own path, because a
 * separate convention rule forbids a documentation filename from appearing
 * anywhere under tests/. Every suite run exercises the real path anyway, by
 * running the gate against this repository.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/ci/check_audit_catalogue.sh');

/** The catalogue's real delimiters, so the fixture exercises the same parse the
 *  live document goes through rather than a simplified stand-in. */
function catalogue(entries: string): string {
  return [
    '# Fixture data model',
    '',
    'Emitted values, grouped by namespace',
    '',
    entries,
    '',
    'This list is the authoritative inventory',
    '',
  ].join('\n');
}

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Stands up a throwaway repository holding only what this rule reads, runs the
 *  gate inside it, and tears it down. The script resolves its own root through
 *  git, so the fixture has to be a repository rather than a bare directory. */
const FIXTURE_CATALOGUE = 'fixture-catalogue.txt';

function inFixtureRepo(dataModel: string, sources: Record<string, string>): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-auditcat-'));
  try {
    writeFileSync(join(dir, FIXTURE_CATALOGUE), dataModel, 'utf-8');
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
      env: { ...process.env, AUDIT_CATALOGUE_DOC: FIXTURE_CATALOGUE },
      ...SPAWN_GUARD,
    });
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ONE_ENTRY = '- **`demo.*`**: `known_thing`, `other_thing`';

describe('check_audit_catalogue.sh', () => {
  it('passes a literal that the catalogue lists', () => {
    const r = inFixtureRepo(catalogue(ONE_ENTRY), {
      'services/demoService.ts': "appendAuditEntry({ actionType: 'demo.known_thing' });\n",
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/\[audit-catalogue\] pass/);
  });

  it('fails a literal the catalogue never mentions, naming file, line and value', () => {
    const r = inFixtureRepo(catalogue(ONE_ENTRY), {
      'services/demoService.ts': "appendAuditEntry({ actionType: 'demo.unlisted_thing' });\n",
    });
    expect(r.exitCode).toBe(1);
    // Naming all three is what makes the failure actionable without a hunt.
    expect(r.stderr).toContain('src/services/demoService.ts:1:');
    expect(r.stderr).toContain('demo.unlisted_thing');
    expect(r.stderr).toMatch(/add the action_type to the catalogue/);
  });

  it('fails a whole namespace the catalogue never mentions', () => {
    // The drift that motivated the rule was not one stray value but entire
    // namespaces the inventory had never heard of.
    const r = inFixtureRepo(catalogue(ONE_ENTRY), {
      'services/demoService.ts': "appendAuditEntry({ actionType: 'ghost.arrived' });\n",
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('ghost.arrived');
  });

  it('catches the constant form as well as the inline one', () => {
    const r = inFixtureRepo(catalogue(ONE_ENTRY), {
      'services/demoService.ts': "const DEMO_AUDIT_ACTION_TYPE = 'demo.unlisted_thing';\n",
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('demo.unlisted_thing');
  });

  it('reads every namespace entry, not just the first', () => {
    const r = inFixtureRepo(
      catalogue(['- **`demo.*`**: `known_thing`', '- **`second.*`**: `also_known`'].join('\n')),
      { 'services/demoService.ts': "appendAuditEntry({ actionType: 'second.also_known' });\n" },
    );
    expect(r.exitCode).toBe(0);
  });

  it('searches nested source directories, not only the top level', () => {
    const r = inFixtureRepo(catalogue(ONE_ENTRY), {
      'deeply/nested/demoService.ts': "appendAuditEntry({ actionType: 'demo.unlisted_thing' });\n",
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('src/deeply/nested/demoService.ts');
  });

  it('ignores a name assembled at its call site rather than guessing at it', () => {
    // A partial name is not a name. This mirrors the shape rule's own blind
    // spot deliberately; the catalogue records those cases in prose.
    const r = inFixtureRepo(catalogue(ONE_ENTRY), {
      'services/demoService.ts':
        "appendAuditEntry({ actionType: `demo.${resolution}` });\n",
    });
    expect(r.exitCode).toBe(0);
  });

  it('refuses rather than passing silently when the catalogue section is missing', () => {
    // A parse that finds nothing documents nothing, so every literal would be a
    // violation, or none would. Either way the honest answer is that the gate
    // could not run, not a green tick.
    const r = inFixtureRepo('# Fixture data model\n\nNo catalogue here.\n', {
      'services/demoService.ts': "appendAuditEntry({ actionType: 'demo.known_thing' });\n",
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/catalogue section not found/);
  });

  it('refuses rather than passing silently when the inventory is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'footbag-test-auditcat-'));
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src/demo.ts'), "actionType: 'demo.known_thing'\n", 'utf-8');
      spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
      const r = spawnSync('bash', [SCRIPT], {
        cwd: dir,
        encoding: 'utf-8',
        env: { ...process.env, AUDIT_CATALOGUE_DOC: FIXTURE_CATALOGUE },
        ...SPAWN_GUARD,
      });
      expect(r.status).toBe(1);
      expect(r.stderr ?? '').toMatch(/not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
