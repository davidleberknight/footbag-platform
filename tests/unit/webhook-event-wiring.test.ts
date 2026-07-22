/**
 * The Stripe webhook endpoint must be subscribed to exactly the events the
 * dispatcher handles, and the operator who creates that endpoint has to be told
 * the correct list. Three places must agree: the required-event constant, the
 * dispatcher's switch, and the activation script that prints the setup guidance.
 * If any drifts, the endpoint can be built with a narrower list and money moves
 * with nothing recording it, invisibly from inside the application.
 *
 * This reads the source files as text rather than importing them, because the
 * payment service and adapter pull in the database, the Stripe SDK, and the
 * boot config graph that a pure wiring check does not need and that a no-DB
 * unit test should not stand up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const serviceSource = readFileSync(
  join(process.cwd(), 'src', 'services', 'paymentService.ts'),
  'utf8',
);
const adapterSource = readFileSync(
  join(process.cwd(), 'src', 'adapters', 'paymentAdapter.ts'),
  'utf8',
);
const scriptSource = readFileSync(
  join(process.cwd(), 'scripts', 'activate-payments.sh'),
  'utf8',
);

/** The event strings listed in the exported REQUIRED_WEBHOOK_EVENTS constant. */
function requiredEventsFromConstant(): string[] {
  const block = serviceSource.match(/REQUIRED_WEBHOOK_EVENTS\s*=\s*\[([\s\S]*?)\]/);
  expect(block, 'REQUIRED_WEBHOOK_EVENTS constant not found in the payment service').not.toBeNull();
  return [...block![1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]);
}

/** The case labels the dispatcher's switch handles, excluding the default arm. */
function dispatchedEvents(): string[] {
  const start = serviceSource.indexOf('function dispatchEvent');
  expect(start, 'dispatchEvent function not found; the slice anchor moved').toBeGreaterThan(-1);
  const afterStart = serviceSource.slice(start);
  const defaultIdx = afterStart.indexOf('default:');
  expect(defaultIdx, 'dispatchEvent has no default arm; the slice boundary moved').toBeGreaterThan(-1);
  const body = afterStart.slice(0, defaultIdx);
  return [...body.matchAll(/case '([a-z_.]+)':/g)].map((m) => m[1]);
}

const sorted = (xs: string[]): string[] => [...xs].sort();

describe('webhook event wiring', () => {
  it('dispatches exactly the events the endpoint is required to subscribe to', () => {
    const required = requiredEventsFromConstant();
    const dispatched = dispatchedEvents();
    // The three dispute cases share one handler, so compare the case labels
    // themselves, not the number of handler functions.
    expect(dispatched.length).toBeGreaterThan(0);
    expect(sorted(dispatched)).toEqual(sorted(required));
  });

  it('activation script tells the operator the same required event list', () => {
    const required = requiredEventsFromConstant();
    const scriptList = scriptSource.match(/REQUIRED_WEBHOOK_EVENTS="([^"]*)"/);
    expect(scriptList, 'activation script does not declare REQUIRED_WEBHOOK_EVENTS').not.toBeNull();
    const scriptEvents = scriptList![1].split(/\s+/).filter(Boolean);
    expect(sorted(scriptEvents)).toEqual(sorted(required));
  });

  it('activation script pins the same Stripe API version as the adapter', () => {
    const adapterVersion = adapterSource.match(/STRIPE_API_VERSION\s*=\s*'([^']+)'/);
    expect(adapterVersion, 'STRIPE_API_VERSION constant not found in the payment adapter').not.toBeNull();
    const scriptVersion = scriptSource.match(/STRIPE_API_VERSION="([^"]*)"/);
    expect(scriptVersion, 'activation script does not declare STRIPE_API_VERSION').not.toBeNull();
    expect(scriptVersion![1]).toBe(adapterVersion![1]);
  });
});
