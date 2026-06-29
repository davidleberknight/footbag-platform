/**
 * Legacy footbag.org Member Tips on the trick-detail page.
 *
 * Contract: a trick with recovered community tips renders a compact, collapsed
 * "Community Tips (N)" control labelled as community advice (not doctrine), with
 * each tip's text inside it. A trick with no tips renders no such control. Tips
 * are display-only: they never appear as the canonical description.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickTip } from '../fixtures/factories';

const { dbPath } = setTestEnv('3417');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    description: 'A toe-set outside dex.', operational_notation: 'TOE > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickTip(db, { trick_slug: 'mirage', tip_text: 'Lean over the bag and set it vertically.', display_order: 0 });
  insertFreestyleTrickTip(db, { trick_slug: 'mirage', tip_text: 'Wait for the apex before you turn your hips.', display_order: 1 });
  // An unresolved-status tip on the same trick must never reach the page.
  insertFreestyleTrickTip(db, { trick_slug: 'mirage', tip_text: 'HIDDEN unresolved advice on mirage', status: 'unresolved_freestyle', display_order: 2 });

  insertFreestyleTrick(db, {
    slug: 'osis', canonical_name: 'osis', adds: '3',
    base_trick: 'osis', trick_family: 'osis', category: 'dex',
    description: 'A spinning clipper.', operational_notation: 'SET > SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Community Tips on trick detail', () => {
  it('renders a compact, count-labelled control with each tip for a tipped trick', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('community-tips-collapsible');
    expect(res.text).toContain('Community Tips (2)');
    expect(res.text).toContain('Lean over the bag and set it vertically.');
    expect(res.text).toContain('Wait for the apex before you turn your hips.');
  });

  it('labels the tips as community advice, not official doctrine', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).toContain('Legacy footbag.org community advice');
    expect(res.text).toContain('not official doctrine');
  });

  it('uses a collapsed-by-default <details> so the page does not grow', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    // the details element has no `open` attribute on the tips control
    expect(res.text).toMatch(/<details class="community-tips-collapsible">/);
  });

  it('does NOT render the control for a trick with no tips', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('community-tips-collapsible');
    expect(res.text).not.toContain('Community Tips (');
  });

  it('never renders non-published (unresolved) tips, and they are excluded from the count', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.text).not.toContain('HIDDEN unresolved advice on mirage');
    expect(res.text).toContain('Community Tips (2)');   // the unresolved tip is not counted
  });

  it('keeps tips out of the canonical description (display-only, not doctrine)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    // the canonical description renders, and the tip text is not substituted for it
    expect(res.text).toContain('A toe-set outside dex.');
  });
});
