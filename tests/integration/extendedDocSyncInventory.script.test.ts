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
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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
  // Both entry forms the real glossary uses.
  write('glossary.md', '**Thing:** a row.\n**Gizmo**: a part.\n');
  write('schema.sql', 'CREATE TABLE things (\n  thing_name TEXT\n);\nCREATE TABLE orphans (\n  orphan_code TEXT\n);\n');
  // One quantity restated with two values, one restated consistently, and the forms a
  // careless check would misread: a range, and an amount in another clause.
  write('costs-a.md', '# Costs A\n\nA Thing instance ($5/month).\nA Thing in bulk costs $6-9.\n');
  write('costs-b.md', '# Costs B\n\nEach Thing ($7/month) and a Gizmo for $3/month.\nA Thing, and separately $8/month for hosting.\n');
  write('costs-c.md', '# Costs C\n\n- Gizmo: $3.00\n');
  write('src/read.ts', "export const q = 'SELECT thing_name FROM things';\n");
  write('src/ops.ts', '// Recovery steps are in AWS_OPERATIONS.md.\nexport const ops = 1;\n');
  write('notes.md', '# Notes\n\nRotation is in AWS_OPERATIONS.md (private GitHub repo).\n');
  write('tests/orphan.test.ts', "// Reads orphan_code only to check the fixture.\nexport const t = 'orphan_code';\n");
  write('src/services/thingService.ts', [
    '/**',
    ' * Owns things: creates and lists them.',
    ' */',
    'export function listThings() { return []; }',
    '',
  ].join('\n'));
  // The private checkout lives outside this repository and is reached through a link
  // this repository ignores, as the real one is.
  const privy = join(scratch, 'private');
  mkdirSync(privy, { recursive: true });
  const pgit = (...args: string[]): void => {
    const r = spawnSync('git', args, { cwd: privy, encoding: 'utf8', ...SPAWN_GUARD });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  };
  pgit('init', '-q');
  // The operations document the audit reads, naming itself bare as the real one does.
  // Its section locators in the forms a private document may not use, beside their titled forms.
  writeFileSync(join(privy, 'AWS_OPERATIONS.md'), [
    '# Operations',
    '',
    'The Thing ($9/month). See AWS_OPERATIONS.md below.',
    'Journal logs (§6.5 covers the common commands).',
    'Journal logs (§6.6 Reading the journal).',
    'Apply the §4.7 update first.',
    'Recover the host using §4.8 first.',
    '',
  ].join('\n'));
  writeFileSync(join(privy, 'WALK.md'), '# Walk position\n');
  writeFileSync(join(privy, '.gitignore'), 'WALK.md\n');
  // A tracked plan and archived history: work records, not descriptions of the system.
  writeFileSync(join(privy, 'PLAN.md'), '# Plan\n\nThe Thing ($12/month).\n');
  mkdirSync(join(privy, 'archive'), { recursive: true });
  writeFileSync(join(privy, 'archive', 'OLD.md'), '# Old plan\n\nThe Thing ($11/month).\n');
  pgit('add', 'AWS_OPERATIONS.md', 'PLAN.md', '.gitignore', 'archive/OLD.md');
  pgit('-c', 'user.email=f@example.com', '-c', 'user.name=F', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'p');
  symlinkSync(privy, join(repo, 'privy'));
  write('.gitignore', 'privy\n');
  write('guide.md', GUIDE);
  // Section locators in the parenthetical and inline forms, each beside its titled form.
  write('locators.md', [
    '# Locators',
    '',
    'Journal logs (§6.5 covers the common commands).',
    'Journal logs (§6.6 Reading the journal).',
    'Apply the §4.7 update first.',
    'Apply the §4.8 `restart` step first.',
    '',
  ].join('\n'));
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
    // A public document may keep a bracketed or "the §N" number beside a full sentence.
    expect(has('"(§6.5"')).toBe(false);
    expect(has('"the §4.7"')).toBe(false);
    expect(has('table orphans is never named')).toBe(true);
    expect(has('table things is never named')).toBe(false);
  });

  it('flags a quantity restated with two values, and only the values that belong to it', () => {
    // A price or retention period copied into several documents drifts when one copy is
    // updated, and a reader of the stale copy plans with the wrong number; a range, or an
    // amount in another clause, attributed to the term would raise a mismatch that is not one.
    const inv = inventory('quantities');
    expect(inv.vocabulary.glossary).toEqual(['Thing', 'Gizmo']);
    const q = inv.mechanical.filter((f: { check: string }) => f.check === 'quantity-mismatch');
    expect(q.map((f: { detail: string }) => f.detail)).toEqual([
      'Thing (money) is stated as 5 at costs-a.md:3; 7 at costs-b.md:3',
    ]);
  });

  it('flags a private ops document named without the word private, and leaves a marked mention alone', () => {
    // A private runbook named bare reads as a file in this repository, and a reader goes
    // looking for a runbook that is not here.
    const inv = inventory('private-marks');
    const hits = inv.mechanical.filter((f: { check: string }) => f.check === 'unmarked-private-doc')
      .map((f: { file: string; line: number }) => `${f.file}:${f.line}`);
    expect(hits).toEqual(['src/ops.ts:1']);
  });

  it('flags a schema column no code outside the schema and tests names, and leaves a column code reads', () => {
    // A column nothing reads leaves its data-model entry describing nothing; a test naming
    // it is not use, or a dead column would pass because its own test mentions it.
    const inv = inventory('columns');
    const unread = inv.mechanical.filter((f: { check: string }) => f.check === 'column-unread')
      .map((f: { detail: string }) => f.detail);
    expect(unread).toEqual(['column orphan_code is named by no code outside the schema and tests']);
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

describe('extended-doc-sync-inventory: private documents', () => {
  it('makes the private checkout\'s operations documents units only when asked, nothing else there, and refuses a link that is not a checkout', () => {
    // An operations document in the private checkout describes this code and drifts from
    // it; left out, it is never compared. Its plans, working files and archive record work,
    // not the system, and would bury the real findings; a missing link reported as
    // consistent would hide that nothing was read.
    const without = inventory('no-private');
    expect(without.units.docs.some((u: { file: string }) => u.file.startsWith('privy/'))).toBe(false);
    const out = join(scratch, 'with-private.json');
    const r = run(['--inventory', '--out', out, '--private-root', 'privy']);
    expect(r.status, r.stderr).toBe(0);
    const inv = JSON.parse(readFileSync(out, 'utf8'));
    const files = [...new Set(inv.units.docs.map((u: { file: string }) => u.file))]
      .filter((f) => (f as string).startsWith('privy/'));
    expect(files).toEqual(['privy/AWS_OPERATIONS.md']);
    expect(inv.files['privy/AWS_OPERATIONS.md']).toMatch(/^[0-9a-f]{64}$/);
    // Its quantities are compared with the public documents', and the file itself, which
    // is the private document, is not asked to call itself private.
    const q = inv.mechanical.find((f: { check: string }) => f.check === 'quantity-mismatch');
    expect(q.detail).toContain('9 at privy/AWS_OPERATIONS.md:3');
    expect(q.detail).not.toContain('12 at');
    expect(q.detail).not.toContain('11 at');
    expect(inv.mechanical.some((f: { check: string; file: string }) => f.check === 'unmarked-private-doc' && f.file.startsWith('privy/')))
      .toBe(false);
    // A private document cites sections by title only, so any section number with no title
    // is flagged there, in whatever words it sits, and the titled form beside it is not.
    const locators = inv.mechanical.filter((f: { check: string; file: string }) => f.check === 'bare-locator' && f.file.startsWith('privy/'))
      .map((f: { detail: string }) => f.detail);
    expect(locators).toEqual([
      '"§6.5" has no title beside it', '"§4.7" has no title beside it', '"§4.8" has no title beside it',
    ]);

    const refused = run(['--inventory', '--out', join(scratch, 'x.json'), '--private-root', 'nope']);
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('--private-root nope is not a git checkout');
  });
});

describe('extended-doc-sync-inventory: recording part of a run', () => {
  it('marks only the files of the units a run read, so the rest are read next time', () => {
    // A walk that read one part of the repository and recorded every file would mark the
    // unread part checked, and its drift would never be looked at.
    inventory('partial');
    const results = join(scratch, 'partial-results.json');
    const units = join(scratch, 'partial-units.json');
    const ledger = join(scratch, 'partial-ledger.json');
    writeFileSync(results, JSON.stringify({ findings: [], rulings: [] }));
    writeFileSync(units, JSON.stringify(['comments:src/app.ts']));
    const r = run(['--record', '--results', results, '--ledger', ledger, '--from', join(scratch, 'partial.json'), '--units', units]);
    expect(r.status, r.stderr).toBe(0);
    expect(Object.keys(JSON.parse(readFileSync(ledger, 'utf8')).files)).toEqual(['src/app.ts']);
    const next = inventory('after-partial', ledger);
    const ids = [...next.extract.docBatches.flat(), ...next.extract.commentBatches.flat()].map((u: { id: string }) => u.id);
    expect(ids).not.toContain('comments:src/app.ts');
    expect(ids).toContain('comments:src/long.ts');
  });

  it('records a partly read document by section, so its unread sections and any edited one are read next time', () => {
    // Marking a whole document checked after one section was read would leave every other
    // section's drift unread for good; keying the record to line numbers would lose it the
    // moment an earlier edit shifted them.
    const from = join(scratch, 'sections.json');
    const first = run(['--inventory', '--out', from]);
    expect(first.status, first.stderr).toBe(0);
    const docIds = (file: string): string[] =>
      JSON.parse(readFileSync(from, 'utf8')).units.docs.filter((u: { file: string }) => u.file === file).map((u: { id: string }) => u.id);
    const [guideFirst, guideSecond] = docIds('guide.md');
    expect(guideSecond, 'the fixture guide has two sections').toBeDefined();
    const results = join(scratch, 'sections-results.json');
    const units = join(scratch, 'sections-units.json');
    const ledger = join(scratch, 'sections-ledger.json');
    writeFileSync(results, JSON.stringify({ findings: [], rulings: [] }));
    // One section of the guide, and every section of the stories document.
    writeFileSync(units, JSON.stringify([guideFirst, ...docIds('stories.md')]));
    const rec = run(['--record', '--results', results, '--ledger', ledger, '--from', from, '--units', units]);
    expect(rec.status, rec.stderr).toBe(0);
    expect(Object.keys(JSON.parse(readFileSync(ledger, 'utf8')).files).sort()).toEqual(['stories.md']);

    const extracted = (name: string): string[] => {
      const inv = inventory(name, ledger);
      return inv.extract.docBatches.flat().map((u: { id: string }) => u.id);
    };
    const after = extracted('after-sections');
    expect(after).toContain(guideSecond);
    expect(after).not.toContain(guideFirst);
    expect(after.filter((id) => id.startsWith('doc:stories.md'))).toEqual([]);

    const before = readFileSync(join(repo, 'guide.md'), 'utf8');
    try {
      // An edit to the unread section leaves the recorded one recorded.
      write('guide.md', `${before}More on the second section.\n`);
      expect(extracted('second-edited')).not.toContain(guideFirst);
      // An edit inside the recorded section reopens it.
      write('guide.md', before.replace('Last updated: today.', 'Last updated: yesterday.'));
      expect(extracted('first-edited')).toContain(guideFirst);
    } finally {
      // Other cases read this file; leave it as the fixture built it.
      write('guide.md', before);
    }
  });

  it('extracts only the named units, with batch texts numbered for that subset, and refuses an unknown one', () => {
    // A domain walk handed whole batches pays for every unrelated unit packed beside its
    // own, and a subset of batches handed to the workflow would be read under the wrong
    // batch numbers.
    const all = inventory('named-all');
    const docId = all.units.docs.find((u: { file: string }) => u.file === 'guide.md').id;
    const units = join(scratch, 'named-units.json');
    writeFileSync(units, JSON.stringify([docId, 'comments:src/app.ts']));
    const out = join(scratch, 'named.json');
    const r = run(['--inventory', '--out', out, '--units', units]);
    expect(r.status, r.stderr).toBe(0);
    const inv = JSON.parse(readFileSync(out, 'utf8'));
    expect(inv.extract.docBatches.flat().map((u: { id: string }) => u.id)).toEqual([docId]);
    expect(inv.extract.commentBatches.flat().map((u: { id: string }) => u.id)).toEqual(['comments:src/app.ts']);
    expect(readFileSync(join(scratch, 'named.batches', 'doc-0.txt'), 'utf8')).toContain('# Guide');
    // The full unit list still describes the whole repository, so a later record can resolve any id.
    expect(inv.units.docs.length).toBe(all.units.docs.length);

    const ghost = join(scratch, 'named-ghost.json');
    writeFileSync(ghost, JSON.stringify(['comments:src/ghost.ts']));
    const bad = run(['--inventory', '--out', join(scratch, 'named-bad.json'), '--units', ghost]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('units not in the inventory: comments:src/ghost.ts');
  });

  it('refuses a unit the inventory does not hold, and unit ids without the inventory', () => {
    // A mistyped id would record nothing for it while the run believed it was recorded.
    inventory('partial-refusals');
    const results = join(scratch, 'refusal-results.json');
    const units = join(scratch, 'bad-units.json');
    writeFileSync(results, JSON.stringify({ findings: [], rulings: [] }));
    writeFileSync(units, JSON.stringify(['comments:src/ghost.ts']));
    const ghost = run(['--record', '--results', results, '--ledger', join(scratch, 'g.json'), '--from', join(scratch, 'partial-refusals.json'), '--units', units]);
    expect(ghost.status).toBe(2);
    expect(ghost.stderr).toContain('units not in the inventory: comments:src/ghost.ts');
    const bare = run(['--record', '--results', results, '--ledger', join(scratch, 'g.json'), '--units', units]);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toContain('--units needs --from');
  });
});

describe('extended-doc-sync-inventory: the domain map', () => {
  // Two domains: one placing a guide section and a source file, and one placing a directory,
  // the same guide section again, and a document that does not exist.
  const DOMAINS = [
    { id: 'guides', title: 'Guides', scope: [{ doc: 'guide.md', sections: ['Second'] }, { dir: 'src/', files: ['app.ts'] }] },
    { id: 'code', title: 'Code', scope: [{ dir: 'src/services/' }, { doc: 'guide.md', sections: ['Second'] }, { doc: 'gone.md', whole: true }] },
  ];

  function mapLedger(name: string, extra: object = {}): string {
    const p = join(scratch, `${name}-ledger.json`);
    writeFileSync(p, JSON.stringify({ files: {}, sections: {}, findings: [], rulings: [], domains: DOMAINS, askOrder: ['guides', 'code'], ...extra }));
    return p;
  }

  it('extracts only one domain\'s units and reports units the map misplaces, beside the ones it places', () => {
    // A domain walk handed every unit pays for the whole repository; a unit no domain
    // names is never walked, one two domains name is asked twice, and an entry naming a
    // renamed section silently drops it.
    const ledger = mapLedger('domain-run');
    const out = join(scratch, 'domain-run.json');
    const r = run(['--inventory', '--out', out, '--ledger', ledger, '--domain', 'guides']);
    expect(r.status, r.stderr).toBe(0);
    const inv = JSON.parse(readFileSync(out, 'utf8'));
    const second = inv.units.docs.find((u: { file: string; heading: string }) => u.file === 'guide.md' && u.heading === 'Second').id;
    expect(inv.extract.docBatches.flat().map((u: { id: string }) => u.id)).toEqual([second]);
    expect(inv.extract.commentBatches.flat().map((u: { id: string }) => u.id)).toEqual(['comments:src/app.ts']);

    const map = (check: string): string[] => inv.mechanical.filter((f: { check: string }) => f.check === check)
      .map((f: { detail: string }) => f.detail);
    expect(map('domain-overlap')).toEqual([`${second} is in domains guides and code`]);
    expect(map('domain-stale-scope')).toEqual(['domain code names gone.md (whole document), which holds no unit']);
    const unclaimed = map('domain-unclaimed');
    expect(unclaimed.some((d) => d.startsWith('comments:src/long.ts '))).toBe(true);
    expect(unclaimed.some((d) => d.startsWith('comments:src/services/thingService.ts '))).toBe(false);
    expect(unclaimed.some((d) => d.startsWith('comments:src/app.ts '))).toBe(false);
  });

  it('records one domain, keeps the map and the notes not yet ruled, and reports the walk position from it', () => {
    // A record that dropped the map would lose the walk's partition on its first run; a
    // carried note never cleared would be asked again after its ruling; a position kept by
    // hand drifts from what the ledger actually holds.
    const ledger = mapLedger('domain-record', {
      carried: [
        { id: 'note-ruled', domain: 'guides', note: 'settled this run' },
        { id: 'note-open', domain: 'code', note: 'the code domain has a carried question' },
      ],
    });
    const from = join(scratch, 'domain-record.json');
    expect(run(['--inventory', '--out', from, '--ledger', ledger]).status).toBe(0);
    const results = join(scratch, 'domain-record-results.json');
    writeFileSync(results, JSON.stringify({
      findings: [{ check: 'bare-locator', file: 'guide.md', line: 11, detail: '"per §4" has no title beside it' }],
      rulings: [{ id: 'note-ruled', ruling: 'not drift' }],
    }));
    const rec = run(['--record', '--results', results, '--ledger', ledger, '--from', from, '--domain', 'guides']);
    expect(rec.status, rec.stderr).toBe(0);
    const after = JSON.parse(readFileSync(ledger, 'utf8'));
    expect(after.domains).toEqual(DOMAINS);
    expect(after.askOrder).toEqual(['guides', 'code']);
    expect(after.carried.map((c: { id: string }) => c.id)).toEqual(['note-open']);
    // Only the guides domain's commented file is marked whole; its guide section is
    // recorded alone, because the guide's other section was not read.
    expect(Object.keys(after.files)).toEqual(['src/app.ts']);
    expect(after.sections['guide.md']).toHaveLength(1);

    const st = run(['--status', '--ledger', ledger]);
    expect(st.status, st.stderr).toBe(0);
    expect(st.stdout).toContain('walked guides: 2/2 units recorded');
    expect(st.stdout).toMatch(/open {3}code: 1\/\d+ units recorded/);
    expect(st.stdout).toContain('next domain: code');
    expect(st.stdout).toContain('carried note-open: the code domain has a carried question');
    expect(st.stdout).not.toContain('note-ruled');
    // A fresh session sees the open findings waiting to be asked before the next domain.
    expect(st.stdout).toContain('open findings: bare-locator: 1');
  });

  it('refuses a domain the map lacks, two unit selections at once, and a domain run without its ledger', () => {
    // An unknown domain would extract nothing and record nothing while the run believed it
    // had walked it; two selections leave unclear which one was recorded.
    const ledger = mapLedger('domain-refusals');
    const out = join(scratch, 'domain-refusals.json');
    const ghost = run(['--inventory', '--out', out, '--ledger', ledger, '--domain', 'ghost']);
    expect(ghost.status).toBe(2);
    expect(ghost.stderr).toContain("no domain 'ghost' in the ledger's domain map");
    const units = join(scratch, 'domain-refusals-units.json');
    writeFileSync(units, JSON.stringify(['comments:src/app.ts']));
    const both = run(['--inventory', '--out', out, '--ledger', ledger, '--domain', 'guides', '--units', units]);
    expect(both.status).toBe(2);
    expect(both.stderr).toContain('--units and --domain cannot be given together');
    const noLedger = run(['--inventory', '--out', out, '--domain', 'guides']);
    expect(noLedger.status).toBe(2);
    expect(noLedger.stderr).toContain('--domain needs --ledger');
    const valid = run(['--inventory', '--out', out, '--ledger', ledger, '--domain', 'code']);
    expect(valid.status, valid.stderr).toBe(0);
    const noMap = join(scratch, 'domain-nomap-ledger.json');
    writeFileSync(noMap, JSON.stringify({ files: {} }));
    const st = run(['--status', '--ledger', noMap]);
    expect(st.status).toBe(2);
    expect(st.stderr).toContain('the ledger holds no domain map');
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
      // A lone claim about a story has no code to be compared with.
      { id: 'c5', unit: 'doc:guide.md#9', entities: ['story:V_Browse_Things'], type: 'behavior' },
    ]));
    expect(run(['--group', '--claims', claimsDir, '--out', out]).status).toBe(0);
    const g = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    const things = g.buckets.find((b: { entity: string }) => b.entity === 'table:things');
    expect(things.claimIds).toEqual(['c1', 'c2']);
    expect(things.model).toBe('opus');
    const build = g.buckets.find((b: { entity: string }) => b.entity === 'export:buildThing');
    expect(build.model).toBe('sonnet');
    expect(g.buckets.some((b: { claimIds: string[] }) => b.claimIds.includes('c4'))).toBe(false);
    // A comparison of a lone claim with nothing beside it costs a model read and can find
    // nothing; the lone claim about an export is kept, because its code is read beside it.
    expect(g.buckets.some((b: { claimIds: string[] }) => b.claimIds.includes('c5'))).toBe(false);
    // The strong batch file carries both sources' claims about the table in full.
    const strong = JSON.parse(readFileSync(g.files.opus[0], 'utf8'));
    expect(strong[0].entity).toBe('table:things');
    expect(strong[0].claims.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2']);
    // The coherence pass sees the requirement, and only design claims.
    const coherence = JSON.parse(readFileSync(g.files.coherence[0], 'utf8'));
    expect(coherence.map((c: { id: string }) => c.id)).toEqual(['c1']);
  });
});

describe('extended-doc-sync-inventory: large buckets and evidence', () => {
  // Over the comparison budget of 60 claims a bucket is too large for one careful read.
  const BUDGET = 60;

  function groupClaims(name: string, claims: object[]) {
    const claimsFile = join(scratch, `${name}-claims.json`);
    const out = join(scratch, name);
    writeFileSync(claimsFile, JSON.stringify(claims));
    const r = run(['--group', '--claims', claimsFile, '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    const batchFiles = [...summary.files.opus, ...summary.files.sonnet] as string[];
    const entries = batchFiles.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
    return { summary, entries };
  }

  it('splits an oversized bucket by the other thing its claims name, losing and doubling no claim', () => {
    // One agent handed hundreds of claims compares them carelessly or runs out of room;
    // a split that dropped or repeated a claim would leave it unread or asked twice.
    const withColumn = Array.from({ length: 40 }, (_, i) => ({
      id: `w${String(i).padStart(2, '0')}`, unit: 'doc:model.md#3', entities: ['table:things', 'column:thing_name'], type: 'behavior',
    }));
    const tableOnly = Array.from({ length: 30 }, (_, i) => ({
      id: `t${String(i).padStart(2, '0')}`, unit: 'doc:model.md#3', entities: ['table:things'], type: 'behavior',
    }));
    const { summary } = groupClaims('split', [...withColumn, ...tableOnly]);
    const parts = summary.buckets.filter((b: { entity: string }) => b.entity.startsWith('table:things'));
    expect(parts.map((b: { entity: string }) => b.entity).sort()).toEqual([
      'table:things > column:thing_name', 'table:things > part 1',
    ]);
    for (const p of parts) expect(p.claimIds.length).toBeLessThanOrEqual(BUDGET);
    const placed = parts.flatMap((b: { claimIds: string[] }) => b.claimIds).sort();
    expect(placed).toEqual([...withColumn, ...tableOnly].map((c) => c.id).sort());
    // A bucket within the budget is left whole.
    const column = summary.buckets.find((b: { entity: string }) => b.entity === 'column:thing_name');
    expect(column.claimIds).toHaveLength(40);
  });

  it('cuts an oversized per-file bucket in line order, so neighbouring claims are compared together', () => {
    // Cutting by id order would put a claim beside unrelated ones from the far end of
    // the file and part it from the lines around it.
    const claims = Array.from({ length: 65 }, (_, i) => ({
      id: `comments:src/long.ts@${65 - i}`, unit: 'comments:src/long.ts', line: 65 - i, entities: [], type: 'comment',
    }));
    const { summary } = groupClaims('split-unit', claims);
    const part1 = summary.buckets.find((b: { entity: string }) => b.entity === 'unit:comments:src/long.ts > part 1');
    const part2 = summary.buckets.find((b: { entity: string }) => b.entity === 'unit:comments:src/long.ts > part 2');
    const lines = (b: { claimIds: string[] }): number[] => b.claimIds.map((id) => Number(id.split('@')[1])).sort((a, c) => a - c);
    expect(lines(part1)).toEqual(Array.from({ length: BUDGET }, (_, i) => i + 1));
    expect(lines(part2)).toEqual([61, 62, 63, 64, 65]);
  });

  it('hands each bucket the code its entity names, and none to a kind with no code home', () => {
    // Without the definition beside the claims, each comparison agent searches the
    // repository itself, which was most of the audit's cost; evidence from a test file
    // would show a fixture, not the application.
    const pair = (entity: string, n: number) => [0, 1].map((i) => ({
      id: `${entity}-${n}-${i}`, unit: 'doc:model.md#3', entities: [entity], type: 'behavior',
    }));
    const { entries } = groupClaims('evidence', [
      ...pair('table:things', 1), ...pair('column:orphan_code', 2), ...pair('service:thingService', 3),
      ...pair('export:buildThing', 4), ...pair('story:V_Browse_Things', 5),
    ]);
    const ev = (entity: string): string => entries.find((e: { entity: string }) => e.entity === entity)
      .evidence.map((x: { file: string; text: string }) => `${x.file}\n${x.text}`).join('\n');
    expect(ev('table:things')).toContain('1: CREATE TABLE things (\n2:   thing_name TEXT\n3: );');
    expect(ev('table:things')).not.toContain('orphans');
    expect(ev('column:orphan_code')).toContain('schema.sql\n5:   orphan_code TEXT');
    expect(ev('column:orphan_code')).not.toContain('tests/orphan.test.ts');
    expect(ev('service:thingService')).toContain(' * Owns things: creates and lists them.');
    expect(ev('service:thingService')).toContain('4: export function listThings()');
    expect(ev('export:buildThing')).toContain('src/app.ts\n2: export function buildThing()');
    expect(ev('story:V_Browse_Things')).toBe('');
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
