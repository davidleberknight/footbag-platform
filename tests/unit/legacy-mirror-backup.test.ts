/**
 * The cold copy of the legacy site crawl, as the production tree declares it.
 *
 * The crawl is the only surviving copy of the legacy site, and the archive's
 * next major version will edit it, so this bucket has to survive a mistaken
 * apply, keep every earlier object long enough for a bad edit to be rolled
 * back, stay private, and sit in the backup region apart from the served
 * archive. Each of those passes `terraform validate` when it is missing and
 * fails silently in operation. The bucket baseline gate checks that the
 * encryption, public-access block and deny-plaintext policy exist for every
 * bucket; this pins what they say, and the rest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks, onProvider, type HclBlock } from '../fixtures/hclBlocks';

const source = readFileSync(resolve(__dirname, '../../terraform/production/legacy-mirror-backup.tf'), 'utf8');
const resources = hclBlocks(source, 'resource');
const NAME = 'legacy_mirror_backup';
const GATE = /^\s*count\s*=\s*var\.enable_legacy_mirror_backup \? 1 : 0\s*$/m;

function block(type: string): HclBlock {
  const b = resources.find((r) => r.type === type && r.name === NAME);
  expect(b, `${type}.${NAME} is declared`).toBeDefined();
  return b!;
}

/** The body of one top-level `output` or `variable` block, braces matched. */
function topLevel(kind: 'output' | 'variable', name: string): string {
  const header = new RegExp(`^${kind}\\s+"${name}"\\s*\\{`, 'm').exec(source);
  expect(header, `${kind} ${name} is declared`).not.toBeNull();
  let depth = 1;
  let i = header!.index + header![0].length;
  const start = i;
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
}

describe('legacy mirror cold copy bucket', () => {
  it('puts every bucket resource in the backup region, behind the default-off gate', () => {
    // Defect caught: one setting applied in us-east-1 lands on a bucket that
    // does not exist there and fails the apply, or the copy sits in the same
    // region as the archive it backs up; an ungated resource is created on the
    // first apply before the crawl is ready.
    const owned = resources.filter((r) => r.name === NAME);
    expect(owned.map((r) => r.type).sort()).toEqual([
      'aws_s3_bucket',
      'aws_s3_bucket_lifecycle_configuration',
      'aws_s3_bucket_policy',
      'aws_s3_bucket_public_access_block',
      'aws_s3_bucket_server_side_encryption_configuration',
      'aws_s3_bucket_versioning',
    ]);
    for (const r of owned) {
      expect(onProvider(r, 'aws.us_west_2'), `${r.type} on aws.us_west_2`).toBe(true);
      expect(r.body, `${r.type} is gated`).toMatch(GATE);
    }
    expect(topLevel('variable', 'enable_legacy_mirror_backup')).toMatch(/^\s*default\s*=\s*false\s*$/m);
  });

  it('cannot be destroyed by an apply and keeps every overwritten object', () => {
    // Defect caught: turning the gate off, or a rename, destroys the only copy
    // of the legacy site; without versioning an upload that overwrites a file
    // loses the earlier one, so a bad edit cannot be rolled back.
    expect(block('aws_s3_bucket').body).toMatch(/^\s*lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}/m);
    expect(block('aws_s3_bucket_versioning').body).toMatch(/^\s*versioning_configuration\s*\{\s*status\s*=\s*"Enabled"\s*\}/m);
  });

  it('expires no current object, and keeps superseded versions for at least the Deep Archive minimum', () => {
    // Defect caught: an expiration rule deletes the backup itself; a short
    // noncurrent window removes the version a rollback needs before anyone
    // notices the bad change, while still paying Deep Archive's 180-day minimum.
    const lifecycle = block('aws_s3_bucket_lifecycle_configuration').body;
    expect(lifecycle).not.toMatch(/^\s*expiration\s*\{/m);
    const days = [...lifecycle.matchAll(/^\s*noncurrent_days\s*=\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
    expect(days.length, 'a noncurrent-version rule exists').toBeGreaterThan(0);
    for (const d of days) expect(d).toBeGreaterThanOrEqual(180);
  });

  it('blocks every form of public access', () => {
    // Defect caught: a block present with one setting false lets a public ACL
    // or policy make a private capture public.
    const pab = block('aws_s3_bucket_public_access_block').body;
    for (const key of ['block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets']) {
      expect(pab, key).toMatch(new RegExp(`^\\s*${key}\\s*=\\s*true\\s*$`, 'm'));
    }
  });

  it('encrypts at rest and refuses every request made without TLS', () => {
    // Defect caught: a deny statement keyed on the wrong value, which refuses
    // nothing, or no default encryption; the baseline gate checks that these
    // resources exist, not what they say.
    expect(block('aws_s3_bucket_server_side_encryption_configuration').body).toMatch(/^\s*sse_algorithm\s*=\s*"AES256"\s*$/m);
    const doc = hclBlocks(source, 'data').find((b) => b.type === 'aws_iam_policy_document' && b.name === NAME);
    expect(doc, 'the bucket policy document is declared').toBeDefined();
    expect(doc!.body).toMatch(/^\s*effect\s*=\s*"Deny"\s*$/m);
    expect(doc!.body).toMatch(/^\s*variable\s*=\s*"aws:SecureTransport"\s*$/m);
    expect(doc!.body).toMatch(/^\s*values\s*=\s*\["false"\]\s*$/m);
    expect(block('aws_s3_bucket_policy').body).toMatch(/data\.aws_iam_policy_document\.legacy_mirror_backup\[0\]\.json/);
  });

  it('publishes the bucket name only while the gate is on', () => {
    // Defect caught: the backup script reads this output to find its bucket; an
    // output that names a bucket while the gate is off sends the upload to one
    // that does not exist, and one that never names it leaves the script unable
    // to run at all.
    expect(topLevel('output', 'legacy_mirror_backup_bucket_name')).toMatch(
      /value\s*=\s*var\.enable_legacy_mirror_backup \? aws_s3_bucket\.legacy_mirror_backup\[0\]\.bucket : null/,
    );
  });
});
