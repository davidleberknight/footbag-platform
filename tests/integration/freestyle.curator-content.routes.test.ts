/**
 * Seeded curator content renders where it rendered from the content modules.
 *
 * The record review notes and the modifier notes moved from content modules
 * into database columns, seeded from the staged modules. The pages must show
 * each staged entry exactly where they showed it before: a record under review
 * carries its note and links to no trick, and a trick page shows each linked
 * modifier's beginner note and composition gloss. The expected text is read
 * from the staged modules, so the check follows the content, not a copy of it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleRecord,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';
import { seedCuratorContent, STAGED_CURATOR_CONTENT } from '../../freestyle/loaders/28a_seed_curator_content';
import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

const { dbPath } = setTestEnv('4149');
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const content = STAGED_CURATOR_CONTENT;
const TRICK = 'zz_parity_trick';
const PLAIN_MODIFIER = 'zz_plain_modifier';
// Modifiers carrying both staged texts, linked to the one trick page.
const noted = [...content.beginnerNotes.keys()].filter(s => content.compositionGlosses.has(s)).slice(0, 3);

function escapeHbs(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/`/g, '&#x60;')
    .replace(/=/g, '&#x3D;');
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Every review record names a trick that exists, so only the review note can
  // explain a missing link; Mirage is the ordinary record that must still link.
  for (const name of [...content.recordReviews.keys(), 'Mirage']) {
    insertFreestyleTrick(db, { slug: trickNameToSlug(name), canonical_name: name });
    insertFreestyleRecord(db, { trick_name: name, display_name: 'Parity Holder', confidence: 'verified' });
  }
  const modifierSlugs = new Set([...content.beginnerNotes.keys(), ...content.compositionGlosses.keys(), PLAIN_MODIFIER]);
  for (const slug of modifierSlugs) insertFreestyleTrickModifier(db, { slug });
  insertFreestyleTrick(db, { slug: TRICK, canonical_name: 'zz parity trick', adds: '6' });
  [...noted, PLAIN_MODIFIER].forEach((slug, i) => insertFreestyleTrickModifierLink(db, TRICK, slug, i + 1));
  seedCuratorContent(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('records under curator review', () => {
  // Defect caught: a record under review losing its note, or linking a visitor
  // to a speculative trick, once the note comes from the database.
  it('shows each staged review note and links none of those records', async () => {
    const res = await page('/freestyle/records');
    expect(res.status).toBe(200);
    expect(content.recordReviews.size).toBeGreaterThan(0);
    for (const [name, note] of content.recordReviews) {
      expect(res.text, name).toContain(`<span class="record-review-note">${escapeHbs(note)}</span>`);
      expect(res.text, name).not.toContain(`href="/freestyle/tricks/${trickNameToSlug(name)}"`);
    }
    // Positive control: an ordinary record still links to its trick.
    expect(res.text).toContain('href="/freestyle/tricks/mirage"');
  });
});

describe('modifier notes on a trick page', () => {
  // Defect caught: the facts block or the modifier rows losing a modifier's note
  // or gloss once it comes from the registry row.
  it('shows each linked modifier beginner note and composition gloss', async () => {
    const res = await page(`/freestyle/tricks/${TRICK}`);
    expect(res.status).toBe(200);
    expect(noted.length).toBeGreaterThan(0);
    for (const slug of noted) {
      expect(res.text, slug).toContain(`<span class="structural-fact-note">${escapeHbs(content.beginnerNotes.get(slug)!)}</span>`);
      expect(res.text, slug).toContain(`<p class="trick-modifier-gloss">${escapeHbs(content.compositionGlosses.get(slug)!)}</p>`);
    }
    // A modifier with no staged text renders without a note or gloss.
    const notes = res.text.match(/class="structural-fact-note"/g) ?? [];
    const glosses = res.text.match(/class="trick-modifier-gloss"/g) ?? [];
    expect(notes).toHaveLength(noted.length);
    expect(glosses).toHaveLength(noted.length);
  });
});
