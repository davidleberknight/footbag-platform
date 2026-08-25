/**
 * Builders for the SNS envelope both notification feeds carry.
 *
 * The envelope is the same whichever transport delivers it: a queue with raw
 * message delivery off hands over the identical JSON an HTTPS endpoint would
 * have been posted. Keeping one builder here is what lets a queue suite and a
 * route suite assert against the same payload shape rather than two hand-copied
 * approximations that can drift apart.
 *
 * The topic ARNs match the values the shared test environment configures, so an
 * envelope built with the defaults is one the feed accepts; a suite proving a
 * spoofed topic is refused passes its own.
 */

export const SES_FEEDBACK_TEST_TOPIC = 'arn:aws:sns:us-east-1:000:t';
export const ALARM_TEST_TOPIC = 'arn:aws:sns:us-east-1:000:alarms';

/** A notification carrying an SES bounce or complaint payload. */
export function sesFeedbackEnvelope(
  message: Record<string, unknown>,
  opts: { messageId?: string; topicArn?: string } = {},
): string {
  const envelope: Record<string, unknown> = {
    Type: 'Notification',
    TopicArn: opts.topicArn ?? SES_FEEDBACK_TEST_TOPIC,
    Message: JSON.stringify(message),
  };
  if (opts.messageId !== undefined) envelope.MessageId = opts.messageId;
  return JSON.stringify(envelope);
}

/** A notification carrying a CloudWatch alarm state change. */
export function alarmEnvelope(
  message: Record<string, unknown>,
  opts: { messageId?: string; topicArn?: string } = {},
): string {
  const envelope: Record<string, unknown> = {
    Type: 'Notification',
    TopicArn: opts.topicArn ?? ALARM_TEST_TOPIC,
    Message: JSON.stringify(message),
  };
  if (opts.messageId !== undefined) envelope.MessageId = opts.messageId;
  return JSON.stringify(envelope);
}

/** The CloudWatch state-change payload an alarm notification wraps. */
export function alarmStateChange(
  alarmName: string,
  newState: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA',
  opts: { reason?: string; description?: string; stateChangeTime?: string } = {},
): Record<string, unknown> {
  return {
    AlarmName: alarmName,
    NewStateValue: newState,
    NewStateReason: opts.reason ?? 'threshold crossed',
    AlarmDescription: opts.description ?? 'a monitored condition',
    StateChangeTime: opts.stateChangeTime ?? '2026-08-25T00:00:00.000+0000',
    Region: 'US East (N. Virginia)',
  };
}
