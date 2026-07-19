/**
 * A trick's records are aggregated across every spelling that canonicalizes to it:
 * its canonical name and all of its alias names. Records filed under two different
 * alias spellings of one trick (Alpine PLO and Weaving Magellan both resolve to
 * Puck) both list and both count; records are deduplicated only by durable record
 * id, so two distinct rows are never collapsed just because they share a canonical
 * trick, and superseded rows still participate in progression.
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
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleRecord,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3770');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Puck: two current records, each filed under a different alias spelling.
  insertFreestyleTrick(db, {
    slug: 'puck', canonical_name: 'puck', adds: '4', base_trick: 'legover',
    trick_family: 'legover', category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > SAME TOE [DEL]',
  });
  insertFreestyleTrickAlias(db, 'alpine_plo', 'puck', 'Alpine PLO');
  insertFreestyleTrickAlias(db, 'weaving_magellan', 'puck', 'Weaving Magellan');
  insertFreestyleRecord(db, {
    trick_name: 'Alpine PLO', display_name: 'Krzysztof Sobotka', value_numeric: 24,
    confidence: 'probable', person_id: null,
  });
  insertFreestyleRecord(db, {
    trick_name: 'Weaving Magellan', display_name: 'Derek Littlefield', value_numeric: 17,
    confidence: 'probable', person_id: null,
  });

  // A second trick with a canonical-spelled record, an alias-spelled record, and a
  // superseded record, to prove canonical+alias aggregation, progression, and no
  // id-collapse.
  insertFreestyleTrick(db, {
    slug: 'aggtrick', canonical_name: 'aggtrick', adds: '3', base_trick: 'legover',
    trick_family: 'legover', category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP OUT [DEX] > SAME TOE [DEL]',
  });
  insertFreestyleTrickAlias(db, 'aggalias', 'aggtrick', 'aggalias');
  const canonicalId = insertFreestyleRecord(db, {
    trick_name: 'aggtrick', display_name: 'Canon Holder', value_numeric: 30,
    confidence: 'probable', person_id: null,
  });
  insertFreestyleRecord(db, {
    trick_name: 'aggalias', display_name: 'Alias Holder', value_numeric: 12,
    confidence: 'probable', person_id: null,
  });
  insertFreestyleRecord(db, {
    trick_name: 'aggtrick', display_name: 'Old Holder', value_numeric: 21,
    confidence: 'probable', person_id: null, superseded_by: canonicalId,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — records aggregate across canonical aliases', () => {
  it('Puck lists both alias-spelled records with their own names, values, and holders', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/puck');
    expect(res.status).toBe(200);
    // Both records display: names, holders, and their distinct values.
    expect(res.text).toContain('Alpine PLO');
    expect(res.text).toContain('Weaving Magellan');
    expect(res.text).toContain('Krzysztof Sobotka');
    expect(res.text).toContain('Derek Littlefield');
    expect(res.text).toContain('24');
    expect(res.text).toContain('17');
  });

  it('aggregates canonical and alias spellings, keeps superseded rows in progression, and never collapses distinct records', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/aggtrick');
    expect(res.status).toBe(200);
    // Canonical-spelled and alias-spelled current records both aggregate (two
    // distinct rows, not collapsed to one because they share a canonical trick).
    expect(res.text).toContain('Canon Holder');
    expect(res.text).toContain('Alias Holder');
    // The superseded record still participates in progression.
    expect(res.text).toContain('Old Holder');
  });
});
