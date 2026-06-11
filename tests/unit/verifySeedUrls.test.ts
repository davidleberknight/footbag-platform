/**
 * Seed/sidecar external-URL verifier core.
 *
 * The verifier produces committed URL verdicts at data-authoring time so that
 * deploy/boot make no third-party callouts. These tests pin its contract: a
 * valid URL is stamped validated, a flagged URL is quarantined, an already-known
 * verdict for an unchanged URL is kept without re-checking (idempotent, no
 * callout), and a changed URL is re-verified. They inject a stub validator, so
 * no network or adapter is exercised.
 */
import { describe, it, expect } from 'vitest';
import {
  computeClubVerdicts,
  computeGalleryVerdicts,
  parseCsvRecords,
  type ValidateFn,
  type UrlVerdict,
} from '../../scripts/verify-seed-urls';

const NOW = '2026-06-11T00:00:00.000Z';
const now = (): string => NOW;

const stubValidate: ValidateFn = async (url) =>
  url.includes('malware')
    ? { valid: false, error: 'This URL is not allowed.' }
    : { valid: true };

const failIfCalled: ValidateFn = async () => {
  throw new Error('validator must not be called for an unchanged, already-verdicted URL');
};

const VALID = 'https://example.com/';
const MALWARE = 'http://malware.testing.google.test/testing/malware/';

describe('verify-seed-urls: club verdict core', () => {
  it('validates a clean URL and quarantines a flagged one', async () => {
    const { out, stats } = await computeClubVerdicts(
      [{ key: 'a', url: VALID }, { key: 'b', url: MALWARE }],
      new Map(),
      stubValidate,
      now,
    );
    expect(stats).toEqual({ verified: 1, quarantined: 1, kept: 0 });
    const a = out.find((r) => r.key === 'a')!;
    const b = out.find((r) => r.key === 'b')!;
    expect(a.verdict).toEqual({ validated_at: NOW, quarantine_reason: null });
    expect(b.verdict).toEqual({ validated_at: null, quarantine_reason: 'This URL is not allowed.' });
  });

  it('keeps an existing verdict for an unchanged URL without re-checking', async () => {
    const prior = new Map([
      ['a', { url: VALID, verdict: { validated_at: '2020-01-01T00:00:00.000Z', quarantine_reason: null } as UrlVerdict }],
    ]);
    const { out, stats } = await computeClubVerdicts(
      [{ key: 'a', url: VALID }],
      prior,
      failIfCalled,
      now,
    );
    expect(stats).toEqual({ verified: 0, quarantined: 0, kept: 1 });
    expect(out[0]!.verdict.validated_at).toBe('2020-01-01T00:00:00.000Z');
  });

  it('re-verifies when the URL changed', async () => {
    const prior = new Map([
      ['a', { url: 'https://old.example/', verdict: { validated_at: '2020-01-01T00:00:00.000Z', quarantine_reason: null } as UrlVerdict }],
    ]);
    const { out, stats } = await computeClubVerdicts(
      [{ key: 'a', url: 'https://new.example/' }],
      prior,
      stubValidate,
      now,
    );
    expect(stats.verified).toBe(1);
    expect(out[0]!.verdict.validated_at).toBe(NOW);
  });

  it('drops rows with no URL (no verdict emitted)', async () => {
    const { out } = await computeClubVerdicts(
      [{ key: 'a', url: '' }],
      new Map(),
      failIfCalled,
      now,
    );
    expect(out).toEqual([]);
  });
});

describe('verify-seed-urls: gallery verdict core', () => {
  it('verifies per gallery+url and keeps a prior verdict for an unchanged URL', async () => {
    const prior = {
      gA: { [VALID]: { validated_at: '2020-01-01T00:00:00.000Z', quarantine_reason: null } as UrlVerdict },
    };
    const { out, stats } = await computeGalleryVerdicts(
      [{ id: 'gA', urls: [VALID, MALWARE] }],
      prior,
      stubValidate,
      now,
    );
    expect(out.gA![VALID]!.validated_at).toBe('2020-01-01T00:00:00.000Z');
    expect(out.gA![MALWARE]!.quarantine_reason).toBe('This URL is not allowed.');
    expect(stats).toEqual({ verified: 0, quarantined: 1, kept: 1 });
  });
});

describe('verify-seed-urls: RFC4180 CSV parsing', () => {
  it('parses quoted fields containing commas and embedded newlines', () => {
    const csv = 'a,b\n"x,1","y\nz"\nlast,row\n';
    const recs = parseCsvRecords(csv);
    expect(recs[0]).toEqual(['a', 'b']);
    expect(recs[1]).toEqual(['x,1', 'y\nz']);
    expect(recs[2]).toEqual(['last', 'row']);
  });

  it('handles escaped double-quotes', () => {
    const recs = parseCsvRecords('h\n"he said ""hi"""\n');
    expect(recs[1]).toEqual(['he said "hi"']);
  });
});
