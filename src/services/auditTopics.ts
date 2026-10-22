/**
 * The audit log's topics and the one map from action type to topic.
 *
 * The topic is stored as the row's category, which the viewer's topic filter and
 * the monthly summary group on. Callers never choose a category: left to each
 * call site, one topic drifted into several spellings and the filter split them.
 *
 * This module imports nothing, so the test-data row builders can stamp the same
 * category the write path does without loading the database.
 */

export type AuditTopic =
  | 'auth' | 'identity' | 'membership' | 'clubs' | 'payments' | 'pricing' | 'elections'
  | 'moderation' | 'media' | 'freestyle' | 'email' | 'events' | 'alarms' | 'configuration'
  | 'system';

/**
 * A key ending in a dot names a whole namespace; any other key names one action
 * type or a family sharing its prefix. The longest matching key wins, so a
 * specific entry overrides its namespace. The audit catalogue gate parses this
 * list, so each entry stays a one-line literal.
 */
const AUDIT_TOPIC_BY_PREFIX: ReadonlyArray<readonly [string, AuditTopic]> = [
  ['active_player.', 'membership'],
  ['admin.', 'auth'],
  ['admin.club_cleanup.', 'clubs'],
  ['admin.loss_alert_', 'alarms'],
  ['alarm.', 'alarms'],
  ['auth.', 'auth'],
  ['claim.', 'identity'],
  ['club.', 'clubs'],
  ['config.', 'configuration'],
  ['config.price_scheduled', 'pricing'],
  ['email.', 'email'],
  ['email_template.', 'email'],
  ['event.', 'events'],
  ['freestyle.', 'freestyle'],
  ['hof.', 'membership'],
  ['legacy.', 'identity'],
  ['mailing_list.', 'email'],
  ['media.', 'media'],
  ['media.deleted', 'moderation'],
  ['media.flag', 'moderation'],
  ['media.member_gallery_moderated', 'moderation'],
  ['media.tag_retired', 'moderation'],
  ['member.', 'membership'],
  ['member_message.', 'membership'],
  ['payment.', 'payments'],
  ['support.', 'membership'],
  ['support.help_request_', 'identity'],
  ['testkit.', 'system'],
  ['tier.', 'membership'],
  ['vote.', 'elections'],
  ['wizard.', 'membership'],
  ['wizard.club_affiliations.', 'clubs'],
  ['wizard.legacy_claim.', 'identity'],
  ['work_queue.', 'system'],
];

/**
 * The topic an action type is filed under. Throws for an action type no entry
 * covers: a row filed under a guessed topic would vanish from the filter an
 * administrator uses to find it.
 */
export function auditTopicFor(actionType: string): AuditTopic {
  let best: readonly [string, AuditTopic] | null = null;
  for (const entry of AUDIT_TOPIC_BY_PREFIX) {
    if (actionType.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) {
      best = entry;
    }
  }
  if (!best) {
    throw new Error(`audit action_type '${actionType}' has no topic in the audit topic map`);
  }
  return best[1];
}
