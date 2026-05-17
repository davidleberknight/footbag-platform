/**
 * Defense-in-depth (DD §2020) verification for curatorMediaService.
 *
 * The route layer applies requireTier1Benefits middleware on the four
 * member-write POST routes. The service layer adds the same
 * predicate at every member-write entry point, so a programmatic call
 * that bypasses the route gate (admin curator route, future caller,
 * unit test that directly invokes the service) still cannot mutate
 * member-owned media without Tier 1+ benefits.
 *
 * Each test calls a service method directly with a Tier 0 / no-AP
 * actor and asserts ForbiddenError. The tier check fires before any
 * other validation, so minimal/empty input is fine — the assertion
 * is on the gate decision, not the downstream behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
} from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant } from '../fixtures/factories';
import { ForbiddenError } from '../../src/services/serviceErrors';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';

const { dbPath } = setTestEnv('3077');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcModule: typeof import('../../src/services/curatorMediaService');

const TIER0_ID = 'member-svc-tier-defense-t0';
const TIER1_ID = 'member-svc-tier-defense-t1';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: TIER0_ID, slug: 'svc_def_t0' });
  insertMember(db, { id: TIER1_ID, slug: 'svc_def_t1' });
  // TIER1_ID is the negative control: same call, but the gate passes.
  insertMemberTierGrant(db, { member_id: TIER1_ID, new_tier_status: 'tier1' });
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
    async generatePresignedPutUrl() { return '/stub-presigned'; },
  };
}

function noopImageProcessor(): ImageProcessingAdapter {
  return {
    async processAvatar() {
      return { thumb: Buffer.from(''), display: Buffer.from(''), widthPx: 1, heightPx: 1 };
    },
    async processPhoto() {
      return { thumb: Buffer.from(''), display: Buffer.from(''), widthPx: 1, heightPx: 1 };
    },
  };
}

function buildSvc(): ReturnType<typeof svcModule.createCuratorMediaService> {
  return svcModule.createCuratorMediaService({
    storage: noopStorage(),
    imageProcessor: noopImageProcessor(),
  });
}

describe('curatorMediaService defense-in-depth: Tier 0 actor blocked', () => {
  it('createGallery throws ForbiddenError for a Tier 0 no-AP actor', async () => {
    const svc = buildSvc();
    await expect(svc.createGallery({
      actorMemberId: TIER0_ID,
      actorIsAdmin: false,
      ownerMemberId: TIER0_ID,
      ownerSlug: 'svc_def_t0',
      updates: { name: 'Blocked', description: '', sortOrder: 'upload_desc', criteriaTags: ['#x'], excludeTags: [] },
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updateGallery throws ForbiddenError for a Tier 0 no-AP actor', async () => {
    const svc = buildSvc();
    await expect(svc.updateGallery({
      actorMemberId: TIER0_ID,
      actorIsAdmin: false,
      galleryId: 'gallery_does_not_matter',
      updates: { name: 'Blocked', description: '', sortOrder: 'upload_desc', criteriaTags: ['#x'], excludeTags: [] },
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('deleteGallery throws ForbiddenError for a Tier 0 no-AP actor', async () => {
    const svc = buildSvc();
    await expect(svc.deleteGallery({
      actorMemberId: TIER0_ID,
      actorIsAdmin: false,
      galleryId: 'gallery_does_not_matter',
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('uploadPhotoForMember throws ForbiddenError for a Tier 0 no-AP member', async () => {
    const svc = buildSvc();
    await expect(svc.uploadPhotoForMember({
      memberId: TIER0_ID,
      slug: 'svc_def_t0',
      photoBuffer: Buffer.from(''),
      sourceFilename: 'x.jpg',
      caption: null,
      tags: [],
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('submitVideoForMember throws ForbiddenError for a Tier 0 no-AP member', async () => {
    const svc = buildSvc();
    await expect(svc.submitVideoForMember({
      memberId: TIER0_ID,
      slug: 'svc_def_t0',
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      videoPlatform: 'youtube',
      caption: null,
      tags: [],
    })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('curatorMediaService defense-in-depth: Tier 1 actor passes the gate', () => {
  // Negative control: Tier 1 actors pass assertTier1Benefits. The call
  // proceeds past the gate and fails for unrelated reasons (missing
  // gallery row, invalid filename, etc.). Whatever the error, it is
  // NOT a ForbiddenError raised by the gate.
  it('createGallery does not throw ForbiddenError for a Tier 1 actor', async () => {
    const svc = buildSvc();
    let thrown: unknown;
    try {
      await svc.createGallery({
        actorMemberId: TIER1_ID,
        actorIsAdmin: false,
        ownerMemberId: TIER1_ID,
        ownerSlug: 'svc_def_t1',
        updates: { name: 'OK', description: '', sortOrder: 'upload_desc', criteriaTags: ['#x'], excludeTags: [] },
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(ForbiddenError);
  });

  it('updateGallery does not throw ForbiddenError for a Tier 1 actor (NotFound is fine)', async () => {
    const svc = buildSvc();
    let thrown: unknown;
    try {
      await svc.updateGallery({
        actorMemberId: TIER1_ID,
        actorIsAdmin: false,
        galleryId: 'gallery_does_not_exist',
        updates: { name: 'OK', description: '', sortOrder: 'upload_desc', criteriaTags: ['#x'], excludeTags: [] },
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(ForbiddenError);
  });
});
