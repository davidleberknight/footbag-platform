/**
 * Trick-detail parser-diagnostic panel: no internal QC leaks on the public page.
 *
 * The structural-decomposition panel shows human-facing information (the
 * plain-language analysis status, asserted and computed ADD, and whether they
 * agree) but never the raw machine-formatted parser warning codes, the raw
 * status value, or an internal-document reference. An unrecognized parser status
 * falls back to a neutral hedge.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3569');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A recognized status ("approximate") carrying every machine-warning family.
  insertFreestyleTrick(db, {
    slug: 'diag_recognized', canonical_name: 'diag recognized', adds: '5',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    operational_notation: 'CLIP > SAME IN [DEX] > OP TOE [DEL]',
    jobs_notation_raw: 'DIAG RECOGNIZED RAW',
    computed_adds: 4, add_formula_status: 'approximate',
    structural_parse_json: JSON.stringify({
      parse_warnings: [
        'inferred_self_canonical_atom',
        'approximate_add_formula:computed=4,asserted=5',
        'policy_token_encountered:nuclear',
      ],
    }),
    review_status: 'expert_reviewed', is_active: 1,
  });
  // An unrecognized status: must fall back to the neutral hedge.
  insertFreestyleTrick(db, {
    slug: 'diag_unknown', canonical_name: 'diag unknown', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [DEL]',
    jobs_notation_raw: 'DIAG UNKNOWN RAW',
    computed_adds: 3, add_formula_status: 'some_unknown_status',
    structural_parse_json: JSON.stringify({ parse_warnings: [] }),
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — parser-diagnostic public surface', () => {
  it('does not render any machine-formatted warning family', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_recognized');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('inferred_self_canonical_atom');
    expect(res.text).not.toContain('approximate_add_formula');
    expect(res.text).not.toContain('policy_token_encountered');
    expect(res.text).not.toContain('Parse warnings');
  });

  it('still renders the human-readable status and the asserted/computed ADD comparison', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_recognized');
    expect(res.text).toContain('Structural decomposition');
    expect(res.text).toContain('Approximate');                 // human status label
    expect(res.text).toContain('Asserted ADD');
    expect(res.text).toContain('Computed ADD');
    expect(res.text).toContain('disagrees with asserted');     // human agreement indicator
  });

  it('never renders the raw status value in parentheses', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_recognized');
    expect(res.text).not.toContain('(approximate)');
  });

  it('falls back to a neutral hedge for an unrecognized status, with no raw value or doc reference', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/diag_unknown');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Pending review');
    expect(res.text).toContain('Analysis status pending review.');
    expect(res.text).not.toContain('some_unknown_status');
    expect(res.text).not.toContain('See PROPOSAL');
    expect(res.text).not.toContain('Status produced by the parser');
  });
});
