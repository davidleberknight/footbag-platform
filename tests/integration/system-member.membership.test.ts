/**
 * The system member is a member without ever onboarding. It owns the curated
 * content and appears once as a person, so every surface that reads members
 * must find it, although it holds no onboarding task rows. An ordinary account
 * with no task rows is a prospective member and must stay unseen beside it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertHistoricalPerson, insertMemberGallery } from '../fixtures/factories';

const { dbPath } = setTestEnv('3248');

const SYSTEM_ID = 'sysmem-system';
const PROSPECT_ID = 'sysmem-prospect';
const SYSTEM_HP = 'sysmem-hp-system';
const PROSPECT_HP = 'sysmem-hp-prospect';

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let onboarding: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertHistoricalPerson(db, { person_id: SYSTEM_HP, person_name: 'Footbag Hacky' });
  insertHistoricalPerson(db, { person_id: PROSPECT_HP, person_name: 'Pro Spect' });
  // Neither account has onboarding task rows: the system member because it
  // never onboards, the other because it has not started.
  insertMember(db, {
    id: SYSTEM_ID, slug: 'sysmem_hacky', is_system: 1, onboarding: 'none',
    real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  insertMember(db, {
    id: PROSPECT_ID, slug: 'sysmem_prospect', onboarding: 'none',
    login_email: 'sysmem-prospect@example.com',
  });
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(SYSTEM_HP, SYSTEM_ID);
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(PROSPECT_HP, PROSPECT_ID);
  insertMemberGallery(db, { owner_member_id: SYSTEM_ID, name: 'Curated Moves', is_default: 0 });
  insertMemberGallery(db, {
    owner_member_id: PROSPECT_ID, name: 'Prospect Moves', is_default: 0, created_by: PROSPECT_ID,
  });
  dbMod = await import('../../src/db/db');
  onboarding = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('the system member reads as a member', () => {
  it('is in the member view, and an ordinary account with no task rows is not', () => {
    // Defect caught: every join on the member view drops the system member,
    // so its event result and history record lose the link to its profile.
    const ids = (db.prepare('SELECT id FROM members_onboarded WHERE id IN (?, ?)')
      .all(SYSTEM_ID, PROSPECT_ID) as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual([SYSTEM_ID]);
  });

  it('passes the membership predicate, and the prospective member does not', () => {
    // Defect caught: the system member's admin record and profile answer as
    // for an unknown account, because the predicate looks only at task rows.
    expect(onboarding.isOnboardingComplete(SYSTEM_ID)).toBe(true);
    expect(onboarding.isOnboardingComplete(PROSPECT_ID)).toBe(false);
  });

  it('resolves as the linked member of its historical record', () => {
    // Defect caught: the system member's one appearance as a person no longer
    // links to its profile.
    const linked = (id: string) =>
      (dbMod.publicPlayers.findLinkedMemberSlug.get(id) as { slug: string } | undefined)?.slug ?? null;
    expect(linked(SYSTEM_HP)).toBe('sysmem_hacky');
    expect(linked(PROSPECT_HP)).toBeNull();
  });

  it("lists the system member's named gallery on the media hub, and not the prospective member's", () => {
    // Defect caught: the curated galleries vanish from the public media hub.
    const names = (dbMod.media.listAllNamedGalleries.all() as { name: string }[]).map((g) => g.name);
    expect(names).toContain('Curated Moves');
    expect(names).not.toContain('Prospect Moves');
  });
});
