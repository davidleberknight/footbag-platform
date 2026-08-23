/**
 * One-click unsubscribe tokens. The token travels in a header a mail client
 * acts on without the recipient being signed in, so it has to prove which
 * member is asking and what they are leaving, and prove nothing else. These
 * cover the round trip and the four ways a token is not one this deployment
 * minted.
 */
import { describe, it, expect, beforeAll } from 'vitest';

process.env.SESSION_SECRET  = 'unsubscribe-token-test-secret';
process.env.NODE_ENV        = 'test';
process.env.PUBLIC_BASE_URL = 'http://localhost:4076';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mod: typeof import('../../src/lib/unsubscribeToken');

beforeAll(async () => {
  mod = await import('../../src/lib/unsubscribeToken');
});

describe('unsubscribe token', () => {
  it('round-trips a list target', () => {
    const token = mod.mintUnsubscribeToken('member-1', { kind: 'list', slug: 'newsletter' });
    expect(mod.readUnsubscribeToken(token)).toEqual({
      memberId: 'member-1',
      target: { kind: 'list', slug: 'newsletter' },
    });
  });

  it('refuses a reference to anything other than a list, including a group', () => {
    const token = mod.mintUnsubscribeToken('member-1', { kind: 'list', slug: 'newsletter' });
    const [, signature] = token.split('.');
    // Group mail carries no unsubscribe control at all, so a token naming one
    // is not something this deployment mints and is not honoured if presented.
    const groupRef = Buffer.from('member-1|g:group-9', 'utf8').toString('base64url');
    expect(mod.readUnsubscribeToken(`${groupRef}.${signature}`)).toBeNull();
  });

  it('names one member and one audience, so two recipients of one send get different tokens', () => {
    const a = mod.mintUnsubscribeToken('member-1', { kind: 'list', slug: 'newsletter' });
    const b = mod.mintUnsubscribeToken('member-2', { kind: 'list', slug: 'newsletter' });
    expect(a).not.toBe(b);
    expect(mod.readUnsubscribeToken(b)?.memberId).toBe('member-2');
  });

  it('refuses a payload edited to name someone else', () => {
    const token = mod.mintUnsubscribeToken('member-1', { kind: 'list', slug: 'newsletter' });
    const [, signature] = token.split('.');
    const forged = Buffer.from('member-2|l:newsletter', 'utf8').toString('base64url');
    expect(mod.readUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
  });

  it('refuses a payload edited to name another list', () => {
    const token = mod.mintUnsubscribeToken('member-1', { kind: 'list', slug: 'newsletter' });
    const [, signature] = token.split('.');
    const forged = Buffer.from('member-1|l:board-announcements', 'utf8').toString('base64url');
    expect(mod.readUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
  });

  it('refuses a foreign signature and a malformed token alike', () => {
    const token = mod.mintUnsubscribeToken('member-1', { kind: 'list', slug: 'newsletter' });
    const [payload] = token.split('.');
    expect(mod.readUnsubscribeToken(`${payload}.not-the-signature`)).toBeNull();
    expect(mod.readUnsubscribeToken(payload)).toBeNull();
    expect(mod.readUnsubscribeToken('')).toBeNull();
    expect(mod.readUnsubscribeToken('a.b.c')).toBeNull();
  });
});
