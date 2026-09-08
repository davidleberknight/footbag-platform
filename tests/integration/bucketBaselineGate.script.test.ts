/**
 * scripts/ci/check_bucket_baseline.sh — the S3 baseline it enforces.
 *
 * Three things are true of every bucket in every tree: a declared encryption
 * configuration, a public access block, and a policy refusing any request where
 * aws:SecureTransport is false. Before this gate existed all three were true of
 * most buckets and quietly untrue of a few — two buckets inherited encryption
 * from the S3 account default rather than declaring it, and not one of the
 * seventeen refused plaintext. A baseline nobody restates when they add the
 * eighteenth bucket is the failure mode, so the rule has to fail rather than
 * merely exist.
 *
 * The gate runs against a throwaway repository rather than this one, so a case
 * can assert what a non-conforming bucket does without a non-conforming bucket
 * having to exist in terraform/. Every suite run also exercises the real tree,
 * because the conventions gate runs this same script against this repository.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/ci/check_bucket_baseline.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** The four resources a conforming bucket carries. Split so a case can drop
 *  exactly one of them and assert on the specific complaint. */
function bucket(label: string, opts: { sse?: boolean; pab?: boolean; policy?: boolean; deny?: boolean } = {}): string {
  const { sse = true, pab = true, policy = true, deny = true } = opts;
  const parts = [`resource "aws_s3_bucket" "${label}" {\n  bucket = "fixture-${label}"\n}\n`];
  if (sse) {
    parts.push(
      `resource "aws_s3_bucket_server_side_encryption_configuration" "${label}" {\n` +
        `  bucket = aws_s3_bucket.${label}.id\n}\n`,
    );
  }
  if (pab) {
    parts.push(`resource "aws_s3_bucket_public_access_block" "${label}" {\n  bucket = aws_s3_bucket.${label}.id\n}\n`);
  }
  if (policy) {
    parts.push(
      `data "aws_iam_policy_document" "${label}" {\n` +
        (deny
          ? `  statement {\n    sid       = "DenyPlaintextAccess"\n    effect    = "Deny"\n` +
            `    resources = [aws_s3_bucket.${label}.arn]\n  }\n`
          : '') +
        `}\n` +
        `resource "aws_s3_bucket_policy" "${label}" {\n  bucket = aws_s3_bucket.${label}.id\n}\n`,
    );
  }
  return parts.join('\n');
}

/** Stands up a throwaway repository holding only a terraform tree, runs the gate
 *  inside it, and tears it down. The script resolves its own root through git,
 *  so the fixture has to be a repository rather than a bare directory. */
function inFixtureRepo(trees: Record<string, string>): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-bucketbaseline-'));
  try {
    for (const [tree, contents] of Object.entries(trees)) {
      mkdirSync(join(dir, 'terraform', tree), { recursive: true });
      writeFileSync(join(dir, 'terraform', tree, 'main.tf'), contents, 'utf-8');
    }
    const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    expect(init.status).toBe(0);

    const r = spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('check_bucket_baseline.sh', () => {
  it('passes a tree whose buckets all carry the baseline', () => {
    const r = inFixtureRepo({ demo: bucket('media') + bucket('snapshots') });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/\[bucket-baseline\] pass/);
  });

  it('fails a bucket that inherits its encryption instead of declaring it', () => {
    const r = inFixtureRepo({ demo: bucket('media', { sse: false }) });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/no aws_s3_bucket_server_side_encryption_configuration/);
    expect(r.stdout).toMatch(/'media'/);
  });

  it('fails a bucket with no public access block', () => {
    const r = inFixtureRepo({ demo: bucket('media', { pab: false }) });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/no aws_s3_bucket_public_access_block/);
  });

  it('fails a bucket with no policy at all, saying nothing refuses plaintext to it', () => {
    const r = inFixtureRepo({ demo: bucket('media', { policy: false }) });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/no aws_s3_bucket_policy/);
    expect(r.stdout).toMatch(/nothing refuses plaintext/);
  });

  it('fails a bucket whose policy exists but carries no deny statement', () => {
    const r = inFixtureRepo({ demo: bucket('media', { deny: false }) });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/bucket 'media' is named by no DenyPlaintextAccess statement/);
  });

  // The case that killed the rule's first shape. Counting denies per tree passes
  // this, because two and two balances; only resolving the deny to the bucket it
  // names catches it.
  it('fails the uncovered bucket when another carries two denies, balancing the count', () => {
    const doubled =
      `resource "aws_s3_bucket" "media" {\n  bucket = "fixture-media"\n}\n` +
      `resource "aws_s3_bucket_server_side_encryption_configuration" "media" {\n  bucket = ""\n}\n` +
      `resource "aws_s3_bucket_public_access_block" "media" {\n  bucket = ""\n}\n` +
      `data "aws_iam_policy_document" "media" {\n` +
      `  statement {\n    sid       = "DenyPlaintextAccess"\n    resources = [aws_s3_bucket.media.arn]\n  }\n` +
      `  statement {\n    sid       = "DenyPlaintextAccess"\n    resources = [aws_s3_bucket.media.arn]\n  }\n}\n` +
      `resource "aws_s3_bucket_policy" "media" {\n  bucket = ""\n}\n`;
    const r = inFixtureRepo({ demo: doubled + bucket('snapshots', { deny: false }) });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/bucket 'snapshots' is named by no DenyPlaintextAccess statement/);
    expect(r.stdout).not.toMatch(/bucket 'media' is named by no/);
  });

  // Regression: the real tree references gated buckets as
  // aws_s3_bucket.archive[0].arn, and the first per-bucket pattern reported
  // every one of them as uncovered.
  it('recognises a bucket referenced through a count index', () => {
    const gated =
      `resource "aws_s3_bucket" "archive" {\n  bucket = "fixture-archive"\n}\n` +
      `resource "aws_s3_bucket_server_side_encryption_configuration" "archive" {\n  bucket = ""\n}\n` +
      `resource "aws_s3_bucket_public_access_block" "archive" {\n  bucket = ""\n}\n` +
      `data "aws_iam_policy_document" "archive_cloudfront_oac" {\n` +
      `  statement {\n    sid       = "DenyPlaintextAccess"\n` +
      `    resources = [aws_s3_bucket.archive[0].arn, "${'${aws_s3_bucket.archive[0].arn}'}/*"]\n  }\n}\n` +
      `resource "aws_s3_bucket_policy" "archive" {\n  bucket = ""\n}\n`;
    const r = inFixtureRepo({ demo: gated });
    expect(r.exitCode).toBe(0);
  });

  it('holds every tree to the baseline, not just the first', () => {
    const r = inFixtureRepo({
      good: bucket('media'),
      bad: bucket('snapshots', { policy: false }),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toMatch(/terraform\/bad\//);
    expect(r.stdout).not.toMatch(/terraform\/good\/: bucket/);
  });

  it('passes a tree with no buckets at all rather than complaining about one', () => {
    const r = inFixtureRepo({ empty: '# no buckets here\n' });
    expect(r.exitCode).toBe(0);
  });
});
