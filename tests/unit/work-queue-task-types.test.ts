/**
 * The admin work queue renders each item from its task type's declaration: what
 * the item is called, what the administrator may do about it, and what evidence
 * the card shows. A type the application enqueues but never declares would reach
 * an administrator as a card with no control on it, readable and impossible to
 * close, which is exactly what happened while task types were spread across a
 * predicate, a view-model boolean and a template branch.
 *
 * This test reads every task type the application source hands to the enqueue
 * path and fails if the declaration table does not cover it, and it holds every
 * declaration to carrying at least one action. The runtime assertion in the
 * enqueue path refuses the row for the same reason; this is what says so before
 * anything is deployed, naming the file that would have raised it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  WORK_QUEUE_TASK_TYPES,
  workQueueDescriptorFor,
  workQueueActionFor,
} from '../../src/services/workQueueTaskTypes';
import { WORK_QUEUE_CATEGORY_LABELS } from '../../src/services/adminWorkQueueService';

const SRC = path.join(process.cwd(), 'src');

function allTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allTs(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

/** Every `taskType: '<literal>'` the application source hands to enqueue. */
function enqueuedTaskTypes(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of allTs(SRC)) {
    const txt = fs.readFileSync(file, 'utf8');
    for (const m of txt.matchAll(/taskType:\s*'([a-z_]+)'/g)) {
      const taskType = m[1];
      const sites = found.get(taskType) ?? [];
      sites.push(path.relative(process.cwd(), file));
      found.set(taskType, sites);
    }
  }
  return found;
}

describe('work-queue task-type declarations', () => {
  it('declares every task type the application can enqueue', () => {
    const produced = enqueuedTaskTypes();
    // A source tree with no matches at all would make this pass vacuously while
    // proving nothing, so the scan has to find something first.
    expect(produced.size).toBeGreaterThan(0);

    for (const [taskType, sites] of produced) {
      expect(
        workQueueDescriptorFor(taskType),
        `${taskType} is enqueued by ${sites.join(', ')} with no declaration`,
      ).not.toBeNull();
    }
  });

  it('gives every declared type an action, so no card can render with none', () => {
    for (const [taskType, descriptor] of Object.entries(WORK_QUEUE_TASK_TYPES)) {
      expect(descriptor.actions.length, `${taskType} declares no action`).toBeGreaterThan(0);
    }
  });

  it('puts every declared type in a category the queue page can label', () => {
    for (const [taskType, descriptor] of Object.entries(WORK_QUEUE_TASK_TYPES)) {
      expect(
        WORK_QUEUE_CATEGORY_LABELS[descriptor.queueCategory],
        `${taskType} sits in category ${descriptor.queueCategory}, which has no label`,
      ).toBeTruthy();
    }
  });

  it('names at least one entity type per declaration, so a corrupt row is detectable', () => {
    for (const [taskType, descriptor] of Object.entries(WORK_QUEUE_TASK_TYPES)) {
      expect(descriptor.entityTypes.length, `${taskType} names no entity type`).toBeGreaterThan(0);
    }
  });

  it('keeps each type\'s action keys distinct, so an action resolves to one declaration', () => {
    for (const [taskType, descriptor] of Object.entries(WORK_QUEUE_TASK_TYPES)) {
      const keys = descriptor.actions
        .filter((a) => a.kind !== 'elsewhere')
        .map((a) => (a as { key: string }).key);
      expect(new Set(keys).size, `${taskType} declares a duplicate action key`).toBe(keys.length);
    }
  });

  it('looks an action up by its key and answers null for one the type does not have', () => {
    expect(workQueueActionFor('member_contact_request', 'resolve')?.kind).toBe('decide');
    expect(workQueueActionFor('member_contact_request', 'dismiss')).toBeNull();
    expect(workQueueActionFor('auto_link_match', 'dismiss')?.kind).toBe('close');
    expect(workQueueActionFor('not_a_task_type', 'resolve')).toBeNull();
  });

  it('answers null for an undeclared type rather than inventing a descriptor', () => {
    expect(workQueueDescriptorFor('not_a_task_type')).toBeNull();
  });
});
