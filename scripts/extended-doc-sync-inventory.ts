/**
 * Extended doc sync inventory: the deterministic half of the whole-repository drift
 * audit.
 *
 * The audit compares every document, design passage and code comment against the
 * code and against each other. Most of what can go wrong is mechanical (a link to
 * a file that moved, a story identifier no story carries, a table the data model
 * never mentions, a stale-language token in a canonical document), and a model
 * reading for those is slow, costly and misses some. This script finds them
 * exactly, and enumerates every unit the model stages must read, so coverage comes
 * from the enumeration rather than from a reader's judgement of what matters.
 *
 * Modes:
 *   --inventory --out <file> [--ledger <file>]
 *       Build the vocabulary, enumerate every documentation section and every
 *       commented source file as units in extraction batches, run the mechanical
 *       checks and the existing read-only parity gates, and, given the previous
 *       ledger, mark the units whose file changed and the entities a changed code
 *       file names, so a rerun reads only what moved. The vocabulary alone is also
 *       written beside the output as `<out>.vocab.json`, and each extraction batch's
 *       numbered text as `<out>.batches/<doc|comments>-<n>.txt`, for the extraction
 *       agents.
 *   --group --claims <file|dir> --out <dir>
 *       Bucket extracted claims (one file, or every extraction agent's file in a
 *       directory) by the entities they name, so the comparison stage sees every
 *       source's claims about one thing together. Writes one file per comparison
 *       batch, buckets carrying a requirement or a rationale going to the stronger
 *       model, plus coherence batches of every design claim and a summary.
 *   --record --results <file> --ledger <file> [--from <inventory file>]
 *       Fold one run's open findings and the maintainer's rulings, with the per-file
 *       content hashes of the inventory the run read, into the ledger the next run
 *       reads.
 *
 * Read-only against the repository: it writes only the files named by its flags.
 * Refuses an unknown mode or a missing required flag.
 *
 * The canonical document paths it reads default to the repository's own and can be
 * pointed elsewhere through EXTENDED_DOC_SYNC_* environment variables, which is
 * how its test drives it against a fixture repository.
 *
 * Run: npx tsx scripts/extended-doc-sync-inventory.ts <mode> [flags]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { commentLines, entityKey, extractEntities } from './lib/doc-entities';

const env = (name: string, fallback: string): string => process.env[name] ?? fallback;
const STORIES_DOC = env('EXTENDED_DOC_SYNC_STORIES_DOC', 'docs/USER_STORIES.md');
const JOBS_DOC = env('EXTENDED_DOC_SYNC_JOBS_DOC', 'docs/BACKGROUND_JOBS.md');
const DECISIONS_DOC = env('EXTENDED_DOC_SYNC_DECISIONS_DOC', 'docs/DESIGN_DECISIONS.md');
const DATA_MODEL_DOC = env('EXTENDED_DOC_SYNC_DATA_MODEL_DOC', 'docs/DATA_MODEL.md');
const GLOSSARY_DOC = env('EXTENDED_DOC_SYNC_GLOSSARY_DOC', 'docs/GLOSSARY.md');
const SCHEMA = env('EXTENDED_DOC_SYNC_SCHEMA', 'database/schema.sql');
// The documents the doc-governance rule holds to pure design, where stale-language
// tokens are drift rather than ordinary prose.
const CANONICAL = env(
  'EXTENDED_DOC_SYNC_CANONICAL',
  [STORIES_DOC, JOBS_DOC, DECISIONS_DOC, DATA_MODEL_DOC, 'docs/TESTING.md', 'docs/DEV_ONBOARDING.md',
    'PROJECT_SUMMARY_CONCISE.md'].join(','),
).split(',').filter(Boolean);
const GATES = env(
  'EXTENDED_DOC_SYNC_GATES',
  'scripts/ci/check_audit_catalogue.sh,scripts/ci/check_config_seed_parity.sh,scripts/ci/assert_claude_harness.sh',
).split(',').filter(Boolean);

// The working corpus and vendored trees are not documentation of this system.
const SKIP = /^(exploration\/|node_modules\/|aws\/dist\/|legacy_data\/footbag_venv\/|scripts\/\.venv\/|curated\/)/;
const CODE_TREES = /^(src|scripts|tests|legacy_data|freestyle|terraform|docker|ops|database|\.claude\/hooks)\//;
const CODE_EXT = /\.(ts|tsx|js|mjs|cjs|hbs|css|sh|py|sql|tf)$/;
const DOC_BATCH_LINES = 600;
const COMMENT_BATCH_LINES = 800;
const SECTION_MAX_LINES = 400;
const COMPARE_BATCH_CLAIMS = 60;
const COHERENCE_BATCH_CLAIMS = 150;

function usage(code: number): never {
  (code === 0 ? process.stdout : process.stderr).write(
    'Usage: npx tsx scripts/extended-doc-sync-inventory.ts --inventory --out <file> [--ledger <file>]\n' +
    '       npx tsx scripts/extended-doc-sync-inventory.ts --group --claims <file|dir> --out <dir>\n' +
    '       npx tsx scripts/extended-doc-sync-inventory.ts --record --results <file> --ledger <file> [--from <inventory file>]\n',
  );
  process.exit(code);
}

function parseArgs(argv: string[]): { mode: string; flags: Record<string, string> } {
  const modes = ['--inventory', '--group', '--record'];
  let mode = '';
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    if (modes.includes(a)) {
      if (mode) usage(2);
      mode = a.slice(2);
    } else if (['--out', '--ledger', '--claims', '--results', '--from'].includes(a) && argv[i + 1]) {
      flags[a.slice(2)] = argv[++i];
    } else {
      process.stderr.write(`extended-doc-sync-inventory: unknown option '${a}'\n`);
      usage(2);
    }
  }
  if (!mode) usage(2);
  const need: Record<string, string[]> = { inventory: ['out'], group: ['claims', 'out'], record: ['results', 'ledger'] };
  for (const f of need[mode]) {
    if (!flags[f]) {
      process.stderr.write(`extended-doc-sync-inventory: --${mode} needs --${f}\n`);
      process.exit(2);
    }
  }
  return { mode, flags };
}

function git(args: string[], root: string): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

function read(root: string, rel: string): string {
  const abs = path.join(root, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

/** Content hashes of the working-tree files, so an uncommitted edit counts as a change. */
function contentHashes(root: string, files: string[]): Record<string, string> {
  if (files.length === 0) return {};
  const out = execFileSync('git', ['hash-object', '--stdin-paths'], {
    cwd: root, input: files.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }).trim().split('\n');
  return Object.fromEntries(files.map((f, i) => [f, out[i]]));
}

// GitHub's heading anchor: lowercase, punctuation other than hyphen and underscore
// dropped, spaces to hyphens.
function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/** Whether a repository path a document names exists, allowing a module named without its extension. */
function pathExists(root: string, p: string): boolean {
  const abs = path.join(root, p);
  return ['', '.ts', '.js', '.sh', '.py', '/index.ts'].some((ext) => existsSync(abs + ext));
}

interface Unit { id: string; file: string; start: number; end: number; heading: string; lines: number }
interface Finding { check: string; file: string; line: number; detail: string }

function vocabulary(root: string, codeFiles: string[]) {
  const schema = read(root, SCHEMA);
  const tables = [...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)/gi)].map((m) => m[1]);
  const stories = [...read(root, STORIES_DOC).matchAll(/^###\s+([A-Z]+_\w+)/gm)].map((m) => m[1]);
  const jobs = [...read(root, JOBS_DOC).matchAll(/^###\s+(SYS_\w+)/gm)].map((m) => m[1]);
  const decisions = [...read(root, DECISIONS_DOC).matchAll(/^##\s+(\d+\.\d+[a-z]?\s+.+)$/gm)].map((m) => m[1].trim());
  const dataModel = [...read(root, DATA_MODEL_DOC).matchAll(/^###?\s+(.+)$/gm)].map((m) => m[1].trim());
  const glossary = [...read(root, GLOSSARY_DOC).matchAll(/^\*\*([^*]+?):\*\*/gm)].map((m) => m[1].trim());
  const routes = [...read(root, 'tests/fixtures/crawl/routeStories.ts').matchAll(/'((?:GET|POST|PUT|PATCH|DELETE) \/[^']*)'/g)]
    .map((m) => m[1]);
  const services = codeFiles.filter((f) => /^src\/services\/[^/]+\.ts$/.test(f)).map((f) => path.basename(f, '.ts'));
  const envVars = new Set<string>();
  for (const f of codeFiles.filter((c) => /^(src|scripts)\//.test(c) && /\.(ts|js)$/.test(c))) {
    for (const m of read(root, f).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) envVars.add(m[1]);
  }
  return { tables, stories, jobs, decisions, dataModel, glossary, routes, services, envVars: [...envVars].sort() };
}

function docUnits(root: string, docs: string[]): Unit[] {
  const units: Unit[] = [];
  for (const file of docs) {
    const lines = read(root, file).split('\n');
    const starts: Array<{ line: number; heading: string }> = [{ line: 1, heading: '(preamble)' }];
    let fence = false;
    lines.forEach((l, i) => {
      if (/^\s*```/.test(l)) fence = !fence;
      const m = !fence && /^(#{1,3})\s+(.+)$/.exec(l);
      if (m) starts.push({ line: i + 1, heading: m[2].trim() });
    });
    starts.forEach((s, i) => {
      const end = (starts[i + 1]?.line ?? lines.length + 1) - 1;
      if (end < s.line) return;
      // A section too long for one careful read is split, never skipped.
      for (let a = s.line; a <= end; a += SECTION_MAX_LINES) {
        const b = Math.min(end, a + SECTION_MAX_LINES - 1);
        units.push({ id: `doc:${file}#${a}`, file, start: a, end: b, heading: s.heading, lines: b - a + 1 });
      }
    });
  }
  return units;
}

function commentUnits(root: string, codeFiles: string[]): Unit[] {
  const units: Unit[] = [];
  for (const file of codeFiles) {
    if (!CODE_EXT.test(file)) continue;
    const lines = read(root, file).split('\n');
    const count = commentLines(lines, file).size;
    if (count === 0) continue;
    units.push({ id: `comments:${file}`, file, start: 1, end: lines.length, heading: '(comments)', lines: count });
  }
  return units;
}

type BatchUnit = Pick<Unit, 'id' | 'file' | 'start' | 'end'>;

/**
 * Consecutive units packed up to a line budget; a unit larger than the budget is a
 * batch alone. Each carries its file and line range, because the workflow that hands
 * a batch to an agent cannot read this inventory itself.
 */
function batches(units: Unit[], budget: number): BatchUnit[][] {
  const out: BatchUnit[][] = [];
  let cur: BatchUnit[] = [];
  let size = 0;
  for (const u of units) {
    if (cur.length > 0 && size + u.lines > budget) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push({ id: u.id, file: u.file, start: u.start, end: u.end });
    size += u.lines;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * One batch's text, numbered by source line. A documentation section is copied whole.
 * A source file contributes only its comment blocks, each followed by the code line it
 * describes, because the comment is the claim and the line beside it is what it is
 * about; the rest of the file is the comparison stage's to open.
 */
function batchText(root: string, units: BatchUnit[]): string {
  return units.map((u) => {
    const lines = read(root, u.file).split('\n');
    const keep = new Set<number>();
    if (u.id.startsWith('comments:')) {
      const comments = commentLines(lines, u.file);
      for (const n of comments) {
        keep.add(n);
        if (comments.has(n + 1)) continue;
        let next = n + 1;
        while (next <= lines.length && lines[next - 1].trim() === '') next++;
        if (next <= lines.length) keep.add(next);
      }
    } else {
      for (let n = u.start; n <= u.end; n++) keep.add(n);
    }
    const body: string[] = [];
    let last = 0;
    for (const n of [...keep].sort((a, b) => a - b)) {
      // Marks omitted code; a gap of blank lines omits nothing.
      if (last && lines.slice(last, n - 1).some((l) => l.trim() !== '')) body.push('...');
      body.push(`${n}: ${lines[n - 1]}`);
      last = n;
    }
    return `=== ${u.id} ===\n${body.join('\n')}`;
  }).join('\n\n') + '\n';
}

function mechanical(root: string, docs: string[], vocab: ReturnType<typeof vocabulary>): Finding[] {
  const findings: Finding[] = [];
  const anchors = new Map<string, Set<string>>();
  const anchorsOf = (file: string): Set<string> => {
    if (!anchors.has(file)) {
      anchors.set(file, new Set([...read(root, file).matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]))));
    }
    return anchors.get(file)!;
  };
  const known = new Set([...vocab.stories, ...vocab.jobs]);
  const canonical = new Set(CANONICAL);
  // A gitignored path (a run's generated output) legitimately exists only after a run.
  const ignored = (p: string): boolean =>
    spawnSync('git', ['check-ignore', '-q', p], { cwd: root }).status === 0;
  for (const file of docs) {
    const lines = read(root, file).split('\n');
    let fence = false;
    lines.forEach((text, i) => {
      if (/^\s*```/.test(text)) fence = !fence;
      if (fence) return;
      const line = i + 1;
      // A link written inside inline code is an example, not a link.
      const prose = text.replace(/`[^`]*`/g, '');
      for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1];
        // A bare number in brackets-then-parentheses is trick notation, not a link.
        if (/^(https?:|mailto:)/.test(target) || /^[+-]?\d+$/.test(target)) continue;
        const [p, anchor] = target.split('#');
        const resolved = p ? path.normalize(path.join(path.dirname(file), p)) : file;
        if (p && !existsSync(path.join(root, resolved))) {
          findings.push({ check: 'broken-link', file, line, detail: `link target ${target} does not exist` });
        } else if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(anchor.toLowerCase())) {
          findings.push({ check: 'broken-anchor', file, line, detail: `no heading for #${anchor} in ${resolved}` });
        }
      }
      for (const m of text.matchAll(/`((?:src|scripts|tests|docs|database|terraform|docker|legacy_data|ifpa|\.claude)\/[^`\s]+)`/g)) {
        // A trailing :line or :symbol locates inside the file; a placeholder is not a path.
        const p = m[1].replace(/(\.\w+):[\w.-]+$/, '$1').replace(/\/$/, '');
        if (/[*<>{}$…]/.test(p) || ignored(p)) continue;
        if (!pathExists(root, p)) {
          findings.push({ check: 'missing-path', file, line, detail: `path ${p} does not exist` });
        }
      }
      for (const m of text.matchAll(/\b(?:V|M|A|EO|CL|GO|SYS)_[A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*\b/g)) {
        // Story and job identifiers are mixed case; an all-capitals name is a file or constant.
        if (!/[a-z]/.test(m[0])) continue;
        if (!known.has(m[0])) {
          findings.push({ check: 'unknown-story-id', file, line, detail: `${m[0]} names no story or job heading` });
        }
      }
      if (canonical.has(file)) {
        const stale = /Last updated:|\bas of (?:\d|today|now)\b|\bsprint\b/i.exec(text);
        if (stale) findings.push({ check: 'stale-token', file, line, detail: `"${stale[0]}" in a canonical document` });
        if (/\bcurrently\b/i.test(text)) {
          findings.push({ check: 'stale-token-candidate', file, line, detail: '"currently" (drift only if it states build status)' });
        }
      }
      for (const m of text.matchAll(/\b(?:see|per|under|from)\s+§\s?\d+(?:\.\d+)*/gi)) {
        const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 3);
        if (!/^\s*[(—"]/.test(after) && !/^,?\s+the\b/.test(after)) {
          findings.push({ check: 'bare-locator', file, line, detail: `"${m[0]}" has no title beside it` });
        }
      }
    });
  }
  const dataModel = read(root, DATA_MODEL_DOC);
  for (const t of vocab.tables) {
    if (!new RegExp(`\\b${t}\\b`).test(dataModel)) {
      findings.push({ check: 'table-absent-from-data-model', file: SCHEMA, line: 0, detail: `table ${t} is never named in ${DATA_MODEL_DOC}` });
    }
  }
  return findings;
}

function runGates(root: string): Array<{ gate: string; status: number | null; tail: string }> {
  return GATES.filter((g) => existsSync(path.join(root, g))).map((gate) => {
    const r = spawnSync('bash', [gate], { cwd: root, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
    const tail = r.status === 0 ? '' : `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
    return { gate, status: r.status, tail };
  });
}

function inventory(root: string, out: string, ledgerPath?: string): void {
  const tracked = git(['ls-files', '--cached', '--others', '--exclude-standard'], root).split('\n')
    .filter((f) => f && !SKIP.test(f) && existsSync(path.join(root, f)));
  const docs = tracked.filter((f) => f.endsWith('.md'));
  const codeFiles = tracked.filter((f) => CODE_TREES.test(f) && !f.endsWith('.md'));
  const vocab = vocabulary(root, codeFiles);
  const dUnits = docUnits(root, docs);
  const cUnits = commentUnits(root, codeFiles);
  const hashes = contentHashes(root, [...new Set([...docs, ...codeFiles])]);

  const previous = ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null;
  const prevHashes: Record<string, string> = previous?.files ?? {};
  const changedFiles = new Set(Object.keys(hashes).filter((f) => prevHashes[f] !== hashes[f]));
  const isChanged = (u: Unit): boolean => !previous || changedFiles.has(u.file);
  // A changed code file reopens every bucket for the entities it names, even when no
  // document changed: the document can be what went stale.
  const reopen = new Set<string>();
  if (previous) {
    for (const f of [...changedFiles].filter((c) => codeFiles.includes(c))) {
      for (const l of read(root, f).split('\n')) for (const e of extractEntities(l, f)) reopen.add(entityKey(e));
    }
  }

  const changedDocs = dUnits.filter(isChanged);
  const changedComments = cUnits.filter(isChanged);
  const findings = mechanical(root, docs, vocab);
  const result = {
    head: git(['rev-parse', 'HEAD'], root).trim(),
    vocabulary: vocab,
    units: { docs: dUnits, comments: cUnits },
    extract: {
      docBatches: batches(changedDocs, DOC_BATCH_LINES),
      commentBatches: batches(changedComments, COMMENT_BATCH_LINES),
    },
    incremental: previous
      ? { changedFiles: [...changedFiles].sort(), reopenEntities: [...reopen].sort(), priorRulings: previous.rulings ?? [] }
      : null,
    mechanical: findings,
    gates: runGates(root),
    files: hashes,
  };
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  // Extraction agents need only the names, and the full inventory is megabytes of
  // units and hashes each of them would otherwise read: the vocabulary goes beside it.
  const base = out.replace(/\.json$/, '');
  writeFileSync(`${base}.vocab.json`, `${JSON.stringify(vocab)}\n`);
  // Each batch's text in one file, named as the workflow names the batch, so an
  // extraction agent reads one file once instead of opening every source file whole.
  const textDir = `${base}.batches`;
  mkdirSync(textDir, { recursive: true });
  result.extract.docBatches.forEach((b, i) => writeFileSync(path.join(textDir, `doc-${i}.txt`), batchText(root, b)));
  result.extract.commentBatches.forEach((b, i) => writeFileSync(path.join(textDir, `comments-${i}.txt`), batchText(root, b)));
  const failedGates = result.gates.filter((g) => g.status !== 0).length;
  process.stdout.write(
    `units: ${dUnits.length} doc sections, ${cUnits.length} commented files; ` +
    `to extract: ${changedDocs.length + changedComments.length} in ` +
    `${result.extract.docBatches.length + result.extract.commentBatches.length} batches; ` +
    `mechanical findings: ${findings.length}; gates failing: ${failedGates}\n`,
  );
}

interface Claim { id: string; entities?: string[]; type?: string; unit?: string }

/** Claims from one file, or merged from every extraction agent's file in a directory. */
function loadClaims(claimsPath: string): Claim[] {
  if (!statSync(claimsPath).isDirectory()) return JSON.parse(readFileSync(claimsPath, 'utf8'));
  return readdirSync(claimsPath).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => JSON.parse(readFileSync(path.join(claimsPath, f), 'utf8')) as Claim[]);
}

function group(claimsPath: string, outDir: string): void {
  const claims = loadClaims(claimsPath);
  mkdirSync(outDir, { recursive: true });
  const buckets = new Map<string, Set<string>>();
  const byId = new Map(claims.map((c) => [c.id, c]));
  for (const c of claims) {
    // A claim naming no entity is still compared, against its own document's other claims.
    const keys = c.entities?.length ? c.entities : [`unit:${(c.unit ?? '').replace(/#.*$/, '')}`];
    for (const k of keys) {
      if (!buckets.has(k)) buckets.set(k, new Set());
      buckets.get(k)!.add(c.id);
    }
  }
  const list = [...buckets].map(([entity, ids]) => {
    const claimIds = [...ids].sort();
    const strong = claimIds.some((id) => ['requirement', 'rationale'].includes(byId.get(id)?.type ?? ''));
    return { entity, claimIds, model: strong ? 'opus' : 'sonnet' };
  // A lone claim about a named entity is still checked against the code; a lone
  // claim naming nothing has nothing to be compared with.
  }).filter((b) => b.claimIds.length > 1 || !b.entity.startsWith('unit:'));
  const pack = (model: string): string[][] => {
    const out2: string[][] = [];
    let cur: string[] = [];
    let size = 0;
    for (const b of list.filter((x) => x.model === model)) {
      if (cur.length && size + b.claimIds.length > COMPARE_BATCH_CLAIMS) {
        out2.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(b.entity);
      size += b.claimIds.length;
    }
    if (cur.length) out2.push(cur);
    return out2;
  };
  // One file per comparison batch carrying its buckets' claims in full, so each agent
  // reads only its own slice.
  const bucketByEntity = new Map(list.map((b) => [b.entity, b]));
  const files: Record<string, string[]> = { opus: [], sonnet: [], coherence: [] };
  for (const model of ['opus', 'sonnet']) {
    pack(model).forEach((entities, i) => {
      const file = path.join(outDir, `${model}-${i + 1}.json`);
      const body = entities.map((e) => ({ entity: e, claims: bucketByEntity.get(e)!.claimIds.map((id) => byId.get(id)) }));
      writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
      files[model].push(file);
    });
  }
  // The design-coherence pass reads every requirement and rationale claim, whatever it names.
  const design = claims.filter((c) => ['requirement', 'rationale'].includes(c.type ?? ''));
  for (let i = 0; i < design.length; i += COHERENCE_BATCH_CLAIMS) {
    const file = path.join(outDir, `coherence-${i / COHERENCE_BATCH_CLAIMS + 1}.json`);
    writeFileSync(file, `${JSON.stringify(design.slice(i, i + COHERENCE_BATCH_CLAIMS), null, 2)}\n`);
    files.coherence.push(file);
  }
  writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify({ buckets: list, files }, null, 2)}\n`);
  process.stdout.write(
    `claims: ${claims.length}; buckets: ${list.length}; comparison batches: ${files.opus.length} strong, ` +
    `${files.sonnet.length} standard; coherence batches: ${files.coherence.length}\n`,
  );
}

function record(resultsPath: string, ledgerPath: string, inventoryPath?: string): void {
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  // The file hashes come from the inventory the run read, never through a model.
  const inv = inventoryPath ? JSON.parse(readFileSync(inventoryPath, 'utf8')) : {};
  const prior = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};
  const ledger = {
    head: inv.head ?? results.head,
    files: { ...(prior.files ?? {}), ...(results.files ?? {}), ...(inv.files ?? {}) },
    findings: results.findings ?? [],
    rulings: [...(prior.rulings ?? []), ...(results.rulings ?? [])],
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`ledger: ${Object.keys(ledger.files).length} files, ${ledger.findings.length} open findings, ${ledger.rulings.length} rulings\n`);
}

function main(): void {
  const { mode, flags } = parseArgs(process.argv.slice(2));
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  if (mode === 'inventory') inventory(root, flags.out, flags.ledger);
  else if (mode === 'group') group(flags.claims, flags.out);
  else record(flags.results, flags.ledger, flags.from);
}

main();
