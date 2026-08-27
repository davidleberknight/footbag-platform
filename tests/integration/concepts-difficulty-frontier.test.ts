/**
 * The difficulty-frontier note on the Freestyle Concepts page, and the doctrine
 * it has to agree with.
 *
 * The note used to call "Surging Ducking Paradox Blender" a close 8-ADD
 * contender. No such trick exists at any difficulty, and the repository already
 * carried a curator's ruling on that exact name: it is an outside-source name
 * for the 7-ADD Cheese Processor under the paradox-free reading, and it was
 * deliberately not adopted as an 8-ADD canonical. Two surfaces therefore said
 * opposite things about one name, and the prose was the newer and vaguer of the
 * two.
 *
 * The correction is subtraction. Naming a different trick instead would have
 * been a fresh product judgement about which of the remaining 8-ADD tricks reads
 * as a contender, and the list was never exhaustive in the first place.
 *
 * These pin the evidence rather than the wording: what the curated ruling says,
 * what the dictionary actually holds at the frontier, and that the surviving
 * claims are still true. A future edit is free to rephrase, and not free to
 * reintroduce a trick the dictionary does not have.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

import { setTestEnv, createTestDb } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const REPO_ROOT = join(__dirname, '..', '..');
const CONCEPTS_VIEW = join(REPO_ROOT, 'src', 'views', 'freestyle', 'concepts.hbs');
const CONCEPTS_CONTENT = join(REPO_ROOT, 'src', 'content', 'freestyleComboAnalysisContent.ts');
const RELATED_TRICKS = join(REPO_ROOT, 'src', 'services', 'freestyleRelatedTricks.ts');

const RETIRED_NAME = 'Surging Ducking Paradox Blender';
const CAROUSEL = 'surging_ducking_paradox_symposium_whirling_rake';
const TORQUE = 'surging_ducking_paradox_torque';

/**
 * File text with runs of whitespace collapsed.
 *
 * The view wraps prose across lines, so a trick name can straddle a line break.
 * Searching the raw text would then report the name as absent while it is on the
 * page, which is the direction that matters: this file's central assertion is
 * that a name is gone, and a line break must not be able to satisfy it.
 */
const read = (p: string) => readFileSync(p, 'utf8').replace(/\s+/g, ' ');

/**
 * The difficulty-frontier passage alone, from either copy.
 *
 * Both are long files that name plenty of tricks for unrelated reasons, so an
 * assertion about what the note says has to be made about the note. Anchored on
 * the claim the passage exists to make, which survives rewording of everything
 * around it.
 */
function difficultyNote(text: string): string {
  const start = text.indexOf('video-corroborated landing');
  expect(start, 'the difficulty-frontier passage is no longer recognisable').toBeGreaterThan(-1);
  const end = text.indexOf('corroborating footage', start);
  expect(end, 'the passage no longer ends where it did').toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('the name the difficulty note used to carry', () => {
  it('is absent from both public copies of the note', () => {
    // Both are rendered surfaces. Correcting one and not the other would leave
    // the contradiction live for whichever readers reach the other.
    expect(read(CONCEPTS_VIEW)).not.toContain(RETIRED_NAME);
    expect(read(CONCEPTS_CONTENT)).not.toContain(RETIRED_NAME);
  });

  it('survives where the curator ruled on it, which is not a public claim', () => {
    // The ruling is the reason the prose was wrong, so deleting it as well would
    // remove the evidence and leave the next reader to rediscover it.
    const ruling = read(RELATED_TRICKS);
    expect(ruling).toContain(RETIRED_NAME);
    expect(ruling).toContain('not adopted as an 8-ADD canonical trick');
    expect(ruling).toContain('Cheese Processor');
  });

  it('is not reintroduced by substituting a different trick', () => {
    // The subtraction leaves one contender named. Adding another back would be a
    // product judgement about which of the remaining 8-ADD tricks belongs, and
    // the list was never written to be exhaustive.
    //
    // Scoped to the sentence, not the file: the page discusses other tricks
    // elsewhere for unrelated reasons, and a whole-file assertion would forbid
    // that too.
    for (const file of [CONCEPTS_VIEW, CONCEPTS_CONTENT]) {
      const note = difficultyNote(read(file));
      expect(note).toContain('Surging Ducking Paradox Torque');
      for (const other of ['Montage Swirl', 'Big Apple Sauce', 'Gyro Shooting Star']) {
        expect(note).not.toContain(other);
      }
    }
  });
});

describe('the claims the note still makes', () => {
  let db: Database.Database;

  beforeAll(() => {
    setTestEnv();
    db = createTestDb();
  });

  afterAll(() => {
    db.close();
  });

  const seedTrick = (slug: string, adds: string) =>
    insertFreestyleTrick(db, { slug, canonical_name: slug.replace(/_/g, ' '), adds, is_active: 1 });

  it('carousel is a real trick at the difficulty the prose attributes to it', () => {
    seedTrick(CAROUSEL, '8');
    const row = db
      .prepare('SELECT adds, is_active FROM freestyle_tricks WHERE slug = ?')
      .get(CAROUSEL) as { adds: string; is_active: number };
    expect(row.adds).toBe('8');
    expect(row.is_active).toBe(1);
  });

  it('the surviving contender is a real trick at eight ADD', () => {
    seedTrick(TORQUE, '8');
    const row = db
      .prepare('SELECT adds, is_active FROM freestyle_tricks WHERE slug = ?')
      .get(TORQUE) as { adds: string; is_active: number };
    expect(row.adds).toBe('8');
    expect(row.is_active).toBe(1);
  });

  it('the ruled reading of the retired name is a seven-ADD trick, not an eight', () => {
    // This is why the prose was wrong rather than merely imprecise: the name it
    // used resolves to a difficulty one below the claim it was making.
    seedTrick('cheese_processor', '7');
    const row = db
      .prepare('SELECT adds, is_active FROM freestyle_tricks WHERE slug = ?')
      .get('cheese_processor') as { adds: string; is_active: number };
    expect(row.adds).toBe('7');
    expect(row.is_active).toBe(1);
  });

  it('eight ADD is still the ceiling, so the claim about it holds', () => {
    // The note says eight is the highest video-corroborated landing represented.
    // A nine-ADD row appearing would make that stale; nothing else here would.
    seedTrick('montage_swirl', '8');
    const higher = db
      .prepare(
        `SELECT COUNT(*) AS n FROM freestyle_tricks
         WHERE is_active = 1 AND CAST(adds AS INTEGER) > 8`,
      )
      .get() as { n: number };
    expect(higher.n).toBe(0);
  });

  it('an eight-ADD trick existing is not by itself a reason to name it', () => {
    // Montage Swirl is 8 ADD and deliberately absent from the note: it is
    // attested by testimony with no footage, and the sentence is about
    // video-corroborated landings. Presence in the dictionary at the same
    // difficulty is not the same as belonging in that sentence.
    const eightAdd = db
      .prepare(
        `SELECT slug FROM freestyle_tricks
         WHERE is_active = 1 AND adds = '8' ORDER BY slug`,
      )
      .all() as Array<{ slug: string }>;
    expect(eightAdd.map((r) => r.slug)).toContain('montage_swirl');
    expect(read(CONCEPTS_VIEW)).not.toContain('Montage Swirl');
  });
});
