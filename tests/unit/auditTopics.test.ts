import { describe, it, expect } from 'vitest';
import { auditTopicFor } from '../../src/services/auditTopics';

// Contract: an audit row's category is derived from its action type through one
// map, so the viewer's topic filter and the monthly summary group every row of a
// topic together, and an action type the map does not cover is refused rather
// than filed under a guess.
describe('auditTopicFor', () => {
  it('files a specific action type under its own entry, not its namespace', () => {
    // If the namespace won, a takedown would hide among ordinary uploads in the
    // filter an administrator uses to review moderation.
    expect(auditTopicFor('media.flagged')).toBe('moderation');
    expect(auditTopicFor('media.member_uploaded')).toBe('media');
    // A price change filed under configuration would vanish from the pricing view.
    expect(auditTopicFor('config.price_scheduled')).toBe('pricing');
    expect(auditTopicFor('config.updated')).toBe('configuration');
  });

  it('lets a nested namespace override its parent', () => {
    expect(auditTopicFor('admin.club_cleanup.archive')).toBe('clubs');
    expect(auditTopicFor('admin.role_granted')).toBe('auth');
    expect(auditTopicFor('wizard.legacy_claim.never_had_account')).toBe('identity');
    expect(auditTopicFor('wizard.complete')).toBe('membership');
  });

  it('refuses an action type no entry covers', () => {
    expect(() => auditTopicFor('ghost.arrived')).toThrow(/has no topic/);
  });
});
