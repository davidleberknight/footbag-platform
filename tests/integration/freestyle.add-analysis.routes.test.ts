/**
 * Integration tests for GET /freestyle/add-analysis.
 *
 * The page teaches how to read an ADD formula: what ADD is, how the brackets
 * count, the scoring components, a few worked examples, one caveat about
 * incompleteness, and why sources sometimes disagree. The dictionary and the
 * trick pages own the formulas themselves, so the page carries no formula
 * table, case catalogue or outside-source reconciliation.
 *
 * Verifies:
 *   - Route returns 200 with its three sections in order, and none of the
 *     reference blocks that belong elsewhere
 *   - Every component row and worked example the content defines renders, in
 *     order, with its trick link, ADD label and additive breakdown
 *   - The X-Dex and spin notes point to the pages that own the detail
 *   - Exactly one callout: the incompleteness caveat
 *   - Wording lexicon: no "{source} is wrong" framing
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';
import { FREESTYLE_ADD_ANALYSIS_CONTENT } from '../../src/content/freestyleAddAnalysisContent';

const { dbPath } = setTestEnv('3110');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const c = FREESTYLE_ADD_ANALYSIS_CONTENT;

// Handlebars escapes these characters in {{ }} output; the content strings are
// compared against the page in their rendered form.
function escapeHbs(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/`/g, '&#x60;')
    .replace(/=/g, '&#x3D;');
}

beforeAll(async () => {
  // Seed every worked-example slug as an active trick, so each example's link
  // resolves; link resolution for inactive and unknown names is covered by the
  // link-resolution suite.
  const db = createTestDb(dbPath);
  for (const r of c.workedExamples) {
    if (!r.trickSlug) continue;
    insertFreestyleTrick(db, {
      slug: r.trickSlug, canonical_name: r.trickSlug.replace(/_/g, ' '), adds: '3',
      trick_family: 'butterfly', category: 'compound', is_active: 1,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/add-analysis — page structure', () => {
  // Defect caught: a section lost, reordered, or a reference block that belongs
  // on the dictionary or the trick pages (formula table, case catalogue,
  // outside-source table, branch ladder) creeping back onto the teaching page.
  it('renders its three sections in order and none of the relocated reference blocks', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    const sections = ['id="how-add-is-built"', 'id="worked-examples"', 'id="discrepancies"'];
    let lastIdx = -1;
    for (const id of sections) {
      const idx = res.text.indexOf(id);
      expect(idx, `Missing or out of order: ${id}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
    for (const id of ['osis-branch', 'resolved-formulas', 'interpretation-notes', 'passback-add-framing', 'edge-cases']) {
      expect(res.text, `Relocated block back on the page: ${id}`).not.toContain(`id="${id}"`);
    }
    expect(res.text).not.toMatch(/id="case-DC-\d\d"/);
  });

  // Defect caught: the caveat losing its callout, or ordinary notes boxed again.
  it('keeps exactly one callout, the incompleteness caveat', async () => {
    const res = await page('/freestyle/add-analysis');
    const callouts = res.text.match(/<p class="add-analysis-callout">[\s\S]*?<\/p>/g) ?? [];
    expect(callouts).toHaveLength(1);
    expect(callouts[0]).toContain(escapeHbs(c.incompletenessNote));
  });

  it('states the bracket-count rule that ties notation to the published ADD', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toContain(escapeHbs(c.bracketRuleNote));
  });
});

describe('GET /freestyle/add-analysis — component-contribution table', () => {
  // Defect caught: a component row dropped or rendered without its score or example.
  it('renders every component row with its contribution and example', async () => {
    const res = await page('/freestyle/add-analysis');
    const start = res.text.indexOf('id="how-add-is-built"');
    const end = res.text.indexOf('id="worked-examples"');
    const region = res.text.slice(start, end);
    for (const row of c.componentClasses) {
      expect(region, `Missing component: ${row.componentClass}`).toContain(`<td>${escapeHbs(row.componentClass)}</td>`);
      expect(region, `Missing contribution for: ${row.componentClass}`).toContain(`<td>${escapeHbs(row.contribution)}</td>`);
      expect(region, `Missing example for: ${row.componentClass}`).toContain(`<td>${escapeHbs(row.example)}</td>`);
    }
  });

  // Defect caught: blurry presented as a fixed universal weight again.
  it('blurry reads as scored per trick, never a fixed universal weight', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toMatch(/blurry is scored per trick/i);
    expect(res.text).not.toMatch(/blurry \+1 \(implies stepping\)/i);
  });
});

describe('GET /freestyle/add-analysis — notes beneath the table', () => {
  // Defect caught: the page restating X-Dex trigger conditions that the notation
  // now decides, contradicting the X-Dex entry in Freestyle Concepts.
  it('states the X-Dex as notation-decided and links to its Concepts entry', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toContain(escapeHbs(c.xdexNote));
    expect(res.text).toContain('href="/freestyle/concepts#term-x-dex"');
    expect(res.text).not.toMatch(/can trigger it/i);
  });

  // Defect caught: the spin note losing its way to the page that owns the operator.
  it('links the spin note to the spinning modifier page', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toContain(escapeHbs(c.spinNote));
    expect(res.text).toContain('href="/freestyle/modifier/spinning"');
  });

  it('explains stalls, including the multiple-stall jump class', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toContain(escapeHbs(c.delayNote));
    expect(res.text).toMatch(/\[DEL\], from delay/);
    expect(res.text).toMatch(/two \[DEL\] brackets/);
  });

  // Defect caught: internal contract language returning to the visitor-facing rule.
  it('states the published-ADD rule without internal contract language', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toContain(escapeHbs(c.editorialTruthRule));
    expect(res.text).not.toMatch(/editorial contract/i);
  });
});

describe('GET /freestyle/add-analysis — worked examples', () => {
  // Defect caught: an example dropped, reordered, unlinked, or rendered without
  // its ADD label or additive breakdown.
  it('renders every worked example in order with its link, ADD label and breakdown', async () => {
    const res = await page('/freestyle/add-analysis');
    const start = res.text.indexOf('id="worked-examples"');
    const end = res.text.indexOf('id="discrepancies"');
    const region = res.text.slice(start, end);
    let lastIdx = -1;
    for (const ex of c.workedExamples) {
      const heading = `href="/freestyle/tricks/${ex.trickSlug}">${escapeHbs(ex.trickName)}</a>`;
      const idx = region.indexOf(heading);
      expect(idx, `Worked example ${ex.trickName} missing, unlinked or out of order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
      const entry = region.slice(idx, idx + 2000);
      expect(entry, `${ex.trickName} ADD label`).toContain(`&middot; ${ex.addLabel}`);
      expect(entry, `${ex.trickName} breakdown`).toContain(`<code>${escapeHbs(ex.derivation)}</code>`);
    }
  });

  // Defect caught: mirage described as rotational again.
  it('Mirage worked-example does not describe mirage as "rotational"', async () => {
    const res = await page('/freestyle/add-analysis');
    const sliceStart = res.text.indexOf('>Mirage</a>');
    const sliceEnd = res.text.indexOf('>Whirl</a>');
    expect(sliceStart).toBeGreaterThan(0);
    const region = res.text.slice(sliceStart, sliceEnd);
    expect(region).not.toMatch(/rotational anchor/i);
    expect(region).toMatch(/foundational dexterity primitive/i);
  });

  // Defect caught: whirl landing on the wrong clipper side in its operational chain.
  it('Whirl worked example lands on the opposite-side clipper', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).toMatch(/leggy in dex &gt; op clipper/);
  });
});

describe('GET /freestyle/add-analysis — why sources disagree + cross-links', () => {
  // Defect caught: the recurring reasons dropped from the discrepancy section.
  it('renders the recurring disagreement reasons inside the discrepancy section', async () => {
    const res = await page('/freestyle/add-analysis');
    const region = /id="discrepancies"[\s\S]*?<\/section>/.exec(res.text)?.[0] ?? '';
    expect(c.closingParagraphs.length).toBeGreaterThan(0);
    for (const p of c.closingParagraphs) {
      expect(region, `Missing reason: ${p}`).toContain(`<p>${escapeHbs(p)}</p>`);
    }
  });

  it('renders the cross-links inventory', async () => {
    const res = await page('/freestyle/add-analysis');
    for (const link of c.crossLinks) {
      expect(res.text, `Missing cross-link: ${link.href}`).toContain(`href="${link.href}"`);
    }
  });
});

describe('ADD Analysis discoverability — inbound links', () => {
  it('Freestyle Concepts ADD Accounting compact-equivalence block links to ADD analysis', async () => {
    const res = await page('/freestyle/concepts');
    const flowIdx = res.text.indexOf('id="symbolic-compression-flow"');
    expect(flowIdx).toBeGreaterThan(0);
    const sec9Idx = res.text.indexOf('9. Movement Neighborhoods');
    const slice = res.text.slice(flowIdx, sec9Idx);
    expect(slice).toContain('href="/freestyle/add-analysis"');
  });

  it('freestyle history difficulty section links to ADD analysis', async () => {
    const res = await page('/freestyle/history');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });
});

describe('GET /freestyle/add-analysis — wording discipline', () => {
  it('never uses "is wrong" / "incorrect" framing on external sources', async () => {
    const res = await page('/freestyle/add-analysis');
    for (const phrase of ['is wrong', 'incorrect', 'the correct ADD', 'should be', 'outdated']) {
      expect(
        res.text.toLowerCase().includes(phrase.toLowerCase()),
        `Forbidden phrase appeared: "${phrase}"`,
      ).toBe(false);
    }
  });

  // Defect caught: internal governance citations or code symbols reaching visitors.
  it('carries no internal governance citations or code symbols', async () => {
    const res = await page('/freestyle/add-analysis');
    expect(res.text).not.toMatch(/Red ruling/i);
    expect(res.text).not.toMatch(/per Red\b/);
    expect(res.text).not.toMatch(/\bpt\d+\b/);
    expect(res.text).not.toMatch(/working rulings adopted by this encyclopedia/i);
    expect(res.text).not.toContain('COMPOSITE_DERIVATIONS');
    expect(res.text).not.toContain('FIRST_CLASS_ROTATIONAL_BASES');
  });
});
