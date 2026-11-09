/**
 * Integration tests for the maintainer-only structural panel rendered on
 * GET /freestyle/tricks/:slug.
 *
 * The panel is computed on every read from the trick's base, its modifier links
 * and the modifier registry, so an edit to any of them shows at once and a new
 * trick has a panel from its first read. Asserted ADD remains editorial truth; a
 * composed value that differs from it is shown as a difference and never replaces
 * it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3115');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MAINTAINER_ID = 'aaaaaaaa-0000-0000-0000-000000000ngp';
const maintainerCookie = () =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId: MAINTAINER_ID, role: 'admin' })}`;

/** The panel is a maintainer surface, so every request here carries one. That it
 *  reaches nobody else is held in freestyle.trick-detail-diagnostics.routes.test.ts. */
function panelPage(slug: string) {
  return request(createApp()).get(`/freestyle/tricks/${slug}`).set('Cookie', maintainerCookie());
}

function save(path: string, body: Record<string, string>) {
  return request(createApp()).post(path).set('Cookie', maintainerCookie()).type('form').send(body);
}

/** Handlebars escapes `=`; a composed derivation reads more plainly without it. */
const unescaped = (html: string) => html.replace(/&#x3D;/g, '=');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MAINTAINER_ID, slug: 'ngp_maintainer', display_name: 'NGP Maintainer',
    login_email: 'ngp-maintainer@example.com', is_admin: 1,
  });

  // A trick that is its own base, with prose.
  insertFreestyleTrick(db, {
    slug: 'trick-self', canonical_name: 'trick self', adds: '5',
    base_trick: 'trick-self', trick_family: 'trick-self', description: 'Its own anchor.',
  });

  // No prose at all.
  insertFreestyleTrick(db, {
    slug: 'trick-no-description', canonical_name: 'trick no description', adds: '4',
    base_trick: 'trick-no-description', trick_family: 'trick-no-description', description: null,
  });

  // An auto-generated placeholder description, which the panel suppresses.
  insertFreestyleTrick(db, {
    slug: 'trick-placeholder', canonical_name: 'trick placeholder', adds: '4',
    base_trick: 'trick-placeholder', trick_family: 'trick-placeholder',
    description: 'Paradox-modified whirl.',
  });

  // Base and modifier resolve, and the composition deliberately differs from the
  // asserted ADD: 2 + 2 against an asserted 5.
  insertFreestyleTrick(db, {
    slug: 'trick-ed-base', canonical_name: 'trick ed base', adds: '2',
    base_trick: 'trick-ed-base', trick_family: 'trick-ed-base', description: 'base trick',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'trick-ed-mod', modifier_name: 'trick-ed-mod', add_bonus: 2, add_bonus_rotational: 2,
    modifier_type: 'set', notes: 'Uncertain: test fixture; flat value pending review',
  });
  insertFreestyleTrick(db, {
    slug: 'trick-ed-sumo', canonical_name: 'trick ed sumo', adds: '5',
    base_trick: 'trick-ed-base', trick_family: 'trick-ed-base', description: 'differing composition',
  });
  insertFreestyleTrickModifierLink(db, 'trick-ed-sumo', 'trick-ed-mod', 1);

  // A composition that matches the asserted ADD.
  insertFreestyleTrick(db, {
    slug: 'trick-ed-match', canonical_name: 'trick ed match', adds: '4',
    base_trick: 'trick-ed-base', trick_family: 'trick-ed-base', description: 'matching composition',
  });
  insertFreestyleTrickModifierLink(db, 'trick-ed-match', 'trick-ed-mod', 1);

  // A base naming a slug the dictionary does not hold.
  insertFreestyleTrick(db, {
    slug: 'trick-ed-broken', canonical_name: 'trick ed broken', adds: '4',
    base_trick: 'nonexistent-base', trick_family: 'trick-ed-broken', description: 'broken base',
  });

  // Rows the live-derivation cases edit, with one dependent each so neither case
  // can observe the other's edit.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl',
  });
  insertFreestyleTrick(db, {
    slug: 'live_fixed_base', canonical_name: 'live fixed base', adds: '2',
    base_trick: 'whirl', trick_family: 'whirl',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'live_mod', modifier_name: 'live mod', add_bonus: 1, add_bonus_rotational: 1,
    modifier_type: 'body',
  });
  insertFreestyleTrick(db, {
    slug: 'live_modifier_dependent', canonical_name: 'live modifier dependent', adds: '3',
    base_trick: 'live_fixed_base', trick_family: 'whirl',
  });
  insertFreestyleTrickModifierLink(db, 'live_modifier_dependent', 'live_mod', 1);
  insertFreestyleTrick(db, {
    slug: 'live_base', canonical_name: 'live base', adds: '2',
    base_trick: 'whirl', trick_family: 'whirl',
  });
  insertFreestyleTrick(db, {
    slug: 'live_base_dependent', canonical_name: 'live base dependent', adds: '2',
    base_trick: 'live_base', trick_family: 'whirl',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('structural panel — stays current without a rebuild', () => {
  // Defect caught: the panel keeps showing a modifier's old weight after a
  // curator changes it, which the modifier story says is live at once.
  it('shows a modifier\'s new ADD on the next read of a trick linking it', async () => {
    const before = unescaped((await panelPage('live_modifier_dependent')).text);
    expect(before).toContain('live_mod(+1) + live fixed base(2) = 3');

    const res = await save('/admin/freestyle/modifiers/live_mod/edit', {
      modifierName: 'live mod', addBonus: '2', modifierType: 'body', notes: '', confirm: '1',
    });
    expect(res.status).toBe(303);

    const after = unescaped((await panelPage('live_modifier_dependent')).text);
    expect(after).toContain('live_mod(+2) + live fixed base(2) = 4');
    expect(after).toContain('differs from asserted');
  });

  // Defect caught: an edit to one trick's ADD leaves every trick built on it
  // showing the old value, because only the edited row was refreshed.
  it('shows a base trick\'s new ADD on the next read of a trick built on it', async () => {
    const before = unescaped((await panelPage('live_base_dependent')).text);
    expect(before).toContain('live base(2) = 2');

    const res = await save('/admin/freestyle/tricks/live_base/edit', {
      canonicalName: 'live base', adds: '4', movementNotation: '',
      executionNotation: 'CLIP > OP CLIP no_brackets', family: 'whirl', baseTrick: 'whirl',
      category: 'compound', reviewStatus: 'curated', isActive: 'on',
    });
    expect(res.status).toBe(303);

    expect(unescaped((await panelPage('live_base_dependent')).text)).toContain('live base(4) = 4');
  });
});

describe('structural panel — asserted ADD and composition', () => {
  // Defect caught: a trick with nothing stored about it has no panel at all.
  it('renders for a trick that is its own base, showing the asserted ADD', async () => {
    const res = await panelPage('trick-self');
    expect(res.status).toBe(200);
    expect(res.text).toContain('notation-grammar-panel');
    expect(res.text).toMatch(/<dt>Asserted ADD<\/dt>\s*<dd>5<\/dd>/);
  });

  // Defect caught: a composed value that differs replaces or hides the asserted one.
  it('flags a differing composition and leaves the asserted ADD standing', async () => {
    const res = await panelPage('trick-ed-sumo');
    expect(res.text).toContain('data-source="editorial"');
    expect(res.text).toContain('trick ed base');
    expect(res.text).not.toMatch(/<code>trick-ed-base<\/code>/);
    expect(res.text).toContain('trick-ed-mod');
    expect(res.text).toContain('Uncertain');
    expect(res.text).toContain('differs from asserted');
    expect(res.text).toMatch(/<dt>Asserted ADD<\/dt>\s*<dd>5<\/dd>/);
  });

  // Defect caught: a composition that agrees reads as a difference.
  it('marks a composition that matches the asserted ADD', async () => {
    const res = await panelPage('trick-ed-match');
    expect(res.text).toContain('matches asserted');
    expect(res.text).not.toContain('differs from asserted');
  });

  // Defect caught: a base the dictionary lacks is shown as resolved, with invented math.
  it('reports a broken base link and composes nothing from it', async () => {
    const res = await panelPage('trick-ed-broken');
    expect(res.text).toContain('nonexistent-base');
    expect(res.text).toContain('broken upstream link');
    expect(res.text).toContain('modifier coverage absent');
    expect(res.text).not.toMatch(/<dt>Composed<\/dt>/);
  });

  // Defect caught: a trick that is its own base claims a decomposition into itself.
  it('omits the decomposition for a trick that is its own base', async () => {
    const res = await panelPage('trick-self');
    expect(res.text).not.toContain('data-source="editorial"');
  });
});

describe('structural panel — editorial context', () => {
  // Defect caught: the curator's description is lost from the panel.
  it('shows the description when the row has one', async () => {
    const res = await panelPage('trick-self');
    expect(res.text).toContain('class="notation-grammar-editorial-text"');
    expect(res.text).toContain('Its own anchor.');
  });

  // Defect caught: an empty context block renders for a row with no description,
  // while the panel beside it still draws.
  it('omits the block when the row has no description', async () => {
    const res = await panelPage('trick-no-description');
    expect(res.text).toContain('notation-grammar-panel');
    expect(res.text).not.toContain('class="notation-grammar-editorial"');
  });

  // Defect caught: an auto-generated placeholder resurfaces here after the About
  // block suppressed it.
  it('suppresses a structural placeholder description', async () => {
    const res = await panelPage('trick-placeholder');
    expect(res.text).toContain('notation-grammar-panel');
    expect(res.text).not.toContain('class="notation-grammar-editorial"');
  });
});
