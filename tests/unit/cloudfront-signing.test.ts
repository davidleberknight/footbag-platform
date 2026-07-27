/**
 * CloudFront signed-cookie minting contract: the adapter produces the three
 * cookie values the archive edge validates — a custom policy scoped to a
 * wildcard resource with an epoch expiry, an RSA-SHA1 signature over the
 * exact policy bytes, both in CloudFront's cookie-safe base64 variant
 * ('+' -> '-', '=' -> '_', '/' -> '~'), plus the key-pair id.
 */
import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { createCloudFrontSigningAdapter } from '../../src/adapters/cloudFrontSigningAdapter';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function fromCloudFrontSafeB64(value: string): Buffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
  return Buffer.from(base64, 'base64');
}

const RESOURCE = 'https://archive.example.test/*';
const EXPIRES = 1800000000;

describe('createCloudFrontSigningAdapter', () => {
  const adapter = createCloudFrontSigningAdapter({
    privateKeyPem: privateKey,
    keyPairId: 'KTESTKEYPAIRID',
  });

  it('emits the key pair id and cookie-safe values only', () => {
    const v = adapter.signArchiveCookies(RESOURCE, EXPIRES);
    expect(v.keyPairId).toBe('KTESTKEYPAIRID');
    // No character CloudFront reserves may appear in a cookie value.
    for (const s of [v.policy, v.signature]) {
      expect(s).not.toMatch(/[+=/]/);
      expect(s).toMatch(/^[A-Za-z0-9_~-]+$/);
    }
  });

  it('encodes a custom policy with the wildcard resource and epoch expiry', () => {
    const v = adapter.signArchiveCookies(RESOURCE, EXPIRES);
    const policy = JSON.parse(fromCloudFrontSafeB64(v.policy).toString('utf8'));
    expect(policy).toEqual({
      Statement: [
        {
          Resource: RESOURCE,
          Condition: { DateLessThan: { 'AWS:EpochTime': EXPIRES } },
        },
      ],
    });
  });

  it('signs the exact policy bytes with RSA-SHA1, verifiable by the public key', () => {
    const v = adapter.signArchiveCookies(RESOURCE, EXPIRES);
    const policyBytes = fromCloudFrontSafeB64(v.policy);
    const signature = fromCloudFrontSafeB64(v.signature);
    expect(crypto.verify('sha1', policyBytes, publicKey, signature)).toBe(true);
    // A single altered policy byte invalidates the signature.
    const tampered = Buffer.from(policyBytes);
    tampered[0] ^= 0xff;
    expect(crypto.verify('sha1', tampered, publicKey, signature)).toBe(false);
  });

  it('scopes each signature to its own resource and expiry', () => {
    const a = adapter.signArchiveCookies(RESOURCE, EXPIRES);
    const b = adapter.signArchiveCookies('https://other.example.test/*', EXPIRES);
    const c = adapter.signArchiveCookies(RESOURCE, EXPIRES + 60);
    expect(a.policy).not.toBe(b.policy);
    expect(a.signature).not.toBe(b.signature);
    expect(a.policy).not.toBe(c.policy);
  });

  it('rejects a malformed private key at construction', () => {
    expect(() =>
      createCloudFrontSigningAdapter({
        privateKeyPem: 'not a pem',
        keyPairId: 'K1',
      }),
    ).toThrow();
  });
});
