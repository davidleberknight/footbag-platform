export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

interface Bucket {
  count: number;
  windowStart: number;
  // The window and ceiling this bucket was opened under. One map holds every
  // action's buckets, and the caller that triggers a sweep or an eviction is
  // usually enforcing a different action's limit, so whether a bucket has
  // expired -- or is still refusing attempts -- has to be judged against its
  // own configuration rather than against whichever caller happened to arrive.
  windowMs: number;
  maxAttempts: number;
  // Set only where the caller asked for a cooldown, at the moment the bucket
  // reached its ceiling. A cooldown is a lockout that outlives the counting
  // window: without one, hitting the ceiling early in a window buys a refusal
  // lasting only the window's remainder, so the punishment shrinks the later in
  // the window the attacker starts. Absent for every caller that does not pass
  // one, which is why their behaviour is unchanged.
  blockedUntil?: number;
}

// In-memory only: limits do not persist across restarts and are not shared
// across processes. Each web or worker process maintains its own bucket map.
const buckets = new Map<string, Bucket>();

// Keys are built partly from unauthenticated input -- every distinct email
// address submitted to the login form creates entries of its own -- and a bucket
// was only ever reset by a later hit on that same key, so a key touched once
// stayed for the life of the process. Anyone able to reach the form could
// therefore grow this map without bound.
//
// Two bounds together: a sweep of expired buckets amortised across writes, so
// ordinary traffic cleans up after itself without a timer; and a hard ceiling,
// so a flood faster than the sweep still cannot pass it. Eviction takes buckets
// that are not currently refusing anything first, because dropping one of those
// only forgives attempts the next hit records again, while dropping a live block
// would hand whoever caused the flood the exact reprieve the ceiling exists to
// deny them.
const MAX_BUCKETS = 50_000;
const SWEEP_EVERY_WRITES = 1_000;
let writesSinceSweep = 0;

function now(): number {
  return Date.now();
}

/** The moment a bucket stops mattering: the end of its counting window, or the
 *  end of its cooldown where one was set, whichever is later. Every judgement
 *  about a bucket's life goes through this, so a cooldown cannot be forgotten by
 *  one of them and honoured by another. */
function expiresAt(bucket: Bucket): number {
  return Math.max(bucket.windowStart + bucket.windowMs, bucket.blockedUntil ?? 0);
}

/** Drop buckets whose own life has ended; they can only ever be re-created. */
function sweepExpired(t: number): void {
  for (const [key, bucket] of buckets) {
    if (t >= expiresAt(bucket)) buckets.delete(key);
  }
}

/** Whether a bucket is refusing attempts right now: at its ceiling, and not yet
 *  past the window or cooldown it was opened under. */
function isBlocking(bucket: Bucket, t: number): boolean {
  return bucket.count >= bucket.maxAttempts && t < expiresAt(bucket);
}

/** Last resort when a flood outruns the sweep. A blocked bucket never refreshes
 *  its windowStart, so age alone would evict live blocks ahead of the idle keys
 *  that caused the flood; idle buckets therefore go first, oldest among them
 *  first, since those are closest to expiring anyway. */
function evictOldest(t: number, target: number): void {
  const byAge = [...buckets.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
  for (const [key, bucket] of byAge) {
    if (buckets.size <= target) return;
    if (!isBlocking(bucket, t)) buckets.delete(key);
  }
  // Forgiving every idle bucket was not enough to reach the target, so the
  // ceiling is full of live blocks. Opening that many costs far more than
  // opening idle keys does, and the memory bound still has to hold.
  for (const [key] of byAge) {
    if (buckets.size <= target) return;
    buckets.delete(key);
  }
}

export function hit(
  key: string,
  maxAttempts: number,
  windowMinutes: number,
  cooldownMinutes?: number,
): RateLimitResult {
  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be >= 1');
  }
  if (windowMinutes <= 0) {
    throw new Error('windowMinutes must be > 0');
  }
  if (cooldownMinutes !== undefined && cooldownMinutes <= 0) {
    throw new Error('cooldownMinutes must be > 0');
  }

  const windowMs = windowMinutes * 60 * 1000;
  const cooldownMs = cooldownMinutes === undefined ? undefined : cooldownMinutes * 60 * 1000;
  const t = now();
  const bucket = buckets.get(key);

  if (!bucket || t >= expiresAt(bucket)) {
    writesSinceSweep += 1;
    if (writesSinceSweep >= SWEEP_EVERY_WRITES) {
      writesSinceSweep = 0;
      sweepExpired(t);
    }
    if (buckets.size >= MAX_BUCKETS) {
      evictOldest(t, Math.floor(MAX_BUCKETS / 2));
    }
    const opened: Bucket = { count: 1, windowStart: t, windowMs, maxAttempts };
    // A ceiling of one is reached by the attempt that opens the bucket, so the
    // cooldown has to start here as well as on the increment below.
    if (cooldownMs !== undefined && opened.count >= maxAttempts) {
      opened.blockedUntil = t + cooldownMs;
    }
    buckets.set(key, opened);
    return { allowed: true };
  }

  if (bucket.count < maxAttempts) {
    bucket.count += 1;
    // The cooldown runs from the attempt that crossed the ceiling, not from the
    // start of the window that counted up to it.
    if (cooldownMs !== undefined && bucket.count >= maxAttempts) {
      bucket.blockedUntil = t + cooldownMs;
    }
    return { allowed: true };
  }

  const retryAfterMs = expiresAt(bucket) - t;
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return { allowed: false, retryAfterSeconds };
}

export function resetRateLimitForTests(): void {
  buckets.clear();
  writesSinceSweep = 0;
}

/** Bucket count, for the tests that pin the map's bounds. */
export function rateLimitBucketCountForTests(): number {
  return buckets.size;
}

