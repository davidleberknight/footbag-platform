/**
 * Canonical persona catalog: every entry instantiates cleanly and carries
 * coverage annotations.
 *
 * Iterates CANONICAL_PERSONAS, seeds each into a fresh test DB via seedPersona,
 * and asserts: no DB constraint violation, a member row lands under the
 * persona slug, and the entry documents the dimensions it exercises. As the
 * catalog grows (onboarding, legacy, club, payment-history, edge-case
 * variants), this test exercises every added persona without further edits.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3401');
let db: BetterSqlite3.Database;

beforeAll(() => {
  db = createTestDb(dbPath);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('canonical persona catalog', () => {
  it('holds an expanded catalog (20-40 personas) with unique slugs', () => {
    expect(CANONICAL_PERSONAS.length).toBeGreaterThanOrEqual(20);
    expect(CANONICAL_PERSONAS.length).toBeLessThanOrEqual(40);
    const slugs = CANONICAL_PERSONAS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every entry carries non-empty coverage notes', () => {
    for (const spec of CANONICAL_PERSONAS) {
      expect(spec.coverageNotes.length, `${spec.slug} coverageNotes`).toBeGreaterThan(0);
    }
  });

  it('every entry seeds without a DB constraint violation and lands a member', () => {
    const memberBySlug = db.prepare(`SELECT id FROM members WHERE slug = ?`);
    for (const spec of CANONICAL_PERSONAS) {
      expect(() => db.transaction(() => seedPersona(db, spec))(), spec.slug).not.toThrow();
      const row = memberBySlug.get(spec.slug) as { id: string } | undefined;
      expect(row?.id, `${spec.slug} member row`).toBe(`member_persona_${spec.slug}`);
    }
  });
});
