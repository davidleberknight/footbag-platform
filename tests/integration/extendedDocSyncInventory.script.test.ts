/**
 * Extended doc sync inventory: the deterministic half of the whole-repository drift
 * audit. It must enumerate every documentation section and commented source file so
 * no unit goes unread, find the mechanical drift exactly (and only that), let a
 * rerun read only what changed, and group claims so every source's statements about
 * one thing are compared together.
 *
 * Each case drives the script against a throwaway repository it builds, with the
 * canonical document paths pointed at fixture files through the script's
 * environment seam.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'extended-doc-sync-inventory.ts');
// The project's own tsx binary, never npx, so the run cannot depend on the network.
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

const SEAM = {
  EXTENDED_DOC_SYNC_STORIES_DOC: 'stories.md',
  EXTENDED_DOC_SYNC_JOBS_DOC: 'jobs.md',
  EXTENDED_DOC_SYNC_DECISIONS_DOC: 'decisions.md',
  EXTENDED_DOC_SYNC_DATA_MODEL_DOC: 'model.md',
  EXTENDED_DOC_SYNC_GLOSSARY_DOC: 'glossary.md',
  EXTENDED_DOC_SYNC_SCHEMA: 'schema.sql',
  EXTENDED_DOC_SYNC_CANONICAL: 'guide.md',
  EXTENDED_DOC_SYNC_GATES: 'scripts/ok.sh,scripts/bad.sh',
};

const GUIDE = [
  '# Guide',
  '',
  'Last updated: today.',
  '',
  'See [the model](model.md#no-such-heading) and [the job](jobs.md#sys_do_thing).',
  'Code lives in `src/gone.ts` and `src/app`; the story is V_Browse_Things, not V_Ghost_Story;',
  'the plan file is GO_LIVE_PLAN.',
  '',
  '## Second',
  '',
  'Handled per §4 for now.',
  '',
].join('\n');

let scratch = '';
let repo = '';

function write(rel: string, body: string): void {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function git(...args: string[]): void {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', ...SPAWN_GUARD });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function run(args: string[]) {
  const r = spawnSync(TSX, [SCRIPT, ...args], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, ...SEAM }, ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function inventory(name: string, ledger?: string) {
  const out = join(scratch, `${name}.json`);
  const r = run(['--inventory', '--out', out, ...(ledger ? ['--ledger', ledger] : [])]);
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(out, 'utf8'));
}

beforeAll(() => {
  scratch = createScratchDir('extended-doc-sync-inventory');
  repo = join(scratch, 'repo');
  mkdirSync(repo, { recursive: true });
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'user.name', 'Fixture');
  git('config', 'commit.gpgsign', 'false');

  write('stories.md', '# Stories\n\n### V_Browse_Things\n\nVisitors browse things.\n');
  write('jobs.md', '# Jobs\n\n### SYS_Do_Thing\n\nDoes the thing.\n');
  write('decisions.md', '# Decisions\n\n## 1.1 Things Are Rows\n\nRationale.\n');
  write('model.md', '# Model\n\n### things\n\nThe `things` table.\n');
  write('glossary.md', '**Thing:** a row.\n');
  write('schema.sql', 'CREATE TABLE things (\n  thing_name TEXT\n);\nCREATE TABLE orphans (\n  orphan_code TEXT\n);\n');
  write('guide.md', GUIDE);
  write('src/app.ts', '// Builds a thing from its row.\nexport function buildThing() { return 1; }\n');
  write('src/plain.ts', 'export const plain = 2;\n');
  write('src/long.ts', [
    '/**',
    ' * Counts things.',
    ' */',
    '',
    'export function countThings() {',
    '  const unseenBody = 1;',
    '  const alsoUnseen = 2;',
    '  // Every thing counts once.',
    '  return unseenBody + alsoUnseen;',
    '}',
    '',
  ].join('\n'));
  write('scripts/ok.sh', 'exit 0\n');
  write('scripts/bad.sh', 'echo "catalogue drift: things.removed"\nexit 1\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
});

afterAll(() => removeScratch(scratch));

describe('extended-doc-sync-inventory: enumeration', () => {
  it('makes every heading section and every commented file a unit, each in exactly one extraction batch', () => {
    // A section or commented file left out of the enumeration is never read, and the
    // audit would report the repository consistent without having looked.
    const inv = inventory('enumerate');
    const guideHeadings = inv.units.docs.filter((u: { file: string }) => u.file === 'guide.md').map((u: { heading: string }) => u.heading);
    // The document opens with its heading, so there is no preamble section to read.
    expect(guideHeadings).toEqual(['Guide', 'Second']);
    const commentFiles = inv.units.comments.map((u: { file: string }) => u.file);
    expect(commentFiles).toContain('src/app.ts');
    expect(commentFiles).not.toContain('src/plain.ts');
    const all = [...inv.units.docs, ...inv.units.comments].map((u: { id: string }) => u.id).sort();
    const batched = [...inv.extract.docBatches.flat(), ...inv.extract.commentBatches.flat()]
      .map((u: { id: string }) => u.id).sort();
    expect(batched).toEqual(all);
    // Each batched unit carries its range, because the workflow cannot read this inventory.
    const second = inv.extract.docBatches.flat().find((u: { id: string }) => u.id === 'doc:guide.md#9');
    expect(second).toMatchObject({ file: 'guide.md', start: 9, end: 12 });
    // Extraction agents read the names from a small file beside the inventory, never
    // the inventory itself, which carries every unit and hash in the repository.
    const vocab = JSON.parse(readFileSync(join(scratch, 'enumerate.vocab.json'), 'utf8'));
    expect(vocab.tables).toEqual(['things', 'orphans']);
    expect(vocab.stories).toEqual(['V_Browse_Things']);
    expect(vocab.units).toBeUndefined();
  });

  it('writes each batch as one numbered text: doc sections whole, and only comments with the code line each describes', () => {
    // An extraction agent that opens whole source files reads every line of code to
    // find a few comments, which multiplied the audit's cost; one missing a comment
    // or a section line would leave a claim unread.
    const inv = inventory('texts');
    const dir = join(scratch, 'texts.batches');
    const docText = inv.extract.docBatches.map((_: unknown, i: number) => readFileSync(join(dir, `doc-${i}.txt`), 'utf8')).join('\n');
    expect(docText).toContain('=== doc:guide.md#9 ===\n9: ## Second\n10: \n11: Handled per §4 for now.');
    const commentText = inv.extract.commentBatches
      .map((_: unknown, i: number) => readFileSync(join(dir, `comments-${i}.txt`), 'utf8')).join('\n');
    expect(commentText).toContain(
      '=== comments:src/long.ts ===\n1: /**\n2:  * Counts things.\n3:  */\n5: export function countThings() {\n' +
      '...\n8:   // Every thing counts once.\n9:   return unseenBody + alsoUnseen;',
    );
    expect(commentText).not.toContain('const unseenBody');
  });
});

describe('extended-doc-sync-inventory: mechanical checks', () => {
  it('flags each mechanical drift and leaves its valid neighbour alone', () => {
    // Each pair names a real defect a reader would follow (a dead anchor, a missing
    // file, an unknown story) beside the valid form a careless check would also flag.
    const inv = inventory('mechanical');
    const details = inv.mechanical.map((f: { check: string; detail: string }) => `${f.check}: ${f.detail}`);
    const has = (s: string): boolean => details.some((d: string) => d.includes(s));
    expect(has('broken-anchor: no heading for #no-such-heading')).toBe(true);
    expect(has('#sys_do_thing')).toBe(false);
    expect(has('missing-path: path src/gone.ts does not exist')).toBe(true);
    expect(has('path src/app ')).toBe(false);
    expect(has('unknown-story-id: V_Ghost_Story')).toBe(true);
    expect(has('V_Browse_Things')).toBe(false);
    expect(has('GO_LIVE_PLAN')).toBe(false);
    expect(has('stale-token: "Last updated:"')).toBe(true);
    expect(has('bare-locator: "per §4"')).toBe(true);
    expect(has('table orphans is never named')).toBe(true);
    expect(has('table things is never named')).toBe(false);
  });

  it('records a failing parity gate with its output and a passing one as passing', () => {
    // A failing gate dropped from the report hides drift a deterministic check had
    // already found.
    const inv = inventory('gates');
    const bad = inv.gates.find((g: { gate: string }) => g.gate === 'scripts/bad.sh');
    const ok = inv.gates.find((g: { gate: string }) => g.gate === 'scripts/ok.sh');
    expect(bad.status).toBe(1);
    expect(bad.tail).toContain('catalogue drift: things.removed');
    expect(ok.status).toBe(0);
  });
});

describe('extended-doc-sync-inventory: incremental reruns', () => {
  it('extracts nothing on an unchanged tree and reopens a changed code file and the entities it names', () => {
    // Without this a rerun pays for the whole repository again; worse, a changed code
    // file whose documents did not change would never have those documents rechecked.
    inventory('first');
    const results = join(scratch, 'results.json');
    const ledger = join(scratch, 'ledger.json');
    // The run's results carry only findings and rulings; the hashes come from its inventory.
    writeFileSync(results, JSON.stringify({ findings: [], rulings: [{ id: 'r1' }] }));
    expect(run(['--record', '--results', results, '--ledger', ledger, '--from', join(scratch, 'first.json')]).status).toBe(0);

    const unchanged = inventory('unchanged', ledger);
    expect(unchanged.extract.docBatches.flat()).toEqual([]);
    expect(unchanged.extract.commentBatches.flat()).toEqual([]);
    expect(unchanged.incremental.priorRulings).toEqual([{ id: 'r1' }]);

    const before = readFileSync(join(repo, 'src/app.ts'), 'utf8');
    try {
      write('src/app.ts', '// Builds a thing from its row and its tags.\nexport function buildThing() { return 2; }\n');
      const changed = inventory('changed', ledger);
      expect(changed.extract.commentBatches.flat().map((u: { id: string }) => u.id)).toEqual(['comments:src/app.ts']);
      expect(changed.extract.docBatches.flat()).toEqual([]);
      expect(changed.incremental.reopenEntities).toContain('export:buildThing');
    } finally {
      // Other cases read this file; leave it as the fixture built it.
      write('src/app.ts', before);
    }
  });
});

describe('extended-doc-sync-inventory: grouping claims', () => {
  it('buckets claims by entity, sends requirement buckets to the stronger model and drops a lone claim naming nothing', () => {
    // Two sources' claims about one table compared apart can never be seen to
    // disagree; a requirement compared by the weaker model is the hard direction the
    // audit most needs right.
    // Two extraction agents' files, merged from the directory as the workflow leaves them.
    const claimsDir = join(scratch, 'claims');
    const out = join(scratch, 'grouped');
    mkdirSync(claimsDir, { recursive: true });
    writeFileSync(join(claimsDir, 'doc-0.json'), JSON.stringify([
      { id: 'c1', unit: 'doc:stories.md#3', entities: ['table:things'], type: 'requirement' },
      { id: 'c4', unit: 'doc:guide.md#9', entities: [], type: 'behavior' },
    ]));
    writeFileSync(join(claimsDir, 'comments-0.json'), JSON.stringify([
      { id: 'c2', unit: 'comments:src/app.ts', entities: ['table:things'], type: 'comment' },
      { id: 'c3', unit: 'comments:src/app.ts', entities: ['export:buildThing'], type: 'comment' },
    ]));
    expect(run(['--group', '--claims', claimsDir, '--out', out]).status).toBe(0);
    const g = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    const things = g.buckets.find((b: { entity: string }) => b.entity === 'table:things');
    expect(things.claimIds).toEqual(['c1', 'c2']);
    expect(things.model).toBe('opus');
    const build = g.buckets.find((b: { entity: string }) => b.entity === 'export:buildThing');
    expect(build.model).toBe('sonnet');
    expect(g.buckets.some((b: { claimIds: string[] }) => b.claimIds.includes('c4'))).toBe(false);
    // The strong batch file carries both sources' claims about the table in full.
    const strong = JSON.parse(readFileSync(g.files.opus[0], 'utf8'));
    expect(strong[0].entity).toBe('table:things');
    expect(strong[0].claims.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2']);
    // The coherence pass sees the requirement, and only design claims.
    const coherence = JSON.parse(readFileSync(g.files.coherence[0], 'utf8'));
    expect(coherence.map((c: { id: string }) => c.id)).toEqual(['c1']);
  });
});

describe('extended-doc-sync-inventory: argument guards', () => {
  it('refuses an unknown option and a mode missing its required file', () => {
    // A silently ignored flag would write nowhere or read the wrong ledger, and the
    // audit would proceed on an inventory it never built.
    const unknown = run(['--inventory', '--nope']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("unknown option '--nope'");
    const missing = run(['--group', '--out', join(scratch, 'x.json')]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('--group needs --claims');
  });
});
