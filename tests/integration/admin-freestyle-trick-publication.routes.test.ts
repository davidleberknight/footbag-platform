/**
 * Creating a canonical trick from an authored draft, and what publication refuses.
 *
 * Publication is the step that turns a decided name and a written movement into a
 * row the dictionary shows. It carries forward what the draft already settled —
 * the movement, what the notation rests on, what was done to produce it — and
 * asks only for what a curator decides here: the canonical name, the difficulty,
 * the base, the category, and whatever aliases, source and modifiers the trick
 * truthfully has.
 *
 * Two properties are the point of this suite. Nothing is written unless every
 * check passes, because a trick that exists while its aliases were refused is a
 * worse outcome than a refusal. And publication resolves the ruling in the same
 * transaction, so the record of how the name was decided never lags behind the
 * dictionary that shows it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleEvAdjudication,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickSource,
  insertFreestyleTrickModifier,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4140');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID  = 'aaaaaaaa-0000-0000-0000-0000000pub01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000pub01';

// Four scoring brackets, so a publishable draft asserts ADD 4.
const NOTATION = 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]';
const SOURCE_ID = 'src-publication';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

async function post(path: string, form: Record<string, string>, cookie = admin()) {
  return request(await createApp()).post(path).set('Cookie', cookie).type('form').send(form);
}

function publishHref(candidateId: string): string {
  return `/admin/freestyle/notation-backlog/${candidateId}/publish`;
}

function validForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    canonicalName:          'published movement',
    adds:                   '4',
    baseTrick:              'fixture_base',
    category:               'compound',
    familyOverride:         '',
    description:            'The body passes under the bag and recovers on the same surface.',
    aliases:                '',
    sourceId:               SOURCE_ID,
    sourceUrl:              'https://example.org/catalogue/published-movement',
    sourceAssertedNotation: 'clipper > opposite in > opposite out > clipper',
    modifierLinks:          '',
    ...overrides,
  };
}

/** One draft ready to publish, with a fresh candidate id per test. */
function publishableDraft(candidateId: string, overrides: Record<string, unknown> = {}): string {
  return insertFreestyleEvAdjudication(db, {
    candidate_id: candidateId,
    submitted_name: `Draft ${candidateId}`,
    normalized_name: candidateId.replace(/[^a-z0-9]/g, ''),
    ev_state: 'parser',
    final_disposition: 'C',
    object_type: 'complete-trick',
    evidence_state: 'compositional-name-only',
    blocker_id: 'settled-modifier',
    owner: 'james',
    source: 'SG',
    confidence: 'high',
    proposed_formula: 'pixie(+1) + whirl(3) = 4',
    authored_notation: NOTATION,
    notation_evidence_basis: 'source-notation',
    notation_derivation_method: 'transcription',
    notation_provenance_note: 'Copied from the source in its own register.',
    notation_authored_at: '2026-08-01T00:00:00.000Z',
    notation_authored_by: ADMIN_ID,
    ...overrides,
  });
}

function trick(slug: string) {
  return db.prepare(
    `SELECT slug, canonical_name, adds, base_trick, trick_family, category, description,
            is_active, is_core, review_status, aliases_json, notation, operational_notation,
            operational_notation_source, notation_evidence_basis, notation_derivation_method,
            notation_convention_id, sort_order, structural_parse_json,
            trick_origin_producer
       FROM freestyle_tricks WHERE slug = ?`,
  ).get(slug) as Record<string, unknown> | undefined;
}

function ruling(candidateId: string) {
  return db.prepare(
    `SELECT ev_state, final_disposition, match_type, hold_kind, matched_existing_object,
            published_trick_slug, version
       FROM freestyle_ev_adjudications WHERE candidate_id = ?`,
  ).get(candidateId) as {
    ev_state: string; final_disposition: string; match_type: string; hold_kind: string;
    matched_existing_object: string; published_trick_slug: string | null; version: number;
  };
}

function publishAudits(slug: string) {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries
      WHERE entity_id = ? AND action_type = 'freestyle.trick.published'
      ORDER BY occurred_at ASC, rowid ASC`,
  ).all(slug) as { metadata_json: string }[];
}

function trickCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM freestyle_tricks').get() as { n: number }).n;
}

function aliasCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM freestyle_trick_aliases').get() as { n: number }).n;
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'publish_admin', display_name: 'Publish Admin',
    login_email: 'publish-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'publish_member', display_name: 'Publish Member',
    login_email: 'publish-member@example.com',
  });

  // The dictionary a publication lands in: a base carrying a family, a second
  // trick whose slug a publication may collide with, and one displayed alias.
  //
  // Every name here is invented for this suite and names no real trick or family.
  // What is under test is mechanical, so a fixture borrowing a real name would
  // read as a claim about where that trick belongs. The base's slug and the
  // base's family are deliberately different strings, because that is the only
  // shape in which the two candidate derivation rules give different answers.
  insertFreestyleTrick(db, {
    slug: 'fixture_base', canonical_name: 'fixture base', adds: '3',
    trick_family: 'fixture_anchor', category: 'compound', sort_order: 10,
  });
  insertFreestyleTrick(db, {
    slug: 'occupied_name', canonical_name: 'occupied name', adds: '2',
    trick_family: 'fixture_anchor', category: 'compound', sort_order: 11,
  });
  insertFreestyleTrickAlias(db, 'spoken_for', 'occupied_name', 'spoken for');

  insertFreestyleTrickSource(db, {
    id: SOURCE_ID, source_type: 'curated', source_label: 'Outside catalogue',
  });
  insertFreestyleTrickModifier(db, { slug: 'pixie', modifier_name: 'pixie', modifier_type: 'set' });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('the publication form', () => {
  it('is admin-only', async () => {
    const id = publishableDraft('pub-gate');
    expect((await get(publishHref(id))).status).toBe(302);
    expect((await get(publishHref(id), cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    expect((await get(publishHref(id), admin())).status).toBe(200);
  });

  it('404s for a ruling that does not exist', async () => {
    expect((await get(publishHref('pub-nothing'), admin())).status).toBe(404);
  });

  it('shows the movement and its provenance rather than asking for them again', async () => {
    const id = publishableDraft('pub-shows-draft');
    const res = await get(publishHref(id), admin());
    expect(res.text).toContain('CLIP &gt; OP IN [DEX]');
    expect(res.text).toContain('Copied from the source in its own register.');
    // The notation is displayed, never re-entered: the form carries no field for it.
    expect(res.text).not.toContain('name="notation"');
    expect(res.text).toContain('name="canonicalName"');
  });

  it('states the refusal and offers no form when the ruling cannot be published', async () => {
    const id = publishableDraft('pub-held', { blocker_id: 'Q14' });
    const res = await get(publishHref(id), admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Q14');
    expect(res.text).not.toContain('name="canonicalName"');
  });
});

describe('rulings publication refuses', () => {
  it('refuses a ruling with no authored movement', async () => {
    const id = publishableDraft('pub-no-notation', {
      authored_notation: null, notation_evidence_basis: null,
      notation_derivation_method: null, notation_provenance_note: null,
      notation_authored_at: null, notation_authored_by: null,
    });
    const res = await post(publishHref(id), validForm());
    expect(res.status).toBe(422);
    expect(res.text).toContain('Author the movement notation before publishing');
  });

  it('refuses a ruling about something that is not a trick', async () => {
    const id = publishableDraft('pub-operator', { object_type: 'set-operator' });
    const res = await post(publishHref(id), validForm());
    expect(res.status).toBe(422);
    expect(res.text).toContain('not a trick');
  });

  it('refuses a name held on an identity question', async () => {
    const id = publishableDraft('pub-doctrine', { ev_state: 'doctrine' });
    const res = await post(publishHref(id), validForm());
    expect(res.status).toBe(422);
    expect(res.text).toContain('held on an identity question');
  });

  it('refuses a name held on an open doctrine question', async () => {
    const id = publishableDraft('pub-open-q', { blocker_id: 'Q7' });
    const res = await post(publishHref(id), validForm());
    expect(res.status).toBe(422);
    expect(res.text).toContain('settle the question by action rather than by ruling');
  });

  it('refuses a name whose source has not been recovered', async () => {
    const id = publishableDraft('pub-source-recovery', { blocker_id: 'source-recovery' });
    const res = await post(publishHref(id), validForm());
    expect(res.status).toBe(422);
    expect(res.text).toContain('its attestation is not established');
  });

  it('refuses a ruling that is already resolved', async () => {
    const id = publishableDraft('pub-resolved', { final_disposition: 'A' });
    const res = await post(publishHref(id), validForm());
    expect(res.status).toBe(422);
    expect(res.text).toContain('already resolved');
  });

  it('is admin-only, and a member cannot publish', async () => {
    const id = publishableDraft('pub-post-gate');
    const before = trickCount();
    expect((await post(publishHref(id), validForm(), cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    expect(trickCount()).toBe(before);
  });

  it('404s for a ruling that does not exist', async () => {
    expect((await post(publishHref('pub-absent'), validForm())).status).toBe(404);
  });
});

describe('what the form refuses', () => {
  it('refuses a difficulty that disagrees with the notation', async () => {
    const id = publishableDraft('pub-add-mismatch');
    const res = await post(publishHref(id), validForm({ adds: '3' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('4 scoring brackets but ADD is 3');
  });

  it('refuses a difficulty that is not a whole number', async () => {
    const id = publishableDraft('pub-add-text');
    const res = await post(publishHref(id), validForm({ adds: 'four' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('ADD must be a whole number');
  });

  it('refuses a name whose slug is already a trick', async () => {
    const id = publishableDraft('pub-slug-taken');
    const res = await post(publishHref(id), validForm({ canonicalName: 'occupied name' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already a trick in the dictionary');
  });

  it('refuses a name whose slug is already an alias of another trick', async () => {
    const id = publishableDraft('pub-alias-taken');
    const res = await post(publishHref(id), validForm({ canonicalName: 'spoken for' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already an alias of another trick');
  });

  it('refuses a display name written as a slug', async () => {
    const id = publishableDraft('pub-underscore-name');
    const res = await post(publishHref(id), validForm({ canonicalName: 'published_movement' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Display name carries an underscore');
  });

  it('refuses a base that is not in the dictionary', async () => {
    const id = publishableDraft('pub-no-base');
    const res = await post(publishHref(id), validForm({ baseTrick: 'not_a_trick' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('is not a trick in the dictionary');
  });

  it('refuses a category the dictionary does not use', async () => {
    const id = publishableDraft('pub-bad-category');
    const res = await post(publishHref(id), validForm({ category: 'invented' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a category the dictionary already uses');
  });

  it('refuses a family override naming a family nothing belongs to', async () => {
    const id = publishableDraft('pub-bad-family');
    const res = await post(publishHref(id), validForm({ familyOverride: 'nobodys_family' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('No trick carries the family');
  });

  it('refuses an alias that collides with a canonical slug', async () => {
    const id = publishableDraft('pub-alias-collides');
    const res = await post(publishHref(id), validForm({ aliases: 'occupied name' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already a canonical trick slug');
  });

  it('refuses an alias that repeats the trick\'s own name', async () => {
    const id = publishableDraft('pub-alias-self');
    const res = await post(publishHref(id), validForm({ aliases: 'published movement' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('is the trick&#x27;s own name');
  });

  it('refuses a notation resting on a source with no source linked', async () => {
    const id = publishableDraft('pub-no-source');
    const res = await post(publishHref(id), validForm({ sourceId: '', sourceAssertedNotation: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('must link to the source it rests on');
  });

  it('refuses a source-notation basis with no record of what the source wrote', async () => {
    const id = publishableDraft('pub-no-asserted');
    const res = await post(publishHref(id), validForm({ sourceAssertedNotation: '' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('record what that source wrote');
  });

  it('accepts no source when the notation rests on footage rather than a source', async () => {
    const id = publishableDraft('pub-footage', {
      notation_evidence_basis: 'footage', notation_derivation_method: 'reconstruction',
    });
    const res = await post(publishHref(id), validForm({
      canonicalName: 'footage movement', sourceId: '', sourceUrl: '', sourceAssertedNotation: '',
    }));
    expect(res.status).toBe(303);
    expect(trick('footage_movement')).toBeDefined();
  });

  it('refuses a modifier that is not registered', async () => {
    const id = publishableDraft('pub-bad-modifier');
    const res = await post(publishHref(id), validForm({ modifierLinks: 'not_a_modifier' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('is not a registered modifier');
  });

  it('writes nothing at all when one field fails', async () => {
    const id = publishableDraft('pub-atomic');
    const tricksBefore  = trickCount();
    const aliasesBefore = aliasCount();
    const res = await post(publishHref(id), validForm({
      canonicalName: 'atomic attempt', aliases: 'occupied name', modifierLinks: 'pixie',
    }));
    expect(res.status).toBe(422);
    expect(trickCount()).toBe(tricksBefore);
    expect(aliasCount()).toBe(aliasesBefore);
    expect(trick('atomic_attempt')).toBeUndefined();
    expect(ruling(id).published_trick_slug).toBeNull();
  });
});

describe('a published trick', () => {
  it('lands active and curated, carrying the draft it came from', async () => {
    const id = publishableDraft('pub-happy');
    const res = await post(publishHref(id), validForm({ canonicalName: 'happy movement' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/happy_movement/edit');

    const row = trick('happy_movement')!;
    expect(row.canonical_name).toBe('happy movement');
    expect(row.adds).toBe('4');
    expect(row.is_active).toBe(1);
    expect(row.review_status).toBe('curated');
    expect(row.is_core).toBe(0);
    expect(row.aliases_json).toBe('[]');
    // The execution notation is the authored movement; the semantic Jobs notation
    // is a separate claim this form does not make.
    expect(row.operational_notation).toBe(NOTATION);
    expect(row.notation).toBeNull();
    // A parse is derived by the content pipeline, never by publication.
    expect(row.structural_parse_json).toBeNull();
    // The row belongs to the curator who made it. No committed producer owns it,
    // so a rebuild reading committed files has nothing it may retire here.
    expect(row.trick_origin_producer).toBe('curator-publication');
  });

  it('carries the notation provenance as both structured fields and a citation line', async () => {
    const id = publishableDraft('pub-provenance');
    await post(publishHref(id), validForm({ canonicalName: 'provenance movement' }));

    const row = trick('provenance_movement')!;
    expect(row.notation_evidence_basis).toBe('source-notation');
    expect(row.notation_derivation_method).toBe('transcription');
    expect(row.notation_convention_id).toBeNull();
    expect(row.operational_notation_source).toContain('Copied from the source in its own register.');
  });

  it('never writes a citation for a notation that rests on no source', async () => {
    // The citation line is composed from the draft's own claims and from nothing
    // else. Footage, testimony and the platform's own structure rest on no
    // registered source, and the line must not read as though one was consulted:
    // a fabricated citation is worse than no citation, because it survives into
    // the record as an attestation nobody made.
    const cases: [string, string, string, string][] = [
      ['footage',            'reconstruction',       'watched footage movement',   'Read off a record video.'],
      ['testimony',          'register-translation', 'relayed account movement',   'Relayed from a player account.'],
      ['platform-structure', 'reconstruction',       'structural movement',        'Follows from how the parts compose.'],
    ];

    for (const [basis, method, name, note] of cases) {
      const id = publishableDraft(`pub-sourceless-${basis}`, {
        notation_evidence_basis: basis,
        notation_derivation_method: method,
        notation_provenance_note: note,
      });
      const res = await post(publishHref(id), validForm({
        canonicalName: name, sourceId: '', sourceUrl: '', sourceAssertedNotation: '',
      }));
      expect(res.status).toBe(303);

      const slug = name.replace(/ /g, '_');
      const citation = trick(slug)!.operational_notation_source as string;
      expect(citation).toContain(note);
      // Nothing about a source it never had.
      expect(citation).not.toContain('Outside catalogue');
      expect(citation).not.toContain(SOURCE_ID);
      expect(citation).not.toContain('http');
      expect(citation).not.toMatch(/source|cited|catalogue/i);
      // And no source row was attached either.
      expect(db.prepare('SELECT COUNT(*) AS n FROM freestyle_trick_source_links WHERE trick_slug = ?')
        .get(slug)).toEqual({ n: 0 });
    }
  });

  it('records the convention a derived notation was made under', async () => {
    const id = publishableDraft('pub-convention', {
      notation_evidence_basis: 'platform-structure',
      notation_derivation_method: 'convention-derivation',
      notation_convention_id: 'swirl-chain-terminal-replacement',
    });
    await post(publishHref(id), validForm({
      canonicalName: 'convention movement', sourceId: '', sourceUrl: '', sourceAssertedNotation: '',
    }));

    const row = trick('convention_movement')!;
    expect(row.notation_convention_id).toBe('swirl-chain-terminal-replacement');
    expect(row.operational_notation_source).toContain('swirl');
  });

  it('takes its family from the base\'s own slug, not from the family the base sits in', async () => {
    // The fixture base's slug and its family are different strings, so the two
    // candidate rules give different answers and the test can tell them apart.
    // The rule the rest of the dictionary was built with makes the base itself
    // the family; inheriting the base's family instead would put the new trick
    // straight into its grandparent's family, and publication would then classify
    // a row by a different rule from its neighbours.
    const id = publishableDraft('pub-family');
    await post(publishHref(id), validForm({ canonicalName: 'family movement' }));
    expect(trick('family_movement')!.base_trick).toBe('fixture_base');
    expect(trick('family_movement')!.trick_family).toBe('fixture_base');
    // Not the family the base itself sits in.
    expect(trick('family_movement')!.trick_family).not.toBe('fixture_anchor');
  });

  it('takes the curator\'s family override over the derived default', async () => {
    // The mechanism only: an override the curator supplies replaces whatever the
    // base would have produced. The target is an unrelated family that exists in
    // the fixture, because what is under test is that the override wins, not that
    // any particular trick belongs anywhere.
    insertFreestyleTrick(db, {
      slug: 'fixture_other_root', canonical_name: 'fixture other root',
      trick_family: 'fixture_alt_family', category: 'compound', sort_order: 12,
    });
    const id = publishableDraft('pub-family-override');
    await post(publishHref(id), validForm({
      canonicalName: 'override movement', familyOverride: 'fixture_alt_family',
    }));
    // The default this replaced is the base's slug, not the base's family.
    expect(trick('override_movement')!.base_trick).toBe('fixture_base');
    expect(trick('override_movement')!.trick_family).toBe('fixture_alt_family');
  });

  it('sorts after everything already in the dictionary', async () => {
    const highest = (db.prepare('SELECT MAX(sort_order) AS m FROM freestyle_tricks')
      .get() as { m: number }).m;
    const id = publishableDraft('pub-sort');
    await post(publishHref(id), validForm({ canonicalName: 'sorted movement' }));
    expect(trick('sorted_movement')!.sort_order).toBe(highest + 1);
  });

  it('attaches the aliases, the source link and the modifiers it was given', async () => {
    const id = publishableDraft('pub-attachments');
    await post(publishHref(id), validForm({
      canonicalName: 'attached movement',
      aliases: 'attached nickname|second nickname',
      modifierLinks: 'pixie',
    }));

    const aliases = db.prepare(
      `SELECT alias_slug, alias_text, alias_type, alias_display
         FROM freestyle_trick_aliases WHERE trick_slug = ? ORDER BY alias_slug`,
    ).all('attached_movement') as { alias_slug: string; alias_text: string; alias_type: string; alias_display: number }[];
    expect(aliases.map((a) => a.alias_slug)).toEqual(['attached_nickname', 'second_nickname']);
    expect(aliases[0]!.alias_type).toBe('common');
    expect(aliases[0]!.alias_display).toBe(1);

    const link = db.prepare(
      `SELECT source_id, external_url, asserted_notation
         FROM freestyle_trick_source_links WHERE trick_slug = ?`,
    ).get('attached_movement') as { source_id: string; external_url: string; asserted_notation: string };
    expect(link.source_id).toBe(SOURCE_ID);
    expect(link.external_url).toBe('https://example.org/catalogue/published-movement');
    expect(link.asserted_notation).toBe('clipper > opposite in > opposite out > clipper');

    const modifiers = db.prepare(
      `SELECT modifier_slug, apply_order FROM freestyle_trick_modifier_links
         WHERE trick_slug = ? ORDER BY apply_order`,
    ).all('attached_movement') as { modifier_slug: string; apply_order: number }[];
    expect(modifiers).toEqual([{ modifier_slug: 'pixie', apply_order: 1 }]);
  });
});

describe('the ruling behind a published trick', () => {
  it('is resolved to the new trick in the same act', async () => {
    const id = publishableDraft('pub-resolves');
    const before = ruling(id).version;
    await post(publishHref(id), validForm({ canonicalName: 'resolving movement' }));

    const after = ruling(id);
    expect(after.published_trick_slug).toBe('resolving_movement');
    expect(after.matched_existing_object).toBe('resolving_movement');
    expect(after.ev_state).toBe('canonical');
    expect(after.final_disposition).toBe('A');
    expect(after.match_type).toBe('promoted-canonical');
    expect(after.version).toBe(before + 1);
  });

  it('is resolved even when the curator publishes under a different spelling', async () => {
    // The ruling was filed under the corpus spelling; the curator publishes the
    // display name the dictionary will carry. Matching by name alone would resolve
    // nothing, so the funnel names the ruling it is publishing.
    const id = publishableDraft('pub-renamed', { normalized_name: 'anentirelyotherspelling' });
    await post(publishHref(id), validForm({ canonicalName: 'renamed movement' }));
    expect(ruling(id).published_trick_slug).toBe('renamed_movement');
  });

  it('cannot be published a second time', async () => {
    const id = publishableDraft('pub-twice');
    expect((await post(publishHref(id), validForm({ canonicalName: 'once only' }))).status).toBe(303);
    const res = await post(publishHref(id), validForm({ canonicalName: 'once only again' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already resolved');
    expect(trick('once_only_again')).toBeUndefined();
  });

  it('writes one audit entry naming the ruling and what was decided', async () => {
    const id = publishableDraft('pub-audited');
    await post(publishHref(id), validForm({
      canonicalName: 'audited movement', aliases: 'audited nickname', modifierLinks: 'pixie',
    }));

    const rows = publishAudits('audited_movement');
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(rows[0]!.metadata_json) as Record<string, unknown>;
    expect(meta.candidateId).toBe(id);
    expect(meta.canonicalName).toBe('audited movement');
    expect(meta.adds).toBe('4');
    expect(meta.baseTrick).toBe('fixture_base');
    expect(meta.family).toBe('fixture_base');
    expect(meta.familyOverridden).toBe(false);
    expect(meta.aliasSlugs).toEqual(['audited_nickname']);
    expect(meta.sourceId).toBe(SOURCE_ID);
    expect(meta.modifierSlugs).toEqual(['pixie']);
    expect(meta.notationEvidenceBasis).toBe('source-notation');
    expect(meta.resolvedAdjudication).toBe(id);
  });

  it('refuses to publish under a slug the ruling is already recorded against', async () => {
    const id = publishableDraft('pub-contradiction', {
      published_trick_slug: 'occupied_name',
    });
    const res = await post(publishHref(id), validForm({ canonicalName: 'contradicting movement' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already ruled to be a different trick');
    expect(trick('contradicting_movement')).toBeUndefined();
  });
});

describe('the drafts list', () => {
  it('offers publication for a publishable draft and withholds it otherwise', async () => {
    publishableDraft('pub-listed');
    publishableDraft('pub-listed-held', { blocker_id: 'Q9' });
    const res = await get('/admin/freestyle/notation-drafts', admin());
    expect(res.text).toContain(publishHref('pub-listed'));
    expect(res.text).not.toContain(publishHref('pub-listed-held'));
  });
});
