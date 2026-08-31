/**
 * Outbox send-path smoke entry point (validation gate G10). Enqueues one real
 * email through the communication service, the same enqueue every
 * transactional send takes, then watches the row until the worker drains it,
 * so one green run proves enqueue, worker, adapter and provider together. It
 * sends whatever the environment's configured adapter sends: on an armed
 * production that is live SES, so the recipient must be an operator-held
 * inbox or the SES success simulator.
 *
 * This process only enqueues and polls; the worker must be running or the
 * poll times out with the row still pending.
 *
 * The GATE: line on stdout is the machine-readable outcome; the pre-cutover
 * orchestrator aggregates it like every other gate script's.
 *
 * Usage:
 *   node dist/runOutboxSmoke.js --to <address> [--timeout-seconds 90]
 *   npx tsx src/runOutboxSmoke.ts --to success@simulator.amazonses.com
 */
import { getCommunicationService } from './services/communicationService';
import { outbox } from './db/db';
import { logger } from './config/logger';
import { initDataOrigin } from './services/dataOriginService';

export interface OutboxSmokeOptions {
  to: string;
  timeoutSeconds?: number;
  pollMs?: number;
}

interface OutboxStatusRow {
  status: string;
  retry_count: number;
  last_error: string | null;
  sent_at: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function gate(line: string): void {
  process.stdout.write(`GATE: G10-OUTBOX ${line}\n`);
}

export async function runOutboxSmoke(opts: OutboxSmokeOptions): Promise<number> {
  const timeoutSeconds = opts.timeoutSeconds ?? 90;
  const pollMs = opts.pollMs ?? 2000;
  await initDataOrigin();

  const outcome = getCommunicationService().enqueue({
    audience: { kind: 'address', email: opts.to, memberId: null },
    subject: 'footbag outbox send-path smoke',
    bodyText: 'Outbox send-path validation (gate G10). Safe to ignore.',
    idempotencyKey: `outbox-smoke-${Date.now()}-${process.pid}`,
  });
  if (outcome.enqueued !== 1 || outcome.ids.length !== 1) {
    gate(
      `FAIL: enqueue wrote ${outcome.enqueued} rows ` +
        `(suppressed=${outcome.suppressed}, duplicates=${outcome.duplicates})`,
    );
    return 1;
  }
  const id = outcome.ids[0];
  logger.info('outbox smoke: enqueued', { id, to: opts.to });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    const row = outbox.selectStatusById.get(id) as OutboxStatusRow | undefined;
    if (!row) {
      gate(`FAIL: row ${id} disappeared before reaching a terminal status`);
      return 1;
    }
    if (row.status === 'sent') {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      gate(`PASS: row ${id} sent after ${seconds}s; confirm arrival in the ${opts.to} inbox`);
      return 0;
    }
    if (row.status === 'dead_letter' || row.status === 'manual_review') {
      gate(
        `FAIL: row ${id} reached ${row.status} after ${row.retry_count} attempts: ` +
          `${row.last_error ?? 'no error recorded'}`,
      );
      return 1;
    }
    await sleep(pollMs);
  }
  const last = outbox.selectStatusById.get(id) as OutboxStatusRow | undefined;
  gate(
    `FAIL: row ${id} still '${last?.status ?? 'missing'}' after ${timeoutSeconds}s ` +
      `(retry_count=${last?.retry_count ?? 0}, last_error=${last?.last_error ?? 'none'}); ` +
      'is the worker running?',
  );
  return 1;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let to = '';
  let timeoutSeconds: number | undefined;
  let bad = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--to') {
      to = args[i + 1] ?? '';
      i += 1;
    } else if (args[i] === '--timeout-seconds') {
      timeoutSeconds = Number(args[i + 1]);
      i += 1;
    } else {
      process.stderr.write(`unknown arg: ${args[i]}\n`);
      bad = true;
    }
  }
  if (bad || !to || (timeoutSeconds !== undefined && !Number.isFinite(timeoutSeconds))) {
    process.stderr.write('Usage: runOutboxSmoke --to <address> [--timeout-seconds 90]\n');
    process.exit(2);
  }
  runOutboxSmoke({ to, timeoutSeconds })
    .then((code) => process.exit(code))
    .catch((err) => {
      logger.error('outbox smoke failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
