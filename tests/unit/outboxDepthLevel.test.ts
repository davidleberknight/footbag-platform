/**
 * The outbox depth log level: only a backlog the alarm would act on is a
 * warning, and the worker's threshold stays the one both environments' backlog
 * alarms fire on.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OUTBOX_BACKLOG_ALARM_DEPTH, outboxDepthLevel } from '../../src/lib/outboxDepthLevel';

describe('outboxDepthLevel', () => {
  // A normal drain of a few messages printed as a warning is noise an operator
  // learns to ignore; a backlog past the alarm threshold must reach production logs.
  it('warns only above the backlog alarm threshold', () => {
    expect(outboxDepthLevel(0)).toBe('debug');
    expect(outboxDepthLevel(3)).toBe('debug');
    expect(outboxDepthLevel(OUTBOX_BACKLOG_ALARM_DEPTH)).toBe('debug');
    expect(outboxDepthLevel(OUTBOX_BACKLOG_ALARM_DEPTH + 1)).toBe('warn');
  });

  // If the alarm threshold moved without the worker's, depths between the two
  // would log at debug, never reach the metric, and the alarm would never fire.
  it('matches the outbox backlog alarm threshold in both environments', () => {
    for (const env of ['staging', 'production']) {
      const tf = fs.readFileSync(path.resolve(__dirname, `../../terraform/${env}/cloudwatch.tf`), 'utf8');
      const block = tf.split('resource "aws_cloudwatch_metric_alarm" "outbox_backlog"')[1] ?? '';
      const threshold = /threshold\s*=\s*(\d+)/.exec(block)?.[1];
      expect(Number(threshold), `${env} outbox_backlog threshold`).toBe(OUTBOX_BACKLOG_ALARM_DEPTH);
      expect(block, `${env} outbox_backlog compares greater-than`).toMatch(/comparison_operator\s*=\s*"GreaterThanThreshold"/);
    }
  });
});
