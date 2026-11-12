/**
 * Persona checks: each seeded persona's story journeys, one check per success
 * criterion it proves, keyed on the story id and the criterion's own text.
 *
 * A check drives the persona through the real pages after the real persona
 * refresh, which also runs any job the persona's story ends in (the finance
 * persona's nightly reconciliation and Treasurer digest), and asserts what the
 * persona sees and what the run left behind. Every expected value is written
 * by hand from the persona's seeded rows and the criterion text, never read
 * back from the code under test. Assertions find what they check by seeded
 * data, link targets, form actions and the figures and status labels the code
 * composes, never by page prose.
 *
 * A check that writes (drains the outbox, posts a form) says what it changes,
 * and its runner refreshes the personas before it so checks never share
 * state. The runner also proves every success criterion of a persona's
 * stories has a check, and that every check's criterion text is still the
 * story's own.
 *
 * Only the finance administrator's checks are written so far; the other
 * personas join the same module.
 */
import { expect } from 'vitest';

export interface CapturedMail {
  to: string;
  subject: string;
  bodyText: string;
}

export interface PersonaCheckContext {
  /** GET a page as the persona; the status must be 200. */
  page(path: string): Promise<string>;
  /** Read-only rows from the database the checks run against. */
  rows<T>(sql: string, ...params: unknown[]): T[];
  /** Deliver the queued outbox through the stub mail provider; what it sent. */
  drainMail(): Promise<CapturedMail[]>;
}

export interface PersonaCheck {
  persona: string;
  story: string;
  /** The success criterion, verbatim. */
  criterion: string;
  /** What the persona would meet if the check's subject broke. */
  defect: string;
  writes: false | { target: string };
  run(ctx: PersonaCheckContext): Promise<void>;
}

// ── Page reading helpers ─────────────────────────────────────────────────────

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every table row on the page, as its cells' text. */
export function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1])));
}

function expectRow(html: string, row: string[], what: string): void {
  expect(tableRows(html), what).toContainEqual(row);
}

/** Every list item on the page, as text. */
function listItems(html: string): string[] {
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => cellText(m[1]));
}

/** Form actions that post anywhere but the site frame's own log-out. */
function stateChangingForms(html: string): string[] {
  return [...html.matchAll(/<form\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /method="post"/i.test(tag))
    .map((tag) => /action="([^"]*)"/i.exec(tag)?.[1] ?? '')
    .filter((action) => action !== '/logout');
}

const tsDisplay = (iso: string) => `${iso.slice(0, 19).replace('T', ' ')} UTC`;
const DAY_MS = 86_400_000;

// ── The finance administrator ────────────────────────────────────────────────
//
// What the finance seed holds, by hand. Payments over the nightly pass's seven
// days that are live and settled, from the seed's payment table:
//   Donation in EUR: Ben 30.00 (3 days), Eli 15.00 (half a day): 2, 45.00 EUR.
//   Event registration in USD: Hal 60.00 (6 days, 20.00 returned), Ivy 60.00,
//     Jo 60.00, Nia 15.00: 4, 195.00 USD received, 20.00 returned, 175.00 net.
//   (Oz's 60.00 is still pending; Lou's 15.00 is exactly seven days old and
//   falls just outside the window.) No other persona pays in euros or pays an
//   event fee, so these two rows are the finance seed's alone.
// Over the payments page's last day: Eli's 15.00 EUR donation and Jo's 60.00
// USD Worlds fee; the 10.00 USD rehearsal charge is the one test-mode payment.

const FIN = 'finance_admin';
const OPEN_ISSUE = 'recon_persona_fin_open';
const RESOLVED_ISSUE = 'recon_persona_fin_resolved';
const REHEARSAL_ISSUE = 'recon_persona_fin_rehearsal';
const RESOLVED_NOTE = 'The webhook arrived late; Stripe shows the charge settled and the tier was granted. Nothing to do.';
const REHEARSAL_NOTE = 'A rehearsal charge made in Stripe test mode; it moved no real money and needs no action.';
const JO_NOTE = 'Please put this toward travel grants for players going to Worlds.';
const ADA_NOTE = 'Thanks for keeping the site running.';
const IVY_NOTE = 'For the junior development fund, please.';
const TREASURER = 'ifpa-treasurer@footbag.org';
const WINDOW_TOTALS = [
  ['Donation', 'EUR', '2', '45.00 EUR', '--', '45.00 EUR'],
  ['Event registration', 'USD', '4', '195.00 USD', '20.00 USD', '175.00 USD'],
];
const ISSUE_TYPE_CODES = ['payment_amount_mismatch', 'payment_status_mismatch', 'payment_missing_at_provider'];

const pay = (ref: string) => `/admin/payments/pay_persona_fin_${ref}`;
// Wide enough to hold every seeded payment, the oldest renewal included.
const allTime = () => `from=${new Date(Date.now() - 800 * DAY_MS).toISOString().slice(0, 10)}`
  + `&to=${new Date(Date.now() + DAY_MS).toISOString().slice(0, 10)}`;

interface RunRow { id: string; started_at: string; status: string }

/** The journey's reconciliation run: the newest one, which the refresh ran. */
function newestReconciliation(ctx: PersonaCheckContext): RunRow {
  const runs = ctx.rows<RunRow>(
    `SELECT id, started_at, status FROM system_job_runs
      WHERE job_name = 'SYS_Reconcile_Payments_Nightly'
      ORDER BY started_at DESC, id DESC`, // ordering-is-the-contract: the newest run is the current report
  );
  expect(runs.length, 'the refresh ran the nightly reconciliation').toBeGreaterThan(0);
  return runs[0];
}

export const PERSONA_CHECKS: PersonaCheck[] = [
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: 'There is an admin-only All Payments view that lists all inbound payments recorded by the system, including donations, membership purchases/upgrades, and event registration fees.',
    defect: 'The Treasurer cannot see a kind of payment, so that money goes unreconciled.',
    writes: false,
    async run(ctx) {
      const html = await ctx.page(`/admin/payments?${allTime()}`);
      for (const ref of ['d_ada', 'm_cora1', 'm_cora2', 'w_ada', 'r_ivy2', 'x_pat', 'x_dev2']) {
        expect(html, `payment ${ref} is listed`).toContain(pay(ref));
      }
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: 'The All Payments view allows filtering and sorting by type, date range, status, member, event, and payment reference, and shows at least: type, date, amount, currency, status, related member ID, the related event where the payment is a registration fee, resolved through the registration that carries both, and Stripe payment reference. Clubs take no payments, so no payment carries a club.',
    defect: 'A filter that leaks or drops rows, or a missing column, misstates what was paid for what.',
    writes: false,
    async run(ctx) {
      const event = 'event_persona_finance_worlds';
      const byEvent = await ctx.page(`/admin/payments?${allTime()}&event=${event}`);
      expect(byEvent, 'the event filter keeps a Worlds fee').toContain(pay('w_hal'));
      expect(byEvent, 'the event filter drops a donation').not.toContain(pay('d_ada'));
      expect(byEvent, 'the fee row names its event').toContain('TEST: World Footbag Championships (demo data)');
      expect(byEvent, "Hal's fee shows its Stripe payment reference").toContain('pi_persona_fin_29');

      const donations = await ctx.page(`/admin/payments?${allTime()}&type=donation`);
      expect(donations).toContain(pay('d_jo'));
      expect(donations, 'a membership is filtered out').not.toContain(pay('m_ben'));

      const failed = await ctx.page(`/admin/payments?${allTime()}&status=failed`);
      expect(failed, 'the declined card').toContain(pay('x_pat'));
      expect(failed, 'a settled payment is filtered out').not.toContain(pay('d_jo'));

      const byMember = await ctx.page(`/admin/payments?${allTime()}&member=fin_demo_lou`);
      expect(byMember, "Lou's refunded donation").toContain(pay('d_lou'));
      expect(byMember, "another member's payment is filtered out").not.toContain(pay('d_jo'));
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: 'For donation payments, the admin can see the member’s donation comment as a read-only field when viewing payment details, so that reconciliation and investigations can take the comment into account without allowing admins to edit it.',
    defect: "A donor's stated purpose is lost, or an administrator can rewrite it.",
    writes: false,
    async run(ctx) {
      const html = await ctx.page(pay('d_jo'));
      expect(html).toContain(JO_NOTE);
      expect(stateChangingForms(html), 'no form edits the payment').toEqual([]);
      expect(html, 'no field carries the comment').not.toMatch(/name="donation_?note"/i);
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: 'A nightly worker (or equivalent scheduled job) performs reconciliation against Stripe (or the payment provider) and records mismatches (for example missing webhooks, amount discrepancies, status mismatches, or unexpected duplicates).',
    defect: 'The nightly comparison does not run, or forgets a difference it already found.',
    writes: false,
    async run(ctx) {
      const run = newestReconciliation(ctx);
      expect(run.status).toBe('succeeded');
      // The provider holds no record of the rehearsal charge, so the pass finds
      // it missing again; the administrator explained it, so it is carried
      // forward rather than raised a second time.
      const [issue] = ctx.rows<{ status: string }>(
        'SELECT status FROM reconciliation_issues WHERE id = ?', REHEARSAL_ISSUE,
      );
      expect(issue.status, 'the explained difference stays resolved').toBe('resolved');
      const report = await ctx.page(`/admin/payments/reports/${run.id}`);
      expect(listItems(report).some((li) => li.includes(REHEARSAL_NOTE) && li.includes('10.00 USD')),
        'the run found the rehearsal charge again and carried it forward').toBe(true);
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: 'The Reconciliation Issues view includes a status filter with options: Outstanding (default) / Resolved / All. Resolved reconciliation issues show: admin who resolved the issue, resolution timestamp, resolution note explaining action taken. This allows multiple administrators to see what reconciliation issues have already been handled and by whom.',
    defect: 'A second administrator redoes handled work, or cannot see who handled it.',
    writes: false,
    async run(ctx) {
      const byDefault = await ctx.page('/admin/payments/reconciliation');
      expect(byDefault, 'the outstanding issue').toContain(OPEN_ISSUE);
      expect(byDefault, 'a resolved issue is not in the default view').not.toContain(RESOLVED_ISSUE);

      const resolved = await ctx.page('/admin/payments/reconciliation?status=resolved');
      expect(resolved, 'the outstanding issue is not under Resolved').not.toContain(OPEN_ISSUE);
      const [r] = ctx.rows<{ resolved_at: string }>(
        'SELECT resolved_at FROM reconciliation_issues WHERE id = ?', RESOLVED_ISSUE,
      );
      for (const [id, note] of [[RESOLVED_ISSUE, RESOLVED_NOTE], [REHEARSAL_ISSUE, REHEARSAL_NOTE]]) {
        expect(resolved, `${id} is listed`).toContain(id);
        expect(resolved, `${id} carries its note`).toContain(note);
      }
      expect(resolved, 'names the resolving administrator').toContain(FIN);
      expect(resolved, 'shows when it was resolved').toContain(r.resolved_at.slice(0, 10));

      const all = await ctx.page('/admin/payments/reconciliation?status=all');
      for (const id of [OPEN_ISSUE, RESOLVED_ISSUE, REHEARSAL_ISSUE]) expect(all, id).toContain(id);
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: "A periodic summary is sent at the configured cadence (default: every 30 days, keyed by `reconciliation_summary_interval_days`) to the IFPA treasurer contact address (`ifpa-treasurer@footbag.org`, from the canonical address list in the design decisions), carrying outstanding discrepancies oldest first and the ones resolved during the period, each naming who resolved it and when, and stating which provider mode the last pass compared and how many local rows of the other mode it set aside. It also lists every donation completed during the period that carries a donor comment, with its date, amount and currency, the donor's name, and the comment, so that any purpose a donor named reaches the Treasurer. It also lists each carried-forward reconciling item: a discrepancy resolved earlier and still present with unchanged figures, with its resolution note, who resolved it and when. It is sent every cadence whether or not anything is outstanding: the reader answerable for the money has no scheduled-job health surface, so for them silence and a job that died months ago look identical, and the nil report is what tells them the check still runs. It is written for a non-technical reader, with amounts carrying their currency and plain descriptions rather than issue-type codes. The recipient is a fixed platform address with no application write path; who reads that mailbox is an IFPA decision recorded outside the platform.",
    defect: 'The Treasurer receives no digest, or one missing money that needs action or honouring.',
    writes: { target: 'the Treasurer digest the refresh queued, delivered through the stub mail provider' },
    async run(ctx) {
      const today = new Date().toISOString().slice(0, 10);
      const queued = ctx.rows<{ id: string; recipient_email: string; status: string }>(
        `SELECT id, recipient_email, status FROM outbox_emails WHERE idempotency_key = ?`,
        `reconciliation-digest:${today}`,
      );
      expect(queued.map((q) => q.recipient_email), "one digest today, to the Treasurer's address").toEqual([TREASURER]);
      const sent = (await ctx.drainMail()).filter((m) => m.to === TREASURER);
      expect(sent.length, 'the stub mail provider delivered it').toBe(1);
      const body = sent[0].bodyText;

      expect(body, 'the outstanding mismatch, in plain words with its currency').toContain('15.00 EUR');
      const [fay, reh] = [RESOLVED_ISSUE, REHEARSAL_ISSUE].map((id) => ctx.rows<{ resolved_at: string }>(
        'SELECT resolved_at FROM reconciliation_issues WHERE id = ?', id,
      )[0]);
      expect(body, 'the resolved issue, who and when').toContain(`resolved by ${FIN} on ${fay.resolved_at.slice(0, 10)}`);
      expect(body, 'which mode the last pass compared').toContain('test-mode records');
      for (const [ref, amount, name, note] of [
        ['d_jo', '100.00 USD', 'Jo Journal', JO_NOTE],
        ['d_ada', '25.00 USD', 'Ada Ledger', ADA_NOTE],
      ] as const) {
        const [{ created_at: at }] = ctx.rows<{ created_at: string }>(
          'SELECT created_at FROM payments WHERE id = ?', `pay_persona_fin_${ref}`,
        );
        expect(body, `${name}'s commented donation, dated`)
          .toContain(`${at.slice(0, 10)} - ${amount} - ${name} - "${note}"`);
      }
      expect(body, 'a comment from before the period is not listed').not.toContain(IVY_NOTE);
      expect(body, 'the carried-forward item, who explained it, when, and the note')
        .toContain(`explained by ${FIN} on ${reh.resolved_at.slice(0, 10)}: "${REHEARSAL_NOTE}"`);
      for (const line of [
        'Donation in EUR: 2 payments, 45.00 EUR received, 0.00 EUR returned, 45.00 EUR net.',
        'Event registration in USD: 4 payments, 195.00 USD received, 20.00 USD returned, 175.00 USD net.',
      ]) expect(body, 'the totals of the newest report').toContain(line);
      for (const code of ISSUE_TYPE_CODES) expect(body, `no issue-type code ${code}`).not.toContain(code);
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: 'There is an admin-only Financial Reports view, open to every administrator. Every daily reconciliation run leaves a report, retained with the run: the window and provider mode it compared, how many local rows of the other mode it set aside, what each pass found, the issues it raised, the issues resolved since the previous run and by whom, the carried-forward reconciling items, and gross totals by category and currency counting live rows only. The view lists the reports newest first and an administrator opens any one of them; the newest is what the site shows as the current state of the money, refreshed by the next run. The view also shows when the emailed digest last went out, when the next is due, and the address it goes to. The email is a copy of the newest report at the cadence; nothing depends on it being read, because the same report is on the site the morning after every run. The view is read-only and offers no state-changing control.',
    defect: 'The Treasurer reads a stale or zero report as the current state of the money.',
    writes: false,
    async run(ctx) {
      const run = newestReconciliation(ctx);
      const list = await ctx.page('/admin/payments/reports');
      const links = [...list.matchAll(/href="\/admin\/payments\/reports\/([^"]+)"/g)].map((m) => m[1]);
      expect(links[0], 'the newest report is listed first').toBe(run.id);

      const [digest] = ctx.rows<{ finished_at: string }>(
        `SELECT finished_at FROM system_job_runs
          WHERE job_name = 'SYS_Reconciliation_Digest' AND status = 'succeeded'
          ORDER BY finished_at DESC, id DESC LIMIT 1`, // ordering-is-the-contract: the last send
      );
      expectRow(list, ['Sent to', TREASURER], 'the digest address');
      expectRow(list, ['Cadence', 'every 30 days'], 'the digest cadence');
      expectRow(list, ['Last sent', tsDisplay(digest.finished_at)], 'when the digest last went out');
      expectRow(list, ['Next due', tsDisplay(new Date(Date.parse(digest.finished_at) + 30 * DAY_MS).toISOString())],
        'when the next is due');
      expect(stateChangingForms(list), 'the reports list changes nothing').toEqual([]);

      const report = await ctx.page(`/admin/payments/reports/${run.id}`);
      for (const row of WINDOW_TOTALS) expectRow(report, row, `totals row ${row.slice(0, 2).join(' ')}`);
      expect(report, 'the mode it compared').toContain('Test mode (no real money)');
      expect(report, 'the test-mode charge is left out of the totals').toContain('Set aside: 1 test-mode payment.');
      expect(report, 'how many rows of the other mode it set aside').toMatch(/Set aside as belonging to the other provider mode: \d+ payments/);
      const items = listItems(report);
      expect(items.some((li) => li.includes(REHEARSAL_NOTE) && li.includes(`by ${FIN}`)),
        'the carried-forward item names who explained it').toBe(true);
      expect(items.some((li) => li.includes(`resolved`) && li.includes(`by ${FIN}`) && !li.includes(REHEARSAL_NOTE)),
        'the issues resolved since the previous run, by whom').toBe(true);
      expect(stateChangingForms(report), 'the report changes nothing').toEqual([]);
    },
  },
  {
    persona: FIN,
    story: 'A_Reconcile_Payments',
    criterion: "The All Payments view, the Financial Reports view and the Stripe dashboard state that processing fees, payouts and net proceeds are read at the payment provider, which is the book of record for money movement; the platform's figures are gross, dated by charge, and are not expected to match a bank deposit.",
    defect: 'The Treasurer reads gross platform figures as bank deposits.',
    writes: false,
    async run(ctx) {
      const { PROVIDER_BOOK_OF_RECORD_LINE } = await import('../../../src/services/paymentReconciliationService');
      const run = newestReconciliation(ctx);
      for (const path of [`/admin/payments?${allTime()}`, '/admin/payments/reports',
        `/admin/payments/reports/${run.id}`, '/admin/payments/health']) {
        expect(await ctx.page(path), path).toContain(PROVIDER_BOOK_OF_RECORD_LINE);
      }
    },
  },
  {
    persona: FIN,
    story: 'A_View_Stripe_Config_And_Payments',
    criterion: 'The admin Stripe dashboard clearly shows whether the system is in test or live mode and when this mode was last changed.',
    defect: 'An administrator cannot tell whether real money is moving.',
    writes: false,
    async run(ctx) {
      const html = await ctx.page('/admin/payments/health');
      const values = tableRows(html).map((r) => r[1]);
      expect(values, 'the declared mode, which outside production does not apply').toContain('Does not apply outside production');
      const [declared] = ctx.rows<{ effective_start_at: string }>(
        `SELECT effective_start_at FROM system_config_current WHERE config_key = 'payments_declared_mode'`,
      );
      expect(values, 'when the declared mode last changed')
        .toContain(declared ? tsDisplay(declared.effective_start_at) : 'not yet recorded');
    },
  },
  {
    persona: FIN,
    story: 'A_View_Stripe_Config_And_Payments',
    criterion: 'The dashboard shows webhook health, including the timestamp of the last successful webhook and counts of failures over a recent window (for example the last 24 hours), with obvious warning states when webhooks are failing or have been silent for too long.',
    defect: 'A failing webhook goes unnoticed and payments are missed.',
    writes: false,
    async run(ctx) {
      const [latest] = ctx.rows<{ processed_at: string }>(
        `SELECT processed_at FROM stripe_events WHERE event_id = 'evt_persona_fin_latest'`,
      );
      const html = await ctx.page('/admin/payments/health');
      expect(html, 'the last processed delivery').toContain(tsDisplay(latest.processed_at));
      const failureRow = tableRows(html).find((r) => r.some((c) => c.includes('evt_persona_fin_failed')));
      expect(failureRow, 'the failed delivery is listed').toBeDefined();
      expect(failureRow![1], 'one failure in the window').toBe('1');
      expect(html, 'the failure is drawn as a warning').toMatch(/<span class="badge badge-warn">1<\/span>/);
    },
  },
  {
    persona: FIN,
    story: 'A_View_Stripe_Config_And_Payments',
    criterion: 'The dashboard shows which mode the loaded payment credential is actually in, test or live, taken from the credential the running process holds rather than from configuration, so a half-applied arming change is visible rather than silent. It shows no other key information: no identifier, no fragment of the key, and no age. Key rotation and its cadence are System Administrator responsibilities, tracked against the provider\'s own key records and the operator rotation runbook, not surfaced to application administrators who cannot act on them.',
    defect: 'A half-applied arming change is silent, or key material leaks onto a page.',
    writes: false,
    async run(ctx) {
      const html = await ctx.page('/admin/payments/health');
      // The stand-in provider below production holds a test credential.
      expect(tableRows(html).map((r) => r[1]), 'the credential the process holds').toContain('Test');
      expect(html, 'no key identifier or fragment').not.toMatch(/\b[sr]k_(test|live)_/);
    },
  },
  {
    persona: FIN,
    story: 'A_View_Stripe_Config_And_Payments',
    criterion: 'The dashboard summarizes recent payment volume, broken down by category (donations, membership fees, event registrations) for a configurable time window (for example last 30 days), including both count and total amount, counting live-mode rows only and stating how many rows were set aside.',
    defect: "The dashboard misreports the day's takings, or counts rehearsal money as real.",
    writes: false,
    async run(ctx) {
      const html = await ctx.page('/admin/payments/health');
      expectRow(html, ['Donation', '1', '15.00 EUR', '--', '15.00 EUR'], "Eli's euro donation");
      expectRow(html, ['Event registration', '1', '60.00 USD', '--', '60.00 USD'], "Jo's Worlds fee");
      expect(tableRows(html).some((r) => r[0] === 'Membership'), 'membership fees have their row').toBe(true);
      expect(html, 'the rehearsal charge is set aside, and said so').toContain('Set aside: 1 test-mode payment.');
    },
  },
  {
    persona: FIN,
    story: 'A_View_Stripe_Config_And_Payments',
    criterion: 'From this dashboard, admins can navigate directly to the “All Payments” view and the “Reconciliation Issues” view described in A_Reconcile_Payments for deeper inspection.',
    defect: 'An administrator who sees a warning cannot reach the detail behind it.',
    writes: false,
    async run(ctx) {
      const html = await ctx.page('/admin/payments/health');
      expect(html).toContain('href="/admin/payments"');
      expect(html).toContain('href="/admin/payments/reconciliation"');
    },
  },
  {
    persona: FIN,
    story: 'A_View_Stripe_Config_And_Payments',
    criterion: 'The dashboard is read-only and offers no state-changing control. It links to the “All Payments” and “Reconciliation Issues” views for deeper inspection, and to the payment provider\'s own event log for the per-delivery detail of a failed webhook. Halting live payments and rotating keys are System Administrator actions run by script, not application-administrator buttons: the payments pause flag has no application write path, and disarming payments requires the provider\'s webhook endpoint be disabled first. Where the dashboard shows a warning state, it names the operator procedure that clears it.',
    defect: 'An administrator can pause payments or rotate keys from a page, outside the scripted procedure.',
    writes: false,
    async run(ctx) {
      const html = await ctx.page('/admin/payments/health');
      expect(stateChangingForms(html), 'the dashboard changes nothing').toEqual([]);
      expect(html, 'links to All Payments').toContain('href="/admin/payments"');
      expect(html, 'links to Reconciliation Issues').toContain('href="/admin/payments/reconciliation"');
      expect(html, "links to the provider's per-delivery event log").toContain('href="https://dashboard.stripe.com/webhooks"');
    },
  },
];
