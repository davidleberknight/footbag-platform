/**
 * Production's origin TLS infrastructure: the role certbot assumes to prove
 * control of the origin's name, and the alarm that watches the certificate's
 * expiry.
 *
 * The role writes one TXT record, the DNS-01 challenge for the origin's own
 * name, and nothing else in the zone; a wider grant would turn a compromise of
 * the host into control of the apex, www and the mail records. The alarm is the
 * only watcher of a certificate that lives on the host rather than in ACM.
 * Both exist only once the origin record does, so a plan before the zone move
 * changes nothing.
 *
 * Read from the HCL as text: the suite has no initialized tree and no
 * credential, by design. scripts/provision-origin-tls.sh simulates the live
 * role's policy before it issues.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const iam = readFileSync(resolve(__dirname, '../../terraform/production/iam.tf'), 'utf-8');
const monitoring = readFileSync(resolve(__dirname, '../../terraform/production/monitoring.tf'), 'utf-8');
const outputs = readFileSync(resolve(__dirname, '../../terraform/production/outputs.tf'), 'utf-8');

function resource(tf: string, type: string, name: string): string {
  const start = tf.indexOf(`resource "${type}" "${name}"`);
  expect(start, `${type}.${name}`).toBeGreaterThan(-1);
  const next = tf.indexOf('\nresource "', start + 1);
  return tf.slice(start, next === -1 ? undefined : next);
}

describe('the origin certificate role', () => {
  const role = resource(iam, 'aws_iam_role', 'origin_tls');
  const policy = resource(iam, 'aws_iam_role_policy', 'origin_tls_challenge');

  it('exists only once the origin record does', () => {
    // Defect caught: a role able to write to the zone created before the
    // zone is ours, or one left behind when the record is withdrawn.
    expect(role).toMatch(/\n\s+count\s+=\s+var\.enable_origin_record \? 1 : 0\n/);
    expect(policy).toMatch(/\n\s+count\s+=\s+var\.enable_origin_record \? 1 : 0\n/);
  });

  it('is assumed by the host source-profile user and no one else', () => {
    // Defect caught: a new access key minted for certbot, which would need
    // vaulting and carrying through every rebuild, or a trust any principal
    // in the account could use.
    expect(role).toMatch(/Principal\s+=\s+\{ AWS = aws_iam_user\.source_profile\.arn \}/);
    const assume = resource(iam, 'aws_iam_user_policy', 'source_profile_assume_role');
    expect(assume).toMatch(/aws_iam_role\.origin_tls\[\*\]\.arn/);
  });

  it('may change only the TXT record at the origin\'s challenge name, and requires both keys present', () => {
    // Defect caught: certbot's role able to rewrite the apex, www or MX
    // records, or a request that omits the keys slipping through
    // ForAllValues, which is satisfied by an empty set.
    expect(iam).toMatch(/origin_tls_challenge_name = "_acme-challenge\.origin\.\$\{var\.domain_name\}"/);
    const write = /Sid\s+=\s+"WriteTheChallengeRecordOnly"([\s\S]*?)\n\s{6}\},/.exec(policy)?.[1] ?? '';
    expect(write).toMatch(/Action\s+=\s+"route53:ChangeResourceRecordSets"/);
    expect(write).toMatch(/Resource\s+=\s+"arn:aws:route53:::hostedzone\/\$\{local\.zone_id\}"/);
    expect(write).toMatch(/"ForAllValues:StringEquals" = \{\s*"route53:ChangeResourceRecordSetsNormalizedRecordNames" = \[local\.origin_tls_challenge_name\]\s*"route53:ChangeResourceRecordSetsRecordTypes"\s+= \["TXT"\]/);
    expect(write).toMatch(/"Null" = \{\s*"route53:ChangeResourceRecordSetsNormalizedRecordNames" = "false"\s*"route53:ChangeResourceRecordSetsRecordTypes"\s+= "false"/);
  });

  it('grants no other Route 53 write', () => {
    // Defect caught: a later edit widening the role to zone or record
    // management beside the one challenge change.
    const actions = [...policy.matchAll(/"(route53:[A-Za-z]+)"/g)].map((m) => m[1]).filter((a) => !a.includes('ChangeResourceRecordSets'));
    expect(new Set(actions)).toEqual(new Set(['route53:ListHostedZones', 'route53:GetChange']));
  });

  it('is published for the provisioning script, empty while it does not exist', () => {
    // Defect caught: the script assuming a role name of its own making, or
    // reading a stale value when the record is off.
    expect(outputs).toMatch(/output "origin_tls_role_arn" \{[\s\S]*?value\s+=\s+var\.enable_origin_record \? aws_iam_role\.origin_tls\[0\]\.arn : ""/);
    expect(outputs).toMatch(/output "origin_hostname" \{[\s\S]*?value\s+=\s+var\.enable_origin_record \? aws_route53_record\.origin_a\[0\]\.fqdn : ""/);
  });
});

describe('the origin certificate expiry alarm', () => {
  const alarm = resource(monitoring, 'aws_cloudwatch_metric_alarm', 'origin_cert_expiry');

  it('is off until its own gate is set, so it never fires before a certificate exists', () => {
    // Defect caught: a breaching-on-missing alarm applied before the
    // certificate is issued, paging the watch group at once.
    expect(alarm).toMatch(/\n\s+count\s+=\s+var\.enable_origin_cert_alarm \? 1 : 0\n/);
    expect(monitoring).toMatch(/variable "enable_origin_cert_alarm" \{[\s\S]*?default\s+=\s+false/);
  });

  it('pages the watch group below 14 days left, and when the reading stops', () => {
    // Defect caught: a failing renewal found only when CloudFront starts
    // answering 502, because the alarm watched the wrong metric, published
    // only to the warning topic, or treated a missing reading as fine.
    expect(alarm).toMatch(/metric_name\s+=\s+"origin_cert_days_to_expiry"/);
    expect(alarm).toMatch(/namespace\s+=\s+local\.cwagent_namespace/);
    expect(alarm).toMatch(/comparison_operator\s+=\s+"LessThanThreshold"/);
    expect(alarm).toMatch(/threshold\s+=\s+14\n/);
    expect(alarm).toMatch(/statistic\s+=\s+"Minimum"/);
    expect(alarm).toMatch(/treat_missing_data\s+=\s+"breaching"/);
    expect(alarm).toMatch(/alarm_actions\s+=\s+local\.critical_alarm_actions/);
  });
});
