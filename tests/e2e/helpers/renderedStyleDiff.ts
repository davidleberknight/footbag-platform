/**
 * Compares two captures of the same page and checks findings against the
 * known-findings baseline.
 *
 * The diff proves a stylesheet refactor changed only what it meant to: a
 * dead-CSS deletion must change nothing at all, and a merge of two table
 * treatments must change only the properties the merge intended. It compares
 * computed numbers, not pictures, so a one-pixel shift is reported exactly
 * and nothing depends on anti-aliasing. Two captures are comparable only when
 * they come from the same machine, because fonts differ between systems.
 *
 * The baseline lists findings that exist today and are being worked down. It
 * holds rule, template, viewport, a maximum count and a short hash of the
 * elements found, and no measured numbers, so ordinary refactors and font
 * differences between machines do not churn it, while fixing one finding and
 * adding another of the same rule on the same page cannot pass as no change.
 */
import { createHash } from 'node:crypto';
import {
  CaptureView, normalizeColor, STYLE_PROPS,
  type Capture, type Finding, type Rect, type StyleProp,
} from './renderedStyle';

export interface StyleChange { key: string; prop: StyleProp; before: string; after: string }
export interface Move { key: string; before: Rect; after: Rect }

export interface PageDiff {
  url: string;
  viewport: number;
  added: string[];
  removed: string[];
  restyled: StyleChange[];
  /** Elements whose box moved or resized while none of their own properties changed. */
  moved: Move[];
}

export interface DiffOptions {
  /** Geometry tolerance in px; differences at or under it are noise. */
  geomTol?: number;
  ignore?: readonly StyleProp[];
}

const COLOR_PROPS = new Set<StyleProp>(['color', 'background-color', 'border-top-color', 'border-left-color']);

function normalized(prop: StyleProp, value: string): string {
  return COLOR_PROPS.has(prop) ? normalizeColor(value) : value;
}

/**
 * Pixel lengths within the tolerance are rounding noise; every other number
 * (an opacity, a colour's alpha, a unitless weight or line height) must match
 * exactly, because a change of 0.4 there is a visible fade or restyle.
 */
function numericClose(a: string, b: string, tol: number): boolean {
  const re = /(-?\d+(?:\.\d+)?)px/g;
  if (a.replace(re, '#px') !== b.replace(re, '#px')) return false;
  const na = [...a.matchAll(re)].map((m) => parseFloat(m[1]));
  const nb = [...b.matchAll(re)].map((m) => parseFloat(m[1]));
  return na.length === nb.length && na.every((x, k) => Math.abs(x - nb[k]) <= tol);
}

function rectMoved(a: Rect, b: Rect, tol: number): boolean {
  return Math.abs(a.x - b.x) > tol || Math.abs(a.y - b.y) > tol || Math.abs(a.w - b.w) > tol || Math.abs(a.h - b.h) > tol;
}

export function diffCaptures(a: Capture, b: Capture, opts: DiffOptions = {}): PageDiff {
  const tol = opts.geomTol ?? 0.5;
  const ignore = new Set(opts.ignore ?? []);
  const va = new CaptureView(a);
  const vb = new CaptureView(b);
  const byKeyA = new Map(a.elements.map((e) => [e.key, e]));
  const byKeyB = new Map(b.elements.map((e) => [e.key, e]));
  const diff: PageDiff = { url: b.url, viewport: b.viewport.width, added: [], removed: [], restyled: [], moved: [] };

  for (const key of byKeyA.keys()) if (!byKeyB.has(key)) diff.removed.push(key);
  for (const [key, eb] of byKeyB) {
    const ea = byKeyA.get(key);
    if (!ea) { diff.added.push(key); continue; }
    let changed = false;
    for (const prop of STYLE_PROPS) {
      if (ignore.has(prop)) continue;
      const before = normalized(prop, va.style(ea, prop));
      const after = normalized(prop, vb.style(eb, prop));
      if (before === after || numericClose(before, after, tol)) continue;
      diff.restyled.push({ key, prop, before, after });
      changed = true;
    }
    if (!changed && rectMoved(ea.rect, eb.rect, tol)) diff.moved.push({ key, before: ea.rect, after: eb.rect });
  }
  return diff;
}

export function isEmptyDiff(d: PageDiff): boolean {
  return d.added.length === 0 && d.removed.length === 0 && d.restyled.length === 0 && d.moved.length === 0;
}

/**
 * Groups a diff by selector, property and the before and after values, so a
 * change repeated over hundreds of rows reads as one line with a count.
 */
export function summariseDiff(d: PageDiff): string[] {
  const strip = (k: string) => k.replace(/:nth\(\d+\)/g, '');
  const groups = new Map<string, number>();
  for (const c of d.restyled) {
    const line = `${strip(c.key)}: ${c.prop} ${c.before} -> ${c.after}`;
    groups.set(line, (groups.get(line) ?? 0) + 1);
  }
  const lines = [...groups].map(([line, n]) => (n > 1 ? `${line} (x${n})` : line)).sort();
  if (d.added.length) lines.push(`added: ${d.added.length} element(s), e.g. ${strip(d.added[0])}`);
  if (d.removed.length) lines.push(`removed: ${d.removed.length} element(s), e.g. ${strip(d.removed[0])}`);
  if (d.moved.length) lines.push(`moved without restyle: ${d.moved.length} element(s), e.g. ${strip(d.moved[0].key)}`);
  return lines;
}

// ── Baseline ──────────────────────────────────────────────────────────────

export interface BaselineEntry {
  rule: string;
  template: string;
  viewport: number;
  max: number;
  /** A short hash of the sorted selectors found, so the same count over other elements is told apart. */
  elements: string;
}

/** Plain code-point order, the same on every machine; a locale-aware sort would reorder the committed file between machines. */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function baselineKey(rule: string, template: string, viewport: number): string {
  return `${rule}\t${template}\t${viewport}`;
}

/** A short hash of a set of finding selectors, the same whatever order they were found in. */
export function selectorHash(selectors: readonly string[]): string {
  return createHash('sha1').update([...selectors].sort(byCodePoint).join('\n')).digest('hex').slice(0, 8);
}

/** Parses tab-separated `rule template viewport max elements` lines; blank lines and `#` comments are skipped. */
export function parseBaseline(text: string): BaselineEntry[] {
  const out: BaselineEntry[] = [];
  for (const [n, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    const max = Number(parts[3]);
    if (parts.length !== 5 || !Number.isInteger(max) || max < 1 || !/^[0-9a-f]{8}$/.test(parts[4])) {
      throw new Error(`baseline line ${n + 1} is not "rule<TAB>template<TAB>viewport<TAB>count<TAB>elements": ${raw}`);
    }
    out.push({ rule: parts[0], template: parts[1], viewport: Number(parts[2]), max, elements: parts[4] });
  }
  return out;
}

/**
 * A URL that rendered another view is a broken measurement, not a known
 * finding: listed once, it would pass forever while its view went unmeasured.
 * So it is never accepted into the baseline and always fails the check.
 */
const NEVER_KNOWN: ReadonlySet<string> = new Set(['wrong-view']);

export function formatBaseline(findings: readonly Finding[]): string {
  const broken = findings.filter((f) => NEVER_KNOWN.has(f.rule));
  if (broken.length > 0) {
    throw new Error(`refusing to record a broken measurement as known: ${broken.map((f) => `${f.template ?? f.url} rendered the wrong view`).join('; ')}`);
  }
  const counts = countFindings(findings);
  return [...counts].sort(([a], [b]) => byCodePoint(a, b)).map(([k, c]) => `${k}\t${c.count}\t${c.elements}`).join('\n') + (counts.size ? '\n' : '');
}

function countFindings(findings: readonly Finding[]): Map<string, { count: number; elements: string }> {
  const selectors = new Map<string, string[]>();
  for (const f of findings) {
    const k = baselineKey(f.rule, f.template ?? f.url, f.viewport);
    const list = selectors.get(k) ?? [];
    list.push(f.selector);
    selectors.set(k, list);
  }
  return new Map([...selectors].map(([k, list]) => [k, { count: list.length, elements: selectorHash(list) }]));
}

export interface BaselineVerdict {
  /** Findings of a rule, template and viewport the baseline does not list. */
  unexpected: Finding[];
  /** Baseline lines whose count was exceeded. */
  exceeded: Array<{ entry: BaselineEntry; count: number }>;
  /** Baseline lines now found fewer times than listed: progress, which shrinkBaseline records. */
  stale: Array<{ entry: BaselineEntry; count: number }>;
  /** Baseline lines found as many times as listed, but on other elements: one finding fixed and another added. */
  swapped: Array<{ entry: BaselineEntry; count: number }>;
}

/**
 * The key a run records for each view and width it actually measured. A view
 * measured at either width also counts as measured at width 0, the width
 * page-problem findings carry. Judging by view and width, not view alone, keeps
 * a failed render at one width from reading as that width's findings fixed.
 */
export function measuredKey(template: string, viewport: number): string {
  return `${template}\t${viewport}`;
}

/**
 * Judges findings against the baseline. Only the views and widths actually
 * measured are judged for staleness, so a filtered or partly failed run does
 * not call other lines stale.
 */
export function compareToBaseline(findings: readonly Finding[], baseline: readonly BaselineEntry[], visited: ReadonlySet<string>): BaselineVerdict {
  const counts = countFindings(findings);
  const listed = new Map(baseline.map((e) => [baselineKey(e.rule, e.template, e.viewport), e]));
  const verdict: BaselineVerdict = { unexpected: [], exceeded: [], stale: [], swapped: [] };
  for (const f of findings) {
    if (NEVER_KNOWN.has(f.rule) || !listed.has(baselineKey(f.rule, f.template ?? f.url, f.viewport))) verdict.unexpected.push(f);
  }
  for (const [k, entry] of listed) {
    if (!visited.has(measuredKey(entry.template, entry.viewport))) continue;
    const found = counts.get(k);
    const count = found?.count ?? 0;
    if (count > entry.max) verdict.exceeded.push({ entry, count });
    else if (count < entry.max) verdict.stale.push({ entry, count });
    else if (found && found.elements !== entry.elements) verdict.swapped.push({ entry, count });
  }
  return verdict;
}

/** True when nothing is new, worse or swapped; a line found fewer times than listed is progress, not a failure. */
export function verdictIsClean(v: BaselineVerdict): boolean {
  return v.unexpected.length === 0 && v.exceeded.length === 0 && v.swapped.length === 0;
}

/**
 * Tightens the baseline to what this run found, so fixing a finding never
 * needs a manual step: a line found fewer times drops to the new count, a line
 * found no times goes, and a line for a view no longer on disk goes. It never
 * raises a count or adds a line; a new finding still fails the check. Lines
 * for views and widths this run did not measure are left alone, so a filtered run cannot
 * empty the file.
 */
export function shrinkBaseline(
  baseline: readonly BaselineEntry[],
  findings: readonly Finding[],
  visited: ReadonlySet<string>,
  liveTemplates: ReadonlySet<string>,
): { entries: BaselineEntry[]; changes: string[] } {
  const counts = countFindings(findings);
  const entries: BaselineEntry[] = [];
  const changes: string[] = [];
  for (const e of baseline) {
    const label = `${e.rule} ${e.template} @${e.viewport}`;
    if (!liveTemplates.has(e.template)) { changes.push(`removed ${label}: the view no longer exists`); continue; }
    if (!visited.has(measuredKey(e.template, e.viewport))) { entries.push(e); continue; }
    const found = counts.get(baselineKey(e.rule, e.template, e.viewport));
    const count = found?.count ?? 0;
    if (count === 0) { changes.push(`removed ${label}: fixed`); continue; }
    // A lowered line records the elements still found, so the next run judges those.
    if (count < e.max) {
      changes.push(`lowered ${label} from ${e.max} to ${count}`);
      entries.push({ ...e, max: count, elements: found!.elements });
      continue;
    }
    entries.push(e);
  }
  return { entries, changes };
}

/**
 * A page problem as the baseline counts it: the server's origin stripped, so
 * the same failed request reads the same whichever port the stack ran on.
 */
export function normalisePageProblem(message: string, origin: string): string {
  return message.split(origin).join('');
}

/** Writes baseline entries in the same sorted, tab-separated form `formatBaseline` produces. */
export function formatBaselineEntries(entries: readonly BaselineEntry[]): string {
  const lines = entries.map((e) => `${baselineKey(e.rule, e.template, e.viewport)}\t${e.max}\t${e.elements}`).sort(byCodePoint);
  return lines.join('\n') + (lines.length ? '\n' : '');
}
