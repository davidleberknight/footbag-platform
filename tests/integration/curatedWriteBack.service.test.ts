/**
 * Curated media write-back on a developer machine: a curated gallery, an email
 * template and a curated upload each keep a committed file that the next rebuild
 * loads. The file is written before the database step, a file that cannot be
 * written refuses the save, and a database step that then fails puts back exactly
 * what the file held before. A save that reached only the database would look done
 * and be lost at the next rebuild; a refused save that left its file behind would
 * come back at the next rebuild, or would already have overwritten another item's.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant } from '../fixtures/factories';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';
import { ConflictError, ServiceUnavailableError, ValidationError } from '../../src/services/serviceErrors';

const { dbPath } = setTestEnv('4391');

const ADMIN_ID = 'admin-writeback-001';
const SYSTEM_ID = 'member_footbag_hacky_writeback';
const CURATED_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-writeback-curated-'));

let svcModule: typeof import('../../src/services/curatorMediaService');
let templates: typeof import('../../src/services/emailTemplateAdminService').emailTemplateAdminService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'writeback_admin', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  db.close();
  svcModule = await import('../../src/services/curatorMediaService');
  svcModule.setCuratedRootDirForTests(CURATED_ROOT);
  templates = (await import('../../src/services/emailTemplateAdminService')).emailTemplateAdminService;
});

afterAll(() => {
  svcModule.resetCuratedRootDirForTests();
  cleanupTestDb(dbPath);
  fs.rmSync(CURATED_ROOT, { recursive: true, force: true });
});

// A database trigger stands in for any refusal after the file is written; each
// case that adds one removes it.
const triggers: string[] = [];
function refuseInDatabase(name: string, sql: string): void {
  const db = new BetterSqlite3(dbPath);
  db.exec(sql);
  db.close();
  triggers.push(name);
}
afterEach(() => {
  const db = new BetterSqlite3(dbPath);
  for (const name of triggers.splice(0)) db.exec(`DROP TRIGGER IF EXISTS ${name}`);
  db.close();
});

function readRow<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(sql).get(...params) as T | undefined;
  db.close();
  return row;
}

function makeStorage(): MediaStorageAdapter {
  const contents = new Map<string, Buffer>();
  return {
    async put(key, data) { contents.set(key, Buffer.from(data)); },
    async get(key) { return contents.get(key) ?? Buffer.alloc(0); },
    async delete(key) { contents.delete(key); },
    constructURL(key) { return `/media-store/${key}`; },
    async exists(key) { return contents.has(key); },
    async headSize(key) { return contents.get(key)?.length ?? null; },
    async generatePresignedPutUrl(key) { return `/_stub-presigned-put/${key}`; },
    async generatePresignedGetUrl(key) { return `/_stub-presigned-get/${key}`; },
  };
}

const imageProcessor: ImageProcessingAdapter = {
  async processAvatar() { return { thumb: Buffer.from('t'), display: Buffer.from('d'), widthPx: 300, heightPx: 300 }; },
  async processPhoto() { return { thumb: Buffer.from('t'), display: Buffer.from('d'), widthPx: 1000, heightPx: 750 }; },
};

function service() {
  return svcModule.createCuratorMediaService({ storage: makeStorage(), imageProcessor });
}

function galleryFile(slug: string): string {
  return path.join(CURATED_ROOT, 'galleries', `${slug}.json`);
}

async function createCuratedGallery(slug: string, name: string): Promise<void> {
  await service().createGallery({
    actorMemberId: ADMIN_ID, actorIsAdmin: true, ownerMemberId: SYSTEM_ID, suggestedId: `gallery_${slug}`,
    updates: { name, description: '', sortOrder: 'upload_desc', criteriaTags: ['#curated', `#${slug}`], excludeTags: [] },
  });
}

describe('a curated gallery', () => {
  // Defect caught: a gallery saved while its file cannot be written is kept in
  // the database only, so the curator's edit disappears at the next rebuild.
  it('refuses an edit whose file cannot be written, leaving the gallery as it was', async () => {
    await createCuratedGallery('wb_unwritable', 'Unwritable');
    // A folder where the file should be: the write cannot replace it.
    fs.rmSync(galleryFile('wb_unwritable'));
    fs.mkdirSync(galleryFile('wb_unwritable'));
    try {
      await expect(service().updateGallery({
        actorMemberId: ADMIN_ID, actorIsAdmin: true, galleryId: 'gallery_wb_unwritable',
        updates: { name: 'Renamed', description: '', sortOrder: 'upload_desc', criteriaTags: ['#curated', '#wb_unwritable'], excludeTags: [] },
      })).rejects.toBeInstanceOf(ServiceUnavailableError);
    } finally {
      fs.rmSync(galleryFile('wb_unwritable'), { recursive: true, force: true });
    }
    expect(readRow<{ name: string }>('SELECT name FROM member_galleries WHERE id = ?', 'gallery_wb_unwritable')?.name)
      .toBe('Unwritable');
  });

  // Defect caught: an edit the database refuses still leaves its new file, so
  // the next rebuild loads a gallery the curator was told was not saved.
  it('puts the earlier file back when the database refuses an edit', async () => {
    await createCuratedGallery('wb_refused_edit', 'Before');
    const before = fs.readFileSync(galleryFile('wb_refused_edit'), 'utf8');
    refuseInDatabase('wb_refuse_gallery_edit', `CREATE TRIGGER wb_refuse_gallery_edit BEFORE UPDATE ON member_galleries
      WHEN NEW.id = 'gallery_wb_refused_edit' BEGIN SELECT RAISE(ABORT, 'refused'); END`);
    await expect(service().updateGallery({
      actorMemberId: ADMIN_ID, actorIsAdmin: true, galleryId: 'gallery_wb_refused_edit',
      updates: { name: 'After', description: '', sortOrder: 'upload_desc', criteriaTags: ['#curated', '#wb_refused_edit'], excludeTags: [] },
    })).rejects.toThrow('refused');
    expect(fs.readFileSync(galleryFile('wb_refused_edit'), 'utf8')).toBe(before);
  });

  // Defect caught: a new gallery under an id another gallery holds overwrites
  // that gallery's file before the insert is refused, so the other gallery is
  // replaced at the next rebuild.
  it("keeps another gallery's file when a new gallery is refused for taking its id", async () => {
    await createCuratedGallery('wb_taken', 'Original');
    const before = fs.readFileSync(galleryFile('wb_taken'), 'utf8');
    await expect(service().createGallery({
      actorMemberId: ADMIN_ID, actorIsAdmin: true, ownerMemberId: SYSTEM_ID, suggestedId: 'gallery_wb_taken',
      updates: { name: 'Impostor', description: '', sortOrder: 'upload_desc', criteriaTags: ['#curated', '#wb_impostor'], excludeTags: [] },
    })).rejects.toBeInstanceOf(ConflictError);
    expect(fs.readFileSync(galleryFile('wb_taken'), 'utf8')).toBe(before);
  });

  // Defect caught: a gallery made with capitals in its hashtags never reaches
  // its file, because the file holds only the lowercase form the seeder matches.
  it('writes a gallery made with capitals in its hashtags, in the form the seeder matches', async () => {
    await service().createGallery({
      actorMemberId: ADMIN_ID, actorIsAdmin: true, ownerMemberId: SYSTEM_ID, suggestedId: 'gallery_wb_capitals',
      updates: { name: 'Capitals', description: '', sortOrder: 'upload_desc', criteriaTags: ['#curated', '#Wb_Capitals'], excludeTags: [] },
    });
    const file = JSON.parse(fs.readFileSync(galleryFile('wb_capitals'), 'utf8')) as { criteriaTags: string[] };
    expect(file.criteriaTags).toContain('#wb_capitals');
  });

  // Defect caught: a deleted gallery whose file could not be removed returns at
  // the next rebuild, though the curator was told it was deleted.
  it('refuses a delete whose file cannot be removed, keeping the gallery', async () => {
    await createCuratedGallery('wb_stuck', 'Stuck');
    fs.rmSync(galleryFile('wb_stuck'));
    fs.mkdirSync(galleryFile('wb_stuck'));
    try {
      await expect(service().deleteGallery({
        actorMemberId: ADMIN_ID, actorIsAdmin: true, galleryId: 'gallery_wb_stuck',
      })).rejects.toBeInstanceOf(ServiceUnavailableError);
    } finally {
      fs.rmSync(galleryFile('wb_stuck'), { recursive: true, force: true });
    }
    expect(readRow('SELECT id FROM member_galleries WHERE id = ?', 'gallery_wb_stuck')).toBeDefined();
  });

  // Defect caught: a delete the database refuses has already removed the file,
  // so the gallery the curator still sees is gone at the next rebuild.
  it('puts the file back when the database refuses a delete', async () => {
    await createCuratedGallery('wb_refused_delete', 'Kept');
    const before = fs.readFileSync(galleryFile('wb_refused_delete'), 'utf8');
    refuseInDatabase('wb_refuse_gallery_delete', `CREATE TRIGGER wb_refuse_gallery_delete BEFORE DELETE ON member_galleries
      WHEN OLD.id = 'gallery_wb_refused_delete' BEGIN SELECT RAISE(ABORT, 'refused'); END`);
    await expect(service().deleteGallery({
      actorMemberId: ADMIN_ID, actorIsAdmin: true, galleryId: 'gallery_wb_refused_delete',
    })).rejects.toThrow('refused');
    expect(fs.readFileSync(galleryFile('wb_refused_delete'), 'utf8')).toBe(before);
  });
});

describe('an email template', () => {
  const KEY = 'password_changed';
  const templateFile = () => path.join(CURATED_ROOT, 'email_templates', `${KEY}.json`);
  const stored = () => readRow<{ subject_template: string; body_template: string; pii_classification: string }>(
    'SELECT subject_template, body_template, pii_classification FROM email_templates WHERE template_key = ?', KEY,
  )!;
  const edit = (subject: string) => {
    const row = stored();
    return { subjectTemplate: subject, bodyTemplate: row.body_template, piiClassification: row.pii_classification, isEnabled: true };
  };

  // Defect caught: a template edit saved while its file cannot be written is
  // kept in the database only, and the next seeding puts the old wording back.
  it('refuses an edit whose file cannot be written, leaving the template as it was', () => {
    const subjectBefore = stored().subject_template;
    fs.rmSync(path.join(CURATED_ROOT, 'email_templates'), { recursive: true, force: true });
    // A file where the folder should be: nothing can be written inside it.
    fs.writeFileSync(path.join(CURATED_ROOT, 'email_templates'), '');
    try {
      expect(() => templates.updateTemplate(KEY, edit('Unwritable subject'), ADMIN_ID)).toThrow(ServiceUnavailableError);
    } finally {
      fs.rmSync(path.join(CURATED_ROOT, 'email_templates'), { force: true });
    }
    expect(stored().subject_template).toBe(subjectBefore);
  });

  // Defect caught: an edit the database refuses leaves its new file, so the next
  // seeding sends wording the curator was told was not saved.
  it('puts the earlier file back when the database refuses an edit', () => {
    templates.updateTemplate(KEY, edit('First saved subject'), ADMIN_ID);
    const before = fs.readFileSync(templateFile(), 'utf8');
    refuseInDatabase('wb_refuse_template', `CREATE TRIGGER wb_refuse_template BEFORE UPDATE ON email_templates
      WHEN NEW.template_key = '${KEY}' BEGIN SELECT RAISE(ABORT, 'refused'); END`);
    expect(() => templates.updateTemplate(KEY, edit('Refused subject'), ADMIN_ID)).toThrow('refused');
    expect(fs.readFileSync(templateFile(), 'utf8')).toBe(before);
  });
});

describe('a curated photo upload', () => {
  const jpeg = (shade: number) => sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: shade, g: 120, b: 160 } },
  }).jpeg().toBuffer();

  // Defect caught: a second upload under a file name already taken overwrites
  // the first item's picture and tags file before it is refused, so the first
  // item is replaced at the next rebuild.
  it("keeps the first item's files when a second upload is refused for its file name", async () => {
    const first = await jpeg(10);
    await service().uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: first, sourceFilename: 'wb-taken.jpg',
      caption: 'First', tags: ['#wb_first'], category: 'wb_photos',
    });
    const dir = path.join(CURATED_ROOT, 'wb_photos');
    const sidecarBefore = fs.readFileSync(path.join(dir, 'wb-taken.meta.json'), 'utf8');

    await expect(service().uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: await jpeg(200), sourceFilename: 'wb-taken.jpg',
      caption: 'Second', tags: ['#wb_second'], category: 'wb_photos',
    })).rejects.toBeInstanceOf(ValidationError);

    expect(fs.readFileSync(path.join(dir, 'wb-taken.jpg')).equals(first)).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'wb-taken.meta.json'), 'utf8')).toBe(sidecarBefore);
  });
});
