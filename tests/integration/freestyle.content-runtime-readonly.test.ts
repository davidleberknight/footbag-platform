/**
 * Freestyle content tables are read-only at runtime outside admin curation.
 *
 * After cutover the live database is the source of truth for freestyle content,
 * so nothing in ordinary runtime (app boot, public page reads) may rewrite any
 * freestyle table; only the admin curation write paths may. This suite seeds one
 * row in every freestyle table, boots the app, serves the public pages that read
 * them, and asserts that each table is byte-identical afterward, which is the
 * runtime half of "content edits survive a data-preserving deploy" (the transport
 * half is pinned by the deploy-code script check; the full drill is an operator
 * rehearsal).
 *
 * The snapshot covers the whole freestyle table set, not just the three tables a
 * public page reads directly: a stray runtime write to a composition, alias,
 * source-link, relation, or tip table is exactly the silent mutation this guard
 * exists to catch, so every freestyle table is pinned.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleRecord,
  insertConsecutiveKicksRecord,
  insertFreestyleTrickModifier,
  insertFreestyleTrickSource,
  insertFreestyleTrickSourceLink,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifierLink,
  insertFreestyleTrickRelation,
  insertFreestyleTrickTip,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3974');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

// Every freestyle table, each read with a deterministic order so the before/after
// serializations compare byte-for-byte. Adding a freestyle table to the schema
// without adding it here leaves a runtime write to it uncaught, so the list is the
// full set on purpose.
function snapshotTables(): string {
  const q = (sql: string) => db.prepare(sql).all();
  return JSON.stringify({
    tricks: q('SELECT * FROM freestyle_tricks ORDER BY slug'),
    records: q('SELECT * FROM freestyle_records ORDER BY id'),
    consecutive: q('SELECT * FROM consecutive_kicks_records ORDER BY id'),
    modifiers: q('SELECT * FROM freestyle_trick_modifiers ORDER BY slug'),
    sources: q('SELECT * FROM freestyle_trick_sources ORDER BY id'),
    sourceLinks: q('SELECT * FROM freestyle_trick_source_links ORDER BY trick_slug, source_id'),
    aliases: q('SELECT * FROM freestyle_trick_aliases ORDER BY alias_slug'),
    modifierLinks: q(
      'SELECT * FROM freestyle_trick_modifier_links ORDER BY trick_slug, modifier_slug, apply_order',
    ),
    relations: q(
      'SELECT * FROM freestyle_trick_relations ORDER BY from_trick_slug, to_trick_slug, relation_type',
    ),
    tips: q('SELECT * FROM freestyle_trick_tips ORDER BY id'),
  });
}

beforeAll(async () => {
  db = createTestDb(dbPath);

  // Two tricks: the subject and a kin the relation table points at.
  insertFreestyleTrick(db, {
    slug: 'immutable_trick',
    canonical_name: 'Immutable Trick',
    adds: '3',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'immutable_trick_kin',
    canonical_name: 'Immutable Trick Kin',
    adds: '3',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });

  insertFreestyleRecord(db, {
    id: 'immutable_record',
    display_name: 'Immutable Holder',
    trick_name: 'Immutable Trick',
    value_numeric: 21,
  });
  insertConsecutiveKicksRecord(db, {
    id: 'immutable_ck',
    sort_order: 11,
    player_1: 'Immutable Kicker',
    score: 12345,
  });

  // Composition / provenance / relationship tables, each parented on the subject
  // trick so the detail page renders every relationship renderer during the read.
  insertFreestyleTrickModifier(db, { slug: 'immutable_modifier', add_bonus: 1 });
  const sourceId = insertFreestyleTrickSource(db, {
    id: 'immutable_source',
    source_label: 'Immutable Source',
  });
  insertFreestyleTrickSourceLink(db, 'immutable_trick', sourceId, { asserted_adds: 3 });
  insertFreestyleTrickAlias(db, 'immutable_alias', 'immutable_trick', 'Immutable Alias');
  insertFreestyleTrickModifierLink(db, 'immutable_trick', 'immutable_modifier');
  insertFreestyleTrickRelation(db, 'immutable_trick', 'immutable_trick_kin', {
    relation_type: 'equivalent_to',
  });
  insertFreestyleTrickTip(db, {
    trick_slug: 'immutable_trick',
    tip_text: 'Keep the set waist high and the head still.',
  });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('freestyle content tables under ordinary runtime reads', () => {
  it('boot plus the public read surfaces leave every freestyle table byte-identical', async () => {
    const before = snapshotTables();

    const app = await createApp();
    const reads = [
      '/freestyle/tricks',
      '/freestyle/tricks/immutable_trick',
      '/freestyle/tricks/immutable_trick_kin',
      '/freestyle/records',
      '/records',
    ];
    for (const path of reads) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should render`).toBe(200);
    }

    expect(snapshotTables()).toBe(before);
  });
});
