// rendered-style.ts
//
// The command-line face of the rendered-style helper: measure pages as the
// browser draws them and judge them by the layout rules, without writing a
// one-off script each time. Run as `npm run style -- <command>`.
//
//   check [playwright args]        Run the whole-site check (every view, both
//                                  widths, against the known-findings baseline).
//   url <path...> [options]        Measure pages on a running server and print
//                                  every finding.
//   capture <path> --out <file>    Save one page's capture as JSON.
//   judge <capture.json...>        Run the rules over saved captures.
//   diff <before.json> <after.json> [--fail-on-change]
//                                  Show what changed between two captures of a
//                                  page: the proof that a stylesheet refactor
//                                  moved only what it meant to.
//   coverage <path...> [options]   List stylesheet rules no measured page used.
//                                  Evidence for a dead-CSS review, never proof:
//                                  a rule may serve a state no page shows.
//
// Options for url, capture and coverage:
//   --base <origin>   Server to measure (default http://127.0.0.1:3000).
//   --as <persona>    Sign in first through the development persona switch.
//   --width <n,n>     Viewport widths (default 390,1280).
//
// It measures and reports; it never changes a page or the database. Captures
// compare only when taken on the same machine, because fonts differ between
// systems.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext } from '@playwright/test';
import { evaluate, formatFinding, layoutShiftNote, tableNamesFromSchema, type Capture } from '../tests/e2e/helpers/renderedStyle';
import { diffCaptures, isEmptyDiff, summariseDiff } from '../tests/e2e/helpers/renderedStyleDiff';
import { MEASURE_SCRIPT, measureUrl } from '../tests/e2e/helpers/renderedStyleCapture';

const REPO_ROOT = path.resolve(__dirname, '..');
const STYLESHEET_PATH = '/css/style.css';

interface Options { base: string; as: string | null; widths: number[]; out: string | null; failOnChange: boolean; rest: string[] }

function parseArgs(argv: string[]): Options {
  const o: Options = { base: 'http://127.0.0.1:3000', as: null, widths: [390, 1280], out: null, failOnChange: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i];
    else if (a === '--as') o.as = argv[++i];
    else if (a === '--width') o.widths = argv[++i].split(',').map(Number);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--fail-on-change') o.failOnChange = true;
    else o.rest.push(a);
  }
  if (o.widths.some((w) => !Number.isInteger(w) || w < 200)) throw new Error('--width takes whole pixel widths such as 390,1280');
  return o;
}

function ruleContext() {
  return { tableNames: tableNamesFromSchema(fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8')) };
}

async function withContext<T>(o: Options, fn: (context: BrowserContext) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: o.base });
    await context.addInitScript({ path: MEASURE_SCRIPT });
    if (o.as) {
      const res = await context.request.get(`/dev/switch?as=${encodeURIComponent(o.as)}`);
      if (!res.ok()) throw new Error(`persona switch to ${o.as} failed: HTTP ${res.status()} (is ${o.base} a development server?)`);
    }
    return await fn(context);
  } finally {
    await browser.close();
  }
}

function readCapture(file: string): Capture {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Capture;
}

async function cmdUrl(o: Options): Promise<number> {
  if (o.rest.length === 0) throw new Error('url needs at least one path, such as /clubs');
  const ctx = ruleContext();
  let total = 0;
  await withContext(o, async (context) => {
    const page = await context.newPage();
    for (const url of o.rest) {
      for (const width of o.widths) {
        const cap = await measureUrl(page, url, { width, height: width < 600 ? 844 : 800 });
        const findings = evaluate(cap, ctx);
        total += findings.length;
        console.log(`${url} @${width} (${cap.template ?? 'view unknown'}): ${findings.length} finding(s)`);
        for (const f of findings) console.log(`  ${formatFinding(f)}`);
        const shift = layoutShiftNote(cap);
        if (shift) console.log(`  note: ${shift}`);
      }
    }
  });
  return total > 0 ? 1 : 0;
}

async function cmdCapture(o: Options): Promise<number> {
  if (o.rest.length !== 1 || !o.out) throw new Error('capture needs one path and --out <file>');
  await withContext(o, async (context) => {
    const page = await context.newPage();
    const cap = await measureUrl(page, o.rest[0], { width: o.widths[0], height: o.widths[0] < 600 ? 844 : 800 });
    fs.writeFileSync(o.out as string, JSON.stringify(cap));
    console.log(`wrote ${o.out}: ${cap.elements.length} elements at ${o.widths[0]}px${cap.truncated ? ' (truncated at the element cap)' : ''}`);
  });
  return 0;
}

function cmdJudge(o: Options): number {
  if (o.rest.length === 0) throw new Error('judge needs at least one capture file');
  const ctx = ruleContext();
  let total = 0;
  for (const file of o.rest) {
    const findings = evaluate(readCapture(file), ctx);
    total += findings.length;
    console.log(`${file}: ${findings.length} finding(s)`);
    for (const f of findings) console.log(`  ${formatFinding(f)}`);
  }
  return total > 0 ? 1 : 0;
}

function cmdDiff(o: Options): number {
  if (o.rest.length !== 2) throw new Error('diff needs two capture files: before and after');
  const d = diffCaptures(readCapture(o.rest[0]), readCapture(o.rest[1]));
  if (isEmptyDiff(d)) { console.log('no change'); return 0; }
  for (const line of summariseDiff(d)) console.log(line);
  return o.failOnChange ? 1 : 0;
}

/** Splits the stylesheet into top-level rules with their offsets, descending into @media blocks. */
function stylesheetRules(css: string): Array<{ start: number; end: number; selector: string }> {
  const rules: Array<{ start: number; end: number; selector: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!selector || selector.startsWith('@') || selector.startsWith('from') || selector.startsWith('to') || /^\d+%$/.test(selector)) continue;
    const bodyStart = m.index + m[0].indexOf('{');
    rules.push({ start: bodyStart, end: m.index + m[0].length, selector: selector.replace(/^@media[^{]*\{\s*/, '') });
  }
  return rules;
}

async function cmdCoverage(o: Options): Promise<number> {
  if (o.rest.length === 0) throw new Error('coverage needs at least one path');
  const used: Array<{ start: number; end: number }> = [];
  let text = '';
  await withContext(o, async (context) => {
    const page = await context.newPage();
    for (const url of o.rest) {
      for (const width of o.widths) {
        await page.setViewportSize({ width, height: 800 });
        await page.coverage.startCSSCoverage({ resetOnNavigation: false });
        await page.goto(url, { waitUntil: 'load' });
        for (const entry of await page.coverage.stopCSSCoverage()) {
          if (!entry.url.includes(STYLESHEET_PATH)) continue;
          text = entry.text ?? text;
          used.push(...entry.ranges);
        }
      }
    }
  });
  if (!text) throw new Error(`no coverage recorded for ${STYLESHEET_PATH}; did the pages load the site stylesheet?`);
  const unused = stylesheetRules(text).filter((r) => !used.some((u) => u.start < r.end && u.end > r.start));
  console.log(`${unused.length} stylesheet rule(s) matched nothing on ${o.rest.length} page(s) at ${o.widths.join(' and ')}px:`);
  for (const r of unused) {
    const state = /:(hover|focus|active|visited|checked|disabled|target|open)|\[open\]|\.is-|\.has-/.test(r.selector) ? '  (state selector: may serve an interaction no load shows)' : '';
    console.log(`  ${r.selector.replace(/\s+/g, ' ')}${state}`);
  }
  return 0;
}

function cmdCheck(o: Options): number {
  const res = spawnSync('npm', ['run', 'test:rendered-style', '--', ...o.rest], { cwd: REPO_ROOT, stdio: 'inherit' });
  return res.status ?? 1;
}

async function main(): Promise<number> {
  const [command, ...argv] = process.argv.slice(2);
  const o = parseArgs(argv);
  switch (command) {
    case 'check': return cmdCheck(o);
    case 'url': return cmdUrl(o);
    case 'capture': return cmdCapture(o);
    case 'judge': return cmdJudge(o);
    case 'diff': return cmdDiff(o);
    case 'coverage': return cmdCoverage(o);
    default:
      console.error('usage: npm run style -- check|url|capture|judge|diff|coverage ... (see the header of scripts/rendered-style.ts)');
      return 2;
  }
}

main().then((code) => process.exit(code), (err: Error) => { console.error(err.message); process.exit(2); });
