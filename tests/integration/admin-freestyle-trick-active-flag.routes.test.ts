/**
 * Admin freestyle trick editor: what a change to the active flag may not break.
 *
 * Once the content pipeline's own checks are gone, this save is the only place
 * these two mistakes can be caught. Making a trick active is refused while an
 * alias holds its slug, because the one word would then name two tricks. Making
 * a trick inactive is refused while another record needs it active, and the
 * refusal says what depends on it and where to resolve each kind.
 *
 * Only the change is judged. A row that stays in the state it is already in
 * remains editable, however many references it carries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMediaItem,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertFreestyleEvAdjudication,
  createTestSessionJwt,
} from '../fixtures/factories';
import type { FreestyleTrickOverrides } from '../fixtures/factories';

const { dbPath } = setTestEnv('4160');
const savesDir = process.env.CURATOR_SAVES_DIR!;

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000af01';
const MODIFIER = 'active_flag_modifier';
const WORKBENCH_HREF = '/admin/freestyle/emerging-vocabulary';

const admin = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

function seedTrick(slug: string, overrides: Partial<FreestyleTrickOverrides> = {}): void {
  insertFreestyleTrick(db, {
    slug,
    canonical_name: slug.replace(/_/g, ' '),
    adds: '2',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
    ...overrides,
  });
}

/** What the edit form submits for this row as rendered, with the Active box set as given. */
function bodyFor(slug: string, active: boolean, extra: Record<string, string> = {}): Record<string, string> {
  const r = db.prepare(
    `SELECT canonical_name, adds, notation, operational_notation, trick_family, base_trick,
            category, review_status FROM freestyle_tricks WHERE slug = ?`,
  ).get(slug) as Record<string, string | null>;
  return {
    canonicalName:     r.canonical_name ?? '',
    adds:              r.adds ?? '',
    movementNotation:  r.notation ?? '',
    executionNotation: r.operational_notation ?? '',
    family:            r.trick_family ?? '',
    baseTrick:         r.base_trick ?? '',
    category:          r.category ?? '',
    reviewStatus:      r.review_status ?? '',
    ...(active ? { isActive: 'on' } : {}),
    ...extra,
  };
}

async function save(slug: string, body: Record<string, string>) {
  return request(await createApp())
    .post(`/admin/freestyle/tricks/${slug}/edit`)
    .type('form').send(body).set('Cookie', admin());
}

async function removeAlias(trickSlug: string, aliasSlug: string) {
  return request(await createApp())
    .post(`/admin/freestyle/tricks/${trickSlug}/aliases/${aliasSlug}/delete`)
    .type('form').send({}).set('Cookie', admin());
}

function isActive(slug: string): number {
  return (db.prepare('SELECT is_active FROM freestyle_tricks WHERE slug = ?').get(slug) as { is_active: number }).is_active;
}

function auditCount(slug: string): number {
  return (db.prepare(
    `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'freestyle.trick.updated'`,
  ).get(slug) as { n: number }).n;
}

const saveFile = (slug: string) => path.join(savesDir, 'tricks', `${slug}.json`);

function expectNothingWritten(slug: string, activeBefore: number): void {
  expect(isActive(slug)).toBe(activeBefore);
  expect(auditCount(slug)).toBe(0);
  expect(fs.existsSync(saveFile(slug))).toBe(false);
}

function expectSaved(slug: string, activeAfter: number): void {
  expect(isActive(slug)).toBe(activeAfter);
  expect(auditCount(slug)).toBe(1);
  expect(fs.existsSync(saveFile(slug))).toBe(true);
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'active_flag_admin', display_name: 'Active Flag Admin', login_email: 'active-flag-admin@example.com', is_admin: 1 });
  insertFreestyleTrickModifier(db, { slug: MODIFIER });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('making a trick active while an alias holds its slug', () => {
  it('is refused, names the trick the alias belongs to, keeps what was typed and writes nothing', async () => {
    seedTrick('held_owner', { canonical_name: 'Owning Trick Name' });
    seedTrick('held_refused', { is_active: 0 });
    insertFreestyleTrickAlias(db, 'held_refused', 'held_owner');

    const res = await save('held_refused', bodyFor('held_refused', true, { description: 'Typed before the refusal' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('Owning Trick Name');
    expect(res.text).toContain('Typed before the refusal');
    expectNothingWritten('held_refused', 0);
  });

  it('succeeds once the alias is gone, resubmitting the same form', async () => {
    seedTrick('freed_owner');
    seedTrick('freed_trick', { is_active: 0 });
    insertFreestyleTrickAlias(db, 'freed_trick', 'freed_owner');
    const body = bodyFor('freed_trick', true);

    expect((await save('freed_trick', body)).status).toBe(422);
    expect((await removeAlias('freed_owner', 'freed_trick')).status).toBe(303);

    expect((await save('freed_trick', body)).status).toBe(303);
    expectSaved('freed_trick', 1);
  });

  it('succeeds when no alias holds the slug', async () => {
    seedTrick('open_slug', { is_active: 0 });

    expect((await save('open_slug', bodyFor('open_slug', true))).status).toBe(303);
    expectSaved('open_slug', 1);
  });

  it('leaves a trick that stays inactive editable, so a pending trick holding an alias slug can still be corrected', async () => {
    seedTrick('pending_owner');
    seedTrick('pending_alias_slug', { is_active: 0, review_status: 'pending' });
    insertFreestyleTrickAlias(db, 'pending_alias_slug', 'pending_owner');

    const res = await save('pending_alias_slug', bodyFor('pending_alias_slug', false, { description: 'Corrected text' }));

    expect(res.status).toBe(303);
    expectSaved('pending_alias_slug', 0);
  });

  it('leaves a trick that is already active editable, even if an alias holds its slug', async () => {
    seedTrick('live_owner');
    seedTrick('live_alias_slug');
    insertFreestyleTrickAlias(db, 'live_alias_slug', 'live_owner');

    const res = await save('live_alias_slug', bodyFor('live_alias_slug', true, { description: 'Edited while live' }));

    expect(res.status).toBe(303);
    expectSaved('live_alias_slug', 1);
  });
});

interface BlockingKind {
  name: string;
  seed: (slug: string) => void;
  count: (slug: string) => string;
  hrefs: (slug: string) => string[];
  /** The element a same-page link lands on, which must exist or the link is dead. */
  target?: string;
}

const BLOCKING_KINDS: BlockingKind[] = [
  {
    name: 'its aliases',
    seed: (s) => {
      insertFreestyleTrickAlias(db, `${s}_alias_one`, s);
      insertFreestyleTrickAlias(db, `${s}_alias_two`, s);
    },
    count: () => '2 aliases',
    hrefs: () => ['#trick-aliases'],
    target: 'id="trick-aliases"',
  },
  {
    name: 'its modifier links',
    seed: (s) => insertFreestyleTrickModifierLink(db, s, MODIFIER),
    count: () => '1 modifier link',
    hrefs: () => ['#trick-modifier-links'],
    target: 'id="trick-modifier-links"',
  },
  {
    name: 'media carrying its hashtag',
    seed: (s) => { insertMediaItem(db, { uploader_member_id: ADMIN_ID, tags: [`#${s}`] }); },
    count: (s) => `1 clip tagged #${s}`,
    hrefs: (s) => [`/media/browse?context=${s}`],
  },
  {
    // An inactive member counts: the family value names this row whether or not
    // the trick filed under it is published.
    name: 'other tricks filed under it as their family',
    seed: (s) => {
      seedTrick(`${s}_active_member`, { trick_family: s });
      seedTrick(`${s}_held_member`, { trick_family: s, is_active: 0 });
    },
    count: () => '2 tricks in this family',
    hrefs: (s) => [
      `/admin/freestyle/tricks/${s}_active_member/edit`,
      `/admin/freestyle/tricks/${s}_held_member/edit`,
    ],
  },
  {
    name: 'another active trick built on it as its base',
    seed: (s) => seedTrick(`${s}_built_on`, { base_trick: s }),
    count: () => '1 active trick using this as base',
    hrefs: (s) => [`/admin/freestyle/tricks/${s}_built_on/edit`],
  },
  {
    name: 'an open Emerging Vocabulary ruling linked to it',
    seed: (s) => { insertFreestyleEvAdjudication(db, { final_disposition: 'C', published_trick_slug: s }); },
    count: () => '1 open Emerging Vocabulary ruling',
    hrefs: () => [WORKBENCH_HREF],
  },
];

describe('making a trick inactive while another record needs it active', () => {
  it.each(BLOCKING_KINDS.map((k, i) => [k.name, k, `blocked_${i}`] as const))(
    'is refused for %s, with its count and a way to resolve it, and writes nothing',
    async (_name, kind, slug) => {
      seedTrick(slug);
      kind.seed(slug);

      const res = await save(slug, bodyFor(slug, false));

      expect(res.status).toBe(422);
      expect(res.text).toContain(kind.count(slug));
      for (const href of kind.hrefs(slug)) expect(res.text).toContain(`href="${href}"`);
      if (kind.target) expect(res.text).toContain(kind.target);

      // A kind with no references is left out, so the list never sends a curator
      // to resolve something that is not there.
      for (const other of BLOCKING_KINDS.filter((k) => k !== kind)) {
        for (const href of other.hrefs(slug)) expect(res.text).not.toContain(`href="${href}"`);
      }
      expectNothingWritten(slug, 1);
    },
  );

  it('lists every kind at once, so one refusal shows all that must be cleared', async () => {
    seedTrick('blocked_all');
    for (const kind of BLOCKING_KINDS) kind.seed('blocked_all');

    const res = await save('blocked_all', bodyFor('blocked_all', false));

    expect(res.status).toBe(422);
    for (const kind of BLOCKING_KINDS) expect(res.text).toContain(kind.count('blocked_all'));
    expectNothingWritten('blocked_all', 1);
  });

  it('succeeds once the blocking record is gone, resubmitting the same form', async () => {
    seedTrick('cleared_trick');
    insertFreestyleTrickAlias(db, 'cleared_alias', 'cleared_trick');
    const body = bodyFor('cleared_trick', false);

    expect((await save('cleared_trick', body)).status).toBe(422);
    expect((await removeAlias('cleared_trick', 'cleared_alias')).status).toBe(303);

    expect((await save('cleared_trick', body)).status).toBe(303);
    expectSaved('cleared_trick', 0);
  });

  it.each([
    ['a resolved ruling', {}, (s: string) => { insertFreestyleEvAdjudication(db, { final_disposition: 'A', published_trick_slug: s }); }],
    ['an inactive trick built on it', {}, (s: string) => seedTrick(`${s}_inactive_child`, { base_trick: s, is_active: 0 })],
    ['media an admin removed', {}, (s: string) => { insertMediaItem(db, { uploader_member_id: ADMIN_ID, tags: [`#${s}`], moderation_status: 'removed_by_admin' }); }],
    ['the trick naming itself as its family', { family: true }, () => undefined],
    ['the trick naming itself as its base', { base: true }, () => undefined],
  ] as const)('is not blocked by %s', async (name, self, seed) => {
    const slug = `retirable_${name.replace(/\W+/g, '_')}`;
    seedTrick(slug, {
      trick_family: 'family' in self ? slug : null,
      base_trick: 'base' in self ? slug : null,
    });
    seed(slug);

    const res = await save(slug, bodyFor(slug, false));

    expect(res.status).toBe(303);
    expectSaved(slug, 0);
  });

  it('leaves a trick that stays active editable, however much depends on it', async () => {
    seedTrick('staying_active');
    for (const kind of BLOCKING_KINDS) kind.seed('staying_active');

    const res = await save('staying_active', bodyFor('staying_active', true, { description: 'Edited while referenced' }));

    expect(res.status).toBe(303);
    expectSaved('staying_active', 1);
  });

  it('leaves a held candidate with an open ruling editable while it stays inactive', async () => {
    seedTrick('held_candidate', { is_active: 0, review_status: 'pending' });
    insertFreestyleEvAdjudication(db, { final_disposition: 'C', published_trick_slug: 'held_candidate' });

    const res = await save('held_candidate', bodyFor('held_candidate', false, { description: 'Edited while held' }));

    expect(res.status).toBe(303);
    expectSaved('held_candidate', 0);
  });
});
