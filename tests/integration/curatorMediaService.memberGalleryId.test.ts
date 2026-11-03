/**
 * A member gallery's permanent address, `gallery_<owner_slug>_<name_slug>`.
 *
 * The id is the gallery's bookmark and never changes after creation, so every
 * rule about how a name becomes an id is checked at the one place an id is made:
 * the service's gallery create. The name folds by the site's one slug rule, is
 * cut to 60 characters without leaving a trailing underscore, and takes `_2`,
 * `_3` and so on when the id is taken. A name holding letters with no a to z
 * form, or made of symbols only, makes no address and is refused.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant } from '../fixtures/factories';
import { ValidationError } from '../../src/services/serviceErrors';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';

const { dbPath } = setTestEnv('3078');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcModule: typeof import('../../src/services/curatorMediaService');

const OWNER_ID = 'member-gallery-id-owner';
const OWNER_SLUG = 'gid_owner';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG });
  // A created gallery is stamped by the platform's system member.
  insertMember(db, { id: 'member-gallery-id-system', slug: 'gid_system', is_system: 1 });
  insertMemberTierGrant(db, { member_id: OWNER_ID, new_tier_status: 'tier1' });
  db.close();
  svcModule = await import('../../src/services/curatorMediaService');
});

afterAll(() => cleanupTestDb(dbPath));

function noopStorage(): MediaStorageAdapter {
  return {
    async put() {},
    async get() { throw new Error('not used'); },
    async delete() {},
    constructURL(key) { return `/stub/${key}`; },
    async exists() { return false; },
    async headSize() { return null; },
    async generatePresignedPutUrl() { return '/stub-presigned'; },
    async generatePresignedGetUrl() { return '/stub-presigned'; },
  };
}

function noopImageProcessor(): ImageProcessingAdapter {
  return {
    async processAvatar() { throw new Error('not used'); },
    async processPhoto() { throw new Error('not used'); },
  };
}

function create(name: string): Promise<{ id: string; repeat?: boolean }> {
  const svc = svcModule.createCuratorMediaService({
    storage: noopStorage(),
    imageProcessor: noopImageProcessor(),
  });
  return svc.createGallery({
    actorMemberId: OWNER_ID,
    actorIsAdmin: false,
    ownerMemberId: OWNER_ID,
    ownerSlug: OWNER_SLUG,
    updates: { name, description: '', sortOrder: 'upload_desc', criteriaTags: ['#gid_case'], excludeTags: [] },
  });
}

function galleryNamesForOwner(): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare('SELECT name FROM member_galleries WHERE owner_member_id = ?').all(OWNER_ID) as
      Array<{ name: string }>).map((r) => r.name);
  } finally {
    db.close();
  }
}

describe('member gallery id', () => {
  // Defect caught: a gallery's bookmark address is not the owner slug plus the
  // folded name, so the address shown before saving is not the one saved.
  it('is gallery_, the owner slug and the folded name', async () => {
    const { id } = await create('Worlds 2026');
    expect(id).toBe(`gallery_${OWNER_SLUG}_worlds_2026`);
  });

  // Defect caught: a long name cut at 60 characters leaves the id ending in an
  // underscore, an address the slug rule never makes.
  it('trims an underscore the 60-character cut leaves at the end', async () => {
    const name = `${'a'.repeat(59)} tail`;
    const { id } = await create(name);
    expect(id).toBe(`gallery_${OWNER_SLUG}_${'a'.repeat(59)}`);
  });

  // Defect caught: letters with no a to z form are silently dropped from the
  // address, or replaced by a random token, instead of the name being refused.
  it('refuses a name with letters that have no a to z form, and saves nothing', async () => {
    const name = 'Worlds 東京';
    const err = await create(name).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors?.name).toBe(svcModule.GALLERY_NAME_NO_ADDRESS_MESSAGE);
    expect(galleryNamesForOwner()).not.toContain(name);
  });

  // Defect caught: a name of symbols only, which folds to nothing, is saved
  // under an address the slug rule did not make from its name.
  it('refuses a name of symbols only, and saves nothing', async () => {
    const name = '!!! ???';
    const err = await create(name).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).fieldErrors?.name).toBe(svcModule.GALLERY_NAME_NO_ADDRESS_MESSAGE);
    expect(galleryNamesForOwner()).not.toContain(name);
    const preview = svcModule.previewNewMemberGallery(OWNER_SLUG, name, ['#a_tag'], () => false);
    expect(preview).toEqual({ refusal: svcModule.GALLERY_NAME_NO_ADDRESS_MESSAGE, field: 'galleryName' });
  });

  // Defect caught: the preview the Share form shows names another address or
  // other hashtags than the save then stores.
  it('previews the id and hashtags the save stores', async () => {
    const preview = svcModule.previewNewMemberGallery(OWNER_SLUG, 'Preview Match', ['#preview_tag'], () => false);
    if ('refusal' in preview) throw new Error(preview.refusal);
    expect(preview).toEqual({
      galleryId: `gallery_${OWNER_SLUG}_preview_match`,
      tags: [`#by_${OWNER_SLUG}`, '#preview_tag'],
      defaultTagUsed: false,
    });
    const { id } = await create('Preview Match');
    expect(id).toBe(preview.galleryId);
  });

  // Defect caught: with no hashtag typed the preview leaves the gallery with
  // only the owner's tag, or loses the capitals the member wrote.
  it('previews the hashtag made from the name, capitals kept, when none is typed', () => {
    const preview = svcModule.previewNewMemberGallery(OWNER_SLUG, 'Worlds 2026', [], () => false);
    expect(preview).toMatchObject({ tags: [`#by_${OWNER_SLUG}`, '#Worlds_2026'], defaultTagUsed: true });
  });

  // Defect caught: a name whose made hashtag is the curator marker or another
  // member's uploader tag is accepted, forging attribution.
  it('refuses a name whose made hashtag is reserved for the site', () => {
    for (const name of ['curated', 'by jane']) {
      const preview = svcModule.previewNewMemberGallery(OWNER_SLUG, name, [], () => false);
      expect(preview, name).toMatchObject({ field: 'galleryName' });
    }
    // The same names with hashtags of the member's own are fine.
    expect(svcModule.previewNewMemberGallery(OWNER_SLUG, 'curated', ['#mine'], () => false))
      .not.toHaveProperty('refusal');
  });

  // Defect caught: the preview shows the plain address although it is taken,
  // so the saved gallery's address differs from the one shown.
  it('previews the next free suffix when the plain address is taken', () => {
    const taken = new Set([`gallery_${OWNER_SLUG}_busy`, `gallery_${OWNER_SLUG}_busy_2`]);
    const preview = svcModule.previewNewMemberGallery(OWNER_SLUG, 'Busy', ['#x'], (id) => taken.has(id));
    expect(preview).toMatchObject({ galleryId: `gallery_${OWNER_SLUG}_busy_3` });
  });

  // Defect caught: two names differing only in capitals cannot both exist, or
  // the second overwrites or collides with the first's address.
  it('gives a name differing only in capitals the next free suffix', async () => {
    const first = await create('Beach Day');
    const second = await create('BEACH DAY');
    expect(first.id).toBe(`gallery_${OWNER_SLUG}_beach_day`);
    expect(second.id).toBe(`gallery_${OWNER_SLUG}_beach_day_2`);
    expect(galleryNamesForOwner()).toEqual(expect.arrayContaining(['Beach Day', 'BEACH DAY']));
  });
});
