/**
 * Record that ten rulings became the tricks they already are.
 *
 * Ten names were promoted in August through the committed-file pipeline, before
 * the curation funnel existed. That route had no way to touch the ruling record,
 * so each ruling still reads as an open decision while the trick it produced has
 * been live ever since. Nothing on a page is wrong; the record is missing the
 * link that says which trick each name became.
 *
 * This is a one-time repair of that record and nothing else. It creates no trick,
 * changes no trick, and moves no ownership: the ten belong to the committed
 * inputs and stay there. Publishing them through the funnel instead would create
 * exactly the ownership conflict the refresh preflight exists to refuse, because
 * the committed inputs still carry all ten names.
 *
 * The ten pairs live here rather than in the service, because they are this
 * repair's subject rather than a rule about how reconciliation works. The service
 * validates any pair it is given; only this file knows which ten are the ones.
 *
 * Every pair is checked before any of them is written. A batch that reconciled
 * five and then found the sixth had drifted would leave the record in a state
 * nobody chose, and the drift itself would be the thing worth stopping for.
 *
 * Usage:
 *   npx tsx freestyle/scripts/reconcile_historical_publications.ts \
 *     --actor <member-id> [--db <path>] [--dry-run]
 *
 * The actor is the curator the repair is recorded against and must be supplied;
 * there is no system pseudo-curator here, because the audit trail should name
 * whoever decided this repair was right.
 */
import 'dotenv/config';
import path from 'node:path';

/**
 * The ten, by the ruling's candidate id and the canonical trick it produced.
 * Diagnosed against the committed ledger and the built dictionary; each ruling's
 * normalised name equals its trick's canonical name folded the same way, which
 * the service re-checks before it writes.
 */
const HISTORICAL_PAIRS: readonly { candidateId: string; slug: string }[] = [
  { candidateId: 'ev-3233574d09cba239', slug: 'drifter_swirl' },
  { candidateId: 'ev-668be8854e7c66fe', slug: 'nemesis_swirl' },
  { candidateId: 'ev-0a3228b1e762a6c5', slug: 'ripwalk_swirl' },
  { candidateId: 'ev-c71200f21f5072b7', slug: 'sidewalk_swirl' },
  { candidateId: 'ev-4221e5696d208548', slug: 'butterfly_reverse_swirl' },
  { candidateId: 'ev-cb534a88b0b6e9cb', slug: 'barfly_reverse_swirl' },
  { candidateId: 'ev-bdd9820dbfaea6d5', slug: 'paradon_reverse_swirl' },
  { candidateId: 'ev-d79742b9ee375ab2', slug: 'stepping_butterfly_reverse_swirl' },
  { candidateId: 'ev-2f9675dc69e02f79', slug: 'butterfly_flapper' },
  { candidateId: 'ev-bfc45c5cbfd8cb99', slug: 'symposium_whirling_flapper' },
];

/** The shape each target must still have for this to be the repair it was. */
const EXPECTED_OWNER = 'expert-additions';

interface Args { db: string | undefined; actor: string; dryRun: boolean }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const actor = get('--actor');
  if (!actor) {
    throw new Error(
      'Supply the curator this repair is recorded against: --actor <member-id>. '
      + 'The audit trail names whoever decided it was right, so there is no '
      + 'anonymous option here.',
    );
  }
  return { db: get('--db'), actor, dryRun: argv.includes('--dry-run') };
}

async function main(): Promise<number> {
  const args = parseArgs();
  if (args.db) {
    process.env.FOOTBAG_DB_PATH = path.resolve(args.db);
  }

  const { account, freestyleTricks, freestyleEvAdjudications } = await import('../../src/db/db');
  const { freestyleCurationService } = await import('../../src/services/freestyleCurationService');

  // The active-member view already excludes deleted and purged accounts, so a
  // row here is somebody who could have done this through the application.
  const actor = account.getIsAdmin.get(args.actor) as { is_admin: number } | undefined;
  if (!actor) {
    console.error(`ERROR: no active member "${args.actor}".`);
    return 2;
  }
  if (actor.is_admin !== 1) {
    console.error(`ERROR: "${args.actor}" is not an administrator, so this repair `
      + 'cannot be recorded against them.');
    return 2;
  }

  // ── Preflight: every pair, before any write ──────────────────────────────
  const problems: string[] = [];
  const pending: { candidateId: string; slug: string }[] = [];

  for (const pair of HISTORICAL_PAIRS) {
    const trick = freestyleTricks.getForCurationBySlug.get(pair.slug) as
      { slug: string; canonical_name: string; is_active: number } | undefined;
    const ruling = freestyleEvAdjudications.getForAuthoring.get(pair.candidateId) as
      { candidate_id: string; submitted_name: string; published_trick_slug: string | null }
      | undefined;
    const owner = trick
      ? (freestyleTricks.originProducerBySlug.get(pair.slug) as
          { trick_origin_producer: string | null }).trick_origin_producer
      : null;

    if (!ruling) {
      problems.push(`${pair.candidateId}: no such ruling`);
      continue;
    }
    if (!trick) {
      problems.push(`${pair.slug}: no such trick`);
      continue;
    }
    if (trick.is_active !== 1) {
      problems.push(`${pair.slug}: not active`);
    }
    if (owner !== EXPECTED_OWNER) {
      problems.push(`${pair.slug}: owned by ${owner ?? 'nobody'}, expected ${EXPECTED_OWNER}`);
    }
    if (ruling.published_trick_slug !== null && ruling.published_trick_slug !== pair.slug) {
      problems.push(`${pair.candidateId}: already recorded against `
        + `${ruling.published_trick_slug}`);
    }
    pending.push(pair);
  }

  if (problems.length > 0) {
    console.error('ERROR: the ten are not in the shape this repair was diagnosed '
      + 'against, so nothing was written.');
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nEach of these was true when the repair was written. Something has '
      + 'changed since, and what changed matters more than finishing the batch.');
    return 1;
  }

  console.log(`Preflight: ${pending.length} rulings, every trick present, active and `
    + `owned by ${EXPECTED_OWNER}.`);
  if (args.dryRun) {
    for (const p of pending) console.log(`  would reconcile ${p.candidateId} -> ${p.slug}`);
    console.log('\nDry run. Nothing was written.');
    return 0;
  }

  // ── Reconcile ────────────────────────────────────────────────────────────
  let reconciled = 0;
  let already = 0;
  for (const pair of pending) {
    const outcome = freestyleCurationService.reconcileHistoricalPublication(
      pair.candidateId, pair.slug, args.actor);
    if (outcome === 'already') {
      already += 1;
      console.log(`  ${pair.slug}: already recorded, nothing written`);
    } else {
      reconciled += 1;
      console.log(`  ${pair.slug}: recorded against ${pair.candidateId}`);
    }
  }

  console.log(`\nReconciled ${reconciled}, already recorded ${already}. `
    + 'No trick row was created or changed.');
  return 0;
}

main().then((code) => process.exit(code)).catch((err: unknown) => {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
