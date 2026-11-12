/**
 * Synthetic money for the administrator finance pages.
 *
 * The finance persona seeds, beside its own administrator account, a small
 * world of obviously fake members who have paid for everything the site sells:
 * Tier 1 and Tier 2 dues (one bought as an upgrade), one-time donations (some
 * with a donor comment, two in euros), yearly recurring donations in each
 * state the payments pages tell apart, and competitor and spectator fees for an
 * upcoming, IFPA-sanctioned test World Footbag Championships. Around them sit
 * one of each thing that goes wrong with money: a failed, an abandoned and a
 * pending checkout, a full refund, a partial refund, a dispute, and a
 * test-mode rehearsal charge the totals set aside. Webhook health and three
 * reconciliation issues complete the picture: one outstanding, one an
 * administrator resolved, and one on the rehearsal charge that the finance
 * journey resolves before the nightly pass runs, so the pass carries it forward.
 *
 * Every row is written the way the platform's own writers leave it: the money
 * rows carry the live-mode flag a real charge carries, a full refund moves the
 * payment to refunded with its transition and audit row, and a partial refund
 * or a dispute is an audit row only, in the metadata shape the webhook handler
 * writes, because neither touches the payment row.
 *
 * The seed writes no job runs. The nightly report and the Treasurer digest
 * come from the real jobs, which the finance journey runs right after the seed
 * commits (`financeDemoJourney.ts`): a report the seed wrote would be outranked
 * by the worker's own runs on any stack whose worker already ran, and its totals
 * would be the seed's own sum rather than the platform's.
 *
 * Teardown keys: member ids under the persona prefix, the fixed event and tag
 * ids, and Stripe event and dispute ids under the `_persona_fin_` prefixes. The
 * persona refresh removes every one of them, and the journey's runs by the
 * pointer row it writes.
 */
import BetterSqlite3 from 'better-sqlite3';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';
import {
  insertMember,
  insertMemberTierGrant,
  insertPayment,
  insertPaymentStatusTransition,
  insertRecurringDonationSubscription,
  insertAuditEntry,
  insertStripeEvent,
  insertStripeWebhookFailure,
  insertTag,
  insertEvent,
  insertDiscipline,
  insertEventOrganizer,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertReconciliationIssue,
} from './personaRowBuilders';

/** The marker an earlier version of this seed wrote into its job runs' details;
 *  the refresh still removes runs carrying it, so a database seeded before the
 *  seed stopped writing runs cleans up. */
export const FINANCE_DEMO_RUN_MARKER = 'testkit.finance_demo';
export const FINANCE_DEMO_EVENT_ID = 'event_persona_finance_worlds';
export const FINANCE_DEMO_EVENT_TAG_ID = 'tag_persona_finance_worlds';
/** The issue on the rehearsal charge, which the finance journey resolves. */
export const FINANCE_DEMO_REHEARSAL_ISSUE_ID = 'recon_persona_fin_rehearsal';
export const FINANCE_DEMO_REHEARSAL_RESOLUTION_NOTE =
  'A rehearsal charge made in Stripe test mode; it moved no real money and needs no action.';
/** The finance journey's pointer row, and the two jobs it runs. Kept here, with
 *  no application imports, so the refresh runner can tear the journey's rows
 *  down without loading the database singleton the journey writes through. */
export const FINANCE_DEMO_RUN_AUDIT_ACTION_TYPE = 'testkit.finance_demo_run';
export const FINANCE_DEMO_RECONCILIATION_JOB = 'SYS_Reconcile_Payments_Nightly';
export const FINANCE_DEMO_DIGEST_JOB = 'SYS_Reconciliation_Digest';

/** The ids the journey's pointer row carries, which the refresh deletes by. */
export interface FinanceDemoRunPointer {
  reconciliationRunId: string | null;
  digestRunId: string | null;
  digestOutboxId: string | null;
}

const DAY_MS = 86_400_000;
const FEE_COMPETITOR = 6000;
const FEE_SPECTATOR = 1500;
const TIER1 = 1000;
const TIER2 = 5000;

/** The fake members, by the short key the payment table below uses. */
const DEMO_MEMBERS = {
  ada: 'Ada Ledger', ben: 'Ben Balance', cora: 'Cora Credit', dev: 'Dev Debit',
  eli: 'Eli Escrow', fay: 'Fay Fiscal', gus: 'Gus Gross', hal: 'Hal Invoice',
  ivy: 'Ivy Interest', jo: 'Jo Journal', kay: 'Kay Kitty', lou: 'Lou Lucre',
  mia: 'Mia Margin', nia: 'Nia Net', oz: 'Oz Overdraft', pat: 'Pat Payable',
} as const;
type DemoKey = keyof typeof DEMO_MEMBERS;

/** The member id of each fake member, so the seed's orphan check knows them. */
export function financeDemoMemberIds(): string[] {
  return (Object.keys(DEMO_MEMBERS) as DemoKey[]).map(memberIdOf);
}

/** The slug of each fake member, for the refresh command's orphan check. */
export function financeDemoMemberSlugs(): string[] {
  return (Object.keys(DEMO_MEMBERS) as DemoKey[]).map(slugOf);
}

function slugOf(key: DemoKey): string {
  return `fin_demo_${key}`;
}

function memberIdOf(key: DemoKey): string {
  return `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${slugOf(key)}`;
}

const MEMBER_BIO =
  'Test member for the footbag platform development and staging harness, not a real person. '
  + 'Seeded by the finance persona so the administrator finance pages show realistic figures.';

const EVENT_DESCRIPTION =
  'Test event for the footbag platform development and staging harness, not a real event. '
  + 'It exists so the administrator finance pages show registration fees for a sanctioned event.';

type Kind = 'membership' | 'donation' | 'event_registration';
type Status = 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';

interface DemoPayment {
  ref: string;
  who: DemoKey;
  kind: Kind;
  cents: number;
  daysAgo: number;
  status?: Status;
  currency?: string;
  tier?: 'tier1' | 'tier2';
  note?: string;
  testMode?: boolean;
  /** The recurring donation this payment collected, by its key below. */
  recurring?: 'active' | 'past_due' | 'canceled';
  /** For an event fee: what the payer registered as. */
  entry?: 'competitor' | 'spectator';
}

// The payments, newest-first reading is not required: each carries its age.
const PAYMENTS: DemoPayment[] = [
  // Dues. Cora upgrades from Tier 1 to Tier 2; Ben's Tier 2 charge is disputed.
  { ref: 'm_ada', who: 'ada', kind: 'membership', cents: TIER1, daysAgo: 110, tier: 'tier1' },
  { ref: 'm_mia', who: 'mia', kind: 'membership', cents: TIER2, daysAgo: 120, tier: 'tier2' },
  { ref: 'm_ben', who: 'ben', kind: 'membership', cents: TIER2, daysAgo: 95, tier: 'tier2' },
  { ref: 'm_cora1', who: 'cora', kind: 'membership', cents: TIER1, daysAgo: 80, tier: 'tier1' },
  { ref: 'm_cora2', who: 'cora', kind: 'membership', cents: TIER2, daysAgo: 20, tier: 'tier2' },
  { ref: 'm_dev', who: 'dev', kind: 'membership', cents: TIER2, daysAgo: 60, tier: 'tier2' },
  { ref: 'm_eli', who: 'eli', kind: 'membership', cents: TIER1, daysAgo: 45, tier: 'tier1' },
  { ref: 'm_fay', who: 'fay', kind: 'membership', cents: TIER1, daysAgo: 6.5, tier: 'tier1' },
  { ref: 'm_gus', who: 'gus', kind: 'membership', cents: TIER2, daysAgo: 0.2, tier: 'tier2' },
  // One-time donations, three carrying a donor comment, two in euros.
  { ref: 'd_ivy', who: 'ivy', kind: 'donation', cents: 2000, daysAgo: 100, note: 'For the junior development fund, please.' },
  { ref: 'd_jo', who: 'jo', kind: 'donation', cents: 10000, daysAgo: 22, note: 'Please put this toward travel grants for players going to Worlds.' },
  { ref: 'd_kay', who: 'kay', kind: 'donation', cents: 5000, daysAgo: 30 },
  { ref: 'd_ada', who: 'ada', kind: 'donation', cents: 2500, daysAgo: 5, note: 'Thanks for keeping the site running.' },
  { ref: 'd_ben', who: 'ben', kind: 'donation', cents: 3000, daysAgo: 3, currency: 'EUR' },
  { ref: 'd_eli', who: 'eli', kind: 'donation', cents: 1500, daysAgo: 0.5, currency: 'EUR' },
  // Refunded in full, inside both nightly reports' windows.
  { ref: 'd_lou', who: 'lou', kind: 'donation', cents: 7500, daysAgo: 5, status: 'refunded' },
  // Yearly recurring donations: active and renewed, past due, canceled.
  { ref: 'r_ivy1', who: 'ivy', kind: 'donation', cents: 2500, daysAgo: 400, recurring: 'active' },
  { ref: 'r_ivy2', who: 'ivy', kind: 'donation', cents: 2500, daysAgo: 35, recurring: 'active' },
  { ref: 'r_jo', who: 'jo', kind: 'donation', cents: 1200, daysAgo: 380, recurring: 'past_due' },
  { ref: 'r_kay1', who: 'kay', kind: 'donation', cents: 5000, daysAgo: 500, recurring: 'canceled' },
  { ref: 'r_kay2', who: 'kay', kind: 'donation', cents: 5000, daysAgo: 135, recurring: 'canceled' },
  // World Championships fees: ten competitors, three spectators, one checkout still open.
  { ref: 'w_ada', who: 'ada', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 40, entry: 'competitor' },
  { ref: 'w_ben', who: 'ben', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 38, entry: 'competitor' },
  { ref: 'w_cora', who: 'cora', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 33, entry: 'competitor' },
  { ref: 'w_dev', who: 'dev', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 28, entry: 'competitor' },
  { ref: 'w_eli', who: 'eli', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 21, entry: 'competitor' },
  { ref: 'w_fay', who: 'fay', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 16, entry: 'competitor' },
  { ref: 'w_gus', who: 'gus', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 9, entry: 'competitor' },
  { ref: 'w_hal', who: 'hal', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 6, entry: 'competitor' },
  { ref: 'w_ivy', who: 'ivy', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 2, entry: 'competitor' },
  { ref: 'w_jo', who: 'jo', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 0.3, entry: 'competitor' },
  { ref: 'w_kay', who: 'kay', kind: 'event_registration', cents: FEE_SPECTATOR, daysAgo: 14, entry: 'spectator' },
  { ref: 'w_lou', who: 'lou', kind: 'event_registration', cents: FEE_SPECTATOR, daysAgo: 7, entry: 'spectator' },
  { ref: 'w_nia', who: 'nia', kind: 'event_registration', cents: FEE_SPECTATOR, daysAgo: 3, entry: 'spectator' },
  { ref: 'w_oz', who: 'oz', kind: 'event_registration', cents: FEE_COMPETITOR, daysAgo: 0.1, entry: 'competitor', status: 'pending' },
  // What else goes wrong: a declined card, an abandoned checkout, a rehearsal charge.
  { ref: 'x_pat', who: 'pat', kind: 'membership', cents: TIER1, daysAgo: 8, tier: 'tier1', status: 'failed' },
  { ref: 'x_nia', who: 'nia', kind: 'donation', cents: 2000, daysAgo: 3.5, status: 'canceled' },
  // A rehearsal charge inside the health page's last day and the nightly
  // pass's window, so each surface has a row to set aside.
  { ref: 'x_dev2', who: 'dev', kind: 'donation', cents: 1000, daysAgo: 0.4, testMode: true },
];

/** Cents returned on a payment that was only partly refunded. */
const PARTIAL_REFUNDS: Record<string, number> = { w_hal: 2000 };

const DISCIPLINES = [
  { key: 'singles_net', name: 'Open Singles Net', category: 'net', team: 'singles' },
  { key: 'doubles_net', name: 'Open Doubles Net', category: 'net', team: 'doubles' },
  { key: 'routines', name: 'Open Routines', category: 'freestyle', team: 'singles' },
  { key: 'shred30', name: 'Shred 30', category: 'freestyle', team: 'singles' },
  { key: 'circle', name: 'Open Circle', category: 'freestyle', team: 'singles' },
] as const;
type DisciplineKey = typeof DISCIPLINES[number]['key'];

/** What each competitor entered; Ben and Cora play doubles together. */
const ENTRIES: Partial<Record<DemoKey, DisciplineKey[]>> = {
  ada: ['singles_net', 'circle'], ben: ['singles_net', 'doubles_net'],
  cora: ['doubles_net', 'routines'], dev: ['shred30', 'circle'],
  eli: ['routines', 'shred30'], fay: ['singles_net'], gus: ['circle'],
  hal: ['routines'], ivy: ['shred30'], jo: ['singles_net', 'circle'], oz: ['routines'],
};
const DOUBLES_PARTNER: Partial<Record<DemoKey, DemoKey>> = { ben: 'cora', cora: 'ben' };

/** The persona harness's own markers, stamped on the rows that carry them. */
export interface FinanceDemoMarks {
  createdBy: string;
  tierReasonCode: string;
  tierReasonText: string;
}

/**
 * Seed the finance demonstration around an administrator who already exists.
 * Synchronous and transaction-free: the caller's persona transaction holds it.
 */
export function seedFinanceDemo(
  db: BetterSqlite3.Database,
  adminMemberId: string,
  marks: FinanceDemoMarks,
  nowMs: number = Date.now(),
): void {
  const at = (daysAgo: number) => new Date(nowMs - daysAgo * DAY_MS).toISOString();

  for (const [key, name] of Object.entries(DEMO_MEMBERS) as [DemoKey, string][]) {
    insertMember(db, {
      id: memberIdOf(key),
      slug: slugOf(key),
      login_email: `${slugOf(key)}@personas.test`,
      real_name: name,
      bio: MEMBER_BIO,
      searchable: 0,
      birth_date: '1980-04-12',
      created_at: at(540),
    });
  }

  // The event: a World Championships the Board awarded, which that award
  // sanctions without a request, open for paid registration.
  const startMs = nowMs + 250 * DAY_MS;
  const startDate = new Date(startMs).toISOString().slice(0, 10);
  insertTag(db, {
    id: FINANCE_DEMO_EVENT_TAG_ID,
    tag_normalized: `#event_${startDate.slice(0, 4)}_demo_worlds`,
  });
  insertEvent(db, {
    id: FINANCE_DEMO_EVENT_ID,
    hashtag_tag_id: FINANCE_DEMO_EVENT_TAG_ID,
    title: 'TEST: World Footbag Championships (demo data)',
    description: EVENT_DESCRIPTION,
    start_date: startDate,
    end_date: new Date(startMs + 5 * DAY_MS).toISOString().slice(0, 10),
    city: 'Testville',
    region: 'CO',
    country: 'United States',
    status: 'reg_open',
    reg_opened_at: at(45),
    registration_deadline: new Date(startMs - 14 * DAY_MS).toISOString().slice(0, 10),
    sanction_status: 'approved',
    sanction_decided_at: at(46),
    sanction_decided_by_member_id: adminMemberId,
    sanction_decision_reason: 'Sanctioned by the IFPA Board\'s award of the World Championships to this host.',
    payment_enabled: 1,
    currency: 'USD',
    competitor_fee_cents: FEE_COMPETITOR,
    attendee_fee_cents: FEE_SPECTATOR,
    is_attendee_registration_open: 1,
  });
  insertEventOrganizer(db, FINANCE_DEMO_EVENT_ID, memberIdOf('mia'));
  const disciplineIds = {} as Record<DisciplineKey, string>;
  DISCIPLINES.forEach((d, i) => {
    disciplineIds[d.key] = insertDiscipline(db, FINANCE_DEMO_EVENT_ID, {
      id: `disc_persona_finance_${d.key}`,
      name: d.name,
      discipline_category: d.category,
      team_type: d.team,
      sort_order: i + 1,
    });
  });

  // Recurring donations, yearly, one per state.
  const subscriptions = {
    active: { who: 'ivy' as DemoKey, cents: 2500, startedDaysAgo: 400 },
    past_due: { who: 'jo' as DemoKey, cents: 1200, startedDaysAgo: 380 },
    canceled: { who: 'kay' as DemoKey, cents: 5000, startedDaysAgo: 500 },
  };
  const subscriptionIds = {} as Record<keyof typeof subscriptions, string>;
  for (const [state, s] of Object.entries(subscriptions) as [keyof typeof subscriptions, typeof subscriptions.active][]) {
    subscriptionIds[state] = insertRecurringDonationSubscription(db, {
      id: `rds_persona_fin_${state}`,
      member_id: memberIdOf(s.who),
      stripe_customer_id: `cus_persona_fin_${s.who}`,
      stripe_subscription_id: `sub_persona_fin_${state}`,
      status: state,
      amount_cents: s.cents,
      started_at: at(s.startedDaysAgo),
      created_at: at(s.startedDaysAgo),
      ...(state === 'past_due' ? { failure_count: 1 } : {}),
      ...(state === 'canceled' ? { canceled_at: at(20) } : {}),
    });
  }

  const paymentIds: Record<string, string> = {};
  const registrationIds: Partial<Record<DemoKey, string>> = {};
  PAYMENTS.forEach((p, i) => {
    const n = i + 1;
    const status = p.status ?? 'succeeded';
    const settled = status === 'succeeded' || status === 'refunded';
    const id = insertPayment(db, {
      id: `pay_persona_fin_${p.ref}`,
      member_id: memberIdOf(p.who),
      payment_type: p.kind,
      amount_cents: p.cents,
      currency: p.currency ?? 'USD',
      status,
      descriptor: p.kind === 'membership'
        ? `IFPA ${p.tier === 'tier2' ? 'Tier 2' : 'Tier 1'} Membership`
        : p.kind === 'event_registration'
          ? `Event Registration: World Footbag Championships (${p.entry === 'spectator' ? 'Spectator' : 'Competitor'})`
          : (p.recurring ? 'Recurring Donation' : 'Donation'),
      purchased_tier_status: p.kind === 'membership' ? (p.tier ?? 'tier1') : null,
      created_at: at(p.daysAgo),
      stripe_checkout_session_id: `cs_persona_fin_${n}`,
      stripe_payment_intent_id: status === 'canceled' ? null : `pi_persona_fin_${n}`,
      ...(p.recurring
        ? {
          stripe_subscription_id: `sub_persona_fin_${p.recurring}`,
          recurring_subscription_id: subscriptionIds[p.recurring],
          stripe_customer_id: `cus_persona_fin_${p.who}`,
        }
        : {}),
      donation_note: p.note ?? null,
      provider_livemode: p.testMode ? 0 : 1,
    });
    paymentIds[p.ref] = id;

    if (p.kind === 'membership' && settled) {
      const previous = p.ref === 'm_cora2' ? 'tier1' : null;
      insertMemberTierGrant(db, {
        member_id: memberIdOf(p.who),
        change_type: 'grant',
        old_tier_status: previous,
        new_tier_status: p.tier ?? 'tier1',
        reason_code: marks.tierReasonCode,
        reason_text: marks.tierReasonText,
        related_payment_id: id,
        created_at: at(p.daysAgo),
      });
    }

    if (p.kind === 'event_registration') {
      const regId = insertRegistration(db, FINANCE_DEMO_EVENT_ID, memberIdOf(p.who), {
        id: `reg_persona_fin_${p.who}`,
        registration_type: p.entry === 'spectator' ? 'attendee_supporter' : 'competitor',
        status: status === 'pending' ? 'pending' : 'confirmed',
        registered_at: at(p.daysAgo),
        payment_id: id,
      });
      registrationIds[p.who] = regId;
    }
  });

  for (const [who, picks] of Object.entries(ENTRIES) as [DemoKey, DisciplineKey[]][]) {
    const regId = registrationIds[who];
    if (!regId) continue;
    for (const pick of picks) {
      const partner = pick === 'doubles_net' ? DOUBLES_PARTNER[who] : undefined;
      insertRegistrationDisciplineSelection(db, regId, disciplineIds[pick], {
        ...(partner ? { partner_member_id: memberIdOf(partner) } : {}),
      });
    }
  }

  // Lou's donation, returned in full: the status move, its ledger row and the
  // audit row the refund webhook writes.
  const refundEvent = 'evt_persona_fin_refund';
  // The deliveries the refund, the partial refund and the dispute arrived on.
  for (const [eventId, type, daysAgo] of [
    [refundEvent, 'charge.refunded', 3],
    ['evt_persona_fin_partial', 'charge.refunded', 4],
    ['evt_persona_fin_dispute', 'charge.dispute.created', 11],
  ] as const) {
    insertStripeEvent(db, { event_id: eventId, event_type: type, created_at: at(daysAgo), processed_at: at(daysAgo) });
  }
  insertPaymentStatusTransition(db, {
    payment_id: paymentIds.d_lou,
    event_type: 'charge.refunded',
    from_status: 'succeeded',
    to_status: 'refunded',
    stripe_event_id: refundEvent,
    stripe_payment_intent_id: intentOf('d_lou'),
    transition_reason_text: 'charge.refunded',
    created_at: at(3),
    transition_at: at(3),
  });
  insertAuditEntry(db, {
    created_by: marks.createdBy,
    actor_type: 'system',
    action_type: 'payment.refunded',
    entity_type: 'payment',
    entity_id: paymentIds.d_lou,
    occurred_at: at(3),
    metadata: {
      member_id: memberIdOf('lou'),
      stripe_event_id: refundEvent,
      stripe_payment_intent_id: intentOf('d_lou'),
      stripe_charge_id: 'ch_persona_fin_lou',
      refunded_amount_cents: 7500,
      currency: 'USD',
    },
  });
  // Hal's Worlds fee, part returned: the payment row never moves for one.
  insertAuditEntry(db, {
    created_by: marks.createdBy,
    actor_type: 'system',
    action_type: 'payment.partially_refunded',
    entity_type: 'payment',
    entity_id: paymentIds.w_hal,
    occurred_at: at(4),
    metadata: {
      member_id: memberIdOf('hal'),
      stripe_event_id: 'evt_persona_fin_partial',
      stripe_payment_intent_id: intentOf('w_hal'),
      charge_amount_cents: FEE_COMPETITOR,
      refunded_amount_cents: PARTIAL_REFUNDS.w_hal,
      currency: 'USD',
      stripe_charge_id: 'ch_persona_fin_hal',
    },
  });
  // Ben's Tier 2 charge, disputed at his bank.
  insertAuditEntry(db, {
    created_by: marks.createdBy,
    actor_type: 'system',
    action_type: 'payment.dispute_opened',
    entity_type: 'stripe_dispute',
    entity_id: 'du_persona_fin_ben',
    occurred_at: at(11),
    metadata: {
      stripe_event_id: 'evt_persona_fin_dispute',
      stripe_event_type: 'charge.dispute.created',
      stripe_dispute_id: 'du_persona_fin_ben',
      stripe_charge_id: 'ch_persona_fin_ben',
      stripe_payment_intent_id: intentOf('m_ben'),
      amount_cents: TIER2,
      currency: 'USD',
      dispute_reason: 'product_not_received',
      dispute_status: 'needs_response',
    },
  });

  // Webhook health: deliveries arriving, and one recoverable failure today.
  insertStripeEvent(db, {
    event_id: 'evt_persona_fin_latest',
    event_type: 'payment_intent.succeeded',
    created_at: at(0.05),
    processed_at: at(0.05),
  });
  insertStripeWebhookFailure(db, {
    bucket_start: at(0.25),
    reason: 'recoverable',
    first_seen_at: at(0.25),
    last_seen_at: at(0.25),
    last_event_type: 'payment_intent.succeeded',
    last_event_id: 'evt_persona_fin_failed',
  });

  // Reconciliation: one discrepancy still open, one an administrator explained.
  insertReconciliationIssue(db, {
    id: 'recon_persona_fin_open',
    issue_type: 'payment_amount_mismatch',
    payment_id: paymentIds.w_lou,
    stripe_payment_intent_id: intentOf('w_lou'),
    details_json: JSON.stringify({
      local_amount_cents: FEE_SPECTATOR,
      local_currency: 'USD',
      provider_amount_cents: FEE_SPECTATOR,
      provider_currency: 'EUR',
    }),
    created_at: at(2),
  });
  const resolvedAtIso = at(9.5);
  const resolvedNote = 'The webhook arrived late; Stripe shows the charge settled and the tier was granted. Nothing to do.';
  insertReconciliationIssue(db, {
    id: 'recon_persona_fin_resolved',
    issue_type: 'payment_status_mismatch',
    payment_id: paymentIds.m_fay,
    stripe_payment_intent_id: intentOf('m_fay'),
    status: 'resolved',
    details_json: JSON.stringify({
      local_status: 'pending',
      provider_status: 'succeeded',
      provider_status_as_local: 'succeeded',
    }),
    created_at: at(10),
    resolved_at: resolvedAtIso,
    resolved_by_member_id: adminMemberId,
    resolution_notes: resolvedNote,
  });

  // The rehearsal charge as the nightly pass finds it: the stand-in provider
  // holds no record of a payment the seed wrote, so the pass reports it missing.
  // The figures are exactly the ones the pass compares, so once the finance
  // journey resolves this issue the pass carries it forward instead of raising
  // it again each night.
  insertReconciliationIssue(db, {
    id: FINANCE_DEMO_REHEARSAL_ISSUE_ID,
    issue_type: 'payment_missing_at_provider',
    payment_id: paymentIds.x_dev2,
    stripe_payment_intent_id: intentOf('x_dev2'),
    details_json: JSON.stringify({ local_status: 'succeeded', amount_cents: 1000, currency: 'USD' }),
    created_at: at(0.3),
  });
}

function intentOf(ref: string): string {
  return `pi_persona_fin_${PAYMENTS.findIndex((p) => p.ref === ref) + 1}`;
}
