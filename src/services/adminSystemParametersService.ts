/**
 * Admin system-parameters service.
 *
 * Owns: shaping and validation for the one admin view over the runtime-mutable
 * configuration store, and the audited writes that change a value. Covers the
 * membership prices, the outbox and reminder settings, and the retention
 * windows. Does not own the values' meaning at read time: each consuming
 * service still reads its own key through `configReader`, so a change here
 * reaches a job or a flow the next time it runs, with no redeploy.
 *
 * Required patterns: `system_config` is append-only, so a change is a new row
 * superseding the old one and never an update, and the row carries the acting
 * administrator and the reason they gave. Every write appends one
 * `audit_entries` row in the same transaction as the configuration row, so a
 * value that changed always carries its record. Validation refuses a value
 * outside the safe range for its key rather than storing it, because these
 * values drive jobs that would otherwise fail far from the screen that set
 * them.
 *
 * Invariants preserved: the payment retention window never falls below its
 * seven-year legal floor; the second Active Player reminder always falls
 * closer to the expiry than the first, since a later second reminder would
 * either duplicate the first or never send; a scheduled price never starts in
 * the past, because the store resolves the latest start date at or before now
 * and a backdated row would silently do nothing; and one product carries at
 * most one price per start date, which the store's own unique constraint
 * enforces and this service reports as a conflict.
 *
 * The three emergency switches are rendered read-only and this service holds
 * no path that writes them. Halting payments or mail is an operator action run
 * by script, so the screen shows each switch's state, when it took effect, and
 * the script that changes it.
 *
 * Persistence: reads `system_config_current` and, for the history a price
 * change and a pause need to be reviewable, the `system_config` table itself;
 * writes `system_config` and `audit_entries`.
 *
 * Side effects: audit append only, `config.updated` for a changed value under
 * the `system` category and `config.price_scheduled` for a new membership
 * price under the `pricing` category. No mail, no work-queue item, no alarm.
 */
import { randomUUID } from 'crypto';
import { systemConfig, transaction, type SystemConfigRow } from '../db/db';
import { appendAuditEntry } from './auditService';
import { ConflictError, ValidationError } from './serviceErrors';
import { isUniqueConstraintError, runSqliteRead } from './sqliteRetry';
import type { PageViewModel } from '../types/page';

const PAGE_HREF = '/admin/system-parameters';
const PRICE_HREF = '/admin/system-parameters/pricing';
const REASON_MAX = 300;
const HISTORY_LIMIT = 20;

type RetentionDisposition = 'Anonymize' | 'Delete' | 'Hold';

interface ParameterSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  defaultValue: number;
  helpText: string;
  disposition?: RetentionDisposition;
}

interface SectionSpec {
  title: string;
  intro: string;
  parameters: ParameterSpec[];
}

interface SwitchSpec {
  key: string;
  label: string;
  runningLabel: string;
  pausedLabel: string;
  operatorScript: string;
  helpText: string;
}

const PRICE_PRODUCTS: Array<{ key: string; label: string; defaultCents: number }> = [
  { key: 'tier1_price_cents', label: 'Tier 1 IFPA Member', defaultCents: 1000 },
  { key: 'tier2_price_cents', label: 'Tier 2 IFPA Organizer Member', defaultCents: 5000 },
];

// Above this, a United States charity taking a payment where the payer
// receives something in return owes them a written statement of how much is
// deductible. Membership dues are that kind of payment, and nothing on the
// platform watches for the threshold, so the screen says so where the price is
// set.
const DISCLOSURE_THRESHOLD_CENTS = 7500;

const SECTIONS: SectionSpec[] = [
  {
    title: 'Email and Notifications',
    intro: 'How often the platform sends, how hard it tries, and when a member hears that their Active Player status is running out.',
    parameters: [
      {
        key: 'outbox_max_retry_attempts',
        label: 'Maximum send attempts',
        unit: 'attempts',
        min: 1,
        max: 20,
        defaultValue: 5,
        helpText: 'How many times the sender retries one message before setting it aside for an administrator to look at. The wait between attempts grows each time, so raising this delays that hand-off by more than it looks.',
      },
      {
        key: 'outbox_poll_interval_seconds',
        label: 'Time between send runs',
        unit: 'seconds',
        min: 1,
        max: 3600,
        defaultValue: 30,
        helpText: 'How often the sender looks for new mail to send. A longer gap is the wait a member sees before a verification link or a password reset arrives.',
      },
      {
        key: 'active_player_expiry_reminder_days_1',
        label: 'First Active Player reminder',
        unit: 'days before expiry',
        min: 1,
        max: 365,
        defaultValue: 30,
        helpText: 'The first warning to a member whose Active Player status is about to lapse, counted in days before the end date.',
      },
      {
        key: 'active_player_expiry_reminder_days_2',
        label: 'Second Active Player reminder',
        unit: 'days before expiry',
        min: 1,
        max: 365,
        defaultValue: 7,
        helpText: 'The second warning, which has to fall closer to the end date than the first one. A notice on the day itself is always sent and is not set here.',
      },
    ],
  },
  {
    title: 'Data Retention and Cleanup',
    intro: 'Retention means three different things on this screen, so each window says which. Anonymize keeps the record and clears the personal details in it. Delete removes the row outright, and is used only where the row is the personal data. Hold states how long an archive must keep something, and never deletes anything.',
    parameters: [
      {
        key: 'member_cleanup_grace_days',
        label: 'Deleted account grace period',
        unit: 'days',
        min: 1,
        max: 3650,
        defaultValue: 90,
        disposition: 'Anonymize',
        helpText: 'How long a deleted account keeps its personal details before they are cleared. Results and honors survive, because the record stays and only the person is severed from it. It is also the window in which a deletion can still be undone.',
      },
      {
        key: 'deceased_cleanup_grace_days',
        label: 'Deceased member grace period',
        unit: 'days',
        min: 1,
        max: 3650,
        defaultValue: 30,
        disposition: 'Anonymize',
        helpText: 'How long the platform waits after a member is recorded as deceased before clearing their contact details. The window exists so a wrongly recorded death can be corrected before anything is lost.',
      },
      {
        key: 'payment_retention_days',
        label: 'Payment record retention',
        unit: 'days',
        min: 2555,
        max: 36500,
        defaultValue: 2555,
        disposition: 'Anonymize',
        helpText: 'How long a payment keeps the payer’s identifying details. The financial record itself is never removed. Seven years is a legal minimum, so this cannot be set lower.',
      },
      {
        key: 'outbox_retention_days',
        label: 'Sent message retention',
        unit: 'days',
        min: 1,
        max: 3650,
        defaultValue: 90,
        disposition: 'Delete',
        helpText: 'How long a copy of a message sent to one person is kept before it is deleted, address and text together. The record of what went out to a list names no recipient and is kept permanently, so it is not governed by this.',
      },
      {
        key: 'audit_retention_days',
        label: 'Audit record hold',
        unit: 'days',
        min: 1,
        max: 36500,
        defaultValue: 2555,
        disposition: 'Hold',
        helpText: 'How long the accountability record must be kept. Nothing on the platform deletes audit entries and this does not schedule a deletion: it states the obligation the archive has to meet. Seven years is the baseline.',
      },
      {
        key: 'ballot_retention_days',
        label: 'Ballot hold',
        unit: 'days',
        min: 1,
        max: 36500,
        defaultValue: 2555,
        disposition: 'Hold',
        helpText: 'How long voting records must be kept. Nothing deletes them, because disposing of IFPA vote records is a decision for the association rather than a maintenance job. Seven years is the baseline.',
      },
    ],
  },
];

const SWITCHES: SwitchSpec[] = [
  {
    key: 'payments_paused',
    label: 'Pause payments',
    runningLabel: 'Payments are running',
    pausedLabel: 'Payments are paused',
    operatorScript: 'scripts/payments-pause.sh',
    helpText: 'While this is set, a new membership purchase or donation is refused before the payment provider is contacted at all. Money already in flight settles as normal.',
  },
  {
    key: 'email_outbox_paused',
    label: 'Pause outbound mail',
    runningLabel: 'Outbound mail is running',
    pausedLabel: 'Outbound mail is paused',
    operatorScript: 'scripts/outbound-mail-pause.sh',
    helpText: 'While this is set, the sender stops sending. Nothing queued is lost, and everything waiting goes out when it is released.',
  },
  {
    key: 'bulk_send_paused',
    label: 'Stop bulk sending',
    runningLabel: 'Bulk sending is running',
    pausedLabel: 'Bulk sending is stopped',
    operatorScript: 'scripts/bulk-send-pause.sh',
    helpText: 'Stops a newsletter or announcement without touching verification links, password resets and receipts, which keep going out. Unlike the automatic halt on bounces, this one is cleared only by a person.',
  },
];

export const EDITABLE_PARAMETER_KEYS: readonly string[] =
  SECTIONS.flatMap((section) => section.parameters.map((p) => p.key));

const SPEC_BY_KEY = new Map<string, ParameterSpec>(
  SECTIONS.flatMap((section) => section.parameters.map((p) => [p.key, p] as const)),
);

export interface ParameterFieldViewModel {
  key: string;
  label: string;
  value: string;
  defaultValue: string;
  unit: string;
  helpText: string;
  dispositionLabel: string;
  hasDisposition: boolean;
  errorMessage: string;
  hasError: boolean;
}

export interface ParameterSectionViewModel {
  title: string;
  intro: string;
  fields: ParameterFieldViewModel[];
}

export interface SwitchViewModel {
  key: string;
  label: string;
  stateLabel: string;
  isPaused: boolean;
  sinceLabel: string;
  reasonText: string;
  hasReason: boolean;
  operatorScript: string;
  helpText: string;
}

export interface PriceEntryViewModel {
  amountLabel: string;
  effectiveLabel: string;
  reasonText: string;
  isInForce: boolean;
  stateLabel: string;
}

export interface PriceProductViewModel {
  key: string;
  label: string;
  currentAmountLabel: string;
  entries: PriceEntryViewModel[];
  hasEntries: boolean;
}

export interface PriceFormFields {
  priceKey: string;
  amountUsd: string;
  effectiveStartDate: string;
  reason: string;
}

export interface SystemParametersContent {
  sections: ParameterSectionViewModel[];
  switches: SwitchViewModel[];
  priceProducts: PriceProductViewModel[];
  priceOptions: Array<{ value: string; label: string; selected: boolean }>;
  priceFields: PriceFormFields;
  priceHelpText: string;
  reason: string;
  reasonMax: number;
  formAction: string;
  priceFormAction: string;
  savedMessage: string;
  hasSavedMessage: boolean;
  errorList: string[];
  hasErrors: boolean;
  fieldErrors: Record<string, string>;
  priceErrorList: string[];
  hasPriceErrors: boolean;
  priceFieldErrors: Record<string, string>;
}

export interface ParameterUpdateInput {
  values: Record<string, string>;
  reason: string;
}

export interface PriceScheduleInput {
  priceKey: string;
  amountUsd: string;
  effectiveStartDate: string;
  reason: string;
}

interface PageOptions {
  saved?: 'parameters' | 'price';
  submittedValues?: Record<string, string>;
  submittedReason?: string;
  fieldErrors?: Record<string, string>;
  submittedPrice?: PriceScheduleInput;
  priceFieldErrors?: Record<string, string>;
}

/**
 * Whole cents from an amount typed the way money is written, with or without a
 * decimal part. Returns null for anything that is not a plain positive amount,
 * so the caller reports one clear message rather than storing a rounded guess.
 */
export function parseUsdToCents(raw: string): number | null {
  const text = raw.trim().replace(/^\$/, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [dollars, fraction = ''] = text.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCentsAsUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * A whole non-negative count. Rejects decimals, signs and anything with other
 * characters in it, so a mistyped value is refused at the form rather than
 * silently truncated into a job's interval or window.
 */
export function parseCountValue(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  return Number(text);
}

// Stored timestamps are UTC; naming the zone stops an administrator reading the
// figure as their own clock.
function tsDisplay(iso: string): string {
  return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function configRowId(): string {
  return `cfg_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function readCurrentRows(): Map<string, SystemConfigRow> {
  const rows = systemConfig.listCurrent.all() as SystemConfigRow[];
  return new Map(rows.map((row) => [row.config_key, row]));
}

function currentNumber(rows: Map<string, SystemConfigRow>, spec: ParameterSpec): number {
  const row = rows.get(spec.key);
  if (!row) return spec.defaultValue;
  const parsed = parseCountValue(row.value_json);
  return parsed === null ? spec.defaultValue : parsed;
}

function validateOne(spec: ParameterSpec, raw: string): { value: number } | { error: string } {
  const parsed = parseCountValue(raw);
  if (parsed === null) {
    return { error: `${spec.label}: enter a whole number of ${spec.unit}.` };
  }
  if (parsed < spec.min) {
    return { error: `${spec.label}: ${spec.min} is the lowest value allowed.` };
  }
  if (parsed > spec.max) {
    return { error: `${spec.label}: ${spec.max} is the highest value allowed.` };
  }
  return { value: parsed };
}

export const adminSystemParametersService = {
  getSystemParametersPage(opts: PageOptions = {}): PageViewModel<SystemParametersContent> {
    return runSqliteRead('admin system parameters page', () => {
      const currentRows = readCurrentRows();
      const submitted = opts.submittedValues;
      const fieldErrors = opts.fieldErrors ?? {};

      const sections: ParameterSectionViewModel[] = SECTIONS.map((section) => ({
        title: section.title,
        intro: section.intro,
        fields: section.parameters.map((spec) => {
          const stored = String(currentNumber(currentRows, spec));
          const error = fieldErrors[spec.key] ?? '';
          return {
            key: spec.key,
            label: spec.label,
            value: submitted ? (submitted[spec.key] ?? stored) : stored,
            defaultValue: String(spec.defaultValue),
            unit: spec.unit,
            helpText: spec.helpText,
            dispositionLabel: spec.disposition ?? '',
            hasDisposition: spec.disposition !== undefined,
            errorMessage: error,
            hasError: error.length > 0,
          };
        }),
      }));

      const switches: SwitchViewModel[] = SWITCHES.map((spec) => {
        const row = currentRows.get(spec.key);
        const isPaused = row?.value_json.trim() === '1';
        return {
          key: spec.key,
          label: spec.label,
          stateLabel: isPaused ? spec.pausedLabel : spec.runningLabel,
          isPaused,
          sinceLabel: row ? tsDisplay(row.effective_start_at) : 'since the platform was built',
          reasonText: row?.reason_text ?? '',
          hasReason: Boolean(row?.reason_text),
          operatorScript: spec.operatorScript,
          helpText: spec.helpText,
        };
      });

      const priceProducts: PriceProductViewModel[] = PRICE_PRODUCTS.map((product) => {
        const history = systemConfig.listHistoryByKey.all(
          product.key,
          HISTORY_LIMIT,
        ) as SystemConfigRow[];
        const currentRow = currentRows.get(product.key);
        const currentCents = currentRow
          ? (parseCountValue(currentRow.value_json) ?? product.defaultCents)
          : product.defaultCents;
        return {
          key: product.key,
          label: product.label,
          currentAmountLabel: formatCentsAsUsd(currentCents),
          entries: history.map((row) => {
            const isInForce = currentRow !== undefined && row.id === currentRow.id;
            const isFuture = row.effective_start_at > nowIso();
            return {
              amountLabel: formatCentsAsUsd(parseCountValue(row.value_json) ?? 0),
              effectiveLabel: tsDisplay(row.effective_start_at),
              reasonText: row.reason_text,
              isInForce,
              stateLabel: isInForce ? 'In force' : isFuture ? 'Scheduled' : 'Superseded',
            };
          }),
          hasEntries: history.length > 0,
        };
      });

      const submittedPrice = opts.submittedPrice;
      const priceFieldErrors = opts.priceFieldErrors ?? {};
      const priceErrorList = Object.values(priceFieldErrors);
      const errorList = Object.values(fieldErrors);
      const savedMessage =
        opts.saved === 'parameters'
          ? 'Saved. Each changed value is picked up the next time the job or flow that reads it runs.'
          : opts.saved === 'price'
            ? 'Scheduled. The new price applies from its start date, and the price in force now applies until then.'
            : '';

      return {
        seo: { title: 'System Parameters', noindex: true },
        page: {
          sectionKey: 'admin',
          pageKey: 'admin_system_parameters',
          title: 'System Parameters',
        },
        content: {
          sections,
          switches,
          priceProducts,
          priceOptions: PRICE_PRODUCTS.map((product) => ({
            value: product.key,
            label: product.label,
            selected: submittedPrice?.priceKey === product.key,
          })),
          priceFields: {
            priceKey: submittedPrice?.priceKey ?? '',
            amountUsd: submittedPrice?.amountUsd ?? '',
            effectiveStartDate: submittedPrice?.effectiveStartDate ?? '',
            reason: submittedPrice?.reason ?? '',
          },
          priceHelpText: `A price is changed by scheduling a new one. Past entries cannot be edited or removed, and a scheduled price starts on the date you choose. Dues above ${formatCentsAsUsd(DISCLOSURE_THRESHOLD_CENTS)} oblige a United States charity to tell the payer in writing how much of the payment is deductible and what they received for it, and nothing on the platform checks for that.`,
          reason: opts.submittedReason ?? '',
          reasonMax: REASON_MAX,
          formAction: PAGE_HREF,
          priceFormAction: PRICE_HREF,
          savedMessage,
          hasSavedMessage: savedMessage.length > 0,
          errorList,
          hasErrors: errorList.length > 0,
          fieldErrors,
          priceErrorList,
          hasPriceErrors: priceErrorList.length > 0,
          priceFieldErrors,
        },
      };
    });
  },

  /**
   * Validates every submitted value, then writes only the ones that changed,
   * each as a new superseding row with its own audit entry, all in one
   * transaction. A single invalid value refuses the whole submission, so an
   * administrator never lands half of a set of related changes.
   */
  updateParameters(input: ParameterUpdateInput, actorMemberId: string): { changedKeys: string[] } {
    const reason = input.reason.trim();
    const errors: Record<string, string> = {};
    const accepted = new Map<string, number>();

    if (!reason) {
      errors.reason = 'Reason: say why the value is changing. It is kept with the change.';
    } else if (reason.length > REASON_MAX) {
      errors.reason = `Reason: at most ${REASON_MAX} characters.`;
    }

    for (const key of EDITABLE_PARAMETER_KEYS) {
      const spec = SPEC_BY_KEY.get(key)!;
      const raw = input.values[key];
      if (raw === undefined) continue;
      const result = validateOne(spec, raw);
      if ('error' in result) errors[key] = result.error;
      else accepted.set(key, result.value);
    }

    const currentRows = readCurrentRows();
    const firstReminderKey = 'active_player_expiry_reminder_days_1';
    const secondReminderKey = 'active_player_expiry_reminder_days_2';
    const first =
      accepted.get(firstReminderKey) ??
      currentNumber(currentRows, SPEC_BY_KEY.get(firstReminderKey)!);
    const second =
      accepted.get(secondReminderKey) ??
      currentNumber(currentRows, SPEC_BY_KEY.get(secondReminderKey)!);
    if (!errors[firstReminderKey] && !errors[secondReminderKey] && second >= first) {
      errors[secondReminderKey] =
        'Second Active Player reminder: it has to be fewer days before expiry than the first reminder.';
    }

    if (Object.keys(errors).length) {
      throw new ValidationError('Some values need attention.', { fieldErrors: errors });
    }

    const changed = [...accepted.entries()].filter(
      ([key, value]) => value !== currentNumber(currentRows, SPEC_BY_KEY.get(key)!),
    );
    if (!changed.length) return { changedKeys: [] };

    const now = nowIso();
    try {
      transaction(() => {
        for (const [key, value] of changed) {
          const previous = currentNumber(currentRows, SPEC_BY_KEY.get(key)!);
          systemConfig.insert.run(
            configRowId(),
            now,
            key,
            String(value),
            now,
            reason,
            actorMemberId,
          );
          appendAuditEntry({
            actionType: 'config.updated',
            category: 'system',
            actorType: 'admin',
            actorMemberId,
            entityType: 'system_config',
            entityId: key,
            reasonText: reason,
            metadata: { previousValue: previous, newValue: value },
          });
        }
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError('That value was changed a moment ago. Reload the page and try again.');
      }
      throw err;
    }

    return { changedKeys: changed.map(([key]) => key) };
  },

  /**
   * Adds one price to a product's schedule. The store resolves the latest
   * start date at or before now, so a start date in the past would either do
   * nothing or silently undo a later price; both are refused here rather than
   * stored.
   */
  schedulePrice(input: PriceScheduleInput, actorMemberId: string): void {
    const errors: Record<string, string> = {};
    const product = PRICE_PRODUCTS.find((p) => p.key === input.priceKey);
    if (!product) errors.priceKey = 'Membership: choose which membership the price is for.';

    const cents = parseUsdToCents(input.amountUsd ?? '');
    if (cents === null) errors.amountUsd = 'Amount: enter an amount in dollars, for example 12.50.';
    else if (cents <= 0) errors.amountUsd = 'Amount: the price has to be more than zero.';

    const date = (input.effectiveStartDate ?? '').trim();
    let effectiveStartAt = '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.effectiveStartDate = 'Start date: enter a date.';
    } else {
      effectiveStartAt = `${date}T00:00:00.000Z`;
      if (Number.isNaN(Date.parse(effectiveStartAt))) {
        errors.effectiveStartDate = 'Start date: that is not a real date.';
      } else if (effectiveStartAt < nowIso().slice(0, 10) + 'T00:00:00.000Z') {
        errors.effectiveStartDate =
          'Start date: a price cannot start in the past, because the platform reads whichever price started most recently.';
      }
    }

    const reason = (input.reason ?? '').trim();
    if (!reason) {
      errors.reason = 'Reason: say why the price is changing, for example an IFPA rule change or a board decision.';
    } else if (reason.length > REASON_MAX) {
      errors.reason = `Reason: at most ${REASON_MAX} characters.`;
    }

    if (Object.keys(errors).length) {
      throw new ValidationError('The price change needs attention.', { fieldErrors: errors });
    }

    const currentRows = readCurrentRows();
    const currentRow = currentRows.get(product!.key);
    const previousCents = currentRow
      ? (parseCountValue(currentRow.value_json) ?? product!.defaultCents)
      : product!.defaultCents;

    const now = nowIso();
    try {
      transaction(() => {
        systemConfig.insert.run(
          configRowId(),
          now,
          product!.key,
          String(cents),
          effectiveStartAt,
          reason,
          actorMemberId,
        );
        appendAuditEntry({
          actionType: 'config.price_scheduled',
          category: 'pricing',
          actorType: 'admin',
          actorMemberId,
          entityType: 'system_config',
          entityId: product!.key,
          reasonText: reason,
          metadata: {
            previousValueCents: previousCents,
            newValueCents: cents,
            effectiveStartAt,
          },
        });
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError(
          'That membership already has a price starting on that date. Choose a different start date.',
        );
      }
      throw err;
    }
  },
};
