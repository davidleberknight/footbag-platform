/**
 * Auth helper for wizard E2E tests. Creates an authenticated browser
 * context by seeding a persona into the live E2E DB and injecting
 * the JWT cookie via context.addCookies.
 */
import type { Browser, BrowserContext } from '@playwright/test';
import { personaSwitchPath, type Persona } from '../../fixtures/personas';

export { openLiveDb } from './liveDb';

/**
 * Make an existing context authenticated as the persona by having the
 * application mint the session cookie. The request context shares the browser
 * context's cookie jar, so the issued cookie applies to every page opened from
 * it afterwards.
 */
export async function authenticateContext(
  context: BrowserContext,
  baseURL: string,
  persona: Persona,
): Promise<void> {
  const res = await context.request.get(`${baseURL}${personaSwitchPath(persona)}`);
  if (!res.ok()) {
    throw new Error(
      `persona switch failed for '${persona.slug}': HTTP ${res.status()}`,
    );
  }
}

export async function createAuthenticatedContext(
  browser: Browser,
  baseURL: string,
  persona: Persona,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await authenticateContext(context, baseURL, persona);
  return context;
}
