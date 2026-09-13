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
 *
 * PROVENANCE, and the limit of what these prove. This shape is written from the
 * provider's documentation, not captured from a delivery. Nobody here has held a
 * real envelope against it. A real notification also carries Timestamp,
 * SignatureVersion, Signature, SigningCertURL, UnsubscribeURL, and where the
 * publisher sets them Subject and MessageAttributes; the alarm payload likewise
 * carries AlarmArn, AWSAccountId, OldStateValue, Trigger and
 * AlarmConfigurationUpdatedTimestamp beyond the keys built below.
 *
 * Those omissions are safe only for as long as nothing reads them, and the
 * services driven by these builders do parse this JSON. So the claim above about
 * the two transports delivering identical bodies is a reasonable belief rather
 * than evidence: it has not been checked against a delivery either.
 *
 * When someone next has a real envelope in hand — the smoke tier reaches live
 * SNS, so a run there is the natural moment — capture one and reconcile it here,
 * structure untouched, in the manner tests/fixtures/stripeGoldenPayloads.ts sets
 * out. Do not add the missing fields from memory: a fixture enlarged by
 * guesswork reads as evidence while being exactly as unverified as this one.
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
