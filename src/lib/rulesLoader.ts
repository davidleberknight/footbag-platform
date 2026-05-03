import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

export interface RulesDisciplineFrontmatter {
  discipline: string;
  disciplineLabel: string;
  authority: string;
  effective: string | null;
  parentHref: string;
  parentLabel: string;
}

export interface ParsedRulePage {
  discipline: string;
  disciplineLabel: string;
  slug: string;
  title: string;
  authority: string;
  effective: string | null;
  parentHref: string;
  parentLabel: string;
  alternateLanguageLabel: string | null;
  alternateLanguageHref: string | null;
  bodyHtml: string;
  headings: { id: string; text: string }[];
}

const RULES_DIR = path.join(process.cwd(), 'ifpa', 'rules');

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kv) fm[kv[1]!] = kv[2]!.trim();
  }
  return { fm, body: match[2]! };
}

/** Split a markdown body on top-level `# ` headings. Each segment becomes one rule page. */
function splitByH1(body: string): { headingText: string; segment: string }[] {
  const lines = body.split(/\r?\n/);
  const segments: { headingText: string; segment: string }[] = [];
  let current: { headingText: string; lines: string[] } | null = null;
  for (const line of lines) {
    const h1 = line.match(/^# +(.+?)\s*$/);
    if (h1) {
      if (current) segments.push({ headingText: current.headingText, segment: current.lines.join('\n') });
      current = { headingText: h1[1]!, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) segments.push({ headingText: current.headingText, segment: current.lines.join('\n') });
  return segments;
}

/** Extract H2 headings (rendered to id="..." anchors) from a marked-rendered HTML fragment. */
function extractHeadings(html: string): { id: string; text: string }[] {
  const headings: { id: string; text: string }[] = [];
  const re = /<h2[^>]*id="([^"]+)"[^>]*>([^<]+)<\/h2>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    headings.push({ id: m[1]!, text: m[2]! });
  }
  return headings;
}

let cache: Map<string, ParsedRulePage> | null = null;

/** Add id="..." attributes to h1-h6 tags. Library-version-agnostic post-process. */
function addAnchorIds(html: string): string {
  return html.replace(
    /<(h[1-6])>([\s\S]*?)<\/\1>/g,
    (_match, tag, inner) => {
      const text = inner.replace(/<[^>]+>/g, '');
      const id = slugifyHeading(text);
      return `<${tag} id="${id}">${inner}</${tag}>`;
    },
  );
}

function buildCache(): Map<string, ParsedRulePage> {
  const map = new Map<string, ParsedRulePage>();
  if (!fs.existsSync(RULES_DIR)) return map;
  for (const file of fs.readdirSync(RULES_DIR)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(RULES_DIR, file), 'utf8');
    const { fm, body } = parseFrontmatter(raw);
    const discipline = fm['discipline'] ?? path.basename(file, '.md');
    const disciplineLabel = fm['disciplineLabel'] ?? discipline;
    const authority = fm['authority'] ?? '';
    const effective = fm['effective'] ?? null;
    const parentHref = fm['parentHref'] ?? '/rules';
    const parentLabel = fm['parentLabel'] ?? 'Rules';
    const alternateLanguageLabel = fm['alternateLanguageLabel'] ?? null;
    const alternateLanguageHref = fm['alternateLanguageHref'] ?? null;

    for (const { headingText, segment } of splitByH1(body)) {
      const slug = slugifyHeading(headingText);
      const rawHtml = marked.parse(segment, { async: false }) as string;
      const html = addAnchorIds(rawHtml);
      map.set(`${discipline}/${slug}`, {
        discipline,
        disciplineLabel,
        slug,
        title: headingText,
        authority,
        effective,
        parentHref,
        parentLabel,
        alternateLanguageLabel,
        alternateLanguageHref,
        bodyHtml: html,
        headings: extractHeadings(html),
      });
    }
  }
  return map;
}

export function loadRulePages(): Map<string, ParsedRulePage> {
  if (!cache) cache = buildCache();
  return cache;
}

export function listRulePages(): ParsedRulePage[] {
  return [...loadRulePages().values()];
}

export function getRulePage(discipline: string, slug: string): ParsedRulePage | undefined {
  return loadRulePages().get(`${discipline}/${slug}`);
}

export interface RuleDisciplineGroup {
  discipline: string;
  label: string;
  pages: ParsedRulePage[];
}

const DISCIPLINE_ORDER = ['sideline', 'net', 'golf', 'freestyle'];

export function listGroupedByDiscipline(): RuleDisciplineGroup[] {
  const byDiscipline = new Map<string, ParsedRulePage[]>();
  for (const page of listRulePages()) {
    const arr = byDiscipline.get(page.discipline) ?? [];
    arr.push(page);
    byDiscipline.set(page.discipline, arr);
  }
  return DISCIPLINE_ORDER
    .filter((d) => byDiscipline.has(d))
    .map((discipline) => {
      const pages = byDiscipline.get(discipline)!;
      return {
        discipline,
        label: pages[0]!.disciplineLabel,
        pages,
      };
    });
}

/** Test-only: clear the in-memory cache so subsequent calls re-read disk. */
export function _resetRulesCache(): void {
  cache = null;
}
