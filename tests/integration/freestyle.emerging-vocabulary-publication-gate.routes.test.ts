/**
 * Emerging Vocabulary publication gate.
 *
 * Names still under synonym / historical-vocabulary reconciliation must never
 * appear on the PUBLIC observational surface (/freestyle/observational): an
 * unrecognized alias, abbreviation, retired name, or spelling variant must not be
 * shown to visitors as if it were novel vocabulary. They remain on the internal
 * workbench with provenance. This guard renders the public page against a clean DB
 * (so the DB-published filter removes nothing) and asserts none of the held names
 * survive to the public surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { EV_REVIEW_HELD_NAMES } from '../../src/content/freestyleEvReviewHold';

const { dbPath } = setTestEnv('3097');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/observational — publication gate', () => {
  it('renders the Emerging Vocabulary page', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Emerging Vocabulary');
  });

  // Match a held name only as a complete rendered element (immediately after a tag
  // open, ending at a tag close or a source parenthetical), so a longer name that
  // merely contains a held name as a substring (e.g. "Stepping Massacre" contains
  // "massacre") is not a false positive.
  const leakedIn = (html: string) => {
    const haystack = html.toLowerCase();
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...EV_REVIEW_HELD_NAMES].filter(
      name => new RegExp('>\\s*' + esc(name) + '\\s*[<(]').test(haystack));
  };

  it('shows no review-held name on the public observational surface', async () => {
    const res = await request(createApp()).get('/freestyle/observational');
    expect(leakedIn(res.text)).toEqual([]);
  });

  it('leaks no review-held name onto the dictionary landing (the Emerging Vocabulary tile lives here)', async () => {
    // The publication hold is applied once at the service boundary
    // (publicObservationalUniverse), so the dictionary landing — which carries the
    // Emerging Vocabulary tile count derived from the same view — must not surface a
    // held name either.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(leakedIn(res.text)).toEqual([]);
  });
});
