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
  WORK_QUEUE_TOPICS,
  WORK_QUEUE_TOPIC_KEYS,
  WORK_QUEUE_KINDS,
  workQueueDescriptorFor,
  workQueueActionFor,
  kindOf,
  taskTypesFor,
} from '../../src/services/workQueueTaskTypes';

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

  // A type whose kind is missing from the registry has no place on the queue
  // page or the dashboard, and a type with an empty brief reaches a new
  // administrator with nothing saying what it is or what to do about it.
  it('gives every declared type a registered kind and a what, why and what-to-do sentence', () => {
    const registered = new Set(WORK_QUEUE_KINDS.map((k) => k.kind));
    for (const [taskType, descriptor] of Object.entries(WORK_QUEUE_TASK_TYPES)) {
      expect(registered.has(descriptor.kind), `${taskType} declares unregistered kind ${descriptor.kind}`).toBe(true);
      for (const part of ['what', 'why', 'todo'] as const) {
        const text = descriptor.brief[part];
        expect(text.trim().length, `${taskType} has an empty brief.${part}`).toBeGreaterThan(0);
        // Administrator-facing text follows the site's em-dash restriction.
        expect(text.includes('—'), `${taskType} brief.${part} carries an em dash`).toBe(false);
      }
    }
  });

  // A Team Alert with no template would be promised to every administrator's
  // inbox and never sent; a routine type naming a template would email the
  // whole team about something the digest is meant to carry.
  it('names an alert template exactly on the Team Alert types', () => {
    for (const [taskType, descriptor] of Object.entries(WORK_QUEUE_TASK_TYPES)) {
      expect(
        descriptor.alertTemplate !== null,
        `${taskType} is ${descriptor.kind} with alert template ${String(descriptor.alertTemplate)}`,
      ).toBe(descriptor.kind === 'team_alert');
    }
  });

  // A request a member is waiting on that sat under Housekeeping would drop out
  // of the band the dashboard raises for people waiting; a routine type filed
  // as a Team Alert would skip the digest and the stale escalation.
  it('files the member requests as Someone Is Waiting and the administrator loss as the one Team Alert', () => {
    expect(taskTypesFor('waiting', null).sort()).toEqual(
      ['announcement_review', 'content_report', 'member_contact_request', 'member_link_help_request', 'sanction_request'],
    );
    expect(taskTypesFor('team_alert', null)).toEqual(['admin_loss_recruitment']);
    expect(kindOf('payout_failed')).toBe('housekeeping');
    expect(kindOf('needs_organizer')).toBe('housekeeping');
    expect(kindOf('not_a_task_type')).toBeNull();
  });

  // The queue narrows a kind to one area or to the shared items; a wrong
  // narrowing would show an area owner another area's work, or hide a shared
  // matter from the Shared view.
  it('narrows a kind to one area, to the shared types, or not at all', () => {
    expect(taskTypesFor('waiting', 'membership').sort()).toEqual(
      ['member_contact_request', 'member_link_help_request'],
    );
    expect(taskTypesFor('waiting', 'moderation').sort()).toEqual(['announcement_review', 'content_report']);
    // A sanction request filed anywhere but the sanctioning area would miss the
    // Sanctioning filter, its owner's view and the area's digest.
    expect(taskTypesFor('waiting', 'sanctioning')).toEqual(['sanction_request']);
    expect(taskTypesFor('team_alert', 'shared')).toEqual(['admin_loss_recruitment']);
    expect(taskTypesFor('team_alert', 'finance')).toEqual([]);
    expect(taskTypesFor('housekeeping', 'shared')).toEqual(['needs_organizer']);
    expect(taskTypesFor('housekeeping', 'platform')).toEqual(['media_takedown_storage_removal']);
  });

  // ordering-is-the-contract: the queue and the dashboard show the kinds in
  // this order, Team Alert first, so the most pressing work is read first.
  it('registers the kinds Team Alert first, then Someone Is Waiting, then Housekeeping', () => {
    expect(WORK_QUEUE_KINDS.map((k) => k.kind)).toEqual(['team_alert', 'waiting', 'housekeeping']);
    for (const k of WORK_QUEUE_KINDS) {
      expect(k.what.trim().length, `${k.kind} has no what`).toBeGreaterThan(0);
      expect(k.why.trim().length, `${k.kind} has no why`).toBeGreaterThan(0);
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
    expect(workQueueActionFor('admin_loss_recruitment', 'dismiss')?.kind).toBe('close');
    expect(workQueueActionFor('not_a_task_type', 'resolve')).toBeNull();
  });

  it('answers null for an undeclared type rather than inventing a descriptor', () => {
    expect(workQueueDescriptorFor('not_a_task_type')).toBeNull();
  });

  // An administrator lost and an event left without an organizer are every
  // administrator's matter; filing either under one area would show it as one
  // owner's job and send it to that area's group alone.
  it('keeps the shared matters out of every area', () => {
    expect(WORK_QUEUE_TASK_TYPES.admin_loss_recruitment.routeTopic).toBeNull();
    expect(WORK_QUEUE_TASK_TYPES.needs_organizer.routeTopic).toBeNull();
  });

  // The area digest goes to the address in the registry. One that differs from
  // the canonical address IFPA created as a group is mail that reaches nobody,
  // and a canonical queue address missing from the registry is an area whose
  // switch can never send anything.
  it('holds every area address to the canonical address list, both ways', () => {
    const canonical = fs.readFileSync(path.join(process.cwd(), 'docs', 'DESIGN_DECISIONS.md'), 'utf8');
    const listed = new Set(
      [...canonical.matchAll(/`(queue-[a-z]+@footbag\.org)`/g)].map((m) => m[1]),
    );
    expect(listed.size).toBeGreaterThan(0);
    const registry = new Set(WORK_QUEUE_TOPIC_KEYS.map((t) => WORK_QUEUE_TOPICS[t].address));
    expect([...registry].sort()).toEqual([...listed].sort());
  });
});
