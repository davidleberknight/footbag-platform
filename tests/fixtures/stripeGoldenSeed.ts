/**
 * Seeds the local rows the golden payloads refer to, before their sequence
 * groups replay. Synthetic ids never repeat across captures, so one seeding of
 * the whole set gives every group exactly the rows its own events name.
 *
 * A captured event names rows this platform wrote before the provider ever saw
 * the payment: the pending payment a one-time checkout opened, the opening row
 * of a recurring donation, and the member behind both. On production those rows
 * existed when the event arrived; in a fresh test database they do not, and a
 * handler that finds nothing to settle reports the event as someone else's. So
 * the set is replayed against exactly the rows its events point at, read
 * from the correlation metadata the platform stamps on every checkout and the
 * provider carries onto every later object:
 *
 *   - every `memberId` becomes a member;
 *   - every platform payment id (`paymentId` beginning `pay_`) becomes a pending
 *     payment for that member, for the amount and currency the provider reports,
 *     a membership when the metadata names a tier and a donation otherwise, tied
 *     to its checkout session when the group carries that session;
 *   - every `subscriptionRecordId` becomes the opening row a recurring checkout
 *     writes, awaiting confirmation, for the amount the metadata carries.
 *
 * Every row is seeded as rehearsal money (provider mode test), as the captured
 * events are. Nothing else is invented: a group whose events need some other
 * row fails its replay, which is the replay doing its job.
 */
import type BetterSqlite3 from 'better-sqlite3';

import { insertMember, insertPayment, insertRecurringDonationSubscription } from './factories';

interface Found {
  metadata: Record<string, unknown>;
  holder: Record<string, unknown>;
}

function collectMetadata(value: unknown, into: Found[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectMetadata(v, into);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  const meta = obj.metadata;
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    into.push({ metadata: meta as Record<string, unknown>, holder: obj });
  }
  for (const v of Object.values(obj)) collectMetadata(v, into);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function cents(holder: Record<string, unknown>): number | null {
  for (const key of ['amount', 'amount_total', 'amount_paid', 'amount_due']) {
    const v = holder[key];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  }
  return null;
}

/** What the events point at, before any row is written. */
export interface GoldenSeedPlan {
  members: string[];
  payments: Array<{
    id: string; memberId: string; amountCents: number; currency: string;
    tier: 'tier1' | 'tier2' | null; checkoutSessionId: string | null;
  }>;
  subscriptions: Array<{
    id: string; memberId: string; amountCents: number; checkoutSessionId: string | null;
  }>;
}

/** Reads the bodies and names every row they refer to. */
export function planGoldenSeed(rawBodies: string[]): GoldenSeedPlan {
  const found: Found[] = [];
  const sessions: Record<string, unknown>[] = [];
  for (const body of rawBodies) {
    const start = found.length;
    collectMetadata(JSON.parse(body) as unknown, found);
    for (const f of found.slice(start)) if (f.holder.object === 'checkout.session') sessions.push(f.holder);
  }
  const sessionFor = (ref: string): string | null =>
    str(sessions.find((s) => s.client_reference_id === ref)?.id);

  const members = new Set<string>();
  const payments = new Map<string, GoldenSeedPlan['payments'][number]>();
  const subscriptions = new Map<string, GoldenSeedPlan['subscriptions'][number]>();

  for (const { metadata, holder } of found) {
    const memberId = str(metadata.memberId);
    if (!memberId) continue;
    members.add(memberId);
    const recordId = str(metadata.subscriptionRecordId);
    const paymentId = str(metadata.paymentId);
    if (recordId && !subscriptions.has(recordId)) {
      const amountCents = Number(metadata.amountCents);
      if (Number.isInteger(amountCents) && amountCents > 0) {
        subscriptions.set(recordId, { id: recordId, memberId, amountCents, checkoutSessionId: sessionFor(recordId) });
      }
    } else if (paymentId?.startsWith('pay_') && !payments.has(paymentId)) {
      const amountCents = cents(holder);
      if (amountCents === null) continue;
      const tier = metadata.tier === 'tier1' || metadata.tier === 'tier2' ? metadata.tier : null;
      payments.set(paymentId, {
        id: paymentId, memberId, amountCents,
        currency: (str(holder.currency) ?? 'usd').toUpperCase(),
        tier, checkoutSessionId: sessionFor(paymentId),
      });
    }
  }
  return { members: [...members], payments: [...payments.values()], subscriptions: [...subscriptions.values()] };
}

/** Writes the rows a plan names. Each member gets a slug and address derived from its id. */
export function seedGoldenRows(db: BetterSqlite3.Database, plan: GoldenSeedPlan): void {
  for (const id of plan.members) {
    const key = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
    insertMember(db, { id, slug: `golden_${key}`, login_email: `${key}@example.invalid` });
  }
  for (const p of plan.payments) {
    insertPayment(db, {
      id: p.id, member_id: p.memberId, status: 'pending',
      payment_type: p.tier ? 'membership' : 'donation',
      purchased_tier_status: p.tier,
      amount_cents: p.amountCents, currency: p.currency,
      stripe_checkout_session_id: p.checkoutSessionId,
      provider_livemode: 0,
    });
  }
  for (const s of plan.subscriptions) {
    insertRecurringDonationSubscription(db, {
      id: s.id, member_id: s.memberId, status: 'incomplete',
      amount_cents: s.amountCents,
      ...(s.checkoutSessionId ? { checkout_session_id: s.checkoutSessionId } : {}),
      provider_livemode: 0,
    });
  }
}
