/**
 * Every rendered-style rule fires on a planted defect drawn by the real
 * stylesheet in a real browser, and stays quiet on a twin built the way the
 * site standard says to build it. The unit tests prove the rules over
 * synthetic numbers; this proves the capture script measures what a browser
 * actually draws (boxes, overflow, fonts, label visibility, inherited link
 * styling), so a rule that passes a real page is evidence.
 *
 * Planted pages are set content, not routes, so this file needs no seeded
 * data and judges the stylesheet alone.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, tableNamesFromSchema, type RuleId } from './helpers/renderedStyle';
import { capture, DESKTOP, PHONE } from './helpers/renderedStyleCapture';

const STYLESHEET = path.resolve(__dirname, '../../src/public/css/style.css');
const ctx = { tableNames: tableNamesFromSchema(fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8')) };

const LONG = 'Footbag clubs meet weekly in parks and gyms, and newcomers are welcome at every session they can reach. '.repeat(3);

async function plant(page: Page, body: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`);
  await page.addStyleTag({ path: STYLESHEET });
  return capture(page, 'planted');
}

async function hits(page: Page, rule: RuleId, body: string, viewport: { width: number; height: number }) {
  return evaluate(await plant(page, body, viewport), ctx, new Set([rule]));
}

interface Case { rule: RuleId; viewport: { width: number; height: number }; red: string[]; green: string }

const WRAP_OK = 'class="records-table-wrap" tabindex="0" role="region" aria-label="Results"';

const CASES: Case[] = [
  {
    rule: 'box-outside-viewport',
    viewport: PHONE,
    red: ['<main><div style="width:600px">A block wider than the phone</div></main>'],
    green: `<main><div ${WRAP_OK}><table style="width:600px"><tr><td>Wide row</td></tr></table></div></main>`,
  },
  {
    rule: 'scroll-box-unlabelled',
    viewport: PHONE,
    red: [
      '<main><div class="records-table-wrap"><table style="width:600px"><tr><td>Wide row</td></tr></table></div></main>',
      '<main><div class="records-table-wrap" tabindex="0"><table style="width:600px"><tr><td>Wide row</td></tr></table></div></main>',
    ],
    green: `<main><div ${WRAP_OK}><table style="width:600px"><tr><td>Wide row</td></tr></table></div></main>`,
  },
  {
    rule: 'scroll-box-disallowed',
    viewport: PHONE,
    red: [`<main><div ${WRAP_OK}><ul style="width:600px"><li>A list that should have wrapped</li></ul></div></main>`],
    green: `<main><div ${WRAP_OK}><table style="width:600px"><tr><td>Wide row</td></tr></table></div></main>`,
  },
  {
    rule: 'table-overflows-container',
    viewport: DESKTOP,
    red: ['<main><div style="width:800px"><table style="width:900px"><tr><td>Row</td></tr></table></div></main>'],
    green: '<main><div style="width:800px"><table class="records-table"><tr><td>Row</td></tr></table></div></main>',
  },
  {
    rule: 'table-columns-misaligned',
    viewport: PHONE,
    red: [
      '<main><table><thead><tr><th>Rank</th><th style="display:none">Holder</th><th>Score</th></tr></thead><tbody><tr><td>1</td><td>A player</td><td>63</td></tr></tbody></table></main>',
      '<main><table><thead><tr><th>Rank</th><th>Adds</th><th>Score</th></tr></thead><tbody><tr><td>1</td><td style="display:none">5</td><td>63</td></tr></tbody></table></main>',
    ],
    green: '<main><table><thead><tr><th colspan="2">Holder</th><th style="display:none">Adds</th></tr></thead><tbody><tr><td>1</td><td>A player</td><td style="display:none">5</td></tr></tbody></table></main>',
  },
  {
    rule: 'tap-target-small',
    viewport: PHONE,
    red: ['<main><button style="width:16px;height:16px;padding:0">a</button><button style="width:16px;height:16px;padding:0">b</button></main>'],
    green: '<main><button class="btn btn-primary">Save</button> <button class="btn btn-outline btn-sm">Cancel</button></main>',
  },
  {
    rule: 'text-below-ramp',
    viewport: DESKTOP,
    red: ['<main><p style="font-size:12px">Small print</p></main>'],
    green: '<main><p class="notice">Metadata at the smallest step</p></main>',
  },
  {
    rule: 'heading-not-outranking',
    viewport: DESKTOP,
    red: [`<main><h2 style="font-size:16px">Results</h2><p>${LONG}</p></main>`],
    green: `<main><h2>Results</h2><p>${LONG}</p></main>`,
  },
  {
    rule: 'prose-too-wide',
    viewport: DESKTOP,
    red: [`<main><p style="max-width:none">${LONG}</p></main>`],
    green: `<main><p>${LONG}</p></main>`,
  },
  {
    rule: 'prose-muted',
    viewport: DESKTOP,
    red: [`<main><p style="color:var(--text-muted)">${LONG}</p></main>`],
    green: `<main><p>${LONG}</p></main>`,
  },
  {
    rule: 'text-subtle-used',
    viewport: DESKTOP,
    red: ['<main><span style="color:var(--text-subtle)">Source note</span></main>'],
    green: '<main><span style="color:var(--text-muted);font-size:0.9rem">Source note</span></main>',
  },
  {
    rule: 'contrast-low',
    viewport: DESKTOP,
    red: ['<main><p style="color:#aaaaaa">Pale text</p></main>'],
    green: '<main><p>Body text</p></main>',
  },
  {
    rule: 'link-no-cue-in-prose',
    viewport: DESKTOP,
    red: ['<main><p>Read the <a href="/rules" style="text-decoration:none">rules</a> first.</p></main>'],
    green: '<main><p>Read the <a href="/rules">rules</a> first.</p></main>',
  },
  {
    rule: 'fieldset-bordered',
    viewport: DESKTOP,
    red: ['<main><form><fieldset><legend>Contact</legend></fieldset></form></main>'],
    green: '<main><form><fieldset class="form-fieldset"><legend>Contact</legend></fieldset></form></main>',
  },
  {
    rule: 'hidden-but-displayed',
    viewport: DESKTOP,
    red: ['<main><div hidden style="display:block">Withheld</div></main>'],
    green: '<main><div hidden>Withheld</div></main>',
  },
  {
    rule: 'field-without-visible-label',
    viewport: DESKTOP,
    red: [
      '<main><input type="text" placeholder="Name" aria-label="Name"></main>',
      '<main><label class="visually-hidden" for="n">Name</label><input id="n" type="text"></main>',
    ],
    green: '<main><label for="n">Name</label> <input id="n" type="text"></main>',
  },
  {
    rule: 'empty-state-leaks-code',
    viewport: DESKTOP,
    red: ['<main><div class="empty-state"><p>No vote_options rows.</p></div></main>'],
    green: '<main><div class="empty-state"><p>No options have been added to this vote yet.</p></div></main>',
  },
  {
    rule: 'spacing-off-rhythm',
    viewport: DESKTOP,
    red: [
      '<main><p style="margin:0">First block.</p><p style="margin:0">Second block, touching the first.</p></main>',
      '<main><p style="margin:0 0 20px">First block.</p><p>Second block, between two steps.</p></main>',
    ],
    green: '<main><p>First block of text.</p><p>Second block, one paragraph gap below.</p></main>',
  },
];

test('a block wider than the phone is reported even when the page clips sideways', async ({ page }) => {
  // A clipped body hides what is past the edge, so the reader cannot scroll to it;
  // the document still reports its full width, which is what lets the page rule see it.
  await plant(page, '<main><div style="width:600px">A block wider than the phone</div></main>', PHONE);
  await page.addStyleTag({ content: 'body { overflow-x: hidden; }' });
  const cap = await capture(page, 'planted');
  await page.evaluate(() => window.scrollTo(500, 0));
  expect(await page.evaluate(() => window.scrollX), 'the page scrolled sideways, so the clipping premise no longer holds').toBe(0);
  const found = evaluate(cap, ctx, new Set<RuleId>(['page-overflow']));
  expect(found.map((f) => f.measured)).toEqual([expect.stringContaining('culprits: body>main>div')]);
});

test.describe('shared components meet the standard whatever the data', () => {
  test('a first-place number in a results table is readable against the page', async ({ page }) => {
    // A low-vision visitor could not read a winner's place if the medal colour fell under 4.5:1.
    const body = '<main><table class="data-table"><tbody><tr><td class="placement-num gold">1</td><td>A player</td></tr></tbody></table></main>';
    expect(await hits(page, 'contrast-low', body, PHONE)).toEqual([]);
  });

  test('a filter bar with a long option stays inside a phone screen', async ({ page }) => {
    // A select sizes itself to its longest option; unchecked, one long label makes the whole
    // listing page scroll sideways on a phone.
    const option = 'Intermediate Singles and Doubles Combined Division (1234 appearances)';
    const body = `<main><form class="filter-bar"><label>Discipline <select name="d"><option>All Disciplines</option><option>${option}</option></select></label><button type="submit">Filter</button></form></main>`;
    const cap = await plant(page, body, PHONE);
    expect(evaluate(cap, ctx, new Set<RuleId>(['box-outside-viewport', 'page-overflow']))).toEqual([]);
  });
});

test.describe('rendered-style rules on planted pages', () => {
  for (const c of CASES) {
    test(`${c.rule} fires on its defect and not on the standard twin`, async ({ page }) => {
      for (const red of c.red) {
        const found = await hits(page, c.rule, red, c.viewport);
        expect(found.length, `planted defect not reported:\n${red}`).toBeGreaterThan(0);
      }
      const clean = await hits(page, c.rule, c.green, c.viewport);
      expect(clean, `standard twin reported:\n${c.green}`).toEqual([]);
    });
  }
});
