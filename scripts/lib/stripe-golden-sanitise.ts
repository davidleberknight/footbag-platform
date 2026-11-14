/**
 * Sanitises captured Stripe events into the committed golden-payload set.
 *
 * The capture script (`scripts/capture-stripe-golden-payloads.sh`) fetches real
 * test-mode events from the provider and hands them here; this turns them into
 * entries the replay suite drives through the real webhook handlers. The set
 * sits in a public repository, so nothing that identifies a person or a real
 * provider object may survive, and the structure must survive whole: the
 * structure is the entire point of a golden payload, because a sanitiser that
 * reshaped events into what the handlers expect would recreate the stub's
 * shared assumptions under a more convincing name.
 *
 * What it does to each event:
 *   - Every identifier, Stripe's and the platform's own, is replaced by a
 *     synthetic one with the same prefix and the same length, consistently
 *     across the whole batch, so an invoice still points at its subscription
 *     and a charge at its intent after the rewrite.
 *   - Personal fields (names, emails, phones, addresses, the billing and
 *     customer detail blocks, shipping, a receipt address), the donor's own
 *     words (metadata comment and donation note), every link (receipts,
 *     invoices, checkout and return addresses), the client secret, the request
 *     idempotency key, and a card's fingerprint and last four digits are set to
 *     null, keeping the key in place.
 *   - Key order and every other value are kept, and the body is written in the
 *     provider's own two-space layout. The events API returns the event rather
 *     than the delivered bytes, so the replay re-signs whatever is stored.
 *
 * `findSanitisationViolations` is the single statement of what a sanitised body
 * may not carry. The capture refuses to write a batch it finds anything in, and
 * the replay suite runs the same check over the committed set, so a body
 * edited by hand after capture is held to the same rule.
 *
 * Usage (from the capture script, never by hand):
 *   npx tsx scripts/lib/stripe-golden-sanitise.ts \
 *     --manifest <file> --events-dir <dir> --existing <file> \
 *     --captured-at <YYYY-MM-DD> --out <file>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/** One captured provider event, as committed and replayed. */
export interface GoldenPayloadEntry {
  describes: string;
  eventType: string;
  rawBody: string;
  expectedOutcome: 'processed' | 'duplicate' | 'ignored';
  capturedApiVersion: string;
  capturedAt: string;
  source: string;
  sequenceGroup: string;
}

/** One manifest line: which event, what it shows, and how it replays. */
export interface ManifestLine {
  eventId: string;
  describes: string;
  expectedOutcome: GoldenPayloadEntry['expectedOutcome'];
  sequenceGroup: string;
}

const OUTCOMES = new Set(['processed', 'duplicate', 'ignored']);

/** Where every committed entry came from. */
export const GOLDEN_SOURCE = 'Stripe test mode, pre-cutover production';

/**
 * A string value shaped like a provider or platform identifier: a lowercase
 * prefix (Stripe's checkout sessions carry a second `test` or `live` part), an
 * underscore, then a body of letters and digits holding at least one digit.
 * The digit is what separates an id from an enum value such as
 * `charge_automatically`, which has the same outline and no digit.
 */
const ID_SHAPE = /^([a-z]+(?:_test|_live)?)_([A-Za-z0-9]{8,})$/;

/** The synthetic body every rewritten id carries: `gold`, zero padding, a counter. */
const SYNTHETIC_BODY = /^gold0*[0-9]+$/;

export function isIdShaped(value: string): boolean {
  const m = ID_SHAPE.exec(value);
  return m !== null && /[0-9]/.test(m[2]);
}

export function isSyntheticId(value: string): boolean {
  const m = ID_SHAPE.exec(value);
  return m !== null && SYNTHETIC_BODY.test(m[2]);
}

/** Keys whose whole value is personal, at any depth: every string inside goes. */
const PERSONAL_BLOCKS = new Set([
  'address', 'billing_details', 'customer_details', 'shipping', 'shipping_details',
  'customer_address', 'customer_shipping',
]);

/** Keys whose string value is personal, a link, or a secret, at any depth. */
const REDACTED_SCALARS = new Set([
  'name', 'email', 'phone', 'receipt_email',
  'customer_name', 'customer_email', 'customer_phone',
  'receipt_url', 'hosted_invoice_url', 'invoice_pdf', 'url',
  'success_url', 'cancel_url', 'return_url',
  'client_secret', 'fingerprint', 'last4',
]);

/** Metadata keys carrying the donor's own words. */
const REDACTED_METADATA = new Set(['comment', 'donation_note']);

/** Maps each real id to its synthetic stand-in, the same one every time it recurs. */
export class IdMapper {
  private readonly map = new Map<string, string>();

  /**
   * Counting on from the highest counter already committed keeps a new batch's
   * ids clear of every earlier batch's, so the replay can seed both sets of
   * rows in one database without two captures claiming one member or payment.
   */
  constructor(private counter = 0) {}

  synthetic(real: string): string {
    const known = this.map.get(real);
    if (known) return known;
    const m = ID_SHAPE.exec(real);
    if (!m) throw new Error(`not an identifier: ${real}`);
    this.counter += 1;
    const digits = String(this.counter);
    const padding = Math.max(0, m[2].length - 'gold'.length - digits.length);
    const replacement = `${m[1]}_gold${'0'.repeat(padding)}${digits}`;
    this.map.set(real, replacement);
    return replacement;
  }
}

function nullStrings(value: unknown): unknown {
  if (typeof value === 'string') return null;
  if (Array.isArray(value)) return value.map(nullStrings);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = nullStrings(v);
    return out;
  }
  return value;
}

function sanitiseValue(value: unknown, key: string | null, parentKey: string | null, ids: IdMapper): unknown {
  if (key !== null && PERSONAL_BLOCKS.has(key)) return nullStrings(value);
  if (key !== null && REDACTED_SCALARS.has(key) && typeof value === 'string') return null;
  if (parentKey === 'metadata' && key !== null && REDACTED_METADATA.has(key)) return null;
  if (parentKey === 'request' && key === 'idempotency_key') return null;
  if (typeof value === 'string') return isIdShaped(value) ? ids.synthetic(value) : value;
  if (Array.isArray(value)) return value.map((v) => sanitiseValue(v, null, key, ids));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitiseValue(v, k, key, ids);
    return out;
  }
  return value;
}

/** Sanitises one parsed event, sharing the id map with the rest of its batch. */
export function sanitiseEvent(event: unknown, ids: IdMapper): unknown {
  return sanitiseValue(event, null, null, ids);
}

/** The provider's own layout: two-space indentation, keys in the order sent. */
export function serialiseEvent(event: unknown): string {
  return JSON.stringify(event, null, 2);
}

/**
 * Everything a committed body may not carry, as one message per finding. An
 * empty list is a clean body. Checked by key and value rather than by searching
 * the text, so a field the sanitiser missed is named by its path.
 */
export function findSanitisationViolations(rawBody: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return ['the body is not JSON'];
  }
  const found: string[] = [];
  const walk = (value: unknown, at: string, key: string | null, parentKey: string | null): void => {
    if (key === 'livemode' && value === true) found.push(`${at} is true: a live-mode event`);
    if (key !== null && PERSONAL_BLOCKS.has(key)) {
      const leftover = JSON.stringify(value).match(/"[^"]*"\s*:\s*"/g);
      if (leftover) found.push(`${at} still carries text`);
      return;
    }
    if (key !== null && REDACTED_SCALARS.has(key) && typeof value === 'string') {
      found.push(`${at} is populated`);
      return;
    }
    if (parentKey === 'metadata' && key !== null && REDACTED_METADATA.has(key) && value !== null) {
      found.push(`${at} is populated`);
      return;
    }
    if (parentKey === 'request' && key === 'idempotency_key' && value !== null) {
      found.push(`${at} is populated`);
      return;
    }
    if (typeof value === 'string') {
      if (isIdShaped(value) && !isSyntheticId(value)) found.push(`${at} holds an identifier off the synthetic pattern`);
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(value)) found.push(`${at} holds an email address`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${at}[${i}]`, null, key));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`, k, key);
    }
  };
  walk(parsed, '$', null, null);
  return found;
}

/**
 * Reads a manifest: one event per line, `event id | describes | expected
 * outcome | sequence group`. Blank lines and lines starting with `#` are
 * skipped. Throws, naming the line, on anything else malformed.
 */
export function parseManifest(text: string): ManifestLine[] {
  const lines: ManifestLine[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length !== 4 || parts.some((p) => p === '')) {
      throw new Error(`manifest line ${i + 1}: expected four fields separated by |`);
    }
    const [eventId, describes, expectedOutcome, sequenceGroup] = parts;
    if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) {
      throw new Error(`manifest line ${i + 1}: '${eventId}' is not an event id`);
    }
    if (!OUTCOMES.has(expectedOutcome)) {
      throw new Error(`manifest line ${i + 1}: expected outcome must be processed, duplicate or ignored`);
    }
    lines.push({
      eventId, describes, sequenceGroup,
      expectedOutcome: expectedOutcome as ManifestLine['expectedOutcome'],
    });
  });
  if (lines.length === 0) throw new Error('the manifest names no events');
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.eventId)) throw new Error(`the manifest names ${l.eventId} twice`);
    seen.add(l.eventId);
  }
  return lines;
}

/** The highest synthetic counter any committed body uses, or zero for an empty set. */
export function highestSyntheticCounter(entries: GoldenPayloadEntry[]): number {
  let highest = 0;
  for (const e of entries) {
    for (const m of e.rawBody.matchAll(/"[a-z]+(?:_test|_live)?_gold0*([0-9]+)"/g)) {
      highest = Math.max(highest, Number(m[1]));
    }
  }
  return highest;
}

/**
 * Builds the new set. A sequence group is captured whole, in one run, because
 * identifiers are rewritten once per run: an object one run calls `gold..12`
 * another calls something else, so a group split across runs would no longer
 * link up. So the batch replaces every committed entry of each group it names,
 * keeps every other entry as it was, and appends its own entries in manifest
 * order, which is the order each group replays in. Counting starts after the
 * entries it keeps, so the same capture run twice writes the same set.
 * Throws if any sanitised body still carries something it may not.
 */
export function buildGoldenSet(opts: {
  manifest: ManifestLine[];
  events: Map<string, unknown>;
  existing: GoldenPayloadEntry[];
  capturedAt: string;
}): GoldenPayloadEntry[] {
  const groups = new Set(opts.manifest.map((l) => l.sequenceGroup));
  const kept = opts.existing.filter((e) => !groups.has(e.sequenceGroup));
  const ids = new IdMapper(highestSyntheticCounter(kept));
  const fresh: GoldenPayloadEntry[] = opts.manifest.map((line) => {
    const event = opts.events.get(line.eventId) as Record<string, unknown> | undefined;
    if (!event) throw new Error(`no captured event for ${line.eventId}`);
    const rawBody = serialiseEvent(sanitiseEvent(event, ids));
    const violations = findSanitisationViolations(rawBody);
    if (violations.length > 0) {
      throw new Error(`${line.eventId} is not clean after sanitising: ${violations.join('; ')}`);
    }
    return {
      describes: line.describes,
      eventType: String(event.type),
      rawBody,
      expectedOutcome: line.expectedOutcome,
      capturedApiVersion: String(event.api_version),
      capturedAt: opts.capturedAt,
      source: GOLDEN_SOURCE,
      sequenceGroup: line.sequenceGroup,
    };
  });
  return [...kept, ...fresh];
}

function argValue(args: string[], flag: string): string {
  const i = args.indexOf(flag);
  const v = i >= 0 ? args[i + 1] : undefined;
  if (!v) throw new Error(`${flag} is required`);
  return v;
}

export function main(args: string[]): number {
  try {
    const manifest = parseManifest(readFileSync(argValue(args, '--manifest'), 'utf8'));
    const eventsDir = argValue(args, '--events-dir');
    const existingPath = argValue(args, '--existing');
    const capturedAt = argValue(args, '--captured-at');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) throw new Error('--captured-at must be YYYY-MM-DD');
    const out = argValue(args, '--out');
    const events = new Map<string, unknown>();
    for (const line of manifest) {
      events.set(line.eventId, JSON.parse(readFileSync(path.join(eventsDir, `${line.eventId}.json`), 'utf8')));
    }
    const existing = existsSync(existingPath)
      ? (JSON.parse(readFileSync(existingPath, 'utf8')) as GoldenPayloadEntry[])
      : [];
    const set = buildGoldenSet({ manifest, events, existing, capturedAt });
    writeFileSync(out, `${JSON.stringify(set, null, 2)}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
