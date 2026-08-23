/**
 * Casing conformance for platform-authored interface chrome: heading tags and
 * button labels in templates, and the page titles services author.
 *
 * The rule itself is `toTitleCase`, which this imports rather than restating, so
 * the rule and the gate that enforces it cannot drift apart. Prose alone is what
 * let two casing systems coexist across the site and pass every gate; this is
 * the check that closes that.
 *
 * Two kinds of text are deliberately out of range, and both are handled here
 * mechanically rather than by author discipline:
 *
 * - Anything carrying an interpolation is skipped, because the platform never
 *   re-cases a value it did not write: a member, club, event or trick name is
 *   shown exactly as its owner entered it.
 * - The long-form freestyle reference is excepted below. Its subheads are the
 *   prose of an article rather than the chrome of an interface, and a sentence
 *   is not a label.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { toTitleCase } from '../../src/lib/titleCase';

const ROOT = process.cwd();
const VIEWS = path.join(ROOT, 'src', 'views');
const SERVICES = path.join(ROOT, 'src', 'services');
const CONTROLLERS = path.join(ROOT, 'src', 'controllers');

/**
 * Template surfaces whose headings are article content, not chrome, each with
 * the reason. The page title of such a page is still chrome under the rule, but
 * it comes from the service layer on every one of these, and those services are
 * excepted below too, so those page titles are genuinely unchecked rather than
 * covered elsewhere.
 */
const EDITORIAL_SURFACES = new Map<string, string>([
  ['freestyle/', 'the long-form freestyle reference: article subheads, not interface chrome'],
  ['partials/freestyle-', 'freestyle reference panels included into those articles'],
  ['partials/trick-', 'trick-page reference panels: notation and pathway prose'],
  ['partials/symbolic-', 'symbolic reference panels woven into the trick pages'],
]);

/**
 * Service files excepted from the page-title scan, each with the reason.
 *
 * The freestyle services are excepted for the same reason their templates are:
 * they author the text of the long-form reference. They also hardcode some of
 * the same label text in those templates, so casing one side alone would split a
 * single label into two spellings on the rendered page. The surface is out of
 * scope as a whole, both halves of it.
 */
const EXCEPTED_SERVICES = new Map<string, string>([
  ['countryUtils.ts', 'country names: proper nouns the platform does not author'],
  ['freestyleService.ts', 'authors the long-form freestyle reference, template text included'],
  ['symbolicLearnIndex.ts', 'the freestyle reference index: article content, not chrome'],
  ['symbolicProgressions.ts', 'hand-authored freestyle progression prose'],
  ['symbolicTrickPanels.ts', 'freestyle reference panels woven into the article pages'],
]);

function allFiles(dir: string, ext: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allFiles(full, ext);
    return e.name.endsWith(ext) ? [full] : [];
  });
}

function viewKey(file: string): string {
  return path.relative(VIEWS, file).split(path.sep).join('/');
}

function isEditorial(file: string): boolean {
  const key = viewKey(file);
  return [...EDITORIAL_SURFACES.keys()].some((prefix) => key.startsWith(prefix));
}

/**
 * Strip nested elements together with their content, so only the text the
 * heading itself carries is checked. A chip or badge sitting inside a heading is
 * its own label and is not part of the heading's sentence.
 */
function directText(inner: string): string {
  let text = inner;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<([a-z][a-z0-9]*)\b[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/gi, ' ');
  } while (text !== previous);
  return text.replace(/\s+/g, ' ').trim();
}

/** A Handlebars expression or block tag, triple-stache first so it wins. */
const INTERPOLATION = /\{\{\{[\s\S]*?\}\}\}|\{\{[\s\S]*?\}\}/g;

/**
 * A stand-in for an interpolated value: it carries no letters, so the casing
 * rule passes it through untouched, while still counting as a word for the
 * first-and-last-word exception. That is what lets a heading like
 * "Current administrators ({{n}})" be checked at all — the count is the last
 * word, so the word before it is an ordinary one that must be capitalised.
 */
const PLACEHOLDER = '';

function maskInterpolations(text: string): { masked: string; parts: string[] } {
  const parts: string[] = [];
  const masked = text.replace(INTERPOLATION, (match) => {
    parts.push(match);
    return PLACEHOLDER;
  });
  return { masked, parts };
}

function restoreInterpolations(text: string, parts: string[]): string {
  let i = 0;
  return text.replace(new RegExp(PLACEHOLDER, 'g'), () => parts[i++] ?? PLACEHOLDER);
}

interface Offender {
  file: string;
  line: number;
  found: string;
  expected: string;
}

/** Line number of a character offset, 1-indexed. */
function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function checkLiteral(
  offenders: Offender[],
  file: string,
  source: string,
  index: number,
  text: string,
): number {
  // A fragment left behind by a stripped child element is not a heading.
  if (text.length === 0 || text.includes('<')) return 0;
  // A sentence is not a label. Some page titles are a line of prose introducing
  // the page rather than naming it, and a trailing full stop is what separates
  // the two: no label ends in one.
  if (/\.\s*$/.test(text) && /\s/.test(text)) return 0;
  // An interpolated value keeps its own casing, so it is masked out rather than
  // the whole heading being skipped: the words the platform did author are
  // still the platform's to case.
  const { masked, parts } = maskInterpolations(text);
  if (!/[a-zA-Z]/.test(masked)) return 0;
  const expected = restoreInterpolations(toTitleCase(masked), parts);
  if (expected !== text) {
    offenders.push({
      file: path.relative(ROOT, file),
      line: lineOf(source, index),
      found: text,
      expected,
    });
  }
  return 1;
}

function report(offenders: Offender[]): string {
  return offenders
    .map((o) => `${o.file}:${o.line}  "${o.found}"  ->  "${o.expected}"`)
    .join('\n');
}

const HEADING = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
const BUTTON = /<(a|button)\b([^>]*\bclass="[^"]*\bbtn\b[^"]*"[^>]*)>([\s\S]*?)<\/\1>/gi;
// Quoted titles, plus a backtick template literal carrying no substitution: a
// static one is an ordinary string wearing different punctuation, and leaving
// it unscanned is a hole an author cannot be expected to know about.
const SERVICE_TITLE = /\btitle:\s*(?:(['"])([^'"\\\n]*)\1|`([^`$\\\n]*)`)/g;

const headingOffenders: Offender[] = [];
const buttonOffenders: Offender[] = [];
const titleOffenders: Offender[] = [];
let headingsScanned = 0;
let buttonsScanned = 0;
let titlesScanned = 0;

for (const file of allFiles(VIEWS, '.hbs')) {
  const source = fs.readFileSync(file, 'utf8');
  const editorial = isEditorial(file);

  for (const m of source.matchAll(HEADING)) {
    // On an editorial surface only the page title is chrome, and every one of
    // those is interpolated from the service layer, so nothing is scanned here.
    if (editorial) continue;
    headingsScanned += checkLiteral(
      headingOffenders,
      file,
      source,
      m.index,
      directText(m[2]),
    );
  }

  // A button is chrome wherever it sits, including on an editorial page.
  for (const m of source.matchAll(BUTTON)) {
    buttonsScanned += checkLiteral(buttonOffenders, file, source, m.index, directText(m[3]));
  }
}

// Controllers author page titles too. Leaving them unscanned is how one auth
// response came to return two casings of the same title in one object.
for (const file of [...allFiles(SERVICES, '.ts'), ...allFiles(CONTROLLERS, '.ts')]) {
  if ([...EXCEPTED_SERVICES.keys()].some((name) => file.endsWith(name))) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const m of source.matchAll(SERVICE_TITLE)) {
    titlesScanned += checkLiteral(titleOffenders, file, source, m.index, (m[2] ?? m[3]).trim());
  }
}

describe('interface chrome casing conformance', () => {
  it('every template heading outside the editorial surfaces is Title Case', () => {
    expect(headingOffenders, report(headingOffenders)).toEqual([]);
  });

  it('every button and call-to-action label is Title Case', () => {
    expect(buttonOffenders, report(buttonOffenders)).toEqual([]);
  });

  it('every service-authored page title is Title Case', () => {
    expect(titleOffenders, report(titleOffenders)).toEqual([]);
  });

  it('the scanners still find the population they police', () => {
    // A regex that silently stops matching would make every check above pass
    // while asserting nothing. These floors sit well under the real counts, so
    // they survive ordinary editing and fail on a scanner that broke.
    expect(headingsScanned, 'heading scanner found almost nothing').toBeGreaterThan(100);
    expect(buttonsScanned, 'button scanner found almost nothing').toBeGreaterThan(100);
    expect(titlesScanned, 'service page-title scanner found almost nothing').toBeGreaterThan(50);
  });

  it('every named exception still exists, so the list cannot rot', () => {
    const viewKeys = allFiles(VIEWS, '.hbs').map(viewKey);
    for (const [prefix, reason] of EDITORIAL_SURFACES) {
      expect(
        viewKeys.some((key) => key.startsWith(prefix)),
        `editorial exception matches no template: ${prefix} (${reason})`,
      ).toBe(true);
    }
    const serviceFiles = allFiles(SERVICES, '.ts');
    for (const [name, reason] of EXCEPTED_SERVICES) {
      expect(
        serviceFiles.some((file) => file.endsWith(name)),
        `service exception matches no file: ${name} (${reason})`,
      ).toBe(true);
    }
  });
});
