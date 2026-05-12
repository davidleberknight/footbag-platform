/**
 * Verifies the RFC 9562 properties this codebase relies on:
 *   - 32 lowercase hex characters (16 bytes; no hyphens)
 *   - version 7 (high nibble of byte 6)
 *   - RFC 4122 variant 10 (high two bits of byte 8)
 *   - 48-bit ms timestamp prefix is monotonic across calls (within a tick)
 *   - ids generated across separate ms sort in time order under lex compare
 *
 * The id is used as the suffix of `member_tier_grants.id` and
 * `active_player_grants.id`; both views (`member_tier_current`,
 * `member_active_player_current`) order by (created_at, id) and the id
 * tiebreaker must remain consistent across processes — the previous
 * per-process counter scheme did not.
 */
import { describe, it, expect } from 'vitest';
import { uuidv7Hex } from '../../src/services/uuidv7';

describe('uuidv7Hex', () => {
  it('returns 32 lowercase hex characters', () => {
    const id = uuidv7Hex();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('sets the version nibble to 7 (high nibble of byte 6)', () => {
    const id = uuidv7Hex();
    const byte6Hi = id[12]; // characters 12..13 are byte 6; high nibble at index 12
    expect(byte6Hi).toBe('7');
  });

  it('sets the RFC 4122 variant bits (high 2 bits of byte 8 are 10)', () => {
    const id = uuidv7Hex();
    const byte8Hi = parseInt(id[16], 16); // high nibble of byte 8
    // High 2 bits == 10 -> nibble in {8, 9, a, b}.
    expect([0x8, 0x9, 0xa, 0xb]).toContain(byte8Hi);
  });

  it('lex-sorts in time order across calls separated by setTimeout', async () => {
    const a = uuidv7Hex();
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
    const b = uuidv7Hex();
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
    const c = uuidv7Hex();
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('lex-sorts in insertion order for rapid-fire calls within the same ms (RFC 9562 method-2 monotonicity)', () => {
    // 100 calls in a tight loop almost certainly land in the same ms on
    // any modern machine. Without the monotonic counter the random tail
    // would let them lex-sort arbitrarily; with it, each id is strictly
    // greater than the previous one.
    const ids: string[] = [];
    for (let i = 0; i < 100; i += 1) ids.push(uuidv7Hex());
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i] > ids[i - 1]).toBe(true);
    }
  });

  it('produces unique ids across 1000 sequential calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      ids.add(uuidv7Hex());
    }
    expect(ids.size).toBe(1000);
  });
});
