/**
 * Bug hunt inventory: the deterministic half of the bug hunt. It must hand every hunter
 * the true guard chain of every route, enumerate every hunted file so none goes unread,
 * rank by the cost of a defect without ever leaving a file out, point at the risky lines,
 * let a rerun hunt only what changed, and cut the work so every changed file lands in
 * exactly one hunter's pack.
 *
 * Each case drives the script against a throwaway repository it builds in the layout of
 * the real one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(__dirname, '../..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'bug-hunt-inventory.ts');
// The project's own tsx binary, never npx, so the run cannot depend on the network.
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

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
  const r = spawnSync(TSX, [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', ...SPAWN_GUARD });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function inventory(name: string, ledger?: string) {
  const out = join(scratch, `${name}.json`);
  const r = run(['--inventory', '--out', out, ...(ledger ? ['--ledger', ledger] : [])]);
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(out, 'utf8'));
}

type Route = {
  verb: string; path: string; middleware: string[]; handler: string; stories: string[];
  handlerFile: string | null; handlerLine: number | null;
};
type Unit = { file: string; rank: number; skill: string; changed: boolean };

beforeAll(() => {
  scratch = createScratchDir('bug-hunt-inventory');
  repo = join(scratch, 'repo');
  mkdirSync(repo, { recursive: true });
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'user.name', 'Fixture');
  git('config', 'commit.gpgsign', 'false');

  write('src/app.ts', [
    "import { publicRouter } from './routes/publicRoutes';",
    "import { adminRouter } from './routes/adminRoutes';",
    'app.use(helmet());',
    'app.use(requireOriginPin);',
    "app.use('/admin', adminRouter);",
    'app.use(lateOnly);',
    "app.use('/', publicRouter);",
    '',
  ].join('\n'));
  write('src/routes/publicRoutes.ts', [
    "publicRouter.get('/',             homeController.home);",
    "publicRouter.post('/things/:id/keep', requireMember, thingController.postKeep);",
    'publicRouter.post(',
    "  '/things/:id/drop',",
    '  requireMember,',
    '  thingController.postDrop,',
    ');',
    'publicRouter.get(THING_PATH, thingController.getThing);',
    'publicRouter.get(pathFor(), thingController.getThing);',
    '',
  ].join('\n'));
  write('src/routes/adminRoutes.ts', [
    'adminRouter.use(requireMember, requireAdmin);',
    "adminRouter.post('/things/:id/flag/confirm', adminThingController.confirm(true));",
    '',
  ].join('\n'));
  write('src/services/thingPaths.ts', "export const THING_PATH = '/things/:id';\n");
  write('src/controllers/homeController.ts', 'export const homeController = {\n  home(req, res) { res.send(1); },\n};\n');
  write('src/controllers/thingController.ts', [
    'function postKeep(req, res) { res.redirect(303, "/"); }',
    'export const thingController = {',
    '  postKeep,',
    '  postDrop(req, res) { res.redirect(303, "/"); },',
    '  getThing(req, res) { res.send(1); },',
    '};',
    '',
  ].join('\n'));
  write('src/controllers/adminThingController.ts', 'export const adminThingController = {\n  confirm(flag) { return (req, res) => res.send(flag); },\n};\n');
  write('src/services/sessionService.ts', 'export function startSession() { return 1; }\n');
  write('src/services/thingStore.ts', "export const q = 'UPDATE things SET a = ?';\n");
  write('src/views/members/profile.hbs', '<p>{{name}}</p>\n');
  // Names a browser call in a comment, outside the client-script tree that recipe reads.
  write('src/lib/plainHelper.ts', '// No innerHTML here.\nexport const two = 2;\n');
  write('src/content/aboutText.ts', "export const about = 'About.';\n");
  write('src/public/js/widget.js', 'el.innerHTML = value;\n');
  write('scripts/clean.sh', 'rm -rf "$DIR"\n');
  write('legacy_data/scripts/load_members.py', 'print(1)\n');
  write('freestyle/tools/notation.py', 'print(1)\n');
  write('tests/thing.test.ts', 'el.innerHTML = 1;\n');
  // Thirteen small files in one tree and rank band, one more than a pack holds.
  for (let i = 0; i < 13; i++) write(`src/lib/many/m${String(i).padStart(2, '0')}.ts`, `export const v${i} = ${i};\n`);
  write('tests/fixtures/crawl/routeStories.ts', [
    'export const ROUTE_STORIES = {',
    "  'POST /things/:id/keep': { stories: ['M_Keep_Thing', 'V_Browse_Things'] },",
    "  'GET /': { none: 'machine-endpoint', why: 'fixture' },",
    '};',
    '',
  ].join('\n'));
  write('docs/USER_STORIES.md', '# Stories\n\n### V_Browse_Things\n\nVisitors browse things.\n\n### M_Keep_Thing\n\nMembers keep things.\n');
  write('docs/BACKGROUND_JOBS.md', '# Jobs\n\n### SYS_Sweep_Things\n\nSweeps things.\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
});

afterAll(() => removeScratch(scratch));

describe('bug-hunt-inventory: the route matrix', () => {
  it('gives each route its whole guard chain in run order, its mounted path and its handler line', () => {
    // A hunter judging a route by its own line alone misses a guard the router or the
    // application adds, and reports a missing check that is there, or trusts one that is not.
    const inv = inventory('matrix');
    const route = (verb: string, p: string): Route => inv.routes.find((r: Route) => r.verb === verb && r.path === p);
    const keep = route('POST', '/things/:id/keep');
    expect(keep.middleware).toEqual(['helmet', 'requireOriginPin', 'lateOnly', 'requireMember']);
    expect(keep).toMatchObject({ handler: 'thingController.postKeep', handlerFile: 'src/controllers/thingController.ts', handlerLine: 1 });
    // The stories the route serves come with it, so its hunter gets those expected outcomes;
    // a route the ledger gives no story carries none.
    expect(keep.stories).toEqual(['M_Keep_Thing', 'V_Browse_Things']);
    expect(route('GET', '/').stories).toEqual([]);
    // Middleware registered after a router is mounted never runs for that router.
    const flag = route('POST', '/admin/things/:id/flag/confirm');
    expect(flag.middleware).toEqual(['helmet', 'requireOriginPin', 'requireMember', 'requireAdmin']);
    expect(flag).toMatchObject({ handler: 'adminThingController.confirm', handlerFile: 'src/controllers/adminThingController.ts', handlerLine: 2 });
    // A declaration over several lines, and a path held in a constant, are read whole.
    expect(route('POST', '/things/:id/drop')).toMatchObject({ middleware: ['helmet', 'requireOriginPin', 'lateOnly', 'requireMember'], handlerLine: 4 });
    expect(route('GET', '/things/:id')).toMatchObject({ handler: 'thingController.getThing', handlerLine: 5 });
    expect(route('GET', '/')).toMatchObject({ handlerFile: 'src/controllers/homeController.ts', handlerLine: 2 });
  });

  it('lists a route it cannot read instead of dropping it', () => {
    // A route left out of the matrix is a route no cross-cutting check ever looks at.
    const inv = inventory('unparsed');
    expect(inv.unparsedRoutes.map((u: { file: string; line: number }) => `${u.file}:${u.line}`)).toEqual(['src/routes/publicRoutes.ts:9']);
    expect(inv.routes).toHaveLength(5);
  });
});

describe('bug-hunt-inventory: units and ranks', () => {
  it('ranks every hunted file by the cost of a defect there, keeps every one, and leaves tests out', () => {
    // A file missing from the units is never hunted; a wrong rank only changes which model
    // reads it and when, so it must never be the reason a file is skipped.
    const inv = inventory('ranks');
    const rank = (f: string): number => inv.units.find((u: Unit) => u.file === f)?.rank;
    expect(rank('src/services/sessionService.ts')).toBe(5);
    expect(rank('src/services/thingStore.ts')).toBe(4);
    expect(rank('src/controllers/thingController.ts')).toBe(4);
    expect(rank('src/views/members/profile.hbs')).toBe(3);
    expect(rank('src/lib/plainHelper.ts')).toBe(2);
    expect(rank('src/content/aboutText.ts')).toBe(1);
    expect(inv.units.some((u: Unit) => u.file.startsWith('tests/'))).toBe(false);
    expect(inv.units.some((u: Unit) => u.file.startsWith('docs/'))).toBe(false);
    const skill = (f: string): string => inv.units.find((u: Unit) => u.file === f)?.skill;
    expect(skill('legacy_data/scripts/load_members.py')).toBe('pipeline');
    expect(skill('freestyle/tools/notation.py')).toBe('freestyle-bug-hunt');
    expect(skill('src/lib/plainHelper.ts')).toBe('bug-hunt');
  });

  it('runs each search recipe over its own trees only', () => {
    // A recipe hit outside the code it was written for points a hunter at noise; one missed
    // inside it hides the line worth reading.
    const inv = inventory('recipes');
    const hits = inv.recipeHits.map((h: { recipe: string; file: string }) => `${h.recipe} ${h.file}`);
    expect(hits).toContain('client-side-script src/public/js/widget.js');
    expect(hits).toContain('operational-script-hazards scripts/clean.sh');
    expect(hits.some((h: string) => h.includes('tests/thing.test.ts'))).toBe(false);
    expect(hits).not.toContain('client-side-script src/lib/plainHelper.ts');
  });
});

describe('bug-hunt-inventory: reruns', () => {
  it('hunts nothing again on an unchanged tree, then only the file and story that changed', () => {
    // Without this a rerun pays for the whole repository again, and an oracle row is
    // rewritten for a story nobody touched.
    const first = join(scratch, 'first.json');
    expect(run(['--inventory', '--out', first]).status).toBe(0);
    const ledger = join(scratch, 'ledger.json');
    expect(run(['--record', '--ledger', ledger, '--from', first]).status).toBe(0);
    const unchanged = inventory('unchanged', ledger);
    expect(unchanged.units.filter((u: Unit) => u.changed)).toEqual([]);
    expect(unchanged.stories.filter((s: { changed: boolean }) => s.changed)).toEqual([]);

    const story = readFileSync(join(repo, 'docs/USER_STORIES.md'), 'utf8');
    const helper = readFileSync(join(repo, 'src/lib/plainHelper.ts'), 'utf8');
    try {
      write('docs/USER_STORIES.md', story.replace('Members keep things.', 'Members keep two things.'));
      write('src/lib/plainHelper.ts', '// No innerHTML here.\nexport const two = 3;\n');
      const changed = inventory('changed', ledger);
      expect(changed.units.filter((u: Unit) => u.changed).map((u: Unit) => u.file)).toEqual(['src/lib/plainHelper.ts']);
      expect(changed.stories.filter((s: { changed: boolean }) => s.changed).map((s: { id: string }) => s.id)).toEqual(['M_Keep_Thing']);
    } finally {
      // Other cases read these files; leave them as the fixture built them.
      write('docs/USER_STORIES.md', story);
      write('src/lib/plainHelper.ts', helper);
    }
  });

  it('records only the files a partial run read, and no story, and refuses a file it does not hold', () => {
    // A partial run that recorded everything would mark the unread rest hunted, and its
    // defects would never be looked for.
    const from = join(scratch, 'partial.json');
    expect(run(['--inventory', '--out', from]).status).toBe(0);
    const units = join(scratch, 'partial-units.json');
    const ledger = join(scratch, 'partial-ledger.json');
    writeFileSync(units, JSON.stringify(['src/lib/plainHelper.ts']));
    expect(run(['--record', '--ledger', ledger, '--from', from, '--units', units]).status).toBe(0);
    const l = JSON.parse(readFileSync(ledger, 'utf8'));
    expect(Object.keys(l.files)).toEqual(['src/lib/plainHelper.ts']);
    expect(l.stories).toEqual({});
    writeFileSync(units, JSON.stringify(['src/ghost.ts']));
    const ghost = run(['--record', '--ledger', join(scratch, 'g.json'), '--from', from, '--units', units]);
    expect(ghost.status).toBe(2);
    expect(ghost.stderr).toContain('units not in the inventory: src/ghost.ts');
  });
});

describe('bug-hunt-inventory: packs', () => {
  it('puts every changed file in exactly one pack, splits a full one, and gives each class the whole matrix', () => {
    // A file in no pack is never hunted and a file in two is hunted and reported twice; a
    // class pack missing routes checks a guard on only part of the site.
    const inv = inventory('packing');
    const out = join(scratch, 'packs');
    const r = run(['--pack', '--inventory', join(scratch, 'packing.json'), '--out', out]);
    expect(r.status, r.stderr).toBe(0);
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    const unitPacks = summary.packs.filter((p: { kind: string }) => p.kind === 'units')
      .map((p: { file: string }) => JSON.parse(readFileSync(p.file, 'utf8')));
    const packed = unitPacks.flatMap((p: { units: Unit[] }) => p.units.map((u) => u.file)).sort();
    expect(packed).toEqual(inv.units.map((u: Unit) => u.file).sort());
    const many = unitPacks.filter((p: { units: Unit[] }) => p.units.some((u) => u.file.startsWith('src/lib/many/')));
    expect(many.map((p: { units: Unit[] }) => p.units.length).sort((a: number, b: number) => b - a)).toEqual([12, 2]);
    // A pack carries the routes its files handle, so its hunter starts from the guard chain.
    const thing = unitPacks.find((p: { units: Unit[] }) => p.units.some((u) => u.file === 'src/controllers/thingController.ts'));
    expect(thing.routes.map((x: Route) => x.handler).sort()).toEqual([
      'adminThingController.confirm', 'thingController.getThing', 'thingController.postDrop', 'thingController.postKeep',
    ]);
    const csrf = JSON.parse(readFileSync(summary.packs.find((p: { file: string }) => p.file.endsWith('class-csrf.json')).file, 'utf8'));
    expect(csrf.routes).toHaveLength(inv.routes.length);
    expect(csrf.unparsedRoutes).toHaveLength(1);
  });
});

describe('bug-hunt-inventory: argument guards', () => {
  it('refuses an unknown option, a mode missing its required file, and a record with no inventory', () => {
    // A silently ignored flag would write nowhere or record against nothing, and the hunt
    // would proceed on an inventory it never built.
    const unknown = run(['--inventory', '--nope']);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("unknown option '--nope'");
    const missing = run(['--pack', '--out', join(scratch, 'x')]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('--pack needs --inventory');
    const bare = run(['--record', '--ledger', join(scratch, 'y.json')]);
    expect(bare.status).toBe(2);
    expect(bare.stderr).toContain('--record needs --from');
  });
});
