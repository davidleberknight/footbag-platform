/**
 * What counts as a named thing a document or comment can drift away from.
 *
 * The per-change doc sync and the whole-repository audit both need to recognise
 * the same things in source text (an exported symbol, a route, an environment
 * variable, a table or column, a CSS class, a story or job identifier), or the
 * two would disagree about whether a document mentions what changed. Keeping
 * the patterns here is what stops that. Recognition is line-based and
 * deliberately literal: a name assembled at run time is invisible here, as it
 * is to a reader grepping the documents.
 */

export type EntityKind = 'export' | 'route' | 'env' | 'table' | 'column' | 'css-class' | 'story';

export interface Entity {
  kind: EntityKind;
  name: string;
}

const CODE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;

const EXPORT_RE =
  /\bexport\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const ROUTE_RE = /\.(?:get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`\s]*)['"`]/g;
const ENV_RE = /process\.env\.([A-Z][A-Z0-9_]+)/g;
const TABLE_RE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z_]\w*)/gi;
const ADD_COLUMN_RE = /\bADD\s+COLUMN\s+["`]?([A-Za-z_]\w*)/gi;
const COLUMN_DEF_RE =
  /^\s*["`]?([a-z][a-z0-9_]*)["`]?\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC|BOOLEAN)\b/i;
const CSS_CLASS_RE = /\.([a-zA-Z][\w-]*)(?=[\s{,:.>+~[)]|$)/g;
// Story prefixes as the user stories and background jobs use them.
const STORY_RE = /\b(?:V|M|A|EO|CL|GO|SYS)_[A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*\b/g;

// Column words that name a column on nearly every table; searching documents for
// them would return the whole data model.
const GENERIC_COLUMNS = new Set([
  'id', 'name', 'slug', 'status', 'version', 'created_at', 'updated_at', 'created_by',
  'updated_by', 'deleted_at', 'notes', 'title', 'description', 'kind', 'type', 'value',
]);

function collect(re: RegExp, line: string, kind: EntityKind, out: Entity[]): void {
  re.lastIndex = 0;
  for (const m of line.matchAll(re)) out.push({ kind, name: m[1] ?? m[0] });
}

/** Every entity a single source line names, judged by the file it came from. */
export function extractEntities(line: string, filePath: string): Entity[] {
  const out: Entity[] = [];
  // A test's literals (its fixture tables, the routes it requests, the names it makes
  // up) are not the application's surface, and no document should describe them.
  if (filePath.startsWith('tests/')) return out;
  if (CODE_EXT.test(filePath)) {
    collect(EXPORT_RE, line, 'export', out);
    if (filePath.startsWith('src/')) collect(ROUTE_RE, line, 'route', out);
    collect(ENV_RE, line, 'env', out);
  }
  if (CODE_EXT.test(filePath) || filePath.endsWith('.sql')) {
    collect(TABLE_RE, line, 'table', out);
    collect(ADD_COLUMN_RE, line, 'column', out);
  }
  if (filePath.endsWith('.sql')) {
    const m = COLUMN_DEF_RE.exec(line);
    if (m) out.push({ kind: 'column', name: m[1] });
  }
  if (filePath.endsWith('.css') && /[{,]\s*$/.test(line) && !line.trim().startsWith('/*')) {
    collect(CSS_CLASS_RE, line, 'css-class', out);
  }
  STORY_RE.lastIndex = 0;
  // Story and job identifiers are mixed case; an all-capitals name is a file or constant.
  for (const m of line.matchAll(STORY_RE)) if (/[a-z]/.test(m[0])) out.push({ kind: 'story', name: m[0] });
  return out;
}

/**
 * Whether a name is specific enough that a whole-word search over the documents
 * finds mentions of this thing rather than of the word. A generic column or a
 * short plain word would bury the real hits.
 */
export function isSearchable(e: Entity): boolean {
  if (e.kind === 'column') return !GENERIC_COLUMNS.has(e.name) && e.name.includes('_');
  if (e.kind === 'css-class') return e.name.includes('-') || e.name.length >= 8;
  if (e.kind === 'route') return e.name.length > 1;
  // A single capitalised or lowercase word (Entity, render) is prose as often as code.
  if (e.kind === 'export') return /[a-z][A-Z]|_/.test(e.name) || e.name.length >= 12;
  return e.name.length >= 4;
}

export function entityKey(e: Entity): string {
  return `${e.kind}:${e.name}`;
}

// Each language's comment openers; a `#` is a comment in a shell script and an ID
// selector in a stylesheet, so the file decides.
const SLASH = /^\s*(?:\/\/|\/\*|\*)/;
const HASH = /^\s*#(?!!)/;
const COMMENT_BY_EXT: Array<[RegExp, RegExp]> = [
  [/\.(ts|tsx|js|mjs|cjs|css)$/, SLASH],
  [/\.hbs$/, /^\s*(?:\{\{!|<!--)/],
  [/\.(sh|py)$/, HASH],
  [/\.tf$/, /^\s*(?:#|\/\/|\/\*|\*)/],
  [/\.sql$/, /^\s*(?:--|\/\*|\*)/],
];

/** Whether a line of the given file is a comment line in that file's language. */
export function isCommentLine(line: string, filePath: string): boolean {
  const entry = COMMENT_BY_EXT.find(([ext]) => ext.test(filePath));
  return entry ? entry[1].test(line) : false;
}

/**
 * The 1-based numbers of every comment line in a whole file, including the
 * continuation lines of a block comment, which carry no opener of their own and
 * so are invisible to a line-by-line test.
 */
export function commentLines(lines: string[], filePath: string): Set<number> {
  // Longer openers first: `{{!--` must not be read as `{{!`.
  const blocks: Array<[string, string]> = /\.(ts|tsx|js|mjs|cjs|css|tf|sql)$/.test(filePath)
    ? [['/*', '*/']]
    : /\.hbs$/.test(filePath) ? [['{{!--', '--}}'], ['{{!', '}}']] : [];
  const out = new Set<number>();
  let open: string | null = null;
  lines.forEach((line, i) => {
    let isComment = false;
    if (open) {
      isComment = true;
      if (line.includes(open)) open = null;
    } else {
      const t = line.trimStart();
      const hit = blocks.find(([o]) => t.startsWith(o));
      if (hit) {
        isComment = true;
        const after = line.indexOf(hit[0]) + hit[0].length;
        if (!line.includes(hit[1], after)) open = hit[1];
      }
    }
    if (isComment || isCommentLine(line, filePath)) out.add(i + 1);
  });
  return out;
}
