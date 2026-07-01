/**
 * Pre-go-live /curated guardrail: a seeded test-persona admin cannot author
 * curated media; real maintainer accounts can, and member-owned writes are never
 * affected.
 *
 * Read this env coupling carefully, because it makes the feature tricky to test.
 * The guard only fires where curated sidecar writes are enabled, i.e. where a
 * curated write would mutate the persistent on-disk /curated files. That is dev,
 * and it is also this integration suite, because the shared fixture sets
 * ALLOW_CURATED_SIDECAR_WRITES=1. So the guard is live here and a persona admin
 * is refused. In staging and production the flag is off, curated writes land in
 * the database and object store only, any admin may curate, and the guard is a
 * no-op; that off path is covered by the sibling
 * `curatorMediaService.persona-guard.sidecars-off.test.ts`, which boots with the
 * flag cleared before config freezes.
 *
 * A real maintainer account carries an ordinary member id; the David Leberknight
 * persona registers through the real flow and also carries an ordinary id; only
 * the seeded harness personas carry the persona-prefixed id the guard keys on.
 * The guard wraps every curated write through one shared helper, so this suite
 * exercises a representative set (a media upload, an FH-owned gallery create, and
 * an FH-owned gallery edit/delete) plus the two passing cases (a real admin, and
 * a member-owned write by the persona).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant } from '../fixtures/factories';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../../src/lib/personaGuards';
import type { MediaJobRow } from '../../src/db/db';

const { dbPath } = setTestEnv('3098');

const PERSONA_ADMIN = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}guard_admin`;
const REAL_ADMIN = 'admin-real-guard-001';
const SYSTEM_ID = 'member_footbag_hacky_guard';

let svcModule: typeof import('../../src/services/curatorMediaService');
let curatedRoot: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: PERSONA_ADMIN, slug: 'guard_admin', is_admin: 1 });
  insertMember(db, { id: REAL_ADMIN, slug: 'real_guard_admin', is_admin: 1 });
  insertMember(db, {
    id: SYSTEM_ID, slug: 'footbag_hacky_guard', is_system: 1,
    real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  // Admin role requires Tier 2; both admins get it so the tier gate is not what
  // refuses them.
  insertMemberTierGrant(db, { member_id: PERSONA_ADMIN, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  insertMemberTierGrant(db, { member_id: REAL_ADMIN, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  db.close();
  curatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-curated-guard-'));
  svcModule = await import('../../src/services/curatorMediaService');
});

afterAll(() => {
  cleanupTestDb(dbPath);
  fs.rmSync(curatedRoot, { recursive: true, force: true });
});

// The curated-create paths exercised here touch only the DB and the sidecar
// directory, never storage or the image worker, so empty adapters suffice.
const noopStorage = {} as unknown as MediaStorageAdapter;
const noopImage = {} as unknown as ImageProcessingAdapter;

function svc() {
  return svcModule.createCuratorMediaService({
    storage: noopStorage, imageProcessor: noopImage, curatedRootDir: curatedRoot,
  });
}

const galleryUpdates = (name: string) => ({
  name, description: '', sortOrder: 'upload_desc' as const,
  criteriaTags: ['#curated'], excludeTags: [], externalLinks: [],
});

const GUARD = /test persona/i;

describe('/curated guardrail with sidecar writes on', () => {
  it('refuses a persona admin on a curated photo upload', async () => {
    await expect(
      svc().uploadPhoto({ adminMemberId: PERSONA_ADMIN, photoBuffer: Buffer.from('x'), caption: null, tags: [] }),
    ).rejects.toThrow(GUARD);
  });

  it('refuses a persona admin creating an FH-owned (curated) gallery', async () => {
    await expect(
      svc().createGallery({
        actorMemberId: PERSONA_ADMIN, actorIsAdmin: true, ownerMemberId: SYSTEM_ID,
        suggestedId: 'gallery_guard_persona', updates: galleryUpdates('Persona Curated'),
      }),
    ).rejects.toThrow(GUARD);
  });

  it('lets a real maintainer admin create a curated gallery, then refuses a persona admin editing and deleting it', async () => {
    // The real admin (ordinary id) is allowed: the create succeeds.
    await svc().createGallery({
      actorMemberId: REAL_ADMIN, actorIsAdmin: true, ownerMemberId: SYSTEM_ID,
      suggestedId: 'gallery_guard_real', updates: galleryUpdates('Real Curated'),
    });
    // The persona admin cannot edit or delete that curated gallery.
    await expect(
      svc().updateGallery({
        actorMemberId: PERSONA_ADMIN, actorIsAdmin: true,
        galleryId: 'gallery_guard_real', updates: galleryUpdates('Hijacked'),
      }),
    ).rejects.toThrow(GUARD);
    await expect(
      svc().deleteGallery({ actorMemberId: PERSONA_ADMIN, actorIsAdmin: true, galleryId: 'gallery_guard_real' }),
    ).rejects.toThrow(GUARD);
  });

  it('does not block a persona actor on a member-owned gallery (the guard is curated-only)', async () => {
    await expect(
      svc().createGallery({
        actorMemberId: PERSONA_ADMIN, actorIsAdmin: true, ownerMemberId: PERSONA_ADMIN,
        ownerSlug: 'guard_admin',
        updates: { name: 'My Own Gallery', description: '', sortOrder: 'upload_desc', criteriaTags: ['#footbags'], excludeTags: [], externalLinks: [] },
      }),
    ).resolves.toBeDefined();
  });

  // The async curator-video path (POST /sign -> queued job -> worker finalize)
  // must enforce the same guard as the synchronous uploads: the guard fires early
  // in finalizeTranscodeForJob, keyed on the initiating actor stored on the job.
  const videoJob = (adminMemberId: string, id: string) =>
    ({
      id, kind: 'curator_video', state: 'processing', admin_member_id: adminMemberId,
      source_video_key: 'pending/video.mp4', source_poster_key: 'pending/poster.jpg',
      caption: null, tags: '', source_filename: 'v.mp4', media_id: null,
      retry_count: 0, last_error: null, last_attempted_at: null,
      lease_expires_at: null, expires_at: null,
      created_at: '2020-01-01T00:00:00.000Z', created_by: 'system',
    }) as unknown as MediaJobRow;

  it('refuses a persona admin on the async video finalize path', async () => {
    await expect(
      svc().finalizeTranscodeForJob(videoJob(PERSONA_ADMIN, 'job_guard_persona')),
    ).rejects.toThrow(GUARD);
  });

  it('lets a real admin past the persona guard on the async finalize path (any later failure is not the guard)', async () => {
    let err: unknown;
    try {
      await svc().finalizeTranscodeForJob(videoJob(REAL_ADMIN, 'job_guard_real'));
    } catch (e) {
      err = e;
    }
    // The real admin (ordinary id) passes the guard; finalize then proceeds to the
    // transcode/storage step, which the noop adapters do not implement, so it fails
    // with a non-guard error — proving the persona guard did not fire.
    expect(err).toBeDefined();
    expect(String((err as Error).message)).not.toMatch(GUARD);
  });
});
