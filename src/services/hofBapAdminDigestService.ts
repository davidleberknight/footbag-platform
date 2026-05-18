/**
 * SYS_HoF_BAP_Admin_Digest daily worker service.
 *
 * Scans the prior 24 hours of `member_tier_grants` rows that were written
 * with `reason_code = 'legacy.claim_tier_grant'` and whose member carries
 * an HoF or BAP honor flag. While inside the post-cutover monitoring
 * window, enqueues a single mailing-list email to the `admin-alerts`
 * list summarizing each match by row identifier and decision-relevant
 * attributes only (no PII). Outside the window, no-op.
 *
 * Configuration (read from `system_config_current`):
 *   - `hof_bap_digest_cutover_at_iso`   ISO datetime anchoring the window.
 *                                        Absent or empty disables the job.
 *   - `hof_bap_digest_window_days`      window length in days from cutover;
 *                                        defaults to 56.
 *
 * Idempotency: the idempotency key for the mailing-list enqueue includes
 * the current UTC date (`hof_bap_digest:<yyyy-mm-dd>`), so a same-day
 * rerun does not duplicate sends.
 *
 * Payload shape: row identifiers and decision-relevant attributes only.
 * The digest does not include login_email or other contact fields per
 * GOVERNANCE; admin recipients receive enough to look up each row in the
 * admin tooling.
 */

import { hofBapDigest, systemConfig } from '../db/db';
import { getCommunicationService } from './communicationService';
import { readIntConfig } from './configReader';
import { logger } from '../config/logger';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAILING_LIST_SLUG = 'admin-alerts';
const DIGEST_SUBJECT_PREFIX = 'IFPA admin digest';

export interface HofBapDigestRunResult {
  status: 'window_disabled' | 'outside_window' | 'no_matches' | 'enqueued';
  claim_count: number;
  enqueued: number;
  duplicates: number;
  monitoring_window_remaining_days: number;
}

export interface HofBapDigestRunOpts {
  now?: Date;
}

interface DigestRow {
  tier_grant_id: string;
  granted_at: string;
  member_id: string;
  new_tier_status: string;
  display_name: string;
  legacy_member_id: string | null;
  is_hof: number;
  is_bap: number;
}

function readCutoverAtIso(): string | null {
  const row = systemConfig.getValueByKey.get('hof_bap_digest_cutover_at_iso') as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  const raw = row.value_json.trim().replace(/^"|"$/g, '');
  if (raw === '' || raw === 'null') return null;
  return raw;
}

function fmtFlags(isHof: number, isBap: number): string {
  const flags: string[] = [];
  if (isHof === 1) flags.push('HoF');
  if (isBap === 1) flags.push('BAP');
  return flags.join(' + ');
}

function buildBodyText(rows: DigestRow[], remainingDays: number): string {
  const header =
    `Silent auto-link claims with HoF or BAP honor flag in the prior 24 hours.\n\n`;
  const renderedRows = rows
    .map((r) =>
      `- ${r.granted_at} | member=${r.member_id}` +
      ` | legacy=${r.legacy_member_id ?? '(none)'}` +
      ` | tier_grant=${r.tier_grant_id}` +
      ` | name="${r.display_name}"` +
      ` | flags=${fmtFlags(r.is_hof, r.is_bap)}` +
      ` | new_tier=${r.new_tier_status}`,
    )
    .join('\n');
  const footer =
    `\n\nMonitoring window remaining: ${remainingDays} day(s).\n\n` +
    `This digest covers only row identifiers and decision-relevant attributes.` +
    ` No member contact fields are included.\n\n-- IFPA platform`;
  return header + renderedRows + footer;
}

export function runDailyPass(opts: HofBapDigestRunOpts = {}): HofBapDigestRunResult {
  const now = opts.now ?? new Date();
  const cutoverIso = readCutoverAtIso();

  // Default zero counts; refined below if the window is active.
  const zero: Omit<HofBapDigestRunResult, 'status'> = {
    claim_count: 0,
    enqueued: 0,
    duplicates: 0,
    monitoring_window_remaining_days: 0,
  };

  if (!cutoverIso) {
    logger.info('SYS_HoF_BAP_Admin_Digest: cutover anchor unset, job disabled');
    return { status: 'window_disabled', ...zero };
  }

  const cutoverDate = new Date(cutoverIso);
  if (Number.isNaN(cutoverDate.getTime())) {
    logger.warn('SYS_HoF_BAP_Admin_Digest: cutover anchor unparseable, job disabled', {
      cutover_at_iso: cutoverIso,
    });
    return { status: 'window_disabled', ...zero };
  }

  const windowDays = readIntConfig('hof_bap_digest_window_days', 56);
  const windowEndMs = cutoverDate.getTime() + windowDays * MS_PER_DAY;
  const nowMs = now.getTime();

  if (nowMs >= windowEndMs) {
    return { status: 'outside_window', ...zero };
  }
  if (nowMs < cutoverDate.getTime()) {
    // Job ticked before cutover; nothing to report yet.
    return { status: 'outside_window', ...zero };
  }

  const remainingDays = Math.max(0, Math.floor((windowEndMs - nowMs) / MS_PER_DAY));
  const lookbackEndIso = now.toISOString();
  const lookbackStartIso = new Date(nowMs - MS_PER_DAY).toISOString();

  const rows = hofBapDigest.listRecentHonorsClaims.all(
    lookbackStartIso,
    lookbackEndIso,
  ) as DigestRow[];

  if (rows.length === 0) {
    return {
      status: 'no_matches',
      claim_count: 0,
      enqueued: 0,
      duplicates: 0,
      monitoring_window_remaining_days: remainingDays,
    };
  }

  const day = lookbackEndIso.slice(0, 10);
  const subject = `${DIGEST_SUBJECT_PREFIX}: ${rows.length} HoF/BAP claim(s) in last 24h`;
  const bodyText = buildBodyText(rows, remainingDays);

  const comms = getCommunicationService();
  const result = comms.enqueueMailingListEmail({
    mailingListSlug:      MAILING_LIST_SLUG,
    subject,
    bodyText,
    idempotencyKeyPrefix: `hof_bap_digest:${day}`,
  });

  return {
    status: 'enqueued',
    claim_count: rows.length,
    enqueued: result.enqueued,
    duplicates: result.duplicates,
    monitoring_window_remaining_days: remainingDays,
  };
}
