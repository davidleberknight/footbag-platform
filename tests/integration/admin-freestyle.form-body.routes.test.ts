/**
 * Every freestyle curation form reads its body through its own schema: a field
 * posted twice is the form's own validation failure. The form comes back at 422
 * with the message beside the field it names, holding what the curator typed in
 * the other fields, and nothing is written.
 *
 * Each body here is otherwise one the form accepts, and the repeated field is one
 * the service takes blank, so a handler that read the body without its schema
 * would save instead of refusing.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickSource,
  insertFreestyleTrickModifier,
  insertFreestyleEvAdjudication,
  insertFreestyleRecord,
  insertConsecutiveKicksRecord,
  createTestSessionJwt,
} from '../fixtures/factories';
import { seedStagedFamilies, stagedFamily } from '../fixtures/stagedFamilies';
import { seedStagedSets, stagedSet } from '../fixtures/stagedSets';
import { STAGED_FAMILY_SUBLABELS } from '../../freestyle/inputs/curator_content/freestyleFamilies';

const { dbPath } = setTestEnv('4899');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000fb01';
const admin = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

// Four scoring brackets, so the publishable draft asserts ADD 4.
const NOTATION = 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]';

function familyForm(slug: string): Record<string, string> {
  const f = stagedFamily(slug);
  return {
    displayName:          f.displayName,
    parentSlug:           f.parentSlug ?? '',
    tier:                 f.tier,
    sortOrder:            String(f.sortOrder),
    hook:                 f.hook ?? '',
    description:          f.description ?? '',
    plainLanguageReading: f.plainLanguageReading ?? '',
    importance:           f.importance ?? '',
    howToRecognize:       f.howToRecognize.join('\n'),
    relatedFamilySlugs:   f.relatedFamilySlugs.join('\n'),
    sharedStructure:      f.sharedStructure ?? '',
    trickPageNote:        f.trickPageNote ?? '',
    foldedLabels:         [...STAGED_FAMILY_SUBLABELS].filter(([, fam]) => fam === slug).map(([l]) => l).sort().join('\n'),
  };
}

function setForm(slug: string): Record<string, string> {
  const s = stagedSet(slug);
  return {
    displayName: s.displayName,
    setGroup:    s.setGroup,
    formula:     s.formula,
    explanation: s.explanation,
    relatedSets: s.relatedSets.map((r) => (r.label ? `${r.slug} | ${r.label}` : r.slug)).join('\n'),
    ...(s.heldFromList ? { heldFromList: '1' } : {}),
  };
}

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

/** Every row a refused save could have touched, so "nothing written" is one comparison. */
function written(): Record<string, unknown> {
  return {
    audits:      count('SELECT COUNT(*) AS n FROM audit_entries'),
    tricks:      db.prepare('SELECT slug, updated_at, description, pronunciation FROM freestyle_tricks ORDER BY slug').all(),
    aliases:     db.prepare('SELECT alias_slug, alias_type, alias_display, provenance_note, display_reason FROM freestyle_trick_aliases ORDER BY alias_slug').all(),
    sourceLinks: count('SELECT COUNT(*) AS n FROM freestyle_trick_source_links'),
    modLinks:    count('SELECT COUNT(*) AS n FROM freestyle_trick_modifier_links'),
    sources:     count('SELECT COUNT(*) AS n FROM freestyle_trick_sources'),
    modifiers:   db.prepare('SELECT slug, notes, beginner_note FROM freestyle_trick_modifiers ORDER BY slug').all(),
    records:     db.prepare('SELECT id, notes, updated_at FROM freestyle_records ORDER BY id').all(),
    consecutive: db.prepare('SELECT id, note, updated_at FROM consecutive_kicks_records ORDER BY id').all(),
    rulings:     db.prepare('SELECT candidate_id, authored_notation, version FROM freestyle_ev_adjudications ORDER BY candidate_id').all(),
    families:    db.prepare('SELECT slug, hook, version FROM freestyle_families ORDER BY slug').all(),
    sets:        db.prepare('SELECT slug, formula, version FROM freestyle_sets ORDER BY slug').all(),
  };
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fb_admin', display_name: 'FB Admin', login_email: 'fb-admin@example.com', is_admin: 1 });
  seedStagedFamilies(db);
  seedStagedSets(db);

  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3', trick_family: 'whirl',
    category: 'dex', review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'fb_host', canonical_name: 'fb host', adds: '2', trick_family: 'whirl', base_trick: 'whirl',
    notation: 'CLIP > OP IN [DEX]', operational_notation: 'CLIP > OP CLIP [XBD] [DEL]',
    category: 'compound', review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'fb_alias', 'fb_host', 'fb alias');
  insertFreestyleTrickSource(db, { id: 'fb-src', source_type: 'curated', source_label: 'FB Source' });
  insertFreestyleTrickModifier(db, { slug: 'fb_mod', modifier_name: 'FB Mod', add_bonus: 1, modifier_type: 'body' });

  // The publication's base carries a family; the draft is authored and publishable.
  insertFreestyleTrick(db, {
    slug: 'fixture_base', canonical_name: 'fixture base', adds: '3',
    trick_family: 'fixture_anchor', category: 'compound', sort_order: 10,
  });
  const draft = {
    ev_state: 'parser', final_disposition: 'C', object_type: 'complete-trick',
    evidence_state: 'compositional-name-only', blocker_id: 'settled-modifier',
    owner: 'james', source: 'SG', confidence: 'high', proposed_formula: 'pixie(+1) + whirl(3) = 4',
  };
  insertFreestyleEvAdjudication(db, {
    ...draft, candidate_id: 'fb-author', submitted_name: 'FB Author', normalized_name: 'fbauthor',
  });
  insertFreestyleEvAdjudication(db, {
    ...draft, candidate_id: 'fb-publish', submitted_name: 'FB Publish', normalized_name: 'fbpublish',
    authored_notation: NOTATION, notation_evidence_basis: 'source-notation',
    notation_derivation_method: 'transcription', notation_provenance_note: 'From the source.',
    notation_authored_at: '2026-08-01T00:00:00.000Z', notation_authored_by: ADMIN_ID,
  });

  insertFreestyleRecord(db, { id: 'fb_rec' });
  insertConsecutiveKicksRecord(db, {
    id: 'fb_ck', sort_order: 101, section: 'Highest Official Scores', subsection: 'Singles 20K+',
    discipline: 'Open Singles', player_1: 'FB Player', score: 30000,
  });

  createApp = await importApp();
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());
afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const recordBody = {
  recordType: 'trick_consecutive', personId: '', displayName: 'FB Holder', trickName: 'kept trick name fb',
  sortName: '', addsCount: '', valueNumeric: '42', valueText: '', achievedDate: '2024-05-01',
  datePrecision: 'day', source: 'passback', confidence: 'verified', videoUrl: '', videoTimecode: '',
  notes: '', supersededBy: '',
};

const consecutiveBody = (sortOrder: string) => ({
  sortOrder, section: 'Highest Official Scores', subsection: 'Singles 20K+', discipline: 'Open Singles',
  year: '2020', rank: '1', player1: 'kept player fb', player2: '', score: '30000', note: '',
  eventDate: '2020-01-01', eventName: 'Test Event', location: 'Testville',
});

interface FormCase {
  name: string;
  path: string;
  /** A body the form accepts. */
  body: Record<string, string>;
  /** The field posted twice. */
  repeated: string;
  /** The element id of the repeated field's input, the anchor of its block. */
  inputId: string;
  /** A value typed into another field, which the refusal must keep; null where
   *  the form has nothing else typed. */
  kept: string | null;
}

const CASES: FormCase[] = [
  {
    name: 'notation authoring',
    path: '/admin/freestyle/notation-backlog/fb-author/author',
    body: {
      notation: NOTATION, evidenceBasis: 'source-notation', derivationMethod: 'transcription',
      conventionId: '', provenanceNote: 'kept provenance note fb',
    },
    repeated: 'conventionId', inputId: 'conventionId', kept: 'kept provenance note fb',
  },
  {
    name: 'trick publication',
    path: '/admin/freestyle/notation-backlog/fb-publish/publish',
    body: {
      canonicalName: 'fb published', adds: '4', baseTrick: 'fixture_base', category: 'compound',
      familyOverride: '', description: 'kept description fb publish', aliases: '', sourceId: 'fb-src',
      sourceUrl: 'https://example.org/fb', sourceAssertedNotation: 'clipper > in > out > clipper', modifierLinks: '',
    },
    repeated: 'familyOverride', inputId: 'familyOverride', kept: 'kept description fb publish',
  },
  {
    name: 'trick fields',
    path: '/admin/freestyle/tricks/fb_host/edit',
    body: {
      canonicalName: 'fb host', adds: '2', movementNotation: 'CLIP > OP IN [DEX]',
      executionNotation: 'CLIP > OP CLIP [XBD] [DEL]', family: 'whirl', baseTrick: 'whirl',
      category: 'compound', reviewStatus: 'curated', isActive: 'on', description: 'kept description fb trick',
      pronunciation: '',
    },
    repeated: 'pronunciation', inputId: 'trick-pronunciation', kept: 'kept description fb trick',
  },
  {
    name: 'add alias',
    path: '/admin/freestyle/tricks/fb_host/aliases',
    body: { aliasText: 'kept alias fb', aliasType: 'common', sourceId: '', provenanceNote: '' },
    repeated: 'provenanceNote', inputId: 'add-alias-provenance', kept: 'kept alias fb',
  },
  {
    name: 'edit alias',
    path: '/admin/freestyle/tricks/fb_host/aliases/fb_alias',
    body: { aliasType: 'common', aliasDisplay: 'on', divergenceReason: '', sourceId: '', provenanceNote: 'kept provenance fb' },
    repeated: 'divergenceReason', inputId: 'alias-fb_alias-reason', kept: 'kept provenance fb',
  },
  {
    name: 'attach source',
    path: '/admin/freestyle/tricks/fb_host/sources',
    body: { sourceId: 'fb-src', externalUrl: 'https://example.org/kept-fb', assertedAdds: '' },
    repeated: 'assertedAdds', inputId: 'attach-source-adds', kept: 'https://example.org/kept-fb',
  },
  {
    name: 'attach modifier',
    path: '/admin/freestyle/tricks/fb_host/modifiers',
    body: { modifierSlug: 'fb_mod', applyOrder: '' },
    repeated: 'applyOrder', inputId: 'attach-modifier-order', kept: null,
  },
  {
    name: 'record edit',
    path: '/admin/freestyle/records/fb_rec/edit',
    body: recordBody, repeated: 'notes', inputId: 'record-notes', kept: 'kept trick name fb',
  },
  {
    name: 'record create',
    path: '/admin/freestyle/records',
    body: recordBody, repeated: 'notes', inputId: 'record-notes', kept: 'kept trick name fb',
  },
  {
    name: 'consecutive-kicks edit',
    path: '/admin/freestyle/consecutive-records/fb_ck/edit',
    body: consecutiveBody('101'), repeated: 'note', inputId: 'consecutive-note', kept: 'kept player fb',
  },
  {
    name: 'consecutive-kicks create',
    path: '/admin/freestyle/consecutive-records',
    body: consecutiveBody('102'), repeated: 'note', inputId: 'consecutive-note', kept: 'kept player fb',
  },
  {
    name: 'source create',
    path: '/admin/freestyle/sources',
    body: {
      id: 'fb-new-src', sourceType: 'curated', sourceLabel: 'kept label fb',
      sourceUrl: '', retrievedAt: '2026-05-01T00:00:00.000Z', notes: '',
    },
    repeated: 'notes', inputId: 'source-notes', kept: 'kept label fb',
  },
  {
    name: 'modifier create',
    path: '/admin/freestyle/modifiers',
    body: { slug: 'fb_new_mod', modifierName: 'kept modifier fb', addBonus: '1', modifierType: 'body', notes: '', beginnerNote: '' },
    repeated: 'notes', inputId: 'modifier-notes', kept: 'kept modifier fb',
  },
  {
    name: 'modifier edit',
    path: '/admin/freestyle/modifiers/fb_mod/edit',
    body: { modifierName: 'FB Mod', addBonus: '1', modifierType: 'body', notes: '', beginnerNote: 'kept beginner note fb' },
    repeated: 'notes', inputId: 'modifier-notes', kept: 'kept beginner note fb',
  },
  {
    name: 'family edit',
    path: '/admin/freestyle/families/whirl/edit',
    body: { ...familyForm('whirl'), importance: 'kept importance fb' },
    repeated: 'hook', inputId: 'family-hook', kept: 'kept importance fb',
  },
  {
    name: 'set create',
    path: '/admin/freestyle/sets',
    body: {
      slug: 'zz_fb_set', displayName: 'kept set name fb', setGroup: 'true-core', formula: '',
      explanation: 'A test set created in the editor.', relatedSets: '',
    },
    repeated: 'formula', inputId: 'set-formula', kept: 'kept set name fb',
  },
  {
    name: 'set edit',
    path: '/admin/freestyle/sets/fairy/edit',
    body: { ...setForm('fairy'), explanation: 'kept explanation fb' },
    repeated: 'formula', inputId: 'set-formula', kept: 'kept explanation fb',
  },
];

describe('a freestyle curation form refuses a field posted twice', () => {
  // Defect caught: a repeated key reaches a handler that reads the first value,
  // the last, or a blank, and saves it; or the curator gets the form back with
  // no word of which field was wrong, or with what they typed thrown away.
  it.each(CASES.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const others = Object.entries(c.body).filter(([k]) => k !== c.repeated);
    const body = new URLSearchParams([...others, [c.repeated, 'first'], [c.repeated, 'second']]).toString();
    const before = written();

    const res = await request(await createApp()).post(c.path).set('Cookie', admin()).type('form').send(body);

    expect(res.status, res.text.slice(0, 600)).toBe(422);
    const at = res.text.indexOf(`id="${c.inputId}"`);
    expect(at, `the refused field ${c.repeated} is not on the re-rendered form`).toBeGreaterThan(-1);
    const block = res.text.slice(at, res.text.indexOf('</div>', at));
    expect(block, `no message beside ${c.repeated}`).toContain('class="form-field-error"');
    if (c.kept !== null) expect(res.text, 'the refusal threw away what was typed').toContain(c.kept);
    expect(written(), 'a refused form wrote something').toEqual(before);
  });
});
