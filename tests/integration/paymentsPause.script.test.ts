/**
 * scripts/payments-pause.sh, the fast stop for new payments, driven end to end
 * through a stand-in ssh client against a database built from the real schema.
 * The case set is shared by the three runtime levers; see the harness.
 *
 * The clear state reads "NOT PAUSED" and never "LIVE" or "accepted": this lever
 * only decides whether a checkout is refused, while the separate arming switch
 * decides whether the live payment adapter boots at all. Before go-live the
 * correct state is this lever clear and payments dark, and a line saying
 * donations are being accepted describes that state as its opposite to anyone
 * reading a production host.
 */
import { describePauseLever } from '../fixtures/pauseLeverHarness';
import { createScratchDir } from '../fixtures/scratchDir';

describePauseLever(
  {
    script: 'scripts/payments-pause.sh',
    configKey: 'payments_paused',
    label: 'payments-pause',
    pausedLine: 'payments on staging: PAUSED',
    clearLine: 'payments on staging: NOT PAUSED',
    clearMustNotSay: [/\bLIVE\b/, /being accepted/i],
  },
  createScratchDir,
);
