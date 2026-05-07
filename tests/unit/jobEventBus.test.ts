/**
 * Unit tests for jobEventBus: pub/sub fan-out for media-job state events.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishJobEvent,
  subscribeToJobEvents,
  listenerCountForTests,
  type JobEvent,
} from '../../src/services/jobEventBus';

function makeEvent(overrides: Partial<JobEvent> = {}): JobEvent {
  return {
    jobId: 'mediajob_test_001',
    state: 'claimed',
    occurredAtIso: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('jobEventBus', () => {
  beforeEach(() => {
    // Listener count is process-global; if a previous test failed to clean up
    // we want to know about it. The bus has no reset in production code, so
    // tests rely on each subscription being unsubscribed in the same test.
    expect(listenerCountForTests()).toBe(0);
  });

  it('delivers events for the subscribed jobId', () => {
    const seen: JobEvent[] = [];
    const unsubscribe = subscribeToJobEvents('mediajob_test_001', (e) => seen.push(e));
    publishJobEvent(makeEvent({ state: 'claimed' }));
    publishJobEvent(makeEvent({ state: 'succeeded', mediaId: 'media_xyz' }));
    expect(seen).toHaveLength(2);
    expect(seen[0].state).toBe('claimed');
    expect(seen[1].state).toBe('succeeded');
    expect(seen[1].mediaId).toBe('media_xyz');
    unsubscribe();
  });

  it('does not cross-deliver events for a different jobId', () => {
    const seen: JobEvent[] = [];
    const unsubscribe = subscribeToJobEvents('mediajob_A', (e) => seen.push(e));
    publishJobEvent(makeEvent({ jobId: 'mediajob_B' }));
    publishJobEvent(makeEvent({ jobId: 'mediajob_A' }));
    expect(seen).toHaveLength(1);
    expect(seen[0].jobId).toBe('mediajob_A');
    unsubscribe();
  });

  it('stops delivering after unsubscribe', () => {
    const seen: JobEvent[] = [];
    const unsubscribe = subscribeToJobEvents('mediajob_X', (e) => seen.push(e));
    publishJobEvent(makeEvent({ jobId: 'mediajob_X' }));
    unsubscribe();
    publishJobEvent(makeEvent({ jobId: 'mediajob_X' }));
    expect(seen).toHaveLength(1);
  });

  it('listener count tracks subscribe/unsubscribe', () => {
    expect(listenerCountForTests()).toBe(0);
    const unsubA = subscribeToJobEvents('A', () => undefined);
    const unsubB = subscribeToJobEvents('B', () => undefined);
    expect(listenerCountForTests()).toBe(2);
    unsubA();
    expect(listenerCountForTests()).toBe(1);
    unsubB();
    expect(listenerCountForTests()).toBe(0);
  });

  it('supports multiple subscribers for the same jobId', () => {
    const seenA: JobEvent[] = [];
    const seenB: JobEvent[] = [];
    const unsubA = subscribeToJobEvents('shared', (e) => seenA.push(e));
    const unsubB = subscribeToJobEvents('shared', (e) => seenB.push(e));
    publishJobEvent(makeEvent({ jobId: 'shared', state: 'claimed' }));
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    unsubA();
    unsubB();
  });
});
