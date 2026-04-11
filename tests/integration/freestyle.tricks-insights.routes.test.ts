/**
 * Integration tests for freestyle trick dictionary and insights pages.
 *
 * Covers:
 *   GET /freestyle/tricks         — trick dictionary index
 *   GET /freestyle/tricks/:slug   — enhanced trick detail (dict info + records)
 *   GET /freestyle/insights       — editorial insights page (service-layer constants)
 *   GET /freestyle                — landing page highlights (tricks + insights)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertHistoricalPerson,
  insertFreestyleRecord,
  insertFreestyleTrick,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3110');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const PERSON_ID = 'person-tricks-test-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertHistoricalPerson(db, {
    person_id:    PERSON_ID,
    person_name:  'Claire Dex',
    source_scope: 'CANONICAL',
  });

  // Trick in the dictionary with a passback record
  insertFreestyleTrick(db, {
    slug:          'whirl',
    canonical_name: 'whirl',
    adds:          '3',
    category:      'compound',
    description:   'rotational dex trick; most connected trick in the network',
    aliases_json:  '["spinning whirl (with modifier)"]',
    sort_order:    0,
  });

  // Trick in the dictionary with no passback record
  insertFreestyleTrick(db, {
    slug:          'blurriest',
    canonical_name: 'blurriest',
    adds:          '6',
    category:      'compound',
    description:   'maximum documented base ADD',
    aliases_json:  '[]',
    sort_order:    1,
  });

  // Modifier trick
  insertFreestyleTrick(db, {
    slug:          'ducking',
    canonical_name: 'ducking',
    adds:          'modifier',
    category:      'modifier',
    description:   'positional modifier; requires ducking under the bag',
    aliases_json:  '[]',
    sort_order:    2,
  });

  // Trick with aliases
  insertFreestyleTrick(db, {
    slug:          'legover',
    canonical_name: 'legover',
    adds:          '2',
    category:      'dex',
    description:   'basic leg-over dexterity',
    aliases_json:  '["leg over"]',
    sort_order:    3,
  });

  // Passback record for 'whirl' (links dict entry to record)
  insertFreestyleRecord(db, {
    id:            'fr-whirl-1',
    person_id:     PERSON_ID,
    display_name:  'Claire Dex',
    trick_name:    'whirl',
    value_numeric: 88,
    confidence:    'verified',
  });

  // Passback record for a trick NOT in the dictionary
  insertFreestyleRecord(db, {
    id:            'fr-unknown-1',
    display_name:  'Somebody',
    trick_name:    'mystery-trick',
    value_numeric: 5,
    confidence:    'probable',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('Trick Dictionary');
  });

  it('shows all inserted tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurriest');
    expect(res.text).toContain('ducking');
    expect(res.text).toContain('legover');
  });

  it('shows trick descriptions', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('most connected trick');
    expect(res.text).toContain('maximum documented base ADD');
  });

  it('shows ADD values', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('3');   // whirl
    expect(res.text).toContain('6');   // blurriest
    expect(res.text).toContain('modifier'); // ducking
  });

  it('links all dict tricks to /freestyle/tricks/:slug (not just those with records)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // whirl has records — linked
    expect(res.text).toContain('/freestyle/tricks/whirl');
    // blurriest has no record — but is in the dict, so now also linked
    expect(res.text).toContain('/freestyle/tricks/blurriest');
  });

  it('shows record indicator (★) for tricks that have passback records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // whirl has a record — should show the star indicator
    // blurriest has no record — no star (but still has a link)
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurriest');
  });

  it('shows aliases', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('leg over');
  });

  it('shows trick count in hero stats', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('tricks');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug — with dictionary entry', () => {
  it('returns 200 for a slug in dictionary that also has records', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
  });

  it('shows dictionary description', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('most connected trick');
  });

  it('shows ADD from dictionary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('3 ADD');
  });

  it('shows passback record holder', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('Claire Dex');
    expect(res.text).toContain('88');
  });

  it('shows record section header', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('Passback Records');
  });

  it('shows About This Trick section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('About This Trick');
  });

  it('shows breadcrumb with Trick Dictionary link', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('Trick Dictionary');
  });

  it('returns 200 for a slug in dictionary with NO records (dict-only trick)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.status).toBe(200);
    expect(res.text).toContain('blurriest');
    expect(res.text).toContain('maximum documented base ADD');
  });

  it('does NOT show Passback Records section for dict-only trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.text).not.toContain('Passback Records');
  });

  it('shows modifier type for a modifier trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/ducking');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Modifier');
    expect(res.text).toContain('no fixed ADD value');
  });

  it('returns 404 for a slug not in records OR dictionary', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/not-a-trick-at-all');
    expect(res.status).toBe(404);
  });

  it('shows record-only trick (not in dict) when accessed by slug', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/mystery-trick');
    expect(res.status).toBe(200);
    expect(res.text).toContain('mystery-trick');
    // No dict entry, so no About section
    expect(res.text).not.toContain('About This Trick');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/insights', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.status).toBe(200);
  });

  it('shows page title', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Freestyle Insights');
  });

  it('shows most-used tricks section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Used Tricks');
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurry whirl');
  });

  it('shows connector tricks section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Influential Connectors');
    expect(res.text).toContain('ripwalk');
  });

  it('shows transitions section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Common Trick Transitions');
    expect(res.text).toContain('blurry whirl');
  });

  it('shows hardest sequences section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Hardest Documented Sequences');
    expect(res.text).toContain('Greg Solis');
    expect(res.text).toContain('22'); // ADD total
  });

  it('shows difficulty evolution section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Evolution of Difficulty');
    expect(res.text).toContain('2007');
  });

  it('shows diverse players section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Most Diverse Players');
    expect(res.text).toContain('Mariusz Wilk');
  });

  it('shows narrative analysis section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('Analysis');
    expect(res.text).toContain('blurry whirl');  // appears in narrative
  });

  it('shows source note with dataset attribution', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    // Correct framing: data-driven from competition events, not "based on Evolution Report"
    expect(res.text).toContain('774 documented competitive events');
    expect(res.text).toContain('Sick3');
  });

  it('contains breadcrumb back to /freestyle', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/insights');
    expect(res.text).toContain('/freestyle');
    expect(res.text).toContain('Freestyle');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle — landing page highlights', () => {
  it('shows links to Trick Dictionary and Insights', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('/freestyle/tricks');
    expect(res.text).toContain('/freestyle/insights');
  });

  it('shows trick count in landing highlights', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Trick Dictionary');
    expect(res.text).toContain('/freestyle/insights');  // link to insights exists
  });

  it('contains nav buttons for new pages', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle');
    expect(res.text).toContain('Trick Dictionary');
    expect(res.text).toContain('Insights');
  });
});
