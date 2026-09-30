/**
 * The harness self-check: a harness reference that points nowhere fails the build.
 *
 * Two kinds of dangling pointer are pinned here. A rule, skill, hook or agent path
 * cited from a nested project-instructions file or from the Claude Code guide, which load or get
 * read like any other harness prose, so a moved skill file left cited there rots
 * silently. And a rule's `paths:` glob that matches no file, which means the rule
 * never attaches anywhere. A glob under a gitignored companion checkout is exempt:
 * that tree is never tracked, so matching nothing is its normal state.
 *
 * Each case builds a throwaway repository holding the real gate script, an empty
 * settings file and one rule whose glob matches a real file, which passes every
 * check; the case then adds the one defect it is about.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE_REL = path.join('scripts', 'ci', 'assert_claude_harness.sh');

const scratch = createScratchDir('harness-gate-references');

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface GateRun {
  status: number | null;
  out: string;
}

function rule(globs: string[]): string {
  return `---\npaths:\n${globs.map((g) => `  - "${g}"`).join('\n')}\n---\n\n# A rule\n`;
}

function runGate(label: string, extra: Record<string, string>): GateRun {
  const root = path.join(scratch, label);
  const files: Record<string, string> = {
    'CLAUDE.md': '# Root\n\nSee `.claude/rules/layer.md`.\n',
    'PROJECT_SUMMARY_CONCISE.md': '# Summary\n',
    '.claude/settings.json': '{}\n',
    '.claude/rules/layer.md': rule(['src/**']),
    'src/app.ts': 'export {};\n',
    'docs/CLAUDE_CODE_GUIDE.md': '# Guide\n',
    ...extra,
  };
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  mkdirSync(path.join(root, 'scripts', 'ci'), { recursive: true });
  copyFileSync(path.join(REPO_ROOT, GATE_REL), path.join(root, GATE_REL));

  const init = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
  expect(init.status).toBe(0);

  const r = spawnSync('bash', [path.join(root, GATE_REL), '--skip-hook-fixtures'], {
    cwd: root,
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('the harness gate: the baseline fixture', () => {
  it('passes a tree whose references resolve and whose rule glob matches a file', () => {
    const r = runGate('baseline', {});
    expect(r.out, 'the baseline must be green so each defect case isolates one failure').toContain(
      '[harness] pass',
    );
    expect(r.status).toBe(0);
  });
});

describe('the harness gate: dangling references outside the root harness files', () => {
  it('fails a nested project-instructions file citing a skill file that does not exist', () => {
    const r = runGate('nested-claude', {
      'tests/CLAUDE.md': '# Tests\n\nClassify per `.claude/skills/gone/SKILL.md`.\n',
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('.claude/skills/gone/SKILL.md');
  });

  it('fails the Claude Code guide citing a rule that does not exist', () => {
    const r = runGate('guide', {
      'docs/CLAUDE_CODE_GUIDE.md': '# Guide\n\nThe rule is `.claude/rules/missing.md`.\n',
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('.claude/rules/missing.md');
  });
});

describe('the harness gate: rule globs that match nothing', () => {
  it('fails a rule whose paths glob matches no file, naming the rule and the glob', () => {
    const r = runGate('dead-glob', { '.claude/rules/stager.md': rule(['scripts/ci/stage_*.sh']) });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/\.claude\/rules\/stager\.md.*scripts\/ci\/stage_\*\.sh/);
  });

  it('passes a glob under a gitignored companion checkout, which is never tracked', () => {
    const r = runGate('ignored-companion', {
      '.gitignore': 'companion_repo\n',
      '.claude/rules/companion.md': rule(['companion_repo/**']),
    });
    expect(r.out).toContain('[harness] pass');
    expect(r.status).toBe(0);
  });
});
