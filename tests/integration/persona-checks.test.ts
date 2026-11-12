/**
 * Persona checks, run in process: each seeded persona's story journeys.
 *
 * The stack starts as every running stack is, with the worker's own job runs
 * behind it. The personas are then built the way a tester builds them, through
 * the persona refresh form, which also runs any scheduled job a persona's
 * story ends in.
 * Each check then signs in as its persona through the persona switch and reads
 * the real pages. A check that writes gets a fresh refresh first, so no check
 * depends on what another left behind.
 *
 * Two declarations are related here as well: a persona's stories, as the
 * persona catalog lists them, and the success criteria those stories carry.
 * Every criterion of a story a persona's checks cover has a check, and every
 * check's criterion is still worded as the story words it, so a reworded or
 * added criterion fails here rather than going unproved.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4894');
process.env.FOOTBAG_ENV = 'development';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { supertestFetcher, switchTo, type Fetcher } from '../fixtures/crawl/core';
import { PERSONA_CHECKS, type PersonaCheckContext, type CapturedMail } from '../fixtures/crawl/personaChecks';
import { insertMember } from '../fixtures/factories';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';

const STORIES_FILE = path.resolve(__dirname, '..', '..', 'docs', 'USER_STORIES.md');
const TIMEOUT_MS = 120_000;

let fetcher: Fetcher;

async function refreshPersonas(): Promise<void> {
  const res = await fetcher.post('/dev/personas/refresh', null);
  expect(res.status, 'the persona refresh redirects back to the listing').toBe(302);
  expect(res.headers.location).toBe('/dev/personas');
}

async function contextFor(persona: string): Promise<PersonaCheckContext> {
  const cookie = await switchTo(fetcher, persona);
  expect(cookie, `the persona switch signs in as ${persona}`).not.toBeNull();
  return {
    async page(p) {
      const res = await fetcher.get(p, cookie);
      expect(res.status, `${p} renders for ${persona}`).toBe(200);
      return res.body;
    },
    rows<T>(sql: string, ...params: unknown[]): T[] {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      try {
        return db.prepare(sql).all(...params) as T[];
      } finally {
        db.close();
      }
    },
    async drainMail(): Promise<CapturedMail[]> {
      const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
      const { getStubSesAdapterForTests } = await import('../../src/adapters/sesAdapter');
      const before = getStubSesAdapterForTests()?.sentMessages.length ?? 0;
      await operationsPlatformService.runEmailWorker();
      const stub = getStubSesAdapterForTests();
      expect(stub, 'the stub mail provider is in use').not.toBeNull();
      return stub!.sentMessages.slice(before).map((m) => ({ to: m.to, subject: m.subject, bodyText: m.bodyText }));
    },
  };
}

/** A story's success criteria, as the stories document words them. */
function criteriaOf(story: string): string[] {
  const text = fs.readFileSync(STORIES_FILE, 'utf8');
  const start = text.indexOf(`\n### ${story}\n`);
  expect(start, `${story} is a story`).toBeGreaterThan(-1);
  const rest = text.slice(start + story.length + 6);
  const end = rest.search(/\n#{2,3} /);
  const section = end === -1 ? rest : rest.slice(0, end);
  const after = section.slice(section.indexOf('Success Criteria:'));
  return after.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A serving administrator, so the worker's administrator-loss sweep is quiet.
  insertMember(db, {
    id: 'pc_admin', slug: 'pc_admin', login_email: 'pc-admin@example.com',
    is_admin: 1, last_login_at: new Date().toISOString(),
  });
  db.close();
  // The state every running stack is in: the worker already ran its jobs, the
  // nightly report and the Treasurer digest included, two days ago.
  const { runDueJobs } = await import('../../src/services/jobRegistry');
  await runDueJobs({
    now: new Date(Date.now() - 2 * 86_400_000),
    reapExpiredMediaJobs: async () => ({ reclaimedIds: [] }),
  });
  // And its outbox drain delivered that digest, as the worker's loop does.
  const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
  await operationsPlatformService.runEmailWorker();
  const createApp = await importApp();
  fetcher = supertestFetcher(createApp());
  await refreshPersonas();
}, TIMEOUT_MS);

afterAll(() => cleanupTestDb(dbPath));

describe('every persona check proves a criterion its stories still carry', () => {
  it('covers every success criterion of each checked persona\'s stories, in the stories\' own words', () => {
    // Defect: a criterion added or reworded in a story goes unproved while every check stays green.
    for (const persona of new Set(PERSONA_CHECKS.map((c) => c.persona))) {
      const spec = CANONICAL_PERSONAS.find((s) => s.slug === persona);
      expect(spec, `${persona} is in the persona catalog`).toBeDefined();
      const checked = PERSONA_CHECKS.filter((c) => c.persona === persona);
      for (const story of spec!.stories ?? []) {
        expect(checked.filter((c) => c.story === story).map((c) => c.criterion).sort(), `${persona}: ${story}`)
          .toEqual([...criteriaOf(story)].sort());
      }
      for (const c of checked) {
        expect(spec!.stories, `${persona} carries the story ${c.story}`).toContain(c.story);
      }
    }
  });
});

const readOnly = PERSONA_CHECKS.filter((c) => c.writes === false);
const writing = PERSONA_CHECKS.filter((c) => c.writes !== false);

describe('persona checks that only read', () => {
  for (const check of readOnly) {
    it(`${check.persona}, ${check.story}: ${check.criterion.slice(0, 90)}`, async () => {
      // Defect: see the check's own defect sentence.
      await check.run(await contextFor(check.persona));
    }, TIMEOUT_MS);
  }
});

describe('persona checks that write, each after a fresh refresh', () => {
  for (const check of writing) {
    it(`${check.persona}, ${check.story}: ${check.criterion.slice(0, 90)}`, async () => {
      // Defect: see the check's own defect sentence.
      await refreshPersonas();
      await check.run(await contextFor(check.persona));
    }, TIMEOUT_MS);
  }
});
