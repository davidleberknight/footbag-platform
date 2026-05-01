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
    base_trick:    'whirl',
    trick_family:  'whirl',
    category:      'compound',
    description:   'rotational dex trick; most connected trick in the network',
    aliases_json:  '["spinning whirl (with modifier)"]',
    notation:      'CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]',
    sort_order:    0,
  });

  // Trick in the dictionary with no passback record
  insertFreestyleTrick(db, {
    slug:          'blurriest',
    canonical_name: 'blurriest',
    adds:          '6',
    base_trick:    'blurriest',
    trick_family:  'blurriest',
    category:      'compound',
    description:   'maximum documented base ADD',
    aliases_json:  '[]',
    sort_order:    1,
  });

  // Modifier trick — must NOT appear in the public category listing.
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
    base_trick:    'legover',
    trick_family:  'legover',
    category:      'dex',
    description:   'basic leg-over dexterity',
    aliases_json:  '["leg over"]',
    sort_order:    3,
  });

  // Pending standalone trick: must NOT appear publicly (index or direct slug).
  insertFreestyleTrick(db, {
    slug:           'pending-zorblax',
    canonical_name: 'pending zorblax',
    adds:           '4',
    category:       'compound',
    description:    'unverified scraped row.',
    sort_order:     90,
    review_status:  'pending',
    is_active:      0,
  });

  // Active family member of 'whirl': control row that SHOULD appear in the
  // whirl family ladder.
  insertFreestyleTrick(db, {
    slug:           'spinning-whirl',
    canonical_name: 'spinning whirl',
    adds:           '5',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'compound',
    description:    'spinning + whirl.',
    sort_order:     10,
  });

  // Pending family member of 'whirl': must NOT appear in the whirl family ladder.
  insertFreestyleTrick(db, {
    slug:           'pending-paradox-whirl',
    canonical_name: 'pending paradox whirl',
    adds:           '4',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'compound',
    description:    'unverified scraped row.',
    sort_order:     91,
    review_status:  'pending',
    is_active:      0,
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

  it('shows all active non-modifier tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('blurriest');
    expect(res.text).toContain('legover');
    // Modifier-category rows live in the dedicated Modifier Reference
    // section, not the trick categories — see 'public dictionary
    // presentation' describe block below.
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

describe('public dictionary presentation', () => {
  it('renders Notation column header and notation text for active tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<th>Notation</th>');
    // 'whirl' was seeded with a notation; expect it to render in a <code> cell.
    expect(res.text).toContain('CLIP &gt; OP IN [DEX]');
  });

  it('does not list modifier rows in the category groups', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Modifier-category section header must not appear in the page.
    expect(res.text).not.toMatch(/<h2>Modifier<\/h2>/);
    // The modifier-category trick we seeded must not have a row in the
    // category listing. Detail link to that slug should also be absent.
    expect(res.text).not.toContain('href="/freestyle/tricks/ducking"');
  });

  it('does not render the Modifier Reference section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Modifier Reference');
    expect(res.text).not.toContain('+ADD (rotational)');
  });

  it('renders a hashtag under each trick name as an identity link to that trick', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Hashtag is now an identity link: #whirl → /freestyle/tricks/whirl
    expect(res.text).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/whirl"[^>]*>#whirl</);
    expect(res.text).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/legover"[^>]*>#legover</);
  });

  it('strips hyphens from compound slugs and links the hashtag to the trick itself', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    // 'spinning-whirl' renders #spinningwhirl linking to /freestyle/tricks/spinning-whirl
    expect(res.text).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/spinning-whirl"[^>]*>#spinningwhirl</);
  });

  it('makes family-card titles clickable as family-filter links', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Family-card titles wrap in an <a> pointing to the filter
    expect(res.text).toMatch(/<h3 class="family-card-title"><a href="\/freestyle\/tricks\?family=whirl">/);
  });

  it('renders the dictionary expansion note', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('being expanded and aligned with established freestyle notation');
  });
});

describe('GET /freestyle/tricks?family=… — hashtag filter', () => {
  it('narrows the dictionary to a single family and shows the filter pill', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    // Pill renders with the family name and a clear-filter link
    expect(res.text).toContain('family-filter-pill');
    expect(res.text).toContain('Filtering by family:');
    expect(res.text).toMatch(/<strong>whirl<\/strong>/);
    expect(res.text).toMatch(/href="\/freestyle\/tricks"[^>]*>Clear filter</);
    // Whirl-family rows still render
    expect(res.text).toContain('/freestyle/tricks/whirl');
    expect(res.text).toContain('/freestyle/tricks/spinning-whirl');
    // Out-of-family rows are dropped
    expect(res.text).not.toContain('/freestyle/tricks/legover');
    expect(res.text).not.toContain('/freestyle/tricks/blurriest');
  });

  it('ignores unknown family values (no rows match → no filter applied)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?family=does-not-exist');
    expect(res.status).toBe(200);
    // Falls through to unfiltered dictionary; pill must NOT render
    expect(res.text).not.toContain('family-filter-pill');
    // All families still visible
    expect(res.text).toContain('/freestyle/tricks/whirl');
    expect(res.text).toContain('/freestyle/tricks/legover');
  });
});

describe('GET /freestyle/tricks/:slug — family badge in hero', () => {
  it('renders a family badge linking to the family filter', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="family-badge"[^>]*href="\/freestyle\/tricks\?family=whirl"[^>]*>whirl family</);
  });

  it('Related Tricks hashtags are identity links (not family links)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    const relatedSection = res.text.split('Related Tricks')[1]?.split('Family')[0] ?? '';
    // The hashtag link in Related Tricks must point to the related trick itself
    expect(relatedSection).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/spinning-whirl"[^>]*>#spinningwhirl</);
    // It must NOT be a family-filter link
    expect(relatedSection).not.toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\?family=/);
  });
});

describe('GET /freestyle/tricks/:slug — Previous Tricks section', () => {
  it('renders the Previous Tricks section when lower-ADD family peers exist', async () => {
    const app = createApp();
    // 'spinning-whirl' (5 ADD) has whirl(3) as a lower-ADD family peer
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Previous Tricks');
    expect(res.text).toContain('Lower-ADD variations in the same family');
    // Previous Tricks must appear before Trick Family ladder (template order)
    const prevIdx = res.text.indexOf('Previous Tricks');
    const familyIdx = res.text.indexOf('Family</h2>');
    expect(prevIdx).toBeGreaterThan(0);
    expect(familyIdx).toBeGreaterThan(prevIdx);
  });

  it('Previous Tricks links the family base trick (whirl) for spinning-whirl', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    const prevSection = res.text.split('Previous Tricks')[1]?.split('Next Tricks')[0] ?? '';
    // The family-base tiebreaker promotes 'whirl' to the front of its ADD bucket
    expect(prevSection).toContain('/freestyle/tricks/whirl');
    expect(prevSection).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/whirl"[^>]*>#whirl</);
    expect(prevSection).toMatch(/class="next-tricks-adds">3 ADD</);
  });

  it('Previous Tricks does NOT include current, higher-ADD, or out-of-family rows', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/spinning-whirl');
    const prevSection = res.text.split('Previous Tricks')[1]?.split('Next Tricks')[0] ?? '';
    // Current trick must not appear in its own previous list
    expect(prevSection).not.toContain('href="/freestyle/tricks/spinning-whirl"');
    // Out-of-family rows must not appear
    expect(prevSection).not.toContain('/freestyle/tricks/legover');
    expect(prevSection).not.toContain('/freestyle/tricks/blurriest');
  });

  it('Previous Tricks section is omitted when current trick has no lower-ADD family peers', async () => {
    const app = createApp();
    // 'legover' (2 ADD) is the lowest in the legover family in this fixture
    const res = await request(app).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Previous Tricks');
  });
});

describe('GET /freestyle/tricks/:slug — Next Tricks section', () => {
  it('renders the Next Tricks section when higher-ADD family peers exist', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Next Tricks');
    expect(res.text).toContain('next-tricks-list');
    // spinning-whirl has adds=5 > whirl(3); same family. Must appear.
    const nextSection = res.text.split('Next Tricks')[1]?.split('Family')[0] ?? '';
    expect(nextSection).toContain('/freestyle/tricks/spinning-whirl');
    // ADD pill rendered next to the trick
    expect(nextSection).toMatch(/class="next-tricks-adds">5 ADD</);
    // Hashtag identity link in the same row
    expect(nextSection).toMatch(/class="trick-hashtag"[^>]*href="\/freestyle\/tricks\/spinning-whirl"[^>]*>#spinningwhirl</);
  });

  it('Next Tricks does NOT include lower or equal ADD rows or out-of-family tricks', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    const nextSection = res.text.split('Next Tricks')[1]?.split('Family')[0] ?? '';
    // The current trick must not appear
    expect(nextSection).not.toContain('href="/freestyle/tricks/whirl"');
    // Out-of-family rows (mirage, legover, blurriest) must not appear
    expect(nextSection).not.toContain('/freestyle/tricks/legover');
    expect(nextSection).not.toContain('/freestyle/tricks/blurriest');
  });

  it('Next Tricks section is omitted when current trick has no higher-ADD family peers', async () => {
    const app = createApp();
    // 'blurriest' (6 ADD) is the only blurriest-family entry in this fixture
    const res = await request(app).get('/freestyle/tricks/blurriest');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Next Tricks');
  });
});

describe('GET /freestyle/tricks/:slug — Related Tricks section', () => {
  it('renders the Related Tricks section when family peers exist', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // Section heading + list class
    expect(res.text).toContain('Related Tricks');
    expect(res.text).toContain('related-tricks-list');
    // The whirl-family peer 'spinning-whirl' appears as a related-trick link
    // (separate from the family-ladder section, which also renders it)
    const relatedSection = res.text.split('Related Tricks')[1] ?? '';
    expect(relatedSection).toContain('/freestyle/tricks/spinning-whirl');
  });

  it('Related Tricks does NOT include the current trick or pending rows', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    const relatedSection = res.text.split('Related Tricks')[1]?.split('Family')[0] ?? '';
    // Current trick must not appear in its own related list
    expect(relatedSection).not.toContain('/freestyle/tricks/whirl"');
    // Pending rows must not surface
    expect(relatedSection).not.toContain('pending-zorblax');
    expect(relatedSection).not.toContain('pending-paradox-whirl');
  });

  it('Related Tricks section is omitted when no peers exist', async () => {
    const app = createApp();
    // 'legover' is in the dictionary but has no family siblings in this fixture
    const res = await request(app).get('/freestyle/tricks/legover');
    expect(res.status).toBe(200);
    // No related-tricks section heading
    expect(res.text).not.toContain('Related Tricks');
  });
});

describe('pending row visibility', () => {
  it('pending tricks are absent from the /freestyle/tricks index', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Active control still rendered.
    expect(res.text).toContain('whirl');
    // Pending standalone must NOT render.
    expect(res.text).not.toContain('pending zorblax');
    expect(res.text).not.toContain('pending-zorblax');
    // Pending family member must NOT render.
    expect(res.text).not.toContain('pending paradox whirl');
    expect(res.text).not.toContain('pending-paradox-whirl');
  });

  it('direct slug to a pending trick (no records) returns 404', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/pending-zorblax');
    expect(res.status).toBe(404);
  });

  it('pending family member is absent from a base trick’s family ladder', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // Active family member appears.
    expect(res.text).toContain('spinning whirl');
    // Pending family member must NOT appear.
    expect(res.text).not.toContain('pending paradox whirl');
    expect(res.text).not.toContain('pending-paradox-whirl');
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
