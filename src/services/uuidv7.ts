import { randomBytes } from 'node:crypto';

/**
 * Generate a UUIDv7 identifier (RFC 9562) and return it as 32 lowercase hex
 * characters (hyphens omitted). Format:
 *   - 48 bits: Unix-ms timestamp (big-endian) in bytes 0..5
 *   - 4 bits: version 7 (high nibble of byte 6)
 *   - 12 bits: sub-millisecond monotonic counter (rand_a, RFC 9562 method 2)
 *     in low nibble of byte 6 plus byte 7
 *   - 2 bits: RFC 4122 variant 10 (high two bits of byte 8)
 *   - 62 bits: random (rand_b) in remaining bits
 *
 * Sort properties (the grant-ledger views `member_tier_current` and
 * `member_active_player_current` rely on these via the (created_at, id)
 * tiebreaker):
 *   - Cross-ms (any process): timestamp prefix decides; strict time order.
 *   - Same-ms within one process: rand_a monotonic counter strictly orders
 *     by insertion (the previous per-process counter scheme delivered this
 *     property; the bare-UUIDv7 random tail did not, and tests that issue
 *     2-3 grants in rapid succession depend on it).
 *   - Same-ms across processes: the random rand_b tail decides. Order is
 *     arbitrary but consistent for a given pair of ids. Cross-process
 *     same-ms writes are rare in practice (web + worker do not both write
 *     the same grant table in the same ms during normal operation).
 *
 * Replaces the previous `mtg_NNNNNNNNNNNN_<rand>` / `apg_NNNNNNNNNNNN_<rand>`
 * schemes that used a per-process counter, which silently collided across
 * the web/worker container boundary because each process started counter=0.
 */

// rand_a is 12 bits, so the counter rolls over at 4096. If two calls within
// the same ms exceed that, advance the ms by 1 (RFC 9562 §6.2 method 3
// "ms-monotonicity rollover"): the next call's apparent timestamp is one
// ms ahead of wall clock. Self-corrects on the next genuine ms tick.
let _lastMs = 0;
let _lastCounter = 0;

export function uuidv7Hex(): string {
  const buf = Buffer.alloc(16);
  let ts = Date.now();
  let counter: number;
  if (ts > _lastMs) {
    _lastMs = ts;
    _lastCounter = randomBytes(2).readUInt16BE(0) & 0x0fff; // seed counter with 12 random bits
    counter = _lastCounter;
  } else {
    // Same or earlier ms (clock skew or rapid-fire calls). Advance counter;
    // if it overflows 12 bits, push the timestamp forward by 1 ms.
    _lastCounter += 1;
    if (_lastCounter > 0x0fff) {
      _lastMs += 1;
      _lastCounter = randomBytes(2).readUInt16BE(0) & 0x0fff;
    }
    ts = _lastMs;
    counter = _lastCounter;
  }

  // 48-bit timestamp (ms), big-endian, into bytes 0..5.
  buf.writeUIntBE(Math.floor(ts / 0x10000), 0, 4); // hi 32 bits
  buf.writeUIntBE(ts & 0xffff, 4, 2);              // lo 16 bits
  // Bytes 6..7 carry the version nibble + the 12-bit rand_a counter.
  // Byte 6 = (version=7 in high nibble) | (counter high nibble).
  // Byte 7 = counter low byte.
  buf[6] = 0x70 | ((counter >> 8) & 0x0f);
  buf[7] = counter & 0xff;
  // 8 random bytes into [8..15] (rand_b).
  randomBytes(8).copy(buf, 8);
  // RFC 4122 variant 10 (high two bits of byte 8).
  buf[8] = (buf[8] & 0x3f) | 0x80;
  return buf.toString('hex');
}
