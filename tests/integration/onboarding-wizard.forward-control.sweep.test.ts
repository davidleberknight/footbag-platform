/**
 * Every onboarding page a registrant can land on offers a way forward.
 *
 * The catalog is seeded whole, as /dev/personas seeds it, and every persona
 * still signing up is walked through each wizard task the wizard will render
 * for them. Each rendered task page must carry that task's own completing
 * control: the save on personal details, the two answers (or, once answered,
 * the carry-on link) on the claim step, and a card's save, the disambiguation
 * confirm, the continue link or the no-club answer on the club step. A control
 * that only helps the member search (an anchor form, a claim on one card) does
 * not count, because a member with nothing to claim must still be able to
 * finish.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';
import { createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3407');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  for (const spec of CANONICAL_PERSONAS) {
    if (!spec.blockedBy) seedPersona(db, spec);
  }
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const TASKS = ['personal_details', 'legacy_claim', 'club_affiliations'] as const;
type Task = typeof TASKS[number];

const FORWARD: Record<Task, RegExp[]> = {
  personal_details: [
    /<form method="POST" action="\/register\/wizard\/personal_details\/submit"[\s\S]*?<button type="submit"[^>]*>Save and (Continue|Complete) Onboarding<\/button>[\s\S]*?<\/form>/,
  ],
  legacy_claim: [
    /<form method="POST" action="\/register\/wizard\/legacy_claim\/continue-without-linking"[^>]*>(?:(?!<\/form>)[\s\S])*value="never_had_one"[^>]*>I Never Had an Old Account<\/button>(?:(?!<\/form>)[\s\S])*value="cannot_find_it"[^>]*>I Had One but Cannot Find It<\/button>/,
    /<a href="\/register\/wizard\/[a-z_]+">Carry on with signing up<\/a>/,
  ],
  club_affiliations: [
    /<button type="submit"[^>]*>(Save Answers|Confirm Selection|Finish Without a Club)<\/button>/,
    /<a href="\/register\/wizard\/[a-z_]+" class="btn btn-primary">Continue<\/a>/,
  ],
};

describe('onboarding forward controls', () => {
  // Defect caught: a wizard page renders with no control that answers its
  // task, so a registrant is stranded pending with no way to finish signing up.
  it('every task page a persona still signing up can reach carries its completing control', async () => {
    const reached: Record<Task, number> = { personal_details: 0, legacy_claim: 0, club_affiliations: 0 };
    const stranded: string[] = [];
    for (const spec of CANONICAL_PERSONAS) {
      if (spec.blockedBy || !spec.onboardingTasks) continue;
      const memberId = `member_persona_${spec.slug}`;
      const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
      for (const task of TASKS) {
        const res = await request(createApp()).get(`/register/wizard/${task}`).set('Cookie', cookie);
        if (res.status !== 200) continue;
        reached[task] += 1;
        if (!FORWARD[task].some((re) => re.test(res.text))) stranded.push(`${spec.slug} on ${task}`);
      }
    }
    expect(stranded, 'pages with no way forward').toEqual([]);
    for (const task of TASKS) {
      expect(reached[task], `no persona reached ${task}, so the sweep checked nothing there`).toBeGreaterThan(0);
    }
  });
});
