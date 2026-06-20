/**
 * The /curated guardrail is a no-op where curated sidecar writes are off.
 *
 * Companion to `curatorMediaService.persona-guard.test.ts`. The guardrail only
 * fires where a curated write would mutate the persistent on-disk /curated files
 * (config.allowCuratedSidecarWrites). Staging and production run with that flag
 * off: curated writes land in the database and object store only, the working
 * tree is never touched, and any admin may curate. This suite pins that no-op by
 * clearing ALLOW_CURATED_SIDECAR_WRITES before config freezes, then showing a
 * persona-prefixed admin id is NOT refused on a curated write.
 *
 * Setting the flag at module top, before the dynamic service import, is the
 * tricky part: config reads the env once at module load, so the override must
 * land before that read.
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

const { dbPath } = setTestEnv('3099');
// The fixture defaults this on (mirroring dev); clear it before the service
// module loads so config freezes with sidecar writes off (the staging/prod shape).
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';

const PERSONA_ADMIN = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}guard_admin_off`;
const SYSTEM_ID = 'member_footbag_hacky_guard_off';

let svcModule: typeof import('../../src/services/curatorMediaService');
let curatedRoot: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: PERSONA_ADMIN, slug: 'guard_admin_off', is_admin: 1 });
  insertMember(db, {
    id: SYSTEM_ID, slug: 'footbag_hacky_guard_off', is_system: 1,
    real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  insertMemberTierGrant(db, { member_id: PERSONA_ADMIN, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  db.close();
  curatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-curated-guard-off-'));
  svcModule = await import('../../src/services/curatorMediaService');
});

afterAll(() => {
  cleanupTestDb(dbPath);
  fs.rmSync(curatedRoot, { recursive: true, force: true });
});

const noopStorage = {} as unknown as MediaStorageAdapter;
const noopImage = {} as unknown as ImageProcessingAdapter;

describe('/curated guardrail with sidecar writes off (staging/production shape)', () => {
  it('lets a persona-prefixed admin id create a curated gallery (guard is a no-op)', async () => {
    const svc = svcModule.createCuratorMediaService({
      storage: noopStorage, imageProcessor: noopImage, curatedRootDir: curatedRoot,
    });
    await expect(
      svc.createGallery({
        actorMemberId: PERSONA_ADMIN, actorIsAdmin: true, ownerMemberId: SYSTEM_ID,
        suggestedId: 'gallery_guard_off',
        updates: { name: 'Off', description: '', sortOrder: 'upload_desc', criteriaTags: ['#curated'], excludeTags: [], externalLinks: [] },
      }),
    ).resolves.toBeDefined();
  });
});
