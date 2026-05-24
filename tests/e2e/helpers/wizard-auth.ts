/**
 * Auth helper for wizard E2E tests. Creates an authenticated browser
 * context by seeding a persona into the live E2E DB and injecting
 * the JWT cookie via context.addCookies.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Browser, BrowserContext } from '@playwright/test';
import { personaToPlaywrightCookies, type Persona } from '../../fixtures/personas';

const DB_PATH_FILE = path.join(process.env.TMPDIR ?? '/tmp', 'footbag-e2e-db-path');

export function openLiveDb(): BetterSqlite3.Database {
  const dbPath = fs.readFileSync(DB_PATH_FILE, 'utf8').trim();
  process.env.JWT_LOCAL_KEYPAIR_PATH =
    process.env.JWT_LOCAL_KEYPAIR_PATH
    ?? path.join(process.env.TMPDIR ?? '/tmp', 'footbag-e2e-jwt.pem');
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export async function createAuthenticatedContext(
  browser: Browser,
  baseURL: string,
  persona: Persona,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  const domain = new URL(baseURL).hostname;
  await context.addCookies(personaToPlaywrightCookies(persona, { domain }));
  return context;
}
