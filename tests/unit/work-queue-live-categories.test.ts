/**
 * The admin dashboard shows one row per work-queue category, including a zero
 * where a queue happens to be empty. That only tells the truth for a category
 * something can actually enqueue into: a permanent zero for a category no
 * producer writes to reads as "nothing waiting" when the fact is "this cannot
 * happen yet", and an administrator works a queue down to zero precisely
 * because zero is supposed to mean finished.
 *
 * The list of live categories is therefore maintained by hand, and this test
 * is what keeps it honest. It reads every enqueue call site in the application
 * source and fails if the two disagree in either direction: a new producer
 * whose category is missing from the list would enqueue work into a queue the
 * dashboard never shows, and a category left on the list after its producer
 * goes away would show a zero forever.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { LIVE_WORK_QUEUE_CATEGORIES, WORK_QUEUE_CATEGORY_LABELS } from '../../src/services/adminWorkQueueService';

const SRC = path.join(process.cwd(), 'src');

function allTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allTs(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

/** Every `queueCategory: '<literal>'` the application source hands to enqueue. */
function enqueuedCategories(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of allTs(SRC)) {
    const txt = fs.readFileSync(file, 'utf8');
    for (const m of txt.matchAll(/queueCategory:\s*'([a-z_]+)'/g)) {
      const category = m[1];
      const sites = found.get(category) ?? [];
      sites.push(path.relative(process.cwd(), file));
      found.set(category, sites);
    }
  }
  return found;
}

describe('live work-queue categories', () => {
  it('names exactly the categories the application can enqueue into', () => {
    const produced = enqueuedCategories();
    // A source tree with no matches at all would make this test pass vacuously
    // while proving nothing, so the scan has to find something first.
    expect(produced.size).toBeGreaterThan(0);

    expect([...produced.keys()].sort()).toEqual([...LIVE_WORK_QUEUE_CATEGORIES].sort());
  });

  it('gives every live category a display label', () => {
    for (const category of LIVE_WORK_QUEUE_CATEGORIES) {
      expect(WORK_QUEUE_CATEGORY_LABELS[category], `no label for ${category}`).toBeTruthy();
    }
  });

  it('keeps labels for categories that are not live yet', () => {
    // The label map is deliberately wider than the live list: the schema admits
    // these categories and the surfaces that would fill them are still to be
    // built. Dropping a label would mean the first item enqueued after one of
    // those lands renders its raw category slug.
    for (const category of ['events', 'media', 'elections', 'club_leadership']) {
      expect(WORK_QUEUE_CATEGORY_LABELS[category], `no label for ${category}`).toBeTruthy();
      expect(LIVE_WORK_QUEUE_CATEGORIES).not.toContain(category);
    }
  });
});
