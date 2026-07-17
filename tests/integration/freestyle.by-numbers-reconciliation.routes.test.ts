/**
 * The landing "By the Numbers" note must state its count universe precisely: the
 * total is the browsable dictionary-trick subset (derived, not a literal), it
 * excludes modifiers/operators, and rows still awaiting a notation breakdown are
 * counted inside that total rather than silently dropped or presented as
 * additional to it.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3216');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { insertFreestyleTrick } from '../fixtures/factories';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Two browsable dictionary tricks: one fully notated, one still awaiting a
  // notation breakdown (blank operational notation).
  insertFreestyleTrick(db, {
    slug: 'zeta_notated', canonical_name: 'Zeta Notated',
    operational_notation: 'TOE > SAME IN [DEX] > SAME TOE', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'zeta_pending', canonical_name: 'Zeta Pending',
    operational_notation: null, is_active: 1,
  });
  // A modifier is not a dictionary trick and must not be counted in the total.
  insertFreestyleTrick(db, {
    slug: 'paradox', canonical_name: 'Paradox', category: 'modifier', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('freestyle By the Numbers — count universe reconciles', () => {
  it('states the browsable dictionary-trick total and excludes modifiers', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Counts cover 2 dictionary tricks/);
    // The imprecise "active canonical tricks" label is gone, and the modifier
    // is not folded into the trick total.
    expect(res.text).not.toContain('active canonical tricks');
    expect(res.text).not.toContain('3 dictionary tricks');
  });

  it('keeps incomplete rows inside the stated total, named as a subset', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.text).toContain('1 of them still awaits a complete notation breakdown');
  });

  it('renders a sentence whose two numbers reconcile with the underlying sets', async () => {
    // Seeded: 2 dictionary tricks (one notated, one awaiting) + 1 modifier.
    const res = await request(createApp()).get('/freestyle');
    const m = res.text.match(
      /Counts cover (\d+) dictionary tricks(?:; (\d+) of them still (?:await|awaits) a complete notation breakdown)?\./,
    );
    expect(m, 'rendered By the Numbers sentence').not.toBeNull();
    const total = Number(m![1]);
    const awaiting = m![2] ? Number(m![2]) : 0;
    const complete = total - awaiting;
    // The stated total is the two browsable dictionary tricks (the modifier is
    // excluded); awaiting rows are a subset of that total, not additional to it;
    // and complete + awaiting reconcile back to the total exactly.
    expect(total).toBe(2);
    expect(awaiting).toBe(1);
    expect(awaiting).toBeLessThanOrEqual(total);
    expect(complete + awaiting).toBe(total);
  });
});
