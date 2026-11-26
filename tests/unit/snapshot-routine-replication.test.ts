/**
 * Off-region copies of the database snapshots, as both Terraform trees declare
 * them.
 *
 * Losing the whole primary region must cost no more than the five-minute backup
 * window, so every routine snapshot is copied to the recovery region within a
 * bounded time, into an unlocked bucket that keeps two days, and an alarm fires
 * when the copy falls fifteen minutes behind. The hourly and daily copies keep
 * going to the locked bucket in a storage class that survives the loss of one
 * Availability Zone. Every one of these passes `terraform validate` when it is
 * wrong and fails silently on the day of a regional loss, so each is pinned here
 * from the HCL as text: the suite has no initialized tree and no credential.
 * Staging carries the routine copy too, because it is where each change is
 * rehearsed before production.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks, onProvider, type HclBlock } from '../fixtures/hclBlocks';

const TREES = ['staging', 'production'] as const;
type Tree = (typeof TREES)[number];

const ROUTINE_RULE = 'replicate-routine-stream-to-routine-dr';

function treeSource(tree: Tree): string {
  const dir = resolve(__dirname, `../../terraform/${tree}`);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tf'))
    .map((f) => readFileSync(resolve(dir, f), 'utf8'))
    .join('\n');
}

const sources: Record<Tree, string> = { staging: treeSource('staging'), production: treeSource('production') };
const resources: Record<Tree, HclBlock[]> = {
  staging: hclBlocks(sources.staging, 'resource'),
  production: hclBlocks(sources.production, 'resource'),
};

function resource(tree: Tree, type: string, name: string): HclBlock {
  const b = resources[tree].find((r) => r.type === type && r.name === name);
  expect(b, `${tree}: ${type}.${name} is declared`).toBeDefined();
  return b!;
}

/** The body of the brace-matched block that opens at `open` (the index of its `{`). */
function braceBody(text: string, open: number): string {
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < text.length) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') depth -= 1;
    i += 1;
  }
  return text.slice(open + 1, i - 1);
}

/** Every nested block named `name` inside `body`, at any depth. */
function inner(body: string, name: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(new RegExp(`^\\s*${name}\\s*\\{`, 'gm'))) {
    out.push(braceBody(body, m.index! + m[0].length - 1));
  }
  return out;
}

/** The replication rule of the snapshot bucket whose filter names `prefix`. */
function snapshotRule(tree: Tree, prefix: string): string {
  const config = resource(tree, 'aws_s3_bucket_replication_configuration', 'snapshots').body;
  const rule = inner(config, 'rule').find((r) => new RegExp(`filter \\{ prefix = "${prefix}" \\}`).test(r));
  expect(rule, `${tree}: a snapshot replication rule for ${prefix}`).toBeDefined();
  return rule!;
}

/** The jsonencode statement object carrying `Sid = "<sid>"` in a policy body. */
function statement(body: string, sid: string): string {
  const at = body.search(new RegExp(`Sid\\s*=\\s*"${sid}"`));
  expect(at, `statement ${sid}`).toBeGreaterThanOrEqual(0);
  return braceBody(body, body.lastIndexOf('{', at));
}

describe.each(TREES)('the routine snapshot copy in the %s tree', (tree) => {
  it('puts the routine DR bucket in the recovery region with the full bucket baseline', () => {
    // Defect caught: a setting applied in us-east-1 lands on a bucket that does
    // not exist there and fails the apply, or the copy sits in the region it
    // exists to outlive; a bucket without versioning refuses replication
    // outright; a terraform run can delete the newest off-region copy.
    const owned = resources[tree].filter((r) => r.name === 'routine_dr' && r.type.startsWith('aws_s3_bucket'));
    expect(owned.map((r) => r.type).sort()).toEqual([
      'aws_s3_bucket',
      'aws_s3_bucket_lifecycle_configuration',
      'aws_s3_bucket_policy',
      'aws_s3_bucket_public_access_block',
      'aws_s3_bucket_server_side_encryption_configuration',
      'aws_s3_bucket_versioning',
    ]);
    for (const r of owned) expect(onProvider(r, 'aws.us_west_2'), `${r.type} on aws.us_west_2`).toBe(true);
    const bucket = resource(tree, 'aws_s3_bucket', 'routine_dr').body;
    expect(bucket).toMatch(/^\s*bucket\s*=\s*"\$\{local\.prefix\}-[a-z-]*snapshots-routine-dr"\s*$/m);
    expect(bucket).toMatch(/^\s*lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}/m);
    // Unlocked: Object Lock would hold every five-minute copy for its window.
    expect(bucket).not.toMatch(/object_lock_enabled/);
    expect(resource(tree, 'aws_s3_bucket_versioning', 'routine_dr').body)
      .toMatch(/^\s*versioning_configuration\s*\{\s*status\s*=\s*"Enabled"\s*\}/m);
    expect(resource(tree, 'aws_s3_bucket_server_side_encryption_configuration', 'routine_dr').body)
      .toMatch(/^\s*sse_algorithm\s*=\s*"AES256"\s*$/m);
    const pab = resource(tree, 'aws_s3_bucket_public_access_block', 'routine_dr').body;
    for (const key of ['block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets']) {
      expect(pab, key).toMatch(new RegExp(`^\\s*${key}\\s*=\\s*true\\s*$`, 'm'));
    }
  });

  it('expires each routine copy and each superseded version after two days', () => {
    // Defect caught: copies kept for ever grow the bucket by about 4 GB a day;
    // an expiry without the noncurrent rule only hides each copy behind a
    // delete marker in this versioned bucket and keeps paying for it.
    const lifecycle = resource(tree, 'aws_s3_bucket_lifecycle_configuration', 'routine_dr').body;
    const rules = inner(lifecycle, 'rule');
    expect(rules.length).toBe(1);
    expect(rules[0]).toMatch(/^\s*status\s*=\s*"Enabled"\s*$/m);
    expect(rules[0]).toMatch(/^\s*filter \{ prefix = "routine\/" \}\s*$/m);
    expect(rules[0]).toMatch(/^\s*expiration \{ days = 2 \}\s*$/m);
    expect(rules[0]).toMatch(/^\s*noncurrent_version_expiration \{ noncurrent_days = 2 \}\s*$/m);
  });

  it('replicates routine/ into the routine DR bucket with Replication Time Control on', () => {
    // Defect caught: the routine stream not leaving the region, so a regional
    // loss falls back to the last hourly point; a copy sent to the locked bucket
    // would be held for 90 days; without Replication Time Control nothing bounds
    // how far behind the copy may fall, and S3 rejects RTC without metrics.
    const rule = snapshotRule(tree, 'routine/');
    expect(rule).toMatch(new RegExp(`^\\s*id\\s*=\\s*"${ROUTINE_RULE}"\\s*$`, 'm'));
    expect(rule).toMatch(/^\s*status\s*=\s*"Enabled"\s*$/m);
    expect(rule).toMatch(/^\s*bucket\s*=\s*aws_s3_bucket\.routine_dr\.arn\s*$/m);
    const [rtc] = inner(rule, 'replication_time');
    expect(rtc, 'replication_time block').toBeDefined();
    expect(rtc).toMatch(/^\s*status\s*=\s*"Enabled"\s*$/m);
    expect(rtc).toMatch(/time\s*\{\s*minutes\s*=\s*15\s*\}/);
    // Ungated: RTC is refused by S3 unless the rule publishes its metrics.
    expect(rule).not.toMatch(/dynamic "metrics"/);
    const [metrics] = inner(rule, 'metrics');
    expect(metrics, 'metrics block').toBeDefined();
    expect(metrics).toMatch(/^\s*status\s*=\s*"Enabled"\s*$/m);
    expect(metrics).toMatch(/event_threshold\s*\{\s*minutes\s*=\s*15\s*\}/);
    // The configuration waits for the destination's versioning, or the first
    // apply races it and S3 rejects the rule.
    expect(resource(tree, 'aws_s3_bucket_replication_configuration', 'snapshots').body)
      .toMatch(/aws_s3_bucket_versioning\.routine_dr,/);
  });

  it('stores the two-day routine copies in STANDARD, which bills no 30-day minimum', () => {
    // Defect caught: an infrequent-access class bills every two-day copy for 30
    // days, fifteen times the storage actually held; a single-zone class loses
    // the copy with one Availability Zone.
    expect(snapshotRule(tree, 'routine/')).toMatch(/^\s*storage_class\s*=\s*"STANDARD"\s*$/m);
  });

  it('lets the replication role read the snapshots and write only into the copies it fills', () => {
    // Defect caught: without the destination grant every routine replication
    // fails with DstPutObjectNotPermitted and S3 never retries it; without the
    // source grant on staging, whose role carried media alone, the rule cannot
    // read a single snapshot.
    const policy = resource(tree, 'aws_iam_role_policy', 's3_replication').body;
    expect(statement(policy, 'DestinationObjectWrite')).toContain('"${aws_s3_bucket.routine_dr.arn}/*"');
    expect(statement(policy, 'SourceBucketRead')).toContain('aws_s3_bucket.snapshots.arn');
    expect(statement(policy, 'SourceObjectRead')).toContain('"${aws_s3_bucket.snapshots.arn}/*"');
    // No other statement names the copy: replication is its only writer.
    const mentions = policy.match(/aws_s3_bucket\.routine_dr\.arn/g) ?? [];
    expect(mentions.length).toBe(1);
  });

  it('lets the host read the routine copy, and never write or delete it', () => {
    // Defect caught: a region-loss restore pulls the newest routine copy on the
    // host with the runtime role, and fails with AccessDenied after the operator
    // has typed the confirmation; a write or delete grant would let the host
    // alter the copy that outlives it.
    const policy = resource(tree, 'aws_iam_role_policy', 'app_s3_snapshots').body;
    const read = statement(policy, 'ReadRoutineDisasterRecoverySnapshots');
    expect(read).toContain('aws_s3_bucket.routine_dr.arn,');
    expect(read).toContain('"${aws_s3_bucket.routine_dr.arn}/*"');
    const actions = [...read.matchAll(/"(s3:[A-Za-z]+)"/g)].map((m) => m[1]).sort();
    expect(actions).toEqual(['s3:GetObject', 's3:ListBucket']);
  });

  it('alarms in the recovery region when the routine copy is fifteen minutes behind', () => {
    // Defect caught: the routine copy falling behind with nobody told, so a
    // regional loss costs far more than five minutes; an alarm in us-east-1
    // watches a metric S3 publishes only in the destination's region; a RuleId
    // or bucket that is not the routine rule's watches nothing and stays green.
    const alarm = resource(tree, 'aws_cloudwatch_metric_alarm', 'snapshot_routine_replication_latency_us_west_2').body;
    expect(alarm).toMatch(/^\s*provider\s*=\s*aws\.us_west_2\s*$/m);
    expect(alarm).toMatch(/^\s*count\s*=\s*var\.enable_replication_alarm \? 1 : 0\s*$/m);
    expect(alarm).toMatch(/^\s*namespace\s*=\s*"AWS\/S3"\s*$/m);
    expect(alarm).toMatch(/^\s*metric_name\s*=\s*"ReplicationLatency"\s*$/m);
    expect(alarm).toMatch(/^\s*statistic\s*=\s*"Maximum"\s*$/m);
    expect(alarm).toMatch(/^\s*comparison_operator\s*=\s*"GreaterThanOrEqualToThreshold"\s*$/m);
    expect(alarm).toMatch(/^\s*threshold\s*=\s*900\b/m);
    expect(alarm).toMatch(/^\s*SourceBucket\s*=\s*aws_s3_bucket\.snapshots\.id\s*$/m);
    expect(alarm).toMatch(/^\s*DestinationBucket\s*=\s*aws_s3_bucket\.routine_dr\.id\s*$/m);
    expect(alarm).toMatch(new RegExp(`^\\s*RuleId\\s*=\\s*"${ROUTINE_RULE}"\\s*$`, 'm'));
    for (const key of ['alarm_actions', 'ok_actions']) {
      expect(alarm, key).toMatch(new RegExp(`^\\s*${key}\\s*=\\s*\\[aws_sns_topic\\.alarms_us_west_2\\.arn\\]\\s*$`, 'm'));
    }
  });

  it('watches the routine rule for failed and backlogged replication like every other rule', () => {
    // Defect caught: a routine rule missing from the per-rule map has no
    // failed-replication or backlog alarm, so a broken grant fails every copy
    // in silence; and its failure events never reach the diagnosis queue.
    const entry = sources[tree].match(/"snapshots-routine" = \{([\s\S]*?)\}/)?.[1] ?? '';
    expect(entry).toMatch(/source\s*=\s*aws_s3_bucket\.snapshots\.id/);
    expect(entry).toMatch(/destination\s*=\s*aws_s3_bucket\.routine_dr\.id/);
    expect(entry).toMatch(new RegExp(`rule\\s*=\\s*"${ROUTINE_RULE}"`));
    const notify = resource(tree, 'aws_s3_bucket_notification', 'snapshots_replication_failures').body;
    expect(notify).toMatch(/^\s*bucket\s*=\s*aws_s3_bucket\.snapshots\.id\s*$/m);
    expect(notify).toContain('"s3:Replication:OperationFailedReplication"');
  });

  it('publishes the routine DR bucket name for the replication check and the restore', () => {
    // Defect caught: the operator scripts cannot find the copy, so the
    // replication check never looks at it.
    expect(sources[tree]).toMatch(
      /output "routine_dr_bucket_name" \{[^}]*value\s*=\s*aws_s3_bucket\.routine_dr\.bucket/,
    );
  });
});

describe('the hourly and daily snapshot copies in production', () => {
  it('store in STANDARD_IA, which survives the loss of an Availability Zone', () => {
    // Defect caught: ONEZONE_IA keeps the only off-region hourly and daily
    // copies in one zone, so one zone's loss in the recovery region destroys
    // the history a regional loss would need.
    for (const prefix of ['hourly/', 'daily/']) {
      const rule = snapshotRule('production', prefix);
      expect(rule, prefix).toMatch(/^\s*bucket\s*=\s*aws_s3_bucket\.dr\.arn\s*$/m);
      expect(rule, prefix).toMatch(/^\s*storage_class\s*=\s*"STANDARD_IA"\s*$/m);
    }
    const config = resource('production', 'aws_s3_bucket_replication_configuration', 'snapshots').body;
    expect(config).not.toMatch(/ONEZONE_IA/);
  });

  it('keeps the locked bucket for the hourly and daily copies only', () => {
    // Defect caught: a routine rule pointed at the locked bucket holds every
    // five-minute copy for 90 days; a lock removed from it lets an ordinary
    // credential delete the long history.
    expect(resource('production', 'aws_s3_bucket', 'dr').body).toMatch(/^\s*object_lock_enabled\s*=\s*true\s*$/m);
    const config = resource('production', 'aws_s3_bucket_replication_configuration', 'snapshots').body;
    const toLocked = inner(config, 'rule').filter((r) => /aws_s3_bucket\.dr\.arn/.test(r));
    expect(toLocked.map((r) => r.match(/filter \{ prefix = "([a-z]+\/)" \}/)?.[1]).sort()).toEqual(['daily/', 'hourly/']);
  });
});
