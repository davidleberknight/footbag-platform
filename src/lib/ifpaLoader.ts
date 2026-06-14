import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

export interface ParsedIfpaDoc {
  slug: string;
  title: string;
  bodyHtml: string;
  headings: { id: string; text: string }[];
}

const IFPA_DIR = path.join(process.cwd(), 'ifpa');

const DOC_FILES: { file: string; slug: string; title: string }[] = [
  { file: 'IFPAMembershipStructure_2026.md', slug: 'membership-structure', title: 'IFPA Membership Rules' },
  { file: 'BYLAWS.md',                       slug: 'bylaws',               title: 'IFPA Bylaws' },
  { file: 'ArticlesOfIncorporation.md',      slug: 'articles',             title: 'Articles of Incorporation' },
];

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

function extractHeadings(html: string): { id: string; text: string }[] {
  const headings: { id: string; text: string }[] = [];
  const re = /<h2[^>]*id="([^"]+)"[^>]*>([^<]+)<\/h2>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    headings.push({ id: m[1]!, text: m[2]! });
  }
  return headings;
}

let cache: Map<string, ParsedIfpaDoc> | null = null;

function buildCache(): Map<string, ParsedIfpaDoc> {
  const map = new Map<string, ParsedIfpaDoc>();
  for (const entry of DOC_FILES) {
    const filePath = path.join(IFPA_DIR, entry.file);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    const rawHtml = marked.parse(raw, { async: false }) as string;
    const html = addAnchorIds(rawHtml);
    map.set(entry.slug, {
      slug: entry.slug,
      title: entry.title,
      bodyHtml: html,
      headings: extractHeadings(html),
    });
  }
  return map;
}

function loadIfpaDocs(): Map<string, ParsedIfpaDoc> {
  if (!cache) cache = buildCache();
  return cache;
}

export function getIfpaDocs(): ParsedIfpaDoc[] {
  return [...loadIfpaDocs().values()];
}

export function getIfpaDoc(slug: string): ParsedIfpaDoc | undefined {
  return loadIfpaDocs().get(slug);
}
