/**
 * Staging rendering of the simulated-email card.
 *
 * The card is keyed on SES_ADAPTER, not on FOOTBAG_ENV:
 * SES_ADAPTER=stub (dev AND staging) → the dev card with captured messages;
 * SES_ADAPTER=live (production only) → no card. Staging therefore renders the
 * same card as dev because staging runs the stub adapter — there is no
 * footbagEnv branch in the card path.
 *
 * Fully booting under FOOTBAG_ENV=staging would force NODE_ENV=production and
 * the whole prod-hardening surface (trust-proxy, secure cookies, origin pin),
 * which the sibling prod test deliberately avoids. Instead this test pins the
 * two facts that make staging == dev for this surface:
 *
 *   1. Functional: under SES_ADAPTER=stub, getEmailPreview() returns
 *      {mode:'dev', messages:[...]} reflecting captured stub messages.
 *   2. Regression guard: simulatedEmailService never reads config.footbagEnv,
 *      so the card cannot be silently gated off on staging.
 *
 * Sibling files cover dev-mode route rendering (simulated-email-card.routes)
 * and production (simulated-email-card.prod).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3074');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let sesMod: typeof import('../../src/adapters/sesAdapter');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcMod: typeof import('../../src/services/simulatedEmailService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  await importApp();
  sesMod = await import('../../src/adapters/sesAdapter');
  svcMod = await import('../../src/services/simulatedEmailService');
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  sesMod.getSesAdapter();
  sesMod.getStubSesAdapterForTests()?.clear();
});

describe('simulated-email card on staging (SES_ADAPTER=stub) renders like dev', () => {
  it('getEmailPreview returns the dev card with captured messages under the stub adapter', async () => {
    await sesMod.getSesAdapter().sendEmail({
      to:       'staging-tester@example.com',
      subject:  'Verify your IFPA Footbag account',
      bodyText: 'Confirm: http://localhost/verify/staging-token-123',
    });

    const preview = await svcMod.simulatedEmailService.getEmailPreview();
    expect(preview).not.toBeNull();
    expect(preview!.mode).toBe('dev');
    const hit = preview!.messages.find((m) => m.to === 'staging-tester@example.com');
    expect(hit).toBeDefined();
    expect(hit!.subject).toBe('Verify your IFPA Footbag account');
    expect(hit!.firstUrl).toBe('http://localhost/verify/staging-token-123');
  });

  it('the card service is not gated on footbagEnv (so staging cannot diverge from dev)', () => {
    const source = readFileSync(
      path.resolve(__dirname, '..', '..', 'src', 'services', 'simulatedEmailService.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/footbagEnv/);
  });
});
