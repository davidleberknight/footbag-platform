/**
 * AWS Health alerting that survives an impairment of the primary region.
 *
 * Every other path that tells an operator something is wrong lives in the
 * primary region, so when that region is impaired the site goes down and
 * nothing says so. AWS delivers each primary-region Health event to us-west-2
 * as well, as that region's designated backup, so a rule there reaches a person
 * when the primary region cannot. Global-service events go to the primary
 * region only, which is why the primary rule stays.
 *
 * Each link of the backup path fails silently: a rule with no target, a target
 * on the primary-region topic (an EventBridge rule reaches another region only
 * through an event bus), a topic EventBridge may not publish to, a topic nobody
 * is subscribed to. Each case below pins one link, in both trees, since staging
 * proves the path before production carries it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hclBlocks, onProvider, type HclBlock } from '../fixtures/hclBlocks';

const trees = ['staging', 'production'].map((tree) => ({
  tree,
  blocks: hclBlocks(
    readFileSync(resolve(__dirname, `../../terraform/${tree}/sns.tf`), 'utf8'),
    'resource',
  ),
}));

function healthRules(blocks: HclBlock[]) {
  return blocks.filter(
    (b) => b.type === 'aws_cloudwatch_event_rule' && /source\s*=\s*\["aws\.health"\]/.test(b.body),
  );
}

function backupTopic(blocks: HclBlock[]) {
  const topic = blocks.find(
    (b) => b.type === 'aws_sns_topic' && onProvider(b, 'aws.us_west_2')
      && /name\s*=\s*"\$\{local\.prefix\}-alarms-usw2"/.test(b.body),
  );
  expect(topic, 'no us-west-2 alarm topic').toBeDefined();
  return topic!;
}

describe.each(trees)('AWS Health alerting: $tree', ({ blocks }) => {
  it('keeps a primary-region rule, the only one that receives global-service events', () => {
    const primary = healthRules(blocks).filter((b) => !/^\s*provider\s*=/m.test(b.body));
    expect(primary).toHaveLength(1);
  });

  it('has a us-west-2 rule targeting a us-west-2 topic', () => {
    const rule = healthRules(blocks).find((b) => onProvider(b, 'aws.us_west_2'));
    expect(rule, 'no us-west-2 Health rule').toBeDefined();
    const topic = backupTopic(blocks);

    const target = blocks.find(
      (b) => b.type === 'aws_cloudwatch_event_target'
        && b.body.includes(`aws_cloudwatch_event_rule.${rule!.name}.name`),
    );
    expect(target, 'the us-west-2 rule has no target').toBeDefined();
    expect(onProvider(target!, 'aws.us_west_2')).toBe(true);
    expect(target!.body).toMatch(new RegExp(`arn\\s*=\\s*aws_sns_topic\\.${topic.name}\\.arn`));
  });

  it('lets EventBridge from this account publish to the us-west-2 topic', () => {
    const topic = backupTopic(blocks);
    const policy = blocks.find(
      (b) => b.type === 'aws_sns_topic_policy'
        && b.body.includes(`aws_sns_topic.${topic.name}.arn`),
    );
    expect(policy, 'the us-west-2 topic has no policy').toBeDefined();
    expect(onProvider(policy!, 'aws.us_west_2')).toBe(true);
    // One statement, from its Sid to the next: a grant on another topic, or a
    // deny, would leave EventBridge's publish refused with no error anyone sees.
    const start = policy!.body.indexOf('Sid       = "AllowEventBridgePublish"');
    expect(start, 'no AllowEventBridgePublish statement').toBeGreaterThan(-1);
    const next = policy!.body.indexOf('Sid ', start + 4);
    const grant = policy!.body.slice(start, next === -1 ? undefined : next);
    expect(grant).toMatch(/Effect\s*=\s*"Allow"/);
    expect(grant).toMatch(/Principal\s*=\s*\{\s*Service\s*=\s*"events\.amazonaws\.com"\s*\}/);
    expect(grant).toMatch(/Action\s*=\s*"SNS:Publish"/);
    expect(grant).toMatch(new RegExp(`Resource\\s*=\\s*aws_sns_topic\\.${topic.name}\\.arn`));
    expect(grant).toMatch(/"AWS:SourceAccount"\s*=\s*var\.aws_account_id/);
  });

  it('emails every destination the primary-region alarm topics email, renewable the same way', () => {
    const topic = backupTopic(blocks);
    const isEmail = (b: HclBlock) => /protocol\s*=\s*"email"/.test(b.body);
    const subscriptions = blocks.filter(
      (b) => b.type === 'aws_sns_topic_subscription' && isEmail(b)
        && b.body.includes(`aws_sns_topic.${topic.name}.arn`),
    );
    const endpoints = (list: HclBlock[]) =>
      list.map((b) => b.body.match(/endpoint\s*=\s*(var\.[a-z_]+)/)?.[1]).sort();
    // The account mailbox on the main topic and the watch group on the critical
    // topic: a Health notice needs someone to act, so both receive it.
    const primary = blocks.filter(
      (b) => b.type === 'aws_sns_topic_subscription' && isEmail(b)
        && /aws_sns_topic\.alarms(_critical)?\.arn/.test(b.body),
    );
    // Derived from the primary topics, so a destination added there and
    // forgotten here fails rather than passing on a stale list.
    expect(endpoints(primary).length).toBeGreaterThan(0);
    expect(endpoints(subscriptions)).toEqual(endpoints(primary));
    // Each destination exists under the same condition as on the primary topic,
    // so an optional address unset there is not subscribed empty here.
    const gate = (b: HclBlock) => b.body.match(/^\s*count\s*=\s*(.+)$/m)?.[1].replace(/\s+/g, ' ').trim() ?? 'always';
    for (const s of subscriptions) {
      expect(onProvider(s, 'aws.us_west_2'), `${s.name} is not in us-west-2`).toBe(true);
      expect(s.body).toMatch(/replace_triggered_by\s*=\s*\[terraform_data\.alarm_email_generation\]/);
      const endpoint = s.body.match(/endpoint\s*=\s*(var\.[a-z_]+)/)?.[1];
      const twin = primary.find((p) => p.body.match(/endpoint\s*=\s*(var\.[a-z_]+)/)?.[1] === endpoint)!;
      expect(gate(s), `${s.name} is gated differently from ${twin.name}`).toBe(gate(twin));
    }
  });
});
