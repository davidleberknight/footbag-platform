/**
 * Keeps the development test routes to synthetic personas on a copy of
 * production.
 *
 * A copy of the production database carries real member accounts, with their
 * personal data, so while a copy can hold them the persona switch, the persona
 * login, the claim builder and the test mailbox serve synthetic personas only
 * (design decision "Migrations and Non-production Databases with a Live
 * Production Database", DD §1.18). A database is a copy when the copy builder
 * appended its marker row under the shared system configuration key. A
 * database built any other way carries no such row, and the routes behave as
 * they always have, reaching any member, for migration testing.
 *
 * A persona is recognised by its member id, the one stable signal the persona
 * harness writes on every persona row, and its mail by the reserved domain the
 * harness gives every persona login address.
 */
import { systemConfig } from '../db/db';
import { PRODUCTION_COPY_CONFIG_KEY } from '../lib/productionCopy';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';

/** The domain the persona harness gives every persona's login address. */
export const PERSONA_EMAIL_DOMAIN = '@personas.test';

export const PERSONAS_ONLY_ON_COPY_MESSAGE =
  'This database is a copy of production, so the test routes serve synthetic personas only.';

export function databaseIsProductionCopy(): boolean {
  return systemConfig.getValueByKey.get(PRODUCTION_COPY_CONFIG_KEY) !== undefined;
}

/** Whether a test route may act as this member on this database. */
export function testRouteMayActAs(memberId: string): boolean {
  return isSeededTestPersonaMemberId(memberId) || !databaseIsProductionCopy();
}

/**
 * Whether a test route may use this address on this database: sign in with it,
 * or show the test mailbox's message sent to it.
 */
export function testRouteMayUseAddress(address: string): boolean {
  return address.toLowerCase().endsWith(PERSONA_EMAIL_DOMAIN) || !databaseIsProductionCopy();
}
