/**
 * scripts/outbound-mail-pause.sh, the fast stop for all outbound mail, driven
 * end to end through a stand-in ssh client against a database built from the
 * real schema. The case set is shared by the three runtime levers; see the
 * harness.
 */
import { describePauseLever } from '../fixtures/pauseLeverHarness';
import { createScratchDir } from '../fixtures/scratchDir';

describePauseLever(
  {
    script: 'scripts/outbound-mail-pause.sh',
    configKey: 'email_outbox_paused',
    label: 'outbound-mail-pause',
    pausedLine: 'outbound mail on staging: PAUSED',
    clearLine: 'outbound mail on staging: DRAINING',
  },
  createScratchDir,
);
