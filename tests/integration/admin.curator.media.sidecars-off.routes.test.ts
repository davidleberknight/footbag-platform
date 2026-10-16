/**
 * Admin curator pages where the authoring tree is not writable.
 *
 * This is the shape every deployed host runs: the database is the only source
 * of truth, `/curated/` is never written, and the curator seeder has no role.
 * The outcome banners and the empty gallery list must therefore say what
 * happened and never tell an administrator to run the seeder, which does not
 * exist on the host and would be wrong to run against a persistent database.
 *
 * Companion to `admin.curator.media.routes.test.ts` and
 * `admin.curator.upload.routes.test.ts`, which cover the developer shape where
 * the tree is writable and the seeder instruction is shown. The flag is read
 * once per process, so the two shapes cannot share a file.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { setTestEnv, createTestDb, cleanupTestDb, importApp, seedEmailTemplates } from '../fixtures/testDb';

const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-media-admin-sidecars-off-'));

const { dbPath } = setTestEnv('4203');
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
// The fixture defaults this on to mirror a developer machine. Clear it before
// the app loads, since config freezes its value at module load.
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import sharp from 'sharp';
import BetterSqlite3 from 'better-sqlite3';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

let createApp: typeof import('../../src/app').createApp;
let resetImageProcessingAdapterForTests: () => void;

const ADMIN_ID  = 'admin-curator-sidecars-off-001';
const SYSTEM_ID = 'member_footbag_hacky_sidecars_off_routes';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedEmailTemplates(db);
  insertMember(db, { id: ADMIN_ID, slug: 'curator_admin_sidecars_off', display_name: 'Curator Admin Off', login_email: 'admin-off@example.com', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky_sidecars_off_routes', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
  db.close();

  createApp = await importApp();

  const adapterMod = await import('../../src/adapters/imageProcessingAdapter');
  const imgMod = await import('../../src/lib/imageProcessing');
  resetImageProcessingAdapterForTests = adapterMod.resetImageProcessingAdapterForTests;
  const fakeFetch: typeof fetch = async (input, init) => {
    const body = init?.body as Buffer | Uint8Array;
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const processed = String(input).endsWith('/process/photo')
      ? await imgMod.processPhoto(buf)
      : await imgMod.processAvatar(buf);
    return new Response(
      JSON.stringify({
        thumb: processed.thumb.toString('base64'),
        display: processed.display.toString('base64'),
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  adapterMod.setImageProcessingAdapterForTests(
    adapterMod.createHttpImageAdapter({ internalSecret: 'test-internal-event-secret', baseUrl: 'http://test-injected', fetchImpl: fakeFetch }),
  );

  // The local storage adapter still places photo files under a category
  // directory; point it at the temp tree so no run touches the repo.
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(TEST_MEDIA_DIR);
});

afterAll(async () => {
  resetImageProcessingAdapterForTests();
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  cleanupTestDb(dbPath);
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

let uploadCounter = 0;

// Uploads one photo and returns its id, read from the database so no page
// request consumes the one-shot outcome message the upload left behind.
async function uploadPhoto(agent: ReturnType<typeof request.agent>): Promise<string> {
  const jpeg = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 80, g: 120, b: 160 } } }).jpeg().toBuffer();
  const caption = `sidecars-off-${++uploadCounter}-${Date.now()}`;
  const res = await agent
    .post('/admin/curator/upload')
    .set('Cookie', adminCookie())
    .field('mediaType', 'photo')
    .field('newCategory', 'photos')
    .field('caption', caption)
    .attach('mediaFile', jpeg, `${caption}.jpg`);
  expect(res.status).toBe(303);
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db.prepare('SELECT id FROM media_items WHERE caption = ?').get(caption) as { id: string } | undefined;
    expect(row, caption).toBeDefined();
    return row!.id;
  } finally {
    db.close();
  }
}

describe('admin curator pages on a host where the authoring tree is not writable', () => {
  // Defect caught: an administrator on a deployed host is told to run the
  // Python curator seeder after an upload, a command that does not exist there
  // and would overwrite the persistent database if it did.
  it('reports an upload without telling the administrator to run the seeder', async () => {
    const agent = request.agent(createApp());
    await uploadPhoto(agent);
    const res = await agent.get('/admin/curator/upload').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Uploaded.');
    expect(res.text).not.toContain('seed_fh_curator.py');
    expect(res.text).not.toContain('Sidecar saved under');
  });

  // Defect caught: a photo upload refused for want of a category, on a host
  // where a category names a directory that is never written. Whether the form
  // needs one follows the authoring-tree flag, not which storage adapter runs.
  it('accepts a photo with no category, since there is no authoring tree to file it in', async () => {
    const jpeg = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 60, g: 30, b: 200 } } }).jpeg().toBuffer();
    const caption = `sidecars-off-no-category-${Date.now()}`;
    const res = await request(createApp())
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('caption', caption)
      .attach('mediaFile', jpeg, 'no-category.jpg');
    expect(res.status).toBe(303);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM media_items WHERE caption = ?').get(caption) as { n: number };
      expect(row.n).toBe(1);
    } finally { db.close(); }
  });

  // Defect caught: the edit and delete outcomes on a deployed host claim a
  // sidecar was rewritten or removed and send the administrator to the seeder.
  it('reports an edit and a delete without mentioning sidecars or the seeder', async () => {
    const agent = request.agent(createApp());
    const mediaId = await uploadPhoto(agent);

    const editRes = await agent
      .post(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ caption: 'sidecars-off-edited', tags: '' });
    expect(editRes.status).toBe(303);
    const afterEdit = await agent.get('/admin/curator/media').set('Cookie', adminCookie());
    expect(afterEdit.status).toBe(200);
    expect(afterEdit.text).toContain('Saved.');
    expect(afterEdit.text).not.toContain('seed_fh_curator.py');
    expect(afterEdit.text).not.toContain('/curated/');

    const deleteRes = await agent
      .post(`/admin/curator/media/${mediaId}/delete`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ confirmed: '1' });
    expect(deleteRes.status).toBe(303);
    const afterDelete = await agent.get('/admin/curator/media').set('Cookie', adminCookie());
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.text).toContain('Deleted.');
    expect(afterDelete.text).not.toContain('seed_fh_curator.py');
  });

  // Defect caught: the empty gallery list on a deployed host offers the seeder
  // as a way to create galleries.
  it('points an empty gallery list at the Create button only', async () => {
    const res = await request(createApp()).get('/admin/curator/galleries').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('No FH-owned named galleries yet. Use the Create button above.');
    expect(res.text).not.toContain('seed_fh_curator.py');
  });
});

// The inputs and sentences that exist only to name or describe a sidecar file
// are absent where no sidecar is written: a deployed host asked for a category
// and a slug it never uses, and told its administrator about files it never
// writes.
describe('curator forms ask for and describe no sidecar where none is written', () => {
  const VIDEO_URL = 'https://www.youtube.com/watch?v=SIDECAROFF1';

  beforeAll(async () => {
    const svcMod = await import('../../src/services/curatorMediaService');
    svcMod.setVideoUrlVerifierForTests(async () => ({ ok: true, status: 200, body: { title: 'off' } }));
  });

  afterAll(async () => {
    const svcMod = await import('../../src/services/curatorMediaService');
    svcMod.resetVideoUrlVerifierForTests();
  });

  it('the upload form offers no category box and no primary slug', async () => {
    const res = await request(createApp()).get('/admin/curator/upload').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('name="primarySlug"');
    expect(res.text).not.toContain('name="newCategory"');
    expect(res.text).toContain('name="videoUrl"');
  });

  it('saves a video link with no slug, then refuses the same link again and leaves the first item as it was', async () => {
    const send = (title: string) => request(createApp())
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', VIDEO_URL)
      .field('title', title)
      .field('tags', '#zz_first');
    expect((await send('first title')).status).toBe(303);

    const again = await send('second title');
    expect(again.status).toBe(422);
    expect(again.text).toContain('That video is already in the curated library. Edit the existing item instead.');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare('SELECT caption FROM media_items WHERE video_url = ?').get(VIDEO_URL) as { caption: string };
      expect(row.caption).toBe('first title');
    } finally { db.close(); }
  });

  it('the edit page of a video link says nothing of a sidecar', async () => {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const { id } = db.prepare('SELECT id FROM media_items WHERE video_url = ?').get(VIDEO_URL) as { id: string };
    db.close();
    const res = await request(createApp()).get(`/admin/curator/media/${id}/edit`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('URL reference)');
    expect(res.text).not.toContain('sidecar-backed');
    expect(res.text).not.toContain('Edits write through');
  });

  it('the gallery pages describe no JSON sidecar, in the intros or the delete confirmation', async () => {
    const newPage = await request(createApp()).get('/admin/curator/galleries/new').set('Cookie', adminCookie());
    expect(newPage.status).toBe(200);
    expect(newPage.text).not.toContain('/curated/galleries/');

    const created = await request(createApp())
      .post('/admin/curator/galleries')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ idSlug: 'zz_off', name: 'ZZ Off', description: '', sortOrder: 'upload_desc', criteriaTags: '#zz_first', excludeTags: '' });
    expect(created.status).toBe(303);
    const list = await request(createApp()).get('/admin/curator/galleries').set('Cookie', adminCookie());
    expect(list.status).toBe(200);
    expect(list.text).toContain('the Delete action in the row removes it.');
    expect(list.text).toContain('data-confirm="Delete gallery gallery_zz_off?"');
    expect(list.text).not.toContain('/curated/galleries/');
  });

  // A deployed host's database is the template's whole record; writing a
  // sidecar there would put files on a host whose tree nothing reads.
  it('an email-template save writes no sidecar', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/gallery_moderated_member/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        subjectTemplate: 'A change to your gallery',
        bodyTemplate: 'Hi {memberName}, {whatChanged} on {galleryName}. Note: {note}',
        piiClassification: 'confidential',
        isEnabled: '1',
      });
    expect(res.status).toBe(303);
    expect(fs.existsSync(path.join(TEST_MEDIA_DIR, 'email_templates'))).toBe(false);
  });
});
