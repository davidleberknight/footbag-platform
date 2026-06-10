/**
 * One-shot boot scan for external URLs that bypassed the runtime validator.
 *
 * Some `gallery_external_links` rows enter the database without ever going
 * through the Node URL validator: the curator gallery sidecar seeder
 * (scripts/seed_fh_curator.py) writes rows directly from /curated/galleries/*.json.
 * Those rows land with `validated_at = NULL`. Admin-UI writes through
 * curatorMediaService stamp `validated_at` at accept time.
 *
 * Club `external_url` values share the gap: the club cutover populator writes
 * them directly, so seeded clubs land with `external_url_validated_at = NULL`.
 * The scan covers both surfaces in one pass.
 *
 * The boot scan closes those gaps: at app startup, every never-validated row is
 * run through `validateExternalUrl`. On accept, the validated-at column is
 * stamped (so subsequent boots skip the row). On reject, a quarantine-reason
 * column is stamped: for galleries the public read filters the row out, and for
 * clubs the public read hides the URL. The admin edit surface still sees the
 * flagged value so an operator can replace or remove it.
 *
 * Sequential processing: low row counts (curator galleries are operator-
 * created; seeded clubs are a bounded set), bounded latency, blocks startup so
 * a partial-quarantine state never serves to readers. The validator's 24-hour
 * in-process cache dedupes identical URLs across rows in the same boot.
 *
 * Stub-mode safe: in dev/test the singleton stub returns `safe: true` for
 * everything except the seeded canonical malware test URL, so the scan is
 * effectively a no-op pass that stamps the validated-at column on every
 * untouched row. Tests can either let the real scan run against a stub or
 * inject a different validator via `deps.validate`.
 */
import { media, clubExternalUrlScan } from '../db/db';
import { logger } from '../config/logger';
import { validateExternalUrl } from '../lib/externalUrlValidator';

const BOOT_SCAN_ACTOR = 'boot-scan';

export interface BootScanResult {
  scanned: number;
  validated: number;
  quarantined: number;
}

export interface BootScanDeps {
  validate?: typeof validateExternalUrl;
  now?: () => string;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}

export async function runExternalUrlBootScan(
  deps: BootScanDeps = {},
): Promise<BootScanResult> {
  const validate = deps.validate ?? validateExternalUrl;
  const now = deps.now ?? (() => new Date().toISOString());
  const log =
    deps.log ?? ((message: string, fields?: Record<string, unknown>) => {
      logger.warn(`boot-scan: ${message}`, fields ?? {});
    });

  const galleryRows = media.listGalleryExternalLinksForBootScan.all() as Array<{
    id: string;
    gallery_id: string;
    url: string;
  }>;
  const clubRows = clubExternalUrlScan.listForBootScan.all() as Array<{
    id: string;
    name: string;
    url: string;
  }>;

  const scanned = galleryRows.length + clubRows.length;
  if (scanned === 0) {
    return { scanned: 0, validated: 0, quarantined: 0 };
  }

  let validated = 0;
  let quarantined = 0;

  for (const row of galleryRows) {
    const result = await validate(row.url);
    const stampedAt = now();
    if (result.valid) {
      media.stampGalleryExternalLinkValidated.run(
        stampedAt,
        stampedAt,
        BOOT_SCAN_ACTOR,
        row.id,
      );
      validated += 1;
    } else {
      const reason = result.error ?? 'unknown';
      media.stampGalleryExternalLinkQuarantine.run(
        reason,
        stampedAt,
        BOOT_SCAN_ACTOR,
        row.id,
      );
      log('quarantined gallery external link', {
        id: row.id,
        galleryId: row.gallery_id,
        url: row.url,
        reason,
      });
      quarantined += 1;
    }
  }

  for (const row of clubRows) {
    const result = await validate(row.url);
    const stampedAt = now();
    if (result.valid) {
      clubExternalUrlScan.stampValidated.run(
        stampedAt,
        stampedAt,
        BOOT_SCAN_ACTOR,
        row.id,
      );
      validated += 1;
    } else {
      const reason = result.error ?? 'unknown';
      clubExternalUrlScan.stampQuarantine.run(
        reason,
        stampedAt,
        BOOT_SCAN_ACTOR,
        row.id,
      );
      log('quarantined club external url', {
        id: row.id,
        club: row.name,
        url: row.url,
        reason,
      });
      quarantined += 1;
    }
  }

  log('completed', {
    scanned,
    validated,
    quarantined,
    galleries: galleryRows.length,
    clubs: clubRows.length,
  });

  return { scanned, validated, quarantined };
}
