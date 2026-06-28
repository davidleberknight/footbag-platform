/**
 * Flying movement neighborhood.
 *
 * Flying is a platform-tracked movement concept with no teaching page. Its
 * canonical browsing surface is a Movement Neighborhood (the topology view),
 * populated structurally from the Flying body component in operational notation
 * (FLYING / DOUBLE KICK / DOUBLE KNEE body tokens) — never by trick name. The
 * Operators page routes Flying's "Browse tricks" action to this neighborhood.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3286');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Three tricks carrying a Flying body token (members), plus a name-coincidence
  // trick ("flying fish") whose notation has NO flying token (must be excluded),
  // plus a plain trick for contrast.
  const tricks: Array<Parameters<typeof insertFreestyleTrick>[1]> = [
    { slug: 'flying_clipper', canonical_name: 'flying clipper', adds: '2', base_trick: 'clipper_stall', trick_family: 'clipper_stall', category: 'compound', operational_notation: 'FLYING [BOD] > OP CLIP [XBD]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'dragonfly_kick', canonical_name: 'dragonfly kick', adds: '2', base_trick: 'toe_stall', trick_family: 'toe_stall', category: 'compound', operational_notation: 'FLYING [BOD] > OP OUT [DEX] [KICK]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'double_kick', canonical_name: 'double-kick', adds: '1', base_trick: 'double_kick', trick_family: 'double_kick', category: 'compound', operational_notation: 'DOUBLE KICK [BOD] [KICK]', review_status: 'expert_reviewed', is_active: 1 },
    // Name coincidence: "flying" in the name, but a ducking trick in notation.
    { slug: 'flying_fish', canonical_name: 'flying fish', adds: '4', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', operational_notation: 'TOE > SAME IN [DEX] > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
    { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'dex', operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]', review_status: 'expert_reviewed', is_active: 1 },
  ];
  for (const t of tricks) insertFreestyleTrick(db, t);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Slice the Flying neighborhood section out of the topology view.
function flyingGroupSlice(html: string): string {
  const start = html.indexOf('id="topology-flying"');
  if (start < 0) return '';
  const next = html.indexOf('id="topology-', start + 1);
  return html.slice(start, next < 0 ? html.length : next);
}

describe('GET /freestyle/tricks?view=topology — Flying neighborhood', () => {
  it('renders a Flying neighborhood populated by the Flying body component', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=topology');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="topology-flying"');
    const slice = flyingGroupSlice(res.text);
    expect(slice).toContain('href="/freestyle/tricks/flying_clipper"');
    expect(slice).toContain('href="/freestyle/tricks/dragonfly_kick"');
    expect(slice).toContain('href="/freestyle/tricks/double_kick"');
  });

  it('excludes a trick that only has "flying" in its name (no Flying body token)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=topology');
    const slice = flyingGroupSlice(res.text);
    expect(slice).not.toContain('/freestyle/tricks/flying_fish');
  });
});

describe('GET /freestyle/operators — Flying browse target', () => {
  it("routes Flying's Browse tricks to the Flying movement neighborhood, not a dictionary search", async () => {
    const res = await request(await createApp()).get('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=topology#topology-flying"');
    // The temporary search workaround for Flying is gone.
    expect(res.text).not.toContain('href="/freestyle/search?q=flying"');
  });
});
