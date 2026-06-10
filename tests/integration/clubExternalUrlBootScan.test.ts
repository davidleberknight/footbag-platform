/**
 * Club external-URL boot-scan integration test.
 *
 * The clubs surface mirrors the gallery_external_links boot scan:
 *   - seeded club URLs (external_url_validated_at IS NULL) get scanned
 *   - rows that pass validation get external_url_validated_at stamped
 *   - rows that fail validation get external_url_quarantine_reason stamped
 *   - already-validated and already-quarantined clubs are skipped (idempotent)
 *   - the public club read hides a quarantined URL but shows a validated one
 *   - the club-edit read still returns the quarantined value for operator review
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertClub } from '../fixtures/factories';

const { dbPath } = setTestEnv('3121');

let clubs: typeof import('../../src/db/db').clubs;
let clubContent: typeof import('../../src/db/db').clubContent;
let runExternalUrlBootScan: typeof import('../../src/services/externalUrlBootScan').runExternalUrlBootScan;
let validateExternalUrl: typeof import('../../src/lib/externalUrlValidator').validateExternalUrl;

const CLUB_VALID = 'club_valid_unscanned';
const CLUB_MALWARE = 'club_malware_unscanned';
const CLUB_ALREADY_VALIDATED = 'club_already_validated';
const CLUB_ALREADY_QUARANTINED = 'club_already_quarantined';

const VALID_URL = 'https://example.com/club';
const MALWARE_URL = 'http://malware.testing.google.test/testing/malware/';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const now = new Date().toISOString();

  insertClub(db, { id: CLUB_VALID, name: 'Valid Club', city: 'Acity', country: 'USA' });
  insertClub(db, { id: CLUB_MALWARE, name: 'Malware Club', city: 'Bcity', country: 'USA' });
  insertClub(db, { id: CLUB_ALREADY_VALIDATED, name: 'Validated Club', city: 'Ccity', country: 'USA' });
  insertClub(db, { id: CLUB_ALREADY_QUARANTINED, name: 'Quarantined Club', city: 'Dcity', country: 'USA' });

  const setUrl = db.prepare(`
    UPDATE clubs
    SET external_url = ?, external_url_validated_at = ?,
        external_url_quarantine_reason = ?, updated_at = ?, updated_by = ?
    WHERE id = ?
  `);
  // Two never-scanned (NULL/NULL): the scan processes exactly these.
  setUrl.run(VALID_URL, null, null, now, 'seed', CLUB_VALID);
  setUrl.run(MALWARE_URL, null, null, now, 'seed', CLUB_MALWARE);
  // One already validated, one already quarantined: the scan skips both.
  setUrl.run('https://example.org/already', now, null, now, 'seed', CLUB_ALREADY_VALIDATED);
  setUrl.run('https://example.net/already-bad', null, 'previously rejected', now, 'seed', CLUB_ALREADY_QUARANTINED);
  db.close();

  ({ clubs, clubContent } = await import('../../src/db/db'));
  ({ runExternalUrlBootScan } = await import('../../src/services/externalUrlBootScan'));
  ({ validateExternalUrl } = await import('../../src/lib/externalUrlValidator'));

  const { resetSafeBrowsingAdapterForTests } = await import(
    '../../src/adapters/safeBrowsingAdapter'
  );
  resetSafeBrowsingAdapterForTests();
});

afterAll(() => cleanupTestDb(dbPath));

describe('externalUrlBootScan: seeded club URLs get validated/quarantined', () => {
  it('processes only the two never-scanned club URLs', async () => {
    const result = await runExternalUrlBootScan({ validate: validateExternalUrl });
    expect(result.scanned).toBe(2);
    expect(result.validated).toBe(1);
    expect(result.quarantined).toBe(1);
  });

  it('stamps external_url_validated_at on the valid club', () => {
    const row = clubContent.findClubContentForEdit.get(CLUB_VALID) as {
      external_url_validated_at: string | null;
      external_url_quarantine_reason: string | null;
    };
    expect(row.external_url_validated_at).not.toBeNull();
    expect(row.external_url_quarantine_reason).toBeNull();
  });

  it('stamps external_url_quarantine_reason on the malware club', () => {
    const row = clubContent.findClubContentForEdit.get(CLUB_MALWARE) as {
      external_url_validated_at: string | null;
      external_url_quarantine_reason: string | null;
    };
    expect(row.external_url_validated_at).toBeNull();
    expect(row.external_url_quarantine_reason).not.toBeNull();
  });

  it('hides a quarantined URL from the public club read but shows a validated one', () => {
    const rows = clubs.listOpen.all() as Array<{ club_id: string; external_url: string | null }>;
    const byId = (id: string) => rows.find(r => r.club_id === id);
    expect(byId(CLUB_VALID)?.external_url).toBe(VALID_URL);
    expect(byId(CLUB_MALWARE)?.external_url).toBeNull();
    expect(byId(CLUB_ALREADY_VALIDATED)?.external_url).toBe('https://example.org/already');
    expect(byId(CLUB_ALREADY_QUARANTINED)?.external_url).toBeNull();
  });

  it('still returns the quarantined value to the club-edit read for operator review', () => {
    const row = clubContent.findClubContentForEdit.get(CLUB_MALWARE) as {
      external_url: string | null;
    };
    expect(row.external_url).toBe(MALWARE_URL);
  });

  it('a second boot scan is a no-op (already-stamped club rows are skipped)', async () => {
    const result = await runExternalUrlBootScan({ validate: validateExternalUrl });
    expect(result.scanned).toBe(0);
    expect(result.validated).toBe(0);
    expect(result.quarantined).toBe(0);
  });
});
