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

  it('leaves the account alternate contacts to the shared tree alone', () => {
    // Defect caught: an environment tree declaring the same account-wide
    // contacts as the shared tree, so the two applies overwrite each other.
    for (const tree of ['production', 'staging'] as const) {
      expect(blocks[tree].some((b) => b.type === 'aws_account_alternate_contact'), tree).toBe(false);
    }
  });
});
