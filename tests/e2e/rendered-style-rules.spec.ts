/**
 * Every rendered-style rule fires on a planted defect drawn by the real
 * stylesheet in a real browser, and stays quiet on a twin built the way the
 * site standard says to build it. The unit tests prove the rules over
 * synthetic numbers; this proves the capture script measures what a browser
 * actually draws (boxes, overflow, fonts, label visibility, inherited link
 * styling), so a rule that passes a real page is evidence. It also proves the
 * check's form submit refuses a form it cannot find exactly as listed.
 *
 * Planted pages are set content, not routes, so this file needs no seeded
 * data and judges the stylesheet alone.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, tableNamesFromSchema, type RuleId } from './helpers/renderedStyle';
import { capture, DESKTOP, PHONE, walkFocus } from './helpers/renderedStyleCapture';
import { submitForm } from './helpers/submitForm';

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
      '<main><label style="position:absolute;left:-9999px" for="n">Name</label><input id="n" type="text"></main>',
      '<main><label style="position:absolute;clip-path:inset(50%)" for="n">Name</label><input id="n" type="text"></main>',
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
  {
    rule: 'text-overlaps',
    viewport: DESKTOP,
    red: ['<main><p style="margin:0">A line of text.</p><p style="margin:-12px 0 0">Another line pulled up over it.</p></main>'],
    green: '<main><p>A line of text.</p><p>Another line below it.</p></main>',
  },
  {
    rule: 'text-clipped',
    viewport: DESKTOP,
    red: [
      '<main><p style="width:120px;white-space:nowrap;overflow:hidden">A club name far too long for its box</p></main>',
      '<main><p style="height:20px;overflow:hidden">Line one of a caption<br>line two<br>line three</p></main>',
    ],
    green: '<main><p style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">A club name far too long for its box</p></main>',
  },
  {
    rule: 'colour-off-palette',
    viewport: DESKTOP,
    red: ['<main><p style="color:#123456">Text in a colour no token holds.</p></main>', '<main><button>Unstyled browser button</button></main>'],
    green: '<main><p style="color:var(--text-muted)">Text in a token colour.</p></main>',
  },
  {
    rule: 'prose-leading-tight',
    viewport: DESKTOP,
    red: [`<main><p style="line-height:1.1">${LONG}</p></main>`],
    green: `<main><p>${LONG}</p></main>`,
  },
  {
    rule: 'image-unsized',
    viewport: DESKTOP,
    red: ['<main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Logo"></main>'],
    green: '<main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Logo" width="40" height="40"></main>',
  },
];

test('a control whose keyboard focus draws nothing is reported, and one with the site\'s focus style is not', async ({ page }) => {
  // A keyboard reader tabbing past a control with no focus indicator cannot tell where they are.
  const focused = async (body: string) => {
    const cap = await plant(page, body, DESKTOP);
    cap.focus = await walkFocus(page);
    return evaluate(cap, ctx, new Set<RuleId>(['focus-not-visible']));
  };
  // The site's link focus style underlines and darkens a link; the planted one pins all of that off.
  const red = await focused('<main><p><a href="/x" style="outline:none;text-decoration:none;color:var(--primary-ink)">Bare link</a></p></main>');
  expect(red.map((f) => f.selector)).toEqual(['body>main>p>a']);
  expect(await focused('<main><p><a href="/x">Site link</a></p></main>')).toEqual([]);
});

test('a block wider than the phone is reported even when the page clips sideways', async ({ page }) => {
  // A clipped body hides what is past the edge, so the reader cannot scroll to it;
  // the document still reports its full width, which is what lets the page rule see it.
  await plant(page, '<main><div style="width:600px">A block wider than the phone</div></main>', PHONE);
  await page.addStyleTag({ content: 'body { overflow-x: hidden; }' });
  const cap = await capture(page, 'planted');
  // A script may still scroll a clipped page, and the site scrolls smoothly, so the premise is read from the clip itself.
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowX), 'the body no longer clips sideways, so the premise no longer holds').toBe('hidden');
  const found = evaluate(cap, ctx, new Set<RuleId>(['page-overflow']));
  expect(found.map((f) => f.measured)).toEqual([expect.stringContaining('culprits: body>main>div')]);
});

test('long metadata may stay grey on a metadata class, and long grey prose may not', async ({ page }) => {
  // A source note is grey by design at any length; the same grey on a paragraph is prose a reader struggles with.
  const text = LONG.slice(0, 120);
  expect(await hits(page, 'prose-muted', `<main><p class="source-note">${text}</p></main>`, DESKTOP)).toEqual([]);
  expect((await hits(page, 'prose-muted', `<main><p style="color:var(--text-muted)">${text}</p></main>`, DESKTOP)).length).toBeGreaterThan(0);
});

test('a wide table may scroll inside the labelled table wrapper, and not inside an unlabelled one', async ({ page }) => {
  // The standard lets a wide admin table scroll in its wrapper, but only one a keyboard reader can reach and name.
  const inWrap = (attrs: string) => `<main><div ${attrs} style="width:800px"><table style="width:900px"><tr><td>Row</td></tr></table></div></main>`;
  expect(await hits(page, 'table-overflows-container', inWrap(WRAP_OK), DESKTOP)).toEqual([]);
  expect((await hits(page, 'table-overflows-container', inWrap('class="records-table-wrap" role="region" aria-label="Results"'), DESKTOP)).length).toBeGreaterThan(0);
});

test('the check refuses to submit a form that moved or lost a field, rather than measuring another page', async ({ page }) => {
  // A confirm page the check reaches through its form would silently go unmeasured if a renamed
  // action or field let the submit land somewhere else.
  await plant(page, '<main><form method="POST" action="/admin/thing/grant"><label for="r">Reason</label><input id="r" name="reason"><button type="submit">Go</button></form></main>', DESKTOP);
  await expect(submitForm(page, { action: '/admin/thing/moved' })).rejects.toThrow('expected one form posting to /admin/thing/moved');
  await expect(submitForm(page, { action: '/admin/thing/grant', fields: { why: 'x' } })).rejects.toThrow('has no field named why');
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
