/**
 * How long the archive keeps an edited object, and where else every write goes,
 * as the Terraform trees declare it.
 *
 * Once the crawl is published the archive bucket is the source of truth and is
 * edited in place, so a bad edit has to stay recoverable for as long as a
 * rarely read archive can take to reveal it: the bucket and its replica keep
 * each superseded version for a year, and on production a replication rule
 * copies every write, and never a delete, into the cold-copy bucket. A flag
 * records which of the two content sources the bucket is published from, and a
 * later apply must never turn it back. Each of these passes `terraform
 * validate` when it is wrong and fails silently in operation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks, type HclBlock } from '../fixtures/hclBlocks';

function tree(env: 'production' | 'staging'): HclBlock[] {
  return hclBlocks(readFileSync(resolve(__dirname, `../../terraform/${env}/archive.tf`), 'utf8'), 'resource');
}

function block(resources: HclBlock[], type: string, name: string): HclBlock {
  const b = resources.find((r) => r.type === type && r.name === name);
  expect(b, `${type}.${name} is declared`).toBeDefined();
  return b!;
}

/** The body of the first nested block opening with `header {`, braces matched. */
function nested(body: string, header: RegExp): string | undefined {
  const m = header.exec(body);
  if (!m) return undefined;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth > 0 && i < body.length) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') depth -= 1;
    i += 1;
  }
  return body.slice(start, i - 1);
}

const production = tree('production');
const staging = tree('staging');

describe('archive version retention', () => {
  it('keeps each superseded version for a year on the bucket and its replica, in both trees', () => {
    // Defect caught: a short window expires the version an edit is rolled back
    // to before ordinary use of a rarely read archive reveals the bad edit, and
    // the replica, which follows every deletion, then offers no rollback either.
    for (const [env, resources] of [['production', production], ['staging', staging]] as const) {
      for (const name of ['archive', 'archive_dr']) {
        const body = block(resources, 'aws_s3_bucket_lifecycle_configuration', name).body;
        const days = [...body.matchAll(/^\s*noncurrent_days\s*=\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
        expect(days, `${env} ${name} noncurrent expiry`).toEqual([365]);
        expect(body, `${env} ${name} expires no current object`).not.toMatch(/^\s*expiration\s*\{/m);
      }
    }
  });
});

describe('archive replication to the legacy mirror cold copy', () => {
  const replication = block(production, 'aws_s3_bucket_replication_configuration', 'archive').body;
  const coldRule = nested(replication, /^\s*dynamic\s+"rule"\s*\{/m);

  it('exists only while the cold-copy bucket does, beside the always-on replica rule', () => {
    // Defect caught: an ungated rule names a bucket that does not exist and
    // fails the archive's whole replication apply; a rule gated on the wrong
    // flag never copies anything into the cold copy.
    expect(replication).toMatch(/^\s*count\s*=\s*var\.enable_archive \? 1 : 0\s*$/m);
    expect(coldRule, 'the cold-copy rule is a dynamic rule').toBeDefined();
    expect(coldRule!).toMatch(/^\s*for_each\s*=\s*var\.enable_legacy_mirror_backup \? \[1\] : \[\]\s*$/m);
    expect(coldRule!).toMatch(/^\s*bucket\s*=\s*aws_s3_bucket\.legacy_mirror_backup\[0\]\.arn\s*$/m);
  });

  it('carries every write and no delete marker, into Deep Archive', () => {
    // Defect caught: replicating delete markers lets a page removed from the
    // archive vanish from the cold copy too, leaving nothing to roll back to; a
    // filtered rule leaves part of the archive uncopied; any other storage class
    // bills the whole archive at a warm rate.
    expect(coldRule!).toMatch(/^\s*delete_marker_replication\s*\{\s*status\s*=\s*"Disabled"\s*\}/m);
    expect(coldRule!).toMatch(/^\s*filter\s*\{\s*\}/m);
    expect(coldRule!).toMatch(/^\s*storage_class\s*=\s*"DEEP_ARCHIVE"\s*$/m);
    expect(coldRule!).toMatch(/^\s*status\s*=\s*"Enabled"\s*$/m);
  });

  it('gives the two rules distinct priorities, as S3 requires of rules with a filter', () => {
    // Defect caught: two rules at the default priority are refused by S3 when
    // the cold copy is turned on, taking the replica's rule down in the same
    // failed apply.
    const priorities = [...replication.matchAll(/^\s*priority\s*=\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
    expect(priorities).toHaveLength(2);
    expect(new Set(priorities).size).toBe(2);
  });

  it('is watched by the replication-failure alarm under the id the rule carries', () => {
    // Defect caught: S3 never retries a failed replication, so a write that
    // misses the cold copy is a silent hole in the only backup that never
    // deletes, unless an alarm watches this rule by its exact id.
    const ruleId = /^\s*id\s*=\s*"([^"]+)"\s*$/m.exec(coldRule!)?.[1];
    expect(ruleId, 'the cold-copy rule has an id').toBeDefined();
    const cloudwatch = readFileSync(resolve(__dirname, '../../terraform/production/cloudwatch.tf'), 'utf8');
    const entry = nested(cloudwatch, /^\s*"archive-cold-copy"\s*=\s*\{/m);
    expect(entry, 'the alarm map has a cold-copy entry').toBeDefined();
    expect(entry!).toMatch(/^\s*destination\s*=\s*aws_s3_bucket\.legacy_mirror_backup\[0\]\.id\s*$/m);
    expect(entry!).toMatch(new RegExp(`^\\s*rule\\s*=\\s*"${ruleId}"\\s*$`, 'm'));
    expect(cloudwatch).toMatch(/var\.enable_archive && var\.enable_legacy_mirror_backup \? \{\s*"archive-cold-copy"/);
  });
});

describe('archive source flag', () => {
  it('starts at crawl, gated with the archive, and is never reverted by an apply, in both trees', () => {
    // Defect caught: without ignore_changes the next apply sets a switched
    // production back to crawl, re-arming the publish over an edited archive;
    // a parameter seeded with anything but crawl lets the edit script run
    // before the switch, or blocks the first publish.
    for (const [env, resources] of [['production', production], ['staging', staging]] as const) {
      const p = block(resources, 'aws_ssm_parameter', 'archive_source').body;
      expect(p, `${env} name`).toMatch(/^\s*name\s*=\s*"\$\{local\.ssm_prefix\}\/archive-source"\s*$/m);
      expect(p, `${env} seed`).toMatch(/^\s*value\s*=\s*"crawl"\s*$/m);
      // Defect caught: a type or tier other than the String, Standard the switch
      // script writes makes the next apply rewrite the switched parameter.
      expect(p, `${env} type`).toMatch(/^\s*type\s*=\s*"String"\s*$/m);
      expect(p, `${env} tier`).toMatch(/^\s*tier\s*=\s*"Standard"\s*$/m);
      expect(p, `${env} gate`).toMatch(/^\s*count\s*=\s*var\.enable_archive \? 1 : 0\s*$/m);
      expect(p, `${env} one-way flip survives apply`).toMatch(/^\s*lifecycle\s*\{\s*ignore_changes\s*=\s*\[value\]\s*\}/m);
    }
  });
});
