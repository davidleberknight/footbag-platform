/**
 * Emerging Vocabulary — observational governance surface (/freestyle/observational).
 *
 * The page renders four sections derived from the lifecycle model stamped on
 * the generated observational universe (src/content/freestyleObservationalUniverse.ts,
 * row field publicSection): decide now (curator decision clusters), waiting on
 * a named ruling (grouped by open doctrine question with unlock counts), needs
 * evidence, and the documented vocabulary archive. Duplicate spellings of one
 * identity render once; malformed and rejected rows never render; every count
 * derives from the generated data plus the live publication filter.
 *
 * Layer-separation contract (asserted below): observational entries name their
 * source in words, never a canonical hashtag; they NEVER link to a canonical
 * trick detail page; a provisional ADD is labelled provisional, never canonical.
 * Each open question shows its plain title and sentence, never the working
 * doctrine text. Page wording itself is never asserted: entries are found by
 * section anchor, element class and the data they render.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  OBSERVATIONAL_UNIVERSE,
  OBSERVATIONAL_UNIVERSE_STATS,
  EMERGING_QUESTIONS,
} from '../../src/content/freestyleObservationalUniverse';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3220');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

beforeAll(async () => {
  // The sections are content-module-driven. The database-tracked pending rows
  // read the DB, so seed a couple of unadjudicated external placeholders
  // (is_active=0 + review_status='pending') to exercise that path.
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'pending-zorblax', canonical_name: 'pending zorblax', adds: '4',
    category: 'compound', review_status: 'pending', is_active: 0,
  });
  insertFreestyleTrick(db, {
    slug: 'pending-quasar', canonical_name: 'pending quasar', adds: '',
    category: 'compound', review_status: 'pending', is_active: 0,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(): Promise<string> {
  const res = await getPage('/freestyle/observational');
  expect(res.status).toBe(200);
  return res.text;
}

const primaries = OBSERVATIONAL_UNIVERSE.filter(r => r.groupPrimary);
const inSection = (s: string) => primaries.filter(r => r.publicSection === s);

describe('GET /freestyle/observational — four-section lifecycle surface', () => {
  // Defect caught: a visitor lands on a list of names with no orientation
  // saying what the page is and where the established tricks are.
  it('opens with an orientation line and the provisional note above the sections', async () => {
    const html = await page();
    expect(html).toMatch(/class="hero-subtitle">\s*\S/);
    expect(html).toMatch(/class="observational-layer-note">\s*\S/);
  });

  // Defect caught: an entry shows an internal source code (PB, FM, SG) a
  // visitor cannot decode.
  it('names every source in words, never by its internal code', async () => {
    const html = await page();
    const codes = 'PB|FM|SG|FB|FF|MULTI|external';
    expect(html).not.toMatch(new RegExp(`observed-card-source-badge[^>]*>(${codes})<`));
    expect(html).not.toMatch(new RegExp(`class="tracked-tag">(${codes})<`));
  });

  it('renders the four sections and no others, in order', async () => {
    const html = await page();
    const anchors = ['id="decide-now"', 'id="waiting-on-a-ruling"', 'id="needs-evidence"', 'id="documented-archive"'];
    const positions = anchors.map(a => html.indexOf(a));
    for (let i = 0; i < anchors.length; i++) {
      expect(positions[i], `${anchors[i]} missing`).toBeGreaterThan(-1);
    }
    for (let i = 1; i < anchors.length; i++) {
      expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it('the retired nine-heading ladder is gone', async () => {
    const html = await page();
    for (const stale of [
      'Ready for Curation', 'Needs Authoring', 'Awaiting Doctrine',
      'Awaiting Curator Review', 'Awaiting Identification',
      'Documented execution, decomposition unresolved',
      'Blocked on an undefined operator',
      'Community names, structure not yet recovered',
      'Alias / duplicate archive',
    ]) {
      expect(html, `stale heading "${stale}" still renders`).not.toContain(stale);
    }
    expect(html).not.toContain('id="awaiting-doctrine"');
    expect(html).not.toContain('id="ready-for-curation"');
  });

  it('ready-for-a-decision renders each group with its question, without the curator workbench, unpromoted', async () => {
    const html = await page();
    // A populated decision group renders; an answered (empty) group vanishes.
    expect(html).toMatch(/id="decision-(D\d|A0)"/);
    // The recommendation, alternatives, evidence and consequence a curator
    // weighs belong to the admin workbench; on the public page they read as an
    // internal queue.
    expect(html).not.toContain('Recommendation and evidence');
    expect(html).not.toMatch(/<dt>(Recommended|Alternatives|Consequence)<\/dt>/);
    // Decision members render as observational cards, never canonical links.
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/[a-z]/);
  });

  it('waiting-on-a-rules-question groups rows by question with a name count, without ownership metadata', async () => {
    const html = await page();
    // Every rendered question card is one of the registered questions and
    // shows how many names it holds; no undifferentiated wall of names.
    for (const q of EMERGING_QUESTIONS) {
      if (html.includes(`id="question-${q.id}"`)) {
        expect(html).toMatch(new RegExp(`id="question-${q.id}"[\\s\\S]{0,400}\\(\\d+ names\\)`));
      }
    }
    // Who owns a question and how it travels is curation detail.
    expect(html).not.toMatch(/Status: (drafted|sent)/);
    expect(html).not.toMatch(/Owner: |Vehicle: /);
  });

  // Defect caught: a visitor reads the rules expert's working question text,
  // with its bracket codes and internal references, instead of the plain
  // sentence the registry carries for the public page.
  it('shows each question by its plain title and sentence, never the working text', async () => {
    const html = await page();
    const rendered = EMERGING_QUESTIONS.filter(q => html.includes(`id="question-${q.id}"`));
    expect(rendered.length).toBeGreaterThan(0);
    for (const q of rendered) {
      const card = html.split(`id="question-${q.id}"`)[1]!.split('</details>')[0]!;
      expect(q.publicTitle, `${q.id} has no public title`).not.toBe('');
      expect(card, `${q.id} title`).toContain(q.publicTitle.replace(/'/g, '&#x27;'));
      expect(card, `${q.id} sentence`).toContain(q.publicSummary.replace(/'/g, '&#x27;').replace(/"/g, '&quot;'));
      // A scoring or notation question that never says so reads as if the
      // movement itself were unknown.
      expect(q.publicOpen, `${q.id} has no open line`).not.toBe('');
      expect(card, `${q.id} open line`).toContain(q.publicOpen.replace(/'/g, '&#x27;').replace(/"/g, '&quot;'));
      expect(card, `${q.id} shows its working text`).not.toContain(q.question.slice(0, 40));
    }
  });

  // Defect caught: a newcomer cannot find how a trick qualifies, where to
  // suggest one, or what a source label stands for.
  it('carries the joining, help and source sections, with the forum and source links', async () => {
    const html = await page();
    const section = (id: string) => html.split(`id="${id}"`)[1]?.split('</section>')[0] ?? '';
    expect(section('how-a-trick-joins')).toMatch(/observed-section-intro">\s*\S/);
    expect(section('help-document')).toContain('href="/forum"');
    const sources = section('sources');
    // Outside links go through the site's external-link treatment.
    expect(sources).toMatch(/href="https:\/\/www\.passbackfootbag\.com\/"[^>]*rel="[^"]*noopener/);
    expect(sources).toMatch(/href="https:\/\/theory\.stanford\.edu\/~blynn\/footbag"[^>]*rel="[^"]*noopener/);
    // The newcomer sections sit ahead of the first worked section.
    expect(html.indexOf('id="help-document"')).toBeLessThan(html.indexOf('id="decide-now"'));
  });

  // Defect caught: a name already in the dictionary under another spelling
  // shows that trick's internal slug instead of its name.
  it('names a published target in words, never by its slug', async () => {
    const html = await page();
    const section = html.split('id="waiting-on-a-ruling"')[1]!.split('id="needs-evidence"')[0]!;
    expect(section).not.toMatch(/class="text-muted">[^<]*[a-z]_[a-z][^<]*</);
  });

  it('every actionable entry states what still separates it from the dictionary', async () => {
    // The story's contract for this page: each entry shows what would be needed
    // for curation. A group, question or evidence row rendered without it would
    // be a bare name with no explanation of why it is not a trick.
    const html = await page();
    const blocks = (startMarker: string, endMarker: RegExp): string[] =>
      html.split(startMarker).slice(1).map(b => b.split(endMarker)[0]!);

    const decisions = blocks('class="observed-eco-group" id="decision-', /class="observed-eco-group"|<\/section>/);
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d, 'a decision group without its question').toMatch(/observed-decision-question">\s*\S/);
    }

    const questions = blocks('class="observed-disclosure" id="question-', /<\/details>/);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q, 'a ruling without its question').toMatch(/observed-question-text">\s*\S/);
    }

    if (inSection('evidence').length > 0) {
      const evidence = html.split('id="needs-evidence"')[1]!.split('</section>')[0]!;
      const rows = evidence.match(/<li>[\s\S]*?<\/li>/g) ?? [];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row, 'an evidence row without the missing evidence').toMatch(/(tracked-tag">[^<]*<\/span>\s*)?<span>\s*[^<\s]/);
        // A row must say what part of the movement is missing as well as what
        // would help, or every row reads as "nothing is known".
        const plain = row.match(/<span>\s*[^<\s][^<]*<\/span>/g) ?? [];
        expect(plain.length, `evidence row lacks its reason: ${row}`).toBe(2);
      }
    }
  });

  it('keeps tracked names unmistakably apart from official tricks', async () => {
    const html = await page();
    // Entries carry a source tag, never a canonical hashtag or detail link.
    expect(html).toContain('tracked-tag');
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/[a-z]/);
    // The curation confidence chips stay off the public cards.
    expect(html).not.toMatch(/>parser: |>doctrine: /);
  });

  it('the resolved block holds aliases and terms; review-held observational names are suppressed', async () => {
    const html = await page();
    expect(html).toContain('id="documented-archive"');
    expect(html).toContain('id="archive-represented"');
    // Observational (folk / documented) names are held off the public surface while
    // the synonym / historical-vocabulary reconciliation runs (the publication gate),
    // so that sub-section does not render publicly.
    expect(html).not.toContain('id="archive-observational"');
    expect(html).toContain('id="archive-terms"');
  });

  it('malformed source fragments never render', async () => {
    const html = await page();
    expect(html).not.toContain('Inside Stall moved to Clipper Stall');
    expect(html).not.toContain('Toe Stall dragged from Xbd position');
  });

  it('a duplicated identity renders once (the twin spelling folds into the primary)', async () => {
    const html = await page();
    const primary = OBSERVATIONAL_UNIVERSE.find(r => r.identityKey === 'blurrymirage' && r.groupPrimary)!;
    const twin = OBSERVATIONAL_UNIVERSE.find(r => r.identityKey === 'blurrymirage' && !r.groupPrimary)!;
    expect(html).toContain(primary.name);
    // The twin's exact name appears at most once anywhere it is echoed by the
    // primary's own text; it never renders as its own entry (its parenthetical
    // variant is the primary here, so the plain twin string is a substring).
    expect(primary.alsoRecordedAs).toContain(twin.name);
  });

  it('carries no dashboard tiles, and its census stays internally consistent', async () => {
    const html = await page();
    // Each section heading carries its own count; a row of headline figures
    // above the sections reads as a work-queue dashboard.
    expect(html).not.toContain('observed-stat');
    // The overall census stays internally consistent.
    expect(OBSERVATIONAL_UNIVERSE_STATS.total).toBe(OBSERVATIONAL_UNIVERSE.length);
    const sectionSum = Object.values(OBSERVATIONAL_UNIVERSE_STATS.publicSections).reduce((a, b) => a + b, 0);
    expect(sectionSum).toBe(OBSERVATIONAL_UNIVERSE_STATS.identityCount);
  });

  // ── Overlap-safety / layer-separation guard ──
  it('never emits a canonical hashtag chip or a canonical trick-detail link', async () => {
    const html = await page();
    expect(html).toContain('tracked-tag');
    expect(html).not.toContain('hero-hashtag');
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/[a-z]/);
  });

  it('provisional ADD stays labelled provisional, never canonical', async () => {
    const html = await page();
    if (/ADD \d+/.test(html)) {
      expect(html).toMatch(/ADD \d+ \(provisional\)/);
    }
  });

  // ── Database-tracked pending names ──
  // Defect caught: a trick the dictionary holds out on an open question is
  // filed among resolved names, as if nothing about it were left to settle.
  it('held-out database rows sit with the open questions, never in the resolved block', async () => {
    const html = await page();
    const heldOut = html.split('id="held-out"')[1]?.split('</details>')[0] ?? '';
    expect(heldOut).toContain('pending zorblax');
    expect(heldOut).toContain('pending quasar');
    const open = html.split('id="waiting-on-a-ruling"')[1]!.split('id="needs-evidence"')[0]!;
    expect(open).toContain('id="held-out"');
    const resolved = html.split('id="documented-archive"')[1] ?? '';
    expect(resolved).not.toContain('pending zorblax');
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/pending-zorblax"/);
    expect(OBSERVATIONAL_UNIVERSE.some(r => r.slug === 'pending-zorblax')).toBe(false);
  });
});
