/**
 * scripts/bulk-send-pause.sh, the stop for a bulk send going wrong, driven end
 * to end through a stand-in ssh client against a database built from the real
 * schema. The case set is shared by the three runtime levers; see the harness.
 */
import { describePauseLever } from '../fixtures/pauseLeverHarness';
import { createScratchDir } from '../fixtures/scratchDir';

describePauseLever(
  {
    script: 'scripts/bulk-send-pause.sh',
    configKey: 'bulk_send_paused',
    label: 'bulk-send-pause',
    pausedLine: 'bulk sending on staging: STOPPED',
    clearLine: 'bulk sending on staging: RELEASING',
  },
  createScratchDir,
);
