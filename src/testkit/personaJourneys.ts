/**
 * The persona journeys: what people and the scheduler do to some personas
 * after the seed commits, run for real so each persona holds the state a
 * running site would hold, not one only a future job or a person's click
 * would produce.
 *
 * The seed writes rows directly. A few states are reached only through an
 * act: an account's personal data is erased, a member registers for an event
 * or files a request, the daily Active Player pass sends its reminders and
 * processes expiries. A seed that wrote those rows by hand would skip the
 * checks, notices and audit rows the real entries write, so this module calls
 * the entries the controllers and the scheduler call, at the real current
 * time, in the shape the financeDemoJourney header describes.
 *
 * What each journey leaves is persona-owned (the persona's member row, its
 * registrations, requests, outbox and audit rows), so
 * the persona refresh tears it down with the persona; no pointer row is
 * needed. A registry job run here does what the scheduler's next due tick
 * would, over every member, and its run row stays as a real run.
 *
 * Writes through the application's database singleton and services, so the
 * caller makes sure that singleton is the database the seed wrote. Refuses
 * production.
 */
import { config } from '../config/env';
import { db } from '../db/db';
import { memberService } from '../services/memberService';
import { adminWorkQueueService } from '../services/adminWorkQueueService';
import { eventService } from '../services/eventService';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { personaEventId, personaEventTagId, type PersonaSpec } from './personaFactory';
import { runRegistryJobNow, RegistryJobRefusedError } from './runRegistryJob';

export interface PersonaJourneyFailure {
  slug: string;
  step: string;
  error: string;
}

export interface PersonaJourneyReport {
  ran: string[];
  failed: PersonaJourneyFailure[];
}

function memberIdOf(slug: string): string {
  return `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${slug}`;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runOne(spec: PersonaSpec): Promise<void> {
  const post = spec.postSeed;
  if (!post) return;
  const memberId = memberIdOf(spec.slug);

  if (post.erase === 'account') await memberService.purgeAccountPII(memberId);
  if (post.erase === 'deceased_contact') await memberService.scrubDeceasedMemberPII(memberId);

  for (let i = 0; i < (post.openContactRequests ?? 0); i++) {
    adminWorkQueueService.submit({
      requestingMemberId: memberId,
      category: 'other' as never,
      message: `Test persona request ${i + 1} of ${post.openContactRequests}, left open on purpose.`,
    });
  }

  if (post.registersFor) {
    // The organizer persona's event, found by its fixed ids: its public key is
    // its hashtag without the leading mark, and the singles division is the
    // one the form offers without a partner.
    const organizer = post.registersFor.eventOfPersona;
    const tag = db.prepare(`SELECT tag_normalized FROM tags WHERE id = ?`)
      .get(personaEventTagId(organizer)) as { tag_normalized: string } | undefined;
    const singles = db.prepare(
      `SELECT id FROM event_disciplines WHERE event_id = ? AND team_type = 'singles' ORDER BY sort_order, id LIMIT 1`,
    ).get(personaEventId(organizer)) as { id: string } | undefined;
    if (!tag || !singles) throw new Error(`the event of persona '${organizer}' is not seeded`);
    await eventService.register(memberId, tag.tag_normalized.replace(/^#/, ''), {
      type: 'competitor',
      divisionIds: [singles.id],
      amateurIds: [],
      partners: [],
      tshirtSize: '',
    });
  }
}

/**
 * Run every persona's journey, then the daily Active Player pass. Each persona
 * runs on its own, so one that fails is reported and the rest still run.
 */
export async function runPersonaJourneys(
  opts: { now?: Date; specs?: PersonaSpec[] } = {},
): Promise<PersonaJourneyReport> {
  if (config.footbagEnv === 'production') {
    throw new RegistryJobRefusedError('The persona journeys never run in production.');
  }
  const now = opts.now ?? new Date();
  const specs = (opts.specs ?? CANONICAL_PERSONAS).filter((s) => s.postSeed && !s.blockedBy);
  const report: PersonaJourneyReport = { ran: [], failed: [] };
  for (const spec of specs) {
    try {
      await runOne(spec);
      report.ran.push(spec.slug);
    } catch (err) {
      report.failed.push({ slug: spec.slug, step: 'journey', error: message(err) });
    }
  }
  // The Active Player personas' reminders and expiries, as the daily pass
  // leaves them; run unconditionally because every catalog carries them.
  const expiry = await runRegistryJobNow('SYS_Check_Active_Player_Expiry', { now });
  if (expiry.status === 'failed') {
    report.failed.push({ slug: '(all)', step: expiry.job, error: expiry.error });
  } else {
    report.ran.push(expiry.job);
  }
  return report;
}
