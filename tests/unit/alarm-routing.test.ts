/**
 * Alarm declarations and routing, in both Terraform trees.
 *
 * Each alarm is only as useful as where its notice lands. A critical alarm that
 * never reaches the watch group, an alarm with no return-to-normal notice (so
 * the admin console never clears it), an alarm the feed queue cannot read, or a
 * gate that arms an alarm over a metric nothing publishes all pass
 * `terraform validate` and fail silently in operation. Each case pins one of
 * those, in both trees, since staging proves each alarm before production
 * carries it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks, onProvider, type HclBlock } from '../fixtures/hclBlocks';

const TREES = ['staging', 'production'] as const;
type Tree = (typeof TREES)[number];

function treeBlocks(tree: Tree): HclBlock[] {
  const dir = resolve(__dirname, `../../terraform/${tree}`);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tf'))
    .flatMap((f) => hclBlocks(readFileSync(resolve(dir, f), 'utf8'), 'resource'));
}

const blocks: Record<Tree, HclBlock[]> = { staging: treeBlocks('staging'), production: treeBlocks('production') };
const alarm = (tree: Tree, name: string) =>
  blocks[tree].find((b) => b.type === 'aws_cloudwatch_metric_alarm' && b.name === name);
const attr = (b: HclBlock, key: string) => b.body.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm'))?.[1].trim();

/** The container monitor's readings, by the names scripts/container-monitor.sh sends. */
const monitorScript = readFileSync(resolve(__dirname, '../../scripts/container-monitor.sh'), 'utf8');
const NAMESPACE: Record<Tree, string> = { staging: '"CWAgent"', production: 'local.cwagent_namespace' };

const CONTAINER_ALARMS = [
  { name: 'container_memory_warning', metric: 'container_memory_percent', severity: 'warning' },
  { name: 'container_memory_critical', metric: 'container_memory_percent', severity: 'critical' },
  { name: 'container_oom_kills', metric: 'container_oom_kills', severity: 'critical' },
  { name: 'container_crashes', metric: 'container_crashes', severity: 'critical' },
  { name: 'container_unhealthy', metric: 'container_unhealthy', severity: 'critical' },
  { name: 'container_monitor_heartbeat', metric: 'container_monitor_heartbeat', severity: 'warning' },
] as const;

/** Every alarm that must reach the watch group as well as the account mailbox. */
const CRITICAL: Record<Tree, string[]> = {
  staging: [
    'container_memory_critical', 'container_oom_kills', 'container_crashes', 'container_unhealthy',
    'high_cpu', 'high_memory', 'high_disk', 'cloudfront_5xx', 'db_backup_age', 'db_backup_failures',
    'cf_function_validation_errors_media', 'cf_function_execution_errors_media',
    'cf_function_validation_errors_archive', 'cf_function_execution_errors_archive', 'site_unavailable',
  ],
  production: [
    'container_memory_critical', 'container_oom_kills', 'container_crashes', 'container_unhealthy',
    'high_cpu', 'high_memory', 'high_disk', 'cloudfront_5xx', 'db_backup_age', 'db_backup_failures',
    'cf_function_validation_errors_apex', 'cf_function_execution_errors_apex',
    'cf_function_validation_errors_media', 'cf_function_execution_errors_media',
    'cf_function_validation_errors_archive', 'cf_function_execution_errors_archive',
    'site_unavailable', 'acm_cert_expiry', 'host_key_off_host',
  ],
};

/** The alarms this work added, each of which must send all three notices. */
const NEW_ALARMS = [
  ...CONTAINER_ALARMS.map((a) => a.name), 'high_cpu_warning', 'high_memory_warning', 'rate_limit_refusals',
  'cf_function_validation_errors_archive', 'cf_function_execution_errors_archive', 'site_unavailable',
];

describe.each(TREES)('%s alarms', (tree) => {
  it('binds each container alarm to a reading the monitor sends, gated off until it flows', () => {
    // Defect caught: an alarm on a metric name, namespace or dimension the
    // monitor never publishes, which sits silent forever; or one armed before
    // the gate, paging on apply.
    for (const a of CONTAINER_ALARMS) {
      const b = alarm(tree, a.name);
      expect(b, a.name).toBeDefined();
      expect(monitorScript, a.metric).toContain(`${a.metric}`);
      expect(attr(b!, 'metric_name'), a.name).toBe(`"${a.metric}"`);
      expect(attr(b!, 'namespace'), a.name).toBe(NAMESPACE[tree]);
      expect(b!.body, a.name).toMatch(/^\s*(for_each|count)\s*=\s*var\.enable_container_alarms \?/m);
      if (a.name === 'container_monitor_heartbeat') {
        expect(b!.body).not.toMatch(/dimensions/);
        expect(attr(b!, 'treat_missing_data')).toBe('"breaching"');
      } else {
        expect(b!.body, a.name).toMatch(/^\s*container\s*=\s*each\.key\s*$/m);
      }
    }
  });

  it('sends every new alarm\'s alarm, return-to-normal and lost-data notices', () => {
    // Defect caught: an alarm the admin console records and never clears, or
    // whose lost data is never shown as a warning.
    for (const name of NEW_ALARMS) {
      const b = alarm(tree, name);
      expect(b, name).toBeDefined();
      for (const key of ['alarm_actions', 'ok_actions', 'insufficient_data_actions']) {
        expect(attr(b!, key), `${name} ${key}`).toMatch(/^local\.(warning|critical)_alarm_actions$/);
      }
    }
  });

  it('routes the critical alarms to the watch group, and nothing else there', () => {
    // Defect caught: a critical alarm the group never hears, or a warning that
    // wakes the group for something that can wait.
    const critical = new Set(CRITICAL[tree]);
    for (const b of blocks[tree].filter((x) => x.type === 'aws_cloudwatch_metric_alarm')) {
      const routed = /local\.critical_alarm_actions|aws_sns_topic\.alarms_critical/.test(attr(b, 'alarm_actions') ?? '');
      expect(routed, b.name).toBe(critical.has(b.name));
      if (routed) expect(attr(b, 'ok_actions'), b.name).toBe(attr(b, 'alarm_actions'));
    }
  });

  it('keeps memory and OOM alarms on every limited container, with staging\'s difference asserted', () => {
    const tf = readFileSync(resolve(__dirname, `../../terraform/${tree}/monitoring.tf`), 'utf8');
    const memory = tf.match(/container_memory_services\s*=\s*(.+)$/m)?.[1];
    if (tree === 'production') {
      expect(memory).toBe('local.container_services');
    } else {
      // Staging leaves the image worker out, with the reason and how production
      // proves its alarm written beside the list.
      expect(memory).toBe('["nginx", "web", "worker"]');
      const prose = tf.replace(/\n\s*#\s*/g, ' ');
      expect(prose).toMatch(/image worker out of the memory and out-of-memory alarms/);
      expect(prose).toMatch(/proved on production/);
    }
  });

  it('subscribes the watch group to the critical topic, and the feed to both alarm topics', () => {
    // Defect caught: the group receiving every warning, or none; a Health
    // notice from the backup region emailed but never shown on the console.
    const subs = blocks[tree].filter((b) => b.type === 'aws_sns_topic_subscription');
    const group = subs.find((b) => b.name === 'alarm_ops_alert');
    expect(attr(group!, 'topic_arn')).toBe('aws_sns_topic.alarms_critical.arn');
    const westFeed = subs.find((b) => b.name === 'alarm_feed_us_west_2');
    expect(westFeed).toBeDefined();
    expect(onProvider(westFeed!, 'aws.us_west_2')).toBe(true);
    expect(attr(westFeed!, 'protocol')).toBe('"sqs"');
    expect(attr(westFeed!, 'endpoint')).toBe('aws_sqs_queue.alarm_feed[0].arn');
    const policy = blocks[tree].find((b) => b.type === 'aws_sqs_queue_policy' && b.name === 'alarm_feed');
    expect(policy!.body).toMatch(/"aws:SourceArn"\s*=\s*local\.alarm_feed_topic_arns/);
    const sns = readFileSync(resolve(__dirname, `../../terraform/${tree}/sns.tf`), 'utf8');
    expect(sns).toMatch(/alarm_feed_topic_arns\s*=\s*\[aws_sns_topic\.alarms\.arn, aws_sns_topic\.alarms_us_west_2\.arn\]/);
  });

  it('lets the monitoring service publish to the encrypted critical topic', () => {
    const topic = blocks[tree].find((b) => b.type === 'aws_sns_topic' && b.name === 'alarms_critical');
    expect(attr(topic!, 'kms_master_key_id')).toBe('aws_kms_key.main.arn');
    const policy = blocks[tree].find((b) => b.type === 'aws_sns_topic_policy' && b.name === 'alarms_critical');
    expect(policy!.body).toMatch(/Principal = \{ Service = "cloudwatch\.amazonaws\.com" \}/);
  });

  it('puts each replication-progress alarm in the backup region, where S3 publishes its metric', () => {
    // Defect caught: an alarm in us-east-1 on a metric S3 publishes only in
    // the destination bucket's region, which sees no data at all: the backlog
    // alarm can never fire, and the stopped alarm, which treats silence as
    // breaching, fires for ever.
    const DESTINATION_REGION_METRICS = ['"ReplicationLatency"', '"OperationsPendingReplication"', '"BytesPendingReplication"'];
    const progress = blocks[tree].filter((b) => b.type === 'aws_cloudwatch_metric_alarm'
      && DESTINATION_REGION_METRICS.includes(attr(b, 'metric_name') ?? ''));
    expect(progress.length, 'no replication-progress alarm found').toBeGreaterThan(0);
    for (const b of progress) expect(onProvider(b, 'aws.us_west_2'), b.name).toBe(true);
  });

  it('sends each alarm in the backup region to that region\'s topic', () => {
    // Defect caught: an alarm notifying a topic in another region, or none,
    // so its state change reaches neither the mailbox nor the admin feed.
    const west = blocks[tree].filter((b) => b.type === 'aws_cloudwatch_metric_alarm' && onProvider(b, 'aws.us_west_2'));
    expect(west.length, 'no alarm in the backup region').toBeGreaterThan(0);
    for (const b of west) {
      for (const key of ['alarm_actions', 'ok_actions']) {
        expect(attr(b, key), `${b.name} ${key}`).toBe('[aws_sns_topic.alarms_us_west_2.arn]');
      }
    }
  });

  it('routes the backup region\'s analyzer findings to that region\'s topic', () => {
    // Defect caught: the us-west-2 analyzer publishes only to its own
    // region's event bus, so a rule in us-east-1 never sees a finding on the
    // disaster-recovery buckets and nobody is told.
    const rule = blocks[tree].find((b) => b.type === 'aws_cloudwatch_event_rule'
      && onProvider(b, 'aws.us_west_2') && b.body.includes('"aws.access-analyzer"'));
    expect(rule, 'no analyzer findings rule in us-west-2').toBeDefined();
    const target = blocks[tree].find((b) => b.type === 'aws_cloudwatch_event_target'
      && b.body.includes(`aws_cloudwatch_event_rule.${rule!.name}.name`));
    expect(target, 'the us-west-2 findings rule has no target').toBeDefined();
    expect(onProvider(target!, 'aws.us_west_2')).toBe(true);
    expect(attr(target!, 'arn')).toBe('aws_sns_topic.alarms_us_west_2.arn');
  });

  it('lets CloudWatch publish to every topic an alarm names directly', () => {
    // Defect caught: a topic policy without the monitoring service's grant,
    // which AWS never adds by default, so the alarm changes state and its
    // notice is refused with no error anyone sees.
    const named = new Set<string>();
    for (const b of blocks[tree].filter((x) => x.type === 'aws_cloudwatch_metric_alarm')) {
      for (const m of b.body.matchAll(/aws_sns_topic\.([a-z0-9_]+)\.arn/g)) named.add(m[1]);
    }
    expect(named.has('alarms_us_west_2'), 'the sweep reached no backup-region topic').toBe(true);
    for (const topic of named) {
      const policy = blocks[tree].find((b) => b.type === 'aws_sns_topic_policy'
        && new RegExp(`^\\s*arn\\s*=\\s*aws_sns_topic\\.${topic}\\.arn`, 'm').test(b.body));
      expect(policy, `${topic} has no topic policy`).toBeDefined();
      const start = policy!.body.indexOf('Sid       = "AllowCloudWatchPublish"');
      expect(start, `${topic} grants CloudWatch nothing`).toBeGreaterThan(-1);
      const next = policy!.body.indexOf('Sid ', start + 4);
      const grant = policy!.body.slice(start, next === -1 ? undefined : next);
      expect(grant, topic).toMatch(/Effect\s*=\s*"Allow"/);
      expect(grant, topic).toMatch(/Principal\s*=\s*\{\s*Service\s*=\s*"cloudwatch\.amazonaws\.com"\s*\}/);
      expect(grant, topic).toMatch(new RegExp(`Resource\\s*=\\s*aws_sns_topic\\.${topic}\\.arn`));
    }
  });
});

describe('account controls in both regions', () => {
  it('declares an external-access analyzer in the account region and in us-west-2', () => {
    // Defect caught: an analyzer sees only its own region, so with one in
    // us-east-1 alone the policies on the disaster-recovery buckets are
    // never analysed.
    const dir = resolve(__dirname, '../../terraform/shared');
    const shared = readdirSync(dir).filter((f) => f.endsWith('.tf'))
      .flatMap((f) => hclBlocks(readFileSync(resolve(dir, f), 'utf8'), 'resource'));
    const analyzers = shared.filter((b) => b.type === 'aws_accessanalyzer_analyzer' && attr(b, 'type') === '"ACCOUNT"');
    expect(analyzers.filter((b) => !/^\s*provider\s*=/m.test(b.body)), 'none in the account region').toHaveLength(1);
    expect(analyzers.filter((b) => onProvider(b, 'aws.us_west_2')), 'none in us-west-2').toHaveLength(1);
  });
});

describe('production-only routing', () => {
  it('publishes the certificate-expiry alarm to the main topic, with no second us-east-1 topic', () => {
    // Defect caught: an alarm on a topic the feed never reads, so a failing
    // certificate renewal is emailed but never shown on the admin console.
    const cert = alarm('production', 'acm_cert_expiry')!;
    expect(attr(cert, 'alarm_actions')).toBe('local.critical_alarm_actions');
    expect(blocks.production.some((b) => b.name === 'alarms_us_east_1')).toBe(false);
  });

  it('watches each host key against its own host\'s address, excluding calls services make for it', () => {
    // Defect caught: a filter that fires on the host's own calls (wrong
    // address), on AWS services acting for the user, or on no host at all.
    const tf = readFileSync(resolve(__dirname, '../../terraform/production/cloudtrail.tf'), 'utf8');
    const filter = hclBlocks(tf, 'resource').find((b) => b.name === 'host_key_off_host' && b.type === 'aws_cloudwatch_log_metric_filter')!;
    expect(filter.body).toMatch(/\$\.userIdentity\.invokedBy NOT EXISTS/);
    expect(filter.body).toMatch(/\$\.sourceIPAddress != \\"\$\{each\.value\.ip\}\\"/);
    expect(filter.body).toMatch(/var\.enable_cloudtrail && var\.enable_host_key_alarm/);
    for (const key of ['production-source-profile', 'production-cwagent-publisher', 'staging-source-profile', 'staging-cwagent-publisher']) {
      expect(tf, key).toContain(`${key} = {`);
    }
    expect(tf).toMatch(/user = "footbag-staging-source-profile"/);
    expect(tf).toMatch(/user = "footbag-staging-cwagent-publisher"/);
  });

  describe('the audit alarm on backup-bucket protection', () => {
    const tf = readFileSync(resolve(__dirname, '../../terraform/production/cloudtrail.tf'), 'utf8');
    const localList = (name: string) => tf.match(new RegExp(`^\\s*${name}\\s*=\\s*(?:concat\\()?([\\s\\S]*?)^\\s*[\\])]\\s*$`, 'm'))?.[1] ?? '';
    const bucketsExpr = localList('backup_protection_buckets');
    const eventList = (name: string) => [...localList(name).matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
    // Each audit alarm over the backup buckets, with the events local it reads.
    const ALARM_LISTS = [
      { key: 'backup-protection-changed', local: 'backup_protection_events' },
      { key: 'backup-access-changed', local: 'backup_access_events' },
    ];
    const events = ALARM_LISTS.flatMap((a) => eventList(a.local));
    const entryOf = (key: string) => tf.match(new RegExp(`^\\s*${key} = \\{([\\s\\S]*?)^\\s*\\}`, 'm'))?.[1] ?? '';
    const s3 = blocks.production.filter((b) => b.type === 'aws_s3_bucket');

    it('watches every disaster-recovery bucket and every bucket replicating into one', () => {
      // Defect caught: a backup bucket, or the bucket it copies, left out of
      // the filter, so a lifecycle rule or policy that quietly empties it
      // raises nothing. The set is read from the replication configurations
      // and the -dr buckets, so a backup bucket added later without the
      // alarm fails here.
      const watched = new Set<string>();
      for (const b of s3.filter((x) => /-dr"$/.test(attr(x, 'bucket') ?? ''))) watched.add(b.name);
      const replications = blocks.production.filter((b) => b.type === 'aws_s3_bucket_replication_configuration');
      expect(replications.length, 'no replication configuration found').toBeGreaterThanOrEqual(3);
      for (const r of replications) {
        const source = r.body.match(/^\s*bucket\s*=\s*aws_s3_bucket\.([a-z0-9_]+)(?:\[0\])?\.id/m)?.[1];
        expect(source, `${r.name} has no source bucket`).toBeDefined();
        watched.add(source!);
        for (const m of r.body.matchAll(/aws_s3_bucket\.([a-z0-9_]+)(?:\[0\])?\.arn/g)) watched.add(m[1]);
      }
      expect(watched.size, 'the sweep found no backup bucket').toBeGreaterThanOrEqual(6);
      for (const name of watched) {
        expect(bucketsExpr, name).toMatch(new RegExp(`aws_s3_bucket\\.${name}(\\[0\\])?\\.bucket\\b`));
      }
    });

    it('fires on each S3 call that could empty a backup or stop it filling, by CloudTrail\'s own event names', () => {
      // Defect caught: a protective setting the filter does not watch, or an
      // API name CloudTrail never records (it records PutBucketLifecycleConfiguration
      // as PutBucketLifecycle), so the alarm can never fire on that change.
      // A bucket deleted, opened by an ACL or re-keyed is as much a lost backup
      // as one whose lifecycle empties it.
      const REQUIRED = [
        'PutBucketPolicy', 'DeleteBucketPolicy', 'PutBucketLifecycle', 'DeleteBucketLifecycle',
        'PutBucketVersioning', 'PutBucketObjectLockConfiguration', 'PutBucketPublicAccessBlock',
        'DeleteBucketPublicAccessBlock', 'PutBucketReplication', 'DeleteBucketReplication',
        'DeleteBucket', 'PutBucketAcl', 'PutBucketEncryption',
      ];
      expect([...events].sort()).toEqual([...REQUIRED].sort());
      for (const apiOnly of ['PutBucketLifecycleConfiguration', 'PutObjectLockConfiguration', 'DeletePublicAccessBlock']) {
        expect(events, apiOnly).not.toContain(apiOnly);
      }
    });

    it('watches the legacy-mirror backup bucket once its gate is on', () => {
      // Defect caught: the only cold copy of the legacy site crawl deleted, or
      // its policy loosened, with no alarm, because its bucket sits outside
      // the replication sweep that finds the other backup buckets.
      expect(bucketsExpr).toMatch(
        /var\.enable_legacy_mirror_backup \? \[aws_s3_bucket\.legacy_mirror_backup\[0\]\.bucket\] : \[\]/,
      );
    });

    it('requires an S3 call, a watched bucket and a watched event together, within the pattern size limit', () => {
      // Defect caught: an "or" where an "and" belongs, so every S3 call in the
      // account, or every call on these buckets, raises the alarm; or a
      // pattern over the 1024 characters CloudWatch Logs accepts, which fails
      // the apply. The pattern is rendered here as Terraform renders it, with
      // every gated bucket on.
      const bucketJoin = 'join(" || ", [for b in local.backup_protection_buckets : "$.requestParameters.bucketName = \\"${b}\\""])';
      const names = [...bucketsExpr.matchAll(/aws_s3_bucket\.([a-z0-9_]+)/g)].map((m) => {
        const raw = attr(s3.find((b) => b.name === m[1])!, 'bucket')!;
        return raw.replace(/^"|"$/g, '').replace('${local.prefix}', 'footbag-production');
      });
      expect(names).toContain('footbag-production-legacy-mirror-backup');
      for (const a of ALARM_LISTS) {
        const pattern = entryOf(a.key).match(/^\s*pattern\s*=\s*(.+)$/m)?.[1] ?? '';
        const eventJoin = `join(" || ", [for e in local.${a.local} : "$.eventName = \\"\${e}\\""])`;
        expect(pattern, a.key).toBe(`"{ $.eventSource = \\"s3.amazonaws.com\\" && (\${${bucketJoin}}) && (\${${eventJoin}}) }"`);
        const rendered = `{ $.eventSource = "s3.amazonaws.com" && (${names.map((n) => `$.requestParameters.bucketName = "${n}"`).join(' || ')}) && (${eventList(a.local).map((e) => `$.eventName = "${e}"`).join(' || ')}) }`;
        expect(rendered.length, `${a.key}: ${rendered}`).toBeLessThanOrEqual(1024);
      }
      // The plan refuses an oversized pattern rather than the apply failing midway.
      const filter = blocks.production.find((b) => b.type === 'aws_cloudwatch_log_metric_filter' && b.name === 'audit')!;
      expect(filter.body).toMatch(/condition\s*=\s*length\(each\.value\.pattern\) <= 1024/);
    });

    it('raises the alerting-disabled alarm when an Access Analyzer is deleted', () => {
      // Defect caught: deleting either region's analyzer silences its findings
      // with no notice, as deleting the GuardDuty detector would.
      const alerting = tf.match(/^\s*alerting-disabled = \{([\s\S]*?)^\s*\}/m)?.[1] ?? '';
      expect(alerting).toMatch(/\(\$\.eventSource = \\"access-analyzer\.amazonaws\.com\\" && \$\.eventName = \\"DeleteAnalyzer\\"\)/);
    });
  });

  it('leaves the account alternate contacts to the shared tree alone', () => {
    // Defect caught: an environment tree declaring the same account-wide
    // contacts as the shared tree, so the two applies overwrite each other.
    for (const tree of ['production', 'staging'] as const) {
      expect(blocks[tree].some((b) => b.type === 'aws_account_alternate_contact'), tree).toBe(false);
    }
  });
});
