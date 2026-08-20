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

  it('shows a message captured by the worker process, not just this one', async () => {
    // The outbox loop runs in the worker container, so a message it drains is
    // captured in ITS stub buffer and never appears in this process's. The card
    // read only the local buffer, so it showed the mail or showed nothing
    // depending on which process claimed the row first -- and reported a sent
    // mail as "no messages" beside a hint blaming the address.
    //
    // Only reproducible with two processes, which a test cannot have: the
    // worker is stood in for at the capture client, the same seam /dev/outbox
    // uses. Nothing is put in the local buffer here, so the assertion can only
    // pass if the card consulted the worker.
    const captureMod = await import('../../src/testkit/devOutboxCaptureClient');
    captureMod.setDevOutboxCaptureClientForTests({
      async fetchWorkerCaptured() {
        return [
          {
            to:          'worker-drained@example.com',
            subject:     'Verify your IFPA Footbag account',
            bodyText:    'Confirm: http://localhost/verify/worker-token-456',
            from:        'noreply@example.test',
            messageId:   'worker-msg-1',
            deliveredAt: new Date().toISOString(),
          },
        ];
      },
    });

    try {
      const preview = await svcMod.simulatedEmailService.getEmailPreview();
      expect(preview).not.toBeNull();
      const hit = preview!.messages.find((m) => m.to === 'worker-drained@example.com');
      expect(hit, 'a worker-captured message must reach the card').toBeDefined();
      expect(hit!.firstUrl).toBe('http://localhost/verify/worker-token-456');
    } finally {
      captureMod.resetDevOutboxCaptureClientForTests();
    }
  });

  it('still shows a locally captured message when the worker has none', async () => {
    // The merge must not replace the local buffer, only add to it: a web-only
    // dev run has no worker at all.
    const captureMod = await import('../../src/testkit/devOutboxCaptureClient');
    captureMod.setDevOutboxCaptureClientForTests({
      async fetchWorkerCaptured() {
        return [];
      },
    });

    try {
      sesMod.getStubSesAdapterForTests()!.sentMessages.push({
        to:          'local-only@example.com',
        subject:     'Verify your IFPA Footbag account',
        bodyText:    'Confirm: http://localhost/verify/local-token-789',
        from:        'noreply@example.test',
        messageId:   'local-msg-1',
        deliveredAt: new Date().toISOString(),
      });

      const preview = await svcMod.simulatedEmailService.getEmailPreview();
      const hit = preview!.messages.find((m) => m.to === 'local-only@example.com');
      expect(hit, 'a locally captured message must still reach the card').toBeDefined();
    } finally {
      captureMod.resetDevOutboxCaptureClientForTests();
    }
  });
});
