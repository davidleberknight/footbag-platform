/**
 * Per-change doc sync script: a code change is mapped to every document, rule
 * and comment that names what it changed, and the receipt it writes is what lets
 * the Stop gate clear only for a change that was actually checked.
 *
 * Each case drives the script against a throwaway repository it builds itself,
 * so the hits it asserts come from files the case wrote, never from this
 * checkout's own documents.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'doc-sync-diff.ts');
const HASH_HELPER = join(REPO_ROOT, 'scripts', 'lib', 'doc-sync-diff-hash.sh');
// The project's own tsx binary, never npx, so the run cannot depend on the network.
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

const SERVICE_BEFORE = [
  '/**',
  ' * Builds the widget panel from the stored widget rows.',
  ' */',
  'export function buildWidgetPanel(rows: string[]): string {',
  '  const joined = rows.join(",");',
  '  return joined;',
  '}',
  '',
].join('\n');

const SERVICE_AFTER = [
  '/**',
  ' * Builds the widget panel from the stored widget rows.',
  ' */',
  'export function renderWidgetPanel(rows: string[]): string {',
  '  const joined = rows.slice(0, Number(process.env.WIDGET_PANEL_LIMIT)).join(",");',
  '  return joined;',
  '}',
  '',
].join('\n');

let scratch = '';
let repo = '';
let privateDocs = '';

function write(rel: string, body: string): void {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function git(...args: string[]): void {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', ...SPAWN_GUARD });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function run(args: string[] = []) {
  const r = spawnSync(TSX, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', ...SPAWN_GUARD });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function hash(): string {
  const r = spawnSync('bash', [join(repo, 'scripts/lib/doc-sync-diff-hash.sh')], {
    cwd: repo, encoding: 'utf8', ...SPAWN_GUARD,
  });
  return (r.stdout ?? '').trim();
}

beforeAll(() => {
  scratch = createScratchDir('doc-sync-diff');
  repo = join(scratch, 'repo');
  privateDocs = join(scratch, 'private');
  mkdirSync(repo, { recursive: true });
  mkdirSync(privateDocs, { recursive: true });

  git('init', '-q');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'user.name', 'Fixture');
  git('config', 'commit.gpgsign', 'false');

  mkdirSync(join(repo, 'scripts/lib'), { recursive: true });
  copyFileSync(HASH_HELPER, join(repo, 'scripts/lib/doc-sync-diff-hash.sh'));
  write('src/services/widgetService.ts', SERVICE_BEFORE);
  write('src/controllers/widgetController.ts', '// Hands the request to buildWidgetPanel and renders the result.\nexport const x = 1;\n');
  write('docs/guide.md', '# Widgets\n\nThe panel comes from `buildWidgetPanel`.\n');
  write('.claude/rules/widgets.md', 'Never call buildWidgetPanel from a template.\n');
  writeFileSync(join(privateDocs, 'runbook.md'), 'Step 3: confirm buildWidgetPanel returned rows.\n');
  symlinkSync(privateDocs, join(repo, 'footbag_private_repo'));
  write('.gitignore', 'footbag_private_repo\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');

  write('src/services/widgetService.ts', SERVICE_AFTER);
});

afterAll(() => removeScratch(scratch));

describe('doc-sync-diff: mapping a change to what names it', () => {
  it('finds every document, rule, comment and private runbook still naming a renamed export', () => {
    // A rename that leaves the old name in a document is the drift a per-change
    // check exists for; a missed home means a stale instruction survives the change.
    const r = run();
    expect(r.status).toBe(0);
    const block = r.stdout.split('removed export buildWidgetPanel')[1]?.split(/\n {2}\S/)[0] ?? '';
    expect(r.stdout).toContain('removed export buildWidgetPanel (gone from code)');
    expect(block).toContain('docs/guide.md:3');
    expect(block).toContain('.claude/rules/widgets.md:1');
    expect(block).toContain('src/controllers/widgetController.ts:1 [comment]');
    expect(block).toMatch(/footbag_private_repo\/runbook\.md:1:.*\[private\]/);
  });

  it('lists a new export and a new environment variable that nothing documents', () => {
    // An added name no document mentions is undocumented surface; if it is not
    // listed, the per-change check reports a clean change that is not clean.
    const r = run();
    const silent = r.stdout.split('NO MENTION ANYWHERE')[1]?.split('COMMENTS NEAR CHANGES')[0] ?? '';
    expect(silent).toContain('added export renderWidgetPanel');
    expect(silent).toContain('added env WIDGET_PANEL_LIMIT');
    // The documented name is not reported as unmentioned: the section is not a dump.
    expect(silent).not.toContain('buildWidgetPanel');
  });

  it('lists the comment heading a function whose body alone changed', () => {
    // The hunk sits inside the body; the promise that can go stale sits above the
    // declaration, and a check reading only the hunk never sees it.
    const r = run();
    const near = r.stdout.split('COMMENTS NEAR CHANGES')[1] ?? '';
    expect(near).toContain('src/services/widgetService.ts');
    expect(near).toContain('2: * Builds the widget panel from the stored widget rows.');
  });
});

describe('doc-sync-diff: the receipt the Stop gate reads', () => {
  it('records the hash of exactly the change it examined', () => {
    // A receipt that hashes something other than what the gate recomputes would
    // either never clear the gate or clear it for an unchecked change.
    const receipt = join(scratch, 'receipt.json');
    const r = run(['--receipt', receipt]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(readFileSync(receipt, 'utf8'));
    expect(parsed.hash).toBe(hash());
    expect(parsed.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the same hash across a documentation edit and changes it for a code edit', () => {
    // Applying an approved doc edit must not make the check look stale, and a
    // further code edit must, or the gate would wave through an unchecked change.
    const files = ['docs/guide.md', '.claude/rules/widgets.md', 'src/controllers/widgetController.ts'];
    const saved = files.map((f) => readFileSync(join(repo, f), 'utf8'));
    try {
      const before = hash();
      write('docs/guide.md', '# Widgets\n\nThe panel comes from `renderWidgetPanel`.\n');
      write('.claude/rules/widgets.md', 'Never call renderWidgetPanel from a template.\n');
      expect(hash()).toBe(before);
      write('src/controllers/widgetController.ts', '// Hands the request to renderWidgetPanel.\nexport const x = 2;\n');
      expect(hash()).not.toBe(before);
    } finally {
      // The other cases read these files; leave them as the fixture built them.
      files.forEach((f, i) => write(f, saved[i]));
    }
  });
});

describe('doc-sync-diff: argument guards', () => {
  it('refuses an unknown option and a base git cannot resolve', () => {
    // A typo silently ignored would compare against the wrong base and report
    // a change as clean.
    const unknown = run(['--nope']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("unknown option '--nope'");
    const badBase = run(['--base', 'no-such-ref']);
    expect(badBase.status).toBe(2);
    expect(badBase.stderr).toContain("cannot resolve base 'no-such-ref'");
    expect(run(['--base', 'HEAD']).status).toBe(0);
  });
});
