/**
 * Test-clock customer link entry point. Links a test-mode Stripe customer,
 * created attached to a test clock, to the member named by slug, through the
 * payment service, so the member's next recurring donation renews on the clock.
 *
 * Run inside the web container by `scripts/link-stripe-test-clock.sh`, which
 * creates the clock and the customer at the provider first. The service refuses
 * unless this process holds a test-mode payment key, so it refuses on any host
 * where real money could move. `--check` runs every refusal and writes nothing.
 *
 * The LINK: line on stdout is the machine-readable outcome the operator script
 * reads.
 *
 * Usage:
 *   node dist/runLinkTestClockCustomer.js --member <slug> --check
 *   node dist/runLinkTestClockCustomer.js --member <slug> --customer cus_...
 */
import { paymentService } from './services/paymentService';
import { ServiceError } from './services/serviceErrors';
import { logger } from './config/logger';

function link(line: string): void {
  process.stdout.write(`LINK: ${line}\n`);
}

export async function runLinkTestClockCustomer(opts: {
  memberSlug: string;
  stripeCustomerId: string | null;
  check: boolean;
}): Promise<number> {
  try {
    const result = await paymentService.linkTestClockCustomer(opts);
    if (result.status === 'would_link') {
      link(`CHECK member=${result.memberId}`);
    } else if (result.status === 'linked') {
      link(`LINKED member=${result.memberId} customer=${result.stripeCustomerId}`);
    } else {
      link(`ALREADY member=${result.memberId} customer=${result.stripeCustomerId}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof ServiceError) {
      link(`REFUSED ${err.message}`);
      return 1;
    }
    throw err;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let memberSlug = '';
  let stripeCustomerId: string | null = null;
  let check = false;
  let bad = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--member') {
      memberSlug = args[i + 1] ?? '';
      i += 1;
    } else if (args[i] === '--customer') {
      stripeCustomerId = args[i + 1] ?? '';
      i += 1;
    } else if (args[i] === '--check') {
      check = true;
    } else {
      process.stderr.write(`unknown arg: ${args[i]}\n`);
      bad = true;
    }
  }
  if (bad || !memberSlug || (!check && !stripeCustomerId)) {
    process.stderr.write(
      'Usage: runLinkTestClockCustomer --member <slug> (--check | --customer cus_...)\n',
    );
    process.exit(2);
  }
  runLinkTestClockCustomer({ memberSlug, stripeCustomerId, check })
    .then((code) => process.exit(code))
    .catch((err) => {
      logger.error('test-clock customer link failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
