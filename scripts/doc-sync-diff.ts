/**
 * Per-change doc sync: map one change to every document, rule, skill and code
 * comment that names what it changed.
 *
 * A code change goes stale in places the change never touched: a renamed export
 * still named in a rule, a removed route still described in a design document, a
 * comment above the edited function still promising the old behaviour. Finding
 * those by judgement misses them, so this script finds them mechanically and the
 * doc sync judges only what it prints. It reads the change against a base (HEAD
 * by default), extracts the entities the added and removed lines name, searches
 * the documentation, the harness, the code comments and, when present, the
 * private operations checkout for each, and lists the comments around every
 * changed hunk. An entity added with no mention anywhere is listed too: it is
 * either undocumented or deliberately internal, and only a reader can tell which.
 *
 * With `--receipt <file>` it also writes the hash of the non-documentation change
 * it examined, which the Stop hook compares against the tree in front of it, so
 * the gate clears only for a change that was actually checked.
 *
 * Read-only: it changes nothing in the repository and refuses no input beyond an
 * unknown option or a base git cannot resolve.
 *
 * Usage: npx tsx scripts/doc-sync-diff.ts [--base <ref>] [--receipt <file>]
 *   --base <ref>      compare against this commit (default HEAD)
 *   --receipt <file>  write the receipt for the Stop hook to this path
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  commentLines, entityKey, extractEntities, isCommentLine, isSearchable, type Entity,
} from './lib/doc-entities';

// Must match the specs in scripts/lib/doc-sync-diff-hash.sh, which the receipt hashes.
const NON_DOC_SPECS = ['--', '.', ':(exclude,glob)**/*.md', ':(exclude)docs'];
// Every markdown file: the docs, the rules, the skills and the CLAUDE.md files.
const DOC_SPECS = ['--', ':(glob)**/*.md'];
const PRIVATE_DIR = 'footbag_private_repo';
const MAX_HITS_PER_ENTITY = 40;
const COMMENT_EXT = /\.(ts|tsx|js|mjs|cjs|hbs|css|sh|py|sql|tf)$/;
const DECLARATION_RE = /^(?:export\s|async\s|function\s|const\s|let\s|class\s|interface\s|type\s|[A-Za-z_$][\w$]*\s*\()/;

function usage(code: number): never {
  const out = code === 0 ? process.stdout : process.stderr;
  out.write('Usage: npx tsx scripts/doc-sync-diff.ts [--base <ref>] [--receipt <file>]\n');
  out.write('Maps a change to the docs, rules, skills and comments that name it. Changes nothing.\n');
  process.exit(code);
}

function parseArgs(argv: string[]): { base: string; receipt: string | null } {
  let base = 'HEAD';
  let receipt: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--base' && argv[i + 1]) base = argv[++i];
    else if (a === '--receipt' && argv[i + 1]) receipt = argv[++i];
    else {
      process.stderr.write(`doc-sync-diff: unknown option '${a}'\n`);
      usage(2);
    }
  }
  return { base, receipt };
}

function git(args: string[], root: string, allowFail = false): string {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    // git grep exits 1 for no match, which is an answer, not a failure.
    if (allowFail) return (err as { stdout?: string }).stdout ?? '';
    throw err;
  }
}

interface FileChange {
  file: string;
  added: string[];
  removed: string[];
  hunks: Array<{ start: number; count: number }>;
  // A new file has no older comment that the change could have made stale.
  isNew: boolean;
}

function parseDiff(diff: string): FileChange[] {
  const files: FileChange[] = [];
  let cur: FileChange | null = null;
  let fromNull = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4);
      cur = p === '/dev/null'
        ? null
        : { file: p.replace(/^b\//, ''), added: [], removed: [], hunks: [], isNew: fromNull };
      if (cur) files.push(cur);
      continue;
    }
    if (line.startsWith('--- ')) {
      fromNull = line.slice(4) === '/dev/null';
      continue;
    }
    if (line.startsWith('diff --git')) continue;
    if (line.startsWith('@@')) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (m && cur) cur.hunks.push({ start: Number(m[1]), count: m[2] === undefined ? 1 : Number(m[2]) });
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('+')) cur.added.push(line.slice(1));
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  return files;
}

/** Deleted files never reach parseDiff's file list; their removed lines still name entities. */
function deletedFileLines(diff: string): Array<{ file: string; lines: string[] }> {
  const out: Array<{ file: string; lines: string[] }> = [];
  let cur: { file: string; lines: string[] } | null = null;
  let pendingFrom = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) pendingFrom = line.slice(4).replace(/^a\//, '');
    else if (line.startsWith('+++ ')) {
      cur = line.slice(4) === '/dev/null' ? { file: pendingFrom, lines: [] } : null;
      if (cur) out.push(cur);
    } else if (cur && line.startsWith('-')) cur.lines.push(line.slice(1));
  }
  return out;
}

function trim(s: string): string {
  const t = s.trim();
  return t.length > 160 ? `${t.slice(0, 157)}...` : t;
}

/** The comment lines inside a hunk, plus the comment block heading the declaration that encloses it. */
function commentsNear(
  lines: string[], comments: Set<number>, start: number, count: number,
): Array<{ line: number; text: string }> {
  const picked = new Map<number, string>();
  const first = Math.max(1, start);
  const last = Math.min(lines.length, start + Math.max(count, 1) - 1);
  for (let n = first; n <= last; n++) if (comments.has(n)) picked.set(n, lines[n - 1]);
  // Walk up to the enclosing declaration (the hunk's own first line may be it),
  // then take the comment block above it.
  let n = first;
  const floor = Math.max(1, first - 80);
  while (n >= floor && !DECLARATION_RE.test(lines[n - 1].trimStart())) n--;
  if (n >= floor) {
    let c = n - 1;
    while (c >= 1 && comments.has(c)) {
      picked.set(c, lines[c - 1]);
      c--;
    }
  }
  return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([line, text]) => ({ line, text }));
}

function main(): void {
  const { base, receipt } = parseArgs(process.argv.slice(2));
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  try {
    git(['rev-parse', '--verify', '-q', `${base}^{commit}`], root);
  } catch {
    process.stderr.write(`doc-sync-diff: cannot resolve base '${base}'\n`);
    process.exit(2);
  }

  const diff = git(['diff', '-U0', base, ...NON_DOC_SPECS], root);
  const changes = parseDiff(diff);
  const untracked = git(['ls-files', '--others', '--exclude-standard', ...NON_DOC_SPECS], root)
    .split('\n').filter(Boolean);
  for (const file of untracked) {
    const abs = path.join(root, file);
    if (!statSync(abs).isFile()) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    changes.push({ file, added: lines, removed: [], hunks: [{ start: 1, count: lines.length }], isNew: true });
  }
  const deleted = deletedFileLines(diff);

  const plus = new Map<string, Entity>();
  const minus = new Map<string, Entity>();
  for (const c of changes) {
    for (const l of c.added) for (const e of extractEntities(l, c.file)) plus.set(entityKey(e), e);
    for (const l of c.removed) for (const e of extractEntities(l, c.file)) minus.set(entityKey(e), e);
  }
  for (const d of deleted) for (const l of d.lines) for (const e of extractEntities(l, d.file)) minus.set(entityKey(e), e);
  const added = [...plus].filter(([k]) => !minus.has(k)).map(([, e]) => e);
  const removed = [...minus].filter(([k]) => !plus.has(k)).map(([, e]) => e);

  const changedFiles = [...changes.map((c) => c.file), ...deleted.map((d) => d.file)];
  const out: string[] = [];
  out.push(`doc-sync-diff: base ${base}, ${changedFiles.length} changed code file(s)`);
  for (const f of changedFiles) out.push(`CHANGED  ${f}`);

  const privateDir = path.join(root, PRIVATE_DIR);
  const privatePresent = existsSync(privateDir) && statSync(privateDir).isDirectory();
  let hitCount = 0;
  const silent: string[] = [];

  const report = (label: string, e: Entity, stillInCode: boolean | null): void => {
    const suffix = stillInCode === null ? '' : stillInCode ? ' (still named elsewhere in code)' : ' (gone from code)';
    if (!isSearchable(e)) {
      out.push(`  ${label} ${e.kind} ${e.name}${suffix}: too generic to search`);
      return;
    }
    const hits: string[] = [];
    for (const l of git(['grep', '-n', '-w', '-F', '--untracked', '-e', e.name, ...DOC_SPECS], root, true).split('\n')) {
      if (l) hits.push(l);
    }
    for (const l of git(['grep', '-n', '-w', '-F', '--untracked', '-e', e.name, ...NON_DOC_SPECS], root, true).split('\n')) {
      const m = /^([^:]+):(\d+):(.*)$/.exec(l);
      if (m && isCommentLine(m[3], m[1])) hits.push(`${m[1]}:${m[2]} [comment]:${m[3]}`);
    }
    if (privatePresent) {
      try {
        const r = execFileSync('grep', ['-rn', '-w', '-F', '--include=*.md', '-e', e.name, `${PRIVATE_DIR}/`], {
          cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        });
        for (const l of r.split('\n')) if (l) hits.push(`${l} [private]`);
      } catch {
        // grep exits 1 for no match.
      }
    }
    if (hits.length === 0) {
      silent.push(`${label} ${e.kind} ${e.name}${suffix}`);
      return;
    }
    hitCount += hits.length;
    out.push(`  ${label} ${e.kind} ${e.name}${suffix}: ${hits.length} hit(s)`);
    for (const h of hits.slice(0, MAX_HITS_PER_ENTITY)) out.push(`    ${trim(h)}`);
    if (hits.length > MAX_HITS_PER_ENTITY) out.push(`    ... ${hits.length - MAX_HITS_PER_ENTITY} more not shown`);
  };

  out.push('HITS');
  if (added.length + removed.length === 0) out.push('  no named entity added or removed');
  for (const e of removed) {
    // Still in code means a line of code, not a comment that merely names it.
    const inCode = git(['grep', '-n', '-w', '-F', '--untracked', '-e', e.name, ...NON_DOC_SPECS], root, true)
      .split('\n')
      .some((l) => {
        const m = /^([^:]+):\d+:(.*)$/.exec(l);
        return m !== null && !isCommentLine(m[2], m[1]);
      });
    report('removed', e, inCode);
  }
  for (const e of added) report('added', e, null);
  out.push('NO MENTION ANYWHERE (undocumented, or internal by design)');
  if (silent.length === 0) out.push('  none');
  for (const s of silent) out.push(`  ${s}`);

  out.push('COMMENTS NEAR CHANGES');
  let anyComments = false;
  for (const c of changes) {
    if (!COMMENT_EXT.test(c.file)) continue;
    if (c.isNew) {
      out.push(`  ${c.file}: new file, every comment in it is new`);
      continue;
    }
    const abs = path.join(root, c.file);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    const comments = commentLines(lines, c.file);
    const seen = new Set<number>();
    const picked: Array<{ line: number; text: string }> = [];
    for (const h of c.hunks) {
      for (const p of commentsNear(lines, comments, h.start, h.count)) {
        if (!seen.has(p.line)) {
          seen.add(p.line);
          picked.push(p);
        }
      }
    }
    if (picked.length === 0) continue;
    anyComments = true;
    out.push(`  ${c.file}`);
    for (const p of picked.sort((a, b) => a.line - b.line)) out.push(`    ${p.line}: ${trim(p.text)}`);
  }
  if (!anyComments) out.push('  none');

  out.push(`PRIVATE OPS DOCS: ${privatePresent ? 'searched' : 'not present on this machine, not searched'}`);

  if (receipt) {
    const hash = execFileSync('bash', [path.join(root, 'scripts/lib/doc-sync-diff-hash.sh')], {
      cwd: root, encoding: 'utf8',
    }).trim();
    writeFileSync(receipt, `${JSON.stringify({ hash, base, hits: hitCount, entities: added.length + removed.length })}\n`);
    out.push(`RECEIPT: ${receipt}`);
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

main();
