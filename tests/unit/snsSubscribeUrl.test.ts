/**
 * The confirmation URL an operator is asked to open.
 *
 * A subscription confirmation is the one inbound payload that ends with a human
 * clicking a link, and on a forged confirmation that link is attacker-chosen.
 * The guard logs the URL only when it is really an SNS endpoint over HTTPS and
 * bounded in length; anything else becomes a marker, so the operator is never
 * handed a link the platform cannot vouch for and the log cannot be flooded
 * through a one-megabyte body.
 *
 * The accepted fixture is a real-length URL on purpose. This suite once used a
 * URL ending `Token=abc` as its example of a genuine one, which is 74
 * characters; the bound was set at 300, every URL AWS actually sends is 450-500,
 * and so the guard rejected all of them while the suite stayed green and the
 * subscription could never be confirmed. A fixture that does not resemble the
 * real input proves the shape of a guard and nothing about its calibration.
 */
import { describe, it, expect } from 'vitest';
import { safeSubscribeUrlForLog } from '../../src/lib/snsSignature';

/** An SNS confirmation token is ~320 characters; this one is that length. */
const REAL_TOKEN = 'a'.repeat(320);
const REAL =
  'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription' +
  '&TopicArn=arn:aws:sns:us-east-1:000000000000:footbag-staging-alarms' +
  `&Token=${REAL_TOKEN}`;

describe('safeSubscribeUrlForLog', () => {
  it('passes a genuine SNS confirmation URL through unchanged', () => {
    // Real length, not a toy: this is the case the guard exists to serve, and
    // the one a too-low bound silently breaks.
    expect(REAL.length).toBeGreaterThan(400);
    expect(safeSubscribeUrlForLog(REAL)).toBe(REAL);
    expect(safeSubscribeUrlForLog('https://sns.ap-southeast-2.amazonaws.com/x')).toBe(
      'https://sns.ap-southeast-2.amazonaws.com/x',
    );
  });

  it('accepts a URL longer than any AWS sends, so the bound has real headroom', () => {
    // A bound set close to the observed length breaks on the first region or
    // topic name that pushes a URL past it, and breaks silently.
    const longer = `https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=${'b'.repeat(900)}`;
    expect(longer.length).toBeGreaterThan(900);
    expect(safeSubscribeUrlForLog(longer)).toBe(longer);
  });

  it('rejects a look-alike host', () => {
    expect(safeSubscribeUrlForLog('https://sns.example.com/confirm?token=t')).toBe('(rejected)');
    expect(safeSubscribeUrlForLog('https://sns.us-east-1.amazonaws.com.evil.test/x')).toBe('(rejected)');
    expect(safeSubscribeUrlForLog('https://evil.test/sns.us-east-1.amazonaws.com')).toBe('(rejected)');
  });

  it('rejects a non-HTTPS scheme, including one that would run on click', () => {
    expect(safeSubscribeUrlForLog('http://sns.us-east-1.amazonaws.com/x')).toBe('(rejected)');
    expect(safeSubscribeUrlForLog('javascript:alert(1)')).toBe('(rejected)');
    expect(safeSubscribeUrlForLog('file:///etc/passwd')).toBe('(rejected)');
  });

  it('rejects a URL long enough to be a log-flooding primitive', () => {
    // The request body cap is a megabyte, so without a bound a forged
    // confirmation can put a megabyte of attacker-chosen text on a log line.
    const flood = `https://sns.us-east-1.amazonaws.com/?t=${'a'.repeat(50_000)}`;
    expect(safeSubscribeUrlForLog(flood)).toBe('(rejected)');
  });

  it('rejects just past the bound, so the bound is a real edge and not a guess', () => {
    const base = 'https://sns.us-east-1.amazonaws.com/?t=';
    const atLimit = base + 'a'.repeat(2048 - base.length);
    const overLimit = `${atLimit}a`;
    expect(atLimit.length).toBe(2048);
    expect(safeSubscribeUrlForLog(atLimit)).toBe(atLimit);
    expect(safeSubscribeUrlForLog(overLimit)).toBe('(rejected)');
  });

  it('rejects anything that is not a string, since the field comes off an untrusted envelope', () => {
    expect(safeSubscribeUrlForLog(undefined)).toBe('(rejected)');
    expect(safeSubscribeUrlForLog(null)).toBe('(rejected)');
    expect(safeSubscribeUrlForLog(42)).toBe('(rejected)');
    expect(safeSubscribeUrlForLog({ toString: () => REAL })).toBe('(rejected)');
    expect(safeSubscribeUrlForLog('not a url at all')).toBe('(rejected)');
  });
});
