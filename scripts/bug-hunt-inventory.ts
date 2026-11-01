/**
 * Bug hunt inventory: the deterministic half of the adversarial bug hunt.
 *
 * The hunt's cost was its hunters each rediscovering the surface for themselves: which
 * routes exist and what guards them, where the risky calls sit, which files matter most.
 * That is mechanical, so this script does it once, exactly, and hands every hunter the
 * part it needs. It also enumerates every hunted file as a unit, so coverage comes from
 * the enumeration rather than from a hunter's judgement of what to open, and keeps a
 * ledger so a rerun hunts only what changed.
 *
 * Modes:
 *   --inventory --out <file> [--ledger <file>]
 *       Enumerate every hunted code file as a unit with its risk rank, build the
 *       route-by-middleware matrix (each route's full guard chain: the application's own
 *       middleware, its router's, and its own), run the search recipes, hash every story
 *       and job section the oracle reads, and, given the previous ledger, mark the units
 *       and stories that changed. A route declaration the parser cannot read is listed,
 *       never dropped.
 *   --pack --inventory <file> --out <dir>
 *       Cut the hunt into work packs: one per cross-cutting class, carrying the whole route
 *       matrix and the recipe hits that class reads, so each class is checked once across
 *       the repository; and packs of changed units, every one in exactly one pack, each
 *       carrying its files' routes and recipe hits. Writes one file per pack and a summary.
 *   --record --ledger <file> --from <inventory file> [--units <file>]
 *       Fold the run's file and story hashes into the ledger the next run reads. Findings
 *       are not recorded here: they live in the findings file until their fix lands.
 *       `--units` (a JSON array of unit files) records only those files.
 *
 * Rank decides which model hunts a unit and in what order, never whether it is hunted.
 *
 * Read-only against the repository: it writes only the files its flags name. Refuses an
 * unknown mode or option, a missing required flag, and a unit the inventory does not hold.
 *
 * Run: npx tsx scripts/bug-hunt-inventory.ts <mode> [flags]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const STORIES_DOC = 'docs/USER_STORIES.md';
const JOBS_DOC = 'docs/BACKGROUND_JOBS.md';
const APP = 'src/app.ts';
const ROUTES_DIR = 'src/routes/';
const CONTROLLERS_DIR = 'src/controllers/';
// Every served route's stories, kept complete by the route-wiring crawl.
const ROUTE_STORIES = 'tests/fixtures/crawl/routeStories.ts';

// Trees whose code the hunt reads. Tests are the hunt's evidence, not its target.
const HUNT_TREES = /^(src|scripts|terraform|docker|ops|database|legacy_data|freestyle|\.claude\/hooks)\//;
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|hbs|css|sh|py|sql|tf|service|timer)$/;
const SKIP = /^(node_modules\/|legacy_data\/footbag_venv\/|scripts\/\.venv\/|legacy_data\/legacy_mirror\/mirror_footbag_org\/)/;
const PACK_MAX_FILES = 12;
const PACK_MAX_LINES = 2500;

// The rank rule the hunt uses: the cost of a defect in the file. Five is a surface where
// a defect reaches identity, money, privacy or an action that cannot be taken back; four a
// write path or code shaping member or migrated data; three a read path rendering member
// data; two any other application or operational code; one content and styling.
const RANK5 = /(auth|session|password|jwt|token|captcha|origin|csrf|payment|stripe|donat|reconcil|erasure|delet|export|privacy|deceas|claim|identity|bootstrap|arming|adminRole|deploy|cutover|restore|backup|credential|secret|kms|signing|email|outbox|broadcast|mail|\bses|sns)/i;
const WRITES = /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i;
const MEMBER_DATA = /(member|profile|roster|club|event|history|hof|player|legacy_data\/|pipeline|loader)/i;
const RANK1 = /^(src\/content\/|src\/public\/css\/|src\/views\/(legal|ifpa|rules|equipment|net)\/)/;

/**
 * The search recipes: accelerators that point a hunter at the lines worth reading, never
 * findings on their own. Each names the trees it reads and the classes it serves.
 */
const RECIPES: Array<{ name: string; re: RegExp; roots: RegExp; classes: string[] }> = [
  { name: 'routes-and-guards', re: /router\.(get|post|put|patch|delete)|requireAuth|requireAdmin|requireMember|requireTier1Benefits|requireOriginPin|rateLimitHit/, roots: /^src\//, classes: ['auth-gate', 'csrf', 'rate-limit'] },
  { name: 'redirects-cookies-headers', re: /res\.redirect|res\.cookie|clearCookie|setHeader\(|Cache-Control|Content-Security-Policy/, roots: /^src\//, classes: ['redirects', 'cookies', 'cache', 'headers'] },
  { name: 'sql-and-transactions', re: /db\.prepare|transaction\(|UPDATE audit_entries|DELETE FROM audit_entries|UPDATE member_tier_grants/, roots: /^src\//, classes: [] },
  { name: 'unescaped-template-output', re: /\{\{\{|<script|on[a-zA-Z]+="|style="/, roots: /^src\/views\//, classes: ['headers'] },
  { name: 'secrets-and-pii', re: /password|token|secret|api[_-]?key|metadata_json|logger\.|redact|private[_-]?key|sk_live|whsec|birth|phone/i, roots: /^(src|scripts)\//, classes: ['pii-logs'] },
  { name: 'member-joins-skipping-views', re: /FROM members\b|JOIN members\b/, roots: /^src\/db\/db\.ts$/, classes: [] },
  { name: 'outbound-shell-and-paths', re: /fetch\(|https?\.request|child_process|exec\(|spawn\(|readFile|writeFile|\.\.\//, roots: /^src\//, classes: [] },
  { name: 'runtime-reads', re: /readFileSync|readdirSync|existsSync|process\.cwd/, roots: /^src\//, classes: [] },
  { name: 'infrastructure-posture', re: /AdministratorAccess|0\.0\.0\.0\/0|prevent_destroy|SecureString|"\*"/, roots: /^terraform\//, classes: [] },
  { name: 'operational-script-hazards', re: /set -e|pipefail|trap |rm -rf|DELETE FROM|--force/, roots: /^scripts\/.*\.sh$/, classes: [] },
  { name: 'client-side-script', re: /innerHTML|insertAdjacentHTML|eval\(|localStorage|sessionStorage|fetch\(/, roots: /^src\/public\/js\//, classes: [] },
];

// The classes checked once across the whole route matrix rather than file by file, because
// each one is a property of how every route is guarded, and a file-by-file pass would re-sweep
// it partially in every pack.
const CROSS_CUTTING = ['auth-gate', 'csrf', 'rate-limit', 'anti-enumeration', 'cache', 'cookies', 'redirects', 'pii-logs', 'headers'];

interface Unit { file: string; rank: number; skill: string; lines: number; recipeHits: number; changed: boolean }
interface Route {
  verb: string; path: string; router: string; middleware: string[]; handler: string; stories: string[];
  handlerFile: string | null; handlerLine: number | null; file: string; line: number;
}
interface Hit { recipe: string; file: string; line: number; text: string }

function usage(code: number): never {
  (code === 0 ? process.stdout : process.stderr).write(
    'Usage: npx tsx scripts/bug-hunt-inventory.ts --inventory --out <file> [--ledger <file>]\n' +
    '       npx tsx scripts/bug-hunt-inventory.ts --pack --inventory <file> --out <dir>\n' +
    '       npx tsx scripts/bug-hunt-inventory.ts --record --ledger <file> --from <inventory file> [--units <file>]\n',
  );
  process.exit(code);
}

function fail(message: string): never {
  process.stderr.write(`bug-hunt-inventory: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): { mode: string; flags: Record<string, string> } {
  const modes = ['--inventory', '--pack', '--record'];
  let mode = '';
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    if (modes.includes(a) && !(a === '--inventory' && mode === 'pack')) {
      if (mode) usage(2);
      mode = a.slice(2);
    } else if (['--out', '--ledger', '--from', '--units', '--inventory'].includes(a) && argv[i + 1]) {
      flags[a.slice(2)] = argv[++i];
    } else {
      fail(`unknown option '${a}'`);
    }
  }
  if (!mode) usage(2);
  const need: Record<string, string[]> = { inventory: ['out'], pack: ['inventory', 'out'], record: ['ledger', 'from'] };
  for (const f of need[mode]) if (!flags[f]) fail(`--${mode} needs --${f}`);
  return { mode, flags };
}

function git(args: string[], root: string): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

function read(root: string, rel: string): string {
  const abs = path.join(root, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

function rankOf(file: string, text: string, handlesWrite: boolean): number {
  if (RANK1.test(file)) return 1;
  if (RANK5.test(file)) return 5;
  if (handlesWrite || WRITES.test(text) || (/^(legacy_data|freestyle)\//.test(file) && MEMBER_DATA.test(file))) return 4;
  if (/^src\/(controllers|services|views)\//.test(file) && MEMBER_DATA.test(file)) return 3;
  return 2;
}

// Which skill hunts a unit: the freestyle hunt owns trick content, the pipeline hunt runs
// under the pipeline invariant gate, everything else is this hunt's.
function skillOf(file: string): string {
  if (/^(freestyle\/|src\/content\/freestyle)/.test(file)) return 'freestyle-bug-hunt';
  if (file.startsWith('legacy_data/')) return 'pipeline';
  return 'bug-hunt';
}

/** Split a call's argument list at its top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const nameOf = (arg: string): string => arg.replace(/\(.*$/s, '').trim();

/**
 * Every route with its whole guard chain, in the order Express runs it: the application's
 * own middleware registered before the router is mounted, the router's own `use`, then the
 * route's. A declaration spanning lines is joined up to its closing `);`.
 */
function routeMatrix(root: string, files: string[]): { routes: Route[]; unparsed: Array<{ file: string; line: number; text: string }> } {
  // A path written as a named constant resolves to the constant's value.
  const constants = new Map<string, string>();
  for (const f of files.filter((x) => x.startsWith('src/') && x.endsWith('.ts'))) {
    for (const m of read(root, f).matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) constants.set(m[1], m[2]);
  }
  // The stories each route serves, so a hunter is handed the expected outcomes its routes
  // must meet; a route the ledger gives none carries an empty list.
  const storiesFor = new Map<string, string[]>();
  for (const m of read(root, ROUTE_STORIES).matchAll(/'((?:GET|POST|PUT|PATCH|DELETE) [^']+)':\s*\{\s*stories:\s*\[([^\]]*)\]/g)) {
    storiesFor.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((s) => s[1]));
  }
  const appLines = read(root, APP).split('\n');
  const mounts = new Map<string, { prefix: string; line: number }>();
  const appUses: Array<{ name: string; line: number }> = [];
  appLines.forEach((l, i) => {
    const m = /\bapp\.use\(\s*(?:'([^']*)'\s*,\s*)?([A-Za-z_$][\w$.]*)/.exec(l);
    if (!m) return;
    if (/Router$/.test(m[2])) mounts.set(m[2], { prefix: m[1] ?? '', line: i + 1 });
    else if (!m[1]) appUses.push({ name: m[2], line: i + 1 });
  });
  const routes: Route[] = [];
  const unparsed: Array<{ file: string; line: number; text: string }> = [];
  for (const file of files.filter((f) => f.startsWith(ROUTES_DIR) && f.endsWith('.ts'))) {
    const lines = read(root, file).split('\n');
    const routerUses = new Map<string, string[]>();
    for (let i = 0; i < lines.length; i++) {
      const use = /^(\w+)\.use\((.*)\);/.exec(lines[i]);
      if (use) routerUses.set(use[1], [...(routerUses.get(use[1]) ?? []), ...splitArgs(use[2]).map(nameOf)]);
      const start = /^(\w+)\.(get|post|put|patch|delete|all)\(/.exec(lines[i]);
      if (!start) continue;
      let stmt = lines[i];
      let j = i;
      while (!/\);\s*(\/\/.*)?$/.test(stmt) && j + 1 < lines.length) stmt += `\n${lines[++j]}`;
      const m = /^(\w+)\.(get|post|put|patch|delete|all)\(([\s\S]*)\);\s*(\/\/.*)?$/.exec(stmt);
      const all = m ? splitArgs(m[3]) : [];
      const first = all[0] ?? '';
      const routePath = /^'[^']+'$/.test(first) ? first.slice(1, -1) : constants.get(first);
      const args = all.slice(1);
      // A handler is a controller method, or a factory on one that takes a flag.
      const handlerArg = args[args.length - 1] ?? '';
      const handler = nameOf(handlerArg);
      if (!m || routePath === undefined || !/^\w+\.\w+$/.test(handler)) {
        unparsed.push({ file, line: i + 1, text: lines[i].trim() });
        i = j;
        continue;
      }
      const mount = mounts.get(m[1]);
      const global = appUses.filter((u) => !mount || u.line < mount.line).map((u) => u.name);
      const [ctrl, method] = handler.split('.');
      const ctrlFile = `${CONTROLLERS_DIR}${ctrl}.ts`;
      const ctrlLines = read(root, ctrlFile).split('\n');
      // A method on the controller object, or a function the object lists by name.
      const decl = new RegExp(`^(\\s+(async\\s+)?${method}\\s*\\(|(export\\s+)?(async\\s+)?function\\s+${method}\\s*\\(|(export\\s+)?const\\s+${method}\\s*=)`);
      const at = ctrlLines.findIndex((l) => decl.test(l));
      const prefix = (mount?.prefix ?? '').replace(/\/$/, '');
      const fullPath = prefix && routePath === '/' ? prefix : `${prefix}${routePath}`;
      routes.push({
        verb: m[2].toUpperCase(), path: fullPath, router: m[1],
        stories: storiesFor.get(`${m[2].toUpperCase()} ${fullPath}`) ?? [],
        middleware: [...global, ...(routerUses.get(m[1]) ?? []), ...args.slice(0, -1).map(nameOf)],
        handler, handlerFile: at >= 0 ? ctrlFile : null, handlerLine: at >= 0 ? at + 1 : null, file, line: i + 1,
      });
      i = j;
    }
  }
  return { routes, unparsed };
}

/** Each story and job section's text hash, so the oracle rewrites only the rows whose story changed. */
function storySections(root: string): Array<{ id: string; file: string; line: number; hash: string }> {
  const out: Array<{ id: string; file: string; line: number; hash: string }> = [];
  for (const file of [STORIES_DOC, JOBS_DOC]) {
    const lines = read(root, file).split('\n');
    const starts = lines.map((l, i) => ({ m: /^###\s+((?:[A-Z]+|SYS)_\w+)/.exec(l), i })).filter((s) => s.m);
    starts.forEach((s, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].i : lines.length;
      const body = lines.slice(s.i, end).join('\n').replace(/\n#{1,2}\s[\s\S]*$/, '');
      out.push({ id: s.m![1], file, line: s.i + 1, hash: sha(body) });
    });
  }
  return out;
}

function inventory(root: string, out: string, ledgerPath?: string): void {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard'], root).split('\n')
    .filter((f) => f && HUNT_TREES.test(f) && CODE_EXT.test(f) && !SKIP.test(f) && existsSync(path.join(root, f)));
  const texts = new Map(files.map((f) => [f, read(root, f)]));
  const { routes, unparsed } = routeMatrix(root, files);
  const writeHandlers = new Set(routes.filter((r) => r.verb !== 'GET' && r.handlerFile).map((r) => r.handlerFile!));
  const hits: Hit[] = [];
  for (const [file, text] of texts) {
    text.split('\n').forEach((l, i) => {
      for (const r of RECIPES) if (r.roots.test(file) && r.re.test(l)) hits.push({ recipe: r.name, file, line: i + 1, text: l.trim().slice(0, 160) });
    });
  }
  const hitCount = new Map<string, number>();
  for (const h of hits) hitCount.set(h.file, (hitCount.get(h.file) ?? 0) + 1);
  const previous = ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null;
  const prevFiles: Record<string, string> = previous?.files ?? {};
  const prevStories: Record<string, string> = previous?.stories ?? {};
  const hashes = Object.fromEntries([...texts].map(([f, t]) => [f, sha(t)]));
  const units: Unit[] = files.map((f) => ({
    file: f,
    rank: rankOf(f, texts.get(f)!, writeHandlers.has(f)),
    skill: skillOf(f),
    lines: texts.get(f)!.split('\n').length,
    recipeHits: hitCount.get(f) ?? 0,
    changed: !previous || prevFiles[f] !== hashes[f],
  })).sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file));
  const stories = storySections(root).map((s) => ({ ...s, changed: !previous || prevStories[s.id] !== s.hash }));
  const result = {
    head: git(['rev-parse', 'HEAD'], root).trim(),
    units, routes, unparsedRoutes: unparsed, recipeHits: hits, stories,
    files: hashes,
  };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  const changed = units.filter((u) => u.changed).length;
  process.stdout.write(
    `units: ${units.length} (${changed} to hunt); ranks 5-1: ${[5, 4, 3, 2, 1].map((r) => units.filter((u) => u.rank === r).length).join('/')}; ` +
    `routes: ${routes.length} (${unparsed.length} unparsed); recipe hits: ${hits.length}; ` +
    `stories: ${stories.length} (${stories.filter((s) => s.changed).length} changed)\n`,
  );
}

function pack(inventoryPath: string, outDir: string): void {
  const inv = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const written: Array<{ file: string; kind: string; model: string; skill: string; units: number }> = [];
  const emit = (name: string, body: object, meta: { kind: string; model: string; skill: string; units: number }): void => {
    const file = path.join(outDir, `${name}.json`);
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
    written.push({ file, ...meta });
  };
  for (const cls of CROSS_CUTTING) {
    const recipes = RECIPES.filter((r) => r.classes.includes(cls)).map((r) => r.name);
    emit(`class-${cls}`, {
      class: cls, routes: inv.routes, unparsedRoutes: inv.unparsedRoutes,
      recipeHits: inv.recipeHits.filter((h: Hit) => recipes.includes(h.recipe)),
    }, { kind: 'class', model: 'opus', skill: 'bug-hunt', units: 0 });
  }
  // Changed units in rank order, packed by skill and top-level tree so a hunter reads
  // neighbouring code together; a file larger than the budget is a pack alone.
  const changed: Unit[] = inv.units.filter((u: Unit) => u.changed);
  const groups = new Map<string, Unit[]>();
  for (const u of changed) {
    const key = `${u.skill}|${u.file.split('/').slice(0, 2).join('/')}|${u.rank >= 4 ? 'high' : 'low'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(u);
  }
  let n = 0;
  for (const [key, members] of groups) {
    const [skill, , band] = key.split('|');
    let cur: Unit[] = [];
    let lines = 0;
    const flush = (): void => {
      if (!cur.length) return;
      const set = new Set(cur.map((u) => u.file));
      emit(`units-${++n}`, {
        skill, units: cur,
        routes: inv.routes.filter((r: Route) => set.has(r.file) || (r.handlerFile && set.has(r.handlerFile))),
        recipeHits: inv.recipeHits.filter((h: Hit) => set.has(h.file)),
      }, { kind: 'units', model: band === 'high' ? 'opus' : 'sonnet', skill, units: cur.length });
      cur = [];
      lines = 0;
    };
    for (const u of members) {
      if (cur.length && (cur.length >= PACK_MAX_FILES || lines + u.lines > PACK_MAX_LINES)) flush();
      cur.push(u);
      lines += u.lines;
    }
    flush();
  }
  writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify({ packs: written }, null, 2)}\n`);
  process.stdout.write(
    `packs: ${written.filter((p) => p.kind === 'class').length} cross-cutting, ${written.filter((p) => p.kind === 'units').length} of units ` +
    `(${changed.length} units)\n`,
  );
}

function record(ledgerPath: string, inventoryPath: string, unitsPath?: string): void {
  const inv = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const prior = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};
  let files: Record<string, string> = inv.files ?? {};
  let stories = Object.fromEntries((inv.stories ?? []).map((s: { id: string; hash: string }) => [s.id, s.hash]));
  if (unitsPath) {
    const wanted: string[] = JSON.parse(readFileSync(unitsPath, 'utf8'));
    const unknown = wanted.filter((f) => !(f in files));
    if (unknown.length) fail(`units not in the inventory: ${unknown.join(', ')}`);
    files = Object.fromEntries(wanted.map((f) => [f, files[f]]));
    // A partial run did not run the whole oracle, so it records no story as read.
    stories = {};
  }
  const ledger = {
    head: inv.head,
    files: { ...(prior.files ?? {}), ...files },
    stories: { ...(prior.stories ?? {}), ...stories },
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`ledger: ${Object.keys(ledger.files).length} files, ${Object.keys(ledger.stories).length} stories\n`);
}

function main(): void {
  const { mode, flags } = parseArgs(process.argv.slice(2));
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  if (mode === 'inventory') inventory(root, flags.out, flags.ledger);
  else if (mode === 'pack') pack(flags.inventory, flags.out);
  else record(flags.ledger, flags.from, flags.units);
}

main();
