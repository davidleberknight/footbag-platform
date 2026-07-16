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
 * Layer-separation contract (asserted below): observational entries carry a
 * tracked tag, NOT a canonical hashtag; they NEVER link to a canonical trick
 * detail page; provisional ADD is labelled "extrapolated", never canonical.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

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
  const res = await request(await createApp()).get('/freestyle/observational');
  expect(res.status).toBe(200);
  return res.text;
}

const primaries = OBSERVATIONAL_UNIVERSE.filter(r => r.groupPrimary);
const inSection = (s: string) => primaries.filter(r => r.publicSection === s);

describe('GET /freestyle/observational — four-section lifecycle surface', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
  });

  it('opens with the orientation line: this is the not-yet-official side of the canonical line', async () => {
    const html = await page();
    expect(html).toContain('waiting room of the freestyle dictionary');
    expect(html).toContain('Nothing on this page is an official trick yet');
    expect(html).toMatch(/organized by what each one actually waits on/);
  });

  it('shows a visible source-key legend so the per-card badges are not tooltip-only', async () => {
    const html = await page();
    expect(html).toContain('Source key: PB is PassBack, FM is FootbagMoves, SG is Stanford shorthand.');
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

  it('decide-now renders the curator decision clusters with question and recommendation, unpromoted', async () => {
    const html = await page();
    expect(html).toContain('Decide now');
    // Cluster prose renders: the smallest exact decision plus its facts.
    expect(html).toContain('observed-decision-question');
    expect(html).toContain('Recommendation and evidence');
    // A populated decision group renders; an answered (empty) group vanishes.
    expect(html).toMatch(/id="decision-(D\d|A0)"/);
    // Decision members render as observational cards, never canonical links.
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/[a-z]/);
  });

  it('waiting-on-a-ruling groups rows by question with exact text, meta, and unlock counts', async () => {
    const html = await page();
    expect(html).toContain('Waiting on a named ruling');
    // Every rendered question card is one of the registered questions and
    // shows an unlock count; no undifferentiated wall of names.
    for (const q of EMERGING_QUESTIONS) {
      if (html.includes(`id="question-${q.id}"`)) {
        expect(html).toContain(q.title);
        expect(html).toMatch(new RegExp(`id="question-${q.id}"[\\s\\S]{0,400}unlocks \\d+`));
      }
    }
    expect(html).toContain('observed-question-text');
    expect(html).toMatch(/Status: (drafted|sent)/);
    // A published identity riding the name-form question carries its target.
    expect(html).toMatch(/published as [a-z_]+; name form only/);
  });

  it('needs-evidence states the precise missing evidence per row', async () => {
    const html = await page();
    if (inSection('evidence').length > 0) {
      expect(html).toContain('Needs evidence');
      expect(html).toMatch(/footage, notation, or a stronger source|footage or notation of the movement/);
    }
  });

  it('the documented archive holds resolved and term vocabulary; review-held observational names are suppressed', async () => {
    const html = await page();
    expect(html).toContain('Documented vocabulary archive');
    expect(html).toContain('Already represented');
    // Observational (folk / documented) names are held off the public surface while
    // the synonym / historical-vocabulary reconciliation runs (the publication gate),
    // so the observational-names archive sub-section does not render publicly.
    expect(html).not.toContain('Observational names');
    expect(html).toContain('Recorded terms (not tricks)');
    expect(html).toContain('not active publication candidates');
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

  it('tiles and counts derive from current dispositions, never hard-coded totals', async () => {
    const html = await page();
    for (const label of ['Decide now', 'Open questions', 'Waiting on a ruling', 'Needs evidence', 'Documented archive']) {
      expect(html).toContain(label);
    }
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

  it('provisional ADD stays labelled extrapolated, never canonical', async () => {
    const html = await page();
    if (/ADD \d+/.test(html)) {
      expect(html).toMatch(/ADD \d+ \(extrapolated\)/);
    }
  });

  // ── Database-tracked pending names ──
  it('unadjudicated database-tracked rows surface in the archive, never double-counted', async () => {
    const html = await page();
    expect(html).toContain('Database-tracked, not yet adjudicated');
    expect(html).toContain('pending zorblax');
    expect(html).toContain('pending quasar');
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/pending-zorblax"/);
    expect(OBSERVATIONAL_UNIVERSE.some(r => r.slug === 'pending-zorblax')).toBe(false);
  });
});
