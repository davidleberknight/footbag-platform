/**
 * Bound every synchronous process spawn a test makes.
 *
 * A synchronous spawn blocks the worker's event loop outright. Vitest's own
 * `testTimeout` is a timer on that loop, so it cannot fire while the loop is
 * frozen: the timeout meant to rescue the run is queued behind the very thing it
 * would interrupt. A spawned command that never returns therefore parks the
 * worker with nothing able to break it, the run reports no failure, and the
 * suite simply stops making progress. That is not theoretical; it stalled a full
 * integration run with zero CPU consumed and no test named.
 *
 * Node's own `timeout` acts beneath the event loop, so it fires even when the
 * loop is blocked, and turns an unbounded hang into an ordinary failure that
 * names the file. `SIGKILL` rather than the default `SIGTERM` because a shell
 * script waiting on input or a lock may ignore a polite signal, and a guard that
 * a hung child can decline to honour is not a guard.
 *
 * The bound sits below the 30s `testTimeout` so the kill lands first and the
 * test fails with the spawn's own error rather than a bare timeout. Every script
 * these tests run finishes in well under a second; twenty seconds is slack for a
 * loaded machine, not a budget anything legitimately spends.
 */
export const SPAWN_GUARD = {
  timeout: 20_000,
  killSignal: 'SIGKILL' as const,
};
