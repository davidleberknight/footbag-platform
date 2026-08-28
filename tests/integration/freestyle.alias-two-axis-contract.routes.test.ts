/**
 * What an alias's class and its publication state each decide, proved on the
 * rendered page.
 *
 * An alias carries two independent judgements. The class says what kind of name
 * it is: a community nickname, a superseded name, an abbreviation, a structural
 * decomposition, a positional marker, a misspelling. The publication state says
 * whether readers see it beside the trick. The second defaults from the first,
 * and a curator may set them against each other where a trick genuinely needs
 * the exception.
 *
 * The two are not duplicates of one judgement, and the cases below that matter
 * most are the ones where they disagree on purpose: a real community nickname
 * held back because a reader could reconstruct it from the canonical name, and a
 * structural reading published because the page would be poorer without it.
 * Testing only the agreeing majority would pass equally well against a model
 * that collapsed the two, which is the model this pins the door shut on.
 *
 * Every assertion here reads rendered output. A test that asserted the stored
 * flag would pass while the page showed something else, which is exactly how a
 * fallback once defeated curation unnoticed for two months.
 *
 * Search is the other half of the contract: a name kept off the page still has
 * to find its trick, or hiding an alias would quietly cost a reader the only
 * search term they know.
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
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3098');

let createApp: Awaited<ReturnType<typeof importApp>>;

/** The trick every alias in this file hangs off. */
const HOST = 'whirl';

/** The public alternate-name slot, on the browse row and on the detail page. */
const ALSO_CALLED = 'Also called';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: HOST,
    canonical_name: 'whirl',
    adds: '3',
    base_trick: 'whirl',
    trick_family: 'whirl',
    category: 'dex',
    review_status: 'expert_reviewed',
    is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
  });

  // The agreeing majority: a nickname published, everything else held back.
  insertFreestyleTrickAlias(db, 'shownnickname', HOST, 'Shown Nickname',
    { alias_type: 'common', alias_display: 1 });
  insertFreestyleTrickAlias(db, 'hiddendecomposition', HOST, 'Hidden Decomposition',
    { alias_type: 'structural', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'hiddenabbreviation', HOST, 'Hidden Abbreviation',
    { alias_type: 'technical', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'hiddenoldname', HOST, 'Hidden Old Name',
    { alias_type: 'historical', alias_display: 0 });

  // The two deliberate exceptions, which are the point of the file.
  insertFreestyleTrickAlias(db, 'heldbacknickname', HOST, 'Held Back Nickname',
    { alias_type: 'common', alias_display: 0 });
  insertFreestyleTrickAlias(db, 'publisheddecomposition', HOST, 'Published Decomposition',
    { alias_type: 'structural', alias_display: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The browse listing, where a trick's alternate names sit beside its row. */
async function browseRow(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/tricks');
  expect(res.status).toBe(200);
  expect(res.text, 'the host trick must appear in the listing').toContain(HOST);
  expect(res.text, 'the alternate-name slot must render at all').toContain(ALSO_CALLED);
  return res.text;
}

/** The trick's own page, the other surface carrying the same slot. */
async function detailPage(): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${HOST}`);
  expect(res.status).toBe(200);
  return res.text;
}

describe('the publication state decides what a reader sees', () => {
  it('publishes a nickname a curator left at its default', async () => {
    expect(await browseRow()).toContain('Shown Nickname');
    expect(await detailPage()).toContain('Shown Nickname');
  });

  it('keeps a structural decomposition off the page', async () => {
    expect(await browseRow()).not.toContain('Hidden Decomposition');
    expect(await detailPage()).not.toContain('Hidden Decomposition');
  });

  it('keeps an abbreviation off the page', async () => {
    expect(await browseRow()).not.toContain('Hidden Abbreviation');
    expect(await detailPage()).not.toContain('Hidden Abbreviation');
  });
});

describe('a deliberate divergence between the two judgements is honoured', () => {
  it('holds back a community nickname the curator chose not to publish', async () => {
    // The case the collapsed model would break. Its class says nickname, and it
    // is a nickname; the curator's judgement is that a reader can reconstruct it
    // from the canonical name, and that judgement has nowhere else to live.
    expect(await browseRow()).not.toContain('Held Back Nickname');
    expect(await detailPage()).not.toContain('Held Back Nickname');
  });

  it('publishes a structural reading the curator chose to show', async () => {
    // The mirror case: a decomposition on the page on purpose, because the
    // trick's page is poorer without the reading that names it.
    expect(await browseRow()).toContain('Published Decomposition');
    expect(await detailPage()).toContain('Published Decomposition');
  });
});

/**
 * The alias a search result offers back as the name it matched on.
 *
 * Asserted on this fragment rather than on the page, because the results page
 * echoes the query into the search box: a hidden alias searched for by name is
 * always somewhere in the HTML, and only its appearance as a returned name says
 * anything about the contract.
 */
const offeredBack = (html: string): string[] =>
  [...html.matchAll(/also:\s*([^<]+)</g)].map(m => m[1].trim());

describe('a name kept off the page still finds its trick', () => {
  // Hiding an alias must not cost a reader the search term they know, so the
  // publication state gates display only. Asserted for the superseded class
  // because that is where the terminology ruling put every delay-form name.
  it('resolves a hidden superseded name through search without naming it back', async () => {
    const res = await request(await createApp()).get('/freestyle/search?q=Hidden Old Name');
    expect(res.status).toBe(200);
    expect(res.text, 'the hidden name must still find its trick').toContain(HOST);
    expect(offeredBack(res.text), 'a hidden name is never offered back as an alternate name')
      .not.toContain('Hidden Old Name');
  });

  it('resolves a held-back nickname the same way', async () => {
    const res = await request(await createApp()).get('/freestyle/search?q=Held Back Nickname');
    expect(res.status).toBe(200);
    expect(res.text).toContain(HOST);
    expect(offeredBack(res.text)).not.toContain('Held Back Nickname');
  });

  it('does offer back a published alias, so the check above can fail', async () => {
    // The control. Without it the two assertions above would pass against a
    // page that never offers any alias back, including a broken one.
    const res = await request(await createApp()).get('/freestyle/search?q=Shown Nickname');
    expect(res.status).toBe(200);
    expect(offeredBack(res.text)).toContain('Shown Nickname');
  });
});
