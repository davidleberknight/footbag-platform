// The outbox backlog alarm in Terraform fires when the OutboxDepth metric stays
// above 50. A depth above that is the only one an operator acts on, so only it is
// logged at warn, the level production keeps and the metric filter reads; a normal
// drain of a few messages logs at debug and the metric's default of 0 covers it.
// Change this number and both environments' outbox_backlog alarm threshold together.
export const OUTBOX_BACKLOG_ALARM_DEPTH = 50;

export function outboxDepthLevel(depth: number): 'warn' | 'debug' {
  return depth > OUTBOX_BACKLOG_ALARM_DEPTH ? 'warn' : 'debug';
}
