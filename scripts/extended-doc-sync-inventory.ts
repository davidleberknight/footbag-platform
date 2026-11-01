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
 *   --inventory --out <file> [--ledger <file>] [--private-root <dir>] [--units <file>]
 *       Build the vocabulary, enumerate every documentation section and every
 *       commented source file as units in extraction batches, run the mechanical
 *       checks and the existing read-only parity gates, and, given the previous
 *       ledger, mark the units whose file changed and the entities a changed code
 *       file names, so a rerun reads only what moved. The vocabulary alone is also
 *       written beside the output as `<out>.vocab.json`, and each extraction batch's
 *       numbered text as `<out>.batches/<doc|comments>-<n>.txt`, for the extraction
 *       agents. `--private-root` names the private operations checkout's link inside
 *       this repository; its canonical documents (the two operations documents and the
 *       go-live plan) become units too, because they describe this code's operation and
 *       launch and drift from it like any other document. Nothing else there is audited.
 *       `--units` (a JSON array of unit ids) extracts only the named units, so one
 *       domain's walk batches and pays for that domain alone; an unknown id is refused.
 *   --group --claims <file|dir> --out <dir>
 *       Bucket extracted claims (one file, or every extraction agent's file in a
 *       directory) by the entities they name, so the comparison stage sees every
 *       source's claims about one thing together. A bucket too large for one careful
 *       comparison is split by the other things its claims name. Each bucket carries
 *       the code it is about (the table's definition, the route's registration, the
 *       service's header), so a comparison judges instead of searching. Writes one
 *       file per comparison batch, buckets carrying a requirement or a rationale
 *       going to the stronger model, plus coherence batches of every design claim
 *       and a summary.
 *   --record --results <file> --ledger <file> [--from <inventory file>] [--units <file>]
 *       Fold one run's open findings and the maintainer's rulings, with the per-file
 *       content hashes of the inventory the run read, into the ledger the next run
 *       reads. `--units` (a JSON array of unit ids) records only what those units
 *       cover, so a run that read part of the repository marks only that part checked:
 *       a commented file whole, a document whole only when every section was read, and
 *       otherwise each section read by the hash of its text.
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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { commentLines, entityKey, extractEntities, isSearchable } from './lib/doc-entities';

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
// Evidence attached to one bucket stays a short read, not a second copy of the file.
const EVIDENCE_MAX_LINES = 40;
const EVIDENCE_MAX_HITS = 5;
// The private operations documents the private-repository rule says public text must
// mark as private whenever it names them.
const PRIVATE_OPS_DOCS = ['AWS_OPERATIONS.md', 'DEVOPS_GUIDE.md', 'VAULT_GOVERNANCE.md']; // all three private
// The private checkout's canonical documents, the only ones it audits: the operations
// documents describe this code's operation and the go-live plan the launch it gates, where
// the checkout's other files track or record work.
const PRIVATE_AUDITED_DOCS = ['AWS_OPERATIONS.md', 'DEVOPS_GUIDE.md', 'GO_LIVE_PLAN.md']; // all private

function usage(code: number): never {
  (code === 0 ? process.stdout : process.stderr).write(
    'Usage: npx tsx scripts/extended-doc-sync-inventory.ts --inventory --out <file> [--ledger <file>] [--private-root <dir>] [--units <file>]\n' +
    '       npx tsx scripts/extended-doc-sync-inventory.ts --group --claims <file|dir> --out <dir>\n' +
    '       npx tsx scripts/extended-doc-sync-inventory.ts --record --results <file> --ledger <file> [--from <inventory file>] [--units <file>]\n',
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
    } else if (['--out', '--ledger', '--claims', '--results', '--from', '--private-root', '--units'].includes(a) && argv[i + 1]) {
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
  // Unit ids carry no file hashes; without the inventory they came from, a partial
  // record would have nothing to write and would silently mark nothing checked.
  if (mode === 'record' && flags.units && !flags.from) {
    process.stderr.write('extended-doc-sync-inventory: --units needs --from\n');
    process.exit(2);
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

// A documentation unit carries the hash of its own text, so a run that read only some
// sections of a document can record those sections without marking the rest checked.
interface Unit { id: string; file: string; start: number; end: number; heading: string; lines: number; hash?: string }
interface Finding { check: string; file: string; line: number; detail: string }

function vocabulary(root: string, codeFiles: string[]) {
  const schema = read(root, SCHEMA);
  const tables = [...schema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)/gi)].map((m) => m[1]);
  const stories = [...read(root, STORIES_DOC).matchAll(/^###\s+([A-Z]+_\w+)/gm)].map((m) => m[1]);
  const jobs = [...read(root, JOBS_DOC).matchAll(/^###\s+(SYS_\w+)/gm)].map((m) => m[1]);
  const decisions = [...read(root, DECISIONS_DOC).matchAll(/^##\s+(\d+\.\d+[a-z]?\s+.+)$/gm)].map((m) => m[1].trim());
  const dataModel = [...read(root, DATA_MODEL_DOC).matchAll(/^###?\s+(.+)$/gm)].map((m) => m[1].trim());
  // An entry is written either `**Term:**` or `**Term**:`; reading only one form loses
  // most of the glossary.
  const glossary = [...read(root, GLOSSARY_DOC).matchAll(/^\*\*([^*]+?)(?::\*\*|\*\*:)/gm)].map((m) => m[1].trim());
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
        const hash = createHash('sha256').update(lines.slice(a - 1, b).join('\n')).digest('hex');
        units.push({ id: `doc:${file}#${a}`, file, start: a, end: b, heading: s.heading, lines: b - a + 1, hash });
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

function mechanical(
  root: string, docs: string[], codeFiles: string[], vocab: ReturnType<typeof vocabulary>, privateFiles: Set<string>,
): Finding[] {
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
  findings.push(...quantityMismatches(root, docs, vocab.glossary));
  findings.push(...unmarkedPrivateDocs(root, docs, codeFiles, privateFiles));
  findings.push(...unreadColumns(root, codeFiles));
  return findings;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One quantity stated with different values in different places: a glossary term's
 * price, retention or period. A value restated in several documents drifts when one copy
 * is updated, and the reader of a stale copy acts on a wrong number. The quantity is
 * tied to the nearest glossary term before it in the same clause, because that term is
 * what the number is about; a number with no such term is the model stages' to read.
 * One finding per quantity, listing every value with where it is stated.
 */
function quantityMismatches(root: string, docs: string[], terms: string[]): Finding[] {
  const usable = terms.filter((t) => t.length >= 3);
  if (usable.length === 0) return [];
  const termRe = new RegExp(`\\b(${usable.map(escapeRe).join('|')})\\b`, 'g');
  // A money amount (a range such as $50-100 is not one value), or a count of days, months or years.
  const amountRe = /\\?\$\s?(\d[\d,]*(?:\.\d+)?)(?![\d,]*\s*-\s*\d)|\b(\d[\d,]*)[\s-](days?|months?|years?)\b/g;
  const seen = new Map<string, Array<{ value: number; file: string; line: number }>>();
  for (const file of docs) {
    let fence = false;
    read(root, file).split('\n').forEach((text, i) => {
      if (/^\s*```/.test(text)) fence = !fence;
      if (fence) return;
      const hits = [...text.matchAll(termRe)].map((m) => ({ term: m[1], end: (m.index ?? 0) + m[0].length }));
      for (const a of text.matchAll(amountRe)) {
        const at = a.index ?? 0;
        const before = hits.filter((h) => h.end <= at && at - h.end <= 60 && !/[.;,]/.test(text.slice(h.end, at)));
        const owner = before[before.length - 1];
        if (!owner) continue;
        const unit = a[1] !== undefined ? 'money' : a[3].replace(/s$/, '');
        const value = Number((a[1] ?? a[2]).replace(/,/g, ''));
        const key = `${owner.term} (${unit})`;
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key)!.push({ value, file, line: i + 1 });
      }
    });
  }
  const findings: Finding[] = [];
  for (const [key, uses] of seen) {
    if (new Set(uses.map((u) => u.value)).size < 2) continue;
    const where = uses.map((u) => `${u.value} at ${u.file}:${u.line}`).join('; ');
    findings.push({ check: 'quantity-mismatch', file: uses[0].file, line: uses[0].line, detail: `${key} is stated as ${where}` });
  }
  return findings;
}

/**
 * Public text that names a private operations document without saying it is private.
 * The private-repository rule requires the word on the same line, because the bare name
 * reads as a file in this repository that a reader will then fail to find. The private
 * documents themselves are exempt: they are the files.
 */
function unmarkedPrivateDocs(root: string, docs: string[], codeFiles: string[], privateFiles: Set<string>): Finding[] {
  const nameRe = new RegExp(`\\b(${PRIVATE_OPS_DOCS.map(escapeRe).join('|')})\\b`);
  const findings: Finding[] = [];
  for (const file of [...docs, ...codeFiles]) {
    if (privateFiles.has(file)) continue;
    read(root, file).split('\n').forEach((text, i) => {
      const m = nameRe.exec(text);
      if (m && !/private/i.test(text)) {
        findings.push({ check: 'unmarked-private-doc', file, line: i + 1, detail: `${m[1]} named without marking it private` });
      }
    });
  }
  return findings;
}

/**
 * A schema column no application code, script or loader names. A column nothing reads or
 * writes is either dead, so its data-model entry describes nothing, or read under a name
 * built at run time, which a reader of the code cannot follow either. Tests and the schema's
 * own migrations do not count as use. Generic and single-word names are skipped, as the
 * per-change doc sync skips them, because a search for them finds the word, not the column.
 */
function unreadColumns(root: string, codeFiles: string[]): Finding[] {
  const schemaLines = read(root, SCHEMA).split('\n');
  const columns = new Map<string, number>();
  schemaLines.forEach((l, i) => {
    for (const e of extractEntities(l, SCHEMA)) {
      if (e.kind === 'column' && isSearchable(e) && !columns.has(e.name)) columns.set(e.name, i + 1);
    }
  });
  if (columns.size === 0) return [];
  const used = new Set<string>();
  for (const f of codeFiles) {
    if (f === SCHEMA || f.startsWith('database/') || f.startsWith('tests/')) continue;
    for (const m of read(root, f).matchAll(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g)) used.add(m[0]);
  }
  return [...columns].filter(([c]) => !used.has(c)).map(([c, line]) => ({
    check: 'column-unread', file: SCHEMA, line, detail: `column ${c} is named by no code outside the schema and tests`,
  }));
}

function runGates(root: string): Array<{ gate: string; status: number | null; tail: string }> {
  return GATES.filter((g) => existsSync(path.join(root, g))).map((gate) => {
    const r = spawnSync('bash', [gate], { cwd: root, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
    const tail = r.status === 0 ? '' : `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
    return { gate, status: r.status, tail };
  });
}

/**
 * The private checkout's canonical documents, as paths through its link in this
 * repository, read only where the checkout tracks them. Its other plans, tracker guide,
 * working files, archived history and records of past runs describe work rather than the
 * system, and stay out. A link that is missing or
 * is not a git checkout is refused, so a run never reports the private documents
 * consistent without having read them.
 */
function privateDocs(root: string, privateRoot: string): string[] {
  const dir = path.join(root, privateRoot);
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: dir, encoding: 'utf8' });
  if (!existsSync(dir) || r.status !== 0) {
    process.stderr.write(`extended-doc-sync-inventory: --private-root ${privateRoot} is not a git checkout\n`);
    process.exit(2);
  }
  return r.stdout.split('\n').filter((f) => PRIVATE_AUDITED_DOCS.includes(f))
    .map((f) => `${privateRoot.replace(/\/$/, '')}/${f}`);
}

/** Unit ids read from a JSON array file; an id the inventory does not hold is refused. */
function namedUnits(unitsPath: string, all: Unit[]): Set<string> {
  const ids: string[] = JSON.parse(readFileSync(unitsPath, 'utf8'));
  const known = new Set(all.map((u) => u.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    process.stderr.write(`extended-doc-sync-inventory: units not in the inventory: ${unknown.join(', ')}\n`);
    process.exit(2);
  }
  return new Set(ids);
}

function inventory(root: string, out: string, ledgerPath?: string, privateRoot?: string, unitsPath?: string): void {
  const tracked = git(['ls-files', '--cached', '--others', '--exclude-standard'], root).split('\n')
    .filter((f) => f && !SKIP.test(f) && existsSync(path.join(root, f)));
  const privateFiles = new Set(privateRoot ? privateDocs(root, privateRoot) : []);
  const docs = [...tracked.filter((f) => f.endsWith('.md')), ...privateFiles];
  const codeFiles = tracked.filter((f) => CODE_TREES.test(f) && !f.endsWith('.md'));
  const vocab = vocabulary(root, codeFiles);
  const dUnits = docUnits(root, docs);
  const cUnits = commentUnits(root, codeFiles);
  // git refuses a path that passes through a symbolic link, so the private documents,
  // reached through the checkout's link, are hashed here instead.
  const hashes = {
    ...contentHashes(root, [...new Set([...docs, ...codeFiles])].filter((f) => !privateFiles.has(f))),
    ...Object.fromEntries([...privateFiles].map((f) => [f, createHash('sha256').update(read(root, f)).digest('hex')])),
  };

  const previous = ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null;
  const prevHashes: Record<string, string> = previous?.files ?? {};
  const prevSections: Record<string, string[]> = previous?.sections ?? {};
  const changedFiles = new Set(Object.keys(hashes).filter((f) => prevHashes[f] !== hashes[f]));
  // A section recorded on its own is unchanged while its text is, whatever else in its
  // document moved. A named-unit run extracts only the units it names.
  const named = unitsPath ? namedUnits(unitsPath, [...dUnits, ...cUnits]) : null;
  const isChanged = (u: Unit): boolean =>
    (!named || named.has(u.id)) &&
    (!previous || (changedFiles.has(u.file) && !(u.hash && (prevSections[u.file] ?? []).includes(u.hash))));
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
  const findings = mechanical(root, docs, codeFiles, vocab, privateFiles);
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

interface Claim { id: string; entities?: string[]; type?: string; unit?: string; line?: number }
interface Evidence { file: string; line: number; text: string }

/** Lines `from`..`to` of a file, numbered, capped so evidence stays a short read. */
function excerpt(root: string, file: string, from: number, to: number): Evidence {
  const lines = read(root, file).split('\n');
  const end = Math.min(to, from + EVIDENCE_MAX_LINES - 1, lines.length);
  return { file, line: from, text: lines.slice(from - 1, end).map((l, i) => `${from + i}: ${l}`).join('\n') };
}

/**
 * The code a bucket's entity names, handed to the comparison with the claims so it reads
 * the definition instead of searching for it: a table's definition, a column's definition
 * and the first code naming it, a route's registration, a service's header and exports, an
 * export's declaration, an environment variable's reads. Kinds with no code home (a story,
 * a decision, a term, a rule) carry their claims' own quotes and get none.
 */
function evidenceFor(root: string, entity: string, codeIndex: Map<string, string[]>): Evidence[] {
  const [kind, ...rest] = entity.split(':');
  const name = rest.join(':');
  const hitsFor = (re: RegExp, files: string[]): Evidence[] => {
    const out: Evidence[] = [];
    for (const f of files) {
      const lines = codeIndex.get(f) ?? [];
      for (let i = 0; i < lines.length && out.length < EVIDENCE_MAX_HITS; i++) {
        if (re.test(lines[i])) out.push({ file: f, line: i + 1, text: `${i + 1}: ${lines[i]}` });
      }
      if (out.length >= EVIDENCE_MAX_HITS) break;
    }
    return out;
  };
  const files = [...codeIndex.keys()];
  const word = new RegExp(`\\b${escapeRe(name)}\\b`);
  if (kind === 'table') {
    const lines = codeIndex.get(SCHEMA) ?? [];
    const at = lines.findIndex((l) => new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${escapeRe(name)}\\b`, 'i').test(l));
    if (at < 0) return [];
    const close = lines.findIndex((l, i) => i > at && /^\s*\);/.test(l));
    return [excerpt(root, SCHEMA, at + 1, (close < 0 ? at : close) + 1)];
  }
  if (kind === 'column') {
    return [...hitsFor(word, [SCHEMA]).slice(0, 1), ...hitsFor(word, files.filter((f) => f !== SCHEMA && !f.startsWith('tests/')))];
  }
  if (kind === 'route') {
    const p = name.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '');
    return hitsFor(new RegExp(`['"\`]${escapeRe(p)}['"\`]`), files.filter((f) => f.startsWith('src/')));
  }
  if (kind === 'service') {
    const f = `src/services/${name}.ts`;
    const lines = codeIndex.get(f);
    if (!lines) return [];
    const headerEnd = lines.findIndex((l) => l.includes('*/'));
    const exports = hitsFor(/^export\s/, [f]);
    return [excerpt(root, f, 1, headerEnd + 1), ...exports];
  }
  if (kind === 'export') {
    return hitsFor(new RegExp(`\\bexport\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|const|let|class|interface|type|enum)\\s+${escapeRe(name)}\\b`),
      files.filter((f) => !f.startsWith('tests/')));
  }
  if (kind === 'env') return hitsFor(new RegExp(`process\\.env\\.${escapeRe(name)}\\b`), files.filter((f) => !f.startsWith('tests/')));
  return [];
}

/**
 * A bucket over the comparison budget split into parts one agent can compare carefully.
 * Claims are grouped by the other thing each names (a table's claims by column), because
 * claims about one column are the ones that can contradict each other; claims naming
 * nothing else, and a per-file bucket's claims, are cut in line order so neighbouring
 * claims stay together. Nothing is dropped: every claim lands in exactly one part.
 */
function splitBucket(entity: string, ids: string[], byId: Map<string, Claim>): Array<[string, string[]]> {
  if (ids.length <= COMPARE_BATCH_CLAIMS) return [[entity, ids]];
  const byOther = new Map<string, string[]>();
  const rest: string[] = [];
  for (const id of ids) {
    const other = entity.startsWith('unit:') ? undefined : (byId.get(id)?.entities ?? []).find((e) => e !== entity);
    if (other) {
      if (!byOther.has(other)) byOther.set(other, []);
      byOther.get(other)!.push(id);
    } else {
      rest.push(id);
    }
  }
  // A lone claim about some other thing has nothing in its part to be compared with.
  for (const [other, members] of byOther) {
    if (members.length < 2) {
      rest.push(...members);
      byOther.delete(other);
    }
  }
  const lineOf = (id: string): number => byId.get(id)?.line ?? Number(/@(\d+)/.exec(id)?.[1] ?? 0);
  rest.sort((a, b) => lineOf(a) - lineOf(b));
  const parts: Array<[string, string[]]> = [];
  for (const [other, members] of byOther) {
    for (let i = 0; i < members.length; i += COMPARE_BATCH_CLAIMS) parts.push([`${entity} > ${other}`, members.slice(i, i + COMPARE_BATCH_CLAIMS)]);
  }
  for (let i = 0; i < rest.length; i += COMPARE_BATCH_CLAIMS) {
    parts.push([`${entity} > part ${i / COMPARE_BATCH_CLAIMS + 1}`, rest.slice(i, i + COMPARE_BATCH_CLAIMS)]);
  }
  return parts;
}

/** Claims from one file, or merged from every extraction agent's file in a directory. */
function loadClaims(claimsPath: string): Claim[] {
  if (!statSync(claimsPath).isDirectory()) return JSON.parse(readFileSync(claimsPath, 'utf8'));
  return readdirSync(claimsPath).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => JSON.parse(readFileSync(path.join(claimsPath, f), 'utf8')) as Claim[]);
}

function group(root: string, claimsPath: string, outDir: string): void {
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
  const list = [...buckets].flatMap(([entity, ids]) => splitBucket(entity, [...ids].sort(), byId).map(([name, claimIds]) => {
    const strong = claimIds.some((id) => ['requirement', 'rationale'].includes(byId.get(id)?.type ?? ''));
    return { entity: name, root: entity, claimIds: [...claimIds].sort(), model: strong ? 'opus' : 'sonnet' };
  // A lone claim about a named entity is still checked against the code; a lone
  // claim naming nothing has nothing to be compared with.
  })).filter((b) => b.claimIds.length > 1 || !b.root.startsWith('unit:'));
  // Every tracked code file once, so each bucket's evidence is looked up, not re-read.
  const codeIndex = new Map(
    git(['ls-files', '--cached', '--others', '--exclude-standard'], root).split('\n')
      .filter((f) => f && !SKIP.test(f) && CODE_TREES.test(f) && CODE_EXT.test(f) && existsSync(path.join(root, f)))
      .map((f) => [f, read(root, f).split('\n')] as [string, string[]]),
  );
  if (!codeIndex.has(SCHEMA) && existsSync(path.join(root, SCHEMA))) codeIndex.set(SCHEMA, read(root, SCHEMA).split('\n'));
  const evidence = new Map<string, Evidence[]>();
  for (const b of list) if (!evidence.has(b.root)) evidence.set(b.root, evidenceFor(root, b.root, codeIndex));
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
      const body = entities.map((e) => {
        const b = bucketByEntity.get(e)!;
        return { entity: e, evidence: evidence.get(b.root) ?? [], claims: b.claimIds.map((id) => byId.get(id)) };
      });
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

function record(resultsPath: string, ledgerPath: string, inventoryPath?: string, unitsPath?: string): void {
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  // The file hashes come from the inventory the run read, never through a model.
  const inv = inventoryPath ? JSON.parse(readFileSync(inventoryPath, 'utf8')) : {};
  const prior = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {};
  let invFiles: Record<string, string> = inv.files ?? {};
  const sections: Record<string, string[]> = { ...(prior.sections ?? {}) };
  if (unitsPath) {
    // Only what the run's units cover is marked checked; an id the inventory does not
    // hold is refused, because recording it would mark nothing and say nothing. A
    // commented file is one unit, so it is marked whole. A document is marked whole only
    // when every one of its sections was read; otherwise each section read is recorded
    // by its text's hash, so the sections not read stay unread.
    const docs: Unit[] = inv.units?.docs ?? [];
    const all: Unit[] = [...docs, ...(inv.units?.comments ?? [])];
    const ids = namedUnits(unitsPath, all);
    const wanted = new Set<string>();
    for (const u of all.filter((x) => ids.has(x.id))) {
      const fileDocs = docs.filter((d) => d.file === u.file);
      if (!u.hash || fileDocs.every((d) => ids.has(d.id))) wanted.add(u.file);
      else sections[u.file] = [...new Set([...(sections[u.file] ?? []), u.hash])];
    }
    invFiles = Object.fromEntries(Object.entries(invFiles).filter(([f]) => wanted.has(f)));
  }
  const ledger = {
    head: inv.head ?? results.head,
    sections,
    files: { ...(prior.files ?? {}), ...(results.files ?? {}), ...invFiles },
    findings: results.findings ?? [],
    rulings: [...(prior.rulings ?? []), ...(results.rulings ?? [])],
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  process.stdout.write(`ledger: ${Object.keys(ledger.files).length} files, ${ledger.findings.length} open findings, ${ledger.rulings.length} rulings\n`);
}

function main(): void {
  const { mode, flags } = parseArgs(process.argv.slice(2));
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  if (mode === 'inventory') inventory(root, flags.out, flags.ledger, flags['private-root'], flags.units);
  else if (mode === 'group') group(root, flags.claims, flags.out);
  else record(flags.results, flags.ledger, flags.from, flags.units);
}

main();
