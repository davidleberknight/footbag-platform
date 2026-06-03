/**
 * One-shot boot scan for external URLs that bypassed the runtime validator.
 *
 * Some `gallery_external_links` rows enter the database without ever going
 * through the Node URL validator: the curator gallery sidecar seeder
 * (scripts/seed_fh_curator.py) writes rows directly from /curated/galleries/*.json.
 * Those rows land with `validated_at = NULL`. Admin-UI writes through
 * curatorMediaService stamp `validated_at` at accept time.
 *
 * The boot scan closes the seeder gap: at app startup, every never-validated
 * row is run through `validateExternalUrl`. On accept, `validated_at` is
 * stamped (so subsequent boots skip the row). On reject, `quarantine_reason`
 * is stamped (so public render filters the row out via
 * `listGalleryExternalLinksForPublic`); the admin curator-edit page surfaces
 * the row with a warning so the operator can replace or remove it.
 *
 * Sequential processing: low row counts (curator galleries are operator-
 * created), bounded latency, blocks startup so a partial-quarantine state
 * never serves to readers. The validator's 24-hour in-process cache
 * dedupes identical URLs across rows in the same boot.
 *
 * Stub-mode safe: in dev/test the singleton stub returns `safe: true` for
 * everything except the seeded canonical malware test URL, so the scan is
 * effectively a no-op pass that stamps `validated_at` on every untouched
 * row. Tests can either let the real scan run against a stub or inject a
 * different validator via `deps.validate`.
 */
import { media } from '../db/db';
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

  const rows = media.listGalleryExternalLinksForBootScan.all() as Array<{
    id: string;
    gallery_id: string;
    url: string;
  }>;

  if (rows.length === 0) {
    return { scanned: 0, validated: 0, quarantined: 0 };
  }

  let validated = 0;
  let quarantined = 0;

  for (const row of rows) {
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

  log('completed', {
    scanned: rows.length,
    validated,
    quarantined,
  });

  return { scanned: rows.length, validated, quarantined };
}
