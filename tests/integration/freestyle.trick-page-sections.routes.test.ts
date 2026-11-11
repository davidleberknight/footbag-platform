/**
 * GET /freestyle/tricks/:slug — the trick page's section set.
 *
 * A trick page carries one opening, its notation and structure, Technique
 * Notes, and two relationship sections: the Family ladder and Related Tricks.
 * The sections that only repeated another one stay off every page shape: a
 * pathways block, a movement-intuition section, a per-modifier block, a
 * compressed-from line, equivalent readings, a naming-and-interpretation card,
 * scoring notes, alternate derivations, a separate structural-relatives
 * section, a separate educational aside, the conserved-mechanic line in the
 * family callout, and the "lands in" backlink on a cohort member.
 *
 * Each case pairs the absence check with the kept section that must still
 * render on the same page, so an empty page cannot pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';
import { buildSymbolicEducationCtas } from '../../src/services/symbolicTrickPanels';

const { dbPath } = setTestEnv('3587');
let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

// Root markers of the sections the page no longer draws, each as it appeared in
// the page's markup.
const REMOVED_MARKERS = [
  'class="content-section trick-pathways',
  'trick-intuition',
  'class="content-section trick-modifiers',
  'trick-compressed-from',
  'equivalent-readings',
  'semantic-base-lineage',
  'semantic-notation-pending',
  'trick-interpretation',
  'trick-scoring-notes',
  'trick-equivalence-topology',
  'symbolic-trick-ctas',
  'similar-tricks-list',
  'trick-family-anchor-invariant',
  'data-section="terminal-backlink"',
];

function sectionSlice(html: string, marker: string): string {
  const start = html.indexOf(`data-section="${marker}"`);
  if (start < 0) return '';
  return html.slice(start, html.indexOf('</section>', start));
}

function expectNoRemovedSection(html: string, slug: string): void {
  for (const marker of REMOVED_MARKERS) {
    expect(html, `${slug} still draws ${marker}`).not.toContain(marker);
  }
}

async function page(slug: string): Promise<string> {
  const res = await getPage(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

const t = (slug: string, o: Record<string, unknown> = {}) => ({
  slug, canonical_name: slug.replace(/_/g, ' '), adds: '2', is_active: 1 as const, ...o,
});

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const r of [
    // A walking compound on the butterfly base, with a trick that carries the
    // same operators on another base.
    t('butterfly', { adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'dex' }),
    t('ripwalk', { adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' }),
    t('whirl', { adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex' }),
    t('stepping_whirl', { adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' }),
    // A family anchor whose family has members, and a terminal atom whose
    // curated cohort includes it.
    t('mirage', { base_trick: 'mirage', trick_family: 'mirage', category: 'dex' }),
    t('paradox_mirage', { adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' }),
    t('toe_stall', { adds: '1', category: 'base' }),
    t('legover', { trick_family: 'legover', category: 'dex' }),
  ]) insertFreestyleTrick(db, r);
  insertFreestyleTrickModifier(db, { slug: 'stepping', modifier_name: 'stepping', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'paradox', modifier_type: 'body' });
  // Two shared operators on another base make a structural relative.
  insertFreestyleTrickModifierLink(db, 'ripwalk', 'stepping', 1);
  insertFreestyleTrickModifierLink(db, 'ripwalk', 'paradox', 2);
  insertFreestyleTrickModifierLink(db, 'stepping_whirl', 'stepping', 1);
  insertFreestyleTrickModifierLink(db, 'stepping_whirl', 'paradox', 2);
  insertFreestyleTrickModifierLink(db, 'paradox_mirage', 'paradox', 1);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a modifier compound', () => {
  // Defect caught: a cut section returning, or the structural relatives and the
  // teaching-page link falling out of Related Tricks with nothing in their place.
  it('keeps one relationship block beside the family ladder, holding the relatives and the teaching link', async () => {
    const html = await page('ripwalk');
    expectNoRemovedSection(html, 'ripwalk');
    const related = sectionSlice(html, 'related-tricks');
    expect(related, 'Related Tricks section').not.toBe('');
    // The structurally related group sits inside Related Tricks, not beside it.
    expect(related).toContain('data-section="similar-tricks"');
    expect(related).toContain('href="/freestyle/tricks/stepping_whirl"');
    // The teaching-page link this trick earns closes Related Tricks.
    const ctas = buildSymbolicEducationCtas({ slug: 'ripwalk', baseTrick: 'butterfly', modifierSlugs: ['stepping', 'paradox'] });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(related).toContain(`href="${cta.href}"`);
    // The Family ladder still owns same-family progression.
    expect(html).toContain('content-section trick-family-lineage');
  });

  // Defect caught: the page's opening growing its old heading back, so the
  // first section repeats the hero.
  it('opens with an unheaded plain-words section', async () => {
    const html = await page('ripwalk');
    const open = html.indexOf('aria-label="About this trick"');
    expect(open, 'opening section').toBeGreaterThan(0);
    const body = html.slice(open, html.indexOf('</section>', open));
    expect(body).not.toContain('<h2');
  });
});

describe('a family anchor', () => {
  // Defect caught: the anchor callout carrying the conserved-mechanic line
  // again, or losing the callout itself.
  it('shows the family-anchor callout without the invariant line', async () => {
    const html = await page('mirage');
    expectNoRemovedSection(html, 'mirage');
    expect(html).toContain('trick-family-anchor-callout');
    expect(html).toContain('href="/freestyle/tricks/paradox_mirage"');
  });
});

describe('a terminal atom and a member of its cohort', () => {
  // Defect caught: the stall losing its "what lands here" list, or a member
  // growing the backlink to the stall again.
  it('lists the cohort on the stall and draws no backlink on the member', async () => {
    const stall = await page('toe_stall');
    expectNoRemovedSection(stall, 'toe_stall');
    expect(sectionSlice(stall, 'terminal-derived')).toContain('href="/freestyle/tricks/mirage"');
    const member = await page('mirage');
    expect(member).not.toContain('data-section="terminal-backlink"');
    expect(member).not.toContain('href="/freestyle/tricks/toe_stall"');
  });
});
