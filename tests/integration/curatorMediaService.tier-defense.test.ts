/**
 * Defense-in-depth verification for curatorMediaService.
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
import { ForbiddenError, NotFoundError } from '../../src/services/serviceErrors';
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
  // A created gallery is stamped by the platform's system member.
  insertMember(db, { id: 'member-svc-tier-defense-system', slug: 'svc_def_system', is_system: 1 });
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
    async headSize() { return null; },
    async generatePresignedPutUrl() { return '/stub-presigned'; },
    async generatePresignedGetUrl() { return '/stub-presigned'; },
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
  // Control: the same calls from a Tier 1 actor get past the gate. Each case
  // asserts the concrete outcome the call reaches beyond it, so a call that
  // throws early for any other reason, or never reaches the gate, fails here.
  // Defect caught: the tier gate refuses a member it should admit.
  it('createGallery creates the gallery for a Tier 1 actor', async () => {
    const svc = buildSvc();
    const result = await svc.createGallery({
      actorMemberId: TIER1_ID,
      actorIsAdmin: false,
      ownerMemberId: TIER1_ID,
      ownerSlug: 'svc_def_t1',
      updates: { name: 'OK', description: '', sortOrder: 'upload_desc', criteriaTags: ['#x'], excludeTags: [] },
    });
    expect(result.id).toEqual(expect.any(String));
  });

  it('updateGallery reaches the gallery lookup for a Tier 1 actor', async () => {
    const svc = buildSvc();
    await expect(svc.updateGallery({
      actorMemberId: TIER1_ID,
      actorIsAdmin: false,
      galleryId: 'gallery_does_not_exist',
      updates: { name: 'OK', description: '', sortOrder: 'upload_desc', criteriaTags: ['#x'], excludeTags: [] },
    })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleteGallery reaches the gallery lookup for a Tier 1 actor', async () => {
    const svc = buildSvc();
    await expect(svc.deleteGallery({
      actorMemberId: TIER1_ID,
      actorIsAdmin: false,
      galleryId: 'gallery_does_not_exist',
    })).rejects.toBeInstanceOf(NotFoundError);
  });
});
