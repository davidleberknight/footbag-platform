import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createLogger } from '../../src/config/logger';

// Every application log line passes through createLogger's write, so these
// cases prove the logging-hygiene rule (no raw email, token, password or
// secret in the log) for every caller at once. Planted secrets are built at
// run time so no secret-shaped literal sits in the source tree.
const EMAIL = 'player.one@example.com';
const OTHER_EMAIL = 'second.player@example.org';
const JWT_HEADER = Buffer.from('{"alg":"HS256"}').toString('base64url');
const JWT = [
  JWT_HEADER,
  Buffer.from('{"sub":"member-1"}').toString('base64url'),
  createHash('sha256').update('planted signature').digest('base64url'),
].join('.');
// Same shape as a minted account token (32 bytes, base64url), fixed so every
// run plants the same value.
const ACCOUNT_TOKEN = createHash('sha256').update('planted account token').digest('base64url');
const STRIPE_KEY = ['sk', 'test', 'x'.repeat(24)].join('_');
const WEBHOOK_SECRET = ['whsec', 'y'.repeat(32)].join('_');
const AWS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const PASSWORD = 'hunter2-correct-horse';
const SESSION_COOKIE = 'footbag_session=abc.def.ghi';
const HEX_HASH = createHash('sha256').update('anything').digest('hex');
// Both are exactly the account-token length, so only the case rule keeps them.
const MEMBER_ID = 'member_3f2a9c4e-8b1d-4e6f-9a0b-1c2d3e4f5a6b';
const LONG_SLUG = 'world-footbag-championships-2024-montreal-q';

const PLANTED = [EMAIL, OTHER_EMAIL, JWT, ACCOUNT_TOKEN, STRIPE_KEY, WEBHOOK_SECRET, AWS_KEY_ID, PASSWORD, SESSION_COOKIE];

function capture(pretty: boolean, emit: (log: ReturnType<typeof createLogger>) => void): string {
  const lines: string[] = [];
  const out = vi.spyOn(console, 'log').mockImplementation((line: unknown) => { lines.push(String(line)); });
  const err = vi.spyOn(console, 'error').mockImplementation((line: unknown) => { lines.push(String(line)); });
  try {
    emit(createLogger('debug', pretty));
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return lines.join('\n');
}

function emitPlanted(log: ReturnType<typeof createLogger>): void {
  log.info(`welcome mail queued for ${EMAIL}`, { memberId: 'mbr_123', recipient: OTHER_EMAIL });
  log.warn('session check', { jwt: JWT, nested: { link: `/verify/${ACCOUNT_TOKEN}` } });
  log.error('stripe call failed', {
    err: new Error(`key ${STRIPE_KEY} rejected for ${EMAIL}`),
    webhook: WEBHOOK_SECRET,
    aws: [AWS_KEY_ID],
  });
  log.debug('sign-in attempt', { password: PASSWORD, headers: { Cookie: SESSION_COOKIE } });
}

afterEach(() => { vi.restoreAllMocks(); });

describe.each([
  ['JSON (staging and production)', false],
  ['human-readable (development)', true],
])('logger redaction, %s format', (_name, pretty) => {
  it('writes no planted email, token, password or secret to the log', () => {
    // Defect caught: a caller that hands the logger a raw email, token or
    // password lands it in CloudWatch, readable for the log group's retention.
    const output = capture(pretty, emitPlanted);
    expect(output).not.toBe('');
    for (const secret of PLANTED) {
      expect(output).not.toContain(secret);
    }
    // The whole JWT goes, not only its token-shaped signature segment.
    expect(output).not.toContain(JWT_HEADER);
    expect(output).toContain('[redacted-email]');
    expect(output).toContain('[redacted]');
  });

  it('keeps a logged error readable, with its secrets redacted', () => {
    // Defect caught: an Error logged as an empty object, so the operator loses
    // the failure text, or logged whole with the email and key still in it.
    const output = capture(pretty, emitPlanted);
    expect(output).toContain('Error: key [redacted] rejected for [redacted-email]');
  });

  it('keeps ordinary fields an operator needs', () => {
    // Defect caught: redaction so broad it erases member ids, template merge
    // field names or stored hashes, leaving the log useless for diagnosis.
    const output = capture(pretty, (log) => {
      log.warn('email template merge token unresolved; left literal', {
        memberId: MEMBER_ID,
        token: 'first_name',
        hash: HEX_HASH,
        slug: LONG_SLUG,
      });
    });
    expect(MEMBER_ID).toHaveLength(43);
    expect(LONG_SLUG).toHaveLength(43);
    expect(output).toContain(MEMBER_ID);
    expect(output).toContain(LONG_SLUG);
    expect(output).toContain('first_name');
    expect(output).toContain(HEX_HASH);
  });
});
