/**
 * A trick whose stored description is a structural placeholder (formula-embedded
 * backfill or thin restatement) must never render its shorthand or raw notation
 * on the public trick page, in either the visible About prose or the SEO meta
 * description. Ordinary instructional prose renders normally on both surfaces.
 *
 * Pins each placeholder shape separately (JOB notation, bracket notation, ADD
 * arithmetic, parenthesized decomposition) and an ordinary-prose control.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3132');
let createApp: Awaited<ReturnType<typeof importApp>>;

const CLEAN_PROSE = 'The leg circles the bag the opposite way around a delayed bag before the catch.';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'zz_job_notation', canonical_name: 'ZZ Job Notation', adds: '4', is_active: 1,
    description: 'Atomic on barrage. 4 ADD = atomic(+1) + barrage(3); JOB TOE > OP OUT [DEX] > OP TOE [DEL].',
  });
  insertFreestyleTrick(db, {
    slug: 'zz_bracket_notation', canonical_name: 'ZZ Bracket Notation', adds: '3', is_active: 1,
    description: 'Sets into the wing arc [BOD] before a cross-body recovery.',
  });
  insertFreestyleTrick(db, {
    slug: 'zz_add_arithmetic', canonical_name: 'ZZ Add Arithmetic', adds: '5', is_active: 1,
    description: 'Atomic on blender. 5 ADD = atomic(1) + blender(4).',
  });
  insertFreestyleTrick(db, {
    slug: 'zz_paren_decomp', canonical_name: 'ZZ Paren Decomp', adds: '4', is_active: 1,
    description: 'Atomic Drifter (atomic(+1) + drifter(3) = 4).',
  });
  insertFreestyleTrick(db, {
    slug: 'zz_clean_prose', canonical_name: 'ZZ Clean Prose', adds: '3', is_active: 1,
    description: CLEAN_PROSE,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — structural-placeholder descriptions never render shorthand', () => {
  it('suppresses a JOB-notation description in both copy and metadata', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/zz_job_notation');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('ADD =');
    expect(res.text).not.toContain('JOB TOE');
    expect(res.text).not.toContain('[DEX]');
  });

  it('suppresses a bracket-token description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/zz_bracket_notation');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('[BOD]');
  });

  it('suppresses an ADD-arithmetic description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/zz_add_arithmetic');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('ADD =');
    expect(res.text).not.toContain('atomic(1)');
  });

  it('suppresses a parenthesized decomposition description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/zz_paren_decomp');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('(+1)');
    expect(res.text).not.toContain('drifter(3)');
  });
});

describe('GET /freestyle/tricks/:slug — ordinary prose renders in copy and metadata', () => {
  it('renders a clean instructional description as visible prose and in the meta description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/zz_clean_prose');
    expect(res.status).toBe(200);
    // Visible About block.
    expect(res.text).toContain('class="trick-description"');
    expect(res.text).toContain(CLEAN_PROSE);
    // SEO meta description carries the same prose (appears at least twice: on-page + meta tag).
    expect(res.text.split(CLEAN_PROSE).length - 1).toBeGreaterThanOrEqual(2);
  });
});
