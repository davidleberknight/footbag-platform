/**
 * Boot-scan integration test.
 *
 * Validates the contract for runExternalUrlBootScan against real SQLite:
 *   - sidecar-seeded rows (validated_at IS NULL) get scanned
 *   - rows that pass validation get validated_at stamped
 *   - rows that fail validation get quarantine_reason stamped
 *   - already-validated rows are skipped (the boot scan is idempotent)
 *   - quarantined rows are excluded from listGalleryExternalLinksForPublic
 *   - quarantined rows ARE returned by listGalleryExternalLinks (admin view)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
} from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3119');

let media: typeof import('../../src/db/db').media;
let runExternalUrlBootScan: typeof import('../../src/services/externalUrlBootScan').runExternalUrlBootScan;
let validateExternalUrl: typeof import('../../src/lib/externalUrlValidator').validateExternalUrl;

const GALLERY_ID = 'gal_bootscan_test_1';
const ROW_VALID_NOT_YET_SCANNED = 'lnk_a_valid_unscanned';
const ROW_MALWARE_NOT_YET_SCANNED = 'lnk_b_malware_unscanned';
const ROW_ALREADY_VALIDATED = 'lnk_c_already_validated';
const ROW_ALREADY_QUARANTINED = 'lnk_d_already_quarantined';

const VALID_URL = 'https://example.com/gallery';
const MALWARE_URL = 'http://malware.testing.google.test/testing/malware/';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const memberId = insertMember(db);
  // Minimal gallery row; member_galleries columns inferred from schema.
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO member_galleries (
      id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, is_default, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 'Test Gallery', '', 0, 'upload_desc')
  `).run(GALLERY_ID, now, memberId, now, memberId, memberId);

  const insertLink = db.prepare(`
    INSERT INTO gallery_external_links (
      id, created_at, created_by, updated_at, updated_by, version,
      gallery_id, label, url, validated_at, quarantine_reason, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `);
  insertLink.run(
    ROW_VALID_NOT_YET_SCANNED, now, memberId, now, memberId,
    GALLERY_ID, 'Valid Site', VALID_URL, null, null, 0,
  );
  insertLink.run(
    ROW_MALWARE_NOT_YET_SCANNED, now, memberId, now, memberId,
    GALLERY_ID, 'Bad Site', MALWARE_URL, null, null, 1,
  );
  insertLink.run(
    ROW_ALREADY_VALIDATED, now, memberId, now, memberId,
    GALLERY_ID, 'Already Validated', 'https://example.org/already', now, null, 2,
  );
  insertLink.run(
    ROW_ALREADY_QUARANTINED, now, memberId, now, memberId,
    GALLERY_ID, 'Already Bad', 'https://example.net/already-bad', null, 'previously rejected', 3,
  );
  db.close();

  ({ media } = await import('../../src/db/db'));
  ({ runExternalUrlBootScan } = await import('../../src/services/externalUrlBootScan'));
  ({ validateExternalUrl } = await import('../../src/lib/externalUrlValidator'));

  // The runtime singleton stub seeds the canonical malware URL (MALWARE).
  // Force a fresh singleton so the test sees the seeded behavior.
  const { resetSafeBrowsingAdapterForTests } = await import(
    '../../src/adapters/safeBrowsingAdapter'
  );
  resetSafeBrowsingAdapterForTests();
});

afterAll(() => cleanupTestDb(dbPath));

describe('externalUrlBootScan: sidecar-seeded URLs get validated/quarantined', () => {
  it('skips rows already validated or already quarantined; processes only NULL/NULL rows', async () => {
    const result = await runExternalUrlBootScan({
      validate: validateExternalUrl,
    });
    expect(result.scanned).toBe(2);
    // VALID_URL: scheme/SSRF pass, stub Safe Browsing returns safe →
    // validated. MALWARE_URL: scheme/SSRF pass, but the stub seed adds it
    // as MALWARE → quarantined.
    expect(result.validated).toBe(1);
    expect(result.quarantined).toBe(1);
  });

  it('stamps validated_at on the previously-NULL valid row', () => {
    const rows = media.listGalleryExternalLinks.all(GALLERY_ID) as Array<{
      id: string;
      validated_at: string | null;
      quarantine_reason: string | null;
    }>;
    const valid = rows.find(r => r.id === ROW_VALID_NOT_YET_SCANNED);
    expect(valid).toBeDefined();
    expect(valid!.validated_at).not.toBeNull();
    expect(valid!.quarantine_reason).toBeNull();
  });

  it('stamps quarantine_reason on the previously-NULL malware row', () => {
    const rows = media.listGalleryExternalLinks.all(GALLERY_ID) as Array<{
      id: string;
      validated_at: string | null;
      quarantine_reason: string | null;
    }>;
    const bad = rows.find(r => r.id === ROW_MALWARE_NOT_YET_SCANNED);
    expect(bad).toBeDefined();
    expect(bad!.validated_at).toBeNull();
    expect(bad!.quarantine_reason).not.toBeNull();
  });

  it('listGalleryExternalLinksForPublic excludes quarantined rows', () => {
    const publicRows = media.listGalleryExternalLinksForPublic.all(GALLERY_ID) as Array<{
      id: string;
    }>;
    const ids = publicRows.map(r => r.id);
    expect(ids).toContain(ROW_VALID_NOT_YET_SCANNED);
    expect(ids).toContain(ROW_ALREADY_VALIDATED);
    expect(ids).not.toContain(ROW_MALWARE_NOT_YET_SCANNED);
    expect(ids).not.toContain(ROW_ALREADY_QUARANTINED);
  });

  it('listGalleryExternalLinks (admin) returns all rows including quarantined', () => {
    const allRows = media.listGalleryExternalLinks.all(GALLERY_ID) as Array<{
      id: string;
    }>;
    const ids = allRows.map(r => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        ROW_VALID_NOT_YET_SCANNED,
        ROW_MALWARE_NOT_YET_SCANNED,
        ROW_ALREADY_VALIDATED,
        ROW_ALREADY_QUARANTINED,
      ]),
    );
  });

  it('a second boot scan is a no-op (already-stamped rows are skipped)', async () => {
    const result = await runExternalUrlBootScan({
      validate: validateExternalUrl,
    });
    expect(result.scanned).toBe(0);
    expect(result.validated).toBe(0);
    expect(result.quarantined).toBe(0);
  });
});
